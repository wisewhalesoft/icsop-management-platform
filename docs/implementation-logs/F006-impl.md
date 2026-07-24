---
type: implementation-log
feature_id: F006
feature_name: 組織異動影響提示與異動管理後台
status: complete
last_updated: 2026-07-24
worktree: icsop-f006-alerts (feature/f006-alerts)
test_design: docs/specs/test-design/F006-test-design.md
prototype: prototypes/09-org-sync-management.html
---

# F006：組織異動影響提示與異動管理後台 — 實作日誌

> 依 `docs/specs/test-design/F006-test-design.md`（79 場景）嚴格 TDD（先 RED 後 GREEN）實作。
> 人類對測試設計開放問題之裁決（2026-07-24）已逐項落地，見下方「決策落地」。

## 決策落地（人類裁決 → 實作）

| 裁決 | 落地方式 |
|---|---|
| 1. 單表＋`alertKind` 判別欄；去重鍵於服務層＋DB filtered unique 雙層；`SYNC_RUN` 擴充三欄且 **NULL 視為 0** | `ORG_CHANGE_ALERT`（migration `1722816000000`）＋兩條 filtered unique index；`SYNC_RUN` 三欄 **NULLable**（migration `1722902400000`），KPI SQL 以 `COALESCE(SUM(COALESCE(col,0)),0)` 使 migration 前之歷史列降級為 0 而非 NULL/報錯 |
| 2. 職級異動不得放棄 AC；以三訊號偵測 | `alert-generation.ts` 實作 (a) 室長本人 `orgCode` 異動、(b) **原以該人員為 `managerEmpNo` 之組織單位改派他人**（prototype「升任協理」情境之可偵測替身）、(c) 制定公司/部門/室別/使用部門對應組織單位異動。(b) 由 TS-F006-080/081/082 三場景涵蓋 |
| 3. Route A ＋ Route B 皆實作；Route A 不得為 doc-seams 現況做暫時性繞道 | `document-change-subscriber.ts` 之 `FIELD_KEY_BY_PROP` **已含** `secondaryChiefIds`／`usingDeptIds`；單元測試直接驅動 publisher（不經 `documents.service.update()`），故 doc-seams 併回後無需再改本模組 |
| 4. resolved 查詢僅後端，不造 prototype 沒有的歷史頁籤 | `GET /admin/org-change-alerts?status=resolved` 已實作並測試；前端只渲染 pending 面板 |
| 5. 共用 spec 文件不改，僅回報 | 見「需 orchestrator 套用之文件變更」 |

## 職級/職稱資料缺口（OQ-F006-03 正式紀錄）

上游白名單**確無**任何職級/職稱欄位：`VW_HPMUSER` 之 `DIRECTOR` 於 `backend/src/org-sync/normalization.ts:152` 對映 `managerEmpNo`；`VW_DEPT_SQL.JOB_CODE` 於同檔 `:129` 亦對映 `managerEmpNo`（原始碼註解「實為 MANGER_EMPNO」）。兩者皆為「主管員編」而非職級。
→ 本實作**未新增任何臆造之職級欄位**；prototype 之「升任協理、待確認是否續任當責」情境改以訊號 (b)「該人員已非該單位 `managerEmpNo`」忠實偵測。若日後上游開放 `VW_PERSONAL_JOB` 之職級欄，再以 additive 訊號擴充即可（現有三訊號不需重寫）。

## 測試結果摘要

backend `npx jest`：**91 suites / 1019 tests 全綠**（baseline 82/909 → +9 suites、+110 tests）
frontend `npx vitest run`：**33 files / 244 tests 全綠**（baseline 33/218 → +26 tests）
`npx tsc --noEmit`：backend、frontend 皆 0 error。

