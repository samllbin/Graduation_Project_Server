import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UserService } from './user.service';
import { EmailService } from '../email/email.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('user')
export class UserController {
  constructor(
    private userService: UserService,
    private emailService: EmailService,
  ) {}

  @Post('create')
  async create(
    @Body()
    userData: {
      userName: string;
      password: string;
      email: string;
      code: string;
      avatar?: string;
      signature?: string;
    },
  ) {
    try {
      // 验证邮箱验证码
      console.log(userData, '-------userData');
      await this.emailService.verifyCode(userData.email, userData.code);

      // 检查邮箱是否已存在
      const existingUserByEmail = await this.userService.findByEmail(
        userData.email,
      );
      if (existingUserByEmail) {
        return {
          code: 400,
          message: '邮箱已被注册',
        };
      }

      // 检查用户名是否已存在
      const existingUserByUserName = await this.userService.findOne(
        userData.userName,
      );
      if (existingUserByUserName) {
        return {
          code: 400,
          message: '用户名已被使用',
        };
      }

      // 创建用户
      const user = await this.userService.create({
        userName: userData.userName,
        password: userData.password,
        email: userData.email,
        avatar: userData.avatar,
        signature: userData.signature,
      });

      return {
        code: 200,
        message: '创建用户成功',
        data: {
          id: user.id,
          userName: user.userName,
          email: user.email,
          avatar: user.avatar,
          signature: user.signature,
          ctime: user.ctime,
        },
      };
    } catch (error) {
      return {
        code: 400,
        message: error.message,
      };
    }
  }

  @Get(':userName')
  async findOne(@Param('userName') userName: string) {
    try {
      const user = await this.userService.findOne(userName);
      if (user) {
        return {
          code: 200,
          message: '查询用户成功',
          data: {
            id: user.id,
            userName: user.userName,
            email: user.email,
            avatar: user.avatar,
            signature: user.signature,
            ctime: user.ctime,
          },
        };
      } else {
        return {
          code: 404,
          message: '用户不存在',
        };
      }
    } catch (error) {
      return {
        code: 500,
        message: '查询用户失败',
        error: error.message,
      };
    }
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  async updateProfile(
    @Req() req: any,
    @Body() body: { avatar?: string; signature?: string },
  ) {
    try {
      const userId = Number(req?.user?.sub);
      if (!Number.isInteger(userId) || userId <= 0) {
        return {
          code: 401,
          message: '用户未登录或登录状态无效',
        };
      }

      if (typeof body.avatar !== 'string' && typeof body.signature !== 'string') {
        return {
          code: 400,
          message: '至少传入一个可修改字段',
        };
      }

      const user = await this.userService.updateProfile(userId, {
        avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
        signature:
          typeof body.signature === 'string' ? body.signature : undefined,
      });

      if (!user) {
        return {
          code: 404,
          message: '用户不存在',
        };
      }

      return {
        code: 200,
        message: '更新成功',
        data: {
          id: user.id,
          userName: user.userName,
          email: user.email,
          avatar: user.avatar,
          signature: user.signature,
          ctime: user.ctime,
        },
      };
    } catch (error) {
      return {
        code: 500,
        message: error.message || '更新失败',
      };
    }
  }

  @Patch('password')
  @UseGuards(AuthGuard)
  async updatePassword(
    @Req() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    try {
      const userId = Number(req?.user?.sub);
      if (!Number.isInteger(userId) || userId <= 0) {
        return {
          code: 401,
          message: '用户未登录或登录状态无效',
        };
      }

      if (!body.currentPassword || !body.newPassword) {
        return {
          code: 400,
          message: '当前密码和新密码不能为空',
        };
      }

      if (body.newPassword.length < 6) {
        return {
          code: 400,
          message: '新密码长度不能小于6位',
        };
      }

      const user = await this.userService.findById(userId);
      if (!user) {
        return {
          code: 404,
          message: '用户不存在',
        };
      }

      if (user.password !== body.currentPassword) {
        return {
          code: 400,
          message: '当前密码错误',
        };
      }

      await this.userService.updatePasswordById(userId, body.newPassword);
      return {
        code: 200,
        message: '密码修改成功',
      };
    } catch (error) {
      return {
        code: 500,
        message: error.message || '密码修改失败',
      };
    }
  }

  @Post('password/forgot/send-code')
  async sendForgotPasswordCode(@Body() body: { email: string }) {
    try {
      const email = body?.email?.trim() || '';
      if (!email) {
        return {
          code: 400,
          message: '邮箱不能为空',
        };
      }

      const user = await this.userService.findByEmail(email);
      if (!user) {
        return {
          code: 404,
          message: '邮箱未注册',
        };
      }

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

  @Patch('password/forgot/reset')
  async resetForgotPassword(
    @Body() body: { email: string; code: string; newPassword: string },
  ) {
    try {
      const email = body?.email?.trim() || '';
      const code = body?.code?.trim() || '';
      const newPassword = body?.newPassword || '';

      if (!email || !code || !newPassword) {
        return {
          code: 400,
          message: '邮箱、验证码和新密码不能为空',
        };
      }

      if (newPassword.length < 6) {
        return {
          code: 400,
          message: '新密码长度不能小于6位',
        };
      }

      const user = await this.userService.findByEmail(email);
      if (!user) {
        return {
          code: 404,
          message: '邮箱未注册',
        };
      }

      await this.emailService.verifyCode(email, code);
      await this.userService.updatePasswordByEmail(email, newPassword);

      return {
        code: 200,
        message: '密码重置成功',
      };
    } catch (error) {
      return {
        code: 400,
        message: error.message,
      };
    }
  }
}
