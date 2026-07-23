---
type: test-design-feature
feature_id: F012
feature_name: 文件狀態切換
priority: P0-MVP
related_spec: docs/specs/features/F012-document-status-toggle.md
last_updated: 2026-07-23
status: draft
---

# F012 — 文件狀態切換 · Test Design
> source: docs/specs/features/F012-document-status-toggle.md · worktree: doc-edit · 2026-07-22

## 範圍聲明（列已被現有 *.spec 覆蓋、不重設之基線）

`feature-status.md` 標記 F012 為 🟡 部分：「切換＋切回有效重驗編號已測；OQ-E04-02『切換原因』欄未做；變更歷程 F037 事件＋操作者稽核未做」。下列已由既有測試覆蓋，本檔不重新設計：

- `backend/src/documents/documents.service.spec.ts`（`describe('setStatus（F012）')`）：有效→失效更新狀態成功、非法狀態值 400、目標不存在 404、切回「有效」但編號已被他筆有效重用 → 409（F013 重驗）、切回「有效」且未被占用 → 成功。
- `backend/src/documents/document-status.spec.ts`：`DOCUMENT_STATUSES`／`STATUS_LABEL`／`isValidStatus`／`statusOccupiesNumber` 純函式。
- `backend/src/documents/display-status.spec.ts`：`deriveDisplayStatus` 之全部邊界（失效/作廢照原樣、有效＋公告日期已過/當日/未到/未填）。
- `frontend/src/pages/DocumentListPage.test.tsx`：ICSOPAdmin 可見狀態下拉並觸發 `setDocumentStatus`；Supervisor 唯讀不可見下拉。

本檔聚焦缺口：(1) OQ-E04-02「切換原因」選填欄位之貫穿（controller body → service 簽章 → 任何可觀測之記錄動作）；(2) AC「記錄操作者、前後狀態與時間**供 F024 查詢**」之落地機制（目前完全未串接，屬阻擋性開放問題，見下）。**不**重新設計：連續快速切換以最後一次為準（現有 `updateStatus` 為單次覆寫式呼叫，無競態邏輯需額外測試，既有語意已隱含滿足）、`PERMISSION_DENIED`（非 ICSOPAdmin 呼叫）之通用 RBAC 閘門機制（`role-permission.guard.spec.ts` 已涵蓋守門機制本身；本 wave 未新增/更動 `setStatus` 路由，不重複設計）。

## 測試策略（unit＝假 store；需真 DB＝[integration] 序列化暫不自動化）

- **unit**：延伸既有 `FakeStore`／`svc.setStatus` 簽章，新增可選之 `reason?: string` 參數；`FakeStore` 記錄呼叫參數供斷言。controller 層驗證 body 解構含 `reason`（目前 `documents.controller.ts` 之 `setStatus` 僅解構 `body.status`，需擴充解構 `body.reason`）。
- 變更事件記錄動作（AC「供 F024 查詢」）之精確落地機制**未定案**（見 OQ-F012-01），本檔僅能設計「seam 層級」之骨架案例（驗證某個抽象記錄埠被以正確參數呼叫），標記為 **[unit-seam，待 OQ 定案後才可轉為具體斷言]**；真正貫穿至可被 F024 查詢之整合案例標記 **[integration，blocked-by-OQ-F012-01]**，本輪不可執行、僅列出定案後之骨架供後續銜接。
- **[integration]**：無（本檔缺口皆為應用層邏輯，不涉及真實 DB 專屬行為；唯一潛在 [integration] 為 OQ-F012-01 定案後之變更歷程落地驗證）。

## Test Scenarios

### 切換原因（OQ-E04-02，選填）

#### TS-F012-001 切換狀態並填寫切換原因 → 原因隨呼叫傳遞 [unit]
- Given：ICSOPAdmin、文件 `id=d1, status='active'`
- When：`svc.setStatus('d1', 'inactive', '內容已過時')`
- Then：`store.updateStatus` 被呼叫（狀態更新為 `inactive`）；`reason` 參數以 `'內容已過時'` 被服務層接收並可供後續記錄動作使用（見 OQ-F012-01；本場景僅驗證參數正確傳遞，不驗證持久化）
- 對應 AC / 錯誤碼：F012 AC「填寫切換原因…原因隨該次狀態變更事件一併記錄」（部分達成，記錄落地待 OQ 定案）

#### TS-F012-002 切換狀態未填切換原因 → 切換仍成功 [unit]
- Given：同上
- When：`svc.setStatus('d1', 'inactive')`（不傳 `reason`，或傳 `undefined`）
- Then：切換成功，不因缺少選填欄位而阻擋
- 對應 AC / 錯誤碼：F012 AC「未填『切換原因』（非必填）…切換仍成功」

