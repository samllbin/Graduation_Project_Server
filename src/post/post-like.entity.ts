import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'post_likes' })
@Index('uk_post_user', ['postId', 'userId'], { unique: true })
@Index('idx_post_id', ['postId'])
@Index('idx_user_id', ['userId'])
export class PostLike {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'post_id', type: 'bigint' })
  postId: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
