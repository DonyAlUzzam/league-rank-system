import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities';

type PublicUser = { id: string; email: string; role: User['role'] };

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    private jwt: JwtService,
  ) {}

  private public(u: User): PublicUser {
    return { id: u.id, email: u.email, role: u.role };
  }

  async login(email: string, password: string) {
    const u = await this.repo.findOne({ where: { email } });
    // One message for "no such user" and "wrong password" so the endpoint
    // cannot be used to enumerate registered addresses.
    if (!u || !(await bcrypt.compare(password, u.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return {
      success: true,
      data: {
        access_token: this.jwt.sign({ sub: u.id, email: u.email, role: u.role }),
        token_type: 'Bearer',
        user: this.public(u),
      },
    };
  }

  /** Re-reads the account so role changes show up without a new token. */
  async me(id: string, tokenExp?: number) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    return {
      success: true,
      data: {
        ...this.public(u),
        created_at: u.created_at,
        token_expires_at: tokenExp ? new Date(tokenExp * 1000).toISOString() : null,
      },
    };
  }

  /**
   * Self-service password change. The current password is required so a
   * stolen/unattended session cannot lock the real owner out.
   */
  async changePassword(id: string, current_password: string, new_password: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('User not found');

    if (!(await bcrypt.compare(current_password, u.password))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (current_password === new_password) {
      throw new BadRequestException('New password must be different from the current one');
    }

    u.password = await bcrypt.hash(new_password, 10);
    await this.repo.save(u);
    return { success: true, data: { message: 'Password updated' } };
  }
}
