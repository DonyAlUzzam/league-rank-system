import { SetMetadata } from '@nestjs/common';
import { Role } from '../database/entities';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the listed roles. It assumes `JwtAuthGuard` already
 * ran (it does — guards execute in registration order), so `request.user`
 * is populated. No `@Roles()` at all means "any authenticated user".
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
