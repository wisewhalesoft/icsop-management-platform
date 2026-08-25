/**
 * F001 帳號選擇 delta — 甲節「候選集合之判定」＋乙節「安全前置條件」（`AC-M1`〜`AC-M9`、`AC-M16`、`AC-M28`）。
 *
 * 待實作模組（本檔為其唯一 oracle）：`./multi-account-picker`。純邏輯、零 IO——與既有
 * `account-resolver.ts`／`auth-outcome.ts` 同一設計哲學（純函式、無 Nest DI、可決定性）。
 *
 * 🔴 本檔為**唯一**授權介面之處——若下列型別/函式簽章與實作端想要的不同，實作端須發訊息回報，
 * 由 test-generator（本檔作者）依 AC 裁決是否修訂本檔，實作端不得逕自變更本檔斷言。
 *
 * 契約（本檔要求 `./multi-account-picker` 匯出）：
 *   export interface CandidateAccount {
 *     accountId: string; loginId: string; email: string | null; companyCode: string;
 *     orgCode?: string | null; roleCode?: string; status: 'active' | 'disabled'; name: string | null;
 *   }
 *   export type MultiAccountDecision =
 *     | { kind: 'NotFound' }
 *     | { kind: 'Disabled' }
 *     | { kind: 'SingleActive'; account: CandidateAccount }
 *     | { kind: 'RequiresSelection'; email: string; name: string; candidates: CandidateAccount[] }
 *     | { kind: 'AmbiguousIdentity'; email: string; accounts: CandidateAccount[] };
 *   export function namesConsistent(accounts: readonly CandidateAccount[]): boolean;
 *   // 🔴 2026-08-24 spec-writer 就地改寫 AC-M7 定案：判準僅做「去頭尾空白」＋「大小寫正規化」
 *   //   兩項，其餘一律逐字比對——不忽略內部空白、不做全形/半形轉換、不做同音/相似度比對。
 *   export function sortCandidates(accounts: readonly CandidateAccount[]): CandidateAccount[];
 *   export function decideMultiAccountLogin(
 *     emailClaim: string | null | undefined,
 *     accounts: readonly CandidateAccount[], // 該 emailClaim 下"全部"帳號（含其他 email、含停用）
 *   ): MultiAccountDecision;
 *
 * 權威：docs/specs/features/F001-auth-login-session.md#multi-account-picker `AC-M1`〜`AC-M9`／`AC-M16`／`AC-M28`。
 * 設計文件：docs/test-specs/features/F001-test.md（本 delta 段落）。
 *
 * ⚠ `decideMultiAccountLogin` 之簽章刻意比照既有 `classifyAccountByEmail(emailClaim, accounts)`
 *   （見 account-resolver.ts）——同一組 fixture 可同時驅動兩者，方便驗證 `AC-M1`／`AC-M28` 之
 *   「比對規則逐項不變」。
 */

import {
  CandidateAccount,
  MultiAccountDecision,
  namesConsistent,
  sortCandidates,
  decideMultiAccountLogin,
} from './multi-account-picker';

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

describe('AC-M1 比對規則逐項不變（回歸鎖）', () => {
  it('email 僅大小寫不同 → 視為相符', () => {
    const accs = [acct({ accountId: 'a1', email: 'Peter@HFCFinance.com.tw' })];
    const d = decideMultiAccountLogin('peter@hfcfinance.com.tw', accs);
    expect(d.kind).toBe('SingleActive');
  });

  it('local-part 相同但網域不同 → 視為不相符（NotFound）', () => {
    const accs = [acct({ accountId: 'a1', email: 'peter@other.com.tw' })];
    const d = decideMultiAccountLogin('peter@hfcfinance.com.tw', accs);
    expect(d.kind).toBe('NotFound');
  });

  it('不得 fallback 至其他欄位——email 為 null 之帳號一律不命中', () => {
    const accs = [acct({ accountId: 'a1', email: null })];
    const d = decideMultiAccountLogin('peter@hfcfinance.com.tw', accs);
    expect(d.kind).toBe('NotFound');
  });
});