| Scenario | 覆蓋檔 | Status |
|---|---|---|
| TS-F006-001~004 | `test/int/org-change-alert.itest.ts`（＋migration 已對真 SOP 執行並手動驗證，見下節） | 撰寫完成（int 由 orchestrator 序列執行） |
| TS-F006-005~013 | `org-change-alert/alert-generation.spec.ts` | PASS |
| TS-F006-080~082（新增，裁決 2 之訊號 (b)） | 同上 | PASS |
| TS-F006-014~020 | 同上 | PASS |
| TS-F006-021~024, 027~029 | `org-change-alert/closed-dept-detection.spec.ts` | PASS |
| TS-F006-025, 026, 057 | `org-change-alert/org-change-alert.service.spec.ts` | PASS |
| TS-F006-030, 031, 032 | `alert-generation.spec.ts` | PASS |
| TS-F006-033 | `test/int/org-change-alert.itest.ts` | 撰寫完成（int） |
| TS-F006-034~036, 041 | `org-change-alert/org-change-alert.controller.spec.ts` | PASS |
| TS-F006-037~039 | `org-change-alert.service.spec.ts`＋`monthly-range.spec.ts` | PASS |
| TS-F006-040, 042, 043, 048, 055, 058 | `org-change-alert.service.spec.ts` | PASS |
| TS-F006-044~047, 049, 054, 056 | `org-change-alert/document-change-subscriber.spec.ts` | PASS（047 已重新詮釋，見下） |
| TS-F006-050~053 | `org-change-alert.controller.spec.ts`（＋`org-sync.controller.spec.ts` 之 monthly-summary） | PASS |
| TS-F006-059~075 | `frontend/src/pages/OrgSyncPage.test.tsx` | PASS |
| TS-F006-076~079 | `backend/test/int/org-change-alert.itest.ts` | 撰寫完成（int） |

## 對測試設計之修改（含理由）

1. **TS-F006-047 重新詮釋（唯一實質改寫）**。原設計要求斷言「`secondaryChiefIds` 變更**不會**觸發自動解除」，理由是 `documents.service.update()` 現況剔除該欄。此斷言會把 doc-seams 軌正在修掉的暫時行為**固化成測試**，違反裁決 3。改為：「多值欄位之變更事件抵達時**亦**自動解除對應提示」，以直接驅動 publisher 的方式測試。原設計之「已知缺口」在本模組已不存在（缺口純在 documents 端，且正在被修）。
2. **TS-F006-035（resolved 查詢）** 依裁決 4 僅實作後端並於 controller spec 覆蓋；前端不做歷史頁籤。
3. **新增 TS-F006-080/081/082**（裁決 2 之訊號 (b) 正/負向）。設計文件無此編號，續編於 079 之後。
4. **`ORG_CHANGE_ALERT` 增 `documentName` 欄**（設計 D1 表格未列）：TS-F006-065 要求提示卡顯示文件名稱，而設計僅列 `documentNumber`。比照 `documentNumber` 之快照慣例增加，免 join。
5. **store 介面調整**：設計之 `FakeOrgChangeAlertStore` 列了 `findPendingByDocFieldKey`／`findPendingByEmployeeNo` 兩個逐鍵查詢；實作改為 `listByStatus('pending')` 一次載入後於服務層組鍵集合（純函式本就接收 `existingPendingKeys`／`existingPendingEmployeeNos`），並新增 `findPendingByDocument`（Route A 用）。理由：對齊本專案 load-all 慣例（F004 之 MSSQL 2100 參數上限教訓），且避免同一件事有兩套去重路徑。
6. **`FakeDocumentIndex` 由 async 介面改為同步快照陣列**（`DocumentAlertRef[]`）：純函式因此真正無 IO，服務層一次 `listDocumentRefs()` 載入（文件量 ~600）。
7. **唯讀橫幅文案**採 **prototype 逐字**（「唯讀模式 · ICSOP 管理員可查看同步狀態與待確認異動，但無法觸發「立即同步」。」），未採設計 TS-F006-073 自行擴寫的「或處理異動」——prototype 為 UI 權威且任務明令不得自創文案。

## Files Changed

### 新增（backend）
| 檔案 | 內容 |
|---|---|
| `backend/src/org-change-alert/org-change-alert.types.ts` | 型別與 `OrgChangeAlertStore` 契約、DI token |
| `backend/src/org-change-alert/alert-generation.ts` (+spec) | DOCUMENT_FIELD 提示產生（三訊號＋去重），純函式 |
| `backend/src/org-change-alert/closed-dept-detection.ts` (+spec) | §7.3 掛已關閉部門偵測（全量掃描＋員編去重），純函式 |
| `backend/src/org-change-alert/monthly-range.ts` (+spec) | KPI「本月」＝Asia/Taipei 當月區間，純函式 |
| `backend/src/org-change-alert/org-change-alert.service.ts` (+spec) | 產生／查詢／resolve／autoResolve／KPI 編排＋稽核 |
| `backend/src/org-change-alert/org-change-alert.controller.ts` (+spec) | `GET /admin/org-change-alerts`、`PATCH :id/resolve` |
| `backend/src/org-change-alert/document-change-subscriber.ts` (+spec) | Route A：欄位對映＋自動解除（非阻斷） |
| `backend/src/org-change-alert/typeorm-org-change-alert.store.ts` (+spec) | 生產 store（load-all、無 delete/save 路徑） |
| `backend/src/org-change-alert/org-change-alert.module.ts` | DI wiring，匯出 service 與 subscriber |
| `backend/src/database/entities/org-change-alert.entity.ts` | 實體 |
| `backend/src/database/migrations/1722816000000-org-change-alert.ts` | 建表＋3 索引＋2 filtered unique＋2 FK |
| `backend/src/database/migrations/1722902400000-sync-run-account-stats.ts` | `SYNC_RUN` 三欄（NULLable）＋`IX_SYNC_RUN_startedAt` |
| `backend/src/documents/composite-document-change-publisher.ts` (+spec) | `DOCUMENT_CHANGE_PUBLISHER` fan-out（逐一 try/catch） |
| `backend/src/org-sync/org-sync-alert-integration.spec.ts` | 同步引擎 × 提示產生整合點＋KPI 細分落地 |
| `backend/test/int/org-change-alert.itest.ts` | [int] TS-001~004/033/076~079 |

