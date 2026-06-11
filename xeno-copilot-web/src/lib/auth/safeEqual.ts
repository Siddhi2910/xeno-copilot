import { createHash, timingSafeEqual } from 'crypto';

export function safeEqual(a: string, b: string): boolean {
  try {
    const ha = Buffer.from(createHash('sha256').update(a).digest('hex'), 'utf8');
    const hb = Buffer.from(createHash('sha256').update(b).digest('hex'), 'utf8');
    return timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}
