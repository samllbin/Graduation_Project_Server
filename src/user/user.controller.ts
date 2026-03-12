import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { UserService } from './user.service';
import { EmailService } from '../email/email.service';

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
}