### 修改（backend）
| 檔案 | 變更 |
|---|---|
| `src/audit/audit.types.ts` | **additive**：`AuditTargetType += 'ORG_CHANGE_ALERT'`、`AuditActionType += 'ALERT_RESOLVED'`、新增 `OrgChangeAlertAuditEvent` 變體 |
| `src/org-sync/org-sync.types.ts` | `FinishSyncRunPatch` 增三個選填欄；新增 `SyncAlertInput`／`OrgChangeAlertGenerator`（seam 定義於 org-sync 以維持單向相依） |
| `src/org-sync/org-sync.service.ts` | 建構子第 4 個選填參數 `alerts`；成功收尾後呼叫 `generateFromSyncPlan`（失敗僅記 warning，不改同步結果）；`finishSyncRun` 帶入三細分數字 |
| `src/org-sync/typeorm-org-sync.store.ts` (+spec) | `finishSyncRun` 落地三欄（未帶→0） |
| `src/org-sync/org-sync.controller.ts` (+spec) | 新增 `GET monthly-summary`（read 權限）；建構子注入 `OrgChangeAlertService` |
| `src/org-sync/org-sync.module.ts` | imports `OrgChangeAlertModule`，`OrgSyncService` factory 注入提示產生器 |
| `src/org-sync/normalization.ts` (+spec) | `NormalizedOrgUnit` 增**選填** `closeDate`（AC8 需部門關閉日期；不參與 `classifyOrgUnit` 比對、不落地 `ORG_UNIT`，既有物件字面值替身不受影響） |
| `src/database/entities/sync-run.entity.ts` | 三個 nullable int 欄 |
| `src/documents/documents.module.ts` | `DOCUMENT_CHANGE_PUBLISHER` 由 `useExisting` 單一綁定改為 `useFactory` 之 Composite（F037 publisher ＋ F006 subscriber） |
| `src/app.module.ts` | 註冊 `OrgChangeAlertModule` |
| `test/int/harness.ts` | `MARK.emp='ZZINTE'`；`cleanupMarkers()` 依 FK 順序清 `ORG_CHANGE_ALERT`（文件關聯＋員編前綴）與 marker `SYNC_RUN` |

### 前端
| 檔案 | 變更 |
|---|---|
| `frontend/src/pages/OrgSyncPage.tsx` | 依 prototype 09 重建：唯讀橫幅（eye）→ 同步狀態卡（頁籤外）→ 三頁籤（總覽/同步歷史/待確認異動＋amber 徽章）→ KPI 4 卡 → 歷史表（`min-w-[720px]`，欄位不變）→ 提示卡清單/空狀態；無權限畫面補 prototype `blockMsg` |
| `frontend/src/pages/org-sync-view.ts` (+test) | 新增 `formatDateOnly`、`KPI_CARDS`（prototype 之文案/圖示/色票純資料化，可測） |
| `frontend/src/pages/OrgSyncPage.test.tsx` | 全面擴充（23 場景，涵蓋 TS-059~075 ＋既有 US-011 回歸） |
| `frontend/src/api/types.ts`／`endpoints.ts`（+test） | `OrgChangeAlertView`／`OrgSyncMonthlySummary` 型別；`getOrgChangeAlerts`／`resolveOrgChangeAlert`／`getOrgSyncMonthlySummary` |
| `frontend/src/components/Icon.tsx` | 註冊 `user-plus`／`user-x`／`clock`／`check`（prototype 使用且原註冊表未收；未註冊會靜默不渲染） |

## Migration 執行紀錄（對真實 SOP）

