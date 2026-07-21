# Epic E07: 稽核與文件調閱歷程

> **Epic ID**: E07
> **Priority**: P0
> **Phase**: 1
> **Status**: Draft
> **Stories**: 4 個

## Epic Goal

公司同仁查看/下載/列印 ICSOP 文件時，須留下可稽核軌跡，以符合公司內控與稽核合規需求。本 Epic 負責三件事：(1) 在使用者於前台檢視器開啟文件、下載文件或觸發列印的當下，即時記錄一筆稽核紀錄（操作人員、部門/處室、文件、操作類型、時間戳記）；(2) 在後台提供文件調閱歷程查詢功能，供管理者依人員、文件、時間區間追蹤誰在何時查閱/下載/列印了哪份文件；(3) 在後台提供**獨立功能「文件變更歷程」**（Change History，獨立側選單項，與(2)「文件調閱歷程」為平行的兩個功能、非從屬關係——2026-07-17 使用者定案：change 歸 change、access 歸 access），分「ICSOP 程序書」與「循環樹狀圖」兩個 tab，以 append-only 變更日誌方式追溯**資料本身內容**何時、被誰、如何異動（欄位層 before/after diff、DAG 結構新舊版預覽），與(1)(2)追蹤「誰調閱了什麼」的性質互補而不重複。

稽核紀錄的產生與 [E06 前台 RWD 瀏覽](../E06-public-browsing/epic-brief.md) 之浮水印疊加/燒錄機制緊密相關——浮水印內容（員工編號-姓名-公司名稱-部門-處/室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-當下時間）與稽核紀錄本質上是同一組事件資料的兩種呈現方式，須確保兩者一致。

**變更歷程與「僅保存當前版本」決策之調和**：專案定案「版本管理僅保存當前版本、不留歷史版本檔」，本 Epic 之變更歷程功能（US-062/US-063）以**輕量 append-only 事件日誌**（欄位層 diff 或結構化變更事件/快照）達成異動追溯，而非保留整份文件/循環的歷史快照檔案；檔案型附件仍維持覆蓋式儲存不留舊檔，僅記錄「已被替換」事件。詳細調和說明見 [US-062](US-062-document-change-history.md)／[US-063](US-063-lifecycle-tree-change-history.md) 各自的「與既有決策之調和」段落。

## User Stories

| Story ID | Title | Priority | File |
|----------|-------|----------|------|
| US-060 | 查看/下載/列印稽核軌跡記錄 | P0 | [US-060-audit-trail-logging.md](US-060-audit-trail-logging.md) |
| US-061 | 文件調閱歷程查詢後台 | P0 | [US-061-access-history-query-backend.md](US-061-access-history-query-backend.md) |
| US-062 | ICSOP 程序書變更歷程（欄位層 Before/After Diff） | P1 | [US-062-document-change-history.md](US-062-document-change-history.md) |
| US-063 | 循環樹狀圖變更歷程（新舊版預覽／下載燒錄浮水印） | P1 | [US-063-lifecycle-tree-change-history.md](US-063-lifecycle-tree-change-history.md) |

## Dependencies

**Depends On**
- [E06 US-053 網頁檢視器浮水印疊加](../E06-public-browsing/US-053-viewer-watermark-overlay.md) 與 [E06 US-054 下載/列印 PDF 浮水印燒錄](../E06-public-browsing/US-054-download-print-watermark-burn.md) — 提供稽核紀錄之觸發時機
- [E01 帳號與驗證](../E01-account-auth/epic-brief.md) — 需先識別出操作使用者身分才能記錄稽核軌跡
- [E08 權限矩陣](../E08-permission-matrix/epic-brief.md) — 決定調閱歷程查詢功能之角色可視範圍；[US-070](../E08-permission-matrix/US-070-role-function-matrix.md) 矩陣另新增獨立一列「文件變更歷程」（2026-07-17 OQ-E07-04），決定 US-062/US-063 之角色可視範圍
- **US-062 額外依賴**：[E04 US-031 編輯與版本對照](../E04-icsop-document/US-031-edit-with-comparison.md)／[US-032 文件狀態切換](../E04-icsop-document/US-032-status-toggle.md)／[US-034 制定組織與當責室長設定](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md)／[US-036 PDF 與 OJT 附件上傳](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md) — 皆為文件變更事件之來源功能
- **US-063 額外依賴**：[E03 US-021 DAG 節點與連線維護](../E03-lifecycle-dag/US-021-dag-node-edge-maintenance.md)／[US-023 節點抽屜維護](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md)／[US-025 循環樹狀圖預覽](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md) — 分別為結構變更事件來源與 viewer/浮水印呈現手法基礎

**Blocks**
- 無主要下游 Epic 依賴，但為公司稽核合規之基礎能力，任何涉及文件存取的功能上線前皆應確保本 Epic 已就緒

## Success Criteria

