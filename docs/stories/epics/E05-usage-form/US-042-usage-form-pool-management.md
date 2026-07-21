# US-042: 使用表單池管理（獨立畫面）

> **Story ID**: US-042
> **Epic**: [E05 文件使用表單管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a **ICSOP 管理員**,
I want **一個獨立的「使用表單管理」後台畫面，集中維護表單池（上傳、更新、移除、查詢）並檢視每張表單被哪些 ICSOP 文件使用**,
So that **表單可被多份文件重複引用、統一維護，避免同一張表單在各文件間重複上傳與版本不一致**。

## Context / 補漏說明

原 US-040/US-041 將使用表單定義為「per-document 上傳」，UX 設計亦僅將其對應到文件編輯頁的表單面板，**未規劃獨立的「使用表單管理」畫面**；但側邊選單（角色×功能矩陣）與原始需求 (m) 皆列此為後台功能。本 Story 補上該獨立畫面，並確立**表單池（多對多共用）**模型。

## Acceptance Criteria

### AC1：表單池清單
- **Given** 我是 ICSOP 管理員，開啟「使用表單管理」
- **When** 畫面載入
- **Then** 以清單呈現所有使用表單：表單名稱、格式（excel/pdf）、大小、上傳者/上傳時間、**關聯文件數**；支援關鍵字搜尋與格式篩選。

### AC2：上傳新表單至池
- **Given** 我點擊「上傳表單」
- **When** 選擇 excel/pdf 檔並送出
- **Then** 存入 Azure Blob、加入表單池並顯示於清單；格式不符回 `FILE_FORMAT_NOT_ALLOWED`。

### AC3：檢視表單被哪些文件使用
- **Given** 某表單關聯數 > 0
- **When** 我展開該表單
- **Then** 列出使用此表單的 ICSOP 文件（編號 + 名稱），可跳轉。

### AC4：移除表單的關聯保護
- **Given** 某表單仍被 1 份以上文件關聯
- **When** 我嘗試移除該表單
- **Then** 顯示警示「此表單已被 N 份文件使用」，需二次確認（將一併解除關聯），或提示先解除關聯（`USAGE_FORM_IN_USE`）。

### AC5：角色權限
- **Given** 非 ICSOP 管理員（系統管理員唯讀、其餘無）
- **When** 開啟此頁
- **Then** 系統管理員唯讀（可查看表單池、不可上傳/移除）；主管／部門窗口／一般使用者被拒（`PERMISSION_DENIED`）。

### AC6：更新表單（覆蓋上傳）— 被多份文件共用時之警示與二次確認（OQ-E05-05 ✅ 2026-07-21 定案）
- **Given** 我在表單池對某筆既有表單選擇「更新」（以新檔取代舊檔），且該表單目前「關聯文件數」≥ 2
- **When** 我選擇新的 excel/pdf 檔並送出覆蓋
- **Then** 系統顯示警示「此表單另被 N 份文件引用，覆蓋將同時更新全部引用文件所見內容」（N＝該表單目前之關聯文件數），並要求二次確認（錯誤碼 `USAGE_FORM_OVERWRITE_SHARED`，409）；使用者未完成二次確認前，系統不執行覆蓋。

### AC7：關聯文件數 ≤ 1（僅單一文件引用或無引用）時可直接覆蓋
- **Given** 我在表單池對某筆既有表單選擇「更新」，且該表單「關聯文件數」為 0（尚無文件引用）或 1（僅被單一文件引用）
- **When** 我選擇新的 excel/pdf 檔並送出覆蓋
- **Then** 系統不顯示跨文件警示、不觸發 `USAGE_FORM_OVERWRITE_SHARED`，僅需一般覆蓋確認即可完成更新。

### AC8：覆蓋確認完成 — 舊檔即時失效且不保留歷史版本
- **Given** 我已於 AC6 警示畫面點擊「確認覆蓋」，或依 AC7 條件送出一般覆蓋確認
- **When** 系統完成覆蓋處理
- **Then** 舊檔立即不再可經任何引用文件（前台或後台）存取；所有原引用此表單之 ICSOP 文件，其詳情頁與下載連結所見／取得者皆即為新內容；系統維持覆蓋語意、不保留舊檔案之歷史版本或版本對照記錄（比照 ICSOP 文件僅保存當前版本原則）。

### AC9：覆蓋警示時取消
- **Given** AC6 觸發之警示畫面已顯示
- **When** 我選擇「取消」而非「確認覆蓋」
- **Then** 系統不執行任何覆蓋動作，原表單檔案內容與所有既有文件關聯維持不變。

## Technical Notes

- 表單與文件為**多對多**關聯（表單池 ← 關聯 → ICSOP 文件）；文件建立/編輯（US-040 更新後）由表單池可搜尋多選關聯。
- 檔案存 Azure Blob；下載走短效期憑證；管理端上傳/移除記錄操作者/時間（管理操作記錄，與前台調閱稽核 E07 性質不同）。
- 檔案大小/格式上限為示範值，待 OQ-E05-02 確認。
- **表單更新（覆蓋）語意（OQ-E05-05 ✅ 定案）**：更新表單一律採**覆蓋上傳、不保留歷史版本／版本對照**（比照 E04 ICSOP 文件「僅保存當前版本」原則）。因表單為跨文件共用之表單池（OQ-E05-04），覆蓋被「關聯文件數」≥ 2 之表單時，須觸發 `USAGE_FORM_OVERWRITE_SHARED`（409）二次確認流程；「關聯文件數」≤ 1 時可直接覆蓋，無跨文件警示。詳見 [F018 使用表單管理](../../../specs/features/F018-usage-form-management.md)、[error-handling.md#file](../../../specs/error-handling.md#file)。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-042-01 | 上傳 .xlsx 表單 → 加入池並顯示 | Happy Path |
| TC-042-02 | 上傳 .docx → 拒絕（FILE_FORMAT_NOT_ALLOWED） | Error |
| TC-042-03 | 展開被 3 份文件使用之表單 → 正確列出 3 份 | Happy Path |
| TC-042-04 | 移除仍被使用之表單 → 警示 + 二次確認（USAGE_FORM_IN_USE） | Warning |
| TC-042-05 | 系統管理員開啟 → 唯讀（不可上傳/移除）；主管／一般使用者 → 封鎖（PERMISSION_DENIED） | Edge |
| TC-042-06 | 更新（覆蓋）關聯文件數＝3 之表單 → 顯示「另被 3 份文件引用」警示，要求二次確認（USAGE_FORM_OVERWRITE_SHARED, 409） | Warning |
| TC-042-07 | TC-042-06 二次確認完成 → 舊檔不再可經任何引用文件存取；3 份文件詳情頁/下載連結所見皆為新內容；無歷史版本可查 | Happy Path |
| TC-042-08 | TC-042-06 警示畫面選擇取消 → 原表單檔案與 3 份文件之關聯均不變 | Edge Case |
| TC-042-09 | 更新關聯文件數＝1（或＝0）之表單 → 直接覆蓋完成，不顯示跨文件警示、不觸發 USAGE_FORM_OVERWRITE_SHARED | Happy Path |

## Dependencies

- **Blocked By**: [US-040 使用表單上傳管理](US-040-usage-form-upload.md)、[E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)
- **Blocks**: [E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md)（自表單池選取）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E05 文件使用表單管理](epic-brief.md)
- [US-040 使用表單上傳管理](US-040-usage-form-upload.md)、[US-041 表單與文件關聯維護](US-041-form-document-association.md)
- [F018 使用表單管理](../../../specs/features/F018-usage-form-management.md)（AC6～AC9 覆蓋語意之權威來源）
- [error-handling.md#file](../../../specs/error-handling.md#file)（`USAGE_FORM_OVERWRITE_SHARED` 錯誤碼定義）
