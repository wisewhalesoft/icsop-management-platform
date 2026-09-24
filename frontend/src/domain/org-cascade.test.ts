/**
 * 組織篩選連動純函式（F017／F019 `AC-OC2`～`AC-OC4`）。
 * 🔴 語料刻意含「兩家公司同名部門」「同公司不同本部之同名部門」「無本部之部門」——
 *    只用單一公司、名稱不重複之語料時，收斂與加註規則恆真（本 repo「乾淨 fixture」血訓）。
 */
import { describe, it, expect } from 'vitest';
import { cascadeOrgOptions, lowerLevelsOf, type OrgUnitTuple } from './org-cascade';

const u = (o: Partial<OrgUnitTuple> & { companyKey: string }): OrgUnitTuple => ({
  divisionId: null, divisionName: null, deptId: null, deptName: null, sectionId: null, sectionName: null, ...o,
});

const UNITS: OrgUnitTuple[] = [
  // 和潤：兩個本部各有一個「管理部」＋ 一個無本部之「稽核部」
  u({ companyKey: 'AS', divisionId: 'AS__J0000', divisionName: '營運本部', deptId: 'JA000', deptName: '管理部', sectionId: 'JAC00', sectionName: '審查室' }),
  u({ companyKey: 'AS', divisionId: 'AS__K0000', divisionName: '行政本部', deptId: 'KA000', deptName: '管理部', sectionId: 'KAC00', sectionName: '總務室' }),
  u({ companyKey: 'AS', deptId: 'LA000', deptName: '稽核部', sectionId: 'LAC00', sectionName: '稽核室' }),
  // 和運：與和潤同名之「管理部」，代碼亦撞號（各公司獨立編碼）
  u({ companyKey: 'AD', divisionId: 'AD__J0000', divisionName: '營運本部', deptId: 'JA000', deptName: '資訊部', sectionId: 'JAC00', sectionName: '資訊室' }),
];

describe('cascadeOrgOptions', () => {
  it('AC-OC1：公司未選 ⇒ 三欄皆無選項', () => {
    expect(cascadeOrgOptions(UNITS, { company: '', division: '', dept: '' })).toEqual({ division: [], dept: [], section: [] });
  });

  it('AC-OC2：只列所選公司之單位；撞號之他公司單位不混入', () => {
    const o = cascadeOrgOptions(UNITS, { company: 'AD', division: '', dept: '' });
    expect(o.division).toEqual([{ value: 'AD__J0000', label: '營運本部' }]);
    expect(o.dept).toEqual([{ value: 'JA000', label: '資訊部' }]);
    expect(o.section).toEqual([{ value: 'JAC00', label: '資訊室' }]);
  });

  it('AC-OC2：本部不強制——未選本部時列出全部部門（含無本部者）', () => {
    const o = cascadeOrgOptions(UNITS, { company: 'AS', division: '', dept: '' });
    expect(o.dept.map((x) => x.value)).toEqual(['JA000', 'KA000', 'LA000']);
    // 無本部之單位不會在本部下拉產生選項（不加 sentinel）
    expect(o.division.map((x) => x.value)).toEqual(['AS__J0000', 'AS__K0000']);
  });

  it('AC-OC2：選本部 ⇒ 部門／室別收斂；選部門 ⇒ 室別收斂', () => {
    const byDiv = cascadeOrgOptions(UNITS, { company: 'AS', division: 'AS__K0000', dept: '' });
    expect(byDiv.dept).toEqual([{ value: 'KA000', label: '管理部' }]);
    expect(byDiv.section).toEqual([{ value: 'KAC00', label: '總務室' }]);
    const byDept = cascadeOrgOptions(UNITS, { company: 'AS', division: '', dept: 'LA000' });
    expect(byDept.section).toEqual([{ value: 'LAC00', label: '稽核室' }]);
  });

  it('AC-OC4 ②：收斂後同名者加註上級名稱；不同名者不加註', () => {
    const o = cascadeOrgOptions(UNITS, { company: 'AS', division: '', dept: '' });
    expect(o.dept).toEqual([
      { value: 'JA000', label: '管理部（營運本部）' },
      { value: 'KA000', label: '管理部（行政本部）' },
      { value: 'LA000', label: '稽核部' },
    ]);
  });

  it('AC-OC4 ②：上級不可得或加註後仍同名 ⇒ 改註代碼', () => {
    const units = [
      u({ companyKey: 'X', deptId: 'D1', deptName: '業務部' }),
      u({ companyKey: 'X', deptId: 'D2', deptName: '業務部' }),
    ];
    expect(cascadeOrgOptions(units, { company: 'X', division: '', dept: '' }).dept).toEqual([
      { value: 'D1', label: '業務部（D1）' },
      { value: 'D2', label: '業務部（D2）' },
    ]);
  });
});

describe('lowerLevelsOf（AC-OC3）', () => {
  it('公司→三欄、本部→兩欄、部門→室別、室別→無', () => {
    expect(lowerLevelsOf('company')).toEqual(['division', 'dept', 'section']);
    expect(lowerLevelsOf('division')).toEqual(['dept', 'section']);
    expect(lowerLevelsOf('dept')).toEqual(['section']);
    expect(lowerLevelsOf('section')).toEqual([]);
  });
});
