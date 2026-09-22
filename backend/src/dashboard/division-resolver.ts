import { ORG_PATH_SEPARATOR, orgUnitDisplayName } from '../org-directory/org-path';
import { resolveCompanyShortName } from '../org-directory/company-name';
import { OrgUnitRecord } from '../org-directory/org-unit-read';
import { divisionOf } from '../org-directory/org-division';
import { OrgDimension } from './default-org-dimension';

/**
 * F044 `AC-G32`／`AC-G33`／`AC-G34`／`AC-G36` — 本部上溯與三個維度之分組鍵／圖例標籤
 * （🟢 零 IO 純函式；`architecture-spec` §15.7 `ARCH-G5`）。
 *
 * 🔴 **明文否決遞迴 CTE 與 `codePrefix` LIKE**（§15.7）：
 *   · 遞迴 CTE 落在 SQL 內 ⇒ 本輪（無整合測試）一條測試都碰不到它；
 *   · `codePrefix` 回答的是「X 是否在 Y 的**子樹**內」（往下），本題是「X 的最近 `DIVISION`
 *     **祖先**是誰」（往上），方向相反。
 *
 * 🔴 **跨公司防護是結構性的，不是紀律性的**：`divisionOf` 之 `byCode` 只含**一家公司**之列，
 * 故「以他公司之同碼單位解析本公司文件」在資料結構上不可能發生。
 * ⚠ **明文禁止**把索引攤平成單一 `Map<orgCode, OrgUnit>` 再「小心地只查本公司」——本 repo 已於
 *   2026-09-01 與 2026-09-07 兩次因此壞掉（dev 實測四家間有 42 個重複 `orgCode`）。
 *
 * 🔴 **`無本部` 之唯一成因**（§15.7 末之事實更正）：`parentCode` 由代碼前綴機械推導
 * （`AN000` → `A0000`），且 `deriveTier` 對 `X0000` **恆**判為 `DIVISION` ⇒ 「直掛 ROOT」在真實
 * 資料裡不可能出現。`無本部` ＝ **該公司之 `X0000` 那一列不存在於 `ORG_UNIT`**。
 */

/**
 * 🔒 `ARCH-UX1`（architecture-spec §16.1，2026-09-22）：`divisionOf`／`indexOrgUnitsByCompany`
 * 已**逐字搬至**地基模組 `org-directory/org-division.ts`（該檔檔頭載明理由——避免地基模組反向
 * 依賴其消費者所造成之真實循環相依）。本檔改為 re-export：`dashboard-analytics.ts` 等既有
 * 消費端之 `from './division-resolver'` **一行未改**，既有測試亦維持綠燈（re-export 不改變
 * 執行語意）。`orgSegmentOf`／`companyLabel`／`SEG_*` 為 F044 儀表板之分組語彙，**留在本檔**。
 */
export { divisionOf, indexOrgUnitsByCompany } from '../org-directory/org-division';

/** 🔒 sentinel 段之鍵（雙底線包夾；`companyCode` 2 碼、`orgCode` 5 碼英數 ⇒ 結構上不可能碰撞）。 */
export const SEG_UNSPECIFIED_KEY = '__unspecified__';
export const SEG_NO_DIVISION_KEY = '__no_division__';
/** 🔒 sentinel 段之逐字標籤（**不加公司前綴**——它們是「解析不出來」的桶，不屬於任何一家公司）。 */
export const SEG_UNSPECIFIED_LABEL = '未指定';
export const SEG_NO_DIVISION_LABEL = '無本部';

/** 複合鍵之分隔符，逐字沿用既有 `orgGroupKeyOf()`（`frontend/src/pages/ojt-progress-view.ts`）。 */
const ORG_KEY_SEPARATOR = '__';

/** 環圖之一段（分組鍵 ＋ 圖例顯示名）。 */
export interface OrgSegment {
  key: string;
  label: string;
}

/**
 * 🔴 `AC-G32`：查無公司簡稱 ⇒ 標籤退回 `companyCode` **原字串**（不得顯示 `null`／`—`／空白），
 * 且**不得**歸入 `未指定` 段——「查不到簡稱」與「沒有制定公司」是兩件不同的事。
 */
export function companyLabel(companyCode: string): string {
  return resolveCompanyShortName(companyCode) ?? String(companyCode ?? '');
}

/**
 * 依維度求一份文件之分組鍵與標籤。
 *
 * 🔒 標籤一律以既有 `orgUnitDisplayName` ＋ `ORG_PATH_SEPARATOR` 組裝（`AC-G36`），
 *   禁止寫死第二份 `' / '`。
 * 🔴 `依制定部門` 維度下若該部無 `DIVISION` 祖先 ⇒ 本部段**收合**（`{公司簡稱} / {部名}`），
 *   **不插入 `無本部` 字樣**（`[ASSUMPTION] A-G1`）——收合沿用 `buildOrgPath()` 之既有紀律。
 */
export function orgSegmentOf(
  byCompany: ReadonlyMap<string, ReadonlyMap<string, OrgUnitRecord>>,
  companyCode: string,
  draftingDeptId: string | null,
  dimension: OrgDimension,
): OrgSegment {
  const unspecified: OrgSegment = { key: SEG_UNSPECIFIED_KEY, label: SEG_UNSPECIFIED_LABEL };
  if (!draftingDeptId) return unspecified;
  const byCode = byCompany.get(companyCode);
  const unit = byCode?.get(draftingDeptId);
  // 🔴 `draftingDeptId` 指向 `ORG_UNIT` 查無之代碼 ⇒ 亦為 `未指定`（`AC-G34`），不得排除。
  if (!byCode || !unit) return unspecified;

  const company = companyLabel(companyCode);
  if (dimension === 'company') return { key: companyCode, label: company };

  const lookup = (code: string): OrgUnitRecord | null => byCode.get(code) ?? null;
  const division = divisionOf(byCode, draftingDeptId);

  if (dimension === 'division') {
    if (!division) return { key: SEG_NO_DIVISION_KEY, label: SEG_NO_DIVISION_LABEL };
    return {
      key: `${companyCode}${ORG_KEY_SEPARATOR}${division.orgCode}`,
      label: [company, orgUnitDisplayName(division, lookup)].join(ORG_PATH_SEPARATOR),
    };
  }

  const parts = [company];
  if (division) parts.push(orgUnitDisplayName(division, lookup));
  parts.push(orgUnitDisplayName(unit, lookup));
  return {
    key: `${companyCode}${ORG_KEY_SEPARATOR}${unit.orgCode}`,
    label: parts.join(ORG_PATH_SEPARATOR),
  };
}
