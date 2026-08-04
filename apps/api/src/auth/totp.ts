import { createHmac, randomBytes } from 'node:crypto';

/**
 * Minimal, dependency-free TOTP (RFC 6238) with SHA-1, 6 digits, 30s step.
 * Used for optional two-factor authentication.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Compute the TOTP code for a given secret and unix time (seconds). */
export function totpCode(secret: string, forTime: number, step = 30, digits = 6): string {
  const counter = Math.floor(forTime / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac.readUInt8(hmac.length - 1) & 0x0f;
  const binary =
    ((hmac.readUInt8(offset) & 0x7f) << 24) |
    (hmac.readUInt8(offset + 1) << 16) |
    (hmac.readUInt8(offset + 2) << 8) |
    hmac.readUInt8(offset + 3);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/** Verify a code allowing ±1 step of clock drift. */
export function verifyTotp(secret: string, code: string, nowSeconds: number, step = 30): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  for (const drift of [-1, 0, 1]) {
    if (totpCode(secret, nowSeconds + drift * step, step) === code) return true;
  }
  return false;
}

/** Build the otpauth:// URI for QR provisioning in an authenticator app. */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
