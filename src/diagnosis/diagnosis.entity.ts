import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'diagnosis_records' })
@Index('idx_user_created', ['userId', 'createdAt'])
@Index('idx_status_created', ['status', 'createdAt'])
export class DiagnosisRecord {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'image_url', type: 'varchar', length: 512 })
  imageUrl: string;

  @Column({ name: 'symptom_text', type: 'text', nullable: true })
  symptomText: string | null;

  @Column({ name: 'crop_type', type: 'varchar', length: 64, nullable: true })
  cropType: string | null;

  @Column({ type: 'tinyint', default: 0 })
  status: number;

  @Column({ name: 'result_label', type: 'varchar', length: 128, nullable: true })
  resultLabel: string | null;

  @Column({ name: 'result_confidence', type: 'decimal', precision: 6, scale: 4, nullable: true })
  resultConfidence: string | null;

  @Column({ name: 'result_detail', type: 'text', nullable: true })
  resultDetail: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 255, nullable: true })
  errorMessage: string | null;

  @Column({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
