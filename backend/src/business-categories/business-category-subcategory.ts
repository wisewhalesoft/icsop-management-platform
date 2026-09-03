/**
 * F043 業務/功能類別 — 純決策層（子分類正規化、顯示名稱、池唯一性）。
 *
 * 規格權威：
 *   - docs/specs/features/F043-business-function-category.md `AC-01`～`AC-14`
 *   - docs/specs/error-handling.md#business-category（驗證順序、11 個錯誤碼）
 *   - docs/specs/architecture-spec.md §14.6.5（決策 E6）／§14.9（共用 vs 複製裁定表）
 *
 * 🔒 **決策 E6／`AC-05`／`AC-06`：不複製第二份實作**——`normalizeSubcategory` 與顯示名稱組合
 * （有子分類 → `名稱（子分類）`，全形括號無空白；無 → `名稱`）與循環領域**零耦合**，本檔直接
 * **重新匯出**既有 `../lifecycle/lifecycle-subcategory` 之函式，`businessCategoryDisplayName`
 * 為 `lifecycleDisplayName` 之**別名**。
 * 🔴 複製一份等於製造兩條可各自漂移的規則，而兩份初始碰巧相同 ⇒ 漂移前**兩份都會綠**。
 *
 * 本檔**唯一屬於本功能之邏輯**＝`checkBusinessCategoryUniqueness()`：規則與循環側逐條對等，
 * 但拋出的是 `BUSINESS_CATEGORY_*` 錯誤碼（**刻意不沿用** `LIFECYCLE_*`——「循環」在本系統是
 * `LIFECYCLE` 已佔用之專有名詞）。
 *
 * ⚠ 比對範圍（`AC-13`，沿用 F040 `OQ-E03-10` 之既有裁決、不重開此題）：涵蓋全部列、**不分
 * `status`**（`inactive` 亦參與）。故 `BusinessCategoryIdentity` 刻意不帶 `status`——契約即為
 * 「呼叫端須傳入全部列，不得先以 status 篩選」。
 *
 * 🔴 `AC-04` 之型別層結構性保證：本函式**只認** `BusinessCategoryIdentity[]`，簽章上根本不存在
 * 「循環池」這個參數 ⇒ 呼叫端不可能把 `LIFECYCLE` 的列傳進來做跨表比對。
 */
import { normalizeSubcategory } from '../lifecycle/lifecycle-subcategory';

export { normalizeSubcategory } from '../lifecycle/lifecycle-subcategory';
export { lifecycleDisplayName as businessCategoryDisplayName } from '../lifecycle/lifecycle-subcategory';

/** 唯一性比對所需之最小類別身分（不含 status：比對涵蓋停用列，`AC-13`）。 */
export interface BusinessCategoryIdentity {
  id: string;
  name: string;
  subcategory: string | null;
}

/**
 * 唯一性違反之判定結果（碼字串 ＋ HTTP 狀態；null ＝ 無違反）。
 *
 * 🔴 值域**刻意不含** `BUSINESS_CATEGORY_SUBCATEGORY_REQUIRED`（`AC-10`，與循環側之
 * `LIFECYCLE_SUBCATEGORY_REQUIRED` 之刻意不對稱）：該碼服務的是「文件建立／編輯時必須**選到**
 * 一個具體循環」之路徑；本功能之掛載方向相反（由類別節點挑文件，文件端從不選類別），
 * **沒有任何「只選到名稱層」之可達請求形狀** ⇒ 新增該碼會產生一段不可達程式碼與一條恆真之 AC。
 */
export type BusinessCategoryUniquenessViolation =
  | { code: 'BUSINESS_CATEGORY_NAME_REQUIRED'; status: 400 }
  | { code: 'BUSINESS_CATEGORY_DUPLICATE'; status: 409 }
  | { code: 'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT'; status: 409 };

/**
 * 建立／編輯之唯一性判定（INV-B1／INV-B2）。**驗證順序固定 ①②③，先後不可調換**（`AC-09`）：
 *   ① `BUSINESS_CATEGORY_NAME_REQUIRED`（400，名稱 trim 後為空）
 *   ② `BUSINESS_CATEGORY_DUPLICATE`（409，`(name, subcategory)` 組合已存在）
 *   ③ `BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT`（409，同名之「無子分類」與「有子分類」並存）
 *
 * @param candidate 待驗證之列；`id` 有值時代表編輯，比對時**排除自身該列**（`AC-11`）。
 * @param pool      `BUSINESS_CATEGORY` 之**全部**列（含 `inactive`；呼叫端不得先以 status 篩選）。
 * @returns 違反時回傳碼與狀態；無違反回 `null`。
 */
export function checkBusinessCategoryUniqueness(
  candidate: { id?: string | null; name: string; subcategory?: string | null },
  pool: BusinessCategoryIdentity[],
): BusinessCategoryUniquenessViolation | null {
  const name = (candidate.name ?? '').trim();
  const subcategory = normalizeSubcategory(candidate.subcategory);

  // ① 名稱必填優先於任何唯一性檢查（`AC-09`）。
  if (name === '') return { code: 'BUSINESS_CATEGORY_NAME_REQUIRED', status: 400 };

  // 排除自身列；其餘同名列（含停用）全數參與比對。
  const sameName = pool.filter((c) => c.id !== candidate.id && c.name === name);

  // ② INV-B1：`(name, subcategory)` 組合唯一；`null` 視為單一具體值參與比對。
  if (sameName.some((c) => normalizeSubcategory(c.subcategory) === subcategory)) {
    return { code: 'BUSINESS_CATEGORY_DUPLICATE', status: 409 };
  }

  // ③ INV-B2：同一名稱不得同時存在「無子分類」與「有子分類」之列（雙向）。
  if (
    sameName.some(
      (c) => (normalizeSubcategory(c.subcategory) === null) !== (subcategory === null),
    )
  ) {
    return { code: 'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT', status: 409 };
  }

  return null;
}
