import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { DiagnosisRecord } from './diagnosis.entity';

type RunDiagnosisInput = {
  imageUrl?: string;
  symptomText?: string;
  cropType?: string;
};

type RemoteDiagnosisResult = {
  label: string;
  confidence: number;
  detail: string;
};

@Injectable()
export class DiagnosisService {
  private readonly maxCalls = 5;
  private readonly windowSeconds = 86400;
  private readonly logKeepCount = 200;

  private readonly remoteDiagnosisUrl = (process.env.DIAGNOSIS_REMOTE_URL || '').trim();
  private readonly remoteDiagnosisToken = (process.env.DIAGNOSIS_REMOTE_TOKEN || '').trim();
  private readonly remoteTimeoutMs = Math.max(
    Number(process.env.DIAGNOSIS_REMOTE_TIMEOUT_MS || 30000),
    1000,
  );

  constructor(
    @InjectRepository(DiagnosisRecord)
    private diagnosisRepository: Repository<DiagnosisRecord>,
    @Inject('REDIS_CLIENT')
    private redisClient: Redis,
    private dataSource: DataSource,
  ) {}

  async runDiagnosis(userId: number, input: RunDiagnosisInput) {
    if (!Number.isInteger(userId) || userId <= 0) {
      const error: any = new Error('用户信息无效');
      error.code = 401;
      throw error;
    }

    const imageUrl = input.imageUrl?.trim() || '';
    if (!imageUrl) {
      const error: any = new Error('图片地址不能为空');
      error.code = 400;
      throw error;
    }

    if (!/^https?:\/\//.test(imageUrl) && !imageUrl.startsWith('uploads/')) {
      const error: any = new Error('图片地址格式不正确');
      error.code = 400;
      throw error;
    }

    const quota = await this.consumeQuota(userId);
    if (!quota.allowed) {
      await this.pushOperationLog(userId, {
        action: 'run',
        status: 'limited',
        used: quota.used,
      });

      const error: any = new Error('24小时调用次数已达上限');
      error.code = 429;
      error.data = {
        limit: {
          used: quota.used,
          max: this.maxCalls,
          remaining: quota.remaining,
          windowSeconds: this.windowSeconds,
        },
      };
      throw error;
    }

    const now = new Date();

    try {
      const remoteResult = await this.callRemoteDiagnosis({
        imageUrl,
        symptomText: input.symptomText,
        cropType: input.cropType,
      });

      const saved = await this.dataSource.transaction(async (manager) => {
        const record = manager.create(DiagnosisRecord, {
          userId,
          imageUrl,
          symptomText: input.symptomText?.trim() || null,
          cropType: input.cropType?.trim() || null,
          status: 0,
          resultLabel: remoteResult.label,
          resultConfidence: remoteResult.confidence.toFixed(4),
          resultDetail: remoteResult.detail,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
        });

        return manager.save(DiagnosisRecord, record);
      });

      await this.pushOperationLog(userId, {
        action: 'run',
        status: 'ok',
        diagnosisId: saved.id,
        used: quota.used,
      });

      return {
        diagnosisId: saved.id,
        status: saved.status,
        result: {
          label: saved.resultLabel,
          confidence: saved.resultConfidence ? Number(saved.resultConfidence) : null,
          detail: saved.resultDetail,
        },
        limit: {
          used: quota.used,
          max: this.maxCalls,
          remaining: quota.remaining,
          windowSeconds: this.windowSeconds,
        },
      };
    } catch (e: any) {
      const failedNow = new Date();
      const failed = this.diagnosisRepository.create({
        userId,
        imageUrl,
        symptomText: input.symptomText?.trim() || null,
        cropType: input.cropType?.trim() || null,
        status: 1,
        resultLabel: null,
        resultConfidence: null,
        resultDetail: null,
        errorMessage: e?.message || '诊断失败',
        createdAt: failedNow,
        updatedAt: failedNow,
      });

      const savedFailed = await this.diagnosisRepository.save(failed);

      await this.pushOperationLog(userId, {
        action: 'run',
        status: 'failed',
        diagnosisId: savedFailed.id,
        used: quota.used,
      });

      const error: any = new Error('诊断失败');
      error.code = 500;
      throw error;
    }
  }

  private async consumeQuota(userId: number): Promise<{
    allowed: boolean;
    used: number;
    remaining: number;
  }> {
    const now = Date.now();
    const start = now - this.windowSeconds * 1000;
    const rateKey = `diagnosis:rate:${userId}`;

    const script = `
local key = KEYS[1]
local startAt = tonumber(ARGV[1])
local nowAt = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local member = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, '-inf', startAt)
local count = redis.call('ZCARD', key)
if count >= max then
  local remaining = 0
  return {0, count, remaining}
end
redis.call('ZADD', key, nowAt, member)
redis.call('EXPIRE', key, ttl)
local used = count + 1
local remaining = max - used
return {1, used, remaining}
`;

    const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;
    const res = (await this.redisClient.eval(
      script,
      1,
      rateKey,
      String(start),
      String(now),
      String(this.maxCalls),
      String(this.windowSeconds),
      member,
    )) as [number, number, number];

    return {
      allowed: Number(res[0]) === 1,
      used: Number(res[1]),
      remaining: Number(res[2]),
    };
  }

  private async pushOperationLog(
    userId: number,
    payload: {
      action: string;
      status: 'ok' | 'limited' | 'failed';
      diagnosisId?: number;
      used?: number;
    },
  ) {
    const key = `diagnosis:oplog:${userId}`;
    const body = JSON.stringify({
      ...payload,
      ts: new Date().toISOString(),
    });

    await this.redisClient.multi().lpush(key, body).ltrim(key, 0, this.logKeepCount - 1).exec();
  }

  private async callRemoteDiagnosis(input: {
    imageUrl: string;
    symptomText?: string;
    cropType?: string;
  }): Promise<RemoteDiagnosisResult> {
    if (!this.remoteDiagnosisUrl) {
      throw new Error('未配置远程诊断服务地址');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.remoteTimeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.remoteDiagnosisToken) {
        headers.Authorization = `Bearer ${this.remoteDiagnosisToken}`;
      }

      const response = await fetch(this.remoteDiagnosisUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageUrl: input.imageUrl,
          symptomText: input.symptomText,
          cropType: input.cropType,
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = payload?.message || `远程诊断接口调用失败(${response.status})`;
        throw new Error(message);
      }

      return this.extractRemoteResult(payload);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error('远程诊断接口超时');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  private extractRemoteResult(payload: any): RemoteDiagnosisResult {
    const data = payload?.data ?? payload;
    const result = data?.result ?? data;

    const label = result?.label;
    const confidenceRaw = result?.confidence;
    const detail = result?.detail;

    const confidence = Number(confidenceRaw);

    if (!label || !Number.isFinite(confidence) || !detail) {
      throw new Error('远程诊断返回结果格式不正确');
    }

    return {
      label,
      confidence,
      detail,
    };
  }
}
