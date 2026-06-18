/**
 * Provider call utilities
 *
 * Wraps every external API call (Anthropic, OpenAI, Google, Microsoft, CRM)
 * with:
 *   - Hard wall-clock timeout (AbortError / ProviderTimeoutError)
 *   - Retry only for idempotent/read operations (writes NEVER retried)
 *   - Consistent error mapping to ProviderError
 *
 * Usage:
 *   // Safe read — up to 3 retries with a 15-second timeout per attempt
 *   const emails = await providerRead(() => gmail.readEmails(...), 'gmail.readEmails');
 *
 *   // Write — single attempt, 30-second timeout, no retry
 *   const sent = await providerWrite(() => gmail.sendEmail(...), 'gmail.sendEmail');
 */

/** Thrown when a provider call exceeds its timeout */
export class ProviderTimeoutError extends Error {
  constructor(public readonly provider: string, public readonly timeoutMs: number) {
    super(`${provider} timed out after ${timeoutMs}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

/** Thrown when all retry attempts are exhausted */
export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly cause: unknown,
    public readonly attempts: number,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`${provider} failed after ${attempts} attempt(s): ${msg}`);
    this.name = 'ProviderError';
  }
}

/** Default timeouts per operation class */
const TIMEOUTS = {
  read:  15_000,  // 15 s — reads should be fast
  write: 30_000,  // 30 s — writes need a bit more headroom
  ai:    60_000,  // 60 s — LLM completions can be slow
  tts:   30_000,  // 30 s — TTS / STT
} as const;

type OperationType = keyof typeof TIMEOUTS;

/**
 * Run a promise with a hard timeout.
 * Rejects with ProviderTimeoutError if the promise doesn't settle in time.
 */
export function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  providerLabel: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ProviderTimeoutError(providerLabel, timeoutMs)),
      timeoutMs,
    );

    fn()
      .then((value) => { clearTimeout(timer); resolve(value); })
      .catch((err)  => { clearTimeout(timer); reject(err); });
  });
}

/**
 * Sleep helper for exponential back-off.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine whether an error is transient and safe to retry.
 * Network timeouts, 429 rate-limits, and 503 service unavailables
 * are retryable.  4xx client errors and write conflicts are not.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof ProviderTimeoutError) return true;

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // Rate limit or server-side transient
    if (msg.includes('rate limit') || msg.includes('429')) return true;
    if (msg.includes('503') || msg.includes('service unavailable')) return true;
    if (msg.includes('econnreset') || msg.includes('socket hang up')) return true;
    if (msg.includes('network') || msg.includes('timeout')) return true;
  }

  // Axios-style status errors
  const anyErr = err as any;
  const status = anyErr?.response?.status ?? anyErr?.status;
  if (status === 429 || status === 503 || status === 502 || status === 504) return true;

  return false;
}

/**
 * Execute a READ provider call.
 * - Retries up to `maxAttempts` times (default 3) on transient errors.
 * - Each attempt has its own timeout.
 * - Throws ProviderError after exhausting retries.
 */
export async function providerRead<T>(
  fn: () => Promise<T>,
  label: string,
  options: { timeoutMs?: number; maxAttempts?: number } = {},
): Promise<T> {
  const timeoutMs    = options.timeoutMs   ?? TIMEOUTS.read;
  const maxAttempts  = options.maxAttempts ?? 3;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn, timeoutMs, label);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts) break;
      // Exponential back-off: 500 ms, 1 s, 2 s …
      await sleep(500 * Math.pow(2, attempt - 1));
    }
  }

  throw new ProviderError(label, lastErr, maxAttempts);
}

/**
 * Execute a WRITE provider call.
 * - Single attempt only — no blind retry on writes.
 * - Throws ProviderError on failure.
 */
export async function providerWrite<T>(
  fn: () => Promise<T>,
  label: string,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? TIMEOUTS.write;

  try {
    return await withTimeout(fn, timeoutMs, label);
  } catch (err) {
    throw new ProviderError(label, err, 1);
  }
}

/**
 * Execute an AI inference call.
 * - Single attempt (LLM calls are inherently stateful, not safe to retry blindly).
 * - Longer timeout than regular reads.
 */
export async function providerAI<T>(
  fn: () => Promise<T>,
  label: string,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? TIMEOUTS.ai;

  try {
    return await withTimeout(fn, timeoutMs, label);
  } catch (err) {
    throw new ProviderError(label, err, 1);
  }
}

/**
 * Execute a TTS / STT call.
 */
export async function providerAudio<T>(
  fn: () => Promise<T>,
  label: string,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? TIMEOUTS.tts;

  try {
    return await withTimeout(fn, timeoutMs, label);
  } catch (err) {
    throw new ProviderError(label, err, 1);
  }
}
