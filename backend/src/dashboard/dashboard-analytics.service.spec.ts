import { ForbiddenException } from '@nestjs/common';
import * as matrix from '../rbac/function-matrix';
import { OrgUnitRecord } from '../org-directory/org-unit-read';
import { JobPositionRecord } from '../org-directory/job-position-directory';
import { AnalyticsDocRow } from './dashboard-analytics';
import { CategoryDocPair } from './category-distribution';
import {
  AnalyticsSession,
  DashboardAnalyticsService,
  DashboardAnalyticsSources,
} from './dashboard-analytics.service';

/**
 * F044 — 儀表板聚合**服務層**建環（`backend/src/dashboard/dashboard-analytics.service.ts`）。
 *
 * 涵蓋：`AC-G23`（🔴 單一子聚合失敗 ⇒ **省略該鍵**，明文禁止降為 `0`／空陣列）、
 * `AC-G86`（🔴 被恆等式綁住之區塊必須來自**同一次請求、同一個 `now`、同一份投影**）、
 * `AC-G87`（`defaultDimension` 之端到端判定鏈，含 🔴 **AD 之 `B01` ⇒ `'department'`**）、
 * `AC-G66`（🔴 後端閘門：`DeptContact` 取類別分布 ⇒ `ForbiddenException`）、
 * `AC-G69`（`today` 為 UTC）、`AC-G72`／`AC-G73`（不寫稽核、不做快取）。
 *
 * 🔴 **本檔對實作全盲**：`./dashboard-analytics.service` 於建環當下尚不存在。
 *
 * 🔒 **契約**（由 `architecture-spec` §15.5 之回應形狀與 §15.9 之「新增檔案」表推得；
 *    ⚠ 建構子與 sources 介面之**具體形狀為本環之提案**，architecture-spec 只寫到
 *    「4 個唯讀 provider（文件投影／ORG_UNIT 全表／`ACCOUNT.jobPositionCode`／`JOB_POSITION` 全表）」
 *    ＋ 類別分布之獨立 source。若實作者認為此形狀有誤，**請訊息 test-generator 裁決，不要自行改測試**）：
 * ```
 * export interface AnalyticsSession { companyCode: string; loginId: string; roleCode?: string }
 * export interface DashboardAnalyticsSources {
 *   listDocuments(): Promise<AnalyticsDocRow[]>;          // status='active' 之投影（6 欄）
 *   listOrgUnits(): Promise<OrgUnitRecord[]>;             // ORG_UNIT 全表（呼叫端每公司分群）
 *   findJobPositionCode(companyCode: string, loginId: string): Promise<string | null>;
 *   listJobPositions(): Promise<JobPositionRecord[]>;     // JOB_POSITION 全表
 *   listCategoryDocPairs(): Promise<CategoryDocPair[]>;   // join ＋ DISTINCT(類別, 文件)
 * }
 * export class DashboardAnalyticsService {
 *   constructor(sources: DashboardAnalyticsSources, now: () => Date);
 *   getAnalytics(session: AnalyticsSession): Promise<DashboardAnalytics>;
 *   getCategoryDistribution(session: AnalyticsSession): Promise<CategoryDistribution>;
 * }
 * ```
 */

/**
 * 🔴 **在任何 spy 之前**捕獲真實實作，供下方「被人為改動之矩陣替身」委派未改動的那些格。
 *
 * ⚠ **血訓（建環時實測）**：`jest.requireActual('../rbac/function-matrix')` 在**未使用
 *    `jest.mock`**（只用 `jest.spyOn`）時，回傳的是**同一個已被 spy 的模組實例**
 *    ⇒ 於 `mockImplementation` 內委派它會**無窮遞迴**，實測得 `RangeError` 而非預期之
 *    `ForbiddenException`。
 * 🔴 若該案當初寫成「期望 resolve」，這個遞迴會安靜地變成一次**看不見的假綠**。
 */
const REAL_CAN_PERFORM = matrix.canPerform;

const NOW = new Date('2026-03-15T09:41:00.000Z');

function unit(
  companyCode: string,
  orgCode: string,
  tier: string,
  parentCode: string | null,
  name: string,
): OrgUnitRecord {
  return {
    companyCode,
    orgCode,
    codePrefix: orgCode.replace(/0+$/, ''),
    parentCode,
    tier,
    name,
    descFull: name,
    managerEmpNo: null,
    isActive: true,
  };
}