describe('AC-M2 0／1／多筆之三分支', () => {
  it('N=0 且無任何非 active 帳號 → NotFound', () => {
    const d = decideMultiAccountLogin('nobody@hfcfinance.com.tw', []);
    expect(d).toEqual({ kind: 'NotFound' });
  });

  it('N=0（該 email 僅停用帳號）→ Disabled', () => {
    const accs = [acct({ accountId: 'a1', status: 'disabled' })];
    const d = decideMultiAccountLogin('a@hfcfinance.com.tw', accs);
    expect(d.kind).toBe('Disabled');
  });

  it('N=1 → SingleActive；不得出現候選集合欄位', () => {
    const accs = [acct({ accountId: 'a1' })];
    const d = decideMultiAccountLogin('a@hfcfinance.com.tw', accs) as Extract<
      MultiAccountDecision,
      { kind: 'SingleActive' }
    >;
    expect(d.kind).toBe('SingleActive');
    expect(d.account.accountId).toBe('a1');
    expect((d as unknown as { candidates?: unknown }).candidates).toBeUndefined();
  });

  it('N≥2 且姓名一致 → RequiresSelection（進入登入中繼狀態）', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001' }),
    ];
    const d = decideMultiAccountLogin('a@hfcfinance.com.tw', accs);
    expect(d.kind).toBe('RequiresSelection');
  });
});

describe('AC-M4 候選排序具決定性', () => {
  it('先依 companyCode 升冪，同 companyCode 內再依 loginId 升冪', () => {
    const accs = [
      acct({ accountId: 'x', companyCode: 'AE', loginId: 'Z9' }),
      acct({ accountId: 'y', companyCode: 'AS', loginId: 'B2' }),
      acct({ accountId: 'z', companyCode: 'AS', loginId: 'A1' }),
    ];
    const sorted = sortCandidates(accs);
    // companyCode 升冪：'AE' < 'AS'（字典序）→ x(AE) 先於 y/z(AS)；AS 組內再依 loginId 升冪：z(A1) < y(B2)。
    expect(sorted.map((c: CandidateAccount) => c.accountId)).toEqual(['x', 'z', 'y']);
  });

  it('重複執行順序逐項相同（不得依賴輸入順序／雜湊順序）', () => {
    const accs = [
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001' }),
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001' }),
    ];
    const first = sortCandidates(accs).map((c: CandidateAccount) => c.accountId);
    const reversedInput = sortCandidates([...accs].reverse()).map((c: CandidateAccount) => c.accountId);
    expect(reversedInput).toEqual(first);
    // 多次執行同一輸入亦應相同（防隨機/不穩定排序）。
    expect(sortCandidates(accs).map((c: CandidateAccount) => c.accountId)).toEqual(first);
  });

  it('decideMultiAccountLogin 之 RequiresSelection.candidates 本身已依此排序', () => {
    const accs = [
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001' }),
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001' }),
    ];
    const d = decideMultiAccountLogin('a@hfcfinance.com.tw', accs) as Extract<
      MultiAccountDecision,
      { kind: 'RequiresSelection' }
    >;
    // companyCode 升冪：'AE'(a2) < 'AS'(a1)。
    expect(d.candidates.map((c: CandidateAccount) => c.accountId)).toEqual(['a2', 'a1']);
  });
});