#### TS-F012-003 切換原因為空字串 → 視同未填 [unit]
- Given：同上
- When：`svc.setStatus('d1', 'inactive', '')`（或前端 trim 後為空字串）
- Then：切換成功，不視為「已填寫原因」（不應被記錄為一個空字串原因，語意上等同未填）
- 對應 AC / 錯誤碼：邊界（Boundary），既有「非必填」精神延伸

#### TS-F012-004 切換原因僅含空白字元 → 視同未填 [unit]
- Given：`reason='   '`
- When：`svc.setStatus('d1', 'inactive', '   ')`
- Then：trim 後為空 → 視同未填（與 TS-003 相同結論，驗證 trim 行為而非單純空字串）
- 對應 AC / 錯誤碼：邊界（Boundary）

#### TS-F012-005 狀態未實際變更（送出與現值相同之狀態）時是否仍接受 `reason` [unit]
- Given：文件 `status='active'`
- When：`svc.setStatus('d1', 'active', '測試原因')`
- Then：**未定案**——prototype（`15-document-edit.html` `paintStatus()`）僅於 `draft.status!==current.status` 時才顯示切換原因輸入框，暗示「原因」僅在**實際變更**時有意義；若呼叫端傳入「狀態未變 + 原因」是否應忽略原因、或視為一般更新皆接受，屬於待確認之邊界，本場景標記為**待 OQ 補充**（非阻擋，建議後續於 spec 補一句澄清）
- 對應 AC / 錯誤碼：Edge Cases 延伸（推論，非原 AC 逐字）

### Controller 層貫穿

#### TS-F012-006 `PATCH :id/status` body 含 `reason` → controller 正確解構並傳遞至 service [unit]
- Given：請求 body `{ status: 'inactive', reason: '依法規更新' }`
- When：呼叫 controller `setStatus` handler
- Then：`svc.setStatus` 被以 `(id, 'inactive', '依法規更新')` 呼叫（目前 `documents.controller.ts` 僅解構 `body.status`，此為需擴充之缺口）
- 對應 AC / 錯誤碼：OQ-E04-02 貫穿

#### TS-F012-007 `PATCH :id/status` body 未含 `reason` 鍵 → controller 傳遞 `undefined` 而非拋錯 [unit]
- Given：請求 body `{ status: 'inactive' }`（無 `reason` 鍵）
- When：呼叫 controller handler
- Then：正常呼叫 `svc.setStatus(id, 'inactive', undefined)`，不因缺少選填欄位報錯
- 對應 AC / 錯誤碼：F012 AC「未填『切換原因』…切換仍成功」（controller 層對應）

### 變更歷程記錄（AC：供 F024 查詢）—— 依 OQ-F012-01 定案前僅能設計骨架

#### TS-F012-008（骨架，unit-seam） 狀態切換成功後觸發一個可觀測之記錄動作 [unit-seam，待 OQ-F012-01 定案]
- Given：注入一個記錄埠（介面形狀待定，暫以 `ChangeEventRecorder.record(event)` 表示，非最終定案介面）
- When：`svc.setStatus('d1', 'inactive', '依法規更新')` 成功
- Then：該記錄埠被呼叫一次，攜帶至少 `{ documentId: 'd1', actorId, beforeStatus: 'active', afterStatus: 'inactive', reason: '依法規更新', occurredAt }`
- 對應 AC / 錯誤碼：F012 AC「記錄操作者、前後狀態與時間供 F024 查詢」（**僅驗證 seam 存在，不驗證真正落地與可查詢性**，見 OQ-F012-01）

#### TS-F012-009（整合骨架，blocked-by-OQ-F012-01） 切換後可經 F024 查得該次事件 [integration，本輪不可執行]
- Given：OQ-F012-01 定案後之真實落地機制（`DOCUMENT_CHANGE_LOG` 或等效表）
- When：切換狀態成功後，以 F024 之查詢介面（`AuditWriter.queryHistory` 或等效）查詢該文件
- Then：可查得一筆包含操作者／前後狀態／原因／時間之紀錄
- 對應 AC / 錯誤碼：F012 AC「供 F024 查詢」——**本場景本輪不可設計出可執行之具體斷言，僅列出定案後之骨架供後續 worktree 承接**

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC（OQ-E04-02）「填寫切換原因…隨事件記錄」 | 原因隨呼叫傳遞（記錄落地見 OQ-F012-01） | TS-001, TS-006 |
| AC（OQ-E04-02）「未填切換原因…切換仍成功」 | 選填不阻擋 | TS-002, TS-007 |
| Boundary | 空字串／純空白視同未填 | TS-003, TS-004 |
| Edge（推論，非原 AC 逐字） | 狀態未變 + 原因之邊界 | TS-005（待補充） |
| AC「記錄操作者、前後狀態與時間供 F024 查詢」 | 變更歷程記錄與可查詢性 | TS-008（seam-only）, TS-009（blocked） |
| 已覆蓋（範圍聲明列出，不重寫） | 切換成功／非法狀態/404/切回有效重驗/RBAC 閘門機制 | `documents.service.spec.ts`、`role-permission.guard.spec.ts` |

