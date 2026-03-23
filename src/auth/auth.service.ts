import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  async verifyToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  extractClientIp(request: any): string | null {
    const xForwardedFor = request?.headers?.['x-forwarded-for'];

    if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
      return this.normalizeIp(xForwardedFor.split(',')[0].trim());
    }

    if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
      const first = String(xForwardedFor[0] || '').split(',')[0].trim();
      if (first) {
        return this.normalizeIp(first);
      }
    }

    const fallbackIp = request?.ip || request?.socket?.remoteAddress;
    if (!fallbackIp) {
      return null;
    }

    return this.normalizeIp(String(fallbackIp));
  }

  normalizeIp(ip: string): string {
    if (ip.startsWith('::ffff:')) {
      return ip.slice(7);
    }
    return ip;
  }

  async setLoginIp(userId: number, ip: string): Promise<void> {
    const key = `auth:login-ip:${userId}`;
    await this.redis.set(key, ip, 'EX', 7 * 24 * 60 * 60);
  }

  async checkLoginIp(userId: number, currentIp: string): Promise<boolean> {
    const key = `auth:login-ip:${userId}`;
    const storedIp = await this.redis.get(key);

    if (!storedIp) {
      return false;
    }

    return this.normalizeIp(storedIp) === this.normalizeIp(currentIp);
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);

      // 生成新的短令牌
      const newAccessToken = this.jwtService.sign({
        userName: payload.userName,
        sub: payload.sub,
      });

      return {
        access_token: newAccessToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
