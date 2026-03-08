/**
 * AES-256-GCM token encryption/decryption.
 *
 * Set TOKEN_ENCRYPTION_KEY to a 64-char hex string (32 bytes) in Railway.
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * If TOKEN_ENCRYPTION_KEY is NOT set the value is stored as-is (dev mode).
 * Once the key is set, any plaintext values in the DB are decrypted with a
 * fallback path so an in-place migration is not required.
 */
import * as crypto from 'crypto';

const ALG   = 'aes-256-gcm';
const IV_LEN = 12; // 96-bit recommended for GCM
const PREFIX = 'enc:v1:'; // marks an encrypted value

function getKey(): Buffer | null {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length < 64) return null;
  return Buffer.from(hex.slice(0, 64), 'hex');
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext; // no key configured → store plaintext

  const iv         = crypto.randomBytes(IV_LEN);
  const cipher     = crypto.createCipheriv(ALG, key, iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();

  return PREFIX + Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // plaintext (pre-migration or no key)

  const key = getKey();
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY not configured but found encrypted token');

  const buf     = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv      = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + 16);
  const data    = buf.subarray(IV_LEN + 16);

  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(data) + decipher.final('utf8');
}
