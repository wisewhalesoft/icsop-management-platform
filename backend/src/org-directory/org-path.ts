/**
 * 組織路徑顯示字串（純邏輯，無 IO）— **全站唯一之組織路徑算法**（F003 AC-P17）。
 *
 * 格式：`{部層 DESC_FULL 全名} / {處室簡稱}`，例：`營運管理部 / 審查室`。
 * 取值規則見 upstream-hr-source-contract.md §8.2／§8.3：
 *   部    ＝ 部層（`LEFT(CODE,2)+'000'`）之 `descFull`；查無/為空 → fallback 本部層 → Root。
 *   處/室 ＝ 自身 `name`（← DESC_CHI，以 `/` 分段）之**最末段**；僅 SECTION/SUBSECTION 有值
 *            （課層使用者顯示課名，略過中間處層——契約 §8.3 單一規則）。
 * 兩段以 ` / ` 相接，空欄自動收合（不產生尾綴分隔符），**捨本部層**——與本專案三級組織模型
 * （公司 / 部 / 處室）及 prototype 一致。
 *
 * ## 為什麼三個取值原語住在這裡（AC-P17「不得另建第二套」）
 * `departmentCodeCandidates`／`deriveSectionName`／`resolveDepartmentFullName` 原先住在
 * `src/public/watermark.ts`（F020 浮水印之「部門」「處/室」欄本就是同一套算法）。2026-08-14 為
 * 修正帳號清單部門欄格式回歸而搬來此處——`org-directory` 是 accounts／org-sync／public 共同消費
 * 的地基模組，演算法放這裡才不會讓地基反向依賴其消費者。`public/watermark.ts` 改為 import +
 * **re-export**，F020 既有的 `from './watermark'` 匯入一行未改、仍吃同一份實作。
 *
 * ## ⚠ 與 `frontend/src/domain/org-path.ts` 為同一演算法之兩份實作
 * 跨 package 無法共用同一份原始碼，故前後端各存一份。**兩者須同步維護**：任一側調整取值規則、
 * 分隔符或 fallback，另一側必須同步，否則同一畫面會再次出現兩種部門格式
 * （2026-08-14 真容器實測之回歸：清單第 1 頁 50 列，含 ` / ` 者 0 列）。
 */

import { OrgUnitRecord } from './org-unit-read';

/** 分隔符（逐字，非變數）——與 prototype 及前端 `org-path.ts` 一致。 */
const ORG_PATH_SEPARATOR = ' / ';

/** 是否為可呈現之非空字串。 */
function present(v: string | null | undefined): v is string {
  return v != null && String(v).trim() !== '';
}

/**
 * 「處/室」欄推導（單一規則）：使用者所屬**最細單位**名稱。
 *  - SECTION（處/室）/ SUBSECTION（課）→ DESC_CHI 以 '/' 切分取最末段。
 *  - DEPARTMENT / DIVISION / ROOT（無下層）→ 空字串（收合）。
 * DESC_CHI 無斜線時取該段本身；null/空 → 空字串（不報錯）。
 */
export function deriveSectionName(tier: string, descChi: string | null | undefined): string {
  if (tier !== 'SECTION' && tier !== 'SUBSECTION') return '';
  if (!descChi) return '';
  const parts = descChi
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return parts.length ? parts[parts.length - 1] : '';
}

/**
 * 「部門」欄之部層代碼候選（依序 fallback）：部層（LEFT2+000）→ 本部層（LEFT1+0000）→ Root。
 * 契約 §8.2 之 fallback 鏈。
 */
export function departmentCodeCandidates(orgCode: string): string[] {
  const dept = orgCode.slice(0, 2).padEnd(5, '0'); // 部層
  const division = orgCode.slice(0, 1).padEnd(5, '0'); // 本部層
  return [dept, division, '00000'];
}

/** 依 fallback 鏈解析部門 DESC_FULL；皆查無/皆無 descFull → null（組裝端收合為空）。 */
export function resolveDepartmentFullName(
  orgCode: string,
  lookup: (code: string) => { descFull: string | null } | null,
): string | null {
  for (const code of departmentCodeCandidates(orgCode)) {
    const row = lookup(code);
    if (row && present(row.descFull)) return row.descFull;
  }
  return null;
}

