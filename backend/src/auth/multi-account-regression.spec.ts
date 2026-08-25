/**
 * F001 帳號選擇 delta — 戊節「零漣漪回歸鎖」（`AC-M27`／`AC-M28`／`AC-M29`）之顯式釘選。
 *
 * 本檔刻意與既有 `login-throttle.spec.ts`／`account-resolver.spec.ts`／`session-token.service.spec.ts`
 * 等既有回歸測試有重疊——AC-M27/28 明文要求「要確實建成測試，不要只當敘述略過」，故本檔以
 * 本 delta 之編號重新釘選一次，作為「這幾項數值/行為在本 delta 上線後仍相同」之獨立證據，
 * 不依賴既有測試檔未來是否被異動。
 *
 * 權威：docs/specs/features/F001-auth-login-session.md#multi-account-picker `AC-M27`／`AC-M28`／`AC-M29`。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LOGIN_THROTTLE_WINDOW_MS,
  LOGIN_THROTTLE_PER_LOGINID_LIMIT,
  LOGIN_THROTTLE_PER_IP_LIMIT,
} from './login-throttle';
import { SESSION_TTL_SECONDS } from './session-token.service';
import { classifyAccountByEmail } from './account-resolver';

describe('AC-M27 其餘登入行為逐項不變——節流門檻／視窗、30 分鐘 sliding 逾時常數', () => {
  it('節流門檻與視窗未被本 delta 更動（60 秒／IP 20 次／loginId 5 次）', () => {
    expect(LOGIN_THROTTLE_WINDOW_MS).toBe(60_000);
    expect(LOGIN_THROTTLE_PER_IP_LIMIT).toBe(20);
    expect(LOGIN_THROTTLE_PER_LOGINID_LIMIT).toBe(5);
  });

  it('session 逾時常數仍為 30 分鐘（sliding 語意於既有 SessionGuard 測試中已鎖，此處僅釘常數）', () => {
    expect(SESSION_TTL_SECONDS).toBe(30 * 60);
  });
});

describe('AC-M28 既有 email 比對四條之回歸（沿用 classifyAccountByEmail，未被本 delta 更動）', () => {
  it('僅大小寫不同 → 相符（SingleActive）', () => {
    const c = classifyAccountByEmail('Peter@HFCFinance.com.tw', [
      { loginId: 'AS001', email: 'peter@hfcfinance.com.tw', companyCode: 'AS', status: 'active' },
    ]);
    expect(c.kind).toBe('SingleActive');
  });

  it('local-part 相同但網域不同 → 不相符（NotFound）', () => {
    const c = classifyAccountByEmail('peter@hfcfinance.com.tw', [
      { loginId: 'AS001', email: 'peter@other.com.tw', companyCode: 'AS', status: 'active' },
    ]);
    expect(c.kind).toBe('NotFound');
  });

  it('查無 active 帳號 → NotFound', () => {
    const c = classifyAccountByEmail('nobody@hfcfinance.com.tw', []);
    expect(c.kind).toBe('NotFound');
  });

  it('已停用 → Disabled', () => {
    const c = classifyAccountByEmail('peter@hfcfinance.com.tw', [
      { loginId: 'AS001', email: 'peter@hfcfinance.com.tw', companyCode: 'AS', status: 'disabled' },
    ]);
    expect(c.kind).toBe('Disabled');
  });
});

describe('AC-M29 🔒 零 schema 變更、不觸及稽核子系統', () => {
  it('AUDIT_LOG entity 原始碼未新增任何選擇票證相關欄位（靜態掃描；不得新增資料表/欄位）', () => {
    const src = readFileSync(
      join(__dirname, '..', 'database', 'entities', 'audit-log.entity.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/ticket/i);
    expect(src).not.toMatch(/selection/i);
  });

  it('database/migrations 目錄不含任何與選擇票證相關之新 migration（process 記憶體、無需 schema）', () => {
    const migrationsDir = join(__dirname, '..', 'database', 'migrations');
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const files: string[] = readdirSync(migrationsDir);
    const suspicious = files.filter((f) => /ticket|selection.?account/i.test(f));
    expect(suspicious).toEqual([]);
  });
});
