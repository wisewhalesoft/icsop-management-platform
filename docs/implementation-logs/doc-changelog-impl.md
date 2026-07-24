---
type: implementation-log
worktree: doc-changelog (feature/doc-changelog)
covers: [F010, F012, F037]
also_touches: [OQ-AQ-04（F024 targetName 補值）]
status: 單元＋前端綠（backend 95 suites/1113、frontend 35 files/387）；整合已寫未跑（orchestrator 合併後統一序跑）
last_updated: 2026-07-24
---

# doc-changelog 實作紀錄：F010 建立稽核事件 ＋ F012 切換原因 ＋ F037 交易邊界（best-effort 定案）

依 `docs/specs/test-design/doc-changelog-test-design.md`（42 案）以嚴格 TDD 落地（先寫失敗測試→實作→綠），
並套用人類三項裁定覆蓋設計留白。

## 測試數字（最終）
| 範圍 | 基線 | 完成後 |
|---|---|---|
| backend jest | 94 suites / 1082 | **95 suites / 1113**（+1 suite `document-change-event.spec.ts`，+31 tests；全綠） |
| frontend vitest | 35 files / 374 | **35 files / 387**（+13 tests；全綠） |
| backend `tsc --noEmit`（src） | clean | **clean** |
| backend `tsc`（src＋test，throwaway tsconfig） | — | **clean**（整合檔型別無誤） |
| frontend `tsc --noEmit` | clean | **clean** |

（backend「worker force-exit」warning 為既存 benign；C-001/失敗路徑測試會印出預期的 `CompositeDocumentChangePublisher`／訂閱者 ERROR log，屬刻意觸發。）

## 人類裁定落地情形

### Ruling 1 — F037 交易邊界＝維持現況 best-effort（不做 outbox／atomic）
- **未**新增任何交易化/補償機制；沿用既有兩階段（`store.create/update/updateStatus` 成功後才 `publisher.publish`，
  fan-out 由 `CompositeDocumentChangePublisher` 逐訂閱者 try/catch 吞錯、不上拋、不重試、不補償）。
- 落地設計「現況鎖定」測試 **TS-DCL-C-001**（CREATE/STATUS 事件之 `DocumentChangeLogPublisher` 訂閱者拋錯
  → 不影響 `create()`/`setStatus()` 回傳、其他訂閱者仍被呼叫）為永久斷言。
- **未**實作 §3.3 outbox/atomic 參數化骨架（依裁定 DROP）。極少數變更日誌遺失為可接受取捨。

### Ruling 2 — F012 狀態路徑折入 `update()`（Option B）＋共用核心
- 新增私有共用方法 `DocumentsService.applyStatusTransition({docId, oldStatus, resultingNumber, newStatus, reason, actor, persist})`：
  (1) 切回「有效」時以 `resultingNumber` 重驗編號唯一性（排除自身，比對有效＋作廢）；(2) 執行呼叫端 `persist`；
  (3) 發 `STATUS` 事件（承載 status old/new ＋ `normalizeReason(reason)` ＋操作者/編號快照）。
  `setStatus()` 與 `update()` **皆呼叫此核心**，F013 重驗與 STATUS 事件語意不可能分歧。
- `update()`：`'status' in clean` 時走核心（persist＝整批 `store.update`）；**切回有效即重驗（不再僅限 `'documentNumber' in clean`）**，
  補上設計指出的缺口。`CONTENT` 事件**排除 status**（避免與 STATUS 事件重複記錄）；回傳 `res.changes`（版本對照）**仍含 status**（供編輯頁並列）。
- `reason` 為非文件欄位（`classifyFields` 視為 ignored、不落 `clean`/不持久化為欄位）；自原始 payload 讀取，僅於含狀態變更時貫穿。
- **`setStatus()` 與 `PATCH :id/status` 端點保留且仍可用**（委派同一核心）；未移除（既有 `TS-F012-*` controller/service 測試不破）。
  前端編輯頁改由一般 `PATCH :id` 驅動狀態＋reason（`DocumentEditPage.save()`）。
- 取代設計 §2.4 指出之衝突斷言：`documents.service.spec.ts` 之 `TS-F012-008` 原 `not.toHaveProperty('reason')`
  改為 `reason === '依法規更新'`（新契約：reason 已有 sink）。

