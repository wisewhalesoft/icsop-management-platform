import { OrgUnitRecord } from '../org-directory/org-unit-read';
import { DISPLAY_LABEL, deriveDisplayStatus } from '../documents/display-status';
import {
  AnalyticsDocRow,
  countCards,
  donutSlices,
  latestAnnouncements,
  monthWindow,
} from './dashboard-analytics';

/**
 * F044 §甲／§丙／§丁 之**純函式層**建環（`backend/src/dashboard/dashboard-analytics.ts`）。
 *
 * 涵蓋：`AC-G2`～`AC-G6`（卡片口徑與月界向量）、`AC-G29`～`AC-G41`（環圖分段／標籤／排序／Top N 前之
 * 全量）、`AC-G51`～`AC-G56`（最新公告）、`AC-G70`（INV-G7 同源）、`AC-G85`（`DonutSlice[]` 三層排序）。
 *
 * 🔴 **本檔對實作全盲**：`./dashboard-analytics` 於建環當下尚不存在 ⇒ 預期紅燈為
 *    `Cannot find module './dashboard-analytics'`。
 *
 * 🔒 **契約**（`architecture-spec` §15.5 ① 之 TypeScript 區塊 ＋ §15.9 之函式清單；本檔為其可執行化）：
 * ```
 * export interface AnalyticsDocRow {
 *   documentId: string; documentNumber: string; documentName: string;
 *   edition: string | null; status: DocumentStatus;
 *   announcedDate: string | null;      // 'YYYY-MM-DD'，UTC 拆解
 *   companyCode: string; draftingDeptId: string | null;
 * }
 * export interface CardCounts { announced: number; inProgress: number; monthlyAnnounced: number }
 * export function countCards(docs: readonly AnalyticsDocRow[], today: Date): CardCounts;
 * export function monthWindow(today: Date): { start: Date; endExclusive: Date };
 * export interface DonutSlice { key: string; label: string; announced: number; inProgress: number }
 * export function donutSlices(input: {
 *   docs: readonly AnalyticsDocRow[]; orgUnits: readonly OrgUnitRecord[];
 *   dimension: 'company' | 'division' | 'department';
 *   scope: 'month' | 'cumulative'; today: Date;
 * }): DonutSlice[];
 * export interface LatestAnnouncementRow {
 *   documentId: string; announcedDate: string; edition: string | null;
 *   documentName: string; displayStatus: 'announced' | 'in_progress';
 * }
 * export function latestAnnouncements(
 *   docs: readonly AnalyticsDocRow[], limit: number, today: Date,
 * ): { rows: LatestAnnouncementRow[]; total: number };
 *   // 🔴 `AC-G96`（2026-09-21 新增）：`total` ＝ **截斷前**之 `pool.length`，取自**同一個** `pool`。
 *   //    `OLD>` 回傳型別曾為 `LatestAnnouncementRow[]`。
 * ```
 * ⚠ `donutSlices` 之入參刻意採**具名物件**（不是位置參數）：五個參數中有兩個是字串列舉，
 *    位置參數形式下把 `dimension` 與 `scope` 對調在型別上完全合法、在測試上很難發現。
 *
 * 🔴 **時鐘一律凍結**（`AC-G5` 末段、本 repo 之「跨日定時炸彈」血訓）：本檔任何一處
 *    **不得**出現 `new Date()` 之無參數呼叫。
 */

// ══════════════════════════ 語料 ══════════════════════════

/** 🔒 凍結之「今日」（UTC）。當月 ＝ `2026-03`。 */
const TODAY = new Date('2026-03-15T00:00:00.000Z');

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

/**
 * 組織語料（§癸 (b)）。
 * 🔴 **AD 刻意沒有 `B0000` 這一列** ⇒ AD／`B1000` 上溯查無 ⇒ 落 `無本部` 段（該段之唯一成因）。
 * 🔴 **AD 之 `B1000` 與 AS 之 `B1000` 同碼不同公司** ⇒ 驗 `AC-G33` 之禁跨公司查表。
 * 🔴 **`ZZ` 為查無簡稱之公司代碼** ⇒ 驗 `AC-G32`「標籤退回 `companyCode` 原字串、且不得歸入
 *    `未指定` 段」——「查不到簡稱」與「沒有制定公司」是兩件不同的事。
 */
const ORG_UNITS: readonly OrgUnitRecord[] = [
  unit('AS', 'B0000', 'DIVISION', '00000', '業務本部'),
  unit('AS', 'B1000', 'DEPARTMENT', 'B0000', '消費分期營業部'),
  unit('AS', 'C0000', 'DIVISION', '00000', '管理本部'),
  unit('AS', 'C1000', 'DEPARTMENT', 'C0000', '財會部'),
  unit('AS', 'C5000', 'DEPARTMENT', 'C0000', '法務部'),
  // 🔴 AD 缺 B0000
  unit('AD', 'B1000', 'DEPARTMENT', 'B0000', '業務部'),
  unit('AD', 'C0000', 'DIVISION', '00000', '管理本部'),
  unit('AD', 'C1000', 'DEPARTMENT', 'C0000', '財會部'),
  unit('ZZ', 'E0000', 'DIVISION', '00000', '能源本部'),
  unit('ZZ', 'E1000', 'DEPARTMENT', 'E0000', '電能事業部'),
];

function doc(
  documentId: string,
  documentNumber: string,
  documentName: string,
  edition: string | null,
  status: AnalyticsDocRow['status'],
  announcedDate: string | null,
  companyCode: string,
  draftingDeptId: string | null,
): AnalyticsDocRow {
  return {
    documentId,
    documentNumber,
    documentName,
    edition,
    status,
    announcedDate,
    companyCode,
    draftingDeptId,
  };
}

