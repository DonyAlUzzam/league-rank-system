import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../database/entities';
import { ROLES_KEY } from './roles.decorator';

/** Enforces the `@Roles(...)` metadata; routes without it stay open to any logged-in user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const req: any = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new UnauthorizedException('Authentication required');
    if (!roles.includes(user.role)) {
      throw new ForbiddenException(
        `Role ${user.role} is not allowed — this action requires ${roles.join(' or ')}`,
      );
    }
    return true;
  }
}