### Ruling 3 — 切換原因於變更歷程可檢視（F012 AC36，填補 prototype 23 缺口）
- **⚠ 明確標註**：`ChangeHistoryPage.tsx` 展開明細新增「切換原因：{reason}」列＝**填補 prototype 23 之缺口**
  （原型無此顯示元素，F012 AC36 明訂須可於變更歷程檢視）。**非偏離**。樣式沿用既有明細列（`text-[11px] text-slate-500`），未改動頁面其餘版面。
  未填原因（reason null）→ **不顯示該列**（非「（空）」——「未填原因」與「欄位新值為空」語意不同）。
- 原因**輸入**於 `DocumentEditPage.tsx`（prototype 15 `statusReasonWrap`）逐項還原：label「切換原因（選填）」、
  placeholder「例：內容已過時、依法規更新、由新版取代…」、helper「非必填；若填寫將一併記入變更歷程（F037「文件狀態」事件）。」、
  **僅於狀態實際變更且可寫時顯示**、回原狀態/儲存/取消時清空。prototype 15「切作廢確認對話框」屬設計 §6 非本任務範圍，未實作（無新增偏離）。

## Files Changed
| 檔案 | 類型 | 說明 |
|---|---|---|
| `backend/src/documents/document-change-event.ts` | modified | `changeType` 加 `'CREATE'`；`DocumentChangedEvent` 加 `reason?`；新純函式 `buildCreateChangeDeltas`（略過 null/undefined/空陣列） |
| `backend/src/documents/document-change-event.spec.ts` | new | TS-DCL-A-001~005 純函式＋CREATE/reason 型別守門 |
| `backend/src/documents/documents.service.ts` | modified | `create()` 加 actor＋發 CREATE 事件；`applyStatusTransition` 共用核心；`update()` 折入狀態/reason、CONTENT 排除 status；`setStatus()` 委派核心；`persistUpdate` 抽出 |
| `backend/src/documents/documents.controller.ts` | modified | `create()` 加 `@Req` 並帶 `actorOf(req)`（貫穿操作者） |
| `backend/src/documents/documents.service.spec.ts` | modified | 新增 A-006~012、B-004~007、B-101~107（update 折入）、A-012/C-001 fan-out；改 TS-F012-008 reason 斷言 |
| `backend/src/documents/documents-controller.spec.ts` | modified | TS-DCL-A-013 create 貫穿 actor |
| `backend/src/change-history/document-change-log.store.ts` | modified | `DocumentChangeLogRow` 加 `reason: string \| null` |
| `backend/src/change-history/typeorm-document-change-log.store.ts` | modified | `toRow()` 帶 `reason` |
| `backend/src/change-history/document-change-log-publisher.ts` | modified | `buildDocumentChangeLogRows` 逐列 `reason: event.reason ?? null` |
| `backend/src/change-history/document-change-log-publisher.spec.ts` | modified | TS-DCL-B-001~003 ＋ CREATE 通過性 |
| `backend/src/change-history/document-change-history.service.ts` | modified | **OQ-AQ-04**：`recordAccess` 補 `targetName`（＝documentNumber 快照） |
| `backend/src/change-history/lifecycle-change-history.service.ts` | modified | **OQ-AQ-04**：`recordAccess` 補 `targetName`（＝lifecycleName） |
| `backend/src/change-history/document-change-history.service.spec.ts` | modified | `row()` 補 `reason: null`；斷言 `targetName` |
| `backend/src/change-history/lifecycle-change-history.service.spec.ts` | modified | 斷言 `targetName` |
| `backend/src/database/entities/document-change-log.entity.ts` | modified | 加 `reason nvarchar(500)` 欄 |
| `backend/src/database/migrations/1722988800000-document-change-log-reason.ts` | new | `ALTER TABLE [DOCUMENT_CHANGE_LOG] ADD [reason] nvarchar(500) NULL`（已對真 SOP 跑通） |
| `backend/test/int/changehistory.itest.ts` | modified | TS-DCL-E-001~007 ＋ E-004b（一般 PATCH reason 落地）；沿用既有 marker 清理，未開新檔 |
| `frontend/src/api/types.ts` | modified | `DocumentChangeView` 加 `reason?` |
| `frontend/src/pages/DocumentEditPage.tsx` | modified | 切換原因輸入（prototype 15）＋ save 折入 reason ＋ 回原狀態/儲存/取消清空 |
| `frontend/src/pages/DocumentEditPage.test.tsx` | modified | TS-DCL-D-001~009（Option B 改寫；D-010 依裁定 DROP） |
| `frontend/src/pages/ChangeHistoryPage.tsx` | modified | `CHANGE_SOURCE` 加 `CREATE:'建立'`；FIELD_LABEL 補 lifecycleId 等；明細新增「切換原因」列（AC36） |
| `frontend/src/pages/ChangeHistoryPage.test.tsx` | modified | TS-DCL-D-011~014 |
| `docs/specs/features/F010/F012/F037-*.md` | modified | 僅更新 Status 行（許可範圍） |

