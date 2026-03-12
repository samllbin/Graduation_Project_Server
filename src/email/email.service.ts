import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: any;

  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {
    this.transporter = nodemailer.createTransport({
      service: 'qq',
      auth: {
        user: '3057988675@qq.com', // 你的QQ邮箱
        pass: 'afeswxcjarjbdeec', // QQ邮箱的授权码
      },
    });
  }

  // 生成6位随机验证码
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // 发送验证码到邮箱
  async sendVerificationCode(email: string): Promise<{ message: string }> {
    // 生成验证码
    const code = this.generateCode();

    // 保存验证码到Redis，设置1分钟过期
    await this.redis.set(`email:${email}:code`, code, 'EX', 60);

    // 发送邮件
    try {
      await this.transporter.sendMail({
        from: '"病虫害识别APP" <3057988675@qq.com>',
        to: email,
        subject: '验证码',
        text: `您正在注册病虫害识别APP，验证码是：${code}，有效期1分钟。`,
      });

      return { message: '验证码已发送' };
    } catch (error) {
      console.error('邮件发送失败:', error);
      throw new BadRequestException('邮件发送失败');
    }
  }

  // 验证邮箱验证码
  async verifyCode(email: string, code: string): Promise<boolean> {
    const storedCode = await this.redis.get(`email:${email}:code`);

    if (!storedCode) {
      throw new BadRequestException('验证码已过期');
    }

    if (storedCode !== code) {
      throw new BadRequestException('验证码错误');
    }

    // 验证成功后删除验证码
    await this.redis.del(`email:${email}:code`);

    return true;
  }
}