const ORG_UNITS: readonly OrgUnitRecord[] = [
  unit('AS', 'B0000', 'DIVISION', '00000', '業務本部'),
  unit('AS', 'B1000', 'DEPARTMENT', 'B0000', '消費分期營業部'),
  unit('AD', 'C0000', 'DIVISION', '00000', '管理本部'),
  unit('AD', 'C1000', 'DEPARTMENT', 'C0000', '財會部'),
];

const DOCS: readonly AnalyticsDocRow[] = [
  {
    documentId: 'd1',
    documentNumber: 'N-1',
    documentName: '文件一',
    edition: "26'01",
    status: 'active',
    announcedDate: '2026-03-01',
    companyCode: 'AS',
    draftingDeptId: 'B1000',
  },
  {
    documentId: 'd2',
    documentNumber: 'N-2',
    documentName: '文件二',
    edition: null,
    status: 'active',
    announcedDate: '2026-04-01',
    companyCode: 'AS',
    draftingDeptId: 'B1000',
  },
  {
    documentId: 'd3',
    documentNumber: 'N-3',
    documentName: '文件三',
    edition: "25'02",
    status: 'active',
    announcedDate: '2026-02-01',
    companyCode: 'AD',
    draftingDeptId: 'C1000',
  },
];

/** 🔴 實查之歧義代碼：`B01` 於 AS ＝ `本部長`、於 **AD ＝ `本處長`**（F044 §事實 #7）。 */
const JOB_POSITIONS: readonly JobPositionRecord[] = [
  { companyCode: 'AS', code: 'B01', name: '本部長' },
  { companyCode: 'AS', code: 'A01', name: '董事長' },
  { companyCode: 'AD', code: 'B01', name: '本處長' },
];

const CATEGORY_PAIRS: readonly CategoryDocPair[] = [
  {
    categoryId: 'bc1',
    displayName: '授信（消金）',
    categoryStatus: 'active',
    documentId: 'd1',
    documentStatus: 'active',
    announcedDate: '2026-03-01',
  },
];

interface Overrides {
  jobPositionCode?: string | null;
  documents?: () => Promise<AnalyticsDocRow[]>;
  orgUnits?: () => Promise<OrgUnitRecord[]>;
  jobPositionCodeFn?: () => Promise<string | null>;
  categoryPairs?: () => Promise<CategoryDocPair[]>;
}

function makeService(over: Overrides = {}): {
  svc: DashboardAnalyticsService;
  calls: { documents: number; orgUnits: number; categoryPairs: number };
} {
  const calls = { documents: 0, orgUnits: 0, categoryPairs: 0 };
  const sources: DashboardAnalyticsSources = {
    listDocuments: () => {
      calls.documents += 1;
      return over.documents ? over.documents() : Promise.resolve([...DOCS]);
    },
    listOrgUnits: () => {
      calls.orgUnits += 1;
      return over.orgUnits ? over.orgUnits() : Promise.resolve([...ORG_UNITS]);
    },
    findJobPositionCode: () =>
      over.jobPositionCodeFn
        ? over.jobPositionCodeFn()
        : Promise.resolve(over.jobPositionCode ?? null),
    listJobPositions: () => Promise.resolve([...JOB_POSITIONS]),
    listCategoryDocPairs: () => {
      calls.categoryPairs += 1;
      return over.categoryPairs ? over.categoryPairs() : Promise.resolve([...CATEGORY_PAIRS]);
    },
  };
  return { svc: new DashboardAnalyticsService(sources, () => NOW), calls };
}

const AS_ADMIN: AnalyticsSession = { companyCode: 'AS', loginId: 'AS22455', roleCode: 'ICSOPAdmin' };
const AD_ADMIN: AnalyticsSession = { companyCode: 'AD', loginId: 'AD10001', roleCode: 'ICSOPAdmin' };

