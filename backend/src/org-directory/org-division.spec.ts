/**
 * UX16 delta — `org-directory/org-division.ts`（新檔，`ARCH-UX1`／`ARCH-UX7`）。
 *
 * 權威：docs/specs/architecture-spec.md §16.1（`ARCH-UX1`：`divisionOf`／`indexOrgUnitsByCompany`
 * 自 `dashboard/division-resolver.ts` 向下抽出、原檔改 re-export）、§16.7（`ARCH-UX7`：
 * `createOrgPathResolverWithDivision`，新函式與 `divisionOf` 同檔，單向 import `org-path.ts`）；
 * docs/specs/features/F017-backend-document-list.md#ux16-delta `AC-UX43`。
 *
 * ⚠ 對實作全盲：`./org-division` 尚不存在——import 失敗即本環之預期紅燈。
 *
 * 🔒 `divisionOf`／`orgUnitDisplayName`／`departmentCodeOf` 之演算法契約沿用既有
 * `org-path.spec.ts`（`orgUnitDisplayName` 對 DEPARTMENT/DIVISION/ROOT 取 descFull、對
 * SECTION/SUBSECTION 取「DESC_FULL 切除部層前綴」）與既有 `division-resolver.spec.ts`
 * （`divisionOf` 沿 parentCode 上溯至第一個 tier==='DIVISION'）之既有行為，非本檔臆造。
 *
 * 🔴 本檔不證明 SQL／真實 `ORG_UNIT` 資料之 parentCode 鏈是否正確（architecture-spec §16.12 #6
 * 明文列為盲區——純函式層僅以固定向量驗證邏輯本身），須部署後人工覆核。
 */
import { OrgUnitRecord } from './org-unit-read';
import { createOrgPathResolverWithDivision, divisionOf, indexOrgUnitsByCompany } from './org-division';

function unit(over: Partial<OrgUnitRecord>): OrgUnitRecord {
  return {
    id: `${over.companyCode ?? 'AS'}-${over.orgCode ?? '00000'}`,
    companyCode: 'AS',
    orgCode: '00000',
    codePrefix: '',
    parentCode: null,
    tier: 'DEPARTMENT',
    name: '',
    descFull: null,
    managerEmpNo: null,
    isActive: true,
    ...over,
  } as OrgUnitRecord;
}

describe('org-division.ts — divisionOf／indexOrgUnitsByCompany 自 dashboard/division-resolver.ts 向下抽出（ARCH-UX1）', () => {
  it('🔴 新模組路徑可直接匯入並運作（非僅由 dashboard 端 re-export 轉手）', () => {
    const units = [
      unit({ orgCode: 'D0000', tier: 'DIVISION', name: '財會本部', descFull: '財會本部' }),
      unit({ orgCode: 'DA000', tier: 'DEPARTMENT', name: '財會部', descFull: '財務會計部', parentCode: 'D0000' }),
    ];
    const byCode = new Map(units.map((u) => [u.orgCode, u]));
    expect(divisionOf(byCode, 'DA000')?.orgCode).toBe('D0000');
  });

  it('indexOrgUnitsByCompany 依 companyCode 分群（既有行為，供本檔其餘測試沿用之信心錨點）', () => {
    const units = [
      unit({ companyCode: 'AS', orgCode: 'D0000', tier: 'DIVISION' }),
      unit({ companyCode: 'AD', orgCode: 'D0000', tier: 'DIVISION' }),
    ];
    const grouped = indexOrgUnitsByCompany(units);
    expect(grouped.get('AS')?.get('D0000')?.companyCode).toBe('AS');
    expect(grouped.get('AD')?.get('D0000')?.companyCode).toBe('AD');
  });
});

