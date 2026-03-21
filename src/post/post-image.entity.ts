import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'post_images' })
export class PostImage {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'post_id', type: 'bigint' })
  postId: number;

  @Column({ name: 'image_url', type: 'varchar', length: 512 })
  imageUrl: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
