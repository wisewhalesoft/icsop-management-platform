---
type: test-design-feature
feature_id: F031
feature_name: 管理端提取結果預覽與重新索引狀態
priority: P1
related_spec: docs/specs/features/F031-admin-index-visibility.md
last_updated: 2026-07-23
status: draft
---

# F031 — 管理端提取結果預覽與重新索引狀態 · Test Design
> source: docs/specs/features/F031-admin-index-visibility.md · worktree: rag (F028-F031) · 2026-07-23

## 測試策略（unit 用 fake `DOCUMENT_CHUNK`/`INDEX_RUN` store＋既有 RBAC 純函式；真實 HTTP/DB/前端渲染路徑分層標示）

### RBAC：直接重用既有 `canPerform()` 純函式與 `RolePermissionGuard`，不重新發明

已查證 `backend/src/rbac/function-matrix.ts` **已定義** `FunctionKey.DOCUMENT_INDEX_MANAGEMENT`（值 `'文件索引管理'`）且矩陣列已完整：`row('READ','CRUD','NONE','NONE','NONE')`（SysAdmin/ICSOPAdmin/Supervisor/DeptContact/User），與 F025 spec 逐字一致。`RolePermissionGuard`（`role-permission.guard.ts`）已是可直接套用之現成守門機制，經 `@RequirePermission(FunctionKey.DOCUMENT_INDEX_MANAGEMENT, 'read'|'write')` 標註即可生效。**本 feature 之 RBAC 測試重點因此不是「矩陣值是否正確」（已由既有 `function-matrix.spec.ts` 覆蓋，非本檔案職責），而是「本 feature 新增的每一個端點是否標註了正確的 `action`」**——查詢類端點（chunk 預覽／單一文件索引狀態／總覽）誤標為 `'write'` 會過度限縮 SysAdmin 唯讀權；手動重新索引端點誤標為 `'read'` 會讓 SysAdmin 越權觸發寫入。此為本 worktree 最容易犯錯之處，逐端點列為獨立測試場景（TS-F031-013～018）。

### 測試替身契約

```
FakeChunkQueryStore {
  listChunksByDocument(documentId): Promise<ChunkPreviewItem[]>   // 沿用 F029 之 DOCUMENT_CHUNK 8 項 metadata + content
}

FakeIndexRunQueryStore {
  getLatestByDocument(documentId): Promise<IndexRunView | null>   // null＝從無 INDEX_RUN
  listSummary(filters): Promise<{ successCount, failedCount, runningCount, items: IndexRunSummaryRow[] }>
}

FakeManualReindexTrigger {
  // 對接 F030 之 onContentRevised(documentId, 'manual') —— 沿用 F030-test.md 之 ReindexTriggerPort，
  // 'manual' 為 triggerType 新增列舉值，本 worktree 內一併驗證介面呼叫，不重新設計 F030 邏輯
  trigger(documentId): Promise<void>
}
```

### 前端測試邊界

沿用既有其他管理頁（`AccessHistoryPage`／`OrgSyncPage`）已確立之「後端 RBAC 為權威、前端另做自我守門封鎖」雙層模式——[unit] 覆蓋前端路由層級的角色守門渲染邏輯（React Testing Library 層級之元件行為，非瀏覽器端對端）；[integration] 保留給「前端呼叫真實 API 端點」之串接測試。

### [integration] 邊界
真實 HTTP 端點（controller＋guard 串接）、真實 DB 查詢（大量 chunk/文件之分頁效能）、前端與後端之真實串接、F030 手動重新索引之真實非同步管線執行結果回寫。

## Test Scenarios

### chunk 預覽 + 8 項 metadata（AC1）

#### TS-F031-001 已成功索引文件之完整 chunk 清單與 metadata [unit]
- Given：文件已有成功索引，`FakeChunkQueryStore` 回傳 3 個 `DOCUMENT_CHUNK`，各自 8 項 metadata 齊全
- When：ICSOPAdmin 查詢該文件之「AI 索引狀態」
- Then：回傳 3 筆 chunk，每筆含 `content` 片段與完整 8 項 metadata（`documentNumber`/`lifecycleId`/`chapterSection`/`usingDeptIds`/`status`/`announcedDate`/`edition`/`pageNumber`）
- 對應 AC / 錯誤碼：AC1

#### TS-F031-002 chunk 清單依 `chunkSeq` 排序呈現 [unit]
- Given：3 個 chunk，`chunkSeq` 分別為 2, 1, 3（store 回傳順序未排序）
- When：查詢
- Then：回應依 `chunkSeq` 遞增排序（1, 2, 3），非依 store 原始回傳順序或建立時間
- 對應 AC / 錯誤碼：AC1（呈現層防呆）

