# F023 — 稽核軌跡記錄 · Test Design
> source: docs/specs/features/F023-audit-logging.md · worktree: audit · 2026-07-22

## 測試策略

- **unit 用假 store**：比照 `documents.service.spec.ts`／`org-sync` 系列之 `FakeStore` 慣例，實作 `FakeAuditOutboxStore`（暫存 pending 事件）與 `FakeAuditStore`（最終 append-only 表），不連真實 DB。
- **append-only／不可竄改的 DB 層強制 → [integration]**：架構明定「DB 層撤銷應用帳號 UPDATE/DELETE 權限（非僅應用層檢查，屬縱深防禦）」，此為 MSSQL 權限層行為，假 store 無法驗證，須待 migration 建表＋`GRANT`/`REVOKE` 落地後以真實連線驗證。App 層的「結構性防禦」（介面不暴露 update/delete）以 unit 驗證。
- **Outbox 補償重試排程 → unit（比照 `scheduled-org-sync.service.spec.ts`）**：不測 `@Cron` 之時間觸發（難以確定性驗證），改直接測 `processOutboxRetry()` 方法之委派、吞例外、冪等行為。
- **序列化（stdout fallback）暫不自動化**：僅驗證「例外不外拋、主流程正常結束」，不斷言 log 訊息字串內容（比照 `scheduled-org-sync` 之「靜音 log、不驗內容」慣例）。
- **重要範圍限制**：F020（浮水印疊加／VIEW-DOWNLOAD-PRINT 端點）於本 worktree 尚未存在（`feature-status.md` 標記 F020 未開始）。本測試設計因此聚焦 **AuditWriter 服務介面本身**——給定一個已組裝好的事件 payload（模擬 F020/F018 呼叫），驗證 `recordAccess()` 之寫入/欄位/非阻斷/重試/不可竄改行為；並不包含「使用者在真實檢視器點擊觸發」的端對端串接（那屬於 F020 worktree 之整合測試範疇，於 F020 開發時另行設計並回頭串接本模組）。見「開放設計問題」#1。

## Test Scenarios

### TS-F023-001 VIEW 事件寫入 → 產生 1 筆紀錄，欄位正確 [unit]
- **Given** `AuditWriter` 與空的 `FakeAuditOutboxStore`；一組模擬 F020 呼叫之 VIEW 事件（accountId／employeeNo／name／department／section／documentId／documentNumber／targetType=`DOCUMENT`／actionType=`VIEW`／watermarkSnapshot／occurredAt／source=`DIRECT`）
- **When** 呼叫 `recordAccess(event)`
- **Then** store 收到恰 1 筆待補寫紀錄，逐欄與輸入相等；`source` 未提供時預設為 `DIRECT`
- 對應 AC1；data-model AUDIT_LOG 全欄位

### TS-F023-002 DOWNLOAD 與 PRINT 各自獨立成一筆 [unit]
- **Given** 同一文件、同一使用者
- **When** 依序呼叫 `recordAccess(DOWNLOAD 事件)`、`recordAccess(PRINT 事件)`
- **Then** store 累積 2 筆各自獨立紀錄（各有唯一 id），互不合併、互不覆寫彼此欄位
- 對應 AC2

### TS-F023-003 watermarkSnapshot 逐字保存（pass-through，不二次組裝） [unit]
- **Given** 呼叫端傳入之 `watermarkSnapshot` 字串（模擬 WatermarkModule 產出，含 emp-name-company-dept-section-標語-time 之連字號組字）
- **When** `recordAccess(event)`
- **Then** 寫入之 `watermarkSnapshot` 與輸入完全相等（AuditWriter 不重新推導/正規化該字串）
- 對應 AC3——以「不重新推導、逐字保存」的介面契約保證「稽核與浮水印完全一致」，而非由 AuditWriter 自行組字

### TS-F023-004 使用表單下載 → targetType=USAGE_FORM、formId 記錄、documentId 為 null [unit]
- **Given** F018 使用表單下載事件（formId 帶值、documentId 未帶）
- **When** `recordAccess(event)`
- **Then** 寫入紀錄 `targetType='USAGE_FORM'`、`formId` 正確、`documentId`/`lifecycleId` 皆為 null
- 對應 Alternative Flow

