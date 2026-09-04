import { describe, it, expect } from 'vitest';
import { buildOrgPath, departmentCodeOf, orgUnitDisplayName } from './org-path';
import type { OrgUnitRecord } from '../api/types';

/**
 * 使用者組織路徑顯示（prototypes/03-public-list.html 第 33 / 79 行「營運管理部 / 審查室」）。
 *
 * 定案（OQ-PS-03）：以伺服器提供之 `descFull`（上游 DESC_FULL，白名單欄）為部層來源，
 * 不由前端沿 parentCode 鏈自組——全站僅一套「組織全名」算法（複用 F020 浮水印之同一規則，
 * 見 upstream-hr-source-contract.md §8.2）：
 *   部   ＝ 部層（LEFT(2)+'000'）之 DESC_FULL，fallback 本部層 → Root
 *   處/室 ＝ 自身 DESC_CHI（`name`）以 '/' 切分之最末段（僅 SECTION/SUBSECTION 有值）
 * 兩段以 ' / ' 相接，**捨本部層**——與本專案三級組織模型（公司 / 部 / 處室）及 prototype 一致。
 */
const unit = (over: Partial<OrgUnitRecord> & { orgCode: string }): OrgUnitRecord => ({
  companyCode: 'AS',
  codePrefix: over.orgCode.replace(/0+$/, ''),
  parentCode: null,
  tier: 'SECTION',
  name: '單位',
  descFull: null,
  managerEmpNo: null,
  isActive: true,
  ...over,
});

