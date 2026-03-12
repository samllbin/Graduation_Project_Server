import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findOne(userName: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { userName } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async create(user: Partial<User>): Promise<User> {
    const newUser = this.usersRepository.create({
      ...user,
      avatar:
        user.avatar ||
        'https://neeko-copilot.bytedance.net/api/text2image?prompt=default%20user%20avatar&size=128x128',
      signature: user.signature || '这个人很懒，什么都没写',
      ctime: new Date().getTime().toString(),
    });
    return this.usersRepository.save(newUser);
  }
}
