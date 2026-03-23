import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { DiagnosisService } from './diagnosis.service';

@Controller('diagnosis')
export class DiagnosisController {
  constructor(private diagnosisService: DiagnosisService) {}

  @UseGuards(AuthGuard)
  @Get('list')
  async list(@Req() req: any, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    try {
      const result = await this.diagnosisService.getDiagnosisList(
        Number(req.user.sub),
        page ? Number(page) : 1,
        pageSize ? Number(pageSize) : 10,
      );

      return {
        code: 200,
        message: '获取诊断列表成功',
        data: result,
      };
    } catch (error) {
      return {
        code: error.code || 400,
        message: error.message,
      };
    }
  }

  @UseGuards(AuthGuard)
  @Get('detail')
  async detail(@Req() req: any, @Query('id') id?: string) {
    try {
      const result = await this.diagnosisService.getDiagnosisDetail(Number(req.user.sub), Number(id));

      return {
        code: 200,
        message: '获取诊断详情成功',
        data: result,
      };
    } catch (error) {
      return {
        code: error.code || 400,
        message: error.message,
      };
    }
  }

  @UseGuards(AuthGuard)
  @Post('run')
  async run(
    @Body()
    body: {
      imageUrl?: string;
      symptomText?: string;
      cropType?: string;
    },
    @Req() req: any,
  ) {
    try {
      const result = await this.diagnosisService.runDiagnosis(Number(req.user.sub), {
        imageUrl: body?.imageUrl,
        symptomText: body?.symptomText,
        cropType: body?.cropType,
      });

      return {
        code: 200,
        message: '诊断成功',
        data: result,
      };
    } catch (error) {
      return {
        code: error.code || 400,
        message: error.message,
        data: error.data,
      };
    }
  }
}
