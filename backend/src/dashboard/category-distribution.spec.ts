import { AnalyticsDocRow, countCards } from './dashboard-analytics';
import { CategoryDocPair, categoryDistribution } from './category-distribution';

/**
 * F044 §戊 — 依業務/功能類別分布之**純函式層**建環
 * （`backend/src/dashboard/category-distribution.ts`）。
 *
 * 涵蓋：`AC-G61`（類別為統計單位、同類別內去重）、`AC-G62`（僅 active、分兩色）、
 * `AC-G63`（停用類別／零掛載不顯示）、`AC-G64`（三層決定性排序、禁 `localeCompare`）、
 * `AC-G68`（INV-G4／INV-G5 兩條**刻意不等**）。語料要求＝§癸 (c) 之六種形狀。
 *
 * 🔴 **本檔對實作全盲**：`./category-distribution` 於建環當下尚不存在 ⇒ 預期紅燈為
 *    `Cannot find module './category-distribution'`。
 *
 * 🔒 **契約**（`architecture-spec` §15.5 ② ＋ §15.1 之「唯一例外＝類別掛載之 DISTINCT」）：
 * ```
 * export interface CategoryDocPair {
 *   categoryId: string; displayName: string;            // = businessCategoryDisplayName（F043 既有組裝）
 *   categoryStatus: 'active' | 'inactive';
 *   documentId: string; documentStatus: DocumentStatus; announcedDate: string | null;
 * }
 * export interface CategoryBar {
 *   categoryId: string; displayName: string; announced: number; inProgress: number;
 * }
 * export function categoryDistribution(
 *   pairs: readonly CategoryDocPair[], today: Date,
 * ): CategoryBar[];   // 已排序、🔴 全量（Top 10 截斷與展開屬前端版面）
 * ```
 *
 * ⚠ **本層之盲區（architecture-spec §15.10 #1，逐字轉述）**：SQL 之 join ＋
 *    `DISTINCT (businessCategoryId, documentId)` 是否正確，本輪**無整合測試可驗**——純函式層
 *    只驗「給定 pairs → 正確分布」，不驗 pairs 本身是否來自正確的 join。
 *    ⇒ 本檔仍餵入**重複的 pair**（同一份文件、同一個類別、兩個節點）並要求只計一次：
 *      SQL 端已 DISTINCT 時這是冗餘的防禦，SQL 端被改壞時它是唯一還站著的那一道。
 */

const TODAY = new Date('2026-03-15T00:00:00.000Z');

function docRow(
  documentId: string,
  status: AnalyticsDocRow['status'],
  announcedDate: string | null,
): AnalyticsDocRow {
  return {
    documentId,
    documentNumber: `NUM-${documentId}`,
    documentName: `文件 ${documentId}`,
    edition: null,
    status,
    announcedDate,
    companyCode: 'AS',
    draftingDeptId: 'B1000',
  };
}

/**
 * 文件語料。
 *  · k1 已公告｜k2 進度中（未來公告日）｜k3 進度中（無公告日）
 *  · k4 **inactive**（§癸 (c) ④：使 INV-G5 取到嚴格小於）
 *  · k5 已公告（上月）｜k7 **void**
 *  · 🔴 k6 ＝ **完全未掛任何類別之文件**（§癸 (c) ③：INV-G4 之第二個成因）
 */
const DOCS: readonly AnalyticsDocRow[] = [
  docRow('k1', 'active', '2026-03-01'),
  docRow('k2', 'active', '2026-03-31'),
  docRow('k3', 'active', null),
  docRow('k4', 'inactive', '2026-02-01'),
  docRow('k5', 'active', '2026-02-10'),
  docRow('k6', 'active', '2026-03-05'),
  docRow('k7', 'void', '2026-03-02'),
];

const DOC_BY_ID = new Map(DOCS.map((d) => [d.documentId, d]));

