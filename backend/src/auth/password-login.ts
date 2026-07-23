import { randomBytes } from 'crypto';
import { PasswordAuthAccount } from './account-repository';
import { hashPassword, verifyPassword } from '../accounts/password';

/**
 * 途徑 B（帳密登入）之純決策邏輯（無 IO）。對應 F001／error-handling.md#auth：
 *  - 僅 source=manual 且 status=active 且密碼比對通過 → authenticated。
 *  - 其餘（查無帳號 null／密碼錯誤／停用／上游 passwordHash=null）一律 rejected，
 *    呼叫端統一回 AUTH_INVALID_CREDENTIALS（不洩漏帳號是否存在／是否啟用）。
 *
 * 側錄防護（TS-F001-012／NFR）：即使查無帳號或無 passwordHash，仍對一個 dummy hash 執行一次
 * scrypt 比對，使「查無帳號」分支與「密碼錯誤」分支耗時相當，避免以回應時間推斷帳號是否存在。
 * verifyPassword 本身已用 timingSafeEqual。
 */

// 程序啟動時計算一次；salt 隨機、內容永不等於任何真實密碼，僅為拉平耗時。
const DUMMY_HASH = hashPassword(`icsop-dummy-${randomBytes(16).toString('hex')}`);

export type PasswordLoginOutcome =
  | { kind: 'authenticated'; account: PasswordAuthAccount }
  | { kind: 'rejected' };

export function resolvePasswordLogin(
  account: PasswordAuthAccount | null,
  password: string,
): PasswordLoginOutcome {
  // 僅手動帳號持有可比對之 passwordHash；上游帳號 passwordHash 恆為 null。
  const storedHash =
    account && account.source === 'manual' ? account.passwordHash : null;
  // 一律執行一次比對以拉平耗時（storedHash 為 null 時比對 dummy，必為 false）。
  const matches = verifyPassword(password, storedHash ?? DUMMY_HASH);

  if (
    account !== null &&
    account.source === 'manual' &&
    account.status === 'active' &&
    storedHash !== null &&
    matches
  ) {
    return { kind: 'authenticated', account };
  }
  return { kind: 'rejected' };
}
