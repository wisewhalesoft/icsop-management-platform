/**
 * F040 循環子分類 — 純決策層（後端唯一權威實作）。
 *
 * 規格權威：docs/specs/features/F040-lifecycle-subcategory.md
 *   - 正規化（AC-01／AC-02、INV-3）：trim；空字串／純空白／未提供 → `null`（不得落地空字串）
 *   - 顯示名稱（AC-04～AC-06）：有子分類 → `名稱（子分類）`（全形括號、括號前後無空白）；無 → `名稱`
 *   - 唯一性（INV-1／INV-2）：驗證順序固定為
 *       ① LIFECYCLE_NAME_REQUIRED（400）
 *       ② LIFECYCLE_DUPLICATE（409，(name, subcategory) 組合已存在）
 *       ③ LIFECYCLE_SUBCATEGORY_CONFLICT（409，同名之「無子分類」與「有子分類」並存）
 *     先後**不可調換**。
 *
 * ⚠ 比對範圍（OQ-E03-10 定案）：涵蓋全部列、**不分 status**（`inactive` 亦參與）。
 *   故 `LifecycleIdentity` 刻意不帶 `status`——契約即為「呼叫端須傳入全部列，不得先以 status 篩選」。
 */

/** 唯一性比對所需之最小循環身分（不含 status：比對涵蓋停用列）。 */
export interface LifecycleIdentity {
  id: string;
  name: string;
  subcategory: string | null;
}

/** trim → 空值收斂為 `null`（INV-3；冪等）。 */
export function normalizeSubcategory(v: unknown): string | null {
  const s = (v === null || v === undefined ? '' : String(v)).trim();
  return s === '' ? null : s;
}

/**
 * 全站唯一之循環顯示名稱組合（AC-30：任何呈現循環名稱之路徑一律經本函式，不得自行以 name 串接）。
 * 髒資料防禦（AC-06）：`subcategory` 為空字串／純空白時視同無子分類，不得輸出 `名稱（）`。
 */
export function lifecycleDisplayName(
  lc: { name: string; subcategory?: string | null } | null | undefined,
): string {
  if (!lc) return '';
  const sub = normalizeSubcategory(lc.subcategory);
  return sub === null ? lc.name : `${lc.name}（${sub}）`;
}

/** 唯一性違反之判定結果（碼字串 ＋ HTTP 狀態；null ＝ 無違反）。 */
export type LifecycleUniquenessViolation =
  | { code: 'LIFECYCLE_NAME_REQUIRED'; status: 400 }
  | { code: 'LIFECYCLE_DUPLICATE'; status: 409 }
  | { code: 'LIFECYCLE_SUBCATEGORY_CONFLICT'; status: 409 };

/**
 * 建立／編輯之唯一性判定（INV-1／INV-2）。
 * @param candidate 待驗證之列；`id` 有值時代表編輯，比對時**排除自身該列**（AC-15）。
 * @param pool      `LIFECYCLE` 之**全部**列（含 `inactive`；呼叫端不得先以 status 篩選，AC-20）。
 * @returns 違反時回傳碼與狀態；無違反回 `null`。
 */
export function checkLifecycleUniqueness(
  candidate: { id?: string | null; name: string; subcategory?: string | null },
  pool: LifecycleIdentity[],
): LifecycleUniquenessViolation | null {
  const name = (candidate.name ?? '').trim();
  const subcategory = normalizeSubcategory(candidate.subcategory);

  // ① 名稱必填優先於任何唯一性檢查（AC-14）。
  if (name === '') return { code: 'LIFECYCLE_NAME_REQUIRED', status: 400 };

  // 排除自身列；其餘同名列（含停用）全數參與比對。
  const sameName = pool.filter((l) => l.id !== candidate.id && l.name === name);

  // ② INV-1：(name, subcategory) 組合唯一；`null` 視為單一具體值參與比對。
  if (sameName.some((l) => normalizeSubcategory(l.subcategory) === subcategory)) {
    return { code: 'LIFECYCLE_DUPLICATE', status: 409 };
  }

  // ③ INV-2：同一名稱不得同時存在「無子分類」與「有子分類」之列（雙向）。
  if (
    sameName.some(
      (l) => (normalizeSubcategory(l.subcategory) === null) !== (subcategory === null),
    )
  ) {
    return { code: 'LIFECYCLE_SUBCATEGORY_CONFLICT', status: 409 };
  }

  return null;
}