function pair(
  categoryId: string,
  displayName: string,
  categoryStatus: 'active' | 'inactive',
  documentId: string,
): CategoryDocPair {
  const d = DOC_BY_ID.get(documentId);
  if (!d) throw new Error(`語料錯誤：未知文件 ${documentId}`);
  return {
    categoryId,
    displayName,
    categoryStatus,
    documentId,
    documentStatus: d.status,
    announcedDate: d.announcedDate,
  };
}

/**
 * 掛載語料（§癸 (c) 六種形狀）。
 *  ① 🔴 **同一份文件掛在同一類別之多個節點**：bc1 × k1 出現**兩次**（驗去重）。
 *  ② 🔴 **同一份文件掛在不同類別**：k1 同時在 bc1／bc2／bc8（驗 INV-G4 之重複計入確實發生）。
 *  ③ 🔴 k6 完全未掛任何類別（見上方文件語料）。
 *  ④ 🔴 bc1 掛有 **inactive** 之 k4（驗 INV-G5 取到嚴格小於）。
 *  ⑤ 🔴 bc4 為**停用類別**（驗 `AC-G63` 第 1 句）。
 *  ⑥ 🔴 bc1 與 bc2 之總數相同、顯示名不同（驗 `AC-G64` 第 2 層）。
 *  ⑦ 🔴 bc5／bc6 掛有文件但**全部是 inactive／void** ⇒ 兩段皆 0 ⇒ 不顯示（`AC-G63` 第 3 句）。
 */
const PAIRS: readonly CategoryDocPair[] = [
  pair('bc1', '授信（消金）', 'active', 'k1'),
  // ① 🔴 同一份文件、同一類別、第二個節點 ⇒ **只計一次**
  pair('bc1', '授信（消金）', 'active', 'k1'),
  pair('bc1', '授信（消金）', 'active', 'k2'),
  pair('bc1', '授信（消金）', 'active', 'k4'),
  // ② 🔴 k1 亦掛在 bc2（不同類別 ⇒ 各計一次）
  pair('bc2', '授信（企金）', 'active', 'k1'),
  pair('bc2', '授信（企金）', 'active', 'k5'),
  pair('bc3', '風險管理', 'active', 'k3'),
  // ⑤ 停用類別（其掛載正常，但整列不顯示）
  pair('bc4', '帳務處理（子公司）', 'inactive', 'k1'),
  pair('bc4', '帳務處理（子公司）', 'inactive', 'k5'),
  // ⑦ 掛有文件但全部不計入 ⇒ 兩段皆 0 ⇒ 不顯示
  pair('bc5', '作業風險', 'active', 'k4'),
  pair('bc6', '法令遵循', 'active', 'k7'),
  /**
   * ⑥b 🔴 **ICU 無關之 tie-break 鑑別對**（理由同 `dashboard-analytics.spec.ts` `AC-G85` 第 2 層）：
   * 序數 `'ZB…'(0x42) < 'Za…'(0x61)`；任何 locale 之預設定序皆 primary-level 大小寫不敏感
   * ⇒ `'Za…' < 'ZB…'`。兩者**必然相反**，與 ICU 版本無關。
   * ⚠ **人工 fixture**（真實類別名為中文）；🔴 不得宣稱它在實機上被驗過。
   */
  pair('bc7', 'Za 作業', 'active', 'k5'),
  pair('bc8', 'ZB 作業', 'active', 'k1'),
];

const bars = (): ReturnType<typeof categoryDistribution> => categoryDistribution(PAIRS, TODAY);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

