import { Controller, Post, Body } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Post('send-code')
  async sendCode(@Body('email') email: string) {
    if (!email) {
      return {
        code: 400,
        message: '邮箱不能为空',
      };
    }

    try {
      const result = await this.emailService.sendVerificationCode(email);
      return {
        code: 200,
        message: result.message,
      };
    } catch (error) {
      return {
        code: 400,
        message: error.message,
      };
    }
  }

  @Post('verify-code')
  async verifyCode(@Body() data: { email: string; code: string }) {
    if (!data.email || !data.code) {
      return {
        code: 400,
        message: '邮箱和验证码不能为空',
      };
    }

    try {
      await this.emailService.verifyCode(data.email, data.code);
      return {
        code: 200,
        message: '验证成功',
      };
    } catch (error) {
      return {
        code: 400,
        message: error.message,
      };
    }
  }
}
