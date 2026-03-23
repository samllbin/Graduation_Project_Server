import { Injectable, ExecutionContext, CanActivate } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return false;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return false;
    }

    try {
      const payload = await this.authService.verifyToken(token);
      const currentIp = this.authService.extractClientIp(request);

      if (!currentIp) {
        return false;
      }

      const ipMatched = await this.authService.checkLoginIp(
        Number(payload.sub),
        currentIp,
      );

      if (!ipMatched) {
        return false;
      }

      request.user = payload;
      return true;
    } catch (error) {
      return false;
    }
  }
}