describe('categoryDistribution — 去重與狀態分色（AC-G61／AC-G62）', () => {
  it('AC-G61：同一份文件在同一類別內只計一次（相異 documentId）', () => {
    const bc1 = bars().find((b) => b.categoryId === 'bc1');
    // 自我守護：語料中 bc1×k1 確實出現兩次，否則本案恆真
    expect(PAIRS.filter((p) => p.categoryId === 'bc1' && p.documentId === 'k1')).toHaveLength(2);
    expect(bc1?.announced).toBe(1); // 不是 2
    expect(bc1?.inProgress).toBe(1); // k2
  });

  it('AC-G62：僅 active 計入，且依 deriveDisplayStatus 分為已公告／進度中兩段', () => {
    const bc1 = bars().find((b) => b.categoryId === 'bc1');
    // bc1 掛 k1（已公告）／k2（進度中）／k4（inactive，**完全不計入**）
    expect(bc1?.announced).toBe(1);
    expect(bc1?.inProgress).toBe(1);
    expect((bc1?.announced ?? 0) + (bc1?.inProgress ?? 0)).toBe(2);
  });

  it('AC-G61 ⚠：一份文件掛在多個「不同」類別時，在每一個類別各計一次', () => {
    const rows = bars();
    expect(rows.find((b) => b.categoryId === 'bc1')?.announced).toBe(1);
    expect(rows.find((b) => b.categoryId === 'bc2')?.announced).toBe(2); // k1 + k5
    expect(rows.find((b) => b.categoryId === 'bc8')?.announced).toBe(1); // k1
  });
});

describe('categoryDistribution — 類別之取捨（AC-G63）', () => {
  it('停用之類別不顯示', () => {
    expect(bars().some((b) => b.categoryId === 'bc4')).toBe(false);
    // 自我守護：bc4 確實有掛載（否則本案與「零掛載」那一條無從分辨）
    expect(PAIRS.filter((p) => p.categoryId === 'bc4').length).toBeGreaterThan(0);
  });

  it('兩段皆為 0 之類別不顯示（有掛載、但全部是 inactive／void）', () => {
    expect(bars().some((b) => b.categoryId === 'bc5')).toBe(false);
    expect(bars().some((b) => b.categoryId === 'bc6')).toBe(false);
  });

  it('完全沒有掛載之類別亦不顯示（其與上一條在畫面上不可分辨，屬已接受之代價）', () => {
    const withEmpty = [...PAIRS];
    expect(categoryDistribution(withEmpty, TODAY).some((b) => b.categoryId === 'bc99')).toBe(false);
  });
});

describe('categoryDistribution — 三層決定性排序（AC-G64）', () => {
  it('完整次序：總數降冪 → displayName 序數昇冪 → categoryId 昇冪', () => {
    expect(bars().map((b) => b.categoryId)).toEqual(['bc2', 'bc1', 'bc8', 'bc7', 'bc3']);
  });

  it('🔒 主向量：兩個總數相同、顯示名不同之類別（第 2 層之序數比較）', () => {
    const rows = bars();
    const bc1 = rows.find((b) => b.categoryId === 'bc1');
    const bc2 = rows.find((b) => b.categoryId === 'bc2');
    expect((bc1?.announced ?? 0) + (bc1?.inProgress ?? 0)).toBe(2);
    expect((bc2?.announced ?? 0) + (bc2?.inProgress ?? 0)).toBe(2);
    expect(rows.indexOf(bc2!)).toBeLessThan(rows.indexOf(bc1!));
  });

  it('第 2 層為**序數**比較，非 localeCompare（ICU 無關之大小寫對）', () => {
    // 自我守護：兩種比較子在本向量上確實相反
    expect(['Za 作業', 'ZB 作業'].slice().sort((a, b) => a.localeCompare(b))).toEqual([
      'Za 作業',
      'ZB 作業',
    ]);
    expect(['Za 作業', 'ZB 作業'].slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      'ZB 作業',
      'Za 作業',
    ]);
    const ids = bars().map((b) => b.categoryId);
    expect(ids.indexOf('bc8')).toBeLessThan(ids.indexOf('bc7'));
  });

  /**
   * 第 3 層（`categoryId` 昇冪收尾）。⚠ **人工 fixture**（`AC-G64` 之就地更正第 3 點明文要求
   * 以 `{name:'X（Y）', subcategory:null}` ＋ `{name:'X', subcategory:'Y'}` 建構）：
   * 兩者之 `(name, subcategory)` 配對不同（INV-B1 不擋）、`name` 亦不同（INV-B2 不擋），
   * 但**兩者之 displayName 都是 `授信（消金）`**。
   * 🔴 該碰撞只在「名稱本身含全形括號」這個病態輸入下可達；🔴 不得宣稱它在實機／真實語料上被驗過。
   */
  it('第 3 層：displayName 相同、總數相同時依 categoryId 昇冪（人工 fixture）', () => {
    const collide: readonly CategoryDocPair[] = [
      // { name: '授信（消金）', subcategory: null }
      pair('bcB', '授信（消金）', 'active', 'k1'),
      // { name: '授信', subcategory: '消金' } —— 不同配對、不同 name，但 displayName 相同
      pair('bcA', '授信（消金）', 'active', 'k5'),
    ];
    const rows = categoryDistribution(collide, TODAY);
    expect(rows.map((b) => b.displayName)).toEqual(['授信（消金）', '授信（消金）']);
    expect(rows.map((b) => b.categoryId)).toEqual(['bcA', 'bcB']);
  });
});

