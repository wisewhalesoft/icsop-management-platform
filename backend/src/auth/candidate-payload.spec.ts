/**
 * F001 帳號選擇 delta — 選擇畫面候選查詢端點之 payload 投影（`AC-M12`／`AC-M14`／`AC-M15`）。
 *
 * 待實作模組：`./candidate-payload`。純函式，接受注入之顯示名稱解析器（company/org/role），
 * 不自行連 DB——org 名稱解析為 async（比照既有 `NameResolutionService.resolveOrgUnitName`
 * 之簽章），company／role 為 sync（比照既有 `resolveCompanyName`／`roleLabel`）。
 *
 * 契約（本檔要求 `./candidate-payload` 匯出）：
 *   export interface CandidateDisplayRow {
 *     accountId: string; companyCode: string; companyName: string;
 *     orgCode: string | null; orgName: string; roleCode: string; roleName: string; loginId: string;
 *   }
 *   export interface DisplayResolvers {
 *     companyName(companyCode: string | null | undefined): string | null;
 *     orgName(orgCode: string | null | undefined): Promise<string | null>;
 *     roleName(roleCode: string | null | undefined): string;
 *   }
 *   export function buildCandidatePayload(
 *     email: string, name: string,
 *     candidates: readonly CandidateAccount[], // from './multi-account-picker'
 *     resolvers: DisplayResolvers,
 *   ): Promise<{ email: string; name: string; candidates: CandidateDisplayRow[] }>;
 *
 * 權威：docs/specs/features/F001-auth-login-session.md#multi-account-picker `AC-M12`／`AC-M14`／`AC-M15`。
 * `AC-M13`（畫面應顯示欄位、姓名僅顯示一次）為前端渲染職責，見
 * `frontend/src/pages/SelectAccountPage.test.tsx`。
 */

import { CandidateAccount } from './multi-account-picker';
import { buildCandidatePayload, DisplayResolvers } from './candidate-payload';

function acct(overrides: Partial<CandidateAccount> & { accountId: string }): CandidateAccount {
  return {
    loginId: overrides.accountId,
    email: 'a@hfcfinance.com.tw',
    companyCode: 'AS',
    status: 'active',
    name: '王小明',
    ...overrides,
  };
}

const CLOSED_KEY_SET = [
  'accountId',
  'companyCode',
  'companyName',
  'orgCode',
  'orgName',
  'roleCode',
  'roleName',
  'loginId',
].sort();

function fakeResolvers(overrides: Partial<DisplayResolvers> = {}): DisplayResolvers {
  return {
    companyName: (c: string | null | undefined) => (c === 'AS' ? '和潤企業' : null),
    orgName: async (o: string | null | undefined) => (o === 'JAC00' ? '資訊室' : null),
    roleName: (r: string | null | undefined) => (r === 'ICSOPAdmin' ? 'ICSOP 管理員' : r ?? ''),
    ...overrides,
  };
}

describe('AC-M12 候選查詢端點之 payload 封閉集', () => {
  it('每一筆候選恰含且僅含八個欄位——不得洩漏 passwordHash 等禁欄，即使來源物件夾帶額外屬性', async () => {
    const dirty = {
      ...acct({ accountId: 'a1', companyCode: 'AS', orgCode: 'JAC00', roleCode: 'ICSOPAdmin', loginId: 'AS001' }),
      passwordHash: 'should-never-leak',
      resignDate: '2020-01-01',
      hireDate: '2015-01-01',
      managerEmpNo: 'E00001',
    } as unknown as CandidateAccount;

    const payload = await buildCandidatePayload('a@hfcfinance.com.tw', '王小明', [dirty], fakeResolvers());
    expect(Object.keys(payload).sort()).toEqual(['candidates', 'email', 'name']);
    expect(payload.email).toBe('a@hfcfinance.com.tw');
    expect(payload.name).toBe('王小明');
    expect(payload.candidates).toHaveLength(1);
    const row = payload.candidates[0];
    expect(Object.keys(row).sort()).toEqual(CLOSED_KEY_SET);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('resignDate');
    expect(serialized).not.toContain('hireDate');
    expect(serialized).not.toContain('managerEmpNo');
  });
});

