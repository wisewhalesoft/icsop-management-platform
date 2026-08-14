import { AccountsService } from './accounts.service';
import {
  AccountStore,
  AccountListFilters,
  AccountView,
  AccountRecord,
  CreateAccountInput,
  UpdateAccountPatch,
} from './accounts.store';
import { OrgUnitReadStore, OrgUnitRecord } from '../org-directory/org-unit-read';
import {
  JobTitleReadStore,
  JobTitleRecord,
} from '../org-directory/job-title-directory';

/**
 * F003 手動帳號基本資料 delta（姓名／公司／部門／職位；2026-08-14 使用者直接裁定）。
 * 規格權威：docs/specs/features/F003-account-role-management.md#manual-account-profile（AC-P1～AC-P22）
 * 錯誤碼：docs/specs/error-handling.md#account-profile
 *
 * 獨立於 accounts.service.spec.ts 另開一檔（沿用其 FakeStore／fakeOrgUnits 慣例，非另建一套）：
 * 本檔斷言之欄位（name／companyCode／orgCode／jobTitleCode 於 CreateAccountInput／UpdateAccountPatch）
 * 為本 delta 新增之 DTO 契約，實作前 ts-jest 可能整檔編譯失敗（缺欄位）——與既有 accounts.service.spec.ts
 * 分檔可確保既有 15+ 案例之編譯/執行不受本檔紅燈拖累。
 *
 * ✅ 2026-08-14 task #6（spec-writer「修訂 AC：公司別可跨公司選擇」）已定案並落地：AC-P5／AC-P10
 * 由「拒絕跨公司」反轉為「允許跨公司（限 SELECTABLE_COMPANIES）」，並新增 AC-P10a（碰撞保護）／
 * AC-P10b（換公司須同請求重給 orgCode／jobTitleCode）／AC-P23～AC-P27（清單跨公司可見、loginId
 * 全域唯一、登入解析、部門候選為空、回歸護欄）。本檔已依新版 AC 撰寫（見下方各 describe）。
 * SELECTABLE_COMPANIES 之具體內容（AS／AE 有效，AC／ZZ 等無效）直接取自 spec 文字本身
 * （error-handling.md#account-profile／F003 AC-P15「本輪內容」列舉），非讀取
 * backend/src/org-directory/company-name.ts 得知——本檔全程未開啟該檔。
 *
 * AC-P24（loginId 全域唯一）與 AC-P23a／b／c（清單跨公司可見＋篩選＋公司名稱逐列解析）刻意移至
 * backend/test/int/account-profile.itest.ts：前者因 AccountStore.existsLoginId 現行簽章以
 * companyCode 為範圍，「全域」之新實作可能改變呼叫慣例（改變參數/新增方法皆有可能），於 FakeStore
 * 猜測介面形狀風險高於待驗證之業務規則本身；後者需要「兩間公司各有帳號」之真實情境，真 DB 較不易
 * 誤判。AC-P25／F001 AC-C1～AC-C3（登入頁跨公司解析）已於 backend/test/int/auth.itest.ts 與
 * frontend/src/pages/LoginPage.test.tsx 覆蓋（team-lead 2026-08-14 確認在原指派範圍內）。
 *
 * ✅ 2026-08-14 第三輪（team-lead 明確要求後修正）：AC-P23d（部門逐列解析）／AC-P23e（職位逐列
 * 解析）改在**本檔**（unit 層）補齊——先前誤判「真實 DB 缺乏爭議資料」為封鎖理由，但 team-lead
 * 指出這是 service 之純邏輯（拿哪個 companyCode 去查主檔），FakeStore 可任意種入合成資料、不受
 * 真實 SOP DB 現況限制，與「AC-P23a 清單跨公司可見」（需要真實情境，見上段）是兩個不同性質的問題，
 * 不應混為一談。見下方 `listAccounts 富化 — AC-P23d／AC-P23e` 區塊：其 `MultiCompanyStore.list()`
 * 覆寫為「忽略 companyCode 參數」，直接編碼 AC-P23a 之最終決議（清單不再以操作者公司過濾）——
 * AC-P23a 本身（過濾移除）已由 int 層真實 HTTP 端點驗證，此處只借用該行為以取得跨公司列，藉此
 * **獨立**測試 AC-P23d／AC-P23e 之逐列解析邏輯本身。AC-P23e 之 fixture 特意讓 AS／AE 兩公司**皆**
 * 有 `C01` 代碼（僅名稱不同，逐字沿用 prototype 08 :409/:419 之樣本），使既有跨公司 fallback
 * 機制對此案例完全不介入（精確命中一定先於 fallback 觸發）——team-lead 點出的關鍵設計，先前
 * 誤判為「fallback 無可避免地會掩蓋錯誤」，實則只要兩公司皆有精確命中，fallback 從不會被觸發。
 *
 * AC-P1「passwordHash 不出現於回應」與 AC-P14／AC-P15／AC-P20／AC-P21（端點存在性／權限／
 * 稽核靜默）需要真實 HTTP 管線（FakeStore 直接回傳 seed 物件、不做欄位過濾，於此測會是重言式
 * 斷言）——移至 backend/test/int/account-profile.itest.ts 以真 app＋真 DB 驗證。
 */

