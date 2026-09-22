import { OrgUnitRecord } from '../org-directory/org-unit-read';
export type { OrgUnitRecord };
import { divisionOf, indexOrgUnitsByCompany } from '../org-directory/org-division';
import { orgUnitDisplayName } from '../org-directory/org-path';

/**
 * 「制定本部」之識別、顯示名與索引組裝——F017 `AC-UX40`～`AC-UX43` 與 F019 `AC-UX22`～`AC-UX24`
 * 之**唯一共用落點**（architecture-spec §16.2 `ARCH-UX2`）。
 *
 * 🔴 **為何兩個功能共用這一份**：`AC-UX41` ④ 明文「全系統只能有一份本部推導實作」，且
 * 🔒「兩頁共用同一份本部推導實作，**值的形狀也必須共用**，否則同一個本部在兩頁會有兩個
 * 不同的識別字串」。上溯演算法本身住在地基模組（`org-directory/org-division.ts#divisionOf`），
 * 本檔只補上兩個消費者都需要、而地基層不該知道的東西：**複合識別鍵**與**顯示標籤**。
 *
 * 🔴 **落點在 `documents/` 而非 `public/`**：`public/public-list.ts` 已 import
 * `../documents/{document-status,display-status,chief-match}` 三支——`public → documents` 是本
 * repo 既有且唯一方向之相依，反過來放會製造一條新的反向邊（`.dependency-cruiser.cjs` 之
 * `no-circular` 為唯一規則，方向性一旦雙向就只差一個 import 就真的環起來）。
 * 🔴 **不放進 `org-directory/`**：那是地基模組，`${公司代碼}__{本部代碼}` 這個鍵的形狀是
 * F017／F019 兩張畫面之**篩選契約**，不是組織資料本身的屬性。
 */

/**
 * 🔒 複合鍵之分隔符，逐字沿用全站既有慣例（`frontend/src/pages/ojt-progress-view.ts` 之
 * `orgGroupKeyOf()`、F044 之 `data-org-key`、`dashboard/division-resolver.ts` 之分組鍵）
 * ——🔴 **不另立第二種**。
 */
export const DRAFTING_DIVISION_KEY_SEPARATOR = '__';

/**
 * 本部之篩選識別鍵：逐字為 `` `${公司代碼}__{本部代碼}` ``（例：`AS__A0000`）。
 *
 * 🔴 **必須是複合鍵、不能只用本部代碼**（`AC-UX22` 🔒／`AC-UX41` ④ 🔒）：`ORG_UNIT` 之唯一鍵
 * 為 `(companyCode, orgCode)`，5 碼組織代碼**各公司獨立編碼** ⇒ 單用本部代碼會把不同公司的
 * 同碼本部併成同一個選項（dev 實測四家間有 42 個重複 `orgCode`）。
 * 🔒 URL 相容：`_` 為 RFC 3986 之 unreserved 字元，公司代碼 2 碼、組織代碼 5 碼英數 ⇒ 不需
 * encode；且真實鍵恆為 `2 碼 + __ + 5 碼`，結構上不可能撞上 F044 之雙底線包夾 sentinel
 * （`__no_division__`／`__unspecified__`）。
 */
export function draftingDivisionKey(companyCode: string, divisionCode: string): string {
  return `${companyCode}${DRAFTING_DIVISION_KEY_SEPARATOR}${divisionCode}`;
}

/** 一份文件之制定本部（`id`＝篩選鍵、`code`＝裸本部代碼、`name`＝人類可讀之本部名稱）。 */
export interface DraftingDivision {
  id: string;
  code: string;
  name: string;
}

/**
 * 自「單一公司之組織索引」上溯求制定本部。
 *
 * @param byCompany `companyCode → (orgCode → OrgUnit)`（🔴 **必須分群**——跨公司防護是結構性的，
 *        見 `org-division.ts` 檔頭；攤平成單一 `Map<orgCode, …>` 本 repo 已壞過兩次）。
 * @returns 推導不出本部（`draftingDeptId` 為空／該公司未載入／上溯查無 `DIVISION` 祖先）⇒ `null`。
 *          🔴 `null` 一律呈現為**沒有值**（`AC-UX24`：前台**不產生** `無本部` sentinel 選項，
 *          該文件在未選定任何本部時照常出現於清單）——與 F044 儀表板之分組維度**刻意不同**、
 *          兩者不得互相對齊。
 */
export function resolveDraftingDivision(
  byCompany: ReadonlyMap<string, ReadonlyMap<string, OrgUnitRecord>>,
  companyCode: string,
  draftingDeptId: string | null | undefined,
): DraftingDivision | null {
  if (!draftingDeptId) return null;
  const byCode = byCompany.get(companyCode);
  if (!byCode) return null;
  const division = divisionOf(byCode, draftingDeptId);
  if (!division) return null;
  const lookup = (code: string): OrgUnitRecord | null => byCode.get(code) ?? null;
  return {
    id: draftingDivisionKey(companyCode, division.orgCode),
    code: division.orgCode,
    name: orgUnitDisplayName(division, lookup),
  };
}

/**
 * 依列之 `companyCode` 分組，逐一相異公司取回整份 `ORG_UNIT` 後建索引（`ARCH-UX2`）。
 *
 * 🔴 **為何需要「整家公司」而非逐代碼點查**：上溯之中繼祖先不一定落在手上那批代碼之內
 * （`DAA00 → DA000 → D0000`，中間那層可能沒有任何文件用到）。
 * 🔒 **無 `draftingDeptId` 之列不觸發任何查詢**——整頁都沒有制定部門時一次 IO 都不發。
 */
export async function indexOrgUnitsForRows(
  rows: readonly { companyCode: string; draftingDeptId: string | null }[],
  listOrgUnitsByCompany: (companyCode: string) => Promise<OrgUnitRecord[]>,
): Promise<Map<string, Map<string, OrgUnitRecord>>> {
  const companies = new Set<string>();
  for (const r of rows) {
    if (r.draftingDeptId && r.companyCode) companies.add(r.companyCode);
  }
  const units: OrgUnitRecord[] = [];
  for (const companyCode of companies) {
    units.push(...(await listOrgUnitsByCompany(companyCode)));
  }
  return indexOrgUnitsByCompany(units);
}