describe('getAnalytics — 回應形狀與 today（AC-G69／AC-G86）', () => {
  it('today 為 UTC 之 YYYY-MM-DD（＝ serverToday(now)）', async () => {
    const { svc } = makeService();
    const r = await svc.getAnalytics(AS_ADMIN);
    expect(r.today).toBe('2026-03-15');
  });

  it('一次請求同時回傳 cards／donuts（各 3 維度）／latestAnnouncements／defaultDimension', async () => {
    const { svc } = makeService();
    const r = await svc.getAnalytics(AS_ADMIN);
    expect(r.cards).toEqual({ announced: 2, inProgress: 1, monthlyAnnounced: 1 });
    expect(Object.keys(r.donuts ?? {}).sort()).toEqual(['cumulative', 'month']);
    expect(Object.keys(r.donuts?.month ?? {}).sort()).toEqual([
      'company',
      'department',
      'division',
    ]);
    expect(Array.isArray(r.latestAnnouncements)).toBe(true);
  });

  /**
   * 🔴 `AC-G86` 之**決定性理由**：INV-G1／INV-G2 是跨區塊之恆等式。若卡片與環圖來自兩次查詢，
   * 就是兩個時間點、兩份快照 ⇒ 恆等式會在正式站上破掉，而本輪之回歸鎖（純函式對純函式）
   * **永遠不會紅**。⇒ 可觀測之代理：**同一次 `getAnalytics` 只取一次文件投影**。
   */
  it('AC-G86：卡片／環圖／最新公告來自**同一份投影**（listDocuments 恰被呼叫一次）', async () => {
    const { svc, calls } = makeService();
    await svc.getAnalytics(AS_ADMIN);
    expect(calls.documents).toBe(1);
  });

  it('AC-G86：類別分布**不在**本端點內（getAnalytics 不觸發 listCategoryDocPairs）', async () => {
    const { svc, calls } = makeService();
    await svc.getAnalytics(AS_ADMIN);
    expect(calls.categoryPairs).toBe(0);
  });

  /** 🔒 INV-G1／INV-G2 在**服務層輸出**上亦成立（不只純函式層）。 */
  it('服務層輸出仍滿足 INV-G1／INV-G2（三個維度各自）', async () => {
    const { svc } = makeService();
    const r = await svc.getAnalytics(AS_ADMIN);
    for (const dim of ['company', 'division', 'department'] as const) {
      const month = (r.donuts?.month?.[dim] ?? []).reduce((a, s) => a + s.announced, 0);
      const cumulative = (r.donuts?.cumulative?.[dim] ?? []).reduce((a, s) => a + s.announced, 0);
      expect(month).toBe(r.cards?.monthlyAnnounced);
      expect(cumulative).toBe(r.cards?.announced);
    }
  });
});

describe('🔒 AC-G87 — defaultDimension 之端到端判定鏈', () => {
  it('🔴 AD 之 B01（本處長）⇒ department（關鍵向量：禁以 code 比對）', async () => {
    const { svc } = makeService({ jobPositionCode: 'B01' });
    const r = await svc.getAnalytics(AD_ADMIN);
    expect(r.defaultDimension).toBe('department');
  });

  it('AS 之 B01（本部長）⇒ division（與上一案成對）', async () => {
    const { svc } = makeService({ jobPositionCode: 'B01' });
    const r = await svc.getAnalytics(AS_ADMIN);
    expect(r.defaultDimension).toBe('division');
  });

  it('AS 之 A01（董事長）⇒ company', async () => {
    const { svc } = makeService({ jobPositionCode: 'A01' });
    expect((await svc.getAnalytics(AS_ADMIN)).defaultDimension).toBe('company');
  });

  it('🔴 跨公司 fallback 反例：AD 查 AS 專有之 A01 ⇒ 解析不到 ⇒ department', async () => {
    const { svc } = makeService({ jobPositionCode: 'A01' });
    expect((await svc.getAnalytics(AD_ADMIN)).defaultDimension).toBe('department');
  });

  it('jobPositionCode 為 null ⇒ department', async () => {
    const { svc } = makeService({ jobPositionCode: null });
    expect((await svc.getAnalytics(AS_ADMIN)).defaultDimension).toBe('department');
  });
});

/**
 * 🔴 `AC-G23` — 單一聚合失敗不阻斷其餘區塊。
 * 🔴 **降級語意 ＝ 省略該鍵（`undefined`）**；🔴 **明文禁止降級為 `0` 或空陣列**
 *    ——環圖降級為空陣列（總和 0）而卡片仍是真實數字，畫面上會出現一組對不起來的數字，
 *    與真正的計算錯誤無從分辨（`AC-G6`／`AC-G35` 整條想防的形狀）。
 * 🔒 既有 `/admin/dashboard/summary` 之 `safe()` → `0` 語意**不變**（`AC-G75`）；兩者不同是刻意的。
 */
