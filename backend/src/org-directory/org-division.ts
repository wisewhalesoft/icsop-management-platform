/**
 * 本部（`tier === 'DIVISION'`）之上溯與分群 ＋ 帶本部之組織路徑解析器。
 *
 * ## 本檔之由來（`ARCH-UX1`，architecture-spec §16.1）
 * `divisionOf`／`indexOrgUnitsByCompany` 原住 `dashboard/division-resolver.ts`（F044 `AC-G32`～
 * `AC-G36`），2026-09-22 UX16 delta 起有四個新消費者（F017／F019／F042 與本檔之
 * `createOrgPathResolverWithDivision`）。**向下抽出至地基模組 `org-directory`，原檔改 re-export**
 * ——理由不只是「不動既有路徑」，而是若 `createOrgPathResolverWithDivision`（`ARCH-UX7`，住在
 * `org-directory`）去 import 住在 `dashboard/` 的 `divisionOf`，地基模組就反向依賴了它的消費者，
 * `.dependency-cruiser.cjs` 之 `no-circular` 會**真實觸發**（`dashboard/` 已 import `org-path.ts`
 * 與 `company-name.ts`）。
 *
 * 🔒 `orgSegmentOf`／`companyLabel`／`SEG_*` 四個 F044 專用符號**留在** `dashboard/division-resolver.ts`
 * ——那是「儀表板怎麼分組」之語彙，不屬於地基層（§16.1 之否決欄）。
 *
 * 🔴 **跨公司防護是結構性的，不是紀律性的**：`divisionOf` 之 `byCode` 只含**一家公司**之列，
 * 故「以他公司之同碼單位解析本公司文件」在資料結構上不可能發生。
 * ⚠ **明文禁止**把索引攤平成單一 `Map<orgCode, OrgUnit>` 再「小心地只查本公司」——本 repo 已於
 *   2026-09-01 與 2026-09-07 兩次因此壞掉（dev 實測四家間有 42 個重複 `orgCode`）。
 *
 * 🔴 **`無本部` 之唯一成因**（F044 §15.7 末之事實更正）：`parentCode` 由代碼前綴機械推導
 * （`AN000` → `A0000`），且 `deriveTier` 對 `X0000` **恆**判為 `DIVISION` ⇒ 「直掛 ROOT」在真實
 * 資料裡不可能出現。`無本部` ＝ **該公司之 `X0000` 那一列不存在於 `ORG_UNIT`**。
 */

import { OrgUnitRecord } from './org-unit-read';
import {
  ORG_PATH_SEPARATOR,
  deriveSectionName,
  orgUnitDisplayName,
  resolveDepartmentUnit,
} from './org-path';

/**
 * 沿 `parentCode` 上溯至第一個 `tier === 'DIVISION'` 之單位。
 *
 * @param byCode **單一公司**之 `orgCode → OrgUnit` 索引（呼叫端須先依 `companyCode` 分群）。
 * @returns 該本部層之列；推導出之祖先代碼於 `ORG_UNIT` 查無、或 `orgCode` 本身查無 ⇒ `null`
 *          （⇒ 落 `無本部` 段）。
 *
 * 🔴 **查無那一列即回 `null`，不得「再往上推一層」**——那會讓 `無本部` 段永遠不產生。
 * 🔴 循環守衛（`AC-G33`）比照既有 `orgAncestorPathLabel()` 之 `seen` 集合。⚠ 上溯深度由代碼
 *   結構決定、最多 4 跳，正常資料下永不觸發；它防的是「有人手改過 `parentCode`」。
 */
export function divisionOf(
  byCode: ReadonlyMap<string, OrgUnitRecord>,
  orgCode: string,
): OrgUnitRecord | null {
  const seen = new Set<string>();
  let cur = byCode.get(orgCode);
  while (cur && !seen.has(cur.orgCode)) {
    if (cur.tier === 'DIVISION') return cur;
    seen.add(cur.orgCode);
    cur = cur.parentCode ? byCode.get(cur.parentCode) : undefined;
  }
  return null;
}

