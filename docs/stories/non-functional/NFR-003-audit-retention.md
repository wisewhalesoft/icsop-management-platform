# NFR-003: 稽核與資料保留 (Audit & Data Retention)

> **NFR ID**: NFR-003
> **Category**: Compliance
> **Priority**: P0
> **Status**: Draft（保留年限待確認）

## Requirement

公司同仁查看/下載/列印 ICSOP 文件須留下可稽核軌跡（原始需求項次 l），此類稽核紀錄須具備不可竄改性並保留一定期間以供稽核追溯。

## Acceptance Criteria

- **AC1（不可竄改）**：稽核紀錄一經寫入，任何角色（含系統管理員）皆不可透過應用程式介面刪除或修改單筆紀錄；如需清理僅能透過資料庫層級的保留政策批次處理。
- **AC2（保留期限）**：稽核紀錄至少保留 3 年（草案值，待公司政策/法規確認）。
- **AC3（可查詢性）**：稽核紀錄可依人員、文件、時間區間組合查詢，查詢結果需可匯出（格式待確認，草案建議 CSV/Excel）。
- **AC4（完整性）**：每筆稽核紀錄須包含使用者身分（員工編號/姓名/部門/處室）、文件編號、動作類型（檢視/下載/列印）、時間戳記，欄位定義與 [E06 US-053](../epics/E06-public-browsing/US-053-viewer-watermark-overlay.md)/[US-054](../epics/E06-public-browsing/US-054-download-print-watermark-burn.md) 浮水印內容來源一致。

## Impacted Stories

- [E07 US-060 查看/下載/列印稽核軌跡記錄](../epics/E07-audit-trail/US-060-audit-trail-logging.md)
- [E07 US-061 文件調閱歷程查詢後台](../epics/E07-audit-trail/US-061-access-history-query-backend.md)
- [E06 US-053 網頁檢視器浮水印疊加](../epics/E06-public-browsing/US-053-viewer-watermark-overlay.md)
- [E06 US-054 下載/列印PDF浮水印燒錄](../epics/E06-public-browsing/US-054-download-print-watermark-burn.md)

## Validation Method

- 資料庫層級設定稽核表為 append-only（例如禁用 UPDATE/DELETE 權限給應用程式服務帳號，或以資料庫觸發器阻擋）。
- 保留期限以資料庫排程/歸檔測試驗證，確認超過保留期之資料依政策歸檔而非直接遺失。
- 查詢功能以整合測試驗證多條件組合查詢正確性。

## Open Questions

- [ ] 稽核紀錄法定/公司政策保留年限未提供明確依據，3 年為分析師建議草案值，待確認。
- [ ] 文件狀態切換（有效/失效/作廢）是否也須納入稽核範圍，原始需求 l 項僅明確提及查看/下載/列印，見 [E04 US-032](../epics/E04-icsop-document/US-032-status-toggle.md) Open Questions。
- [ ] 稽核紀錄匯出格式與是否需要匯出權限管控，未定義。
