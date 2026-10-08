import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = {
  sub: string;
  email: string;
  role: 'ADMIN' | 'USER';
  iat?: number;
  exp?: number;
};

/** `@CurrentUser()` → the whole payload, `@CurrentUser('email')` → one field. */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    return field ? user?.[field] : user;
  },
);