describe('🔴 AC-G23 — 各自 try/catch、省略鍵、禁止降為 0／空陣列', () => {
  it('ORG_UNIT 來源丟例外 ⇒ donuts 鍵**不存在**，cards／latestAnnouncements 仍為正確值', async () => {
    const { svc } = makeService({ orgUnits: () => Promise.reject(new Error('boom')) });
    const r = await svc.getAnalytics(AS_ADMIN);
    expect('donuts' in r).toBe(false);
    expect(r.donuts).toBeUndefined();
    // 🔴 負向：不得退化為空陣列
    expect(JSON.stringify(r)).not.toContain('"donuts"');
    // 其餘區塊照常
    expect(r.cards).toEqual({ announced: 2, inProgress: 1, monthlyAnnounced: 1 });
    expect(r.latestAnnouncements?.length).toBeGreaterThan(0);
    expect(r.today).toBe('2026-03-15');
  });

  it('文件投影丟例外 ⇒ cards／donuts／latestAnnouncements 三鍵皆不存在，整體不拋錯', async () => {
    const { svc } = makeService({ documents: () => Promise.reject(new Error('boom')) });
    const r = await svc.getAnalytics(AS_ADMIN);
    expect('cards' in r).toBe(false);
    expect('donuts' in r).toBe(false);
    expect('latestAnnouncements' in r).toBe(false);
    // 🔴 負向：不得降為 0
    expect(JSON.stringify(r)).not.toContain('"announced":0');
    expect(r.today).toBe('2026-03-15');
  });

  it('職位回查丟例外 ⇒ defaultDimension 鍵不存在，cards 仍在（前端以 normalizeDefaultDimension 收斂）', async () => {
    const { svc } = makeService({ jobPositionCodeFn: () => Promise.reject(new Error('boom')) });
    const r = await svc.getAnalytics(AS_ADMIN);
    expect('defaultDimension' in r).toBe(false);
    expect(r.cards).toBeDefined();
  });

  it('🔴 明文禁止以單一 try/catch 包住整個儀表板（一個失敗不得使其餘鍵一起消失）', async () => {
    const { svc } = makeService({ orgUnits: () => Promise.reject(new Error('boom')) });
    const r = await svc.getAnalytics(AS_ADMIN);
    const present = ['today', 'cards', 'latestAnnouncements', 'defaultDimension'].filter(
      (k) => k in r,
    );
    expect(present).toHaveLength(4);
  });
});

