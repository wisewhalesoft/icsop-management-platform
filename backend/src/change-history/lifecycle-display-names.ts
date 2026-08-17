/**
 * F038 匯出之「循環別」名稱解析接縫（architecture-spec §10.4）。
 *
 * `AC-D2` ④：值為以 `lifecycleId` join `LIFECYCLE` 取**當前值**經 `lifecycleDisplayName()` 組合之
 * 顯示名稱（含子分類），非日誌列上之快照、更非 id。以獨立 token 注入，避免 ChangeHistoryModule
 * 直接相依 LifecycleModule（反循環，比照本 repo 既有之 `DOCUMENT_NAME_LOOKUP` 慣例）。
 */
export const LIFECYCLE_DISPLAY_NAMES = Symbol('LIFECYCLE_DISPLAY_NAMES');

export interface LifecycleDisplayNames {
  /** 批次解析（去重 id → 單次查詢 → Map）；查無之 id 不入 Map，由呼叫端 fallback。 */
  findDisplayNamesByIds(lifecycleIds: string[]): Promise<Map<string, string>>;
}