describe('🔴 AC-G68 — 兩條**刻意不等**必須實際發生（INV-G4／INV-G5）', () => {
  /**
   * 🔴 INV-G4：`Σ(各類別之已公告＋進度中)` **不等於** `卡① + 卡②`。
   * 兩個成因都必須在語料中同時出現，否則本條恆真：
   *   ① 一份文件掛多個類別會被重複計入（k1 在 bc1／bc2／bc8）；
   *   ② 未掛任何類別之文件完全不出現（k6）。
   */
  it('INV-G4：兩個成因皆在語料中出現，且不等式實際發生', () => {
    const attached = new Set(PAIRS.map((p) => p.documentId));
    // 成因① — k1 出現於三個相異類別
    const k1Categories = new Set(PAIRS.filter((p) => p.documentId === 'k1').map((p) => p.categoryId));
    expect(k1Categories.size).toBeGreaterThanOrEqual(3);
    // 成因② — k6 完全未掛任何類別
    expect(attached.has('k6')).toBe(false);

    const cards = countCards(DOCS, TODAY);
    const barTotal = sum(bars().map((b) => b.announced + b.inProgress));
    expect(cards.announced + cards.inProgress).toBe(5); // k1,k5,k6 已公告 + k2,k3 進度中
    expect(barTotal).toBe(7);
    expect(barTotal).not.toBe(cards.announced + cards.inProgress);
  });

  /**
   * 🔴 INV-G5：某類別之（已公告＋進度中） **≤** 類別池清單同一列之「掛載文件數」
   * （後者計**全部**掛載文件、不分狀態）。
   * 🔴 語料必須含一個掛有 `inactive` 文件之類別，使該不等式取到**嚴格小於**。
   */
  it('INV-G5：對每一列皆 ≤，且 bc1 取到嚴格小於（因其掛有 inactive 之 k4）', () => {
    const rows = bars();
    let strictlyLess = 0;
    for (const b of rows) {
      // 類別池口徑＝該類別之**相異文件數**，不分狀態（F043 `AC-01`）
      const poolCount = new Set(
        PAIRS.filter((p) => p.categoryId === b.categoryId).map((p) => p.documentId),
      ).size;
      expect(b.announced + b.inProgress).toBeLessThanOrEqual(poolCount);
      if (b.announced + b.inProgress < poolCount) strictlyLess += 1;
    }
    // 🔴 自我守護：若沒有任何一列取到嚴格小於，「≤」退化為「＝」，本條零鑑別力
    expect(strictlyLess).toBeGreaterThanOrEqual(1);

    const bc1 = rows.find((b) => b.categoryId === 'bc1');
    expect(bc1?.announced ?? 0).toBe(1);
    expect(bc1?.inProgress ?? 0).toBe(1);
    // 類別池同一列：k1／k2／k4 共 3 份（不分狀態）
    expect(
      new Set(PAIRS.filter((p) => p.categoryId === 'bc1').map((p) => p.documentId)).size,
    ).toBe(3);
  });
});