class FakeStore implements AccountStore {
  seq = 1;
  rows: (AccountRecord & { passwordHash: string | null })[] = [];

  seed(over: Partial<AccountRecord & { passwordHash: string | null }>): AccountRecord {
    const rec = {
      id: `id-${this.seq++}`,
      companyCode: 'AS',
      loginId: 'L1',
      employeeNo: null,
      name: null,
      email: null,
      orgCode: null,
      jobTitleCode: null,
      roleCode: 'User',
      status: 'active',
      source: 'upstream',
      disableReason: null,
      lastLoginAt: null,
      passwordHash: null,
      ...over,
    };
    this.rows.push(rec);
    return rec;
  }

  list(companyCode: string, f: AccountListFilters): Promise<AccountView[]> {
    return Promise.resolve(
      this.rows.filter(
        (r) =>
          r.companyCode === companyCode &&
          (!f.source || r.source === f.source) &&
          (!f.roleCode || r.roleCode === f.roleCode) &&
          (!f.status || r.status === f.status),
      ),
    );
  }
  findById(id: string): Promise<AccountRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  existsLoginId(companyCode: string, loginId: string): Promise<boolean> {
    return Promise.resolve(
      this.rows.some((r) => r.companyCode === companyCode && r.loginId === loginId),
    );
  }
  create(input: CreateAccountInput): Promise<AccountView> {
    const rec = this.seed({ ...input, source: 'manual', status: 'active' });
    return Promise.resolve(rec);
  }
  updateById(id: string, patch: UpdateAccountPatch): Promise<AccountView> {
    const rec = this.rows.find((r) => r.id === id)!;
    Object.assign(rec, patch);
    return Promise.resolve(rec);
  }
}

const ACTOR = { companyCode: 'AS', loginId: 'AS22455' };

function fakeOrgUnits(units: OrgUnitRecord[]): OrgUnitReadStore {
  const byCode = new Map(units.map((u) => [u.orgCode, u]));
  return {
    findByOrgCode: (orgCode: string) => Promise.resolve(byCode.get(orgCode) ?? null),
    listByCompany: (companyCode: string) =>
      Promise.resolve(units.filter((u) => u.companyCode === companyCode)),
  };
}

function fakeJobTitles(rows: JobTitleRecord[]): JobTitleReadStore {
  return { listAll: () => Promise.resolve(rows) };
}

const orgUnit = (over: Partial<OrgUnitRecord>): OrgUnitRecord => ({
  companyCode: 'AS',
  orgCode: 'ASA00',
  codePrefix: 'ASA00',
  parentCode: 'AS000',
  tier: 'SECTION',
  name: '審查室',
  descFull: '營運管理部審查室',
  managerEmpNo: null,
  isActive: true,
  ...over,
});

/**
 * AC-P1～AC-P22 之目標 payload 形狀（本 delta 新增 4 欄）。現行 `CreateManualInput`／
 * `UpdateAccountPatch`（`AccountsService.createManual`／`updateAccount` 之實際參數型別，經
 * tsc 探測得知尚無 name/companyCode/orgCode/jobTitleCode）尚未收納此形狀，故以型別轉型
 * 繞過編譯期檢查——實作完成後轉型仍安全（結構相容），可維持不動或移除。
 * 探測手法對應 memory verify-by-running.md「以 tsc 探測欄位是否存在」之慣例，非讀production碼得知。
 */
type ManualCreatePayload = {
  loginId: string;
  password: string;
  roleCode: string;
  name?: string | null;
  companyCode?: string;
  orgCode?: string | null;
  jobTitleCode?: string | null;
};
type ManualUpdatePayload = {
  name?: string | null;
  password?: string;
  companyCode?: string;
  orgCode?: string | null;
  jobTitleCode?: string | null;
};