```
npm run typeorm -- -d src/database/data-source.ts migration:show   # 確認僅 2 筆 pending
npm run migration:run                                              # 兩筆皆 executed successfully
```
另以一次性腳本對真庫驗證 DDL 語意後即刪除（未留檔、資料已清除）：
- 同員編第二筆 `pending` → `Cannot insert duplicate key row ... 'UQ_ORG_CHANGE_ALERT_person'`（filtered unique 生效）。
- 既有列轉 `resolved` 後可再插入同員編 `pending`（歷史多筆允許，TS-F006-003 語意）。
- `SYNC_RUN` 三欄型別 `int`／`IS_NULLABLE=YES`。
- KPI `COALESCE` 加總對全 NULL 歷史列回 `0`（非 NULL）。

`npm run test:int` **未執行**（依任務指示，由 orchestrator 合併後序列跑）。

## Architectural Decisions

- **提示產生為非阻斷**：`applySync` 已提交且 `SYNC_RUN` 已標 success 之後才產生提示；失敗僅 push warning，不把成功的同步改判為失敗。
- **seam 方向**：`SyncAlertInput`／`OrgChangeAlertGenerator` 定義在 `org-sync.types.ts`，由 org-change-alert 實作 → 模組相依單向（org-change-alert → org-sync 型別），無循環。
- **稽核落地限制（需 architect 決策）**：`AUDIT_LOG` 無 `alertId` 欄，`buildAuditRow` 之 targetType switch 對 `ORG_CHANGE_ALERT` 不對映任何參照欄（documentId/lifecycleId/formId 皆 null），`targetNumber`（文件編號或員編）與 `targetName`（受影響欄位／「掛於已關閉部門」）仍落地。**未擅自 ALTER 共用 AUDIT_LOG schema**（跨 worktree 風險）。提示本身之 `resolvedBy`/`resolvedAt` 為權威處理紀錄，稽核列為輔助軌跡。建議日後由 audit 軌新增 `alertId`（或通用 `targetRefId`）欄。
- **KPI 兩處計數口徑不同（OQ-F006-04）**：KPI「當責待確認」＝pending 之當責室長類（窄）；頁籤徽章＝全部 pending。依設計 D7 保留，並於測試中明確斷言兩者差異，避免被誤讀為 bug。
- **`insertMany` 逐筆 insert**：DB filtered unique 為併發第二道防線，逐筆可讓單筆競態違例不牽連整批（提示筆數量級小，非效能瓶頸）。

## Prototype 對齊說明（09-org-sync-management.html）

逐項還原：三頁籤與 active 樣式（`border-b-2 border-primary-600 text-primary-700`／非 active `border-transparent text-slate-500`）、amber 徽章（`bg-amber-100 text-amber-700`、0 筆不顯示）、KPI 四卡（文案/圖示/色票/`grid-cols-2 sm:grid-cols-4 gap-3`/`p-3.5`/`text-2xl font-bold`）＋卡下說明逐字、同步狀態卡於頁籤列外（含「結果：」段）、歷史表 `min-w-[720px]` 與 5 欄不變、提示卡（mono 編號＋clock 待確認 pill＋受影響欄位＋刪除線 before → amber after＋兩顆 write-only 按鈕＋非強制註記）、空狀態（`check-circle-2` ＋「目前無待確認組織異動」）、唯讀橫幅逐字、無權限畫面（lock＋角色別 blockMsg＋`PERMISSION_DENIED · 403`）。

**未能逐項還原者（2 處，皆有理由）**：
1. **`CLOSED_DEPT_PERSON` 提示卡無 prototype 樣板**（prototype 假資料 3 筆皆為文件層情境）。依 AC8 必要資訊（員編/姓名/部門代碼/部門名稱/關閉日期）分流渲染，沿用同一張 amber 卡殼與 pill；不套用 before/after 差異版式、不顯示「前往當責設定」（無文件可導頁）。**建議 UI/UX 補一張 prototype 變體**。
2. **toast → 既有 inline notice**：prototype 以右上角 toast 呈現操作結果，本專案 React 版尚無全域 toast 元件，沿用 `OrgSyncPage` 既有 `role="status"` 通知區塊（文案採 prototype 之「已標記處理完成（記錄處理者/時間）」）。此為併入本頁前即存在之差異，非本輪新引入。

## 需 orchestrator 套用之文件變更（本 worktree 未改共用 spec）

