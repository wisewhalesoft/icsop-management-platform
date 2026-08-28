# Epic E11: OJT 進度管理

> **Epic ID**: E11
> **Priority**: P1
> **Phase**: 1
> **Status**: Draft
> **Stories**: 3 個
> **建議 Feature 編號**: F042（實際建立由 spec-writer 負責）

## Epic Goal

現行 OJT（在職教育訓練，On-the-Job Training）簽到表為 ICSOP 文件之單份覆蓋式附件（`DOCUMENT_ATTACHMENT.type='OJT_SIGNIN'`，每份文件至多 1 份，重新上傳即覆蓋舊檔），權威見 [F016](../../../specs/features/F016-pdf-ojt-attachment.md)。此模型已無法反映實務：**一份 ICSOP 文件通常會對多個使用單位分別辦理教育訓練場次**，單份覆蓋式附件既無法區分「哪些使用單位已完成」，也會在不同單位陸續辦訓練時彼此覆蓋，造成先前單位的完訓證明消失。

本 Epic 將 OJT 從「文件的一個附件欄位」重構為一個**獨立管理功能**：以「文件 × 使用單位」為最小追蹤單位，每個單位可累積多筆教育訓練場次紀錄，單位之「完成」認定為至少一筆場次。原本掛在 ICSOP 文件表單上的 OJT 上傳入口將移除，改為在文件表單/詳情頁顯示衍生之「已完成單位」唯讀清單，實際的登記與管理動作集中於一個新的獨立管理頁面（新側選單項），內含「儀表板總覽」與「以單位分組之資料清單」兩個分頁。

**五項核心裁決（使用者已裁決，不得重開、不得改寫語意）**：

1. **列粒度＝依文件之「使用部門」原樣**：OJT 進度之每一列對應 documentId × orgCode（文件之使用部門，orgCode 可為任意層級），**不展開子樹**——與現行文件使用部門欄位（第 9 欄）之基礎顆粒度一致，僅新增「該列底下累積多筆場次」這一層。
2. **每列可掛多筆場次（場次制）**：同一文件×單位可有多筆教育訓練場次（各自帶訓練日期與簽到檔），「該單位已完成 OJT」＝至少一筆場次存在。
3. **上傳範圍維持不限**：沿用既有裁決 [OQ-D9-21](../../../specs/open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)（任何主管/部門窗口可對任何文件/任何單位列上傳，不引入權責子樹範圍檢查）——本 Epic **不重開此題**，僅將既有已裁決之「不限範圍」語意由舊端點承接到新的獨立管理頁面。
4. **上傳角色與獨立管理頁**：ICSOPAdmin / Supervisor / DeptContact 可新增/上傳教育訓練場次；新增獨立管理頁（新側選單項），內含 **TAB1 儀表板**（文件-訓練覆蓋率、處室/部門完成率、最近完成 OJT 的單位）與 **TAB2 以使用單位為群組之 OJT 資料清單**（場次登記與檢視之主要操作介面）。
5. **文件管理表單之 OJT 欄位改為唯讀衍生**：「有無 OJT」之語意由「是否已上傳 1 份附件」改為「該文件所有使用單位是否皆已完成 OJT」；文件表單/詳情頁改為顯示已完成 OJT 之使用單位清單（唯讀）；原本文件表單上之 OJT 上傳/覆蓋入口整個移除（含 2026-08-20 對 Supervisor/DeptContact 開放之破例入口），改由本 Epic 之新頁面承接全部登記動作。

**既有裁決不可違反（本 Epic 沿用、不重開）**：[OQ-D9-19](../../../specs/open-questions.md)（僅 OJT 欄位曾破例可寫之精神——本 Epic 進一步把該例外從「文件表單欄位」搬到「獨立功能」，並非推翻其存在）、[OQ-D9-20](../../../specs/open-questions.md)（其餘 19／20 欄不動，本 Epic 亦不觸碰）、[OQ-D9-21](../../../specs/open-questions.md)（不限權責範圍，見上方裁決 3）。

