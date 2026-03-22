import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import Redis from 'ioredis';

@Module({
  controllers: [EmailController],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        return new Redis({
          host: 'localhost',
          port: 6379,
          password: '',
          db: 0,
        });
      },
    },
    EmailService,
  ],
  exports: [EmailService, 'REDIS_CLIENT'],
})
export class EmailModule {}
