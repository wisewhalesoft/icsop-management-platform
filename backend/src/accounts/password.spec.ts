import { hashPassword, verifyPassword } from './password';

/**
 * 密碼雜湊（NFR-002）：以 Node 內建 crypto.scrypt 加鹽雜湊，免原生相依。
 * 格式：scrypt$<N>$<saltHex>$<hashHex>。
 */
describe('password — scrypt 加鹽雜湊', () => {
  it('hashPassword 產生 scrypt 格式，且每次鹽不同', () => {
    const a = hashPassword('Init@2026');
    const b = hashPassword('Init@2026');
    expect(a).toMatch(/^scrypt\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(a).not.toBe(b); // 隨機鹽 → 相同明文雜湊不同
  });

  it('verifyPassword：正確密碼 → true、錯誤 → false', () => {
    const stored = hashPassword('S3cret!');
    expect(verifyPassword('S3cret!', stored)).toBe(true);
    expect(verifyPassword('s3cret!', stored)).toBe(false);
    expect(verifyPassword('', stored)).toBe(false);
  });

  it('verifyPassword：null/損毀格式 → false（不拋例外）', () => {
    expect(verifyPassword('x', null)).toBe(false);
    expect(verifyPassword('x', undefined)).toBe(false);
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(verifyPassword('x', 'scrypt$16384$onlythree')).toBe(false);
  });
});