const AS_UNITS: OrgUnitRecord[] = [
  unit({ orgCode: 'J0000', tier: 'DIVISION', name: '營業二本部', descFull: '營業二本部' }),
  unit({ orgCode: 'JA000', tier: 'DEPARTMENT', name: '營管部', descFull: '營運管理部' }),
  unit({ orgCode: 'JAC00', tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室' }),
  unit({ orgCode: 'JC000', tier: 'DEPARTMENT', name: '供金部', descFull: '供應商金融部' }),
  unit({ orgCode: 'JCH00', tier: 'SECTION', name: '供金部/北區綜合處', descFull: '供應商金融部北區綜合處' }),
  unit({ orgCode: 'JCHA0', tier: 'SUBSECTION', name: '供金部/北區綜合處/醫療一課', descFull: null }),
];

describe('buildOrgPath（部層 descFull ／ DESC_CHI 末段）', () => {
  it('TS-PS-PATH-001 處室層使用者 → 「部 / 處室」，捨本部層', () => {
    // prototype 03 第 33/79 行逐字格式：營運管理部 / 審查室（不含「營業二本部」）
    expect(buildOrgPath(AS_UNITS, 'JAC00')).toBe('營運管理部 / 審查室');
  });

  it('TS-PS-PATH-002 課層使用者 → 部層 descFull ＋ DESC_CHI 最末段（略過中間處層，契約 §8.3）', () => {
    // JCHA0 之部層＝JC000（供應商金融部）；中間處層 JCH00（北區綜合處）刻意不出現於路徑。
    expect(buildOrgPath(AS_UNITS, 'JCHA0')).toBe('供應商金融部 / 醫療一課');
  });

  it('TS-PS-PATH-003 部層使用者（無下層）→ 僅部層 descFull，不產生尾綴分隔符', () => {
    expect(buildOrgPath(AS_UNITS, 'JA000')).toBe('營運管理部');
  });

  it('TS-PS-PATH-004 部層 descFull 為 null → fallback 本部層 descFull（契約 §8.2 fallback 鏈）', () => {
    const units = AS_UNITS.map((u) => (u.orgCode === 'JA000' ? { ...u, descFull: null } : u));
    expect(buildOrgPath(units, 'JAC00')).toBe('營業二本部 / 審查室');
  });

  it('TS-PS-PATH-005 全鏈皆無 descFull → 僅處室段（不顯示 null／undefined）', () => {
    const units = AS_UNITS.map((u) => ({ ...u, descFull: null }));
    expect(buildOrgPath(units, 'JAC00')).toBe('審查室');
  });

  it('TS-PS-PATH-006 查無該組織列（orgUnits 尚未載入／API 失敗回退空陣列）→ fallback 為代碼本身', () => {
    expect(buildOrgPath([], 'JAC00')).toBe('JAC00');
  });

  it('TS-PS-PATH-007 使用者無部門（orgCode null/空）→ null（呼叫端不渲染部門欄）', () => {
    expect(buildOrgPath(AS_UNITS, null)).toBeNull();
    expect(buildOrgPath(AS_UNITS, '')).toBeNull();
  });

  it('TS-PS-PATH-008 DESC_CHI 無斜線 → 取該段本身（不誤判為空）', () => {
    const units = [unit({ orgCode: 'JAC00', tier: 'SECTION', name: '審查室' }), AS_UNITS[1]];
    expect(buildOrgPath(units, 'JAC00')).toBe('營運管理部 / 審查室');
  });
});

/**
 * `orgUnitDisplayName()`＝`制定部門`／`制定室別` 兩欄之顯示名（2026-09-04 走 A+）。
 * ⚠ 與 `backend/src/org-directory/org-path.spec.ts` 為同一組語料之兩份斷言：後端負責清單／
 * 詳情／CSV，前端負責下拉 label 與唯讀頁；兩側若分岔，同一筆文件在下拉與清單會顯示不同字串。
 * 語料取自 dev SOP 庫 2026-09-04 實測列。
 */
describe('orgUnitDisplayName（制定部門／制定室別 顯示名）', () => {
  /** 追加 dev 庫實測列：末段簡稱 ≠ 全名（作服/文管室 → 文案管理室），A 與 A+ 於此分岔。 */
  const UNITS: OrgUnitRecord[] = [
    ...AS_UNITS,
    unit({ orgCode: 'CF000', tier: 'DEPARTMENT', name: '作業服務部', descFull: '作業服務部' }),
    unit({
      orgCode: 'CFA00',
      tier: 'SECTION',
      parentCode: 'CF000',
      name: '作服/文管室',
      descFull: '作業服務部文案管理室',
    }),
    unit({ orgCode: 'WAA00', tier: 'SECTION', name: '職安室', descFull: '職業安全衛生室' }),
  ];
  const byCode = new Map(UNITS.map((u) => [u.orgCode, u]));
  const lookup = (code: string) => byCode.get(code) ?? null;
  const display = (orgCode: string) => orgUnitDisplayName(byCode.get(orgCode)!, lookup);

  it('departmentCodeOf 取 LEFT(CODE,2)+"000"', () => {
    expect(departmentCodeOf('JAC00')).toBe('JA000');
    expect(departmentCodeOf('JCHA0')).toBe('JC000');
  });

  it('部層 → descFull 全名（營管部 → 營運管理部）', () => {
    expect(display('JA000')).toBe('營運管理部');
    expect(display('JC000')).toBe('供應商金融部');
  });

  it('處室 → 自 descFull 切除部層前綴（既非 name 原字串、亦非 descFull 串接全名）', () => {
    const jac = byCode.get('JAC00')!;
    expect(display('JAC00')).toBe('審查室');
    expect(display('JAC00')).not.toBe(jac.name);
    expect(display('JAC00')).not.toBe(jac.descFull);
    expect(display('JCH00')).toBe('北區綜合處');
  });

  it('🔴 得室之全名而非 DESC_CHI 末段簡稱（作服/文管室 → 文案管理室）', () => {
    expect(display('CFA00')).toBe('文案管理室');
    expect(display('CFA00')).not.toBe('文管室'); // ← 走 A（末段）之答案，本條即 A→A+ 之分界
  });

  it('部層列查無（WA000）→ 退回 DESC_CHI 末段', () => {
    expect(display('WAA00')).toBe('職安室');
  });

  it('課層 descFull 為 null → 退回最末段（略過中間處層）', () => {
    expect(display('JCHA0')).toBe('醫療一課');
  });

  it('部層 descFull 為 null → 退回 name（不留空）', () => {
    expect(
      orgUnitDisplayName(
        unit({ orgCode: 'AN000', tier: 'DEPARTMENT', name: '管理', descFull: null }),
        lookup,
      ),
    ).toBe('管理');
  });

  it('🔒 複合字串形態之處/室不得原樣輸出 DESC_CHI（退化即翻紅）', () => {
    const compound = UNITS.filter(
      (u) => (u.tier === 'SECTION' || u.tier === 'SUBSECTION') && u.name.includes('/'),
    );
    expect(compound.length).toBeGreaterThan(0);
    for (const u of compound) expect(orgUnitDisplayName(u, lookup)).not.toBe(u.name);
  });
});
