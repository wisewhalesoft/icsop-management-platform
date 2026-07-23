---
type: test-design-feature
feature_id: F013
feature_name: 文件編號唯一性管理
priority: P0-MVP
related_spec: docs/specs/features/F013-document-number-uniqueness.md
last_updated: 2026-07-23
status: draft
---

# F013 — 文件編號唯一性管理 · Test Design
> source: docs/specs/features/F013-document-number-uniqueness.md · worktree: doc-edit · 2026-07-22

## 範圍聲明（列已被現有 *.spec 覆蓋、不重設之基線）

`feature-status.md` 標記 F013 為 🟡 部分：「建立/狀態切換路徑可達且測試；編輯側排除自身**不可達**（依賴未建之 F011）；併發衝突 DB 會丟 `QueryFailedError` 未捕捉映射 → 恐回 500 而非 409」。已覆蓋、不重新設計：

- `backend/src/documents/document-rules.spec.ts`：`isNumberAvailable` 純函式已完整覆蓋——與有效/作廢文件重複不可用、僅被失效文件占用可用、全新編號可用、**selfId 排除自身**（含「改為他筆有效已用仍衝突」之對照案例）。此為 F013 核心判定邏輯之權威測試，本檔不重複。
- `backend/src/documents/documents.service.spec.ts`：`create()` 之編號重複阻擋、僅被失效占用允許建立；`setStatus()` 切回「有效」時之重驗（他筆有效重用阻擋、未被占用成功）。
- `backend/src/database/migrations/1721865600000-icsop-document.ts`：filtered unique index（`WHERE status IN('active','void')`）已於 migration 撰寫（未執行，依專案「migration 寫但勿執行」慣例），DB 層防線之**結構**已到位，缺口在**應用層對其失敗的攔截與映射**。

本檔聚焦缺口：(1) 併發下 DB 唯一鍵違反時，`DocumentsService` 是否/如何攔截並映射為 409（目前 `create()`／`setStatus()` 完全沒有 `try/catch`，任何底層唯一鍵違反會直接以未映射之 5xx 洩漏至呼叫端）；(2) 編輯側（`update()`）之 `isNumberAvailable(selfId)` 端到端串接——此部分之**具體場景**已在 **F011-test.md**（TS-F011-011～015）設計，因其本質是「`update()` 方法是否存在並正確呼叫既有規則」而非唯一性判定邏輯本身，故本檔僅交叉引用、不重複列出，改聚焦 F013 專屬的「DB 錯誤映射」角度。

## 測試策略（unit＝假 store；需真 DB＝[integration] 序列化暫不自動化）

- **unit**：以 `FakeStore.create`／`FakeStore.update` 模擬拋出**形似**驅動層唯一鍵違反之錯誤物件（結構待定，見 OQ-F013-01），驗證 `DocumentsService` 之攔截與映射邏輯（不需真實 DB 即可驗證「捕捉到形似的錯誤時是否正確轉譯」）。
- **[integration]**：真實 MSSQL 下，兩個並行 transaction 實際觸發 filtered unique index 違反，驗證（a）確實僅一筆成功、(b) 底層拋出之錯誤物件其真實 shape 與 driver-specific 代碼是否與 unit 測試所假設之判斷式相符（此為 unit mock 與真實行為之間的信任落差，唯有 [integration] 能證實兩者一致）。序列化執行、暫不自動化，供 tdd-developer 之整合測試骨架參考。

## Test Scenarios

### DB 唯一鍵違反之攔截與映射（建立側，`create()`）

