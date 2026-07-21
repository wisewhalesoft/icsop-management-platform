# NFR-004: 可用性與備援 (Availability & Backup/DR)

> **NFR ID**: NFR-004
> **Category**: Reliability
> **Priority**: P1
> **Status**: Draft（SLA 與 DR 策略待確認）

## Requirement

系統為公司內部日常查閱 ICSOP 文件之工具，需具備一定可用性與資料備援能力，避免單點故障導致文件無法查閱或資料遺失。

## Acceptance Criteria

- **AC1（可用性目標）**：系統可用性目標 SLA 為 99.5%（草案值，對應每月停機時間 < 約 3.6 小時）。
- **AC2（資料庫備援）**：MSSQL 應用資料庫需每日至少一次完整備份，並保留一定天數（草案建議 30 天）之備份可供還原。
- **AC3（檔案備援）**：Azure Blob Storage 存放之 PDF/表單/OJT 附件需啟用容錯機制（如 Azure 原生的 GRS/LRS 備援，依實際採用方案確認）。
- **AC4（服務中斷處理）**：Docker Compose 各服務容器需設定健康檢查與自動重啟機制，單一服務異常不應導致整體系統不可用超過 5 分鐘（草案值）。

## Impacted Stories

- [E02 US-010 每日排程同步](../epics/E02-org-sync/US-010-daily-scheduled-sync.md)（同步失敗需納入可用性考量）
- [NFR-008 容器化部署與環境管理](NFR-008-deployment-containerization.md)

## Validation Method

- 定期執行備份還原演練（草案建議每季一次），驗證還原後資料完整性。
- 以容器編排健康檢查機制驗證服務自動復原能力。
- 監控工具（如 Prometheus/Grafana 或等效方案）追蹤系統可用性指標。

## Open Questions

- [ ] 公司是否已有既定的內部系統可用性 SLA 標準，原始訪談未提供，99.5% 為分析師建議草案值。
- [ ] 是否需要異地備援/災難復原(DR)機制，原始訪談未提及，待確認是否為必要需求或可列為後續階段。
- [ ] 備份保留天數與還原時間目標(RTO)/可容忍資料遺失時間(RPO)未定義。
