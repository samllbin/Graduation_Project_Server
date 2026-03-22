import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
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

  @Get('list')
  async list(@Query('sortBy') sortBy?: string) {
    try {
      const posts = await this.postService.getPostList(sortBy);

      return {
        code: 200,
        message: '获取帖子列表成功',
        data: posts,
      };
    } catch (error) {
      return {
        code: 400,
        message: error.message,
      };
    }
  }

  @Get('detail')
  async detail(@Query('id') id?: string) {
    try {
      const post = await this.postService.getPostDetail(Number(id));

      return {
        code: 200,
        message: '获取帖子详情成功',
        data: post,
      };
    } catch (error) {
      return {
        code: error.code || 400,
        message: error.message,
      };
    }
  }

  @UseGuards(AuthGuard)
  @Post('delete')
  async delete(@Body() body: { id: number }, @Req() req: any) {
    try {
      const result = await this.postService.deleteOwnPost(body?.id, req.user.sub);

      return {
        code: 200,
        message: '删除帖子成功',
        data: result,
      };
    } catch (error) {
      return {
        code: error.code || 400,
        message: error.message,
      };
    }
  }
}