describe('🔒 AC-G66 — 類別分布之**後端**閘門（讀矩陣，不寫角色清單）', () => {
  it.each(['ICSOPAdmin', 'SysAdmin', 'Supervisor'])(
    '%s 對 BUSINESS_CATEGORY_MANAGEMENT 有 read ⇒ 取得分布',
    async (roleCode) => {
      const { svc } = makeService();
      const r = await svc.getCategoryDistribution({ companyCode: 'AS', loginId: 'x', roleCode });
      expect(Array.isArray(r.items)).toBe(true);
      expect(r.today).toBe('2026-03-15');
    },
  );

  it('🔴 DeptContact（矩陣格值 NONE）⇒ ForbiddenException（403）', async () => {
    const { svc } = makeService();
    await expect(
      svc.getCategoryDistribution({ companyCode: 'AS', loginId: 'x', roleCode: 'DeptContact' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('🔴 被拒時不得先打 SQL（閘門須在查詢之前）', async () => {
    const { svc, calls } = makeService();
    await expect(
      svc.getCategoryDistribution({ companyCode: 'AS', loginId: 'x', roleCode: 'DeptContact' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls.categoryPairs).toBe(0);
  });

  it('roleCode 缺席 ⇒ 一律拒絕（canPerform 對 undefined 為偽）', async () => {
    const { svc } = makeService();
    await expect(
      svc.getCategoryDistribution({ companyCode: 'AS', loginId: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * 🔴 §癸 (e)：**在當前矩陣值之下，「讀矩陣」與「寫角色清單」之外顯行為完全相同**
   * ——上面四條對「`role !== 'DeptContact'`」這種寫法**零鑑別力**。
   * ⇒ §癸 (e) 要求之鑑別力載體為「**以一個被人為改動的矩陣替身驅動閘門述詞，
   *   斷言其輸出隨矩陣而變**」。
   *
   * 🟢 **本輪做得到**：`canPerform` 為具名 export，TypeScript 之 CommonJS 產物把
   *    `canPerform(...)` 編成 `function_matrix_1.canPerform(...)` 之**呼叫期屬性存取**
   *    ⇒ `jest.spyOn(matrix, 'canPerform')` 之替身確實會被服務層取用。
   *    （這比 spy「被呼叫過」強得多：被改動的是**回傳值**，寫死角色清單者完全不受影響。）
   *
   * 🔴 **兩個方向都必須斷言**，缺一即留下一半的角色清單寫法不被抓到：
   *   · 矩陣**放行** `DeptContact` ⇒ 必須不再 403（`role !== 'DeptContact'` 之實作仍會 403 ⇒ 紅）
   *   · 矩陣**撤銷** `ICSOPAdmin` ⇒ 必須 403（角色清單之實作仍會放行 ⇒ 紅）
   */
  describe('🔴 §癸 (e) — 以被人為改動之矩陣替身驅動閘門（讀矩陣 vs 角色清單之真正鑑別力）', () => {
    it('自我守護：替身確實被服務層取用（否則下面兩條恆真）', async () => {
      const spy = jest.spyOn(matrix, 'canPerform');
      try {
        const { svc } = makeService();
        await svc.getCategoryDistribution({ companyCode: 'AS', loginId: 'x', roleCode: 'ICSOPAdmin' });
        expect(spy).toHaveBeenCalledWith(
          'ICSOPAdmin',
          matrix.FunctionKey.BUSINESS_CATEGORY_MANAGEMENT,
          'read',
        );
      } finally {
        spy.mockRestore();
      }
    });

    it('🔴 矩陣改為放行 DeptContact ⇒ 不再 403（角色清單之實作在此翻紅）', async () => {
      const spy = jest
        .spyOn(matrix, 'canPerform')
        .mockImplementation((roleCode, functionKey, action) =>
          functionKey === matrix.FunctionKey.BUSINESS_CATEGORY_MANAGEMENT
            ? true
            : REAL_CAN_PERFORM(roleCode, functionKey, action),
        );
      try {
        const { svc } = makeService();
        await expect(
          svc.getCategoryDistribution({ companyCode: 'AS', loginId: 'x', roleCode: 'DeptContact' }),
        ).resolves.toBeDefined();
      } finally {
        spy.mockRestore();
      }
    });

    it('🔴 矩陣改為撤銷 ICSOPAdmin ⇒ 必須 403（角色清單之實作在此翻紅）', async () => {
      const spy = jest
        .spyOn(matrix, 'canPerform')
        .mockImplementation((roleCode, functionKey, action) =>
          functionKey === matrix.FunctionKey.BUSINESS_CATEGORY_MANAGEMENT
            ? false
            : REAL_CAN_PERFORM(roleCode, functionKey, action),
        );
      try {
        const { svc, calls } = makeService();
        await expect(
          svc.getCategoryDistribution({ companyCode: 'AS', loginId: 'x', roleCode: 'ICSOPAdmin' }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        // 🔴 被拒時仍不得先打 SQL
        expect(calls.categoryPairs).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });

    /**
     * 🔴 **功能鍵必須是 `BUSINESS_CATEGORY_MANAGEMENT`，不得是別的鍵**：只改**其他**鍵之格值時
     * 本閘門不得受影響。沒有這一條，一個「讀矩陣、但讀錯鍵」的實作在上面兩條之下仍可能全綠。
     */
    it('只改動其他功能鍵之格值 ⇒ 本閘門不受影響（證明讀的是正確的那一格）', async () => {
      const spy = jest
        .spyOn(matrix, 'canPerform')
        .mockImplementation((roleCode, functionKey, action) =>
          functionKey === matrix.FunctionKey.BUSINESS_CATEGORY_MANAGEMENT
            ? REAL_CAN_PERFORM(roleCode, functionKey, action)
            : true,
        );
      try {
        const { svc } = makeService();
        await expect(
          svc.getCategoryDistribution({ companyCode: 'AS', loginId: 'x', roleCode: 'DeptContact' }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      } finally {
        spy.mockRestore();
      }
    });
  });
});

describe('AC-G72／AC-G73 — 不寫稽核、不做快取', () => {
  /**
   * 🔴 `AC-G73`：不引入任何快取層 ⇒ 連續兩次呼叫**各自**重新取資料
   * （若實作加了 in-memory TTL，第二次之 `calls.documents` 會停在 1）。
   */
  it('AC-G73：連續兩次 getAnalytics ⇒ 文件投影被取兩次（無快取）', async () => {
    const { svc, calls } = makeService();
    await svc.getAnalytics(AS_ADMIN);
    await svc.getAnalytics(AS_ADMIN);
    expect(calls.documents).toBe(2);
  });

  /**
   * `AC-G72`：本功能之任何聚合讀取**不寫 `AUDIT_LOG`**。
   * 🔴 可測形狀＝服務之相依中**沒有**任何稽核 port：建構子只收 `sources` 與 `now` 兩個參數。
   */
  it('AC-G72：建構子恰兩個參數（sources、now）——沒有稽核 recorder 之注入點', () => {
    expect(DashboardAnalyticsService.length).toBe(2);
  });
});