describe('AC-M5 候選集合封閉於該 email', () => {
  it('不得含其他 email 之帳號，即使姓名／部門相同', () => {
    const accs = [
      acct({ accountId: 'a1', email: 'a@hfcfinance.com.tw', companyCode: 'AS', loginId: 'AS001' }),
      acct({
        accountId: 'a2',
        email: 'a@hfcfinance.com.tw',
        companyCode: 'AE',
        loginId: 'AE001',
      }),
      // 不同 email，但姓名相同、部門相同 —— 不得被誤收進候選集合。
      acct({
        accountId: 'other',
        email: 'different@hfcfinance.com.tw',
        companyCode: 'AJ',
        loginId: 'AJ999',
        name: '王小明',
      }),
    ];
    const d = decideMultiAccountLogin('a@hfcfinance.com.tw', accs) as Extract<
      MultiAccountDecision,
      { kind: 'RequiresSelection' }
    >;
    expect(d.kind).toBe('RequiresSelection');
    expect(d.candidates.map((c: CandidateAccount) => c.accountId).sort()).toEqual(['a1', 'a2']);
    expect(d.candidates.some((c: CandidateAccount) => c.accountId === 'other')).toBe(false);
  });
});

describe('AC-M6 🔒 僅 active 進入選單', () => {
  it('3 筆命中、1 筆 disabled → 候選集合為 2 筆，且不含該停用帳號之任何欄位', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001' }),
      acct({
        accountId: 'a3',
        companyCode: 'AJ',
        loginId: 'AJ001',
        status: 'disabled',
        roleCode: 'SECRET_ROLE_SHOULD_NOT_LEAK',
      }),
    ];
    const d = decideMultiAccountLogin('a@hfcfinance.com.tw', accs) as Extract<
      MultiAccountDecision,
      { kind: 'RequiresSelection' }
    >;
    expect(d.kind).toBe('RequiresSelection');
    expect(d.candidates).toHaveLength(2);
    expect(d.candidates.some((c: CandidateAccount) => c.accountId === 'a3')).toBe(false);
    expect(JSON.stringify(d)).not.toContain('SECRET_ROLE_SHOULD_NOT_LEAK');
  });

  it('過濾後恰剩 1 筆 → 依 AC-M2 直接登入，不出選單', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', status: 'disabled' }),
    ];
    const d = decideMultiAccountLogin('a@hfcfinance.com.tw', accs);
    expect(d.kind).toBe('SingleActive');
  });
});

describe('AC-M7 🔒 姓名一致方得顯示選單（fail-closed，判準僅做去頭尾空白＋大小寫正規化兩項，其餘一律逐字比對；2026-08-24 spec-writer 就地改寫定案）', () => {
  it('姓名完全相同 → 進入選單', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: '王小明' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: '王小明' }),
    ];
    expect(decideMultiAccountLogin('a@hfcfinance.com.tw', accs).kind).toBe('RequiresSelection');
  });

  it('僅頭尾空白不同 → 仍視為一致（trim 後比對）', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: '王小明' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: '  王小明  ' }),
    ];
    expect(decideMultiAccountLogin('a@hfcfinance.com.tw', accs).kind).toBe('RequiresSelection');
  });

  it('2026-08-24 定案：僅大小寫不同 → 視為一致（"Peter Lin" vs "PETER LIN"）', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: 'Peter Lin' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: 'PETER LIN' }),
    ];
    expect(decideMultiAccountLogin('a@hfcfinance.com.tw', accs).kind).toBe('RequiresSelection');
  });

  it('2026-08-24 定案：去頭尾空白＋大小寫正規化可疊加（" peter lin " vs "PETER LIN"）', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: ' peter lin ' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: 'PETER LIN' }),
    ];
    expect(decideMultiAccountLogin('a@hfcfinance.com.tw', accs).kind).toBe('RequiresSelection');
  });

  it('🔴 內部空白不同（"王 小明" vs "王小明"）→ 不得視為一致（不得忽略內部空白）', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: '王小明' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: '王 小明' }),
    ];
    expect(decideMultiAccountLogin('a@hfcfinance.com.tw', accs).kind).toBe('AmbiguousIdentity');
  });

  it('🔴 全形／半形差異不得視為等價（不得做全形半形轉換）', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: 'Peter Lin' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: 'Peter　Lin' }), // 全形空格
    ];
    expect(decideMultiAccountLogin('a@hfcfinance.com.tw', accs).kind).toBe('AmbiguousIdentity');
  });

  it('🔴 不得做相似度／同音比對——一字之差即判不一致', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: '王小明' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: '王曉明' }),
    ];
    expect(decideMultiAccountLogin('a@hfcfinance.com.tw', accs).kind).toBe('AmbiguousIdentity');
  });

  it('namesConsistent() 之最小單元行為與上方一致（trim＋大小寫正規化等價，其餘逐字比對）', () => {
    expect(namesConsistent([acct({ accountId: 'a1', name: '王小明' }), acct({ accountId: 'a2', name: ' 王小明 ' })])).toBe(true);
    expect(namesConsistent([acct({ accountId: 'a1', name: '王小明' }), acct({ accountId: 'a2', name: '王 小明' })])).toBe(false);
    expect(namesConsistent([acct({ accountId: 'a1', name: 'Peter Lin' }), acct({ accountId: 'a2', name: 'PETER LIN' })])).toBe(true);
  });
});

