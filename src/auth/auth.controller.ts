import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  @Post('login')
  async login(@Body() loginDto: { userName: string; password: string }) {
    const user = await this.userService.findOne(loginDto.userName);
    if (!user || user.password !== loginDto.password) {
      return {
        code: 401,
        message: 'Invalid credentials',
      };
    }

    // 短 token
    const accessToken = this.jwtService.sign({
      userName: user.userName,
      sub: user.id,
    });

    // 长token
    const refreshToken = this.jwtService.sign(
      {
        userName: user.userName,
        sub: user.id,
      },
      {
        expiresIn: '7d',
      },
    );

    return {
      code: 200,
      message: 'Login successful',
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          userName: user.userName,
          avatar: user.avatar,
          signature: user.signature,
        },
      },
    };
  }

  @Post('refresh')
  async refresh(@Body('refresh_token') refreshToken: string) {
    try {
      const result = await this.authService.refreshToken(refreshToken);
      return {
        code: 200,
        message: 'Token refreshed successfully',
        data: result,
      };
    } catch (error) {
      return {
        code: 401,
        message: error.message,
      };
    }
  }
}