#### TS-F013-001 `store.create` 拋出唯一鍵違反錯誤 → service 攔截並映射為 409 [unit]
- Given：`FakeStore.create` 模擬拋出一個具備 mssql 唯一鍵違反特徵之錯誤物件（暫以 `{ name: 'QueryFailedError', driverError: { number: 2601 } }` 表示，精確 shape 待 OQ-F013-01 定案）
- When：`svc.create('ICSOPAdmin', { ...合法必填 })`（此時應用層之預先查詢 `findNumberHolders` 恰好因競態未偵測到衝突，故放行至 `store.create`，但底層 DB 已被另一交易搶先寫入而觸發唯一鍵違反）
- Then：`svc.create` 攔截該錯誤並拋出 409 `ConflictException('DOCUMENT_NUMBER_DUPLICATE')`，**不**將原始 DB 錯誤訊息/堆疊洩漏至呼叫端回應
- 對應 AC / 錯誤碼：error-handling.md「並發下以 DB 唯一性保護 + 應用層驗證雙保險，僅一筆成功、另一筆回 `DOCUMENT_NUMBER_DUPLICATE`」

### DB 唯一鍵違反之攔截與映射（編輯側，`update()`，依賴 F011）

#### TS-F013-002 `store.update` 拋出唯一鍵違反錯誤 → service 攔截並映射為 409 [unit]
- Given：同 TS-001 之錯誤模擬，改由 `FakeStore.update` 拋出
- When：`svc.update('ICSOPAdmin', 'd1', { documentNumber: 'N-競態' })`（`DocumentsService.update` 由 F011 引入）
- Then：同 TS-001 之映射行為
- 對應 AC / 錯誤碼：同上；此案例之完整前後文（含正常路徑之 given/when）見 **F011-test.md TS-F011-015**，本檔僅聚焦「錯誤映射」本身，避免與 F011 檔重複設計整個 update 流程

### 錯誤映射之精確度（避免過度寬鬆）

#### TS-F013-003 非唯一鍵相關之其他 DB 錯誤 → 不得被誤判為 DOCUMENT_NUMBER_DUPLICATE [unit]
- Given：`FakeStore.create` 拋出一個**不具**唯一鍵違反特徵之錯誤（例如連線逾時、或 `QueryFailedError` 但 `driverError.number` 為其他值如外鍵違反 547）
- When：`svc.create('ICSOPAdmin', { ...合法必填 })`
- Then：**不得**被映射為 409 `DOCUMENT_NUMBER_DUPLICATE`；應以原始錯誤或未映射之 5xx 形式向外拋出（讓上層錯誤處理機制接手，避免使用者收到誤導性的「編號重複」訊息）
- 對應 AC / 錯誤碼：邊界（Boundary）——防止「捕捉任何 `QueryFailedError` 即映射 409」之過度寬鬆實作，此為本檔最重要之負向案例，直接對應 OQ-F013-01 的判斷精確度要求

#### TS-F013-004 應用層預先查詢與 DB 層唯一鍵違反同時存在時，何者優先觸發不影響最終結果 [unit]
- Given：`store.findNumberHolders` 已回傳會導致 `isNumberAvailable=false` 之 holders（應用層預查即偵測到衝突）
- When：`svc.create('ICSOPAdmin', { ...documentNumber 已被佔用 })`
- Then：於呼叫 `store.create` **之前**即被應用層攔截，回 409（既有 `documents.service.spec.ts` 已覆蓋此路徑，此處僅確認：兩層防線中，應用層預查為第一道、DB 唯一鍵違反映射為補漏的第二道，兩者不衝突、不重複觸發）
- 對應 AC / 錯誤碼：error-handling.md「應用層驗證雙保險」——確認雙保險之分工介面，非重新設計預查邏輯本身

### 真實併發（DB 層）

#### TS-F013-005 [integration] 兩個真實並行 transaction 以相同新編號建立 → 僅一筆成功
- Given：真實 MSSQL、filtered unique index 已建立（`UQ_ICSOP_DOCUMENT_number_active_void`）、兩個並行請求使用相同 `documentNumber`
- When：幾乎同時送出兩筆建立請求
- Then：恰一筆成功（201），另一筆回 409 `DOCUMENT_NUMBER_DUPLICATE`；DB 中最終僅有一筆該編號之 active/void 記錄
- 對應 AC / 錯誤碼：F013 AC「兩人同時以相同新編號建立…僅一筆成功，另一筆回衝突」；需真實 DB，非 unit 可覆蓋