### TS-F023-005 條件必填矩陣：targetType 與 documentId/lifecycleId 二擇一 [unit / boundary]
- **Given** `targetType='LIFECYCLE'` 但事件未帶 `lifecycleId`
- **When** `recordAccess(event)`
- **Then** 拒絕（精確錯誤碼待定，見開放問題#5；暫定 `AUDIT_TARGET_FIELD_REQUIRED`），不寫入任何紀錄
- 同組：`targetType='DOCUMENT'` 但未帶 `documentId` → 同樣拒絕；`targetType='DOCUMENT'` 但誤帶 `lifecycleId`（不應有值）→ 拒絕或靜默忽略（待定）
- 對應 data-model AUDIT_LOG 條件必填規則（保護 F024 及未來 F036/F037/F038 消費端資料品質）

### TS-F023-006 短時間內重複開啟同文件 → 各自獨立記錄，不節流不去重 [unit]
- **Given** 同一使用者短時間內對同一文件連續呼叫 3 次 VIEW
- **When** `recordAccess()` × 3
- **Then** store 累積 3 筆獨立紀錄，`occurredAt` 各自反映呼叫當下時間，皆不被合併/丟棄
- 對應 Edge Cases；OQ-E07-01（已定案：不節流不去重）

### TS-F023-007 Outbox 寫入暫時失敗 → 呼叫端仍視為成功（不阻斷瀏覽） [unit]
- **Given** `FakeAuditOutboxStore.insert()` 拋出例外（模擬 DB 暫時不可用）
- **When** 呼叫方（模擬 F020）呼叫 `recordAccess(event)`
- **Then** `recordAccess()` 正常 resolve（不 reject），呼叫端無需 try/catch 即可繼續回應使用者
- 對應 AC4 前半；NFR-003（不阻斷）

### TS-F023-008 Outbox 本身也寫入失敗（極端情境）→ fallback 不中斷主流程 [unit]
- **Given** `FakeAuditOutboxStore.insert()` 持續拋出例外，模擬 App DB 全面不可用
- **When** `recordAccess(event)`
- **Then** 呼叫仍正常結束（不拋例外），不斷言實際 log/告警內容（僅驗證「不中斷」，比照 `scheduled-org-sync` 慣例）
- 對應 架構 §5.5 最終防線

### TS-F023-009 補償重試成功 → pending 紀錄搬遷至 AUDIT_LOG，Outbox 標記完成 [unit]
- **Given** Outbox 內有 2 筆 `pending` 紀錄
- **When** 呼叫 `processOutboxRetry()`
- **Then** `AuditStore.append()`（或等義寫入方法）各被呼叫 1 次、對應 outbox 紀錄被移除或標記為完成，兩者狀態一致
- 對應 AC4 後半（服務恢復後成功補寫該筆）

### TS-F023-010 補償重試部分失敗 → 失敗筆維持 pending，成功筆正常搬遷，例外不中斷整批 [unit]
- **Given** Outbox 有 3 筆 pending，其中 1 筆搬遷時 `AuditStore.append()` 拋錯
- **When** `processOutboxRetry()`
- **Then** 2 筆成功搬遷並從 Outbox 移除，1 筆失敗者仍留在 Outbox（供下次重試），整批呼叫本身不拋未捕捉例外（比照 `scheduled-org-sync.service.spec.ts` 之「一般例外被吞、不外拋」）

### TS-F023-011 補償重試冪等：同一 outbox id 不重複補寫兩筆 [unit]
- **Given** 同一筆 outbox 紀錄因排程重疊被 `processOutboxRetry()` 呼叫 2 次（模擬短間隔排程與前次未結束重疊）
- **When** 兩次呼叫皆嘗試搬遷同一筆
- **Then** 最終 `AuditStore` 僅含 1 筆對應紀錄（以 outbox id 為冪等鍵，不重複寫入）
- 對應 架構 §5.6 冪等性考量

