import { createHmac, createHash, timingSafeEqual, randomBytes } from 'crypto';

// ─── HMAC-SHA256 ──────────────────────────────────────────────────────────────
// Used to sign/verify callback payloads exchanged between Channel Service and CRM.
// Header format: X-Xeno-Signature: sha256=<hex>

export function hmacSign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export function hmacVerify(secret: string, payload: string, signature: string): boolean {
  // signature may arrive with or without the "sha256=" prefix
  const candidate = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const expected = hmacSign(secret, payload);

  // Hash both hex strings before comparison so buffers are always the same length
  const aBuf = Buffer.from(createHash('sha256').update(candidate).digest('hex'), 'utf8');
  const bBuf = Buffer.from(createHash('sha256').update(expected).digest('hex'), 'utf8');

  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

// ─── SHA-256 hash ─────────────────────────────────────────────────────────────
// Used to generate idempotencyKey = SHA256("<messageId>:<eventType>")

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ─── Random secret generation ─────────────────────────────────────────────────
// Used to generate hmacSecret on dispatch_jobs at campaign launch time.

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