describe('AC-M8 🔒 姓名不一致 → 退回既有拒登＋告警（AmbiguousIdentity）', () => {
  it('N≥2 且姓名不一致 → AmbiguousIdentity，攜帶完整候選（供呼叫端組告警內容），非 RequiresSelection', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: '王小明' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: '陳大文' }),
    ];
    const d = decideMultiAccountLogin('a@hfcfinance.com.tw', accs);
    expect(d.kind).toBe('AmbiguousIdentity');
    const amb = d as Extract<MultiAccountDecision, { kind: 'AmbiguousIdentity' }>;
    expect(amb.accounts).toHaveLength(2);
  });
});

describe('AC-M9 🔒 姓名判準只施於候選集合（已停用帳號不參與姓名一致判定）', () => {
  it('停用帳號姓名不同 → 不觸發 AC-M8，仍正常進入選單', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: '王小明' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: '王小明' }),
      acct({
        accountId: 'a3',
        companyCode: 'AJ',
        loginId: 'AJ001',
        name: '完全不同的名字',
        status: 'disabled',
      }),
    ];
    const d = decideMultiAccountLogin('a@hfcfinance.com.tw', accs);
    expect(d.kind).toBe('RequiresSelection');
    const req = d as Extract<MultiAccountDecision, { kind: 'RequiresSelection' }>;
    expect(req.candidates).toHaveLength(2);
  });
});

describe('AC-M16（部分，資料層）不得自動選取——RequiresSelection 不攜帶任何預選欄位', () => {
  it('候選物件不含 selected/preselected/default 等暗示預選之欄位', () => {
    const accs = [
      acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001' }),
      acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001' }),
    ];
    const d = decideMultiAccountLogin('a@hfcfinance.com.tw', accs) as Extract<
      MultiAccountDecision,
      { kind: 'RequiresSelection' }
    >;
    for (const c of d.candidates) {
      expect(c).not.toHaveProperty('selected');
      expect(c).not.toHaveProperty('preselected');
      expect(c).not.toHaveProperty('default');
    }
  });
});

describe('AC-M28 既有 email 比對四條之回歸（與 classifyAccountByEmail 同一組 fixture）', () => {
  it('查無 active 帳號 → NotFound（含只有其他 email 命中的情形）', () => {
    const accs = [acct({ accountId: 'a1', email: 'someone-else@hfcfinance.com.tw' })];
    expect(decideMultiAccountLogin('a@hfcfinance.com.tw', accs).kind).toBe('NotFound');
  });

  it('已停用 → Disabled', () => {
    const accs = [acct({ accountId: 'a1', status: 'disabled' })];
    expect(decideMultiAccountLogin('a@hfcfinance.com.tw', accs).kind).toBe('Disabled');
  });
});
