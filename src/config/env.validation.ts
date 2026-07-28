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

/**
 * Capability vars. These are deliberately NOT in REQUIRED_PROD_VARS — a missing
 * one degrades a feature rather than making the service unbootable, and hard-
 * failing the deploy would be worse than running without (say) live voice.
 *
 * They ARE reported loudly at boot, because the previous behaviour was silence:
 * the container came up "healthy", and the first person to press the mic got a
 * 500 with no clue that a key was simply absent.
 */
interface CapabilityCheck {
  feature: string;
  ok: boolean;
  detail: string;
}

export function checkCapabilities(): CapabilityCheck[] {
  const has = (k: string) => !!process.env[k]?.trim();

  return [
    {
      feature: 'AI reasoning + tool use (all text and voice replies)',
      ok: has('ANTHROPIC_API_KEY'),
      detail: 'set ANTHROPIC_API_KEY',
    },
    {
      feature: 'Speech-to-text + spoken replies (POST /api/v1/ai/voice, /speak)',
      ok: has('ELEVENLABS_API_KEY'),
      detail: 'set ELEVENLABS_API_KEY — ElevenLabs is the only speech provider',
    },
    {
      feature: 'Knowledge-base semantic search (product spec library embeddings)',
      ok: has('OPENAI_API_KEY'),
      detail: 'set OPENAI_API_KEY — used ONLY for text-embedding-3-small',
    },
  ];
}

/** Print a one-line-per-feature capability report. Never exits the process. */
export function reportCapabilities(): void {
  const checks = checkCapabilities();
  const broken = checks.filter((c) => !c.ok);

  if (broken.length === 0) {
    console.log('✅ AI capability check passed — reasoning, voice I/O, and live voice all configured.');
    return;
  }

  console.warn('⚠️  AI capability check — the following features are DISABLED:');
  for (const c of broken) {
    console.warn(`   ✗ ${c.feature}\n       → ${c.detail}`);
  }
  console.warn(
    '   The service will still start, but requests that need these features will fail at runtime.',
  );
}

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