/**
 * 文件語料（§癸 (a)）。🔴 **五種形狀缺一即有一半條文恆真**：
 *  ① 上月公告（d02／d08／d14）｜② 本月已公告（d01／d04／d07／d09／d10／d13）
 *  ③ **本月但公告日在未來**（d03）｜④ `announcedDate` 為 `null`（d05）
 *  ⑤ 本月公告但已改為 `inactive`（d11；另附 `void` 之 d12）
 * 🔴 **d06（AS／法務部 C5000）為 INV-G3 之唯一載體**：該單位**只有進度中、沒有任何已公告**
 *    ⇒ 於 `department` 維度不產生環段、不產生圖例列 ⇒ 卡② ＞ Σ圖例進度中。
 */
const DOCS: readonly AnalyticsDocRow[] = [
  doc('d01', 'SRC-101', '車輛分期進件作業', "26'01", 'active', '2026-03-01', 'AS', 'B1000'),
  doc('d02', 'SRC-102', '車輛分期照會作業', null, 'active', '2026-02-20', 'AS', 'B1000'),
  doc('d03', 'SRC-103', '車輛分期對保作業', "26'02", 'active', '2026-03-31', 'AS', 'B1000'),
  doc('d04', 'FIN-201', '請款作業', "25'03", 'active', '2026-03-10', 'AS', 'C1000'),
  doc('d05', 'FIN-202', '付款作業', null, 'active', null, 'AS', 'C1000'),
  doc('d06', 'LAW-301', '契約審查作業', "26'01", 'active', '2026-04-01', 'AS', 'C5000'),
  doc('d07', 'AD-401', '客戶服務作業', "26'01", 'active', '2026-03-05', 'AD', 'B1000'),
  doc('d08', 'AD-501', '帳務結算作業', "25'02", 'active', '2026-02-10', 'AD', 'C1000'),
  // 🔴 `draftingDeptId` 為 null ⇒ `未指定`（三個維度皆然）
  doc('d09', 'GEN-601', '資訊安全政策', "26'01", 'active', '2026-03-12', 'AS', null),
  // 🔴 `draftingDeptId` 指向不存在之 orgCode ⇒ 亦為 `未指定`
  doc('d10', 'GEN-602', '資產管理作業', null, 'active', '2026-03-14', 'AS', 'Z9999'),
  doc('d11', 'OLD-701', '舊版進件作業', "25'01", 'inactive', '2026-03-02', 'AS', 'B1000'),
  doc('d12', 'OLD-702', '作廢之作業書', "25'01", 'void', '2026-03-03', 'AS', 'B1000'),
  doc('d13', 'ZZ-801', '售電作業', "26'01", 'active', '2026-03-08', 'ZZ', 'E1000'),
  doc('d14', 'SRC-104', '車輛分期撥款作業', "26'01", 'active', '2026-02-05', 'AS', 'B1000'),
];

const KEY_UNSPECIFIED = '__unspecified__';
const KEY_NO_DIVISION = '__no_division__';

const slicesOf = (
  dimension: 'company' | 'division' | 'department',
  scope: 'month' | 'cumulative',
): ReturnType<typeof donutSlices> =>
  donutSlices({ docs: DOCS, orgUnits: ORG_UNITS, dimension, scope, today: TODAY });

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * 🟢 **`AC-G96` 之型別橋接已於 2026-09-21 移除**（實作落地後該 `as unknown as` 即成恒等轉換）。
 * 📌 建環期間曾以一支 `as unknown as` 橋接 helper 控制**紅燈粒度**：
 *    `latestAnnouncements()` 之回傳型別由 `LatestAnnouncementRow[]` 改為 `{ rows, total }`，
 *    在實作改完之前直接寫 `.rows` 會是**編譯錯誤** ⇒ 整份檔案「Test suite failed to run」，
 *    連同另外約 50 條無關斷言一起被蓋掉。詳見 `risks-and-gaps.md` `G44-23`。
 * ⚠ 本段保留為紀錄：下一次有 AC 要改**既有共用符號的型別**時，這是可以再用的手法。
 */


// ══════════════════════════ §甲 · 卡片口徑 ══════════════════════════

describe('countCards — 卡片口徑（AC-G2／AC-G3／AC-G4）', () => {
  it('卡① 已公告＝累積、不限時間；卡② 進度中；卡③ 本月新版公告', () => {
    const cards = countCards(DOCS, TODAY);
    // d01,d02,d04,d07,d08,d09,d10,d13,d14
    expect(cards.announced).toBe(9);
    // d03（本月未來日）、d05（無公告日）、d06（次月）
    expect(cards.inProgress).toBe(3);
    // d01,d04,d07,d09,d10,d13（d02/d08/d14 為上月；d03 未到；d11 已 inactive）
    expect(cards.monthlyAnnounced).toBe(6);
  });

  /**
   * 🔴 §癸 (a) 之鑑別力自證：
   *  · 若卡③ 漏掉「只算已公告」（改為「announcedDate 落在當月」即計入），d03 會被計入 ⇒ 7 ≠ 6 ⇒ 紅。
   *  · 若卡③ 未排除 `inactive`，d11 會被計入 ⇒ 7 ≠ 6 ⇒ 紅。
   *  · 若語料只有「本月」與「非本月」兩種，上述兩種錯法皆全綠 ⇒ 該條恆真。
   */
  it('AC-G4 負向：inactive／void 之本月文件不計入任何一張卡', () => {
    const withoutDirty = DOCS.filter((d) => d.documentId !== 'd11' && d.documentId !== 'd12');
    expect(countCards(withoutDirty, TODAY)).toEqual(countCards(DOCS, TODAY));
  });

  it('AC-G4 負向：本月但公告日在未來者只進卡②，不進卡③', () => {
    const withoutFuture = DOCS.filter((d) => d.documentId !== 'd03');
    const all = countCards(DOCS, TODAY);
    const cut = countCards(withoutFuture, TODAY);
    expect(cut.monthlyAnnounced).toBe(all.monthlyAnnounced); // 本來就沒被計入
    expect(cut.inProgress).toBe(all.inProgress - 1); // 它確實在卡②裡（證明它沒被整個丟掉）
  });

  it('AC-G3 負向鎖：「進度中」不得漏掉 announcedDate 為 null 之文件', () => {
    const withoutNull = DOCS.filter((d) => d.documentId !== 'd05');
    expect(countCards(withoutNull, TODAY).inProgress).toBe(countCards(DOCS, TODAY).inProgress - 1);
  });
});

