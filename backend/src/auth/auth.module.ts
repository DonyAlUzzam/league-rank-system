import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    // registerAsync (not register) so the factory runs *after* ConfigModule
    // has loaded .env — a plain `process.env.JWT_SECRET` read at import time
    // would happen before dotenv runs and silently fall back to dev-secret.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: {
          expiresIn:
            (config.get<string>('JWT_EXPIRES_IN') || '1d') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  providers: [
    AuthService,
    // App-wide guards, applied in this order: authenticate first, then roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