describe('AccountsService — F003 手動帳號基本資料 delta', () => {
  let store: FakeStore;
  let svc: AccountsService;
  const createManual = (payload: ManualCreatePayload): ReturnType<AccountsService['createManual']> =>
    svc.createManual(
      'AS',
      payload as unknown as Parameters<AccountsService['createManual']>[1],
    );
  const updateAccount = (
    id: string,
    payload: ManualUpdatePayload,
  ): ReturnType<AccountsService['updateAccount']> =>
    svc.updateAccount(id, payload as unknown as Parameters<AccountsService['updateAccount']>[1]);

  const ORG_UNITS: OrgUnitRecord[] = [
    orgUnit({ orgCode: 'ASA00', tier: 'SECTION', name: '審查室', isActive: true }),
    // AC-P6：下拉候選僅列 active，但寫入驗證刻意不檢查 isActive——此列供正面案例使用。
    orgUnit({ orgCode: 'ASB00', tier: 'SECTION', name: '停用室', isActive: false }),
  ];
  const JOB_TITLES: JobTitleRecord[] = [
    { companyCode: 'AS', code: 'D01', name: '經理' },
    // AC-P7：僅存在於他公司（AD），驗證寫入驗證不做跨公司 fallback（與列表富化端不對稱）。
    { companyCode: 'AD', code: 'C00', name: '資深協理' },
  ];

  beforeEach(() => {
    store = new FakeStore();
    svc = new AccountsService(store, fakeOrgUnits(ORG_UNITS), fakeJobTitles(JOB_TITLES));
  });

  describe('createManual — AC-P1～AC-P8', () => {
    it('AC-P1 建立 payload 契約：回傳正規化後之 name／orgCode／jobTitleCode，source=manual／status=active／userSubtype=other（AC-U3 不變）', async () => {
      const v = await createManual({
        loginId: '30001',
        password: 'Init@2026',
        roleCode: 'User',
        name: '測試員',
        orgCode: 'ASA00',
        jobTitleCode: 'D01',
      });
      expect(v.name).toBe('測試員');
      expect(v.orgCode).toBe('ASA00');
      expect((v as unknown as { jobTitleCode?: string | null }).jobTitleCode).toBe('D01');
      expect(v.source).toBe('manual');
      expect(v.status).toBe('active');
      expect((v as unknown as { userSubtype?: string }).userSubtype).toBe('other');
    });

    it('AC-P2 正規化：name 前後 trim；orgCode／jobTitleCode 為純空白或空字串 → null（空字串不得落地）', async () => {
      const v = await createManual({
        loginId: '30002',
        password: 'x',
        roleCode: 'User',
        name: '  張三  ',
        orgCode: '   ',
        jobTitleCode: '',
      });
      expect(v.name).toBe('張三');
      expect(v.orgCode).toBeNull();
      expect((v as unknown as { jobTitleCode?: string | null }).jobTitleCode).toBeNull();
      const rec = store.rows.find((r) => r.loginId === '30002')!;
      expect(rec.orgCode).toBeNull();
      expect((rec as unknown as { jobTitleCode: string | null }).jobTitleCode).toBeNull();
    });

    it.each([
      ['未提供', undefined],
      ['為 null', null],
      ['trim 後為空字串', '   '],
    ])('AC-P3 姓名必填：name %s → VALIDATION_ERROR，不建立任何帳號', async (_label, name) => {
      const before = store.rows.length;
      await expect(
        createManual({
          loginId: '30003',
          password: 'x',
          roleCode: 'User',
          name: name as unknown as string,
        }),
      ).rejects.toThrow('VALIDATION_ERROR');
      expect(store.rows.length).toBe(before);
    });

    it('AC-P4 姓名 trim 後長度 > 30 → VALIDATION_ERROR', async () => {
      await expect(
        createManual({
          loginId: '30004',
          password: 'x',
          roleCode: 'User',
          name: 'A'.repeat(31),
        }),
      ).rejects.toThrow('VALIDATION_ERROR');
    });

    it('AC-P4 orgCode 長度 > 10 → VALIDATION_ERROR', async () => {
      await expect(
        createManual({
          loginId: '30005',
          password: 'x',
          roleCode: 'User',
          name: 'X',
          orgCode: 'A'.repeat(11),
        }),
      ).rejects.toThrow('VALIDATION_ERROR');
    });

    it('AC-P4 jobTitleCode 長度 > 10 → VALIDATION_ERROR', async () => {
      await expect(
        createManual({
          loginId: '30006',
          password: 'x',
          roleCode: 'User',
          name: 'X',
          jobTitleCode: 'A'.repeat(11),
        }),
      ).rejects.toThrow('VALIDATION_ERROR');
    });

    it('AC-P4 companyCode 長度 > 10 → VALIDATION_ERROR', async () => {
      await expect(
        createManual({
          loginId: '30007',
          password: 'x',
          roleCode: 'User',
          name: 'X',
          companyCode: 'A'.repeat(11),
        }),
      ).rejects.toThrow('VALIDATION_ERROR');
    });

    it('AC-P5 未提供 companyCode → 以操作者 session 之 companyCode 寫入', async () => {
      const v = await createManual({
        loginId: '30007b',
        password: 'x',
        roleCode: 'User',
        name: 'X',
      });
      expect((v as unknown as { companyCode?: string }).companyCode).toBe('AS');
    });

    it('AC-P5（🔵 2026-08-14 反轉：允許跨公司）companyCode=AE（存在於 SELECTABLE_COMPANIES 但≠操作者所屬公司）→ 正常建立', async () => {
      const v = await createManual({
        loginId: '30007c',
        password: 'x',
        roleCode: 'User',
        name: 'X',
        companyCode: 'AE',
      });
      expect((v as unknown as { companyCode?: string }).companyCode).toBe('AE');
    });

    it('AC-P5 companyCode 不存在於 SELECTABLE_COMPANIES（如 ZZ）→ 400 ACCOUNT_COMPANY_CODE_INVALID，不建立', async () => {
      const before = store.rows.length;
      await expect(
        createManual({
          loginId: '30007d',
          password: 'x',
          roleCode: 'User',
          name: 'X',
          companyCode: 'ZZ',
        }),
      ).rejects.toThrow('ACCOUNT_COMPANY_CODE_INVALID');
      expect(store.rows.length).toBe(before);
    });

    it('AC-P5 companyCode=AC（明確排除之已結束公司，見 F003 AC-P15「本輪內容」）→ 400 ACCOUNT_COMPANY_CODE_INVALID', async () => {
      await expect(
        createManual({
          loginId: '30007e',
          password: 'x',
          roleCode: 'User',
          name: 'X',
          companyCode: 'AC',
        }),
      ).rejects.toThrow('ACCOUNT_COMPANY_CODE_INVALID');
    });

    it('AC-P6 orgCode 不存在於該公司之 ORG_UNIT → ACCOUNT_ORG_CODE_INVALID', async () => {
      await expect(
        createManual({
          loginId: '30008',
          password: 'x',
          roleCode: 'User',
          name: 'X',
          orgCode: 'ZZZ99',
        }),
      ).rejects.toThrow('ACCOUNT_ORG_CODE_INVALID');
    });

    it('AC-P6（刻意不檢查 isActive）：orgCode 對應之 ORG_UNIT 為 isActive=false 仍可寫入', async () => {
      const v = await createManual({
        loginId: '30009',
        password: 'x',
        roleCode: 'User',
        name: 'X',
        orgCode: 'ASB00',
      });
      expect(v.orgCode).toBe('ASB00');
    });

    it('AC-P7 jobTitleCode 不存在於 (companyCode, code) → ACCOUNT_JOB_TITLE_INVALID', async () => {
      await expect(
        createManual({
          loginId: '30010',
          password: 'x',
          roleCode: 'User',
          name: 'X',
          jobTitleCode: 'ZZZ',
        }),
      ).rejects.toThrow('ACCOUNT_JOB_TITLE_INVALID');
    });

    it('AC-P7（不做跨公司 fallback）：jobTitleCode 僅存在於他公司（AD/C00）→ 仍 ACCOUNT_JOB_TITLE_INVALID', async () => {
      await expect(
        createManual({
          loginId: '30011',
          password: 'x',
          roleCode: 'User',
          name: 'X',
          jobTitleCode: 'C00',
        }),
      ).rejects.toThrow('ACCOUNT_JOB_TITLE_INVALID');
    });

    describe('AC-P8 驗證順序（②角色 → ③公司 → ④部門 → ⑤職位 → ⑥帳號唯一性，固定不可調換）', () => {
      it('角色非法 + 公司非法 + 部門非法 + 職位非法 + 帳號重複 → 僅回 ROLE_INVALID（既有②優先，不受本 delta 影響）', async () => {
        store.seed({ loginId: '30012', companyCode: 'AS' });
        await expect(
          createManual({
            loginId: '30012',
            password: 'x',
            roleCode: 'Root',
            name: 'X',
            companyCode: 'ZZ',
            orgCode: 'ZZZ99',
            jobTitleCode: 'ZZZ',
          }),
        ).rejects.toThrow('ROLE_INVALID');
      });

      it('角色合法 + 公司非法 + 部門非法 + 職位非法 + 帳號重複 → 僅回 ACCOUNT_COMPANY_CODE_INVALID（③先於④⑤⑥，插入既有②⑥之間）', async () => {
        store.seed({ loginId: '30012b', companyCode: 'AS' });
        await expect(
          createManual({
            loginId: '30012b',
            password: 'x',
            roleCode: 'User',
            name: 'X',
            companyCode: 'ZZ',
            orgCode: 'ZZZ99',
            jobTitleCode: 'ZZZ',
          }),
        ).rejects.toThrow('ACCOUNT_COMPANY_CODE_INVALID');
      });

      it('角色合法 + 公司合法 + 部門非法 + 職位非法 + 帳號重複 → 僅回 ACCOUNT_ORG_CODE_INVALID（④先於⑤⑥）', async () => {
        store.seed({ loginId: '30013', companyCode: 'AS' });
        await expect(
          createManual({
            loginId: '30013',
            password: 'x',
            roleCode: 'User',
            name: 'X',
            orgCode: 'ZZZ99',
            jobTitleCode: 'ZZZ',
          }),
        ).rejects.toThrow('ACCOUNT_ORG_CODE_INVALID');
      });

      it('角色合法 + 公司合法 + 部門合法 + 職位非法 + 帳號重複 → 僅回 ACCOUNT_JOB_TITLE_INVALID（⑤先於⑥）', async () => {
        store.seed({ loginId: '30014', companyCode: 'AS' });
        await expect(
          createManual({
            loginId: '30014',
            password: 'x',
            roleCode: 'User',
            name: 'X',
            orgCode: 'ASA00',
            jobTitleCode: 'ZZZ',
          }),
        ).rejects.toThrow('ACCOUNT_JOB_TITLE_INVALID');
      });

      it('全部欄位合法但帳號重複 → 回 ACCOUNT_USERNAME_EXISTS（⑥基準不受影響）', async () => {
        store.seed({ loginId: '30015', companyCode: 'AS' });
        await expect(
          createManual({
            loginId: '30015',
            password: 'x',
            roleCode: 'User',
            name: 'X',
            orgCode: 'ASA00',
            jobTitleCode: 'D01',
          }),
        ).rejects.toThrow('ACCOUNT_USERNAME_EXISTS');
      });
    });
  });

  describe('updateAccount — AC-P9／AC-P10／AC-P11／AC-P12', () => {
    it('AC-P9 欄位缺席 → 不變更（name／orgCode／jobTitleCode 皆維持原值）', async () => {
      const a = store.seed({
        loginId: 'E1',
        source: 'manual',
        name: '原名',
        orgCode: 'ASA00',
        jobTitleCode: 'D01',
      });
      const v = await updateAccount(a.id, { password: 'New@2026' });
      expect(v.name).toBe('原名');
      expect(v.orgCode).toBe('ASA00');
      expect((v as unknown as { jobTitleCode?: string | null }).jobTitleCode).toBe('D01');
    });

    it('AC-P9 orgCode／jobTitleCode 明確傳 null → 清空', async () => {
      const a = store.seed({
        loginId: 'E2',
        source: 'manual',
        orgCode: 'ASA00',
        jobTitleCode: 'D01',
      });
      const v = await updateAccount(a.id, { orgCode: null, jobTitleCode: null });
      expect(v.orgCode).toBeNull();
      expect((v as unknown as { jobTitleCode?: string | null }).jobTitleCode).toBeNull();
    });

    it('AC-P9 name 傳空白字串 → VALIDATION_ERROR（姓名不可清空）', async () => {
      const a = store.seed({ loginId: 'E3', source: 'manual', name: '原名' });
      await expect(updateAccount(a.id, { name: '   ' })).rejects.toThrow('VALIDATION_ERROR');
    });

    it('AC-P9 name 傳 null → VALIDATION_ERROR（姓名不可清空）', async () => {
      const a = store.seed({ loginId: 'E3b', source: 'manual', name: '原名' });
      await expect(
        updateAccount(a.id, { name: null as unknown as string }),
      ).rejects.toThrow('VALIDATION_ERROR');
    });

    it('AC-P9 orgCode／jobTitleCode 長度超限 → VALIDATION_ERROR（AC-P4 於編輯亦適用）', async () => {
      const a = store.seed({ loginId: 'E3c', source: 'manual' });
      await expect(
        updateAccount(a.id, { orgCode: 'A'.repeat(11) }),
      ).rejects.toThrow('VALIDATION_ERROR');
    });

    it('AC-P9 orgCode 不存在於 ORG_UNIT → ACCOUNT_ORG_CODE_INVALID（AC-P6 於編輯亦適用）', async () => {
      const a = store.seed({ loginId: 'E3d', source: 'manual' });
      await expect(
        updateAccount(a.id, { orgCode: 'ZZZ99' }),
      ).rejects.toThrow('ACCOUNT_ORG_CODE_INVALID');
    });

    it('AC-P9 jobTitleCode 不存在於 (companyCode, code) → ACCOUNT_JOB_TITLE_INVALID（AC-P7 於編輯亦適用）', async () => {
      const a = store.seed({ loginId: 'E3e', source: 'manual' });
      await expect(
        updateAccount(a.id, { jobTitleCode: 'ZZZ' }),
      ).rejects.toThrow('ACCOUNT_JOB_TITLE_INVALID');
    });

    describe('AC-P10／AC-P10a／AC-P10b（🔵 2026-08-14 反轉：manual 帳號編輯可變更公司）', () => {
      it('AC-P10 companyCode 變更為 SELECTABLE_COMPANIES 內之值（同請求一併給定 orgCode/jobTitleCode）→ 允許變更', async () => {
        const a = store.seed({
          loginId: 'F1',
          source: 'manual',
          companyCode: 'AS',
          orgCode: 'ASA00',
          jobTitleCode: 'D01',
        });
        const v = await updateAccount(a.id, { companyCode: 'AE', orgCode: null, jobTitleCode: null });
        expect((v as unknown as { companyCode?: string }).companyCode).toBe('AE');
      });

      it('AC-P10 companyCode 不存在於 SELECTABLE_COMPANIES → 400 ACCOUNT_COMPANY_CODE_INVALID', async () => {
        const a = store.seed({ loginId: 'F2', source: 'manual', companyCode: 'AS' });
        await expect(
          updateAccount(a.id, { companyCode: 'ZZ', orgCode: null, jobTitleCode: null }),
        ).rejects.toThrow('ACCOUNT_COMPANY_CODE_INVALID');
      });

      it('AC-P10 companyCode 等於現值 → no-op（不報錯、不需一併給定 orgCode/jobTitleCode）', async () => {
        const a = store.seed({ loginId: 'F3', source: 'manual', companyCode: 'AS', name: '原名' });
        const v = await updateAccount(a.id, { companyCode: 'AS' });
        expect((v as unknown as { companyCode?: string }).companyCode).toBe('AS');
        expect(v.name).toBe('原名');
      });

      it('AC-P10a 變更後之 (companyCode, loginId) 已為他帳號佔用 → 409 ACCOUNT_USERNAME_EXISTS，不寫入任何欄位', async () => {
        store.seed({ loginId: 'F4', companyCode: 'AE' }); // 佔用目標 (companyCode, loginId)
        const a = store.seed({
          loginId: 'F4',
          companyCode: 'AS',
          source: 'manual',
          orgCode: 'ASA00',
        });
        await expect(
          updateAccount(a.id, { companyCode: 'AE', orgCode: null, jobTitleCode: null }),
        ).rejects.toThrow('ACCOUNT_USERNAME_EXISTS');
        const rec = store.rows.find((r) => r.id === a.id)!;
        expect(rec.companyCode).toBe('AS'); // 未寫入，原值保留
      });

      it('AC-P10b 變更 companyCode 但未同時提供 orgCode → 400 VALIDATION_ERROR，不寫入任何欄位', async () => {
        const a = store.seed({
          loginId: 'F5',
          source: 'manual',
          companyCode: 'AS',
          orgCode: 'ASA00',
          jobTitleCode: 'D01',
        });
        await expect(
          updateAccount(a.id, { companyCode: 'AE', jobTitleCode: null }),
        ).rejects.toThrow('VALIDATION_ERROR');
        const rec = store.rows.find((r) => r.id === a.id)!;
        expect(rec.companyCode).toBe('AS');
      });

      it('AC-P10b 變更 companyCode 但未同時提供 jobTitleCode → 400 VALIDATION_ERROR', async () => {
        const a = store.seed({ loginId: 'F6', source: 'manual', companyCode: 'AS' });
        await expect(
          updateAccount(a.id, { companyCode: 'AE', orgCode: null }),
        ).rejects.toThrow('VALIDATION_ERROR');
      });

      it('AC-P10b 變更 companyCode 且兩者皆已明確提供（含皆為 null）→ 依新 companyCode 驗證後允許', async () => {
        const a = store.seed({ loginId: 'F7', source: 'manual', companyCode: 'AS' });
        const v = await updateAccount(a.id, { companyCode: 'AE', orgCode: null, jobTitleCode: null });
        expect((v as unknown as { companyCode?: string }).companyCode).toBe('AE');
        expect(v.orgCode).toBeNull();
      });
    });

    it('AC-P11 上游帳號：companyCode 縱使等於現值，仍視為上游欄位而拒絕（不視為 no-op）', async () => {
      const a = store.seed({ loginId: 'E5b', source: 'upstream', companyCode: 'AS' });
      await expect(updateAccount(a.id, { companyCode: 'AS' })).rejects.toThrow(
        'ACCOUNT_UPSTREAM_READONLY',
      );
    });

    it('AC-P11 上游帳號唯讀先於值驗證：即使 payload 同時違反長度上限與部門有效性，仍回 ACCOUNT_UPSTREAM_READONLY', async () => {
      const a = store.seed({ loginId: 'E4', source: 'upstream', name: '原名' });
      await expect(
        updateAccount(a.id, { name: 'A'.repeat(31), orgCode: 'ZZZ99' }),
      ).rejects.toThrow('ACCOUNT_UPSTREAM_READONLY');
    });

    it('AC-P11 上游帳號明確傳 null 之清空意圖仍拒絕（不寫入任何欄位）', async () => {
      const a = store.seed({ loginId: 'E5', source: 'upstream', orgCode: 'ASA00' });
      await expect(updateAccount(a.id, { orgCode: null })).rejects.toThrow(
        'ACCOUNT_UPSTREAM_READONLY',
      );
      const rec = store.rows.find((r) => r.id === a.id)!;
      expect(rec.orgCode).toBe('ASA00'); // 未寫入，原值保留
    });

    it('AC-P11 角色指派（assignRole）不受上游唯讀限制', async () => {
      const a = store.seed({ loginId: 'E6', source: 'upstream', roleCode: 'User' });
      const v = await svc.assignRole(a.id, ACTOR, 'Supervisor');
      expect(v.roleCode).toBe('Supervisor');
    });

    it('AC-P11 啟用狀態（setStatus）不受上游唯讀限制', async () => {
      const a = store.seed({ loginId: 'E7', source: 'upstream', status: 'active' });
      await svc.setStatus(a.id, 'disabled');
      const rec = store.rows.find((r) => r.id === a.id)!;
      expect(rec.status).toBe('disabled');
    });

    it('AC-P12 副作用邊界：合法 payload 更新後，roleCode／userSubtype／status／source／loginId／companyCode 不受影響', async () => {
      const a = store.seed({
        loginId: 'E8',
        source: 'manual',
        roleCode: 'User',
        status: 'active',
        companyCode: 'AS',
        name: '原名',
      });
      (a as unknown as { userSubtype: string }).userSubtype = 'business';
      const v = await updateAccount(a.id, { name: '新名' });
      expect(v.roleCode).toBe('User');
      expect((v as unknown as { userSubtype?: string }).userSubtype).toBe('business');
      expect(v.status).toBe('active');
      expect(v.source).toBe('manual');
      expect(v.loginId).toBe('E8');
      expect((v as unknown as { companyCode?: string }).companyCode).toBe('AS');
    });
  });

  /**
   * AC-P23d／AC-P23e（逐列解析，unit 層；2026-08-14 team-lead 要求後由 int-only 改為在此補齊）。
   * MultiCompanyStore.list() 忽略 companyCode 參數（見檔頭註解，直接編碼 AC-P23a 之最終決議）。
   */
  describe('listAccounts 富化 — AC-P23d／AC-P23e（逐列解析，不得沿用操作者公司）', () => {
    class MultiCompanyStore extends FakeStore {
      list(_companyCode: string, f: AccountListFilters): Promise<AccountView[]> {
        return Promise.resolve(
          this.rows.filter(
            (r) =>
              (!f.source || r.source === f.source) &&
              (!f.roleCode || r.roleCode === f.roleCode) &&
              (!f.status || r.status === f.status),
          ),
        );
      }
    }

    it('AC-P23d 部門名稱以 (companyCode, orgCode) 複合鍵解析：AS 與 AE 有相同 orgCode 但不同單位，兩列不得互相污染', async () => {
      const mstore = new MultiCompanyStore();
      mstore.seed({ loginId: 'M1', companyCode: 'AS', orgCode: 'X0000' });
      mstore.seed({ loginId: 'M2', companyCode: 'AE', orgCode: 'X0000' });
      const multiOrgUnits: OrgUnitRecord[] = [
        orgUnit({ companyCode: 'AS', orgCode: 'X0000', tier: 'DEPARTMENT', name: '甲部門' }),
        orgUnit({ companyCode: 'AE', orgCode: 'X0000', tier: 'DEPARTMENT', name: '乙部門' }),
      ];
      const svc2 = new AccountsService(mstore, fakeOrgUnits(multiOrgUnits), fakeJobTitles([]));
      const rows = await svc2.listAccounts('AS', {});
      const asRow = rows.find((r) => r.loginId === 'M1')!;
      const aeRow = rows.find((r) => r.loginId === 'M2')!;
      expect(asRow.department).toBe('甲部門');
      expect(aeRow.department).toBe('乙部門');
      expect(aeRow.department).not.toBe(asRow.department);
    });

    it('AC-P23e 職位名稱以該列自身之 companyCode 解析（不得傳操作者公司）：AS／AE 皆有 C01 代碼但不同名稱（逐字取自 prototype 08 :409/:419），精確命中恆先於跨公司 fallback，fallback 無從掩蓋誤植', async () => {
      const mstore = new MultiCompanyStore();
      mstore.seed({ loginId: 'M3', companyCode: 'AS', jobTitleCode: 'C01' });
      mstore.seed({ loginId: 'M4', companyCode: 'AE', jobTitleCode: 'C01' });
      const multiJobTitles: JobTitleRecord[] = [
        { companyCode: 'AS', code: 'C01', name: '協理' }, // prototype 08 :409
        { companyCode: 'AE', code: 'C01', name: '高級協理' }, // prototype 08 :419（同碼異名）
      ];
      const svc2 = new AccountsService(mstore, fakeOrgUnits([]), fakeJobTitles(multiJobTitles));
      const rows = await svc2.listAccounts('AS', {});
      const asRow = rows.find((r) => r.loginId === 'M3')!;
      const aeRow = rows.find((r) => r.loginId === 'M4')!;
      expect(asRow.title).toBe('協理');
      expect(aeRow.title).toBe('高級協理');
      expect(aeRow.title).not.toBe(asRow.title);
    });
  });

  /**
   * AC-P6 之公司交叉檢查補強（2026-08-14 撰寫 AC-P23d 時發現之既有缺口）：先前 AC-P6 測試僅用
   * 單一公司（AS）之 ORG_UNIT 與同公司帳號，從未驗證過「orgCode 存在、但屬於另一公司」之情境
   * ——僅測過「orgCode 完全不存在」（ZZZ99）。AC-P6 原文明確要求 orgCode 與 companyCode 需
   * 同時滿足，此為該複合條件之另一半，過去遺漏。
   */
  describe('createManual — AC-P6 公司交叉檢查補強', () => {
    it('AC-P6 orgCode 存在但屬於另一公司（非該帳號之 companyCode）→ 仍 ACCOUNT_ORG_CODE_INVALID', async () => {
      const crossOrgUnits: OrgUnitRecord[] = [
        orgUnit({ companyCode: 'AE', orgCode: 'X0000', tier: 'DEPARTMENT', name: 'AE部門' }),
      ];
      const svc2 = new AccountsService(store, fakeOrgUnits(crossOrgUnits), fakeJobTitles([]));
      await expect(
        svc2.createManual('AS', {
          loginId: '30016',
          password: 'x',
          roleCode: 'User',
          name: 'X',
          orgCode: 'X0000', // 存在，但僅屬於 AE，本次建立為 AS 帳號
        } as unknown as Parameters<AccountsService['createManual']>[1]),
      ).rejects.toThrow('ACCOUNT_ORG_CODE_INVALID');
    });
  });
});
