import {
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { AuthGuard } from '../auth/auth.guard';

@Controller('upload')
export class UploadController {
  @UseGuards(AuthGuard)
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadDir = join(process.cwd(), 'uploads', 'images');
          mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (req: any, file, cb) => {
          const userId = req.user?.sub;
          const fileExt = extname(file.originalname);
          cb(null, `${Date.now()}-${userId}${fileExt}`);
        },
      }),
      fileFilter: (req: any, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          req.fileValidationError = '只允许上传图片';
          return cb(null, false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(@UploadedFile() file: any, @Req() req: any) {
    if (req.fileValidationError) {
      return {
        code: 400,
        message: req.fileValidationError,
      };
    }

    if (!file) {
      return {
        code: 400,
        message: '请选择图片文件',
      };
    }

    const filePath = `uploads/images/${file.filename}`;
    const protocol = req.protocol;
    const host = req.get('host');

    return {
      code: 200,
      message: '上传成功',
      data: {
        fileName: file.filename,
        filePath,
        originalName: file.originalname,
        url: `${protocol}://${host}/${filePath}`,
      },
    };
  }
}