#### TS-F031-003 chunk 內容為衍生資料，不對一般使用者開放 [unit]
- Given：一般使用者角色
- When：嘗試查詢任一文件之 chunk 預覽端點
- Then：403（見 RBAC 段落 TS-F031-019）；chunk 內容本身不透過任何前台端點暴露（介面存在性驗證：前台路由不含此端點）
- 對應 AC / 錯誤碼：Description「chunk 預覽僅供管理員檢視」

### 三態顯示（AC2/AC3）

#### TS-F031-004 索引進行中顯示「進行中」 [unit]
- Given：`FakeIndexRunQueryStore.getLatestByDocument()` 回傳 `status='running'`
- When：查詢索引狀態
- Then：呈現三態之「進行中」，不含成功時間/失敗訊息欄位
- 對應 AC / 錯誤碼：AC2

#### TS-F031-005 索引成功顯示「成功」含最後索引時間 [unit]
- Given：`status='success'`, `endedAt='2026-07-20T10:00:00Z'`
- Then：呈現「成功」，並顯示該 `endedAt` 作為最後索引時間
- 對應 AC / 錯誤碼：AC2

#### TS-F031-006 索引失敗顯示「失敗」含失敗原因摘要 [unit]
- Given：`status='failed'`, `errorMessage='作業流程無可辨識章節結構'`
- Then：呈現「失敗」狀態＋失敗原因摘要
- 對應 AC / 錯誤碼：AC2

#### TS-F031-007 失敗詳情顯示具體失敗階段（extract/chunk/embed） [unit]
- Given：`status='failed'`, `errorStage='embed'`, `errorMessage='embedding 服務逾時'`
- When：點擊查看詳情
- Then：顯示 `errorStage='embed'`（對應「向量化失敗」呈現文字）與完整 `errorMessage`
- 對應 AC / 錯誤碼：AC3

#### TS-F031-008 失敗詳情之三種階段各自對應正確中文呈現字樣 [unit]
- Given：分別 `errorStage='extract'`／`'chunk'`／`'embed'` 三種情境
- Then：分別呈現「抽取失敗」／「切 chunk 失敗」／「向量化失敗」（逐字對應 F031 spec Main Flow 步驟 4 之三種階段命名，非籠統的「處理失敗」）
- 對應 AC / 錯誤碼：AC3（呈現字樣精確性）

### 手動重新索引（Alternative Flow, AC3 後段）

#### TS-F031-009 失敗項目手動觸發重新索引 [unit]
- Given：文件目前索引狀態為「失敗」
- When：ICSOPAdmin 點擊「手動重新索引」
- Then：`FakeManualReindexTrigger.trigger(documentId)` 被呼叫一次，對應觸發 F030 之 `onContentRevised(documentId, 'manual')`（見 F030-test.md，`triggerType='manual'` 為既有 `INDEX_RUN.triggerType` 列舉值，data-model 已定義）
- 對應 AC / 錯誤碼：Alternative Flow

#### TS-F031-010 手動重新索引成功後狀態更新為「成功」 [unit]
- Given：TS-F031-009 觸發後，`FakeIndexRunQueryStore` 之後續查詢回傳新一筆 `status='success'`
- When：管理員重新整理/輪詢查看狀態
- Then：呈現「成功」（不再是先前的「失敗」）
- 對應 AC / 錯誤碼：AC4「重新索引成功後該筆狀態更新為『成功』」

#### TS-F031-011 對「成功」狀態文件亦可手動觸發重新索引（非僅限失敗項目） [unit]
- Given：文件目前索引狀態為「成功」
- When：ICSOPAdmin 點擊「手動重新索引」
- Then：允許觸發（spec 未限制僅失敗項目才可手動重索引，Main Flow 步驟 4「狀態為失敗時…可手動觸發」為失敗情境下之操作入口，非唯一入口——見開放設計問題 OQ-F031-01 就此假設之精確度存疑）
- 對應 AC / 錯誤碼：Main Flow 步驟 4（延伸推論）

#### TS-F031-012 「進行中」狀態文件觸發手動重新索引之防呆 [unit]
- Given：文件目前索引狀態為「進行中」
- When：嘗試手動觸發重新索引
- Then：預期行為未在 spec 定案——是否應拒絕（避免重複觸發同一文件之並行索引建置，呼應 F030-test.md OQ-F030-03 併發防呆）或允許排隊，見開放設計問題 OQ-F031-02
- 對應 AC / 錯誤碼：待定（OQ-F031-02）

