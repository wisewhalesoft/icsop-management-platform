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

/**
 * 分隔符（逐字，非變數）——與 prototype 及前端 `org-path.ts` 一致。
 *
 * 🔴 **對外 export**（2026-09-01）：F042 OJT 進度管理之單位標籤需在本演算法之結果前再冠一段
 * 公司簡稱（`公司 / 部 / 處室`）。若該處自行寫死 `' / '`，同一個畫面上的分隔符就有了第二個
 * 定義點——本檔開頭那段「兩份實作須同步維護」的警語，講的正是這種漂移。
 */
export const ORG_PATH_SEPARATOR = ' / ';

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
 * 單一組織單位之**顯示名**（`制定部門`／`制定室別` 兩欄專用；2026-09-04 定案，走 A+）。
 *
 * ## 問題
 * `ORG_UNIT.name` ← 上游 `VW_DEPT_SQL.DESC_CHI`，該欄**本身命名不一致**（2026-09-04 對 dev SOP
 * 庫 139 筆 active 部/處室實查）：
 *  - 部層 42 筆：20 筆等於全名（`作業服務部`）、9 筆缺尾字（`企劃` vs `企劃部`）、13 筆為簡稱
 *    （`營管部` vs `營運管理部`、`車輛分期營一` vs `車輛分期營業一部`）。
 *  - 處/室 97 筆：95 筆是「部段/室段」複合字串（`營管部/審查室`、`作服/文管室`），且部段之
 *    簡寫程度自己也不一致；僅 2 筆無斜線。
 * ⇒ 直接吐 `name` 會讓同一欄同時出現簡稱、缺字全名與複合路徑三種形態（真人 2026-09-04 回報）。
 *
 * ## 規則
 *  - **部層以上**（ROOT／DIVISION／DEPARTMENT）→ `descFull` 全名；無值才退回 `name`。
 *  - **處/室、課**（SECTION／SUBSECTION）→ 以**部層之 `descFull` 為前綴、自本單位 `descFull`
 *    切除**所得之尾段（`營運管理部審查室` − `營運管理部` ＝ `審查室`）；切不出來才退回
 *    `DESC_CHI` 末段。
 *
 * ## 為何處/室要繞這一圈（A → A+ 之升級理由，2026-09-04 真資料覆核後定案）
 * 初版只取 `DESC_CHI` 末段（`作服/文管室` → `文管室`），確實去掉了重複的部段，但**末段本身仍是
 * 簡稱**：制定部門欄變全名、制定室別欄全簡稱，兩欄粒度依舊不一致——使用者原本的抱怨只解了一半。
 * 更嚴重的是**同名歧義**：`AS/CCC00`（信用審查部企金審查室）與 `AS/CDF00`（債權管理部企金催收室）
 * 之 `DESC_CHI` 末段皆為 `企金室`，在同一欄**顯示完全相同**；改由 `DESC_FULL` 切前綴後分別為
 * `企金審查室`／`企金催收室`，歧義消失。97 筆 active 處/室中 **95 筆**可如此切出，其餘 2 筆
 * （`AE/NAA00` 之 `DESC_FULL` 與部名不同源、`AS/WAA00` 無部層列）自動退回末段、輸出不變。
 *
 * ⚠ **`DESC_FULL` 不可以 `/` 機械拆解**：處/室之 `DESC_FULL` 通常為**無分隔串接全名**
 * （`營運管理部審查室`），但 `AS/BAJ00`／`AS/BAK00` 兩筆**帶了斜線**
 * （`車輛分期營業一部/台北營業三處`）——故一律以「部層全名」為前綴整串切除，切完再去掉殘留之
 * 前導 `/`，不得改成 split。
 *
 * @param lookupDepartment 依 `orgCode` 取回組織單位之查表函式。**刻意為必填**——設成選填的話，
 *   忘記傳的呼叫端會靜默退化回「末段簡稱」而測試照樣全綠（本 repo 反覆踩過的假綠形狀）。
 *   非 SECTION／SUBSECTION 之單位不會用到它，但仍需傳（呼叫端一律有現成的索引可用）。
 *
 * ⚠ 與 `buildOrgPath()`（帳號／浮水印之「部 / 處室」兩段式）及 `orgAncestorPathLabel()`
 * （F018 之完整祖鏈）並列為三個**不同用途**之標籤函式，勿互相取代。
 */
export function orgUnitDisplayName(
  unit: { orgCode: string; tier: string; name: string; descFull: string | null },
  lookupDepartment: (orgCode: string) => { descFull: string | null } | null | undefined,
): string {
  if (unit.tier === 'SECTION' || unit.tier === 'SUBSECTION') {
    const deptFull = lookupDepartment(departmentCodeOf(unit.orgCode))?.descFull ?? null;
    if (present(unit.descFull) && present(deptFull) && unit.descFull.startsWith(deptFull)) {
      // 切除部層全名前綴後，去掉可能殘留之前導分隔符（`車輛分期營業一部/台北營業三處` 之情形）。
      const tail = unit.descFull.slice(deptFull.length).replace(/^[/\s]+/, '').trim();
      if (tail !== '') return tail;
    }
    const segment = deriveSectionName(unit.tier, unit.name);
    if (present(segment)) return segment;
  }
  if (present(unit.descFull)) return unit.descFull.trim();
  return present(unit.name) ? unit.name.trim() : '';
}

/**
 * 部層代碼（`LEFT(CODE,2)+'000'`，契約 §3.5）。
 * 🔴 **刻意不走 `departmentCodeCandidates()` 的 fallback 鏈**：那條鏈（部層→本部層→Root）是為
 * `buildOrgPath()` 的「部門」欄而設；用於前綴切除時，本部層／Root 之名稱**不可能**是某個處/室
 * `DESC_FULL` 的前綴，多查兩次只是白費查詢。
 */
export function departmentCodeOf(orgCode: string): string {
  return orgCode.slice(0, 2).padEnd(5, '0');
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
