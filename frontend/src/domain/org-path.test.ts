import { describe, it, expect } from 'vitest';
import { buildOrgPath } from './org-path';
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