## Migration（已執行）
- 指令：`npm run migration:run`（`backend/`，讀 `../.env` 連真 SOP DB）。
- 結果：`ALTER TABLE [DOCUMENT_CHANGE_LOG] ADD [reason] nvarchar(500) NULL` 於單一交易內執行並 COMMIT 成功，
  並寫入 `migrations` 表（`DocumentChangeLogReason1722988800000`）。
- 備註：SOP 上已有更高時間戳之 `1723075200000`（他軌 migration）先前執行；TypeORM 依「未記錄之新 migration」執行，
  本檔為唯一新項，正常執行、無撞號、無資料異動。`nvarchar(500)` 為設計預設（spec/prototype 未定上限），
  無最大長度驗證/錯誤碼（無 spec 先例，未杜撰）。

## 交叉軌相依（unblocks audit-query）
- **OQ-AQ-04（本軌表面）**：`document-change-history` / `lifecycle-change-history` 之 `recordAccess()` 現已填 `targetName`
  （文件＝documentNumber 快照；循環＝lifecycleName，比照 F036 `lifecycle-preview.service` 之 number=name 慣例）。
  F024「對象名稱」欄之「變更」kind 稽核列不再顯示「—」。**未觸碰** `backend/src/audit/audit.types.ts` 及 audit 查詢服務
  （屬 audit-query 軌表面）。sibling audit-query 整合測試斷言此值即應通過。

## 給 orchestrator 套用的 feature-status.md 變更（本軌未改凍結檔，請據此更新）
> `docs/specs/feature-status.md`（凍結，未由本軌修改）：
- **F010** → `🟡`（若原為 ⬜/未列）：建立端點＋建立稽核事件 CREATE 已落地（單元綠；整合已寫未跑）。
- **F012** → `🟡`（若原為 ⬜/未列）：切換原因 reason 端到端持久化＋狀態折入 update() 共用核心（單元綠；整合已寫未跑）。
- **F037** → 維持 `🟡`，補註：新增 CREATE 建立事件顯示＋STATUS reason 顯示；交易邊界維持 best-effort（人類定案，非缺口）。
- 三者整合測試已於 `changehistory.itest.ts` 擴充（TS-DCL-E-001~007＋E-004b），待 int 序跑後可考慮升 ✅。

## 設計案例對照與偏差說明
- **TS-DCL-D-004/005/009**：設計以 Option A（雙請求 `setDocumentStatus`）撰寫並標 `{ruling:endpoint}`；本輪依 Ruling 2＝Option B
  改寫為「單一 `updateDocument` 帶 status＋reason、`setDocumentStatus` 不被呼叫」（設計本身已附此改寫對照）。
- **TS-DCL-D-010**（部分失敗 UX）：Option B 單一原子請求下依設計「一併消失」→ **DROP**（未實作）。
- **TS-DCL-B-005/006**：事件層 `reason` 未填＝`undefined`（`normalizeReason` 回 undefined，事件不帶值）；publisher 落地時
  `?? null` → DB NULL。二層語意一致（事件 undefined／DB null），非矛盾。
- 新增（設計未逐一編號、由 Ruling 2 衍生）：**TS-DCL-B-101~107**（update 折入狀態＋reason＋F013 切回有效重驗＋CONTENT 排除 status）、
  **TS-DCL-E-004b**（一般 PATCH reason 落地＝前端實際路徑）——皆為忠實覆蓋 Ruling 2 後端行為所必需。

## 未決/回報（不自行決策）
- `DOCUMENT_CHANGE_LOG.reason` 長度上限 `nvarchar(500)` 為設計預設；如需前端 `maxlength` 軟限制或後端錯誤碼，
  需先於 `error-handling.md`（凍結）新增條文，本輪未杜撰（設計 §9#3）。
- prototype 15「切作廢」確認對話框、prototype 23 之其他低優先項（設計 §6/§9#4）非本任務範圍，未動。