/** `ORG_UNIT` 全表 → 每公司一個索引（🔴 分群是跨公司防護之結構性載體，不可省略）。 */
export function indexOrgUnitsByCompany(
  units: readonly OrgUnitRecord[],
): Map<string, Map<string, OrgUnitRecord>> {
  const out = new Map<string, Map<string, OrgUnitRecord>>();
  for (const u of units) {
    const byCode = out.get(u.companyCode) ?? new Map<string, OrgUnitRecord>();
    byCode.set(u.orgCode, u);
    out.set(u.companyCode, byCode);
  }
  return out;
}

/**
 * 建立單一公司之「本部 / 部 / 處室」路徑解析器（`createOrgPathResolver` 之本部感知版，
 * `ARCH-UX7`／F042 `AC-UX45`）。
 *
 * 🔴 與 `createOrgPathResolver` 共用內部原語（`resolveDepartmentUnit`／`deriveSectionName`／
 * `orgUnitDisplayName`），**不複製規則**——差異只在多插入一段 `divisionOf()` 之上溯結果。
 * 🔒 `org-path.ts` 之 `createOrgPathResolver`／`buildOrgPath` 行為一格未動（`AC-UX43` ② 之
 * 「既有三級顯示欄一格未動」由此結構性保證：呼叫端要三段用 `createOrgPathResolver`，要四段
 * 用本函式，兩者不共用同一個回傳值）。🔴 **明文禁止**改以「給 `buildOrgPath` 加 `includeDivision`
 * 布林旗標」達成——那會讓第四段行為從其 ~12 個既有呼叫端意外可達。
 *
 * ## 空段收合（`AC-UX45`）
 * 查無本部祖先 ⇒ `divisionLabel` 為空字串，`.filter()` 天然收合回既有三段格式，
 * **不插入空字串、不插入 `無本部` 之類 sentinel 文字**（sentinel 是 F044 儀表板分組語彙，
 * 與本函式之顯示語彙不得互相對齊）。
 *
 * ## 🔴 `AC-UX57`：本部段與部段解析為**同一個單位**時只輸出一次
 * `departmentCodeOf('D0000')` ＝ `'D0000'`（映射回自己），而其本部亦解析為 `D0000`
 * ⇒ 天真實作會把同一個單位印兩次（`財會本部 / 財會本部`）。
 * 🔴 **判準為 `orgCode` 相等，明文禁止以顯示名相等為準**——不同層級之兩個單位理論上可能同名
 * （實測語料：`共用部門`／`共用部門`），以名稱去重會把兩個**真的不同**的單位誤併成一段。
 * ⚠ 此輸入**真實可達**、非防禦性程式設計：OJT 之使用部門候選**不依層級過濾**
 * （`frontend/src/pages/DocumentEditPage.tsx:410`／`:291`），使用者可把使用部門設成本部層單位本身。
 */
export function createOrgPathResolverWithDivision(
  units: readonly OrgUnitRecord[],
): (orgCode: string | null | undefined) => string | null {
  const byCode = new Map(units.map((u) => [u.orgCode, u]));
  const lookup = (code: string): OrgUnitRecord | null => byCode.get(code) ?? null;
  return (orgCode) => {
    if (!orgCode) return null;
    const self = byCode.get(orgCode);
    const division = divisionOf(byCode, orgCode);
    const departmentUnit = resolveDepartmentUnit(orgCode, lookup);
    // 🔴 AC-UX57：本部段所解析出的單位與部段為同一個單位 ⇒ 該段只輸出一次（以代碼判定）。
    const divisionLabel =
      division && division.orgCode !== departmentUnit?.orgCode
        ? orgUnitDisplayName(division, lookup)
        : '';
    const departmentFullName = departmentUnit?.descFull ?? '';
    const sectionName = self ? deriveSectionName(self.tier, self.name) : '';

    const segments = [divisionLabel, departmentFullName, sectionName].filter((s) => s !== '');
    if (segments.length > 0) return segments.join(ORG_PATH_SEPARATOR);
    // 三段皆空 → 退回自身簡稱；連自身都查無 → 退回代碼本身（與 `createOrgPathResolver` 逐字一致）。
    return self?.name?.trim() || orgCode;
  };
}
