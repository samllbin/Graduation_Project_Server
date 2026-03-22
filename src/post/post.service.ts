import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PostImage } from './post-image.entity';
import { PostLike } from './post-like.entity';
import { Post } from './post.entity';
import { Comment } from './comment.entity';
import { User } from '../user/user.entity';

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
    @InjectRepository(Comment)
    private commentsRepository: Repository<Comment>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
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

  async createComment(input: {
    postId: number;
    contentText?: string;
    parentId?: number;
    replyToUserId?: number;
    currentUserId: number;
  }) {
    const postId = Number(input.postId);
    const currentUserId = Number(input.currentUserId);
    const contentText = input.contentText?.trim() || '';
    const parentId = input.parentId == null ? null : Number(input.parentId);
    const replyToUserId = input.replyToUserId == null ? null : Number(input.replyToUserId);

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

    if (!contentText) {
      const error: any = new Error('评论内容不能为空');
      error.code = 400;
      throw error;
    }

    return this.dataSource.transaction(async (manager) => {
      const post = await manager.findOne(Post, {
        where: { id: postId, isDeleted: 0 },
      });

      if (!post) {
        const error: any = new Error('帖子不存在');
        error.code = 404;
        throw error;
      }

      const now = new Date();
      let level = 1;
      let realParentId: number | null = null;
      let rootId: number | null = null;
      let realReplyToUserId: number | null = null;

      if (parentId != null) {
        if (!Number.isInteger(parentId) || parentId <= 0) {
          const error: any = new Error('父评论不存在');
          error.code = 400;
          throw error;
        }

        const parent = await manager.findOne(Comment, {
          where: { id: parentId, postId, isDeleted: 0 },
        });

        if (!parent) {
          const error: any = new Error('父评论不存在');
          error.code = 404;
          throw error;
        }

        if (replyToUserId != null && (!Number.isInteger(replyToUserId) || replyToUserId <= 0)) {
          const error: any = new Error('回复目标用户无效');
          error.code = 400;
          throw error;
        }

        let rootCommentId: number;
        if (parent.level === 1) {
          rootCommentId = parent.id;
        } else {
          rootCommentId = Number(parent.rootId || parent.parentId);
          if (!Number.isInteger(rootCommentId) || rootCommentId <= 0) {
            const error: any = new Error('父评论不存在');
            error.code = 404;
            throw error;
          }
        }

        level = 2;
        realParentId = parent.id;
        rootId = rootCommentId;
        realReplyToUserId = replyToUserId ?? parent.userId;

        await manager
          .createQueryBuilder()
          .update(Comment)
          .set({ replyCount: () => 'reply_count + 1' })
          .where('id = :id', { id: rootCommentId })
          .execute();
      }

      const comment = manager.create(Comment, {
        postId,
        userId: currentUserId,
        contentText,
        level,
        parentId: realParentId,
        rootId,
        replyToUserId: realReplyToUserId,
        replyCount: 0,
        isDeleted: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      const saved = await manager.save(Comment, comment);

      if (saved.level === 1) {
        await manager.update(
          Comment,
          { id: saved.id },
          {
            rootId: saved.id,
            updatedAt: now,
          },
        );
        saved.rootId = saved.id;
      }

      await manager
        .createQueryBuilder()
        .update(Post)
        .set({ commentCount: () => 'comment_count + 1' })
        .where('id = :id', { id: postId })
        .execute();

      const author = await manager.findOne(User, {
        where: { id: saved.userId },
      });

      return {
        id: saved.id,
        postId: saved.postId,
        userId: saved.userId,
        contentText: saved.contentText,
        level: saved.level,
        parentId: saved.parentId,
        rootId: saved.rootId,
        replyToUserId: saved.replyToUserId,
        replyCount: saved.replyCount,
        createdAt: saved.createdAt,
        user: author
          ? {
              id: author.id,
              userName: author.userName,
              avatar: author.avatar,
              signature: author.signature,
            }
          : null,
      };
    });
  }

  async getCommentList(postId: number, page = 1, pageSize = 10) {
    if (!Number.isInteger(postId) || postId <= 0) {
      const error: any = new Error('帖子不存在');
      error.code = 400;
      throw error;
    }

    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 10;

    const post = await this.postsRepository.findOne({
      where: { id: postId, isDeleted: 0 },
    });

    if (!post) {
      const error: any = new Error('帖子不存在');
      error.code = 404;
      throw error;
    }

    const [roots, total] = await this.commentsRepository.findAndCount({
      where: { postId, level: 1, isDeleted: 0 },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    });

    if (roots.length === 0) {
      return {
        list: [],
        pagination: {
          page: safePage,
          pageSize: safePageSize,
          total,
          totalPages: Math.ceil(total / safePageSize),
        },
      };
    }

    const rootIds = roots.map((item) => item.id);
    const replies = await this.commentsRepository.find({
      where: { postId, level: 2, rootId: In(rootIds), isDeleted: 0 },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    const repliesMap = new Map<number, Comment[]>();
    for (const reply of replies) {
      const key = Number(reply.rootId);
      const list = repliesMap.get(key) || [];
      list.push(reply);
      repliesMap.set(key, list);
    }

    const userIds = Array.from(new Set([...roots.map((item) => Number(item.userId)), ...replies.map((item) => Number(item.userId))]));

    const users = userIds.length
      ? await this.usersRepository.find({
          where: userIds.map((id) => ({ id })),
        })
      : [];

    const userMap = new Map<number, User>();
    for (const user of users) {
      userMap.set(Number(user.id), user);
    }

    const formatComment = (comment: Comment) => {
      const author = userMap.get(Number(comment.userId));
      return {
        id: comment.id,
        postId: comment.postId,
        userId: comment.userId,
        contentText: comment.contentText,
        level: comment.level,
        parentId: comment.parentId,
        rootId: comment.rootId,
        replyToUserId: comment.replyToUserId,
        replyCount: comment.replyCount,
        createdAt: comment.createdAt,
        user: author
          ? {
              id: author.id,
              userName: author.userName,
              avatar: author.avatar,
              signature: author.signature,
            }
          : null,
      };
    };

    const list = roots.map((root) => ({
      ...formatComment(root),
      replies: (repliesMap.get(root.id) || []).map(formatComment),
    }));

    return {
      list,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.ceil(total / safePageSize),
      },
    };
  }

  async deleteComment(commentId: number, currentUserId: number) {
    if (!Number.isInteger(commentId) || commentId <= 0) {
      const error: any = new Error('评论不存在');
      error.code = 400;
      throw error;
    }

    if (!Number.isInteger(currentUserId) || currentUserId <= 0) {
      const error: any = new Error('用户信息无效');
      error.code = 401;
      throw error;
    }

    return this.dataSource.transaction(async (manager) => {
      const comment = await manager.findOne(Comment, {
        where: { id: commentId },
      });

      if (!comment || comment.isDeleted === 1) {
        const error: any = new Error('评论不存在');
        error.code = 404;
        throw error;
      }

      if (Number(comment.userId) !== Number(currentUserId)) {
        const error: any = new Error('无权限删除该评论');
        error.code = 403;
        throw error;
      }

      const post = await manager.findOne(Post, {
        where: { id: comment.postId, isDeleted: 0 },
      });

      if (!post) {
        const error: any = new Error('帖子不存在');
        error.code = 404;
        throw error;
      }

      const now = new Date();

      if (comment.level === 2) {
        await manager.update(
          Comment,
          { id: comment.id },
          {
            isDeleted: 1,
            deletedAt: now,
            updatedAt: now,
          },
        );

        if (comment.rootId || comment.parentId) {
          await manager
            .createQueryBuilder()
            .update(Comment)
            .set({ replyCount: () => 'GREATEST(reply_count - 1, 0)', updatedAt: now })
            .where('id = :id', { id: Number(comment.rootId || comment.parentId) })
            .execute();
        }

        await manager
          .createQueryBuilder()
          .update(Post)
          .set({ commentCount: () => 'GREATEST(comment_count - 1, 0)', updatedAt: now })
          .where('id = :id', { id: comment.postId })
          .execute();

        return { id: comment.id };
      }

      const children = await manager.find(Comment, {
        where: { postId: comment.postId, rootId: comment.id, level: 2, isDeleted: 0 },
      });

      const childIds = children.map((item) => item.id);
      const deleteTotal = 1 + childIds.length;

      await manager.update(
        Comment,
        { id: comment.id },
        {
          isDeleted: 1,
          deletedAt: now,
          updatedAt: now,
          replyCount: 0,
        },
      );

      if (childIds.length > 0) {
        await manager
          .createQueryBuilder()
          .update(Comment)
          .set({
            isDeleted: 1,
            deletedAt: now,
            updatedAt: now,
          })
          .where('id IN (:...ids)', { ids: childIds })
          .execute();
      }

      await manager
        .createQueryBuilder()
        .update(Post)
        .set({
          commentCount: () => `GREATEST(comment_count - ${deleteTotal}, 0)`,
          updatedAt: now,
        })
        .where('id = :id', { id: comment.postId })
        .execute();

      return { id: comment.id };
    });
  }
}