## 開放設計問題（阻擋實作前需定案）

- **OQ-F012-01（阻擋，重要，本檔為主定義處，F011-test.md OQ-F011-04 交叉引用）：F012 AC「記錄操作者、前後狀態與時間供 F024 查詢」之落地機制未定案，現有基礎設施無法滿足。**
  - 證據：`backend/src/audit/audit.types.ts`（F023 audit worktree 已鎖定之 D 契約）之 `AuditAccessEvent` 聯集型別，其 `targetType` 僅有 `DOCUMENT | USAGE_FORM | LIFECYCLE | DOCUMENT_CHANGE_LOG | LIFECYCLE_CHANGE_LOG`，`actionType` 僅有 `VIEW | DOWNLOAD | PRINT | LIFECYCLE_VIEW | LIFECYCLE_DOWNLOAD | LIFECYCLE_PRINT | CHANGE_LOG_VIEW | LIFECYCLE_CHANGELOG_VIEW | LIFECYCLE_CHANGELOG_DOWNLOAD`。這些**全部是「調閱」語意**（某人查看/下載/列印了某個既有物件），**沒有任何值表達「異動本身」**（誰在何時把狀態從 A 改成 B、原因是什麼）。即使把 F012 的狀態切換硬塞進 `targetType='DOCUMENT_CHANGE_LOG', actionType='CHANGE_LOG_VIEW'`，語意也是錯的（`CHANGE_LOG_VIEW` 表示「有人檢視了變更歷程頁」，不是「發生了一次變更」）。
  - 真正該承接此需求之實體是 `DOCUMENT_CHANGE_LOG`（F037「程序書變更歷程」之權威資料表），但 F037 於 `feature-status.md` 明確標記為 ⬜ 未開始，且**不在本 worktree 指派範圍**（`git-worktree-guide.md` 僅列 F011/F012/F013/F015/F017）。`feature-status.md` F012 列亦直接寫明：「變更歷程 F037 事件＋操作者稽核未做」。
  - **決策未定之三條候選路徑**（需 architect 或 product 定案，非本檔可自行擇一）：
    1. **本 wave 新增一個輕量、獨立於 F037 完整實體之最小記錄機制**（例如簡化版 `DocumentChangeEvent` 表，僅供本 wave 自我驗收），待 F037 到位後再遷移/整併——優點：AC 可被驗收；缺點：可能與 F037 日後正式 schema 衝突，產生技術債與遷移成本。
    2. **本 wave 明確不實作記錄動作**，AC「供 F024 查詢」標記為已知缺口、待 F037 worktree 完成後補上——優點：不產生日後需遷移的技術債；缺點：F012 AC 本輪無法完整驗收，狀態切換之「誰改的、為什麼改」暫時無從追溯。
    3. **誤用現有 `AuditWriter.recordAccess`**，把狀態切換硬塞進 `AuditAccessEvent` 既有的某個 targetType/actionType 組合——**不建議**：會污染 F024「調閱歷程」查詢語意（把「異動」和「調閱」混在同一份資料，且既有型別沒有 `beforeStatus`/`afterStatus`/`reason` 欄位可承載，會被迫塞進不相關欄位如 `watermarkSnapshot`）。
  - 品質風險：若未定案即實作，最可能發生的是 tdd-developer 選擇路徑 3（因為 `AuditWriter` 已經存在、注入方便），但這會產生語意錯誤且日後難以退場的資料汙染；或完全略過（路徑 2 的隱性版本，未經確認即默默不做），導致 AC 被誤判為「已完成」但實際不可查詢。**本檔明確建議：若必須在本 wave 交付，選路徑 1 並以最小 schema 因應；否則採路徑 2 並在 impl log 中明確記載此缺口，不得誤用路徑 3。**

- **OQ-F012-02（非阻擋）**：「切換原因」欄位之字數上限未定義（spec 僅寫「自由文字」）。prototype 之 `<input>` 未設 `maxlength`。建議 spec 補一句上限值（或明訂「無上限」），本檔暫不設計超長字串邊界案例。

- **OQ-F012-03（非阻擋，UI 慣例澄清）**：`prototypes/15-document-edit.html` 對切換至「作廢」有二次確認 modal（`openConfirm`），但 F012 spec 之 AC 與 Main Flow 皆未要求任何確認步驟（「無需簽核或多層核准」「單步驟即時生效」）。此二次確認應理解為**前端防呆 UX 慣例**（非 spec 要求之業務規則），故本檔未將其列為測試場景；若日後要正式要求，需先於 spec 補入 AC。