describe('createOrgPathResolverWithDivision — 四段（本部/部/處室，ARCH-UX7）', () => {
  /**
   * 語料設計（自建，不沿用他檔之共用常數，避免污染既有測試）：
   *  D0000（DIVISION，本部）─ parentCode:null
   *   └ DA000（DEPARTMENT，部）─ parentCode: 'D0000'
   *      └ DAA00（SECTION，處室）─ parentCode: 'DA000'
   * 期望值之推導完全沿用既有 org-path.spec.ts 已驗證之演算法契約：
   *   本部段 = orgUnitDisplayName(D0000) = descFull = '財會本部'
   *   部段   = resolveDepartmentFullName('DAA00') = departmentCodeOf('DAA00')='DA000' 之 descFull = '財務會計部'
   *   處室段 = deriveSectionName('SECTION', '財會/財管室') = name 切 '/' 之末段 = '財管室'
   */
  const WITH_DIVISION: OrgUnitRecord[] = [
    unit({ orgCode: 'D0000', tier: 'DIVISION', name: '財會本部', descFull: '財會本部', parentCode: null }),
    unit({ orgCode: 'DA000', tier: 'DEPARTMENT', name: '財會部', descFull: '財務會計部', parentCode: 'D0000' }),
    unit({ orgCode: 'DAA00', tier: 'SECTION', name: '財會/財管室', descFull: '財務會計部財管室', parentCode: 'DA000' }),
  ];

  it('SECTION 層之 orgCode，上溯得到 DIVISION 祖先 → 三段路徑（本部/部/處室，company 前綴由呼叫端另加）', () => {
    const resolve = createOrgPathResolverWithDivision(WITH_DIVISION);
    expect(resolve('DAA00')).toBe('財會本部 / 財務會計部 / 財管室');
  });

  it('DEPARTMENT 層之 orgCode（無 SECTION 段）→ 本部/部 兩段（處室段空段收合）', () => {
    const resolve = createOrgPathResolverWithDivision(WITH_DIVISION);
    expect(resolve('DA000')).toBe('財會本部 / 財務會計部');
  });

  it('🔒 查無本部祖先 → 空段收合，回到既有三段格式之等價（部/處室），不插入空字串或 sentinel（`AC-UX45` 空段收合規則）', () => {
    const noDivision: OrgUnitRecord[] = [
      unit({ orgCode: 'DA000', tier: 'DEPARTMENT', name: '財會部', descFull: '財務會計部', parentCode: null }),
      unit({ orgCode: 'DAA00', tier: 'SECTION', name: '財會/財管室', descFull: '財務會計部財管室', parentCode: 'DA000' }),
    ];
    const resolve = createOrgPathResolverWithDivision(noDivision);
    expect(resolve('DAA00')).toBe('財務會計部 / 財管室');
    expect(resolve('DAA00')).not.toContain('undefined');
    expect(resolve('DAA00')).not.toMatch(/\s\/\s\s\/\s/); // 不產生連續分隔符
  });

  it('orgCode 為 null／undefined → null', () => {
    const resolve = createOrgPathResolverWithDivision(WITH_DIVISION);
    expect(resolve(null)).toBeNull();
    expect(resolve(undefined)).toBeNull();
  });

  it('orgCode 查無 → 退回代碼本身（既有 fallback 規則之四段版等價）', () => {
    const resolve = createOrgPathResolverWithDivision(WITH_DIVISION);
    expect(resolve('NOPE1')).toBe('NOPE1');
  });

  /**
   * `AC-UX57`（2026-09-22 第七輪補訂）：「自身即 DIVISION 層」原判為不可達已被 lead 推翻——
   * OJT 之使用部門候選不依層級過濾（`DocumentEditPage.tsx:291,410`），使用者可把某份文件之
   * 使用部門設為本部層單位本身，`nameOf()` 就會以 `X0000` 呼叫本函式。
   * 🔴 三條固定向量必須成組（缺任一條即證明不了「收合只在同一單位時發生」）：
   *   ⓐ `resolve('D0000')`（本部代碼本身）→ 恰一段（本部段與部段為同一單位，只輸出一次）
   *   ⓑ `resolve('DA000')`（本部底下之部）→ 恰兩段——已由上方「DEPARTMENT 層…」案覆蓋，不重複
   *   ⓒ `resolve('DAA00')`（部底下之處室）→ 恰三段——已由上方「SECTION 層…」案覆蓋，不重複
   * （本檔之三段/兩段不含 company 前綴；OJT 側之 `nameOf()` 另加前綴後為 AC-UX57 條文所述之
   * 「恰兩段／恰三段／恰四段」，見 `ojt-progress.cross-company.spec.ts` 之對應 adapter 層案例）。
   */
  it('🔴 AC-UX57 ⓐ：orgCode 本身即本部代碼 → 本部段與部段為同一單位，只輸出一次（不得為「財會本部 / 財會本部」）', () => {
    const resolve = createOrgPathResolverWithDivision(WITH_DIVISION);
    expect(resolve('D0000')).toBe('財會本部');
  });

  it('🔴 AC-UX57 ①：判準以 orgCode 相等為準，非顯示名相等——縱使本部與部之顯示名恰好不同，仍以代碼判定是否為同一單位', () => {
    // 對照組：D0000 之 descFull 若與某個「真的不同」單位同名，不得因名稱相同而誤收合。
    // 此處以 D0000 自身驗證核心規則本體（代碼相等 → 收合）已由上一案覆蓋；
    // 本案改以「部段代碼與本部段代碼不同時，縱使兩者顯示名恰好相同，仍不收合」作為互補鑑別。
    const sameNameDifferentUnits: OrgUnitRecord[] = [
      unit({ orgCode: 'E0000', tier: 'DIVISION', name: '共用部門', descFull: '共用部門', parentCode: null }),
      unit({ orgCode: 'EA000', tier: 'DEPARTMENT', name: '共用部門', descFull: '共用部門', parentCode: 'E0000' }),
    ];
    const resolve = createOrgPathResolverWithDivision(sameNameDifferentUnits);
    // 兩個「不同 orgCode、相同顯示名」之單位——不得因名稱相同而收合為一段。
    expect(resolve('EA000')).toBe('共用部門 / 共用部門');
  });
});
