import { ORG_PATH_SEPARATOR, orgUnitDisplayName } from '../org-directory/org-path';
import { resolveCompanyShortName } from '../org-directory/company-name';
import { OrgUnitRecord } from '../org-directory/org-unit-read';
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

/** 🔒 sentinel 段之鍵（雙底線包夾；`companyCode` 2 碼、`orgCode` 5 碼英數 ⇒ 結構上不可能碰撞）。 */
export const SEG_UNSPECIFIED_KEY = '__unspecified__';
export const SEG_NO_DIVISION_KEY = '__no_division__';
/** 🔒 sentinel 段之逐字標籤（**不加公司前綴**——它們是「解析不出來」的桶，不屬於任何一家公司）。 */
export const SEG_UNSPECIFIED_LABEL = '未指定';
export const SEG_NO_DIVISION_LABEL = '無本部';

/** 複合鍵之分隔符，逐字沿用既有 `orgGroupKeyOf()`（`frontend/src/pages/ojt-progress-view.ts`）。 */
const ORG_KEY_SEPARATOR = '__';

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
