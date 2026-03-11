/**
 * Production environment validation.
 * Called before bootstrap() so the process exits immediately if any required
 * variable is missing or malformed.  In development (NODE_ENV !== 'production')
 * this is a no-op — missing vars produce warnings, not exits.
 */

const REQUIRED_PROD_VARS: string[] = [
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

export function validateProductionEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    // Dev-mode warnings only
    const missing = REQUIRED_PROD_VARS.filter((v) => !process.env[v]);
    if (missing.length) {
      console.warn(
        `⚠️  [dev] The following env vars are unset (required in production): ${missing.join(', ')}`,
      );
    }
    return;
  }

  // --- PRODUCTION ---
  const missing = REQUIRED_PROD_VARS.filter((v) => !process.env[v]);
  if (missing.length) {
    console.error(
      `FATAL: Missing required production environment variables: ${missing.join(', ')}`,
    );
    console.error('Set these variables in Railway and redeploy.');
    process.exit(1);
  }

  // Validate TOKEN_ENCRYPTION_KEY: must be exactly 64 hex chars (32 bytes for AES-256)
  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY!;
  if (!/^[0-9a-fA-F]{64}$/.test(tokenKey)) {
    console.error(
      'FATAL: TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).',
    );
    console.error(
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
    process.exit(1);
  }

  // Validate OAUTH_STATE_SECRET: minimum 32 chars
  if ((process.env.OAUTH_STATE_SECRET!).length < 32) {
    console.error('FATAL: OAUTH_STATE_SECRET must be at least 32 characters.');
    process.exit(1);
  }

  // Validate API_KEY: minimum 32 chars
  if ((process.env.API_KEY!).length < 32) {
    console.error('FATAL: API_KEY must be at least 32 characters for security.');
    process.exit(1);
  }

  // Validate ALLOWED_ORIGINS: no wildcard in production
  if (process.env.ALLOWED_ORIGINS!.trim() === '*') {
    console.error('FATAL: ALLOWED_ORIGINS cannot be "*" in production.');
    process.exit(1);
  }

  // Validate JWT_SECRET: minimum 32 chars
  if ((process.env.JWT_SECRET!).length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters for security.');
    process.exit(1);
  }

  console.log('✅ Production environment validation passed.');
}
