import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PostImage } from './post-image.entity';
import { PostLike } from './post-like.entity';
import { Post } from './post.entity';

type CreatePostImageInput = {
  imageUrl: string;
  sortOrder: number;
  width?: number;
  height?: number;
};

type CreatePostInput = {
  userId: number;
  title?: string;
  contentText?: string;
  images: CreatePostImageInput[];
};

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(Post)
    private postsRepository: Repository<Post>,
    @InjectRepository(PostImage)
    private postImagesRepository: Repository<PostImage>,
    @InjectRepository(PostLike)
    private postLikesRepository: Repository<PostLike>,
    private dataSource: DataSource,
  ) {}

  async createPost(input: CreatePostInput) {
    const now = new Date();
    const contentText = input.contentText?.trim() || '';
    const title = input.title?.trim() || null;
    const images = Array.isArray(input.images)
      ? input.images
          .filter((image) => image && typeof image.imageUrl === 'string')
          .map((image, index) => ({
            imageUrl: image.imageUrl.trim(),
            sortOrder:
              typeof image.sortOrder === 'number' && Number.isInteger(image.sortOrder)
                ? image.sortOrder
                : index + 1,
            width:
              typeof image.width === 'number' && Number.isInteger(image.width)
                ? image.width
                : null,
            height:
              typeof image.height === 'number' && Number.isInteger(image.height)
                ? image.height
                : null,
          }))
          .filter((image) => image.imageUrl)
      : [];

    if (!contentText && images.length === 0) {
      throw new Error('帖子内容和图片不能同时为空');
    }

    if (images.length > 9) {
      throw new Error('图片数量不能超过9张');
    }

    for (const image of images) {
      if (!/^https?:\/\//.test(image.imageUrl) && !image.imageUrl.startsWith('uploads/')) {
        throw new Error('图片地址格式不正确');
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const post = manager.create(Post, {
        userId: input.userId,
        title,
        contentText,
        coverImageUrl: images[0]?.imageUrl || null,
        imageCount: images.length,
        commentCount: 0,
        likeCount: 0,
        viewCount: 0,
        isDeleted: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      const savedPost = await manager.save(Post, post);

      if (images.length > 0) {
        const postImages = images.map((image) =>
          manager.create(PostImage, {
            postId: savedPost.id,
            imageUrl: image.imageUrl,
            sortOrder: image.sortOrder,
            width: image.width,
            height: image.height,
            createdAt: now,
          }),
        );

        await manager.save(PostImage, postImages);
      }

      const savedImages = await manager.find(PostImage, {
        where: { postId: savedPost.id },
        order: { sortOrder: 'ASC' },
      });

      return {
        id: savedPost.id,
        userId: savedPost.userId,
        title: savedPost.title,
        contentText: savedPost.contentText,
        coverImageUrl: savedPost.coverImageUrl,
        imageCount: savedPost.imageCount,
        commentCount: savedPost.commentCount,
        likeCount: savedPost.likeCount,
        viewCount: savedPost.viewCount,
        createdAt: savedPost.createdAt,
        images: savedImages.map((image) => ({
          imageUrl: image.imageUrl,
          sortOrder: image.sortOrder,
          width: image.width,
          height: image.height,
        })),
      };
    });
  }

  async getPostList(sortBy?: string) {
    const normalizedSort = sortBy === 'likes' ? 'likes' : 'time';
    const orderBy = normalizedSort === 'likes' ? { likeCount: 'DESC' as const } : { createdAt: 'DESC' as const };

    const posts = await this.postsRepository.find({
      where: { isDeleted: 0 },
      order: {
        ...orderBy,
        id: 'DESC',
      },
    });

    if (posts.length === 0) {
      return [];
    }

    const postIds = posts.map((post) => post.id);
    const postImages = await this.postImagesRepository.find({
      where: postIds.map((postId) => ({ postId })),
      order: { sortOrder: 'ASC' },
    });

    const imagesMap = new Map<number, PostImage[]>();
    for (const image of postImages) {
      const list = imagesMap.get(image.postId) || [];
      list.push(image);
      imagesMap.set(image.postId, list);
    }

    return posts.map((post) => ({
      id: post.id,
      userId: post.userId,
      title: post.title,
      contentText: post.contentText,
      coverImageUrl: post.coverImageUrl,
      imageCount: post.imageCount,
      commentCount: post.commentCount,
      likeCount: post.likeCount,
      viewCount: post.viewCount,
      createdAt: post.createdAt,
      images: (imagesMap.get(post.id) || []).map((image) => ({
        imageUrl: image.imageUrl,
        sortOrder: image.sortOrder,
        width: image.width,
        height: image.height,
      })),
    }));
  }

  async getPostDetail(postId: number) {
    if (!Number.isInteger(postId) || postId <= 0) {
      const error: any = new Error('帖子不存在');
      error.code = 400;
      throw error;
    }

    const post = await this.postsRepository.findOne({
      where: { id: postId, isDeleted: 0 },
    });

    if (!post) {
      const error: any = new Error('帖子不存在');
      error.code = 404;
      throw error;
    }

    const images = await this.postImagesRepository.find({
      where: { postId: post.id },
      order: { sortOrder: 'ASC' },
    });

    return {
      id: post.id,
      userId: post.userId,
      title: post.title,
      contentText: post.contentText,
      coverImageUrl: post.coverImageUrl,
      imageCount: post.imageCount,
      commentCount: post.commentCount,
      likeCount: post.likeCount,
      viewCount: post.viewCount,
      createdAt: post.createdAt,
      images: images.map((image) => ({
        imageUrl: image.imageUrl,
        sortOrder: image.sortOrder,
        width: image.width,
        height: image.height,
      })),
    };
  }

  async likePost(postId: number, currentUserId: number) {
    if (!Number.isInteger(postId) || postId <= 0) {
      const error: any = new Error('帖子不存在');
      error.code = 400;
      throw error;
    }

    if (!Number.isInteger(currentUserId) || currentUserId <= 0) {
      const error: any = new Error('用户信息无效');
      error.code = 401;
      throw error;
    }

    return this.postLikesRepository.manager.transaction(async (manager) => {
      const post = await manager.findOne(Post, {
        where: { id: postId, isDeleted: 0 },
      });

      if (!post) {
        const error: any = new Error('帖子不存在');
        error.code = 404;
        throw error;
      }

      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(PostLike)
        .values({
          postId,
          userId: currentUserId,
          createdAt: new Date(),
        })
        .orIgnore()
        .execute();

      if ((insertResult.raw?.affectedRows || insertResult.identifiers.length || 0) > 0) {
        await manager
          .createQueryBuilder()
          .update(Post)
          .set({
            likeCount: () => 'like_count + 1',
          })
          .where('id = :id', { id: postId })
          .execute();
      }

      const latestPost = await manager.findOne(Post, {
        where: { id: postId },
      });

      return {
        id: postId,
        liked: true,
        likeCount: latestPost?.likeCount || 0,
      };
    });
  }

  async unlikePost(postId: number, currentUserId: number) {
    if (!Number.isInteger(postId) || postId <= 0) {
      const error: any = new Error('帖子不存在');
      error.code = 400;
      throw error;
    }

    if (!Number.isInteger(currentUserId) || currentUserId <= 0) {
      const error: any = new Error('用户信息无效');
      error.code = 401;
      throw error;
    }

    return this.postLikesRepository.manager.transaction(async (manager) => {
      const post = await manager.findOne(Post, {
        where: { id: postId, isDeleted: 0 },
      });

      if (!post) {
        const error: any = new Error('帖子不存在');
        error.code = 404;
        throw error;
      }

      const deleteResult = await manager
        .createQueryBuilder()
        .delete()
        .from(PostLike)
        .where('post_id = :postId AND user_id = :userId', { postId, userId: currentUserId })
        .execute();

      if ((deleteResult.affected || 0) > 0) {
        await manager
          .createQueryBuilder()
          .update(Post)
          .set({
            likeCount: () => 'GREATEST(like_count - 1, 0)',
          })
          .where('id = :id', { id: postId })
          .execute();
      }

      const latestPost = await manager.findOne(Post, {
        where: { id: postId },
      });

      return {
        id: postId,
        liked: false,
        likeCount: latestPost?.likeCount || 0,
      };
    });
  }

  async deleteOwnPost(postId: number, currentUserId: number) {
    if (!Number.isInteger(postId) || postId <= 0) {
      const error: any = new Error('帖子不存在');
      error.code = 400;
      throw error;
    }

    if (!Number.isInteger(currentUserId) || currentUserId <= 0) {
      const error: any = new Error('用户信息无效');
      error.code = 401;
      throw error;
    }

    const post = await this.postsRepository.findOne({
      where: { id: postId },
    });

    if (!post || post.isDeleted === 1) {
      const error: any = new Error('帖子不存在');
      error.code = 404;
      throw error;
    }

    if (Number(post.userId) !== Number(currentUserId)) {
      const error: any = new Error('无权限删除该帖子');
      error.code = 403;
      throw error;
    }

    const now = new Date();
    await this.postsRepository.update(
      { id: post.id },
      {
        isDeleted: 1,
        deletedAt: now,
        updatedAt: now,
      },
    );

    return { id: post.id };
  }
}
