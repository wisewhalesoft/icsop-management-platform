import { deriveCodePrefix, isWithinSubtree } from '../org-sync/org-hierarchy';

/**
 * 「制定單位與檢視者單位之相近程度」——前台 ICSOP 文件瀏覽（F019）之「其他文件」排序與
 * 後台 ICSOP 文件管理（F017）之預設排序**共用之唯一實作**（2026-09-23 使用者裁定）。
 *
 * 層級（數字越小越相近）：
 *   0 同制定室別 → 1 同制定部門 → 2 同制定本部 → 3 同制定公司 → 4 其他公司
 * 同層內之次序由呼叫端決定（兩處皆為文件編號降冪）。
 *
 * ## 「同」的判準＝檢視者單位落在該制定單位之子樹內（含自身）
 * 以 `isWithinSubtree(制定單位, 檢視者單位)` 判定，故上層主管自然往上一層落：
 * 部長（`JA000`）看其轄下處室制定之文件 ⇒ 室別不中、部門中 ⇒ 層 1。
 * 🔴 總經理等掛在公司層（`00000`）之帳號：室別／部門／本部**不可能**命中 ⇒ 本公司文件全落層 3，
 *    即「本公司優先，再依文件編號降冪」（2026-09-23 裁定，刻意不另設特例）。
 *
 * 🔴 **公司別必須先相等**：5 碼組織代碼各公司獨立編碼（dev 實測四家間有 42 個重複 `orgCode`），
 *    跨公司以代碼比對會誤中。
 * 🔴 制定單位為 ROOT（`00000`，有效前綴為空）⇒ **不參與**室別／部門／本部之比對——否則
 *    `isWithinSubtree('00000', 任何代碼)` 恆真，會讓該文件對全公司每個人都排進層 1。
 * 🔒 代碼格式不合（非 5 碼）之值一律視為缺值，不拋錯——排序不得因一列髒資料讓整頁 500。
 */
export type DraftingProximity = 0 | 1 | 2 | 3 | 4;

export interface DraftingUnits {
  companyCode: string;
  draftingSectionId: string | null;
  draftingDeptId: string | null;
  /** 制定本部之**裸**代碼（`D0000`），由 `resolveDraftingDivision()` 推導；推導不出為 `null`。 */
  draftingDivisionCode: string | null;
}

export interface ProximityViewer {
  orgCode: string | null;
  companyCode: string | null;
}

function isOrgCode(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.length === 5;
}

function contains(unitCode: string | null, viewerOrg: string): boolean {
  if (!isOrgCode(unitCode)) return false;
  if (deriveCodePrefix(unitCode) === '') return false; // ROOT 不參與（見檔頭）
  return isWithinSubtree(unitCode, viewerOrg);
}

export function draftingProximity(doc: DraftingUnits, viewer: ProximityViewer): DraftingProximity {
  if (!viewer.companyCode || doc.companyCode !== viewer.companyCode) return 4;
  const org = viewer.orgCode;
  if (isOrgCode(org)) {
    if (contains(doc.draftingSectionId, org)) return 0;
    if (contains(doc.draftingDeptId, org)) return 1;
    if (contains(doc.draftingDivisionCode, org)) return 2;
  }
  return 3;
}

/** 複合本部鍵（`AS__D0000`）→ 裸本部代碼；非該形狀 ⇒ `null`。 */
export function divisionCodeOfKey(draftingDivisionId: string | null | undefined): string | null {
  if (!draftingDivisionId) return null;
  const i = draftingDivisionId.indexOf('__');
  return i < 0 ? null : draftingDivisionId.slice(i + 2) || null;
}
