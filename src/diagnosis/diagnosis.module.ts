import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { DiagnosisController } from './diagnosis.controller';
import { DiagnosisRecord } from './diagnosis.entity';
import { DiagnosisService } from './diagnosis.service';

@Module({
  imports: [TypeOrmModule.forFeature([DiagnosisRecord]), AuthModule, EmailModule],
  controllers: [DiagnosisController],
  providers: [DiagnosisService],
})
export class DiagnosisModule {}