- 前台文件查看、下載、列印三種操作皆各自產生獨立且不可竄改的稽核紀錄
- 稽核紀錄記錄失敗不應阻斷使用者正常瀏覽文件（不可因記錄失敗而讓使用者無法看文件），但需有補償或重試機制避免稽核資料遺漏
- 後台可依人員、文件、時間區間查詢調閱歷程，並可依「文件／循環／變更」類型篩選（2026-07-17 OQ-E07-03 定案，涵蓋 US-025 循環樹狀圖預覽與 US-062/US-063 變更歷程之調閱稽核）；查詢權限僅開放系統管理員／ICSOP 管理員（全公司唯讀），主管／部門窗口／一般使用者無此功能
- 一般使用者無法存取或竄改稽核紀錄
- 「變更歷程」兩個 tab 皆能正確呈現異動 before/after（欄位層 diff 或新舊樹狀圖），檢視/下載計入稽核，且不違反「僅保存當前版本」之既有決策精神

## Open Questions

> 本 Epic 之 Open Questions 部分已定案，完整決策紀錄見 [open-questions.md](../../../specs/open-questions.md)；仍有 2 項維持未決（皆於 open-questions.md 逐條 OQ 列表中查無對應條目，維持未決並建議正式補列，見下）。

- [x] **稽核紀錄保留年限**（OQ-NFR003 ✅）— **定案**：沿用 **≥3 年**保留年限；**變更歷程（F037/F038）適用同一政策**，不另訂獨立年限；狀態切換納入變更歷程記錄（見 OQ-E04-02）。保留年限**數值**本身已定案沿用草案值，但正式法規/公司政策依據仍待裁定（不阻塞 MVP）。草案值記錄於 [NFR-003 稽核與資料保留](../../non-functional/NFR-003-audit-retention.md)。
- [x] **稽核紀錄寫入失敗之補償/重試機制細節**（OQ-E07-09 ✅ 2026-07-20 補列並定案）— 採 **DB-based Transactional Outbox**（architecture-spec §5.5）：同步嘗試寫入，失敗事件進 outbox，由背景排程（`@nestjs/schedule`）補償重試；**冪等鍵＝每筆 outbox 紀錄之唯一 `id`**，避免重複補寫。稽核寫入失敗**不阻斷**使用者瀏覽。明確**不引入** RabbitMQ/Kafka（architecture-spec §8.2：現有規模下 DB-based Outbox 已足夠）。註：NFR-006 之「3 次遞增間隔」僅適用 E02 組織同步，**不適用**稽核寫入——兩者為不同機制，不可互相套用。
- [x] **是否需對稽核紀錄之查詢行為留下「稽核的稽核」紀錄（meta-audit）**（OQ-E07-10 ✅ 2026-07-20 補列並定案）— **本輪不納入**。訪談未提出此需求，且 F024 調閱歷程查詢之存取已受 F025 角色矩陣限縮為僅 SysAdmin／ICSOPAdmin。僅記錄供未來考量；若日後納入，屬 `AUDIT_LOG` 新增 `actionType`，不需 schema 變更。
- [x] **（2026-07-17 已定案，OQ-E07-04）「文件變更歷程」為獨立功能，於 US-070 矩陣新增獨立列**：使用者澄清「變更歷程」不歸屬、不比照「文件調閱歷程查詢」（change 歸 change、access 歸 access），已修正 Epic Goal 敘述與 US-062/US-063 之 UI 位置/導覽敘述（獨立側選單項，非調閱歷程頁下方區塊或子頁）。於 [US-070](../E08-permission-matrix/US-070-role-function-matrix.md) 新增獨立一列「文件變更歷程」＝ SysAdmin／ICSOPAdmin 唯讀（全公司）、主管／部門窗口／一般使用者無（此權限值恰與「文件調閱歷程查詢」列相同，但為各自獨立之矩陣列，非比照關係）。原 US-063 草案「比照循環管理、主管全公司唯讀」已被覆蓋；OQ-E08-03（循環管理主管全公司唯讀）僅適用循環樹狀圖預覽本身（US-025），不適用變更歷程。詳見兩 story 之 AC-7 與 US-070 矩陣。
- [x] **DAG 變更歷程之快照/事件粒度**（OQ-E07-05 ✅ 2026-07-17，system-architect 定案）— **定案**：**完整快照**（非結構化 diff 重放）＋**逐原子操作各寫一筆**（非儲存層編輯階段聚合）；`LIFECYCLE_CHANGE_LOG`＋`LIFECYCLE_SNAPSHOT` 皆新建為獨立實體（見 OQ-E07-02）。「編輯階段」呈現需求以**查詢層動態分組**（時間視窗參數，草案 60 秒，可調）滿足，不引入新持久化狀態機／背景收斂 job。決策理由（規模評估／正確性優先於重放優化／與 F008-F009 現行逐動作持久化模式之契合度）詳見 [data-model.md「變更歷程相關實體」](../../../specs/data-model.md#change-history-entities)。
- [x] **（2026-07-17 已定案，OQ-E07-03）循環／變更調閱稽核納入文件調閱歷程查詢**：[US-061](US-061-access-history-query-backend.md) 新增「類型」篩選（文件／循環／變更），[E03 US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md) 之 `LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT` 與 US-062/US-063 之 `CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD` 皆納入查詢範圍，非另建獨立查詢頁籤；`AUDIT_LOG.targetType` 已支援，無需 schema 變更。