### 總覽頁（AC4）

#### TS-F031-013 跨文件索引狀態彙總計數 [unit]
- Given：全系統 10 份文件，其中 6 成功、3 失敗、1 進行中
- When：進入「AI 索引管理」總覽頁
- Then：`successCount=6`, `failedCount=3`, `runningCount=1`
- 對應 AC / 錯誤碼：AC4 / Main Flow 步驟 5

#### TS-F031-014 篩選僅顯示失敗項目 [unit]
- Given：同上情境
- When：套用「失敗」篩選
- Then：`items` 僅含 3 筆失敗項目，其餘 7 筆不出現
- 對應 AC / 錯誤碼：AC4

#### TS-F031-015 大量文件總覽以彙總計數＋分頁呈現，不逐筆全載 [unit]
- Given：600 份文件之索引狀態（比照 corpus 規模參考 ≈598 份）
- When：進入總覽頁（未指定分頁參數）
- Then：預設回傳分頁大小內之筆數（比照既有 `AccessHistoryPage` 慣例，預設頁面大小為既有慣例值，如 50 筆），彙總計數欄位（`successCount`/`failedCount`/`runningCount`）為**全量**計算（非僅本頁），非逐筆全部載入清單
- 對應 AC / 錯誤碼：Edge Case「以彙總計數＋分頁/篩選呈現，不逐筆全載」

### 尚未建立索引（AC5，區別於「失敗」）

#### TS-F031-016 文件從無 `INDEX_RUN` 時顯示「尚未建立」而非「失敗」 [unit]
- Given：`FakeIndexRunQueryStore.getLatestByDocument()` 回傳 `null`（`DOC_SOURCE_XLS` 亦不存在，見 F027-test.md TS-F027-016 之「無來源」旗標）
- When：查看索引狀態
- Then：呈現「尚未建立」，**不**呈現為「失敗」（狀態語意明確區分：`null` INDEX_RUN ≠ `status='failed'`）
- 對應 AC / 錯誤碼：AC5

#### TS-F031-017 文件已上傳 .xls 但索引管線尚未執行第一次（極短暫窗口） [unit]
- Given：`DOC_SOURCE_XLS` 剛建立，`INDEX_RUN` 尚未由 `ingestion-worker` 認領建立（介於「已 enqueue」與「worker 建立 running 記錄」之間的短暫窗口）
- When：查看索引狀態
- Then：同樣呈現「尚未建立」（而非誤判失敗），此為與 TS-F031-016 相同判定邏輯之延伸情境（純粹依「有無 `INDEX_RUN` 記錄」判定，不區分「從未上傳」與「已上傳但尚未輪詢認領」兩種次情境——見開放設計問題 OQ-F031-03，此區分是否對使用者有意義未定案）
- 對應 AC / 錯誤碼：AC5（邊界延伸）

### RBAC（AC6/AC7）

#### TS-F031-018 ICSOPAdmin 對全部端點（讀＋寫）皆允許 [unit]
- Given：`roleCode='ICSOPAdmin'`
- When：呼叫 chunk 預覽／索引狀態／總覽（read）與手動重新索引（write）
- Then：`canPerform('ICSOPAdmin', FunctionKey.DOCUMENT_INDEX_MANAGEMENT, 'read'|'write')` 皆為 `true`，全部端點允許
- 對應 AC / 錯誤碼：F025 矩陣（`CRUD`）

#### TS-F031-019 系統管理員：查詢類允許、寫入類（手動重新索引）拒絕 [unit]
- Given：`roleCode='SysAdmin'`
- When：呼叫查詢類端點（chunk 預覽／索引狀態／總覽）
- Then：允許回傳（`canPerform('SysAdmin', ..., 'read') === true`）
- When：呼叫手動重新索引（write）端點
- Then：拒絕，`PERMISSION_DENIED`（403）（`canPerform('SysAdmin', ..., 'write') === false`）
- 對應 AC / 錯誤碼：AC7（本 feature 精確驗證 F025「唯讀＝可查不可改」語意在此功能列之逐一落實）

#### TS-F031-020 主管／部門窗口／一般使用者：任一 API 皆 403 [unit]
- Given：`roleCode ∈ {Supervisor, DeptContact, User}`
- When：呼叫本 feature 任一端點（含查詢類）
- Then：一律 `PERMISSION_DENIED`（403）（`FUNCTION_MATRIX['文件索引管理']` 三角色皆為 `'NONE'`，讀寫皆拒）
- 對應 AC / 錯誤碼：AC6

