import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * 密碼加鹽雜湊（NFR-002）。以 Node 內建 crypto.scrypt（記憶體困難函式），免加原生相依
 * （bcrypt/argon2 於 Windows 常有原生建置問題）。僅供手動帳號；上游帳號嚴禁保存密碼。
 * 儲存格式：scrypt$<N>$<saltHex>$<hashHex>。
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** 驗證密碼；null/未定義/格式損毀一律回 false（不拋例外）。以 timingSafeEqual 防時序側錄。 */
export function verifyPassword(
  plain: string,
  stored: string | null | undefined,
): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const cost = Number(parts[1]);
  if (!Number.isFinite(cost) || cost < 2) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[2], 'hex');
    expected = Buffer.from(parts[3], 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(plain, salt, expected.length, { N: cost, r: R, p: P });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
