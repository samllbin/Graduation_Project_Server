import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PostController } from './post.controller';
import { PostImage } from './post-image.entity';
import { Post } from './post.entity';
import { PostLike } from './post-like.entity';
import { PostService } from './post.service';

@Module({
  imports: [TypeOrmModule.forFeature([Post, PostImage, PostLike]), AuthModule],
  controllers: [PostController],
  providers: [PostService],
})
export class PostModule {}
