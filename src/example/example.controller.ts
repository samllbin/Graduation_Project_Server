import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';

@Controller('example')
export class ExampleController {
  @UseGuards(AuthGuard)
  @Get('protected')
  async protectedRoute() {
    return {
      code: 200,
      message: 'This is a protected route',
      data: {
        message: 'You have successfully accessed a protected route!',
      },
    };
  }

  @Get('public')
  async publicRoute() {
    return {
      code: 200,
      message: 'This is a public route',
      data: {
        message: 'Anyone can access this route',
      },
    };
  }
}