### TS-F023-012 不可竄改（App 層）：無可用寫入路徑可修改/刪除既有紀錄 [unit]
- **Given** 已寫入 `AuditStore` 之既有紀錄
- **When** 呼叫端嘗試透過 `AuditStore` 之公開介面修改或刪除該紀錄（若介面設計上仍暴露此類方法）
- **Then** 立即拒絕（`AUDIT_IMMUTABLE`），不觸及底層儲存；若介面設計為完全不暴露 update/delete 方法（建議做法），本情境改為「型別層級不存在該呼叫路徑」，此點需與開放問題#2 一併定案後才能寫成可執行測試
- 對應 AC5（縱深防禦第一層——應用層）

### TS-F023-013 [integration] 不可竄改（DB 層）：應用帳號對 AUDIT_LOG 執行 UPDATE/DELETE 遭資料庫拒絕
- **Given** 真實 MSSQL、`AUDIT_LOG` migration 已執行（含撤銷應用帳號 UPDATE/DELETE 權限）、表內已有至少 1 筆紀錄
- **When** 以應用程式所用之 DB 帳號直接對該表送出 `UPDATE`／`DELETE` 陳述式（繞過 app 層，模擬應用層防線失效或惡意直連）
- **Then** 資料庫回拒（權限不足錯誤），紀錄內容不變；此為即使應用層被繞過仍生效的最終防線
- 對應 AC5（縱深防禦第二層——DB 層）；架構 §6「稽核與資料保留」

### TS-F023-014 [integration] 保留策略：AUDIT_LOG 無刪除路徑，寫入後長期可查
- **Given** 已寫入之稽核紀錄
- **When** 檢視應用程式碼與資料庫 schema（無任何 DELETE 語句／無 TTL／無自動清除排程）
- **Then** 確認資料在架構層面「只增不減」；本項以程式碼/schema 審查驗收，非等待實際 3 年之時間跨度測試
- 對應 NFR-003 AC2（保留 ≥3 年，草案值）

### TS-F023-015 [integration] 查詢索引存在性
- **Given** `AUDIT_LOG` migration 已執行
- **When** 檢視資料庫索引目錄
- **Then** 存在 `(accountId)`、`(documentId)`、`(occurredAt)` 及組合索引 `(documentId,occurredAt)`、`(accountId,occurredAt)`
- 對應 架構 §4.6／NFR-001（供 F024 查詢效能）

### TS-F023-016 targetType 全集涵蓋：5 種皆可成功寫入 [unit / boundary]
- **Given** 5 組事件，`targetType` 分別為 `DOCUMENT`／`USAGE_FORM`／`LIFECYCLE`／`DOCUMENT_CHANGE_LOG`／`LIFECYCLE_CHANGE_LOG`，各自搭配 data-model 定義之對應 `actionType`（如 `LIFECYCLE_VIEW`、`CHANGE_LOG_VIEW`…）與各自條件必填欄位
- **When** 依序 `recordAccess()`
- **Then** 5 筆皆成功寫入，驗證 AuditWriter 作為「共用基礎」對未來 F036/F037/F038 呼叫方之介面穩定性（worktree-guide 明列此為本 worktree 之重點目標）

## AC → TS 覆蓋對照表

| AC / 來源 | 內容摘要 | 覆蓋 TS |
|---|---|---|
| AC1 | VIEW → 1 筆紀錄，欄位正確 | TS-001 |
| AC2 | DOWNLOAD/PRINT 各自獨立 | TS-002 |
| AC3 | 稽核與浮水印完全一致 | TS-003 |
| AC4 | 寫入異常不阻斷瀏覽＋服務恢復補寫 | TS-007, TS-009, TS-010 |
| AC5 | AUDIT_IMMUTABLE（403/405） | TS-012, TS-013 |
| Alternative Flow（使用表單） | targetType=USAGE_FORM | TS-004 |
| Edge Case（寫入服務不可用） | 補償佇列 | TS-008 |
| Edge Case（重複調閱） | OQ-E07-01 不節流不去重 | TS-006 |
| data-model 條件必填規則 | documentId/lifecycleId 二擇一 | TS-005 |
| 架構 §5.6 冪等性 | Outbox 重試冪等鍵 | TS-011 |
| NFR-003 AC2 | 保留 ≥3 年 | TS-014 |
| NFR-001 / 架構 §4.6 | 查詢索引 | TS-015 |
| worktree 目標（共用基礎） | targetType 全集穩定性 | TS-016 |

## 開放設計問題

