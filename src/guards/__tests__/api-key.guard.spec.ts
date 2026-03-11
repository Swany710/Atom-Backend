import { ExecutionContext, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from '../api-key.guard';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeContext(
  headers: Record<string, string> = {},
  handlerMeta?: boolean,
  classMeta?: boolean,
): ExecutionContext {
  const req: Record<string, any> = { headers };
  return {
    getHandler:  () => ({}),
    getClass:    () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(
  config: Record<string, string | undefined>,
  reflectorReturn: boolean,
  jwtVerifyResult?: { sub: string; email: string } | null,
): { guard: ApiKeyGuard; req: Record<string, any> } {
  const configService = {
    get: (key: string) => config[key],
  } as unknown as ConfigService;

  const reflector = {
    getAllAndOverride: (_key: any, _targets: any[]) => reflectorReturn,
  } as unknown as Reflector;

  const jwtService = {
    verify: (_token: string, _opts: any) => {
      if (jwtVerifyResult === null) throw new Error('invalid token');
      return jwtVerifyResult ?? { sub: 'user-uuid-123', email: 'user@test.com' };
    },
  } as unknown as JwtService;

  const guard = new ApiKeyGuard(configService, reflector, jwtService);

  // Expose internal req after canActivate via a shared reference
  const req: Record<string, any> = {};
  return { guard, req };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ApiKeyGuard', () => {
  const VALID_API_KEY  = 'a'.repeat(32);
  const VALID_JWT_SECRET = 'b'.repeat(32);
  const OWNER_ID = 'owner-uuid-456';

  // Helper that runs canActivate against an actual req object
  function runGuard(
    env: Record<string, string | undefined>,
    headers: Record<string, string>,
    isPublic = false,
    jwtVerifyResult?: { sub: string; email: string } | null,
  ): Record<string, any> {
    const req: Record<string, any> = { headers };

    const configService = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;

    const reflector = {
      getAllAndOverride: (_k: any, _t: any[]) => isPublic,
    } as unknown as Reflector;

    const jwtService = {
      verify: (_token: string, _opts: any) => {
        if (jwtVerifyResult === null) throw new Error('invalid token');
        return jwtVerifyResult ?? { sub: 'user-uuid-123', email: 'user@test.com' };
      },
    } as unknown as JwtService;

    const guard = new ApiKeyGuard(configService, reflector, jwtService);
    const ctx = {
      getHandler:   () => ({}),
      getClass:     () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    guard.canActivate(ctx);
    return req;
  }

  // ── @Public() routes ───────────────────────────────────────────────────────

  describe('@Public() routes', () => {
    it('bypasses auth entirely and returns true', () => {
      const configService = { get: () => undefined } as unknown as ConfigService;
      const reflector = {
        getAllAndOverride: () => true,
      } as unknown as Reflector;
      const jwtService = { verify: jest.fn() } as unknown as JwtService;

      const guard = new ApiKeyGuard(configService, reflector, jwtService);
      const ctx = {
        getHandler:   () => ({}),
        getClass:     () => ({}),
        switchToHttp: () => ({ getRequest: () => ({}) }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(ctx)).toBe(true);
      expect(jwtService.verify).not.toHaveBeenCalled();
    });
  });

  // ── Dev open mode ──────────────────────────────────────────────────────────

  describe('dev open mode (no credentials configured, NODE_ENV != production)', () => {
    const env: Record<string, string | undefined> = {
      API_KEY: undefined,
      JWT_SECRET: undefined,
      NODE_ENV: 'development',
    };

    it('sets atomUserId to dev-user and authMode to open when no Authorization header', () => {
      const req = runGuard(env, {});
      expect(req.atomUserId).toBe('dev-user');
      expect(req.authMode).toBe('open');
    });

    it('still allows a token-bearing request through in open mode (no API_KEY configured)', () => {
      // If a token is present but neither JWT_SECRET nor API_KEY is set, falls through to open
      const req = runGuard(env, { authorization: 'Bearer some-random-token' }, false, null);
      expect(req.atomUserId).toBe('dev-user');
      expect(req.authMode).toBe('open');
    });
  });

  // ── API-key mode ───────────────────────────────────────────────────────────

  describe('API-key mode', () => {
    const env: Record<string, string | undefined> = {
      API_KEY:       VALID_API_KEY,
      OWNER_USER_ID: OWNER_ID,
      JWT_SECRET:    undefined,
    };

    it('accepts a matching API key and sets atomUserId to OWNER_USER_ID', () => {
      const req = runGuard(env, { authorization: `Bearer ${VALID_API_KEY}` }, false, null);
      expect(req.atomUserId).toBe(OWNER_ID);
      expect(req.authMode).toBe('apikey');
    });

    it('rejects a wrong API key with UnauthorizedException', () => {
      expect(() =>
        runGuard(env, { authorization: 'Bearer wrong-key' }, false, null),
      ).toThrow(UnauthorizedException);
    });

    it('rejects missing Authorization header when API_KEY is configured', () => {
      expect(() => runGuard(env, {})).toThrow(UnauthorizedException);
    });
  });

  // ── JWT mode ───────────────────────────────────────────────────────────────

  describe('JWT mode', () => {
    const env: Record<string, string | undefined> = {
      JWT_SECRET:    VALID_JWT_SECRET,
      API_KEY:       undefined,
      OWNER_USER_ID: OWNER_ID,
    };
    // A minimal-looking JWT (three dot-separated segments)
    const FAKE_JWT = 'header.payload.signature';

    it('verifies JWT and sets atomUserId to payload.sub', () => {
      const req = runGuard(
        env,
        { authorization: `Bearer ${FAKE_JWT}` },
        false,
        { sub: 'user-uuid-123', email: 'user@test.com' },
      );
      expect(req.atomUserId).toBe('user-uuid-123');
      expect(req.authMode).toBe('jwt');
    });

    it('falls through to open-mode (no API_KEY) when JWT verification fails', () => {
      const req = runGuard(
        { ...env, JWT_SECRET: VALID_JWT_SECRET, API_KEY: undefined },
        { authorization: `Bearer ${FAKE_JWT}` },
        false,
        null, // force verify to throw
      );
      // No API_KEY and NODE_ENV is not 'production', so open mode
      expect(req.atomUserId).toBe('dev-user');
      expect(req.authMode).toBe('open');
    });
  });

  // ── Production mode ────────────────────────────────────────────────────────

  describe('production mode rejections', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeAll(() => {
      (process.env as any).NODE_ENV = 'production';
    });

    afterAll(() => {
      (process.env as any).NODE_ENV = originalEnv;
    });

    it('throws InternalServerErrorException when no credentials are set in production', () => {
      // In production with no API_KEY and no JWT_SECRET, any request should fail
      expect(() =>
        runGuard(
          { API_KEY: undefined, JWT_SECRET: undefined },
          { authorization: 'Bearer some.jwt.token' },
          false,
          null,
        ),
      ).toThrow(InternalServerErrorException);
    });

    it('rejects missing Authorization header in production', () => {
      expect(() =>
        runGuard(
          { API_KEY: VALID_API_KEY, JWT_SECRET: undefined },
          {}, // no auth header
        ),
      ).toThrow(UnauthorizedException);
    });
  });
});
