import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ExampleModule } from './example/example.module';
import { EmailModule } from './email/email.module';
import { UploadModule } from './upload/upload.module';
import { PostModule } from './post/post.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostImage } from './post/post-image.entity';
import { PostLike } from './post/post-like.entity';
import { Post } from './post/post.entity';
import { Comment } from './post/comment.entity';
import { User } from './user/user.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'nnzabb123',
      database: 'Graduation_Project',
      entities: [User, Post, PostImage, PostLike, Comment],
      synchronize: false,
    }),
    UserModule,
    AuthModule,
    ExampleModule,
    EmailModule,
    UploadModule,
    PostModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
