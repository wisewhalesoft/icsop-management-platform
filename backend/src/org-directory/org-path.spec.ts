import { departmentCodeOf, orgUnitDisplayName } from './org-path';

/**
 * `orgUnitDisplayName()`＝`制定部門`／`制定室別` 兩欄之顯示名（2026-09-04 走 A+ 定案）。
 *
 * 🔴 **語料一律取自 dev SOP 庫 2026-09-04 之實測列**（`ORG_UNIT` 139 筆 active 部/處室），
 * 不自編乾淨假資料。理由：上游 `DESC_CHI` 的不一致正是本函式存在的理由，若語料裡每筆
 * `name` 都恰好等於 `descFull`、每個 SECTION 的 `name` 都恰好沒有斜線，則「回傳 name」與
 * 「回傳 descFull／切前綴」兩種實作在該語料下輸出完全相同 ⇒ 斷言恆真、抓不到退化。
 * 下列每一筆都刻意選成**數種可能實作會給出相異答案**的列。
 */
type Unit = { orgCode: string; tier: string; name: string; descFull: string | null };

/** dev SOP 庫實測列（`companyCode` 於本檔不參與運算，故以單一公司為範圍即足）。 */
const UNITS: Unit[] = [
  // ── 部層：三種形態俱全 ──────────────────────────────────────────────
  { orgCode: 'JA000', tier: 'DEPARTMENT', name: '營管部', descFull: '營運管理部' }, // 真簡稱
  { orgCode: 'AI000', tier: 'DEPARTMENT', name: '企劃', descFull: '企劃部' }, // 缺尾字
  { orgCode: 'CF000', tier: 'DEPARTMENT', name: '作業服務部', descFull: '作業服務部' }, // 已相等
  { orgCode: 'CC000', tier: 'DEPARTMENT', name: '信用審查', descFull: '信用審查部' },
  { orgCode: 'CD000', tier: 'DEPARTMENT', name: '債權管理', descFull: '債權管理部' },
  { orgCode: 'BA000', tier: 'DEPARTMENT', name: '車輛分期營一', descFull: '車輛分期營業一部' },
  { orgCode: 'DA000', tier: 'DEPARTMENT', name: '財會部', descFull: '財務會計部' },
  { orgCode: 'NA000', tier: 'DEPARTMENT', name: '業務開發部', descFull: '業務開發部' },
  { orgCode: 'BJ000', tier: 'DEPARTMENT', name: '供金部', descFull: '供應商金融部' },
  // ── 處/室 ──────────────────────────────────────────────────────────
  { orgCode: 'JAC00', tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室' },
  { orgCode: 'CFA00', tier: 'SECTION', name: '作服/文管室', descFull: '作業服務部文案管理室' },
  // 🔴 兩筆 DESC_CHI 末段皆為「企金室」，唯有切 DESC_FULL 前綴才能區分。
  { orgCode: 'CCC00', tier: 'SECTION', name: '信審/企金室', descFull: '信用審查部企金審查室' },
  { orgCode: 'CDF00', tier: 'SECTION', name: '債管/企金室', descFull: '債權管理部企金催收室' },
  // DESC_FULL 本身帶斜線之特例
  {
    orgCode: 'BAJ00',
    tier: 'SECTION',
    name: '車輛分期營一/北三',
    descFull: '車輛分期營業一部/台北營業三處',
  },
  // 切出之尾段本身含斜線（切完仍須完整保留）
  {
    orgCode: 'DAA00',
    tier: 'SECTION',
    name: '財會/財管室',
    descFull: '財務會計部財會管理室/和潤暨海外事業',
  },
  // 部名不是自身 DESC_FULL 之前綴（業務開發「處」vs 業務開發「部」）→ 退回末段
  { orgCode: 'NAA00', tier: 'SECTION', name: '業務開發處', descFull: '業務開發處' },
  // 部層列不存在（WA000 查無）→ 退回末段
  { orgCode: 'WAA00', tier: 'SECTION', name: '職安室', descFull: '職業安全衛生室' },
  // 課層：DESC_FULL 為 null → 退回末段
  { orgCode: 'BJAA0', tier: 'SUBSECTION', name: '供金部/北區綜合處/醫療一課', descFull: null },
];

const byCode = new Map(UNITS.map((u) => [u.orgCode, u]));
const lookup = (code: string): Unit | null => byCode.get(code) ?? null;
const display = (orgCode: string): string => orgUnitDisplayName(byCode.get(orgCode)!, lookup);

describe('departmentCodeOf', () => {
  it('取 LEFT(CODE,2)+"000"（契約 §3.5）', () => {
    expect(departmentCodeOf('JAC00')).toBe('JA000');
    expect(departmentCodeOf('BJAA0')).toBe('BJ000'); // 課層亦上溯至部層，不是中間處層
    expect(departmentCodeOf('JA000')).toBe('JA000');
  });
});

describe('orgUnitDisplayName — 部層以上 → DESC_FULL 全名', () => {
  it('name 為簡稱時取 descFull（JA000：營管部 → 營運管理部）', () => {
    expect(display('JA000')).toBe('營運管理部');
    expect(display('DA000')).toBe('財務會計部');
    expect(display('BA000')).toBe('車輛分期營業一部');
  });

  it('name 只是缺了尾字時同樣取 descFull（AI000：企劃 → 企劃部）', () => {
    expect(display('AI000')).toBe('企劃部');
    expect(display('CC000')).toBe('信用審查部');
  });

  it('name 已等於全名 → 輸出不變（CF000：作業服務部）', () => {
    expect(display('CF000')).toBe('作業服務部');
  });

  it('descFull 為 null（上游可能缺值，OQ-DESCFULL-2）→ 退回 name，不得吐空字串', () => {
    const u: Unit = { orgCode: 'JA000', tier: 'DEPARTMENT', name: '營管部', descFull: null };
    expect(orgUnitDisplayName(u, lookup)).toBe('營管部');
  });

  it('本部層／Root 同樣走 descFull', () => {
    expect(
      orgUnitDisplayName(
        { orgCode: 'J0000', tier: 'DIVISION', name: '營業二本部', descFull: '營業二本部' },
        lookup,
      ),
    ).toBe('營業二本部');
    expect(
      orgUnitDisplayName(
        { orgCode: '00000', tier: 'ROOT', name: '和潤本部', descFull: '和潤本部' },
        lookup,
      ),
    ).toBe('和潤本部');
  });
});

describe('orgUnitDisplayName — 處/室、課 → DESC_FULL 切除部層前綴', () => {
  /**
   * 🔴 本案排除三種錯誤實作：回 `name` 得 `營管部/審查室`（部名重複於隔壁欄）、
   * 回 `descFull` 得 `營運管理部審查室`（串接全名）。本例之 DESC_CHI 末段恰好也是 `審查室`，
   * 故另有下方 `CFA00`／`CCC00` 兩案專門排除「取末段」之實作。
   */
  it('JAC00：營運管理部審查室 − 營運管理部 ＝ 審查室', () => {
    expect(display('JAC00')).toBe('審查室');
    expect(display('JAC00')).not.toBe(byCode.get('JAC00')!.name);
    expect(display('JAC00')).not.toBe(byCode.get('JAC00')!.descFull);
  });

  it('🔴 CFA00：得室之**全名**「文案管理室」，而非 DESC_CHI 末段之簡稱「文管室」', () => {
    expect(display('CFA00')).toBe('文案管理室');
    expect(display('CFA00')).not.toBe('文管室'); // ← 走 A（末段）之答案，本條即 A→A+ 之分界
  });

  /**
   * 🔒 **A+ 的核心理由**：兩個不同部之下的處室，其 `DESC_CHI` 末段**完全相同**（皆為
   * `企金室`）——走 A 時同一欄會出現兩筆看起來一模一樣、實則不同單位的值。
   */
  it('🔒 CCC00 與 CDF00 之 DESC_CHI 末段同為「企金室」，切前綴後可區分', () => {
    // 前提：兩者末段確實相同（語料若變動，本行先紅，避免下方斷言變成恆真）
    expect(byCode.get('CCC00')!.name.split('/').pop()).toBe(
      byCode.get('CDF00')!.name.split('/').pop(),
    );
    expect(display('CCC00')).toBe('企金審查室');
    expect(display('CDF00')).toBe('企金催收室');
    expect(display('CCC00')).not.toBe(display('CDF00'));
  });

  it('BAJ00：descFull 本身帶斜線 → 切前綴後去掉殘留之前導 `/`', () => {
    expect(display('BAJ00')).toBe('台北營業三處');
  });

  it('DAA00：切出之尾段本身含斜線 → 完整保留（不得再 split）', () => {
    expect(display('DAA00')).toBe('財會管理室/和潤暨海外事業');
  });

  it('NAA00：部名非自身 descFull 之前綴（業務開發處 vs 業務開發部）→ 退回 DESC_CHI 末段', () => {
    expect(display('NAA00')).toBe('業務開發處');
  });

  it('WAA00：部層列不存在（WA000 查無）→ 退回 DESC_CHI 末段', () => {
    expect(display('WAA00')).toBe('職安室');
  });

  it('BJAA0：課層 descFull 為 null → 退回 DESC_CHI 最末段（略過中間處層）', () => {
    expect(display('BJAA0')).toBe('醫療一課');
  });

  it('name 與可切前綴皆不可用 → 退回 descFull（寧可顯示串接全名，也不留空欄）', () => {
    const u: Unit = { orgCode: 'ZZ100', tier: 'SECTION', name: '', descFull: '某某部某某室' };
    expect(orgUnitDisplayName(u, () => null)).toBe('某某部某某室');
  });

  it('切完為空字串（descFull 恰等於部名）→ 不採用，退回末段', () => {
    const u: Unit = {
      orgCode: 'JAC00',
      tier: 'SECTION',
      name: '營管部/審查室',
      descFull: '營運管理部',
    };
    expect(orgUnitDisplayName(u, lookup)).toBe('審查室');
  });
});

/**
 * 🔒 回歸鎖：整份 dev 語料逐筆過一次。
 *  ① 輸出恆非空——空欄比簡稱更糟。
 *  ② `部段/室段` 形態之 `name` 一律不得原樣輸出（那是 2026-09-04 真人回報之退化形狀）。
 */
describe('🔒 全語料回歸鎖', () => {
  it('每一筆輸出皆非空字串', () => {
    for (const u of UNITS) expect(orgUnitDisplayName(u, lookup)).not.toBe('');
  });

  it('複合字串形態之處/室不得原樣輸出 DESC_CHI', () => {
    const compound = UNITS.filter(
      (u) => (u.tier === 'SECTION' || u.tier === 'SUBSECTION') && u.name.includes('/'),
    );
    expect(compound.length).toBeGreaterThan(0); // 語料確實含該形態，否則本案恆真
    for (const u of compound) expect(orgUnitDisplayName(u, lookup)).not.toBe(u.name);
  });
});
