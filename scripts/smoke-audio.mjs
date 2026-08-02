#!/usr/bin/env node
/**
 * smoke-audio.mjs — daily end-to-end audio round trip against a LIVE deployment.
 *
 * WHY THIS EXISTS
 *   In May a provider retired a model out from under us. Nothing in the build
 *   or the unit tests noticed, because nothing in the build or the unit tests
 *   talks to a provider. It surfaced in July, when someone tried to use the
 *   thing. Two months of a core feature being dead.
 *
 *   Unit tests mock the providers, which is correct — but it means the only way
 *   to learn that a provider changed is to actually call it. That is this
 *   script's entire job, and it is why it runs against production rather than
 *   a build artefact.
 *
 * WHAT IT EXERCISES
 *   1. /health          — is the service up at all
 *   2. POST /ai/speak   — text → speech            (ElevenLabs TTS)
 *   3. POST /ai/voice   — that speech → text → reply (STT + Claude + tools)
 *
 *   Step 3 feeds step 2's output back in, so the round trip needs no committed
 *   audio fixture and no fixture can go stale. If any provider in the chain
 *   changes a model name, drops an endpoint, or starts rejecting our key, one
 *   of these three steps fails and the workflow goes red the next morning.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   Assert on the assistant's wording. The model is free to answer however it
 *   likes; asserting on phrasing would produce a flaky job that everyone learns
 *   to ignore, which is worse than no job at all. It checks that audio came
 *   back, that the transcript resembles what we sent, and that a non-empty
 *   reply was produced.
 *
 * USAGE
 *   ATOM_BASE_URL=https://… ATOM_API_KEY=… node scripts/smoke-audio.mjs
 *
 * Exit code 0 = healthy, 1 = something in the chain is broken.
 */

const BASE = (process.env.ATOM_BASE_URL || '').replace(/\/+$/, '');
const KEY  = process.env.ATOM_API_KEY || '';

// A phrase chosen to transcribe reliably: common words, no proper nouns, no
// digits, and long enough to clear the endpoint's 1 KB minimum-audio guard.
const PHRASE = 'This is the daily automated check. Please reply with a short confirmation.';

// Same session every day. It keeps the smoke runs out of real conversations,
// and the rolling summariser compacts it rather than letting it grow forever.
const SESSION = 'ci-smoke';

const TIMEOUT_MS = 90_000;

let failures = 0;

function fail(step, detail) {
  failures++;
  console.error(`✗ ${step}\n  ${detail}`);
}

function pass(step, detail = '') {
  console.log(`✓ ${step}${detail ? ` — ${detail}` : ''}`);
}

/** fetch with a hard timeout — a hung provider must not hang the job. */
async function withTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${KEY}`, ...extra };
}

/** Normalise for comparison: lowercase, strip punctuation, collapse spaces. */
function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fraction of the words we SENT that appear in the transcript.
 *
 * A word-overlap score rather than an exact match: speech-to-text legitimately
 * varies on filler and punctuation, and demanding an exact string would make
 * this flaky. A real breakage (empty transcript, an error string, a different
 * language) scores near zero, which is the signal we want.
 */
function wordOverlap(expected, actual) {
  const want = new Set(normalise(expected).split(' ').filter(Boolean));
  const got  = new Set(normalise(actual).split(' ').filter(Boolean));
  if (want.size === 0) return 0;
  let hit = 0;
  for (const w of want) if (got.has(w)) hit++;
  return hit / want.size;
}

// ── Step 1: health ───────────────────────────────────────────────────────────

async function checkHealth() {
  const res = await withTimeout(`${BASE}/health`, { headers: authHeaders() });
  if (!res.ok) {
    fail('health', `HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return false;
  }
  pass('health', `HTTP ${res.status}`);
  return true;
}

// ── Step 2: text → speech ────────────────────────────────────────────────────

async function synthesise() {
  const res = await withTimeout(`${BASE}/api/v1/ai/speak`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text: PHRASE }),
  });

  if (!res.ok) {
    fail('speak (TTS)', `HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return null;
  }

  const audio = Buffer.from(await res.arrayBuffer());

  // The voice endpoint rejects anything under 1 KB as "too short", and a
  // provider that starts returning an error page instead of audio would land
  // here as a handful of bytes. Catch it now with a clear message.
  if (audio.length < 2_000) {
    fail('speak (TTS)', `returned only ${audio.length} bytes — expected real audio`);
    return null;
  }

  pass('speak (TTS)', `${audio.length} bytes of ${res.headers.get('content-type')}`);
  return audio;
}

// ── Step 3: speech → transcript → reply ──────────────────────────────────────

async function roundTrip(audio) {
  const form = new FormData();
  form.append('audio', new Blob([audio], { type: 'audio/mpeg' }), 'smoke.mp3');
  form.append('conversationId', SESSION);

  // Note: no Content-Type header — fetch sets the multipart boundary itself.
  const res = await withTimeout(`${BASE}/api/v1/ai/voice`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    fail('voice (STT + Claude)', `HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return;
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    fail('voice (STT + Claude)', `response was not JSON: ${err.message}`);
    return;
  }

  const transcript = body.transcription ?? '';
  const reply      = body.message ?? '';

  // The controller returns this sentinel rather than a 4xx when the upload is
  // too small — without an explicit check it would read as a pass.
  if (transcript === '[Too Short]') {
    fail('voice (STT)', 'server rejected the audio as too short');
    return;
  }

  const overlap = wordOverlap(PHRASE, transcript);
  if (overlap < 0.5) {
    fail(
      'voice (STT)',
      `transcript matched only ${(overlap * 100).toFixed(0)}% of the spoken words\n` +
      `  sent:  "${PHRASE}"\n` +
      `  heard: "${transcript}"`,
    );
  } else {
    pass('voice (STT)', `${(overlap * 100).toFixed(0)}% word overlap — "${transcript}"`);
  }

  if (!reply.trim()) {
    fail('voice (Claude)', 'assistant returned an empty reply');
  } else {
    pass('voice (Claude)', `${reply.length} chars — "${reply.slice(0, 80)}…"`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!BASE || !KEY) {
    console.error('ATOM_BASE_URL and ATOM_API_KEY must both be set.');
    process.exit(1);
  }

  console.log(`Atom audio smoke test → ${BASE}\n`);

  try {
    if (!(await checkHealth())) {
      // If the service is down, the provider checks below would just produce
      // noise on top of an outage we already know about.
      console.error('\nService is not healthy — skipping provider checks.');
      process.exit(1);
    }

    const audio = await synthesise();
    if (audio) await roundTrip(audio);
  } catch (err) {
    fail('smoke run', err?.name === 'AbortError'
      ? `timed out after ${TIMEOUT_MS}ms`
      : (err?.stack || String(err)));
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main();
