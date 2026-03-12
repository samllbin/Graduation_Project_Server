import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Post('create')
  async create(
    @Body()
    userData: {
      userName: string;
      password: string;
      avatar?: string;
      signature?: string;
    },
  ) {
    try {
      const user = await this.userService.create(userData);
      return {
        code: 200,
        message: '创建用户成功',
        data: {
          id: user.id,
          userName: user.userName,
          avatar: user.avatar,
          signature: user.signature,
          ctime: user.ctime,
        },
      };
    } catch (error) {
      return {
        code: 500,
        message: '创建用户失败',
        error: error.message,
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