#### TS-F013-006 [integration] 一筆建立、一筆將既有失效文件編號切回有效，兩者造成同編號衝突 → 僅一筆成功
- Given：真實 MSSQL；文件 X 原編號 `N-1` 狀態為 `inactive`（已釋出）；另一使用者以 `N-1` 建立新文件 Y；幾乎同時，第三個請求嘗試把 X 切回 `active`
- When：Y 的建立與 X 的狀態切換近乎同時提交
- Then：兩者中僅有一方能成功佔用 `N-1`（active/void），另一方回 409；不存在兩筆同時為 active/void 且編號相同之記錄
- 對應 AC / 錯誤碼：F013 Edge Cases「文件由『失效』切回『有效』，但其原編號已被他筆文件重用」之真實併發版本；需真實 DB

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| error-handling.md「應用層驗證雙保險…並發下…僅一筆成功、回 `DOCUMENT_NUMBER_DUPLICATE`」 | DB 層唯一鍵違反之攔截與映射（建立側） | TS-001, TS-004 |
| 同上（編輯側，F011 引入） | DB 層唯一鍵違反之攔截與映射（編輯側） | TS-002（交叉引用 F011-test.md TS-F011-015） |
| Boundary（gap-derived，非原 spec AC 條文，源自 feature-status.md「恐回 500」之風險敘述） | 避免過度寬鬆之錯誤映射 | TS-003 |
| F013 AC「兩人同時以相同新編號建立…僅一筆成功」 | 真實併發（建立） | TS-005 |
| F013 Edge Cases「失效切回有效造成重用衝突」 | 真實併發（狀態切換 vs 建立） | TS-006 |
| 已覆蓋（範圍聲明列出，不重寫） | `isNumberAvailable` 純函式全部案例、`create()`/`setStatus()` 之應用層預查路徑 | `document-rules.spec.ts`、`documents.service.spec.ts` |

## 開放設計問題（阻擋實作前需定案）

- **OQ-F013-01（阻擋，重要）：驅動層唯一鍵違反錯誤之精確判斷方式未定案。** TypeORM 的 `QueryFailedError` 是一個泛用外殼，實際欲區分「唯一鍵違反」與「其他 DB 錯誤」（如外鍵違反、逾時、死結）需檢查 **driver-specific** 的錯誤代碼（mssql 驅動 `tedious`／`mssql` 套件之唯一鍵/唯一索引違反通常對應 `number` 屬性 `2601`（duplicate key row）或 `2627`（violation of unique constraint)，但本專案尚未有任何既有程式碼示範此判斷式（`grep QueryFailedError` 於全 backend 無任何結果）。此判斷式若寫得**過寬**（例如僅檢查 `error instanceof QueryFailedError` 而不細看 `driverError.number`），會如 TS-F013-003 所警示，把外鍵違反、型別轉換錯誤等**不相關**的 DB 錯誤也誤判為「編號重複」，對使用者顯示錯誤訊息；若寫得**過窄**（例如只認自訂的錯誤訊息字串比對），則在 mssql 驅動版本升級或訊息格式微調後可能靜默失效、退化回洩漏 500。需 architect 或 tdd-developer 於實作前查證所用 mssql driver（`mssql` npm 套件／`tedious`）之實際錯誤物件 shape 並定案判斷式，本檔 TS-001/002/003 之 given 條件（`{ name: 'QueryFailedError', driverError: { number: 2601 } }`）僅為測試設計之**假設佔位**，非最終定案介面。

- **OQ-F013-02（非阻擋，銜接提醒）**：本檔 TS-F013-002 依賴 F011 之 `DocumentsService.update()` 方法存在（見 F011-test.md）。若 F011 與 F013 由不同開發時序推進，TS-002 應待 F011 之 `update()` 落地後才能實際撰寫測試代碼；設計文件層級不受影響（本場景之 given/when/then 已可預先撰寫），但標註此依賴順序供 tdd-developer 排程參考。
