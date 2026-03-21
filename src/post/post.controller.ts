import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PostService } from './post.service';

@Controller('post')
export class PostController {
  constructor(private postService: PostService) {}

  @UseGuards(AuthGuard)
  @Post('create')
  async create(
    @Body()
    body: {
      title?: string;
      contentText?: string;
      images?: Array<{
        imageUrl: string;
        sortOrder: number;
        width?: number;
        height?: number;
      }>;
    },
    @Req() req: any,
  ) {
    try {
      const post = await this.postService.createPost({
        userId: req.user.sub,
        title: body.title,
        contentText: body.contentText,
        images: body.images || [],
      });

      return {
        code: 200,
        message: '发布帖子成功',
        data: post,
      };
    } catch (error) {
      return {
        code: 400,
        message: error.message,
      };
    }
  }
}
