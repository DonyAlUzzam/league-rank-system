import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a bearer token. Used for the login
 * endpoint — everything else is authenticated by `JwtAuthGuard`.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