#### TS-F031-021 端點宣告防呆——查詢類端點誤標為 `'write'` action 之回歸測試 [unit]
- Given：假設性情境，若 chunk 預覽端點被誤標註 `@RequirePermission(FunctionKey.DOCUMENT_INDEX_MANAGEMENT, 'write')`（開發缺陷）
- When：SysAdmin 呼叫該端點
- Then：**此測試預期失敗以捕捉此類缺陷**——正確實作下 SysAdmin 應可查詢成功；本場景列為程式碼審查提示，非獨立可執行測試案例，記錄於此提醒實作/程式碼審查時逐端點核對 `action` 參數（見策略段落「本 worktree 最容易犯錯之處」）
- 對應 AC / 錯誤碼：AC7（實作品質防呆提示）

#### TS-F031-022 未登入（無 session）呼叫本 feature 任一端點 [unit]
- Given：無 `sessionUser`（未經 `SessionGuard`，或 session 已逾時）
- When：呼叫任一端點
- Then：`RolePermissionGuard` 依現有邏輯（`roleCode` 為 `undefined` → `canPerform` 回傳 `false`）一律 403（實際應更早被 `SessionGuard` 攔截為 401，此處驗證雙重防線之授權層行為，非取代認證層）
- 對應 AC / 錯誤碼：既有 `RolePermissionGuard` 通用行為（非本 feature 新邏輯，回歸驗證守門鏈正確套用）

### 前端自我守門（既有模式一致性）

#### TS-F031-023 前端路由對 Supervisor/DeptContact/User 自我守門封鎖 [unit]
- Given：登入角色為 `Supervisor`
- When：導向 `/admin/doc-index`
- Then：前端呈現封鎖/無權限畫面（比照既有 `OrgSyncPage`／`AccessHistoryPage` 之自我守門模式），不先發出查詢請求才被後端拒絕（雙層防線之前端層）
- 對應 AC / 錯誤碼：既有跨切前端模式一致性（非本 feature 新規則）

#### TS-F031-024 前端「手動重新索引」按鈕對 SysAdmin 唯讀狀態之呈現 [unit]
- Given：登入角色為 `SysAdmin`
- When：檢視文件之「AI 索引狀態」頁籤
- Then：chunk 預覽與狀態資訊正常顯示（唯讀允許），但「手動重新索引」按鈕應呈現為**禁用或不顯示**（非顯示後點擊才由後端 403 擋下）——精確 UI 行為（隱藏 vs 禁用+提示）未定案，見開放設計問題 OQ-F031-04；本測試僅斷言「按鈕不可觸發實際寫入呼叫」，具體視覺呈現留待 UI 實作定案
- 對應 AC / 錯誤碼：AC7（前端呈現層延伸）

### [integration] 佔位場景（本 worktree 不執行，待端點/DB/前端串接完成）

#### TS-F031-025 前端真實串接後端 API 端到端（含手動重新索引後狀態回寫） [integration]
- Given：真實後端端點＋真實前端頁面
- When：ICSOPAdmin 於瀏覽器操作「手動重新索引」
- Then：狀態由「失敗」正確轉為「進行中」再轉為「成功」（真實輪詢/重新整理），驗證前後端契約與本檔案 TS-009～010 之替身斷言一致
- 對應 AC / 錯誤碼：AC3, AC4

#### TS-F031-026 大量文件（≈600）總覽頁真實查詢效能 [integration]
- Given：真實 DB 中約 598 份文件之 `INDEX_RUN` 記錄
- When：載入總覽頁
- Then：回應時間可接受（具體門檻未定案，NFR 未列出本頁專屬延遲指標，見開放設計問題）；分頁與彙總計數查詢未造成全表掃描效能問題
- 對應 AC / 錯誤碼：Edge Case「大量文件之總覽」

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | chunk 清單＋8 項 metadata | TS-001, TS-002, TS-003 |
| AC2 | 進行中/成功狀態呈現 | TS-004, TS-005, TS-006 |
| AC3 | 失敗詳情（階段＋訊息）＋手動觸發 | TS-007, TS-008, TS-009 |
| AC4 | 手動重新索引成功後狀態更新／總覽彙總篩選 | TS-010, TS-013, TS-014, TS-015 |
| AC5 | 尚未建立索引（非失敗） | TS-016, TS-017 |
| AC6 | 主管/部門窗口/一般使用者一律 403 | TS-020, TS-022 |
| AC7 | 系統管理員查詢允許/寫入 403 | TS-019, TS-021, TS-024 |
| Main Flow 延伸 | 成功項目亦可手動重索引/進行中防呆 | TS-011, TS-012 |
| 跨切一致性 | 前端自我守門 | TS-023 |
| ICSOPAdmin 正面對照 | 全端點允許 | TS-018 |

