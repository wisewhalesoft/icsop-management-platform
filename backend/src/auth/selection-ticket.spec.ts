/**
 * F001 帳號選擇 delta — 選擇票證（`AC-M10`／`AC-M19`／`AC-M20`／`AC-M22`／`AC-M23`／`AC-M29`）。
 *
 * 待實作模組：`./selection-ticket`。設計刻意比照既有兩個模組：
 *  - 簽章／時效機制比照 `session-token.service.ts`（JwtService 簽發、獨立於 session cookie）。
 *  - 一次性消耗紀錄比照 `login-throttle.ts` 之單機 process 記憶體做法（`AC-M23` 人類裁決明文
 *    「比照既有 LoginThrottleService 的 process 記憶體做法」）——故本檔亦以 `AC-M29` 之
 *    「零 schema、零 IO」對原始碼做靜態掃描，防止實作誤植 TypeORM/DataSource 依賴。
 *
 * 契約（本檔要求 `./selection-ticket` 匯出）：
 *   export const SELECTION_TICKET_COOKIE = 'icsop_login_select'; // 與 SESSION_COOKIE('icsop_session') 不同名
 *   export const SELECTION_TICKET_TTL_SECONDS = 300; // 5 分鐘，AC-M19 人類裁決
 *   export interface SelectionTicketCandidateRef { accountId: string; companyCode: string; loginId: string; }
 *   export interface SelectionTicketPayload {
 *     email: string; name: string; candidates: SelectionTicketCandidateRef[];
 *   }
 *   export type SelectionTicketCheck =
 *     | { ok: true; payload: SelectionTicketPayload }
 *     | { ok: false };
 *   export class SelectionTicketService {
 *     constructor(jwt: JwtService, now?: () => number);
 *     issue(payload: SelectionTicketPayload): string;
 *     verify(token: string | undefined | null): SelectionTicketCheck;  // 唯讀：簽章＋時效＋未被消耗
 *     consume(token: string | undefined | null): SelectionTicketCheck; // 同 verify()，成功時原子性標記已消耗
 *   }
 *
 * 🔴 **到期判斷之實作限制（本檔測試假設此點，請務必遵守）**：`verify()`／`consume()` 之時效檢查
 *   **必須**以建構子注入之 `now()` 為準，**不得**單純依賴 `jsonwebtoken`（`JwtService.verify()`）
 *   內建之 `exp` 判斷——後者綁定**真實系統時鐘**，單元測試中以假時鐘（mutable `now` 變數）模擬
 *   時間流逝時對它完全不生效（測試在真實時間中僅耗時毫秒，內建 `exp` 永遠不會因此逾時）。
 *   建議做法：`issue()` 於 payload 內另嵌 `issuedAt`（簽發時 `now()` 之值，不對外暴露於
 *   `SelectionTicketPayload`），`verify()`／`consume()` 以 `now() - issuedAt` 與
 *   `SELECTION_TICKET_TTL_SECONDS * 1000` 比較決定是否逾期；`jwt.sign()` 是否額外帶
 *   `expiresIn` 作為第二層防線由實作端自行決定，不影響本檔斷言。
 * 權威：docs/specs/features/F001-auth-login-session.md#multi-account-picker `AC-M10`／`AC-M19`／`AC-M20`／
 *       `AC-M22`／`AC-M23`／`AC-M29`。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { SESSION_COOKIE } from './session.config';
import {
  SELECTION_TICKET_COOKIE,
  SELECTION_TICKET_TTL_SECONDS,
  SelectionTicketPayload,
  SelectionTicketService,
} from './selection-ticket';

const PAYLOAD: SelectionTicketPayload = {
  email: 'a@hfcfinance.com.tw',
  name: '王小明',
  candidates: [
    { accountId: 'a1', companyCode: 'AS', loginId: 'AS001' },
    { accountId: 'a2', companyCode: 'AE', loginId: 'AE001' },
  ],
};

function makeService(now: () => number): { svc: SelectionTicketService; jwt: JwtService } {
  const jwt = new JwtService({ secret: 'selection-ticket-test-secret' });
  return { svc: new SelectionTicketService(jwt, now), jwt };
}

describe('AC-M19 票證時效＝5 分鐘、常數具名匯出、cookie 名與 session cookie 不同', () => {
  it('SELECTION_TICKET_TTL_SECONDS 恰為 300（5 分鐘）', () => {
    expect(SELECTION_TICKET_TTL_SECONDS).toBe(300);
  });

  it('SELECTION_TICKET_COOKIE 與既有 SESSION_COOKIE 不同名', () => {
    expect(SELECTION_TICKET_COOKIE).not.toBe(SESSION_COOKIE);
    expect(SELECTION_TICKET_COOKIE).toBe('icsop_login_select');
  });
});

describe('AC-M10 🔒 票證綁定 email＋候選集合全集＋簽發/到期時間，並受簽章保護', () => {
  it('issue() 後 verify() 可解回原始 payload（email＋candidates 完整往返）', () => {
    const { svc } = makeService(() => 1_000_000);
    const token = svc.issue(PAYLOAD);
    const check = svc.verify(token);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.payload.email).toBe(PAYLOAD.email);
      expect(check.payload.candidates).toEqual(PAYLOAD.candidates);
    }
  });

  it('任一位元被竄改 → 驗簽失敗（ok:false），不得解出任何 payload', () => {
    const { svc } = makeService(() => 1_000_000);
    const token = svc.issue(PAYLOAD);
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');
    expect(svc.verify(tampered)).toEqual({ ok: false });
  });

  it('以不同金鑰簽發之偽造票證（模擬未持有我方金鑰之攻擊者）→ 拒絕', () => {
    const forgedJwt = new JwtService({ secret: 'attacker-does-not-know-real-secret' });
    const forgedToken = forgedJwt.sign(
      { email: 'victim@hfcfinance.com.tw', name: 'x', candidates: [] },
      { expiresIn: 300 },
    );
    const { svc } = makeService(() => 1_000_000);
    expect(svc.verify(forgedToken)).toEqual({ ok: false });
  });
});

describe('AC-M19 🔒 票證時效——非 sliding，多次 verify() 不延長到期時間', () => {
  it('簽發後 299 秒仍有效', () => {
    let now = 1_000_000;
    const { svc } = makeService(() => now);
    const token = svc.issue(PAYLOAD);
    now += 299_000;
    expect(svc.verify(token).ok).toBe(true);
  });

  it('簽發後 301 秒已逾期 → 401 語意（ok:false）', () => {
    let now = 1_000_000;
    const { svc } = makeService(() => now);
    const token = svc.issue(PAYLOAD);
    now += 301_000;
    expect(svc.verify(token)).toEqual({ ok: false });
  });

  it('🔴 非 sliding：中途多次 verify() 呼叫不得延長到期時間', () => {
    let now = 1_000_000;
    const { svc } = makeService(() => now);
    const token = svc.issue(PAYLOAD);
    // 於有效期內反覆呼叫 verify()（模擬使用者多次刷新選擇畫面）。
    now += 100_000;
    svc.verify(token);
    now += 100_000;
    svc.verify(token);
    now += 100_000;
    svc.verify(token); // 累計 300_000ms = 原始 5 分鐘整，此處已達/超過原始期限
    now += 2_000; // 略超過原始 5 分鐘視窗
    expect(svc.verify(token)).toEqual({ ok: false }); // 若曾被任何一次 verify() 悄悄延長，這裡會誤判為 ok:true
  });
});

describe('AC-M20 🔒 票證竄改／缺漏／不可解析——一律拒絕，且不得解出任何內容', () => {
  it('undefined／null token → ok:false', () => {
    const { svc } = makeService(() => 1_000_000);
    expect(svc.verify(undefined)).toEqual({ ok: false });
    expect(svc.verify(null)).toEqual({ ok: false });
  });

  it('格式不可解析之亂碼字串 → ok:false（不得拋出未捕捉例外）', () => {
    const { svc } = makeService(() => 1_000_000);
    expect(() => svc.verify('not-a-jwt-at-all')).not.toThrow();
    expect(svc.verify('not-a-jwt-at-all')).toEqual({ ok: false });
  });

  it('candidates 欄位被竄改（簽章因此不符）→ ok:false，不得回退為信任竄改後之內容', () => {
    const { svc } = makeService(() => 1_000_000);
    const token = svc.issue(PAYLOAD);
    const [header, body, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    decoded.candidates = [{ accountId: 'INJECTED', companyCode: 'AS', loginId: 'HACKED' }];
    const tamperedBody = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    const tamperedToken = `${header}.${tamperedBody}.${sig}`;
    expect(svc.verify(tamperedToken)).toEqual({ ok: false });
  });
});

describe('AC-M23 🔒 票證一次性——GET／POST 皆受限', () => {
  it('consume() 首次成功；同一票證再次 consume() → ok:false（不得核發第二個 session）', () => {
    const { svc } = makeService(() => 1_000_000);
    const token = svc.issue(PAYLOAD);
    expect(svc.consume(token).ok).toBe(true);
    expect(svc.consume(token)).toEqual({ ok: false });
  });

  it('consume() 後，同一票證之 verify()（模擬後續 GET）亦須失敗——一次性對 GET 與 POST 皆生效', () => {
    const { svc } = makeService(() => 1_000_000);
    const token = svc.issue(PAYLOAD);
    expect(svc.verify(token).ok).toBe(true); // 消耗前：GET 正常可用
    svc.consume(token);
    expect(svc.verify(token)).toEqual({ ok: false }); // 消耗後：GET 亦須被拒
  });

  it('兩張不同票證各自獨立消耗，互不影響', () => {
    const { svc } = makeService(() => 1_000_000);
    const tokenA = svc.issue(PAYLOAD);
    const tokenB = svc.issue({ ...PAYLOAD, email: 'b@hfcfinance.com.tw' });
    expect(svc.consume(tokenA).ok).toBe(true);
    expect(svc.verify(tokenB).ok).toBe(true); // A 被消耗不影響 B
  });
});

describe('AC-M22 🔒 不得跨 email 重放（票證層面：verify 後之 payload.email 恆為簽發時之值）', () => {
  it('不同 email 之流程各自簽發之票證，其 payload.email 各自獨立且不可互換偽造', () => {
    const { svc } = makeService(() => 1_000_000);
    const tokenA = svc.issue({ ...PAYLOAD, email: 'a@hfcfinance.com.tw' });
    const tokenB = svc.issue({ ...PAYLOAD, email: 'b@hfcfinance.com.tw' });
    const checkA = svc.verify(tokenA);
    const checkB = svc.verify(tokenB);
    expect(checkA.ok && checkA.payload.email).toBe('a@hfcfinance.com.tw');
    expect(checkB.ok && checkB.payload.email).toBe('b@hfcfinance.com.tw');
  });
});

describe('AC-M29 🔒 零 schema、零 IO——process 記憶體實作，不得依賴 TypeORM/DataSource', () => {
  it('原始碼靜態掃描：不得 import TypeORM／DataSource／migrations（比照 login-throttle.ts 之無 IO 設計）', () => {
    const src = readFileSync(
      join(__dirname, 'selection-ticket.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/from ['"]typeorm['"]/);
    expect(src).not.toMatch(/@nestjs\/typeorm/);
    expect(src).not.toMatch(/DataSource/);
    expect(src).not.toMatch(/\bmigrations\b/);
  });
});
