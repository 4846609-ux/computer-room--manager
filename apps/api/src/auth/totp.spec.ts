import { generateBase32Secret, totpCode, verifyTotp } from './totp';

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 test vector: ASCII secret "12345678901234567890" == base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
  const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('matches the RFC 6238 SHA-1 vector at T=59', () => {
    // At 59s the 8-digit code is 94287082 → last 6 digits 287082.
    expect(totpCode(RFC_SECRET, 59)).toBe('287082');
  });

  it('matches the RFC 6238 SHA-1 vector at T=1111111109', () => {
    expect(totpCode(RFC_SECRET, 1111111109)).toBe('081804');
  });

  it('verifies the current code and tolerates ±1 step drift', () => {
    const now = 1_700_000_000;
    const code = totpCode(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code, now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, now + 30)).toBe(true); // one step later
    expect(verifyTotp(RFC_SECRET, code, now + 120)).toBe(false); // too far
  });

  it('rejects malformed codes', () => {
    expect(verifyTotp(RFC_SECRET, 'abc', 1_700_000_000)).toBe(false);
    expect(verifyTotp(RFC_SECRET, '12345', 1_700_000_000)).toBe(false);
  });

  it('generates a decodable base32 secret', () => {
    const secret = generateBase32Secret();
    expect(secret.length).toBeGreaterThan(0);
    // A generated secret should verify its own freshly-computed code.
    const now = 1_700_000_000;
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
  });
});