/**
 * 「祖鏈路徑」標籤——自 Root 沿 `parentCode` 逐層下探至該單位，各層 `name` 以 ` / ` 相接。
 *
 * ⚠ **與同檔 `buildOrgPath()` 是兩套刻意不同的演算法，不得「順手統一」**：
 *   - `buildOrgPath()`＝人資契約 §8.2／§8.3 之「部 / 處室」兩段式（捨本部層、部層取 `descFull`、
 *     處室取 `DESC_CHI` 末段），用於**帳號／浮水印之「部門」欄**；
 *   - 本函式＝**完整祖鏈**（含本部層），用於 F018 制定部門之候選標籤與 chip。
 *  兩者在同一筆 `orgCode` 上會給出不同字串，這是規格要求。
 *
 * 🔴 **本函式存在之理由**＝與 `frontend/src/components/DraftingDeptPicker.tsx#orgPathLabel`
 * 為同一演算法之兩份實作（跨 package 無法共用原始碼）。F018 制定部門在**畫面**與**匯出 CSV**
 * 兩處都要呈現同一個標籤；若後端另編一套（例如只取單位自身 `name`），同一份資料就會有
 * 「畫面一種、CSV 另一種」兩個答案——這正是本 repo 2026-08-14 部門欄格式回歸的形狀。
 * ⚠ 任一側調整分隔符／上溯規則／fallback，另一側必須同步。
 *
 * fallback：查無該代碼（主檔已無此歷史單位）→ 回傳**代碼本身**，與前端逐字一致
 * （不顯示 `undefined`、不留空）。循環守衛以 `seen` 避免資料異常造成無窮迴圈。
 */
export function orgAncestorPathLabel(
  byCode: ReadonlyMap<string, { orgCode: string; parentCode: string | null; name: string }>,
  orgCode: string,
): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let cur = byCode.get(orgCode);
  while (cur && !seen.has(cur.orgCode)) {
    seen.add(cur.orgCode);
    parts.unshift(cur.name);
    cur = cur.parentCode ? byCode.get(cur.parentCode) : undefined;
  }
  return parts.length ? parts.join(ORG_PATH_SEPARATOR) : orgCode;
}

/**
 * 以**預先建好之 `orgCode → 單位` 索引**求路徑。
 * 熱路徑（清單富化）專用：呼叫端每家公司只建一次索引，逐列查表為 O(1)，不逐列回查 DB。
 */
function resolveOrgPathFromIndex(
  byCode: ReadonlyMap<string, OrgUnitRecord>,
  orgCode: string | null | undefined,
): string | null {
  if (!orgCode) return null;
  const self = byCode.get(orgCode);
  const departmentFullName =
    resolveDepartmentFullName(orgCode, (code) => byCode.get(code) ?? null) ?? '';
  const sectionName = self ? deriveSectionName(self.tier, self.name) : '';

  const segments = [departmentFullName, sectionName].filter(present);
  if (segments.length > 0) return segments.join(ORG_PATH_SEPARATOR);
  // 兩段皆空（如部層無 descFull）→ 退回自身簡稱；連自身都查無 → 退回代碼本身（見下方 fallback 註記）。
  return present(self?.name) ? self.name.trim() : orgCode;
}

/**
 * 建立單一公司之路徑解析器：索引只建一次，之後每次呼叫為 O(1)。
 * 供清單富化等需對多列求路徑之場景使用（避免每列重建索引之 O(n²)）。
 */
export function createOrgPathResolver(
  units: readonly OrgUnitRecord[],
): (orgCode: string | null | undefined) => string | null {
  const byCode = new Map(units.map((u) => [u.orgCode, u]));
  return (orgCode) => resolveOrgPathFromIndex(byCode, orgCode);
}

/**
 * 組出單一組織路徑字串（單次呼叫用；簽章對齊 `frontend/src/domain/org-path.ts` 之 `buildOrgPath`）。
 *  - `orgCode` 為空 → `null`（呼叫端不渲染部門欄）。
 *  - `units` 應為**該單位所屬公司**之組織清單：`ORG_UNIT` 之唯一鍵為 `(companyCode, orgCode)`，
 *    不同公司可有相同 `orgCode` 但不同單位，混入他公司之列會解析出錯誤名稱。
 *
 * ⚠ **最末層 fallback（查無代碼 → 回傳代碼原字串）之適用範圍**：此 fallback 是為**下拉/顯示端**
 * 而設——下拉候選一律來自 ORG_UNIT 主檔，故「查無」在該情境於 UI 上**不可達**。反之**清單**可能
 * 遇到主檔已查無之歷史 `orgCode`，規格要求該列留空顯示「—」（AC-P18），故清單端（
 * `accounts.service.ts#buildDepartmentIndex`）**刻意只為主檔命中之單位求路徑、未命中回 `null`**。
 * 兩端 fallback 不同是規格要求，**不是**兩套演算法，請勿「順手統一」——統一會打破 AC-P18。
 */
export function buildOrgPath(
  units: readonly OrgUnitRecord[],
  orgCode: string | null | undefined,
): string | null {
  return createOrgPathResolver(units)(orgCode);
}
