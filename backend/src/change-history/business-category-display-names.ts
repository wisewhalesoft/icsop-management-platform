/**
 * F043 `AC-42` 匯出之「業務/功能類別」名稱解析接縫（比照既有 `lifecycle-display-names.ts`）。
 *
 * 該欄之值為以 `businessCategoryId` join `BUSINESS_CATEGORY` 取**當前值**經
 * `businessCategoryDisplayName()` 組合之顯示名稱（含子分類），**非**日誌列上之快照、更**非 id**。
 *
 * 🔴 以**獨立 token** 注入而非直接注入 `BusinessCategoryStore`：維持
 * `ChangeHistoryModule → BusinessCategoriesModule` 之**單向依賴**（直接注入會造成模組互相依賴），
 * 理由逐字同既有 `LIFECYCLE_DISPLAY_NAMES`／`DOCUMENT_NAME_LOOKUP` 之慣例。
 */
export const BUSINESS_CATEGORY_DISPLAY_NAMES = Symbol('BUSINESS_CATEGORY_DISPLAY_NAMES');

export interface BusinessCategoryDisplayNames {
  /** 批次解析（去重 id → 單次查詢 → Map）；查無之 id 不入 Map，由呼叫端 fallback。 */
  findDisplayNamesByIds(businessCategoryIds: string[]): Promise<Map<string, string>>;
}
