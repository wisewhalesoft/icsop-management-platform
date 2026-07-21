# NFR-001: 效能與可擴展性 (Performance & Scalability)

> **NFR ID**: NFR-001
> **Category**: Performance
> **Priority**: P0
> **Status**: Draft（部分目標值待確認，見 Open Questions）

## Requirement

系統需能負荷公司內部規模的並發使用，前台文件清單查詢、關鍵字搜尋、篩選、後台 DAG 畫布載入等操作需在可接受時間內回應。因原始訪談未提供實際員工數、文件數、循環數等資料規模數字，本 NFR 之量化目標為**草案值**，待與利害關係人確認實際規模後調整。

## Acceptance Criteria

- **AC1（API 回應時間）**：一般查詢類 API（清單、搜尋、篩選）P95 回應時間 < 2 秒（草案值）。
- **AC2（清單載入）**：前台/後台文件清單首屏載入（含分頁，每頁 50 筆）< 3 秒（草案值）。
- **AC3（DAG 畫布載入）**：單一循環之 DAG 畫布（草案假設節點數 < 200）載入與互動操作（拖曳、連線）不應有明顯延遲（< 500ms 反應）。
- **AC4（並發使用者）**：系統至少支援 500 名並發使用者同時瀏覽前台頁面（草案值，待依實際員工規模調整）。
- **AC5（檔案下載）**：ICSOP PDF 下載（含伺服器端浮水印燒錄，見 [NFR-007](NFR-007-watermark-integrity.md)）之額外處理時間 < 3 秒。

## Impacted Stories

- [E06 US-050 前台清單與排序規則](../epics/E06-public-browsing/US-050-public-list-sorting.md)
- [E06 US-051 關鍵字搜尋](../epics/E06-public-browsing/US-051-keyword-search.md)
- [E06 US-054 下載/列印PDF浮水印燒錄](../epics/E06-public-browsing/US-054-download-print-watermark-burn.md)
- [E03 US-021 DAG節點與連線維護](../epics/E03-lifecycle-dag/US-021-dag-node-edge-maintenance.md)
- [E04 US-037 後台文件清單與搜尋](../epics/E04-icsop-document/US-037-backend-document-list-search.md)

## Validation Method

- 負載測試（load testing）工具（如 k6、JMeter）模擬並發使用者情境，量測 P95/P99 回應時間。
- 前端效能量測（Lighthouse 或等效工具）驗證清單載入與 RWD 頁面之首次內容繪製(FCP)/可互動時間(TTI)。
- 於 CI/CD 或上線前壓力測試中納入清單查詢、搜尋、下載三類關鍵路徑。

## Open Questions

- [ ] 實際員工總數、ICSOP 文件總數、循環(Life Cycle)總數與單一循環最大節點數，原始訪談未提供，需向利害關係人確認以校準效能目標。
- [ ] 是否有既定的公司內部系統效能 SLA 規範可參考（例如既有其他內部系統的回應時間標準）。
- [ ] 尖峰使用時段（例如每日特定時段大量查閱）是否存在，需確認以規劃擴展策略。
