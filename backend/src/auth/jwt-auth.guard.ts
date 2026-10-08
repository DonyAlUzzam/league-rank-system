import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Verifies `Authorization: Bearer <jwt>` and puts the payload on `req.user`.
 *
 * Deliberately hand-written instead of `@nestjs/passport` so the project does
 * not need `passport` + `passport-jwt` just to check one signature — the same
 * `JwtService` (and therefore the same secret) that signs the token verifies it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req: any = ctx.switchToHttp().getRequest();
    const header: unknown = req.headers['authorization'];
    const token =
      typeof header === 'string' && /^bearer\s+/i.test(header)
        ? header.replace(/^bearer\s+/i, '').trim()
        : null;

    if (!token) {
      throw new UnauthorizedException(
        'Authentication required — send "Authorization: Bearer <token>"',
      );
    }

    try {
      req.user = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired token — please log in again',
      );
    }

    return true;
  }
}