1. **AuditWriter 介面確切形狀未定案**。架構文件僅列出方法簽章草案 `recordAccess(event)` / `processOutboxRetry()` / `queryHistory(scope, filters)`，事件物件（`AuditAccessEvent`）之 TypeScript 型別（欄位名稱、必填/選填、`targetType` 判別聯集寫法）尚未定案。**本 worktree 建議把此型別定義視為與 migration 同等優先的交付物**，因為 worktree-guide 明列 F005/F007/F012/F020/F034/F037/F038 皆會呼叫本介面——介面一旦晚定或事後改動，將牽動多個平行 worktree 的整合成本。建議儘早（甚至先於完整實作）把介面型別定稿並提早合併回 `main`。

2. **AUDIT_IMMUTABLE 之觸發點：介面/API 從何而來？** F024 spec 未定義任何 PATCH/DELETE 路由（純唯讀查詢＋匯出）。F023 AC5「任一角色經介面/API 修改或刪除稽核…拒絕（403/405）」缺乏對應的實際端點可觸發驗證。三種可能路線，需 architect/product owner 擇一定案：
   - (a) 不建立對應路由，AC5 純粹以 DB 層 `REVOKE UPDATE/DELETE` 為權威防線（僅 TS-013 可驗），「介面/API」字面是敘述性語言而非實際端點需求；
   - (b) 刻意建立顯式「陷阱路由」（如 `PATCH`/`DELETE /admin/access-history/:id`）不做任何業務用途，僅用來把預設 404 轉換成語意明確的 `AUDIT_IMMUTABLE`（403/405），滿足 AC 逐字驗收，並補一組控制器層 403/405 契約測試；
   - (c) `AuditStore` 介面本身完全不暴露 update/delete 方法（結構性防禦），`AUDIT_IMMUTABLE` 錯誤碼僅存在於文件定義，實際上不會被任何執行路徑丟出，AC5 改以程式碼審查/型別檢查驗收而非執行期測試。
   本測試設計目前僅能覆蓋 (a)+(c) 的骨架（TS-012/013）；若定案 (b)，tdd-developer 需另補路由層測試。

3. **`AUDIT_LOG_OUTBOX` 表結構/生命週期未定**。該表被 data-model.md 明確標註「內部暫存表，非對外實體」而未列 schema（狀態欄位是否為 `pending`/`done`？有無重試次數上限？超過門檻是否轉死信佇列？）。TS-009~011 的驗證方式（移除 vs 標記完成、以 id 為冪等鍵）依架構 §5.5/5.6 文字推論撰寫；tdd-developer 實作時若 store 方法簽章不同，需調整假物件形狀（不影響驗收語意本身）。

4. **短時間重複調閱之資安面速率限制**：OQ-E07-01 定案「不節流不去重」是就「稽核記錄本身該不該去重」而言，未觸及是否需要防止惡意大量調閱造成 Outbox/DB 灌爆的資安控制（如同帳號每分鐘寫入次數上限）。本測試設計未涵蓋此面向，建議列為上線前 security review 項目，非本輪 blocking。

5. **targetType 條件必填欄位之驗證錯誤碼未定**。data-model 明定 `documentId`/`lifecycleId` 依 `targetType` 二擇一為條件必填，但 `error-handling.md` 未列出對應錯誤碼。TS-005 暫以 `AUDIT_TARGET_FIELD_REQUIRED`（暫定名）佔位，需 architect 於 error-handling.md 補上精確碼值後 tdd-developer 才能斷言確切字串（避免各 worktree 各自臆造碼值造成日後不一致）。

6. **`AuditStore.queryHistory()` 之低階契約 vs F024 業務篩選邏輯之分工**：架構將 `queryHistory(scope, filters)` 列為 `AuditModule` 之關鍵函式，但實際篩選/分頁/排序邏輯應落在哪一層（`AuditStore` 純資料存取 vs `AuditWriter`/`AuditService` 業務邏輯層）未定。本測試設計刻意將「基礎查詢契約」留給 F023（僅需確認 store 能依 filters 回傳資料），完整篩選矩陣（類型切換、互斥條件等）測試落在 `F024-test.md`，兩檔案的分工假設需與 tdd-developer 確認一致，避免重複或遺漏。