## 開放設計問題

- **OQ-F031-01（F017 文件詳情頁尚不存在，本 feature 掛載入口缺失，`[BLOCKING]`，核心設計缺口）**：F031 spec Preconditions 明確要求「入口可掛載於後台文件清單（F017）之文件詳情頁籤」，但已查證 `frontend/src/App.tsx` 目前之後台路由**僅有** `documents`（清單頁）與 `documents/new`（建立頁），**完全沒有 `documents/:id`（文件詳情頁）路由**，`feature-status.md` 之 F017 狀態亦僅描述清單頁功能（統計卡/篩選/衍生狀態），未提及任何詳情頁。同時 F011（編輯）亦完全未開始——編輯頁與詳情頁極可能是同一或高度相關的頁面，兩者皆不存在。這意味著 F031 spec 假設的掛載點（「文件詳情頁籤」）在本 worktree 執行時**沒有宿主頁面可掛**。

  本測試設計之因應方式：`frontend/src/domain/menu.ts` 已預先定義獨立的頂層路由 `/admin/doc-index`（`functionKey: DOCUMENT_INDEX_MANAGEMENT`），本測試設計**假設** F031 之總覽頁掛載於此既有路由（TS-013～015 之總覽頁情境即以此為前提，不依賴文件詳情頁），而「單一文件之 chunk 預覽/索引狀態」則需要一個**尚未定義**的文件層級進入點——可能選項：(a) 總覽頁清單列上加一個「查看」連結導向 `/admin/doc-index/:documentId`（獨立路由，不掛在文件詳情頁），(b) 等待 F017/F011 worktree 補上文件詳情頁後再以頁籤形式掛載（本 feature 之「單文件檢視」部分因而延後可用），(c) 兩者並存（總覽頁提供獨立入口，未來詳情頁完成後再加頁籤捷徑）。**本測試設計之 TS-001～012、016～017（單文件相關情境）皆以「已能查得該文件之索引狀態」為前提撰寫，刻意不綁定具體 UI 路由路徑**，需與 architect／UI 設計待該路由/掛載點定案後回頭校準涉及路由本身的測試斷言（本測試設計之場景邏輯本身不受影響，僅前端路由層測試需要具體路徑值）。

- **OQ-F031-02（「進行中」狀態下手動觸發重新索引之防呆行為未定案）**：TS-F031-012 標記此情境，與 F030-test.md OQ-F030-03（連續觸發序列化策略）同根因，建議兩份文件之校準同步進行——若 F030 決定「偵測到已有 pending/running job 時合併請求」，則 F031 前端可據此設計為「進行中狀態下重新索引按鈕禁用（非隱藏，附提示文字說明原因）」。

- **OQ-F031-03（「從未上傳」vs「已上傳但索引管線尚未認領」兩種次情境是否需區分未定案，低風險）**：TS-F031-017 指出兩種情境目前皆呈現「尚未建立」，此為最簡單的實作（僅需查「有無 INDEX_RUN」，不需額外判斷 `DOC_SOURCE_XLS` 是否存在）。若管理員實務上需要區分「我還沒上傳 .xls」與「我上傳了但系統還沒處理」（後者若長時間停留可能代表 `ingestion-worker` 異常，屬營運可觀測性議題），則需要更細緻的第四種狀態或提示。本測試設計採最簡假設，若產品需求要求更細緻區分，需回頭補充測試場景與 `INDEX_RUN` 之外的判斷依據（如 `DOC_SOURCE_XLS.uploadedAt` 距今時長之告警邏輯，屬營運監控範疇，非本 feature 核心驗收範圍）。

- **OQ-F031-04（前端「手動重新索引」按鈕對 SysAdmin 之精確呈現方式未定案）**：TS-F031-024 指出「禁用」與「隱藏」兩種常見前端收斂唯讀角色寫入按鈕之模式皆合理，但選擇不同直接影響前端元件測試之精確斷言（`queryByRole('button')` 應回傳 `disabled` 元素，或應完全 `null`）。建議與既有其他管理頁面（如帳號管理頁對唯讀角色之既有按鈕呈現慣例，若已有前例）保持一致，避免同一系統內不同頁面對「唯讀角色看到的寫入按鈕」呈現方式不一致，造成使用者困惑。