### `docs/specs/feature-status.md`
- L42 統計列：`⬜ 未開始 | 5 | F006 F032 F033 F034 F035` → **`| 4 | F032 F033 F034 F035`**；對應 ✅/🟡 統計列請一併把 F006 計入（本輪 backend＋frontend＋int 皆到位，唯 int 尚未執行，若採「硬化 DoD」可先列 🟡 待 int 綠後升 ✅）。
- L74 F006 列：`⬜ 未開始 | 無 ORG_CHANGE_ALERT 表/端點/UI…` → 改為 **`🟡/✅｜ORG_CHANGE_ALERT 表＋2 migration（已對 SOP 執行）、提示產生（同步收尾整合點）、GET/PATCH 端點、KPI monthly-summary、Route A 自動解除、prototype 09 三頁籤 UI 皆完成；int 待序列執行`**。
- 新增本輪摘要：backend 1019 單元／91 suites、frontend 244、新增 int suite `org-change-alert.itest.ts`。

### `docs/specs/open-questions.md`
- **OQ-F006-01**（觸發訊號範圍）：實作採「重用既有 `classifyOrgUnit`/`classifyAccount` 之 update 訊號」，未收窄 → 建議標「已實作，UX 觀察後再調」。
- **OQ-F006-02**（同鍵 pending 未處理前再度變動）：實作採「略過、`afterValue` 停留第一次快照」，已於 TS-F006-030 明確標記；若產品要改「就地更新」需回頭改該場景。
- **OQ-F006-03**（職級異動）：**建議定案為「上游無職級欄位，以『不再擔任該單位 managerEmpNo』為替身訊號」**（本日誌上方已附程式碼位置證據）。
- **OQ-F006-04**（KPI 卡 vs 徽章計數口徑）：實作採窄口徑，需產品確認是否接受同頁兩數字語意不同。
- 新錯誤碼 `ALERT_NOT_FOUND`(404)／`ALERT_ALREADY_RESOLVED`(409) 需補入 `docs/specs/error-handling.md`。

### `docs/specs/data-model.md`
- `#orgchangealert-entity`：`documentId` 由「必填」改為「條件必填（`alertKind='DOCUMENT_FIELD'` 時必填）」；補列新增欄位 `alertKind`／`documentNumber`／`documentName`／`personEmployeeNo`／`personName`／`deptOrgCode`／`deptName`／`deptCloseDate`／`resolutionKind`／`sourceSyncRunId`。
- `#syncrun-entity`：補 `accountsCreated`／`accountsUpdated`／`accountsDisabled`（int, nullable）。
- `#auditlog-entity`：`targetType` 增 `ORG_CHANGE_ALERT`、`actionType` 增 `ALERT_RESOLVED`；並記錄「本 targetType 之 targetId 目前無對應參照欄」之已知限制。

### `docs/specs/features/F006-org-change-alert-backend.md`
- 本 worktree 僅改 `Status:` 行（Draft → Implemented (Phase 1)）。其 **Error Scenarios 段仍寫「OQ-E02-03b 未定案」，但 `open-questions.md` 該列已定案（非強制提示）** → 請 orchestrator 統一措辭（本實作依已定案語意：提示非強制、不阻斷）。

## 跨模組接線（orchestrator 合併時需對帳）

1. **`backend/src/documents/documents.module.ts`**：`DOCUMENT_CHANGE_PUBLISHER` 由 `{ useExisting: DocumentChangeLogPublisher }` 改為 `useFactory` 回傳 `CompositeDocumentChangePublisher([DocumentChangeLogPublisher, OrgChangeAlertAutoResolveSubscriber])`，並 `imports += OrgChangeAlertModule`。若 doc-seams 軌同時改動此檔（多值欄位 diff），**兩邊改的是不同區塊**（seam 綁定 vs `documents.service.update()` 的 `delete clean.*`），但同檔需人工合併。
2. **`backend/src/audit/audit.types.ts`**：additive 兩個字面值＋一個事件變體。若 audit 軌同期有異動，取聯集即可。
3. **`backend/src/org-sync/*`**：`OrgSyncService` 建構子新增第 4 個選填參數、`OrgSyncController` 建構子新增第 2 個必填參數（`OrgChangeAlertService`）——任何手建這兩個類別的既有測試需補參數（本 worktree 已更新 `org-sync.controller.spec.ts` 之 4 處）。
4. **`backend/test/int/harness.ts`**：`cleanupMarkers()` 新增 `ORG_CHANGE_ALERT` 與 marker `SYNC_RUN` 之清理；其他 worktree 若同檔有異動需合併。
5. **Route A 對多值欄位之生效條件**：待 doc-seams 使 `documents.service.update()` 不再剔除 `secondaryChiefIds`／`usingDeptIds` 並產生 diff 後，`當責室長-次要`／`文件使用部門` 兩類提示即自動具備 Route A（本模組無需再改）。合併後建議加一條端到端回歸驗證。

## Blocking Issues

無。可上線之 Phase 1 範圍已完成；Phase 2（主動通知，OQ-E02-03a 管道未定）不在本輪。
