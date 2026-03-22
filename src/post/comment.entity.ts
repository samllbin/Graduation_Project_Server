import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'comments' })
@Index('idx_post_level_deleted_created', ['postId', 'level', 'isDeleted', 'createdAt'])
@Index('idx_root_deleted_created', ['rootId', 'isDeleted', 'createdAt'])
@Index('idx_parent_deleted', ['parentId', 'isDeleted'])
@Index('idx_user_created', ['userId', 'createdAt'])
export class Comment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'post_id', type: 'bigint' })
  postId: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'content_text', type: 'text' })
  contentText: string;

  @Column({ type: 'tinyint' })
  level: number;

  @Column({ name: 'parent_id', type: 'bigint', nullable: true })
  parentId: number | null;

  @Column({ name: 'root_id', type: 'bigint', nullable: true })
  rootId: number | null;

  @Column({ name: 'reply_to_user_id', type: 'bigint', nullable: true })
  replyToUserId: number | null;

  @Column({ name: 'reply_count', type: 'int', default: 0 })
  replyCount: number;

  @Column({ name: 'is_deleted', type: 'tinyint', default: 0 })
  isDeleted: number;

  @Column({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null;
}