> ⚠ **本 Epic 為結構性重構，將反轉／作廢部分既有已定案之 US／AC**（[F016](../../../specs/features/F016-pdf-ojt-attachment.md#ojt-role-open-delta) `AC-N28`～`AC-N35`／`AC-N74`、[F026](../../../specs/features/F026-role-field-matrix.md#ojt-write-exception-delta) `AC-N22`～`AC-N27`／`AC-N24`／`AC-N75`／`AC-N76`、[F017](../../../specs/features/F017-backend-document-list.md#ojt-icon-column-delta) `AC-N37`～`AC-N40`、`AC-D2`／`AC-D5`、[F025](../../../specs/features/F025-role-function-matrix.md) `AC-N36`、[F023](../../../specs/features/F023-audit-logging.md#d9-audit-delta) `AC-N50`、[F024](../../../specs/features/F024-access-history-query.md#d9-audit-view-delta) `AC-N53`／`AC-N69`／`AC-N70`）。初步盤點見 [US-105 §既有行為反轉初步盤點](US-105-document-ojt-derived-field.md#既有行為反轉初步盤點)，逐條精確對照表留待 spec-writer 於下一棒展開，**本 Epic 及其 Story 皆不自行宣告任何一條既有 AC 之最終存廢**，僅標示反轉方向與理由。

## User Stories

| Story ID | Title | Priority | File |
|---|---|---|---|
| US-103 | OJT 場次管理（單位列×場次制，含上傳與單位分組清單） | P1 | [US-103-ojt-session-management.md](US-103-ojt-session-management.md) |
| US-104 | OJT 進度儀表板 | P1 | [US-104-ojt-progress-dashboard.md](US-104-ojt-progress-dashboard.md) |
| US-105 | 文件表單 OJT 欄位唯讀衍生化 | P1 | [US-105-document-ojt-derived-field.md](US-105-document-ojt-derived-field.md) |

## Dependencies

**Depends On**：
- [E04 ICSOP 文件管理 / US-030](../E04-icsop-document/US-030-create-icsop-document.md) — ICSOP 文件與其「文件使用部門」欄位須先存在，OJT 進度列（documentId × 使用單位）才有掛載對象。
- [E04 ICSOP 文件管理 / US-036](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md) — 本 Epic **重構並部分取代**此 Story 之 OJT 相關範圍（ICSOP PDF 附件部分不受影響、維持現況）；詳細反轉盤點見 [US-105](US-105-document-ojt-derived-field.md#既有行為反轉初步盤點)。
- [E08 權限矩陣 / US-070](../E08-permission-matrix/US-070-role-function-matrix.md) — 新獨立管理頁需要一個新的功能矩陣列（角色可視/可寫程度），此為對既有「本 delta 不新增功能列」回歸鎖定之明確反轉，需下一棒定案。
- [E02 組織同步 / epic-brief](../E02-org-sync/epic-brief.md) — 使用單位（`orgCode`）之組織資料來源與在職/裁撤狀態判定。

**Blocks**：
- [E06 前台 RWD 瀏覽](../E06-public-browsing/epic-brief.md) — 若 `OQ-E11-14` 裁定前台亦顯示已完成 OJT 之單位清單，則前台文件詳情頁需連動改版。
- [E07 稽核與文件調閱歷程](../E07-audit-trail/epic-brief.md) — 場次新增（及可能之刪除，見 `OQ-E11-04`）須計入稽核軌跡，稽核事件之落列規則需重新定案（見 `OQ-E11-13`）。

## Success Criteria

- 每一份 ICSOP 文件之每一個使用單位皆能獨立累積、檢視其教育訓練場次紀錄，不再因不同單位陸續辦理而彼此覆蓋。
- ICSOPAdmin／Supervisor／DeptContact 可透過新獨立管理頁面，為任一文件之任一使用單位新增教育訓練場次（沿用既有「不限權責範圍」裁決）。
- 管理者可在儀表板總覽掌握全體文件之訓練覆蓋率、處室/部門完成率、最近完成 OJT 動態。
- ICSOP 文件表單/詳情頁之 OJT 欄位正確反映「所有使用單位皆完成」之衍生狀態與已完成單位清單，且不再提供獨立的上傳入口。
- 既有文件之單份 OJT 附件依裁決之遷移方式（見 `OQ-E11-01`）妥善處置，不因模型重構而使既有已完成教育訓練之事實無故消失或被錯誤地憑空複製到未實際完訓之單位。

## Open Questions

本 Epic 之待裁決清單（`OQ-E11-01` ～ `OQ-E11-16`，共 16 題）已由 product-analyst 於任務交付訊息中提出（含選項、建議案與 BLOCKING/CLARIFY/可預設標記），**依團隊流程「不落檔」於本檔案**——完整內容見 product-analyst 任務回覆全文，由下一棒 spec-writer 登錄至 `docs/specs/open-questions.md` 並展開為正式決策紀錄。本節僅列標題供索引：

- [ ] OQ-E11-01：既有單份 OJT 檔之遷移方式
- [ ] OQ-E11-02：使用部門被移除時，其下場次之跟隨語意
- [ ] OQ-E11-03：裁撤單位是否計入覆蓋率分母
- [ ] OQ-E11-04：場次可否刪除、由誰刪、是否寫稽核
- [ ] OQ-E11-05：新功能列（F025）之角色格值
- [ ] OQ-E11-06：F017 清單 OJT 欄／三值篩選之新語意
- [ ] OQ-E11-07：儀表板 KPI 公式、處室 rollup 規則、「最近完成」窗口與 PII 過濾
- [ ] OQ-E11-08：文件建立頁 OJT 上傳卡處置
- [ ] OQ-E11-09：場次欄位規格（訓練日期必填/未來日/單檔或多檔）
- [ ] OQ-E11-10：檔案規格與 Blob 路徑
- [ ] OQ-E11-11：舊端點 `POST /admin/documents/:id/attachments/ojt` 之廢除方式
- [ ] OQ-E11-12：F026 OJT 列去留與「19 欄」措辭同步
- [ ] OQ-E11-13：audit action 命名
- [ ] OQ-E11-14：前台/公開面 OJT 顯示變化
- [ ] OQ-E11-15：TAB2 單位群組清單之篩選/搜尋範圍
- [ ] OQ-E11-16：場次上傳後可否編輯（與 `OQ-E11-04` 強關聯，建議一併裁決）
