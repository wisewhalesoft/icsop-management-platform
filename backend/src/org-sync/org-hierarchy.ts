/**
 * 組織階層推導（純邏輯，無 IO）
 *
 * 權威規則：upstream-hr-source-contract.md §3.5 / data-model.md §orgunit-entity。
 * 層級一律由 5 碼部門代碼之前綴決定，每一碼代表一層。
 * 🔴 明確禁用 P_DEPTID（CAPITAL）/ TOP_DEPTID / S_DEPTID（DEPARTMENT）——本模組純字串推導，
 *    完全不接觸這些欄位。
 *
 *   00000        → ROOT
 *   A0000        → DIVISION（本部）      SUBSTRING(2,4)='0000'
 *   AN000        → DEPARTMENT（部）      SUBSTRING(3,3)='000'
 *   ANA00        → SECTION（處/室）      SUBSTRING(4,2)='00'
 *   第 4 碼有值   → SUBSECTION（課）
 */

export type OrgTier =
  | 'ROOT'
  | 'DIVISION'
  | 'DEPARTMENT'
  | 'SECTION'
  | 'SUBSECTION';

function assertOrgCode(orgCode: string): void {
  if (typeof orgCode !== 'string' || orgCode.length !== 5) {
    throw new RangeError(`INVALID_ORG_CODE: ${String(orgCode)}`);
  }
}

/** 依代碼前綴判定層級（cascade：first-match-wins，順序不可調換）。 */
export function deriveTier(orgCode: string): OrgTier {
  assertOrgCode(orgCode);
  if (orgCode === '00000') return 'ROOT';
  if (orgCode.slice(1) === '0000') return 'DIVISION'; // 位置 2-5 皆 0
  if (orgCode.slice(2) === '000') return 'DEPARTMENT'; // 位置 3-5 皆 0
  if (orgCode.slice(3) === '00') return 'SECTION'; // 位置 4-5 皆 0
  return 'SUBSECTION';
}

/** 有效前綴＝去除尾端連續 0 後之字串（Root 00000 → 空字串），供子樹 LIKE 'prefix%' 比對。 */
export function deriveCodePrefix(orgCode: string): string {
  assertOrgCode(orgCode);
  return orgCode.replace(/0+$/, '');
}

/**
 * 上層（immediate parent）代碼：由 codePrefix 去掉最後一個有效碼、補 0 至 5 碼。
 *   JAC00（處/室，prefix JAC）→ JA000（部）      ＝ LEFT(2)+'000'
 *   JCHA0（課，prefix JCHA）  → JCH00（處/室）    ＝ LEFT(3)+'00'
 *   JA000（部，prefix JA）    → J0000（本部）      ＝ LEFT(1)+'0000'
 *   J0000（本部，prefix J）   → 00000（Root）
 *   00000（Root）            → null（無上層）
 */
export function deriveParentCode(orgCode: string): string | null {
  const prefix = deriveCodePrefix(orgCode);
  if (prefix.length === 0) return null;
  const parentPrefix = prefix.slice(0, -1);
  return parentPrefix.padEnd(5, '0');
}
