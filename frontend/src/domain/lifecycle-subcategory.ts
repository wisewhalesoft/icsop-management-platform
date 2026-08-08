/**
 * F040 循環子分類 — 前端純函式（規格權威：docs/specs/features/F040-lifecycle-subcategory.md）。
 *
 * ⚠ 本專案無前後端共用 package，故與 `backend/src/lifecycle/lifecycle-subcategory.ts` 各自一份實作；
 *   兩份之 `normalizeSubcategory`／`lifecycleDisplayName` 語意必須逐字一致（皆有各自之約束環）。
 *
 * 兩段式選取（AC-21～AC-23）**純屬前端 UI 狀態**：送出前已解析為單一 `lifecycleId`，
 * API payload 之「所屬循環」恆僅 `lifecycleId` 一欄（人類閘門裁決 1，不新增 `lifecycleName`）。
 */

/** 選取／顯示所需之最小循環身分。 */
export interface LifecycleIdentity {
  id: string;
  name: string;
  subcategory: string | null;
}

/** trim → 空值收斂為 `null`（AC-01／AC-02；不得回傳空字串）。 */
export function normalizeSubcategory(v: unknown): string | null {
  const s = (v === null || v === undefined ? '' : String(v)).trim();
  return s === '' ? null : s;
}

/**
 * 顯示名稱組合（AC-04～AC-06）：有子分類 → `名稱（子分類）`（全形括號、括號前後無空白）；無 → `名稱`。
 * 髒資料（空字串／純空白）視同無子分類，不得輸出 `名稱（）`。
 */
export function lifecycleDisplayName(
  lc: { name: string; subcategory?: string | null } | null | undefined,
): string {
  if (!lc) return '';
  const sub = normalizeSubcategory(lc.subcategory);
  return sub === null ? lc.name : `${lc.name}（${sub}）`;
}

/** 兩段式選取之解析結果。 */
export type LifecycleSelection =
  | { ok: true; lifecycleId: string }
  | { ok: false; code: 'LIFECYCLE_SUBCATEGORY_REQUIRED' };

/**
 * 由（名稱, 子分類）解析為單一 `lifecycleId`（AC-21～AC-23）。
 *  - 名稱底下有子分類而未選到具體子分類 → 阻擋（AC-21，含違反 INV-2 之髒資料池）
 *  - 名稱底下無子分類 → 只選名稱即為完整選取（AC-23，向後相容）
 *  - 名稱不在池中／子分類不在該名稱底下 → 阻擋（不得回任意一筆）
 */
export function resolveLifecycleSelection(
  name: string,
  subcategory: string | null | undefined,
  pool: LifecycleIdentity[],
): LifecycleSelection {
  const blocked: LifecycleSelection = { ok: false, code: 'LIFECYCLE_SUBCATEGORY_REQUIRED' };
  const sub = normalizeSubcategory(subcategory);
  const sameName = pool.filter((l) => l.name === name);
  if (sameName.length === 0) return blocked;

  if (sub === null) {
    // 僅選名稱層：唯有「該名稱底下無任何子分類列」時才成立。
    const plain = sameName.filter((l) => normalizeSubcategory(l.subcategory) === null);
    const hasSub = sameName.some((l) => normalizeSubcategory(l.subcategory) !== null);
    if (hasSub || plain.length !== 1) return blocked;
    return { ok: true, lifecycleId: plain[0].id };
  }

  const hit = sameName.find((l) => normalizeSubcategory(l.subcategory) === sub);
  return hit ? { ok: true, lifecycleId: hit.id } : blocked;
}

/** 第一段（名稱）之選項來源：去重、保持池序（F010 AC-S4：同名不重複列出）。 */
export function lifecycleNameOptions(pool: LifecycleIdentity[]): string[] {
  return [...new Set(pool.map((l) => l.name))];
}

/**
 * 第二段（子分類）之選項來源：該名稱底下**有子分類**之列（依池序）。
 * 回空陣列＝該名稱無子分類層，前端據此**不呈現**第二段（AC-23）。
 */
export function subcategoriesOf(name: string, pool: LifecycleIdentity[]): LifecycleIdentity[] {
  return pool.filter((l) => l.name === name && normalizeSubcategory(l.subcategory) !== null);
}

/**
 * 下拉／篩選之選項（AC-30／AC-31）：value＝`lifecycleId`（**非** `name`、**非**循環代碼——
 * 同名不同子分類之代碼相同、無法區分）、label＝`lifecycleDisplayName` 之輸出。
 */
export function lifecycleSelectOptions(
  pool: LifecycleIdentity[],
): { value: string; label: string }[] {
  return pool.map((l) => ({ value: l.id, label: lifecycleDisplayName(l) }));
}
