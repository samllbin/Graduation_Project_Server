import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { DiagnosisService } from './diagnosis.service';

@Controller('diagnosis')
export class DiagnosisController {
  constructor(private diagnosisService: DiagnosisService) {}

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
