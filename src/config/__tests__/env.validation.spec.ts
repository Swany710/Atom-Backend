import { validateProductionEnv } from '../env.validation';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a fully-valid production environment */
function validProdEnv(): Record<string, string> {
  return {
    NODE_ENV:              'production',
    API_KEY:               'a'.repeat(32),
    ALLOWED_ORIGINS:       'https://app.example.com',
    DATABASE_URL:          'postgres://localhost/test',
    TOKEN_ENCRYPTION_KEY:  '0'.repeat(64),   // 64 hex chars
    OAUTH_STATE_SECRET:    'b'.repeat(32),
    JWT_SECRET:            'c'.repeat(32),
    GOOGLE_CLIENT_ID:      'google-client-id',
    GOOGLE_CLIENT_SECRET:  'google-client-secret',
    GOOGLE_REDIRECT_URI:   'https://app.example.com/oauth/callback',
    OWNER_USER_ID:         'owner-uuid',
  };
}

/** Run validateProductionEnv with env overrides, returns exit code or void */
function runValidation(envOverride: Record<string, string | undefined>): void {
  const original = { ...process.env };
  // Clear existing vars, then apply fresh set
  for (const key of Object.keys(original)) delete (process.env as any)[key];
  Object.assign(process.env, { ...validProdEnv(), ...envOverride });

  try {
    validateProductionEnv();
  } finally {
    // Restore original env
    for (const key of Object.keys(process.env)) delete (process.env as any)[key];
    Object.assign(process.env, original);
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('validateProductionEnv', () => {
  let exitSpy: jest.SpyInstance;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy    = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Development mode: no exits ─────────────────────────────────────────────

  describe('development mode', () => {
    it('does not call process.exit even when variables are missing', () => {
      const original = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'development';
      try {
        validateProductionEnv(); // whatever is in process.env, should not exit
      } finally {
        (process.env as any).NODE_ENV = original;
      }
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ── Production: valid baseline passes ─────────────────────────────────────

  describe('production mode — valid baseline', () => {
    it('passes without calling process.exit when all vars are correct', () => {
      runValidation({});
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ── Missing required variables ─────────────────────────────────────────────

  describe('missing required variables', () => {
    const requiredVars = [
      'API_KEY',
      'ALLOWED_ORIGINS',
      'DATABASE_URL',
      'TOKEN_ENCRYPTION_KEY',
      'OAUTH_STATE_SECRET',
      'JWT_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REDIRECT_URI',
      'OWNER_USER_ID',
    ];

    for (const varName of requiredVars) {
      it(`calls process.exit(1) when ${varName} is missing`, () => {
        runValidation({ [varName]: undefined });
        expect(exitSpy).toHaveBeenCalledWith(1);
        exitSpy.mockClear();
      });
    }
  });

  // ── TOKEN_ENCRYPTION_KEY validation ───────────────────────────────────────

  describe('TOKEN_ENCRYPTION_KEY validation', () => {
    it('rejects a key that is too short (< 64 chars)', () => {
      runValidation({ TOKEN_ENCRYPTION_KEY: '0'.repeat(32) });
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('rejects a key that contains non-hex characters', () => {
      runValidation({ TOKEN_ENCRYPTION_KEY: 'g'.repeat(64) });
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('rejects a key that is too long (> 64 chars)', () => {
      runValidation({ TOKEN_ENCRYPTION_KEY: '0'.repeat(65) });
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('accepts uppercase hex chars', () => {
      runValidation({ TOKEN_ENCRYPTION_KEY: 'A'.repeat(64) });
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('accepts lowercase hex chars', () => {
      runValidation({ TOKEN_ENCRYPTION_KEY: 'f'.repeat(64) });
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ── API_KEY length validation ──────────────────────────────────────────────

  describe('API_KEY length validation', () => {
    it('rejects an API_KEY shorter than 32 characters', () => {
      runValidation({ API_KEY: 'short' });
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('accepts an API_KEY of exactly 32 characters', () => {
      runValidation({ API_KEY: 'x'.repeat(32) });
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ── JWT_SECRET length validation ───────────────────────────────────────────

  describe('JWT_SECRET length validation', () => {
    it('rejects a JWT_SECRET shorter than 32 characters', () => {
      runValidation({ JWT_SECRET: 'tooshort' });
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('accepts a JWT_SECRET of exactly 32 characters', () => {
      runValidation({ JWT_SECRET: 'y'.repeat(32) });
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ── OAUTH_STATE_SECRET length validation ──────────────────────────────────

  describe('OAUTH_STATE_SECRET length validation', () => {
    it('rejects an OAUTH_STATE_SECRET shorter than 32 characters', () => {
      runValidation({ OAUTH_STATE_SECRET: 'tooshort' });
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('accepts an OAUTH_STATE_SECRET of exactly 32 characters', () => {
      runValidation({ OAUTH_STATE_SECRET: 'z'.repeat(32) });
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ── ALLOWED_ORIGINS wildcard ───────────────────────────────────────────────

  describe('ALLOWED_ORIGINS wildcard rejection', () => {
    it('rejects "*" as ALLOWED_ORIGINS in production', () => {
      runValidation({ ALLOWED_ORIGINS: '*' });
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('rejects "  *  " (whitespace-padded wildcard)', () => {
      runValidation({ ALLOWED_ORIGINS: '  *  ' });
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('accepts a valid origin URL', () => {
      runValidation({ ALLOWED_ORIGINS: 'https://app.example.com' });
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});
