import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { UserService } from './user.service';
import { User } from './user.entity';
import { UserController } from './user.controller';
import { EmailModule } from '../email/email.module';
import { AuthService } from '../auth/auth.service';
import { AuthGuard } from '../auth/auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    EmailModule,
    JwtModule.register({
      secret: 'samllBin',
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],
  controllers: [UserController],
  providers: [UserService, AuthService, AuthGuard],
  exports: [UserService],
})
export class UserModule {}