describe('AC-M14 缺值之顯示規則——逐欄明定', () => {
  it('公司：有對照 → 顯示簡稱', async () => {
    const payload = await buildCandidatePayload(
      'a@hfcfinance.com.tw',
      '王小明',
      [acct({ accountId: 'a1', companyCode: 'AS', roleCode: 'ICSOPAdmin' })],
      fakeResolvers(),
    );
    expect(payload.candidates[0].companyName).toBe('和潤企業');
  });

  it('公司：無對照 → 顯示 companyCode 原值', async () => {
    const payload = await buildCandidatePayload(
      'a@hfcfinance.com.tw',
      '王小明',
      [acct({ accountId: 'a1', companyCode: 'ZZ', roleCode: 'User' })],
      fakeResolvers(),
    );
    expect(payload.candidates[0].companyName).toBe('ZZ');
  });

  it('公司：companyCode 為空字串 → 顯示 —（U+2014 EM DASH）', async () => {
    const payload = await buildCandidatePayload(
      'a@hfcfinance.com.tw',
      '王小明',
      [acct({ accountId: 'a1', companyCode: '', roleCode: 'User' })],
      fakeResolvers(),
    );
    expect(payload.candidates[0].companyName).toBe('—');
  });

  it('部門：orgCode 有對應（不論 active/inactive，由 resolver 決定，本層只認回傳值）→ 顯示單位名稱', async () => {
    const payload = await buildCandidatePayload(
      'a@hfcfinance.com.tw',
      '王小明',
      [acct({ accountId: 'a1', companyCode: 'AS', orgCode: 'JAC00', roleCode: 'User' })],
      fakeResolvers(),
    );
    expect(payload.candidates[0].orgName).toBe('資訊室');
  });

  it('部門：orgCode 無對應 → 顯示 orgCode 原值', async () => {
    const payload = await buildCandidatePayload(
      'a@hfcfinance.com.tw',
      '王小明',
      [acct({ accountId: 'a1', companyCode: 'AS', orgCode: 'NOPE99', roleCode: 'User' })],
      fakeResolvers(),
    );
    expect(payload.candidates[0].orgName).toBe('NOPE99');
  });

  it('部門：orgCode 為 null／空字串 → 顯示 —', async () => {
    const payload = await buildCandidatePayload(
      'a@hfcfinance.com.tw',
      '王小明',
      [
        acct({ accountId: 'a1', companyCode: 'AS', orgCode: null, roleCode: 'User' }),
        acct({ accountId: 'a2', companyCode: 'AS', orgCode: '', loginId: 'AS002', roleCode: 'User' }),
      ],
      fakeResolvers(),
    );
    expect(payload.candidates[0].orgName).toBe('—');
    expect(payload.candidates[1].orgName).toBe('—');
  });

  it('角色：一律顯示 roleCode 對應之顯示名稱（無缺值分支，roleCode 必填）', async () => {
    const payload = await buildCandidatePayload(
      'a@hfcfinance.com.tw',
      '王小明',
      [acct({ accountId: 'a1', companyCode: 'AS', roleCode: 'ICSOPAdmin' })],
      fakeResolvers(),
    );
    expect(payload.candidates[0].roleName).toBe('ICSOP 管理員');
  });

  it('員工編號：一律顯示 loginId 原值（無缺值分支）', async () => {
    const payload = await buildCandidatePayload(
      'a@hfcfinance.com.tw',
      '王小明',
      [acct({ accountId: 'a1', companyCode: 'AS', roleCode: 'User', loginId: 'AS00777' })],
      fakeResolvers(),
    );
    expect(payload.candidates[0].loginId).toBe('AS00777');
  });

  it('🔴 全域禁止：任何情況下輸出不得含 undefined／null／NaN／[object Object] 等字樣', async () => {
    const payload = await buildCandidatePayload(
      'a@hfcfinance.com.tw',
      '王小明',
      [
        acct({
          accountId: 'a1',
          companyCode: undefined as unknown as string,
          orgCode: undefined,
          roleCode: undefined,
          loginId: 'AS001',
        }),
      ],
      fakeResolvers({
        companyName: () => null,
        orgName: async () => null,
        roleName: () => '',
      }),
    );
    // 🔴 僅檢查「顯示欄」（companyName/orgName/roleName/loginId）本身之字面值——`orgCode` 原始
    // 欄依契約本就容許 `null`（見 AC-M12 之型別），JSON 序列化含 `"orgCode":null` 是合法資料，
    // 不屬於本條「畫面字樣」之禁止範圍；混入原始欄一併掃描會誤判合法的 null 型別為缺陷。
    const row = payload.candidates[0];
    const displayFields = [row.companyName, row.orgName, row.roleName, row.loginId];
    for (const field of displayFields) {
      expect(field).not.toBe('undefined');
      expect(field).not.toBe('null');
      expect(field).not.toBe('NaN');
      expect(field).not.toBe('[object Object]');
      expect(typeof field).toBe('string');
    }
  });
});

describe('AC-M15 每一列必可辨識——companyCode/orgCode/roleCode 皆相同時仍以 loginId 區分', () => {
  it('兩筆重複組合輸出兩個不同的 row，各自保有自己的 loginId', async () => {
    const payload = await buildCandidatePayload(
      'a@hfcfinance.com.tw',
      '王小明',
      [
        acct({ accountId: 'a1', companyCode: 'AS', orgCode: 'JAC00', roleCode: 'User', loginId: 'AS001' }),
        acct({ accountId: 'a2', companyCode: 'AS', orgCode: 'JAC00', roleCode: 'User', loginId: 'AS002' }),
      ],
      fakeResolvers(),
    );
    expect(payload.candidates).toHaveLength(2);
    const loginIds = payload.candidates.map((c: { loginId: string }) => c.loginId);
    expect(new Set(loginIds).size).toBe(2);
    expect(loginIds.sort()).toEqual(['AS001', 'AS002']);
  });
});
