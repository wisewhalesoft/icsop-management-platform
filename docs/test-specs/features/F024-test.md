# F024 — 文件調閱歷程查詢後台 · Test Design
> source: docs/specs/features/F024-access-history-query.md · worktree: audit · 2026-07-22
> **2026-08-18 新增「匯出鈕失效之修復 delta」**（`AC-F1`～`AC-F19`）：見 [§匯出鈕失效之修復
> delta](#export-fix-delta)。舊有 TS-001～TS-018（查詢邏輯，不受本 delta 影響）維持不動。

## 測試策略

- **unit 用假 store**：`FakeAuditStore`（實作與 F023 相同之讀取介面）預先塞入模擬 `AUDIT_LOG` 列（涵蓋 `DOCUMENT`/`USAGE_FORM`/`LIFECYCLE`/`DOCUMENT_CHANGE_LOG`/`LIFECYCLE_CHANGE_LOG` 五種 `targetType`），驗證 service 層之篩選/排序/分頁/角色範圍邏輯，不連真實 DB。
- **RBAC 403 → unit，比照 `org-sync.controller.spec.ts` 之雙層測法**：(1) 純 `RolePermissionGuard` + `FUNCTION_MATRIX[DOCUMENT_ACCESS_HISTORY]` 之 `canPerform()` 判定（table-driven `it.each`）；(2) 路由 metadata 契約測試（`@RequirePermission` 是否確實掛在查詢/匯出路由上）。
- **效能（P95<2s）與 3 年保留下之查詢正確性 → [integration]**：需真實 MSSQL＋索引＋大量資料，非 unit 假 store 可驗證，量測本身需 k6/JMeter（非本測試設計自動化範圍，於此僅標記需求與驗收條件）。
- **匯出檔案序列化（CSV/Excel 實際位元組內容）暫不自動化**：僅驗證「匯出動作呼叫之資料來源與角色守門」，不驗證檔案格式本身之位元組正確性（草案格式未定案，見開放問題#3）。
- **重要範圍限制**：本 worktree 內 F024 之查詢邏輯測試全數對 `FakeAuditStore` 之模擬資料進行，不依賴同 worktree 內 F023 的實際寫入實作（兩者依 data-model 定義之欄位形狀解耦），風險可控（見開放問題#4）。

## Test Scenarios

### TS-F024-001 以文件編號查詢 → 回傳該文件所有調閱紀錄，時間新到舊 [unit]
- **Given** `FakeAuditStore` 內有同一文件之 3 筆紀錄（VIEW/DOWNLOAD/PRINT，時間交錯）與其他文件之紀錄
- **When** 以 `documentNumber` 查詢
- **Then** 僅回傳該文件之 3 筆，且依 `occurredAt` 新到舊排序
- 對應 AC1

### TS-F024-002 時間區間 + 人員組合查詢 → AND 條件同時滿足 [unit]
- **Given** 多筆不同人員/時間之紀錄
- **When** 同時帶 `person`（姓名或員工編號）與 `from`/`to` 時間區間查詢
- **Then** 僅回傳同時滿足兩條件之結果（人員符合**且**時間落在區間內），非任一條件符合即回傳
- 對應 AC2

### TS-F024-003 角色矩陣放行：SysAdmin／ICSOPAdmin → 200 放行 [unit, table-driven]
- **Given** `RolePermissionGuard` + 真實 `FUNCTION_MATRIX`
- **When** `roleCode` 分別為 `SysAdmin`／`ICSOPAdmin` 呼叫查詢端點（`read` 動作）
- **Then** `canActivate()` 回傳 `true`（矩陣值 `READ` 允許 `read`）
- 對應 F024 Preconditions；F025 矩陣（`文件調閱歷程查詢` 列＝`READ`/`READ`/`NONE`/`NONE`/`NONE`）

### TS-F024-004 角色矩陣拒絕：Supervisor／DeptContact／User → 403 PERMISSION_DENIED [unit, table-driven]
- **Given** 同上
- **When** `roleCode` 分別為 `Supervisor`／`DeptContact`／`User` 呼叫查詢端點
- **Then** 拋出 `ForbiddenException`，訊息含 `PERMISSION_DENIED`
- 對應 AC3、AC4（主管、部門窗口、一般使用者皆無查詢權）

### TS-F024-005 路由/RBAC metadata 契約 [unit]
- **Given** 控制器類別（`AccessHistoryController` 或等義命名）
- **When** 以 `Reflect.getMetadata` 檢視查詢路由與匯出路由之 `PATH_METADATA`/`METHOD_METADATA`，及 `@RequirePermission` 裝飾之 `FunctionKey.DOCUMENT_ACCESS_HISTORY`/`'read'`
- **Then** 兩條路由皆正確掛載對應 metadata（比照 `org-sync.controller.spec.ts` 之 `recentRuns` 路由契約測法）
- 對應 F024 Main Flow 步驟4「後端強制驗證角色，不信任前端傳入條件」

### TS-F024-006 查詢未輸入任何條件 → 套用近 30 天預設範圍，非阻斷回傳 [unit]
- **Given** 查詢請求所有欄位（類型/人員/對象/時間）皆為空
- **When** 送出查詢
- **Then** 依 prototype 17 之已呈現行為：伺服器套用近 30 天預設時間範圍並正常回傳結果（200），非回 400 阻擋；回應可附帶旗標（如 `appliedDefaultRange: true`）供前端顯示提示
- 對應 AC5、Edge Cases；**本情境之精確契約標記為待確認，見開放問題#1**（error-handling.md 文字與 prototype 實際行為不完全一致）

### TS-F024-007 展開單筆（VIEW/DOWNLOAD/PRINT 類）→ 顯示完整明細含浮水印快照 [unit]
- **Given** 1 筆 `targetType=DOCUMENT`、`actionType=VIEW` 之紀錄，`watermarkSnapshot` 有值
- **When** 展開該筆
- **Then** 回傳明細含操作人員/員工編號/公司/部門/處室/角色/對象/操作類型/操作時間，及 `watermarkSnapshot` 原樣呈現
- 對應 AC6 前半

### TS-F024-008 展開單筆（CHANGE_LOG_VIEW 類，無浮水印）→ 該欄留空 [unit]
- **Given** 1 筆 `targetType=DOCUMENT_CHANGE_LOG`、`actionType=CHANGE_LOG_VIEW` 之紀錄，`watermarkSnapshot` 為 null
- **When** 展開該筆
- **Then** 回傳明細正常呈現其餘欄位，`watermarkSnapshot` 欄位留空（null/未提供），前端不視為錯誤
- 對應 AC6 後半（「無浮水印之動作類型該欄留空」）；**與 data-model 必填規則矛盾，見開放問題#2**

### TS-F024-009 類型篩選＝循環 → 僅回循環相關紀錄，對象欄＝循環 ID/名稱 [unit]
- **Given** 混合 `targetType` 之紀錄集
- **When** `kind=循環` 查詢
- **Then** 僅回傳 `actionType∈{LIFECYCLE_VIEW,LIFECYCLE_DOWNLOAD,LIFECYCLE_PRINT}` 之紀錄，「對象」欄顯示 `lifecycleId`/`lifecycleName`
- 對應 AC7

### TS-F024-010 類型篩選＝變更 → 僅回變更歷程檢視/下載紀錄 [unit]
- **Given** 同上
- **When** `kind=變更` 查詢
- **Then** 僅回傳 `actionType∈{CHANGE_LOG_VIEW,LIFECYCLE_CHANGELOG_VIEW,LIFECYCLE_CHANGELOG_DOWNLOAD}` 之紀錄
- 對應 AC8

### TS-F024-011 類型篩選＝全部（預設）→ 混合三類，對象欄含類型標籤 [unit]
- **Given** 同上，`kind` 未帶（或明確帶「全部」）
- **When** 查詢
- **Then** 回傳文件/循環/變更三類混合結果，逐筆「對象」欄以類型標籤＋對象識別統一呈現（不因欄位缺值而拋錯）
- 對應 AC9

### TS-F024-012 條件互斥：文件編號查詢 + 類型＝循環 → 空結果非錯誤 [unit, boundary]
- **Given** 混合資料集
- **When** 同時帶 `documentNumber` 與 `kind=循環` 查詢（語意互斥：循環類型紀錄無 `documentNumber`）
- **Then** 回傳空陣列（`total=0`），HTTP 200，前端顯示空狀態而非錯誤訊息
- 對應 Edge Cases「以文件編號查詢但類型選循環：無結果（條件互斥），顯示空狀態而非錯誤」

### TS-F024-013 分頁邊界 [unit, boundary]
- **Given** 超過一頁筆數之資料集（依 prototype 每頁 50 筆推斷，見開放問題#5）
- **When** 分別查詢第 1 頁（滿頁）與最後一頁（不足一頁）
- **Then** 第 1 頁筆數＝頁面大小、`hasNext=true`；最後一頁筆數＝餘數、`hasNext=false`；`total` 與實際符合條件筆數一致

### TS-F024-014 非文件類型紀錄之 documentId 為 null → 列表/展開皆容許空值 [unit]
- **Given** `targetType=LIFECYCLE`（`documentId=null`）與 `targetType=DOCUMENT`（`documentId` 有值）混合查詢「全部」
- **When** 查詢/展開
- **Then** 兩類紀錄皆正常呈現，不因 `documentId` 為 null 而拋例外或該列渲染失敗（對應 architecture-spec §8.1 風險#14 之顯式修正）

### TS-F024-015 匯出 → 內容遵循當前查詢條件與角色範圍（非全表） [unit]
- **Given** 已套用篩選條件之查詢結果集
- **When** 呼叫匯出（CSV/Excel）
- **Then** 匯出內容之列數/篩選條件與同一查詢條件之查詢結果一致，不匯出超出目前篩選範圍之資料
- 對應 Alternative Flow（匯出）

### TS-F024-016 匯出角色守門：與查詢端點相同之矩陣，非查詢權角色 → 403 [unit]
- **Given** 同 TS-F024-004 之角色矩陣
- **When** `Supervisor`／`DeptContact`／`User` 呼叫匯出端點
- **Then** 403 `PERMISSION_DENIED`（匯出不得成為繞過查詢頁角色限制的旁路）

### TS-F024-017 / TS-F024-018 [integration] → 已具體化，見 audit-query 畢業設計
> 原 TS-017（NFR-001 索引效能）與 TS-018（≥3 年保留跨年度排序/篩選正確性）之抽象敘述，已由 audit-query
> worktree 具體化為可執行之整合測試，落地於 `backend/test/int/access-history.itest.ts`（TS-017 粗粒度迴歸
> 警戒 + TS-018 跨年度 datetime2 往返），並補上 OQ-AQ-01（`AuditStore` WHERE/ORDER/OFFSET 下推）與
> `IX_AUDIT_LOG_targetType_occurredAt` 索引（migration 1723075200000）。
>
> **權威定義單一來源**：`docs/specs/test-design/audit-query-test-design.md`（§2.3 TS-017、§2.4 TS-018、
> §2.5 TS-AQ-PERF-001）。本處不再維護第二份分歧敘述，避免與畢業設計不一致；本檔上方之 TS-F024-001~016
> unit 案例仍為權威。

## AC → TS 覆蓋對照表

| AC / 來源 | 內容摘要 | 覆蓋 TS |
|---|---|---|
| AC1 | 文件編號查詢 → 新到舊排序 | TS-001 |
| AC2 | 時間區間+人員 AND 條件 | TS-002 |
| AC3 | 主管呼叫 → 403 | TS-004 |
| AC4 | 部門窗口/一般使用者呼叫 → 403 | TS-004 |
| AC5 | 空條件 → 至少一項或近30天預設 | TS-006（並見開放問題#1） |
| AC6 | 展開單筆含浮水印快照，無浮水印留空 | TS-007, TS-008 |
| AC7 | 類型=循環 | TS-009 |
| AC8 | 類型=變更 | TS-010 |
| AC9 | 類型=全部混合 | TS-011 |
| Preconditions（角色查詢權） | SysAdmin/ICSOPAdmin 全公司唯讀 | TS-003 |
| Main Flow步驟4（後端強制驗證） | 路由/RBAC metadata 契約 | TS-005 |
| Edge Case（文件編號+循環互斥） | 空結果非錯誤 | TS-012 |
| Edge Case（非文件類無documentId） | 容許空值 | TS-014 |
| Alternative Flow（匯出） | 匯出遵循查詢條件與角色 | TS-015, TS-016 |
| NFR-001（效能/索引） | P95<2秒 | TS-017 |
| NFR-003（保留≥3年） | 跨年度查詢正確性 | TS-018 |
| 分頁（prototype 呈現） | 分頁邊界 | TS-013 |

## 開放設計問題

1. **空條件行為之精確契約（AC5 vs error-handling.md vs prototype 三方不完全一致，本清單最優先待確認項）**。F024 AC5、`error-handling.md` 皆用「回 `QUERY_CONDITION_REQUIRED` **或**套用近 30 天預設」之「或」語意（讀來像兩選項擇一，暗示可能是硬擋 400 路線）；但 `prototypes/17-access-history.html` 之實際互動是**非阻斷**：空條件時直接套用近 30 天預設並執行查詢，僅以 info toast 附帶顯示 `QUERY_CONDITION_REQUIRED` 字樣作為提示文字（並非真正 400 擋下、要求使用者重新送出）。這直接決定：
   - 回應狀態碼（200 皆帶結果，或 400 需前端重送？）
   - 回應是否需要旗標（如 `appliedDefaultRange: true`）讓前端得知「這是系統套用的預設值」而非使用者自行選了 30 天區間
   本測試設計（TS-006）依 prototype 之非阻斷行為撰寫為主要情境，**建議與 UI/UX Designer 或 Product Owner 核對後定案**，定案後若為阻斷路線需整份改寫該情境（狀態碼、是否要求重新查詢）。

2. **watermarkSnapshot 必填性與 data-model 矛盾**。`data-model.md` 明定 `AUDIT_LOG.watermarkSnapshot` 必填＝是（無條件），但 F024 spec Main Flow 步驟5明文「無浮水印之動作類型則該欄留空」（例如 `CHANGE_LOG_VIEW` 僅為檢視變更歷程列表，無 PDF 燒錄／浮水印概念；經查 `F037-document-change-history.md` 全文亦未提及浮水印）。這是**規格文件之間的直接矛盾**，需 system-architect 修正 `data-model.md` 之必填規則為條件必填（例如：`targetType∈{DOCUMENT,USAGE_FORM,LIFECYCLE}` 之 VIEW/DOWNLOAD/PRINT 系列必填；`DOCUMENT_CHANGE_LOG`/`LIFECYCLE_CHANGE_LOG` 之 `*_VIEW`/`*_DOWNLOAD` 系列則否）。TS-007/008 依 F024 字面（留空允許）撰寫；若日後裁定以 data-model 必填版本為準，兩測試需同步修正，且 F023 之 TS-F023-001/016 亦需重新檢視是否所有 targetType 都必須帶 watermarkSnapshot。

3. **匯出端點/格式未定案**。F024 Alternative Flow 僅寫「格式草案 CSV/Excel」，未定路由路徑、觸發方式（同步下載 vs 非同步產生+輪詢）、欄位順序、大量資料匯出上限（是否套用查詢分頁上限，或允許全量匯出致效能風險）。TS-015/016 依「與查詢端點共用篩選+角色範圍」之最小假設撰寫，具體契約待架構/UI 補充定案。

4. **F024 依賴 F023 尚未實作，本 worktree 內以假資料解耦**。雖然 F024 依賴 F023（同 worktree 內依 /tdd 流程序列開發），但本測試設計之查詢/展開邏輯全數對 `FakeAuditStore` 填入之模擬 `AUDIT_LOG` 列進行，不依賴 F023 服務層之實際實作細節（僅依賴 data-model 定義之欄位形狀）。風險：若 F023 實作階段對欄位形狀做出與 data-model 不同之調整（例如開放問題#2 若改變必填規則），F024 測試需同步更新。

5. **分頁大小/預設頁碼未定案**。prototype 顯示「每頁 50 筆」，spec 文字僅寫「分頁」未列數字。TS-013 之邊界值依 prototype 推斷（50 筆整除/餘數邊界），若後端定案不同頁面大小需同步調整測試數據與斷言。

6. **角色範圍是否恆為「全公司」無例外**。目前 SysAdmin/ICSOPAdmin 之查詢範圍皆為全公司唯讀（矩陣值兩者皆 `READ`，prototype `scopeRecords()` 直接回傳全部、不因角色而過濾），本測試設計未包含任何「部分公司範圍」情境。若日後政策改變（如多公司體系分權查詢），需新增範圍過濾測試；目前依現行 F025 矩陣與 F024 spec「全公司」文字，此非本輪 blocking 項。

7. **`kind`（類型）篩選之精確參數值與 `targetType`/`actionType` 之對應表未見於 spec 逐字定義**，僅能從 F024 spec AC7-AC9 之文字（「循環」「變更」「文件」）與 prototype 之 `RECORDS[].kind` 反推。TS-009~011 依此反推撰寫；建議 architect 或 spec-writer 在 F024 spec 補一張顯式對照表（`kind` 前端顯示值 ↔ `targetType`/`actionType` 集合），降低前後端/測試三方各自臆測之風險。

---

## 匯出鈕失效之修復 delta（`AC-F1`～`AC-F19`；2026-08-18 人類閘門 🟢 APPROVED） {#export-fix-delta}

> source: `docs/specs/features/F024-access-history-query.md#export-fix-delta`（`AC-F1`～`AC-F19`）＋
> `docs/specs/architecture-spec.md` §10.18 決策 `A16-1`～`A16-4`＋`docs/specs/error-handling.md#export`。
> **對實作全盲，逐字取自上述三份文件；未讀取任何 production 原始碼決定斷言**（僅為 wiring 讀取既有
> production 之共用函式簽章／既有 test 檔之接線慣例，見各測試檔標頭之「📌 已查證之既有共用 helper
> 契約」註記）。

### 測試策略

- **端點契約層（AC-F2）**：本輪對 `AccessHistoryController.exportHistory()` 的呼叫簽章訂了一項本環
  契約——末位新增 `@Res({passthrough:false}) res: Response`（比照 `ChangeHistoryController`／
  `AppendicesController` 三處既有 CSV 匯出 handler 之既有慣例）。若實作簽章不同，經 mailbox 申訴後
  由 test-generator 改寫。
- **值層（AC-F5）雙層驗證**：純函式（`access-history-labels.spec.ts`）逐鍵斷言三張對照表；控制器層
  （`access-history.controller.spec.ts`）每軸各挑一列驗證「模組確實被匯出路徑採用」（接線驗證，非
  重複純函式之窮舉）。
- **AC-F1（缺陷本體）刻意不 mock `../api/endpoints`**：以真實 `fetch` stub 驅動 `exportAccessHistory()`
  →`downloadViaBlob()` 之完整鏈路，唯一能證明「成功回饋 ⟺ 下載副作用」而非各自獨立斷言之作法
  （見 `AccessHistoryPage.export.test.tsx` 標頭）。
- **AC-F19 獨立成檔**：因需要 `vi.mock('../api/endpoints')`（hoisted，效力及全模組），與 AC-F1 之
  真實 fetch 策略互斥，故另立 `AccessHistoryPage.export-limit-hint.test.tsx`。
- **AC-F13（真 DB）int 測試補強**：mock 版本（controller.spec）已證明「0 筆仍恰呼叫 recordAccess
  一次」；`access-history.itest.ts` 之 TS-AQ-INT-013／014 以真實 AUDIT_LOG 表複核同一不變式，並補
  TS-AQ-INT-008 之 CSV 版本重寫（原斷言 JSON 形狀）。
- **AC-F17／F18（承接）**：`change-history-export.routes.spec.ts` 原「不外溢」鎖定就地改寫為新行為
  背書，舊斷言保留於 `OLD>` 註解。

### AC → 載體 → 具體 it() 對照表

| AC | 載體檔案 | it() / 描述 |
|---|---|---|
| AC-F1 ① | `AccessHistoryPage.export.test.tsx` | `① 端點回 2xx CSV → 下載副作用發生（createObjectURL 恰一次、<a>.click 恰一次）且顯示成功回饋` |
| AC-F1 ② | 同上 | `🔴 ② 端點回 400（超限）→ createObjectURL 呼叫次數為 0…`（**現況已綠**，見下方「已綠燈條款」） |
| AC-F1 ③ | 同上 | `🔴 ③ fetch 本身 reject（網路層失敗）→ createObjectURL 呼叫次數為 0…`（**現況已綠**） |
| AC-F2 ①②③④ | `access-history.controller.spec.ts` | `describe('AccessHistoryController.exportHistory（AC-F2 端點契約）')` 四條 it |
| AC-F3 ①②③ | `AccessHistoryPage.export.test.tsx` | `describe('...AC-F3：downloadViaBlob 傳輸方式...')`：`匯出流程全程不呼叫 window.open`＋靜態掃描 it |
| AC-F4 | `access-history.controller.spec.ts` | `describe('...AC-F4 表頭')`：`第 1 列逐字為 10 欄表頭…` |
| AC-F5 ①②③④ | `access-history-labels.spec.ts`（純函式逐鍵）＋`access-history.controller.spec.ts`（`describe('...AC-F5 值層...')`，接線驗證） | 見兩檔各自 it 清單 |
| AC-F6 | `access-history.controller.spec.ts` | `describe('...AC-F6 時間戳')` 兩條 it（含 TZ 切換） |
| AC-F7 ① | `access-history.controller.spec.ts` | `describe('...AC-F7 範圍與列序')`：`① 資料列數 = 查詢之 total…` |
| AC-F7 ② | `access-history-filter.spec.ts` | `describe('🔴 AC-F7 ② occurredAt 同秒之決定性次鍵...')` 兩條 it |
| AC-F7 ③④ | `access-history.controller.spec.ts` | `TS-015 export → ...`（單一次呼叫、`pageSize=EXPORT_ROW_LIMIT+1`、filters 委派） |
| AC-F7（真 DB 複核） | `access-history.itest.ts` | `TS-AQ-INT-008`（CSV 版本重寫） |
| AC-F8 ①② | `access-history.controller.spec.ts` | `describe('...AC-F8 筆數上限')`：恰 10000／10001 兩條 it |
| AC-F8 ③ | 同上 | `🔴 AC-F8 ③：原始碼不得再含識別字 EXPORT_MAX…`（靜態掃描）；`change-history-export.routes.spec.ts` 同義複核 |
| AC-F9 ①②③ | `AccessHistoryPage.export.test.tsx`（`describe('...AC-F9 逐字文案...')`＋F1 區塊之「舊文案不得出現」）＋`AccessHistoryPage.test.tsx`（既有測試就地改寫） | 見各檔 |
| AC-F9 ②（{N} 實際筆數） | `csv-export.spec.ts`（`describe('🔴 A16-3...')`）＋`access-history.controller.spec.ts`（`AC-F9 ②：超限之訊息含實際筆數...`） | |
| AC-F10 | `access-history.controller.spec.ts` | `describe('...AC-F10 CSV 注入防護')` 三條 it |
| AC-F11 | `access-history.controller.spec.ts`＋`access-history.itest.ts` | `describe('...AC-F11 空結果')`；`TS-AQ-INT-014` |
| AC-F12 | `access-history.controller.spec.ts` | 既有 `describe('AccessHistoryController（路由與 RBAC 契約）')`（**逐字不變**，機器驗證要求維持綠燈——見下方「編譯連帶效應」提醒） |
| AC-F13 ①②③④ | `access-history.controller.spec.ts`（mock）＋`access-history.itest.ts`（真 DB） | `describe('...AC-F13 匯出動作記稽核')` 全部 it；`TS-AQ-INT-013`／`014` |
| AC-F14 ①② | `access-history.controller.spec.ts` | `describe('...AC-F14 明細專屬欄不匯出')` 兩條 it |
| AC-F15 ①②③ | `access-history.controller.spec.ts` | `describe('...AC-F15 非文件類型與明細欄')` 四條 it |
| AC-F16 | `AccessHistoryPage.export.test.tsx` | `describe('...AC-F16 匯出鈕 in-flight 狀態')`（**現況已綠**） |
| AC-F17／F18 | `change-history-export.routes.spec.ts`（就地改寫）＋`access-history.controller.spec.ts`（TS-015）＋`access-history.itest.ts`（TS-AQ-INT-008）＋`AccessHistoryPage.test.tsx`（既有測試就地改寫） | 見各檔 |
| AC-F19 全部 | `AccessHistoryPage.export-limit-hint.test.tsx` | 全部 7 條 it（含 off-by-one 三值、消失、與 AC-F9② 共存） |

### 已綠燈條款（現況即通過，非人為製造之假紅；見 red-gate-baseline-hygiene 慣例）

三條測試於本環撰寫當下即為綠燈，非漏未撰寫或弱化：

1. **AC-F1 ②③**（`createObjectURL` 呼叫次數為 0）：現行 `exportAccessHistory()` 尚未接上
   `downloadViaBlob`，故 `URL.createObjectURL` 在**任何**分支都不會被呼叫——「0 次」對現況恆真。
   這不代表分支②③已被驗證正確；它們只是**尚未被反例推翻**，待實作接上真實下載鏈後仍會持續為真
   （因為錯誤分支本就不該觸發下載），屬正確的正向規格。真正抓到缺陷的是①（現況 0 次≠期望 1 次）。
2. **AC-F16**（匯出鈕 in-flight disabled/enabled）：現行 `onExport()` 已正確以 loading 狀態包覆
   請求週期，此行為與「回饋文案是否誠實」正交，本 delta 未變更之。

### ⚠ 編譯連帶效應（非測試變紅，屬同檔案 TS 編譯之連帶效應，須向實作方說明）

`access-history.controller.spec.ts` 新增之匯出斷言呼叫 `controller.exportHistory(..., res)`
六個引數，現行方法簽章僅接受 5 個（`TS2554: Expected 0-5 arguments, but got 6`）——這是**預期之
編譯紅燈**（本環對 `@Res()` 簽章之契約性假設）。但因 TypeScript 以「檔案」為編譯單位，此編譯錯誤
會使**同檔案內**既有之 `TS-003`／`TS-004`／`TS-005`／`TS-016`（AC-F12 明訂「逐字不變、須維持
綠燈」之路由/RBAC metadata 測試）**暫時無法被 jest 執行**（非「變紅」，而是整檔案 `Test suite
failed to run`）。實作方補上 `res` 參數、整檔編譯通過後，這些既有測試會恢復可獨立驗證，屆時務必
確認它們仍為綠燈（AC-F12 之機器驗證要求）。

### 宣告層約束——現況無執行期載體（不得自行發明斷言）

- **AC-F13「不阻斷之適用界線」（payload 不合法錯誤不得被同一 catch 吞掉）**：此界線在 F024 之
  黑箱（controller 層）測試中**結構上不可觸發**——`targetId` 恆為固定字面哨兵常數，`recordAccess`
  之 `AUDIT_TARGET_REF_REQUIRED` payload 驗證錯誤在 F024 呼叫端永遠不會發生（該驗證邏輯本身已由
  `audit-writer.service.spec.ts` 之既有 `TS-005` 鎖定，非本 delta 職責）。本檔僅能驗證「Outbox／IO
  暫時性失敗不阻斷」（已覆蓋）；「payload 錯誤不得被同一 catch 吞掉」之區辨，只有讀取
  `AccessHistoryController.exportHistory()` 原始碼才能確認（違反盲測），故不寫入執行期斷言。

---

# 🔴🔴 2026-08-20 D9 缺失／變更 delta 測試設計

> 本段由 **test-generator（backend／jest 線）** 於 2026-08-20 追加，涵蓋 `AC-N53`～`AC-N55`／
> `AC-N69`／`AC-N70`（`AC-N80`／`AC-N81` 為前端 DOM 契約，不在本段範圍）。
> 權威＝`docs/specs/features/F024-access-history-query.md#d9-audit-view-delta`。
> ⚠ **本 delta 不改動 F024 之查詢契約、篩選組成、分頁或 CSV 欄位**——僅補齊「新資料落進既有查詢後
> 怎麼顯示」，以及新增第四種類型篩選值「上傳」。

## AC ↔ 約束對照

| AC | 約束檔案 | 層級 |
|---|---|---|
| `AC-N53` OJT 上傳事件之類型/操作類型標籤（🔴 第二輪就地修訂，`targetType` 改為 `DOCUMENT_ATTACHMENT`） | `backend/src/audit/access-history-labels.spec.ts`（`auditKindLabel('DOCUMENT_ATTACHMENT')`／`actionTypeLabel('ATTACHMENT_UPLOAD')` 案） | unit |
| `AC-N54` 後台燒錄下載列之呈現與前台同形 | 由 `AC-N51` 之稽核落值間接涵蓋（呈現層沿用既有 `auditKindLabel('DOCUMENT')`/`actionTypeLabel('DOWNLOAD')`，無新增邏輯，不重複建約束） | — |
| `AC-N55` 🔒 F024 查詢與匯出之回歸鎖定 | 既有 `AC-F1`～`AC-F19` 全數維持綠燈（本 delta 之新增案不觸及既有斷言） | unit |
| `AC-N69` 🔴 上傳事件必須可排除／篩出（`OQ-D9-29` 核心兌現）＋第四種類型篩選值 | `backend/src/audit/access-history-filter.spec.ts`（`kindToTargetTypes('上傳')` 案＋「AC-N69 上傳事件之排除／篩出」describe，① 排除／② 篩出／③ 全部三案） | unit |
| `AC-N70` 上傳事件於匯出（CSV）與明細之呈現 | `backend/src/audit/access-history.controller.spec.ts`（AC-F5 describe 新增「④ 類型欄：DOCUMENT_ATTACHMENT→上傳」案＋對象欄案） | unit |
| `AC-N80` 浮水印快照欄之 DOM 契約與留空文案 | 🔵 前端，不在本段範圍 | component |
| `AC-N81` 同頁刻意分歧（浮水印簡稱 vs 表格全稱） | 🔵 前端 DOM 呈現層，本段之 backend 半段由 `company-name.spec.ts`（AC-N12／AC-N13）與本檔既有「公司」欄全稱回歸鎖定共同涵蓋 | unit（backend 半段） |

## 型別缺口（如實回報，不臆造）

`AuditKind`（`access-history-filter.ts` 內部型別）與 `AuditTargetType`／`AuditActionType`
（`audit.types.ts`）三者皆需新增列舉字面值（`'上傳'`／`'DOCUMENT_ATTACHMENT'`／
`'ATTACHMENT_UPLOAD'`）——本段測試對這些新字面值之呼叫（如 `kindToTargetTypes('上傳' as never)`）
於本環撰寫時預期為**編譯期型別紅燈**，是「紅在對的原因」之一種，非測試本身有誤。
