# NFR-005: 瀏覽器相容性與 RWD (Browser Compatibility & RWD)

> **NFR ID**: NFR-005
> **Category**: Usability
> **Priority**: P1
> **Status**: Draft

## Requirement

前台文件瀏覽網頁需為 RWD（響應式網頁設計），支援桌機、平板、手機等不同裝置尺寸；後台管理系統以桌機操作為主，但需確保主流瀏覽器相容性。

## Acceptance Criteria

- **AC1（瀏覽器支援）**：支援 Chrome、Edge、Safari、Firefox 最新兩個主要版本（草案值，待確認公司內部標準瀏覽器政策）。
- **AC2（RWD 斷點）**：前台頁面至少支援三種斷點：桌機（≥ 1024px）、平板（768px–1023px）、手機（< 768px，最小支援寬度 360px，草案值）。
- **AC3（觸控操作）**：手機/平板斷點下，清單、篩選、文件檢視器等互動元件需支援觸控操作（點擊區域大小符合可用性標準，草案建議最小 44x44px）。
- **AC4（後台畫布相容性）**：後台 DAG 畫布（React Flow 類套件）建議以桌機瀏覽器使用為主，草案不強制要求平板/手機完整支援拖曳編輯功能，可列為 Open Question。

## Impacted Stories

- [E06 US-055 RWD響應式版面](../epics/E06-public-browsing/US-055-rwd-responsive-layout.md)
- [E06 US-050 前台清單與排序規則](../epics/E06-public-browsing/US-050-public-list-sorting.md)
- [E03 US-021 DAG節點與連線維護](../epics/E03-lifecycle-dag/US-021-dag-node-edge-maintenance.md)

## Validation Method

- 跨瀏覽器測試（BrowserStack 或等效工具）覆蓋 AC1 所列瀏覽器組合。
- 以實機/模擬器於三種斷點下驗證版面與互動元件可用性。
- 無障礙/可用性檢查工具（如 Lighthouse）驗證觸控目標大小。

## Open Questions

- [ ] 公司內部標準瀏覽器政策（是否有強制使用特定瀏覽器或版本限制）未提供，需確認。
- [ ] 後台 DAG 畫布是否需支援平板編輯（例如主管於平板上檢視 DAG），原始需求未提及，草案暫定僅桌機需完整支援。
- [ ] 是否需支援舊版瀏覽器（如 IE 相容模式），原始訪談未提及，草案假設不需要。
