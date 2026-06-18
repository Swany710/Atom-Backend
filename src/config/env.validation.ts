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

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function projectRefFromSupabaseUrl(value?: string): string | undefined {
  if (!value) return undefined;

  const parsed = parseUrl(value);
  const match = parsed?.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
  return match?.[1].toLowerCase();
}

function validateDatabaseUrl(databaseUrl: string, supabaseUrl?: string): string[] {
  const errors: string[] = [];

  if (/[<>\[\]]/.test(databaseUrl) || /YOUR-|PROJECT-REF/i.test(databaseUrl)) {
    errors.push(
      'DATABASE_URL still contains placeholder text. Copy the exact connection string from Supabase instead of editing the template by hand.',
    );
  }

  const parsed = parseUrl(databaseUrl);
  if (!parsed) {
    return ['DATABASE_URL must be a valid Postgres connection string.'];
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    errors.push('DATABASE_URL must start with postgres:// or postgresql://.');
  }

  if (!parsed.username || !parsed.password || !parsed.hostname) {
    errors.push('DATABASE_URL must include username, password, host, and database name.');
  }

  const host = parsed.hostname.toLowerCase();
  const username = decodeURIComponent(parsed.username);
  const expectedProjectRef = projectRefFromSupabaseUrl(supabaseUrl);
  let databaseProjectRef: string | undefined;

  const directSupabaseMatch = host.match(/^db\.([a-z0-9]{20})\.supabase\.co$/i);
  if (directSupabaseMatch) {
    databaseProjectRef = directSupabaseMatch[1].toLowerCase();

    if (username.includes('.')) {
      errors.push(
        'DATABASE_URL uses a direct Supabase host, so the database username should usually be postgres, not postgres.<project-ref>.',
      );
    }
  }

  const isSupabasePoolerHost = host.endsWith('.pooler.supabase.com');
  if (isSupabasePoolerHost) {
    const poolerUserMatch = username.match(/^[^.]+\.([a-z0-9]{20})$/i);
    if (!poolerUserMatch) {
      errors.push(
        'DATABASE_URL uses a Supabase pooler host, so the username must include the project ref, for example postgres.<project-ref>.',
      );
    } else {
      databaseProjectRef = poolerUserMatch[1].toLowerCase();
    }

    if (parsed.port && parsed.port !== '5432' && parsed.port !== '6543') {
      errors.push('Supabase pooler DATABASE_URL must use port 5432 for session mode or 6543 for transaction mode.');
    }
  }

  if (expectedProjectRef && databaseProjectRef && expectedProjectRef !== databaseProjectRef) {
    errors.push(
      `DATABASE_URL project ref (${databaseProjectRef}) does not match SUPABASE_URL project ref (${expectedProjectRef}).`,
    );
  }

  return errors;
}

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
    return;
  }

  const databaseUrlErrors = validateDatabaseUrl(
    process.env.DATABASE_URL!,
    process.env.SUPABASE_URL,
  );
  if (databaseUrlErrors.length) {
    for (const error of databaseUrlErrors) {
      console.error(`FATAL: ${error}`);
    }
    console.error('Update DATABASE_URL in Railway/Supabase and redeploy.');
    process.exit(1);
    return;
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
    return;
  }

  // Validate OAUTH_STATE_SECRET: minimum 32 chars
  if ((process.env.OAUTH_STATE_SECRET ?? '').length < 32) {
    console.error('FATAL: OAUTH_STATE_SECRET must be at least 32 characters.');
    process.exit(1);
    return;
  }

  // Validate API_KEY: minimum 32 chars
  if ((process.env.API_KEY ?? '').length < 32) {
    console.error('FATAL: API_KEY must be at least 32 characters for security.');
    process.exit(1);
    return;
  }

  // Validate ALLOWED_ORIGINS: no wildcard in production
  if ((process.env.ALLOWED_ORIGINS ?? '').trim() === '*') {
    console.error('FATAL: ALLOWED_ORIGINS cannot be "*" in production.');
    process.exit(1);
    return;
  }

  // Validate JWT_SECRET: minimum 32 chars
  if ((process.env.JWT_SECRET ?? '').length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters for security.');
    process.exit(1);
    return;
  }

  console.log('✅ Production environment validation passed.');
}