/**
 * `AC-G5` — 「當月」之定義與**月界之凍結時鐘向量表**（逐列取自 F044 `AC-G5`）。
 * 🔴 **明文禁止**以 `Date.now()` 回推方式建立 fixture。
 */
describe('countCards — AC-G5 月界固定向量（凍結時鐘）', () => {
  const CASES: readonly { no: string; today: string; announced: string | null; counted: boolean; guards: string }[] = [
    { no: '①', today: '2026-03-15T00:00:00Z', announced: '2026-02-28', counted: false, guards: '上月公告被誤計' },
    { no: '②', today: '2026-03-15T00:00:00Z', announced: '2026-03-01', counted: true, guards: '月初邊界被誤排除' },
    { no: '③', today: '2026-03-15T00:00:00Z', announced: '2026-03-15', counted: true, guards: '「今日」被誤判為未來' },
    { no: '④', today: '2026-03-15T00:00:00Z', announced: '2026-03-31', counted: false, guards: '本月未來日被誤計' },
    { no: '⑤', today: '2026-03-31T23:59:59Z', announced: '2026-03-31', counted: true, guards: '月末最後一刻被誤排除' },
    { no: '⑥', today: '2026-04-01T00:00:00Z', announced: '2026-03-31', counted: false, guards: '跨月後仍計入上月' },
    { no: '⑦', today: '2026-03-15T00:00:00Z', announced: null, counted: false, guards: 'null 被當成 0 而落入某個月' },
  ];

  it('向量表恰 7 列（自我守護）', () => {
    expect(CASES).toHaveLength(7);
  });

  it.each(CASES)(
    '$no today=$today announced=$announced → 計入卡③＝$counted（防：$guards）',
    ({ today, announced, counted }) => {
      const one = [doc('x', 'X-1', '單列語料', null, 'active', announced, 'AS', 'B1000')];
      expect(countCards(one, new Date(today)).monthlyAnnounced).toBe(counted ? 1 : 0);
    },
  );

  it('monthWindow 為半開區間 [當月1日 00:00:00.000Z, 次月1日 00:00:00.000Z)', () => {
    const w = monthWindow(new Date('2026-03-15T09:41:00.000Z'));
    expect(w.start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(w.endExclusive.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('monthWindow 跨年：12 月之次月為次年 1 月', () => {
    const w = monthWindow(new Date('2026-12-31T23:59:59.999Z'));
    expect(w.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(w.endExclusive.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

// ══════════════════════════ §丙 · 環圖分段 ══════════════════════════

describe('donutSlices — 分段語意與兩個 sentinel 段（AC-G30／AC-G32／AC-G33／AC-G34）', () => {
  it('AC-G30：每一段＝一個組織，且每一段之 announced 恆 ≥ 1（不存在 0 份之段）', () => {
    for (const dim of ['company', 'division', 'department'] as const) {
      for (const scope of ['month', 'cumulative'] as const) {
        const slices = donutSlices({ docs: DOCS, orgUnits: ORG_UNITS, dimension: dim, scope, today: TODAY });
        expect(slices.length).toBeGreaterThan(0);
        for (const s of slices) expect(s.announced).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('AC-G34：`draftingDeptId` 為 null 或查無該 orgCode ⇒ `__unspecified__`／`未指定`（三個維度皆然）', () => {
    for (const dim of ['company', 'division', 'department'] as const) {
      const seg = slicesOf(dim, 'cumulative').find((s) => s.key === KEY_UNSPECIFIED);
      expect(seg).toBeDefined();
      // d09（dept 為 null）＋ d10（dept 指向不存在之 Z9999）
      expect(seg?.announced).toBe(2);
      expect(seg?.label).toBe('未指定');
    }
  });

  /**
   * 🔴 `AC-G34` 之 `無本部` 段：**僅 `division` 維度**歸此段；`department` 維度照常以其部為一段、
   * `company` 維度照常以其公司為一段。
   * §癸 (b) 自證：若語料把 AD 之 `B0000` 補上，本案第 1 句永遠找不到該段 ⇒ 整條恆真。
   */
  it('AC-G34：有部但上溯無 DIVISION 祖先 ⇒ 僅 division 維度落 `__no_division__`／`無本部`', () => {
    const div = slicesOf('division', 'cumulative').find((s) => s.key === KEY_NO_DIVISION);
    expect(div).toBeDefined();
    expect(div?.label).toBe('無本部');
    expect(div?.announced).toBe(1); // d07

    // department 維度：以其部為一段（label 之本部段**收合**，A-G1）
    const dept = slicesOf('department', 'cumulative').find((s) => s.key === 'AD__B1000');
    expect(dept).toBeDefined();
    expect(dept?.label).toBe('和潤興業 / 業務部');
    expect(slicesOf('department', 'cumulative').some((s) => s.key === KEY_NO_DIVISION)).toBe(false);

    // company 維度：以其公司為一段
    expect(slicesOf('company', 'cumulative').some((s) => s.key === 'AD')).toBe(true);
    expect(slicesOf('company', 'cumulative').some((s) => s.key === KEY_NO_DIVISION)).toBe(false);
  });

  it('AC-G34：`未指定` 與 `無本部` 刻意分為兩段，不得合併', () => {
    const keys = slicesOf('division', 'cumulative').map((s) => s.key);
    expect(keys).toContain(KEY_UNSPECIFIED);
    expect(keys).toContain(KEY_NO_DIVISION);
  });

  /**
   * 🔴 `AC-G33` 之禁跨公司查表：AD 之 `B1000` 與 AS 之 `B1000` 同碼不同公司。
   * 若實作把兩家攤平成單一索引，AD 之 `B1000` 會解析到 AS 的 `B0000`（業務本部）
   * ⇒ `__no_division__` 段消失、AD 那一份會落進 `AS__B0000` ⇒ 本案與上一案同時翻紅。
   */
  it('AC-G33：跨公司同碼不得互相解析（AD/B1000 不得拿到 AS 之業務本部）', () => {
    const div = slicesOf('division', 'cumulative');
    expect(div.find((s) => s.key === 'AS__B0000')?.announced).toBe(3); // d01,d02,d14 — 不含 d07
    expect(div.some((s) => s.label === '和潤興業 / 業務本部')).toBe(false);
  });

  it('AC-G32：查無公司簡稱 ⇒ 標籤為 companyCode 原字串，且**不得**歸入 `未指定`', () => {
    const co = slicesOf('company', 'cumulative').find((s) => s.key === 'ZZ');
    expect(co).toBeDefined();
    expect(co?.label).toBe('ZZ');
    expect(co?.announced).toBe(1); // d13
  });

  it('AC-G36：三個維度之標籤格式（沿用 orgUnitDisplayName ＋ ORG_PATH_SEPARATOR）', () => {
    expect(slicesOf('company', 'cumulative').find((s) => s.key === 'AS')?.label).toBe('和潤企業');
    expect(slicesOf('division', 'cumulative').find((s) => s.key === 'AS__B0000')?.label).toBe(
      '和潤企業 / 業務本部',
    );
    expect(slicesOf('department', 'cumulative').find((s) => s.key === 'AS__B1000')?.label).toBe(
      '和潤企業 / 業務本部 / 消費分期營業部',
    );
  });

  it('AC-G36 末段：兩個 sentinel 段之 label 為逐字值本身，不加公司前綴', () => {
    const div = slicesOf('division', 'cumulative');
    expect(div.find((s) => s.key === KEY_UNSPECIFIED)?.label).toBe('未指定');
    expect(div.find((s) => s.key === KEY_NO_DIVISION)?.label).toBe('無本部');
  });
});

// ══════════════════════════ 🔒 三條恆等 ══════════════════════════

describe('🔒 INV-G1／INV-G2 恆等鎖（AC-G6／AC-G35）', () => {
  // 🔴 刻意**不在 describe 本體**呼叫 countCards：describe 本體於收集階段執行，
  //    實作尚不存在時會讓**整份檔案**「Test suite failed to run」而蓋掉逐條紅燈資訊。
  it.each(['company', 'division', 'department'] as const)(
    'INV-G1（%s 維度）：Σ(當月環圖各段已公告) === 卡③',
    (dim) => {
      const cards = countCards(DOCS, TODAY);
      expect(sum(slicesOf(dim, 'month').map((s) => s.announced))).toBe(cards.monthlyAnnounced);
    },
  );

  it.each(['company', 'division', 'department'] as const)(
    'INV-G2（%s 維度）：Σ(累積環圖各段已公告) === 卡①',
    (dim) => {
      const cards = countCards(DOCS, TODAY);
      expect(sum(slicesOf(dim, 'cumulative').map((s) => s.announced))).toBe(cards.announced);
    },
  );

  /**
   * 🔴 本組之鑑別力來源：語料中 `未指定`（2 份）與 `無本部`（1 份）**都非空**。
   * 任何一處「順手排除掉解析不出來的那幾筆」都會讓上面六條之一立刻翻紅。
   * §癸 自證：把 `orgSegmentOf` 改成「查無單位就 `return null` 並自集合剔除」，
   *          六條恆等全部翻紅（差額 2 或 3）。
   */
  it('恆等鎖之鑑別力自證：兩個 sentinel 段確實非空（否則上面六條恆真）', () => {
    const div = slicesOf('division', 'cumulative');
    expect(div.find((s) => s.key === KEY_UNSPECIFIED)?.announced).toBeGreaterThan(0);
    expect(div.find((s) => s.key === KEY_NO_DIVISION)?.announced).toBeGreaterThan(0);
  });
});

describe('🔒 INV-G6：兩區塊之「進度中」恆等；圖例列集合 ＝ 環段集合（AC-G38）', () => {
  it('同時出現於兩個區塊之組織，其 inProgress 恆等', () => {
    const month = slicesOf('department', 'month');
    const cumulative = slicesOf('department', 'cumulative');
    const byKey = new Map(cumulative.map((s) => [s.key, s]));
    let compared = 0;
    for (const m of month) {
      const c = byKey.get(m.key);
      if (!c) continue;
      expect(m.inProgress).toBe(c.inProgress);
      compared += 1;
    }
    // 自我守護：若沒有任何一個組織同時出現於兩區，上面的迴圈零次執行而恆綠。
    expect(compared).toBeGreaterThanOrEqual(2);
  });

  it('某組織只出現於「累積已公告」而不出現於「當月已公告」（正確行為）', () => {
    const monthKeys = slicesOf('department', 'month').map((s) => s.key);
    const cumulativeKeys = slicesOf('department', 'cumulative').map((s) => s.key);
    expect(cumulativeKeys).toContain('AD__C1000'); // d08 為上月公告
    expect(monthKeys).not.toContain('AD__C1000');
  });
});

describe('🔴 INV-G3：卡②「進度中」與圖例進度中總和之**刻意不等**（AC-G39）', () => {
  /**
   * 🔴 語料載體＝**d06（AS／法務部 C5000）**：該單位只有進度中、沒有任何已公告。
   * ⇒ ① 它不出現於任一環段與圖例列；② 卡② ＞ Σ(圖例進度中)。
   * 🔴 若語料中每個有進度中文件的組織都至少有一份已公告，本條恆真、零鑑別力。
   */
  it('① 只有進度中、沒有已公告之組織不產生環段（department 維度）', () => {
    const keys = slicesOf('department', 'cumulative').map((s) => s.key);
    expect(keys).not.toContain('AS__C5000');
    // 自我守護：該單位確實存在於語料且確實只有進度中之文件
    expect(DOCS.filter((d) => d.draftingDeptId === 'C5000')).toHaveLength(1);
    expect(deriveDisplayStatus('active', '2026-04-01', TODAY)).toBe('in_progress');
  });

  it('② 卡② ＞ Σ(圖例進度中)，且該不等式**實際發生**（不是註解）', () => {
    const cards = countCards(DOCS, TODAY);
    const legendInProgress = sum(slicesOf('department', 'cumulative').map((s) => s.inProgress));
    expect(cards.inProgress).toBe(3);
    expect(legendInProgress).toBe(2);
    expect(cards.inProgress).toBeGreaterThan(legendInProgress);
  });

  /**
   * ⚠ 本不等式**與維度有關**：於 `company`／`division` 維度下，d06 所屬之段因同公司／同本部
   * 另有已公告文件而存在 ⇒ 兩者相等。這是正確行為，記在此處以免日後有人把它「修好」。
   */
  it('於 company／division 維度下兩者相等（正確，非缺陷）', () => {
    const cards = countCards(DOCS, TODAY);
    for (const dim of ['company', 'division'] as const) {
      expect(sum(slicesOf(dim, 'cumulative').map((s) => s.inProgress))).toBe(cards.inProgress);
    }
  });
});

// ══════════════════════════ `AC-G85` 排序 ══════════════════════════

describe('AC-G85 — DonutSlice[] 之三層決定性排序', () => {
  it('第 1 層：announced 降冪；sentinel 段參與同一排序、**不置底**', () => {
    const keys = slicesOf('department', 'cumulative').map((s) => s.key);
    // AS__B1000=3（d01,d02,d14）／__unspecified__=2（d09,d10）／其餘四段皆 1
    expect(keys).toEqual([
      'AS__B1000',
      KEY_UNSPECIFIED,
      'ZZ__E1000',
      'AS__C1000',
      'AD__B1000',
      'AD__C1000',
    ]);
  });

  /**
   * 🔴 `AC-G85` ③ 之「不置底」鑑別力條件：sentinel 之 `announced` 必須**落在中間**
   * （既非最大也非最小）——若它剛好最小，置底與不置底輸出相同、該半句恆真。
   */
  it('AC-G85 ③ 自我守護：`未指定` 之 announced 嚴格介於最大與最小之間', () => {
    const slices = slicesOf('department', 'cumulative');
    const values = slices.map((s) => s.announced);
    const seg = slices.find((s) => s.key === KEY_UNSPECIFIED);
    expect(seg?.announced).toBeGreaterThan(Math.min(...values));
    expect(seg?.announced).toBeLessThan(Math.max(...values));
    // 且其後仍有真實組織（置底之實作會把它排到最後）
    const idx = slices.findIndex((s) => s.key === KEY_UNSPECIFIED);
    expect(idx).toBeLessThan(slices.length - 1);
  });

  it('division 維度之完整鍵序（`無本部` 亦不置底、依 announced 落位）', () => {
    expect(slicesOf('division', 'cumulative').map((s) => s.key)).toEqual([
      'AS__B0000',
      KEY_UNSPECIFIED,
      'ZZ__E0000',
      'AS__C0000',
      'AD__C0000',
      KEY_NO_DIVISION,
    ]);
  });

  it('company 維度之完整鍵序', () => {
    expect(slicesOf('company', 'cumulative').map((s) => s.key)).toEqual([
      'AS',
      'AD',
      KEY_UNSPECIFIED,
      'ZZ',
    ]);
  });

  /**
   * 🔴 第 2 層（`label` **序數**昇冪，禁 `localeCompare`）之 **ICU 無關**鑑別向量。
   *
   * 為何不用中文對：中文之序數序與 locale 序是否相異，取決於執行環境之 ICU 版本與 locale
   * 資料（本 repo 已記錄「同一份資料在不同機器排出不同順序」之漂移）——把它寫進斷言，
   * 本測試自己就成了那個漂移的受害者。
   * ⇒ 改用 **ASCII 大小寫對**：序數 `'ZB'(0x42) < 'Za'(0x61)`；而任何 locale 之預設定序皆為
   *    primary-level 大小寫不敏感（`a < b`）⇒ `'Za' < 'ZB'`。兩者**必然相反**，與 ICU 版本無關。
   * ⚠ 本組為**人工 fixture**（真實公司代碼為 2 碼大寫）；其唯一用途是讓「禁 localeCompare」
   *    這半句具有鑑別力。🔴 不得宣稱它在實機上被驗過。
   */
  describe('第 2 層 — 序數比較 vs localeCompare（人工 fixture）', () => {
    const CASE_ORGS: readonly OrgUnitRecord[] = [
      unit('ZB', 'A0000', 'DIVISION', '00000', '甲本部'),
      unit('ZB', 'A1000', 'DEPARTMENT', 'A0000', '甲部'),
      unit('Za', 'A0000', 'DIVISION', '00000', '乙本部'),
      unit('Za', 'A1000', 'DEPARTMENT', 'A0000', '乙部'),
    ];
    const CASE_DOCS: readonly AnalyticsDocRow[] = [
      doc('c1', 'C-1', '甲作業', null, 'active', '2026-03-01', 'ZB', 'A1000'),
      doc('c2', 'C-2', '乙作業', null, 'active', '2026-03-02', 'Za', 'A1000'),
    ];

    it('自我守護：localeCompare 與序數比較在本向量上確實相反', () => {
      expect(['Za', 'ZB'].slice().sort((a, b) => a.localeCompare(b))).toEqual(['Za', 'ZB']);
      expect(['Za', 'ZB'].slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
        'ZB',
        'Za',
      ]);
    });

    it('announced 同值時依 label 之**序數**昇冪（localeCompare 之實作會翻紅）', () => {
      const slices = donutSlices({
        docs: CASE_DOCS,
        orgUnits: CASE_ORGS,
        dimension: 'company',
        scope: 'cumulative',
        today: TODAY,
      });
      expect(slices.map((s) => s.announced)).toEqual([1, 1]);
      expect(slices.map((s) => s.label)).toEqual(['ZB', 'Za']);
    });
  });

  /**
   * 🔴 第 3 層（`key` 昇冪收尾）：需要**兩個 label 相同、key 不同**之段。
   * ⚠ **人工 fixture**：同一家公司之兩個部代碼具有相同顯示名（`descFull` 重複）。
   *    真實語料中是否可達未經查證 ⇒ 🔴 不得宣稱它在實機上被驗過；但第 3 層若被省略，
   *    兩段之相對次序會落到 `Array.prototype.sort` 的實作細節上（`AC-G93` 同一紀律）。
   */
  describe('第 3 層 — key 昇冪收尾（人工 fixture）', () => {
    const CASE_ORGS: readonly OrgUnitRecord[] = [
      unit('AS', 'C0000', 'DIVISION', '00000', '管理本部'),
      unit('AS', 'C1000', 'DEPARTMENT', 'C0000', '財會部'),
      unit('AS', 'C2000', 'DEPARTMENT', 'C0000', '財會部'),
    ];
    const CASE_DOCS: readonly AnalyticsDocRow[] = [
      doc('e1', 'E-1', '甲', null, 'active', '2026-03-01', 'AS', 'C2000'),
      doc('e2', 'E-2', '乙', null, 'active', '2026-03-02', 'AS', 'C1000'),
    ];

    it('label 相同、announced 相同時依 key 昇冪', () => {
      const slices = donutSlices({
        docs: CASE_DOCS,
        orgUnits: CASE_ORGS,
        dimension: 'department',
        scope: 'cumulative',
        today: TODAY,
      });
      expect(slices.map((s) => s.label)).toEqual([
        '和潤企業 / 管理本部 / 財會部',
        '和潤企業 / 管理本部 / 財會部',
      ]);
      expect(slices.map((s) => s.key)).toEqual(['AS__C1000', 'AS__C2000']);
    });
  });

  /**
   * `AC-G41`／`AC-G86`：端點恆回**全量**切片，Top N 合併屬前端版面參數
   * （⇒ 後端不得自行截斷；`donutSlices` 之輸出列數 ＝ 該窗口下有已公告文件之相異組織數）。
   */
  it('AC-G41：後端不截斷——段數 ＝ 有已公告文件之相異組織數（含 sentinel）', () => {
    expect(slicesOf('department', 'cumulative')).toHaveLength(6);
    expect(slicesOf('department', 'month')).toHaveLength(5);
  });
});

// ══════════════════════════ §丁 · 最新公告 ══════════════════════════

/**
 * 🔴 **2026-09-21：由 describe 內提升至模組層**（`AC-G96` 之新增 describe 也要用它）。
 *    這是純粹的作用域搬移，**沒有任何期望值改變**。
 */
/**
 * 🔴 `AC-G54`：上限套用於**排序之後**（先排序、再截斷）。
 * 🔴 「先截斷再排序會得到錯的十筆，且在小語料下看不出來」⇒ 語料須含 ≥ 12 筆。
 * 本語料刻意把**最新**的兩筆放在陣列**最後**——先截斷再排序之實作會漏掉它們。
 */
const POOL: readonly AnalyticsDocRow[] = [
  doc('p01', 'A-001', '文件 01', "26'01", 'active', '2026-01-01', 'AS', 'B1000'),
  doc('p02', 'A-002', '文件 02', null, 'active', '2026-01-02', 'AS', 'B1000'),
  doc('p03', 'A-003', '文件 03', "26'01", 'active', '2026-01-03', 'AS', 'B1000'),
  doc('p04', 'A-004', '文件 04', "26'01", 'active', '2026-01-04', 'AS', 'B1000'),
  doc('p05', 'A-005', '文件 05', "26'01", 'active', '2026-01-05', 'AS', 'B1000'),
  doc('p06', 'A-006', '文件 06', "26'01", 'active', '2026-01-06', 'AS', 'B1000'),
  doc('p07', 'A-007', '文件 07', "26'01", 'active', '2026-01-07', 'AS', 'B1000'),
  doc('p08', 'A-008', '文件 08', "26'01", 'active', '2026-01-08', 'AS', 'B1000'),
  doc('p09', 'A-009', '文件 09', "26'01", 'active', '2026-01-09', 'AS', 'B1000'),
  doc('p10', 'A-010', '文件 10', "26'01", 'active', '2026-01-10', 'AS', 'B1000'),
  // 🔴 母體排除：inactive／void／announcedDate 為 null
  doc('p11', 'A-011', '失效文件', "26'01", 'inactive', '2026-03-11', 'AS', 'B1000'),
  doc('p12', 'A-012', '作廢文件', "26'01", 'void', '2026-03-12', 'AS', 'B1000'),
  doc('p13', 'A-013', '無公告日文件', "26'01", 'active', null, 'AS', 'B1000'),
  // 🔴 同日兩筆（tie-break：documentNumber 昇冪）；刻意讓陣列順序與期望相反
  doc('p14', 'B-002', '同日文件乙', "26'01", 'active', '2026-03-14', 'AS', 'B1000'),
  doc('p15', 'B-001', '同日文件甲', null, 'active', '2026-03-14', 'AS', 'B1000'),
  // 🔴 未來公告日（狀態顯示為「進度中」，依降冪排在最上方）
  doc('p16', 'C-001', '未來公告文件', "26'02", 'active', '2026-03-31', 'AS', 'B1000'),
];

describe('latestAnnouncements — 母體、排序、tie-break、筆數上限（AC-G52～AC-G56）', () => {

  it('語料自我守護：合格母體 ≥ 12 筆（否則「先排序再截斷」無從分辨）', () => {
    const pool = POOL.filter((d) => d.status === 'active' && d.announcedDate !== null);
    expect(pool.length).toBeGreaterThanOrEqual(12);
  });

  it('AC-G52：母體恰為 active ∧ announcedDate 非 null（inactive／void／null 皆排除）', () => {
    const ids = latestAnnouncements(POOL, 100, TODAY).rows.map((r) => r.documentId);
    expect(ids).not.toContain('p11');
    expect(ids).not.toContain('p12');
    expect(ids).not.toContain('p13');
    expect(ids).toHaveLength(13);
  });

  it('AC-G53／AC-G54：先依公告日降冪排序、再截斷為 10 筆', () => {
    const { rows } = latestAnnouncements(POOL, 10, TODAY);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.documentId)).toEqual([
      'p16', // 2026-03-31（未來公告日 ⇒ 進度中，依降冪在最上方）
      'p15', // 2026-03-14 · B-001
      'p14', // 2026-03-14 · B-002（同日 tie-break：documentNumber 昇冪）
      'p10',
      'p09',
      'p08',
      'p07',
      'p06',
      'p05',
      'p04',
    ]);
  });

  it('AC-G53：同日者以 documentNumber **昇冪**為 tie-break（序數比較）', () => {
    const rows = latestAnnouncements(POOL, 100, TODAY).rows.filter(
      (r) => r.announcedDate === '2026-03-14',
    );
    expect(rows.map((r) => r.documentId)).toEqual(['p15', 'p14']);
  });

  /**
   * 🔴 `AC-G53` 之「完全決定性」第三層：仍同值時以 `documentId` 昇冪收尾。
   * 🔒 本 repo 已記錄之 ICU 定序漂移 ⇒ 明文禁止 `localeCompare`；此處以 ASCII 大小寫對取得
   *    與 ICU 無關之鑑別力（理由同 `AC-G85` 第 2 層之註解）。
   */
  it('AC-G53：documentNumber 之比較為序數，非 localeCompare（ASCII 大小寫對）', () => {
    const pair: readonly AnalyticsDocRow[] = [
      doc('q1', 'Xa-001', '甲', null, 'active', '2026-03-14', 'AS', 'B1000'),
      doc('q2', 'XB-001', '乙', null, 'active', '2026-03-14', 'AS', 'B1000'),
    ];
    expect(latestAnnouncements(pair, 10, TODAY).rows.map((r) => r.documentId)).toEqual(['q2', 'q1']);
  });

  it('AC-G53：documentNumber 亦相同時以 documentId 昇冪收尾（絕對決定性）', () => {
    const pair: readonly AnalyticsDocRow[] = [
      doc('z2', 'SAME-1', '乙', null, 'active', '2026-03-14', 'AS', 'B1000'),
      doc('z1', 'SAME-1', '甲', null, 'active', '2026-03-14', 'AS', 'B1000'),
    ];
    expect(latestAnnouncements(pair, 10, TODAY).rows.map((r) => r.documentId)).toEqual(['z1', 'z2']);
  });

  it('AC-G55：displayStatus 為衍生顯示狀態（announced／in_progress），不是原始 status', () => {
    const { rows } = latestAnnouncements(POOL, 100, TODAY);
    expect(rows.find((r) => r.documentId === 'p16')?.displayStatus).toBe('in_progress');
    expect(rows.find((r) => r.documentId === 'p10')?.displayStatus).toBe('announced');
    // 🔒 映射表不得因「母體下只會出現兩值」而裁減；DISPLAY_LABEL 仍為四值。
    expect(Object.keys(DISPLAY_LABEL)).toEqual(['announced', 'in_progress', 'inactive', 'void']);
  });

  it('AC-G56：edition 原樣送出（null 不在後端代換為文字；前端以 EDITION_NONE_TEXT 呈現）', () => {
    const { rows } = latestAnnouncements(POOL, 100, TODAY);
    expect(rows.find((r) => r.documentId === 'p15')?.edition).toBeNull();
    expect(rows.find((r) => r.documentId === 'p14')?.edition).toBe("26'01");
  });

  it('AC-G56：announcedDate 為 YYYY-MM-DD（UTC 拆解）', () => {
    for (const r of latestAnnouncements(POOL, 100, TODAY).rows) {
      expect(r.announcedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('AC-G57：母體為空 ⇒ 回空陣列（由前端呈現 empty-state）', () => {
    expect(latestAnnouncements([], 10, TODAY).rows).toEqual([]);
    expect(latestAnnouncements([POOL[12]], 10, TODAY).rows).toEqual([]); // p13：無公告日
  });
});

// ══════════════════════════ `AC-G96` · latestAnnouncementsTotal ══════════════════════════

/**
 * F044 `AC-G96`（2026-09-21 新增；本環提報「前端結構上算不出 `{n}`」後由 lead 裁定）。
 *
 * 🔴 **`total` 必須取自截斷前的同一個 `pool`（即 `pool.length`）**；
 *    🔴 **明文禁止另寫一次過濾條件、禁止第二次查詢、禁止新增端點**。
 * > 🔴 **理由（逐字）**：另寫一次過濾就是 `AC-G3` 那個「同一件事兩個定義點」的形狀重演
 * >    ——**兩份初始碰巧相同，漂移前兩份都會綠**。且本例之成本為**零**：`pool` 已經在那支純函式手上。
 */
describe('AC-G96 — latestAnnouncementsTotal ＝ 截斷前之 pool.length', () => {
  it('total ＝ 母體總數（status active ∧ announcedDate 非 null），與 limit 無關', () => {
    expect(latestAnnouncements(POOL, 10, TODAY).total).toBe(13);
    expect(latestAnnouncements(POOL, 100, TODAY).total).toBe(13);
    expect(latestAnnouncements(POOL, 3, TODAY).total).toBe(13);
  });

  it('🔴 兩種規模：超過上限時 total > rows.length；未達上限時兩者相等', () => {
    const over = latestAnnouncements(POOL, 10, TODAY);
    expect(over.rows).toHaveLength(10);
    expect(over.total).toBeGreaterThan(over.rows.length);

    const under = latestAnnouncements(POOL.slice(0, 3), 10, TODAY);
    expect(under.total).toBe(under.rows.length);
  });

  /**
   * 🔴 **鑑別力：`total` 不得由「另寫一次過濾」求得。**
   * 本語料下，三種最可能的錯寫各自給出**不同**的數字：
   *  · `docs.length`（完全沒過濾）⇒ 16
   *  · 漏掉 `announcedDate !== null` ⇒ 15（多算 p13）
   *  · 漏掉 `status === 'active'` ⇒ 15（多算 p11 inactive、p12 void）
   * ⇒ 正確答案 13 與上述三者**皆不相同**，任一錯寫都會翻紅。
   */
  it('自我守護：語料能分辨「沒過濾／漏一個條件」三種錯寫（否則本條恆真）', () => {
    expect(POOL).toHaveLength(16);
    const missNullCheck = POOL.filter((d) => d.status === 'active').length;
    const missStatusCheck = POOL.filter((d) => d.announcedDate !== null).length;
    const correct = latestAnnouncements(POOL, 100, TODAY).total;
    expect(correct).toBe(13);
    expect(missNullCheck).not.toBe(correct);
    expect(missStatusCheck).not.toBe(correct);
    expect(POOL.length).not.toBe(correct);
  });

  it('🔒 total 與 rows 之母體為同一個（rows 之全量 ＝ total）', () => {
    const all = latestAnnouncements(POOL, Number.MAX_SAFE_INTEGER, TODAY);
    expect(all.rows).toHaveLength(all.total);
  });

  it('母體為空 ⇒ total 為 0（不得為 undefined）', () => {
    expect(latestAnnouncements([], 10, TODAY).total).toBe(0);
    expect(latestAnnouncements([POOL[12]], 10, TODAY).total).toBe(0); // p13：無公告日
  });
});

// ══════════════════════════ `AC-G70` · INV-G7 同源 ══════════════════════════

describe('🔒 AC-G70／INV-G7：五處「已公告／進度中」判定逐筆同源', () => {
  /**
   * 🔴 可測形狀：以**同一份語料**同時驅動卡片、兩張環圖與最新公告清單，
   * 斷言每一份文件之「已公告」判定與 `deriveDisplayStatus` 之輸出**逐筆一致**。
   * ⇒ 任一處改用裸比較（例如環圖用 `announcedDate <= today` 而漏掉 `status` 條件），
   *   d11（inactive 且公告日已過）會在該處被算成已公告 ⇒ 恆等鎖與本案同時翻紅。
   */
  it('每一份文件之 announced 判定與 deriveDisplayStatus 逐筆一致', () => {
    const expectedAnnounced = new Set(
      DOCS.filter((d) => deriveDisplayStatus(d.status, d.announcedDate, TODAY) === 'announced').map(
        (d) => d.documentId,
      ),
    );
    // ① 卡片
    expect(countCards(DOCS, TODAY).announced).toBe(expectedAnnounced.size);
    // ②③ 兩張環圖（累積窗口 ＝ 不限時間 ⇒ 總和即全部已公告）
    for (const dim of ['company', 'division', 'department'] as const) {
      expect(sum(slicesOf(dim, 'cumulative').map((s) => s.announced))).toBe(expectedAnnounced.size);
    }
    // ④ 最新公告清單之狀態欄
    for (const r of latestAnnouncements(DOCS, 100, TODAY).rows) {
      expect(r.displayStatus).toBe(expectedAnnounced.has(r.documentId) ? 'announced' : 'in_progress');
    }
    // 自我守護：語料中兩種判定皆有代表，否則上面全部退化為恆真
    expect(expectedAnnounced.size).toBeGreaterThan(0);
    expect(DOCS.length - expectedAnnounced.size).toBeGreaterThan(0);
  });
});
