import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userName: string;

  @Column()
  password: string;

  @Column()
  email: string;

  @Column()
  ctime: string;

  @Column()
  avatar: string;

  @Column()
  signature: string;

  // Add other user fields as needed
}
