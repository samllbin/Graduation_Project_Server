import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
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

  private readonly agriBaseUrl = (
    process.env.DIAGNOSIS_AGRI_BASE_URL || this.remoteDiagnosisUrl
  ).trim();
  private readonly agriSubmitUrl = (process.env.DIAGNOSIS_AGRI_SUBMIT_URL || '').trim();
  private readonly agriResultUrlTemplate = (
    process.env.DIAGNOSIS_AGRI_RESULT_URL_TEMPLATE || ''
  ).trim();
  private readonly agriTaskType = (process.env.DIAGNOSIS_AGRI_TASK_TYPE || 'classify').trim();
  private readonly agriModelName = (process.env.DIAGNOSIS_AGRI_MODEL_NAME || '').trim();
  private readonly agriModelVersion = (process.env.DIAGNOSIS_AGRI_MODEL_VERSION || '').trim();
  private readonly agriPollIntervalMs = Math.max(
    Number(process.env.DIAGNOSIS_AGRI_POLL_INTERVAL_MS || 1000),
    300,
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

  async getDiagnosisList(userId: number, page = 1, pageSize = 10) {
    if (!Number.isInteger(userId) || userId <= 0) {
      const error: any = new Error('用户信息无效');
      error.code = 401;
      throw error;
    }

    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 10;

    const [records, total] = await this.diagnosisRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    });

    return {
      list: records.map((item) => ({
        id: item.id,
        userId: item.userId,
        imageUrl: item.imageUrl,
        symptomText: item.symptomText,
        cropType: item.cropType,
        status: item.status,
        resultLabel: item.resultLabel,
        resultConfidence: item.resultConfidence ? Number(item.resultConfidence) : null,
        resultDetail: item.resultDetail,
        errorMessage: item.errorMessage,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.ceil(total / safePageSize),
      },
    };
  }

  async getDiagnosisDetail(userId: number, diagnosisId: number) {
    if (!Number.isInteger(userId) || userId <= 0) {
      const error: any = new Error('用户信息无效');
      error.code = 401;
      throw error;
    }

    if (!Number.isInteger(diagnosisId) || diagnosisId <= 0) {
      const error: any = new Error('诊断记录不存在');
      error.code = 400;
      throw error;
    }

    const record = await this.diagnosisRepository.findOne({
      where: { id: diagnosisId, userId },
    });

    if (!record) {
      const error: any = new Error('诊断记录不存在');
      error.code = 404;
      throw error;
    }

    return {
      id: record.id,
      userId: record.userId,
      imageUrl: record.imageUrl,
      symptomText: record.symptomText,
      cropType: record.cropType,
      status: record.status,
      resultLabel: record.resultLabel,
      resultConfidence: record.resultConfidence ? Number(record.resultConfidence) : null,
      resultDetail: record.resultDetail,
      errorMessage: record.errorMessage,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
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
    const submitUrl = this.buildAgriSubmitUrl();
    if (!submitUrl) {
      throw new Error('未配置农业AI提交地址');
    }

    const modelName = this.agriModelName;
    const modelVersion = this.agriModelVersion;
    if (!this.agriSubmitUrl && (!modelName || !modelVersion)) {
      throw new Error('未配置农业AI模型名称或版本');
    }

    const taskType = this.resolveTaskTypeByUrl(submitUrl);
    const imageBytes = await this.loadImageBytes(input.imageUrl);
    const fileName = this.resolveImageFileName(input.imageUrl);
    const mimeType = this.resolveMimeType(fileName);

    const imageArrayBuffer = imageBytes.buffer.slice(
      imageBytes.byteOffset,
      imageBytes.byteOffset + imageBytes.byteLength,
    ) as ArrayBuffer;

    const formData = new FormData();
    formData.append('image', new File([imageArrayBuffer], fileName, { type: mimeType }));

    const submitHeaders: Record<string, string> = {};
    if (this.remoteDiagnosisToken) {
      submitHeaders.Authorization = `Bearer ${this.remoteDiagnosisToken}`;
    }

    const submitPayload = await this.fetchJson(submitUrl, {
      method: 'POST',
      headers: submitHeaders,
      body: formData,
    });

    const taskId = submitPayload?.data?.task_id || submitPayload?.task_id;
    if (!taskId) {
      throw new Error('农业AI未返回任务ID');
    }

    const resultUrl = this.buildAgriResultUrl(submitUrl, taskType, String(taskId));
    if (!resultUrl) {
      throw new Error('无法构建农业AI结果查询地址');
    }

    const startedAt = Date.now();
    while (true) {
      if (Date.now() - startedAt > this.remoteTimeoutMs) {
        throw new Error('远程诊断接口超时');
      }

      const resultPayload = await this.fetchJson(resultUrl, {
        method: 'GET',
        headers: submitHeaders,
      });

      const data = resultPayload?.data ?? resultPayload;
      const status = String(data?.status || '').toLowerCase();

      if (status === 'success') {
        const normalized = {
          data: {
            result: this.normalizePredictionToResult(data?.predictions),
          },
        };
        return this.extractRemoteResult(normalized);
      }

      if (status === 'failure') {
        const message =
          resultPayload?.message || data?.message || resultPayload?.error || '农业AI任务执行失败';
        throw new Error(message);
      }

      await this.sleep(this.agriPollIntervalMs);
    }
  }

  private async fetchJson(url: string, init: RequestInit): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.remoteTimeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.message || `远程诊断接口调用失败(${response.status})`;
        throw new Error(message);
      }

      return payload;
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error('远程诊断接口超时');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildAgriSubmitUrl(): string {
    if (this.agriSubmitUrl) {
      return this.agriSubmitUrl;
    }

    if (!this.agriBaseUrl) {
      return '';
    }

    const base = this.agriBaseUrl.replace(/\/+$/, '');
    if (/\/ai\/(detect|classify)\//.test(base)) {
      return base;
    }

    const taskType = this.normalizeTaskType(this.agriTaskType);
    return `${base}/ai/${taskType}/${this.agriModelName}/${this.agriModelVersion}`;
  }

  private buildAgriResultUrl(submitUrl: string, taskType: 'detect' | 'classify', taskId: string): string {
    if (this.agriResultUrlTemplate) {
      return this.agriResultUrlTemplate.replace('{taskId}', taskId);
    }

    const matched = submitUrl.match(/^(.*\/ai\/(detect|classify))\/[^/]+\/[^/]+\/?$/);
    if (matched) {
      return `${matched[1]}/result/${taskId}`;
    }

    const base = this.agriBaseUrl.replace(/\/+$/, '');
    return `${base}/ai/${taskType}/result/${taskId}`;
  }

  private resolveTaskTypeByUrl(submitUrl: string): 'detect' | 'classify' {
    if (/\/ai\/detect\//.test(submitUrl)) {
      return 'detect';
    }
    if (/\/ai\/classify\//.test(submitUrl)) {
      return 'classify';
    }
    return this.normalizeTaskType(this.agriTaskType);
  }

  private normalizeTaskType(taskType: string): 'detect' | 'classify' {
    return taskType.toLowerCase() === 'detect' ? 'detect' : 'classify';
  }

  private async loadImageBytes(imageUrl: string): Promise<Buffer> {
    if (imageUrl.startsWith('uploads/')) {
      const localPath = join(process.cwd(), imageUrl);
      return readFile(localPath);
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`图片下载失败(${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private resolveImageFileName(imageUrl: string): string {
    if (imageUrl.startsWith('uploads/')) {
      const parts = imageUrl.split('/');
      return parts[parts.length - 1] || 'diagnosis.jpg';
    }

    try {
      const parsed = new URL(imageUrl);
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || 'diagnosis.jpg';
    } catch {
      return 'diagnosis.jpg';
    }
  }

  private resolveMimeType(fileName: string): string {
    const ext = extname(fileName).toLowerCase();
    if (ext === '.png') {
      return 'image/png';
    }
    if (ext === '.webp') {
      return 'image/webp';
    }
    return 'image/jpeg';
  }

  private normalizePredictionToResult(predictions: any): {
    label: string;
    confidence: number;
    detail: string;
  } {
    if (!Array.isArray(predictions) || predictions.length === 0) {
      throw new Error('农业AI返回结果为空');
    }

    const best = predictions.reduce((acc: any, item: any) => {
      const accScore = Number(acc?.confidence ?? acc?.score ?? acc?.probability ?? acc?.conf ?? 0);
      const itemScore = Number(item?.confidence ?? item?.score ?? item?.probability ?? item?.conf ?? 0);
      return itemScore > accScore ? item : acc;
    }, predictions[0]);

    const label =
      best?.label ||
      best?.class_name ||
      best?.class ||
      best?.name ||
      best?.disease ||
      best?.category ||
      '';

    const confidence = Number(
      best?.confidence ?? best?.score ?? best?.probability ?? best?.conf ?? Number.NaN,
    );

    const detail =
      best?.detail ||
      best?.description ||
      best?.disease_description ||
      `诊断结果：${label}，置信度：${Number.isFinite(confidence) ? confidence.toFixed(4) : '未知'}`;

    if (!label || !Number.isFinite(confidence)) {
      throw new Error('农业AI返回结果格式不正确');
    }

    return {
      label,
      confidence,
      detail,
    };
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
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
