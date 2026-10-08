import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY, Public } from './public.decorator';
import { ROLES_KEY, Roles } from './roles.decorator';
import { Role } from '../database/entities';

const SECRET = 'unit-test-secret';

/** Minimal stand-in for the Nest HTTP context. */
function makeCtx(handler: () => void, req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class Sample {},
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      next: () => undefined,
    }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } });
  const guard = new JwtAuthGuard(jwt, new Reflector());

  it('lets @Public routes through without a token', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
    expect(guard.canActivate(makeCtx(handler, { headers: {} }))).toBe(true);
  });

  it('rejects a request with no Authorization header', () => {
    expect(() => guard.canActivate(makeCtx(() => undefined, { headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a non-bearer Authorization header', () => {
    expect(() =>
      guard.canActivate(makeCtx(() => undefined, { headers: { authorization: 'Basic abc' } })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a token signed with the wrong secret', () => {
    const forged = new JwtService({ secret: 'other' }).sign({ sub: 'x', role: 'ADMIN' });
    expect(() =>
      guard.canActivate(makeCtx(() => undefined, { headers: bearer(forged) })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a malformed token', () => {
    expect(() =>
      guard.canActivate(makeCtx(() => undefined, { headers: bearer('not.a.jwt') })),
    ).toThrow(UnauthorizedException);
  });

  it('accepts a valid token and puts the payload on req.user', () => {
    const token = jwt.sign({ sub: 'u-1', email: 'a@b.c', role: Role.ADMIN });
    const req: Record<string, unknown> = { headers: bearer(token) };
    expect(guard.canActivate(makeCtx(() => undefined, req))).toBe(true);
    expect(req.user).toMatchObject({ sub: 'u-1', email: 'a@b.c', role: 'ADMIN' });
  });

  it('accepts an Authorization header that is not exactly "Bearer " cased', () => {
    const token = jwt.sign({ sub: 'u-2', role: Role.USER });
    const req: Record<string, unknown> = { headers: { authorization: `bearer   ${token}` } };
    expect(guard.canActivate(makeCtx(() => undefined, req))).toBe(true);
    expect((req.user as { sub: string }).sub).toBe('u-2');
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('passes when the route declares no roles', () => {
    expect(guard.canActivate(makeCtx(() => undefined, { user: { role: Role.USER } }))).toBe(true);
  });

  it('allows a matching role', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, [Role.ADMIN], handler);
    expect(guard.canActivate(makeCtx(handler, { user: { role: Role.ADMIN } }))).toBe(true);
  });

  it('forbids a non-matching role', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, [Role.ADMIN], handler);
    expect(() =>
      guard.canActivate(makeCtx(handler, { user: { role: Role.USER } })),
    ).toThrow(ForbiddenException);
  });

  it('forbids when there is no user at all (guard ran out of order)', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, [Role.ADMIN], handler);
    expect(() => guard.canActivate(makeCtx(handler, {}))).toThrow(UnauthorizedException);
  });
});

describe('decorators', () => {
  it('Public() writes the metadata key the guard reads', () => {
    const target = () => undefined;
    Public()(target);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, target)).toBe(true);
  });

  it('Roles() records the declared roles', () => {
    const target = () => undefined;
    Roles(Role.ADMIN, Role.USER)(target);
    expect(Reflect.getMetadata(ROLES_KEY, target)).toEqual([Role.ADMIN, Role.USER]);
  });
});
