---
type: implementation-log
feature_id: F005
track: orgsync-alerts
worktree: icsop-orgsync-alerts
branch: feature/orgsync-alerts
status: complete
last_updated: 2026-07-24
---

# orgsync-alerts（F005 離職者相關警示）— 實作紀錄

## 範圍

補齊 `feature-status.md` 對 F005 之兩個缺口（🟡 部分 → 告警縫隙補齊）：

1. **DATA_INCONSISTENCY**：`EMPSTS='A'` 但 `RESIGNDT` 為過去日期之上游資料矛盾 → 產生告警、**不停用**（EMPSTS 權威）。
2. **ACCOUNT_DISAPPEARED**：本地在職之單一帳號其來源列消失（低於整批中止閾值）→ 產生告警、**不停用**（消失≠離職）。

依人類裁定採 **方案 (A)**：重用既有 `ORG_CHANGE_ALERT`（F006）表與 `OrgChangeAlertGenerator` seam，不另闢 F005 告警面。

## 測試結果

| 套件 | 基準 | 本次後 |
|---|---|---|
| backend `npx jest` | 1131 / 96 suites | **1171 / 98 suites**（全綠） |
| frontend `npx vitest run` | 390 / 35 files | **396 / 35 files**（全綠） |
| backend `tsc --noEmit`（src） | 淨 | 淨 |
| backend `tsc`（含 test/，throwaway config） | — | 淨 |
| frontend `tsc --noEmit` | 淨 | 淨 |
| Icon 註冊守門（`Icon.registry.test.tsx`） | 綠 | 90 綠（無新未註冊圖示） |

新增測試：偵測純函式 23（INCON 12 ＋ VANISH 11）、服務整合/稽核/resolve ~13、controller 混合 1、org-sync 接線 3、classification 回歸 1、前端卡片 6。共 ~40 backend ＋ 6 frontend。

### Test Scenario 對照（節錄）
| Scenario | 狀態 | 目標檔 |
|---|---|---|
| TS-INCON-001~013 | PASS | `data-inconsistency-detection.spec.ts`（＋012 於 service.spec） |
| TS-VANISH-001~011 | PASS | `account-disappeared-detection.spec.ts` |
| TS-ORGALERT-010~017 | PASS | `org-change-alert.service.spec.ts`／`org-sync-alert-integration.spec.ts`／`change-classification.spec.ts` |
| TS-ORGALERT-020 | PASS | `org-change-alert.controller.spec.ts` |
| TS-ORGALERT-030~033, 040~043 | PASS | `org-change-alert.service.spec.ts` |
| TS-ORGALERT-032 | PASS | `org-change-alert.service.spec.ts`（見「與設計偏差」） |
| TS-ORGALERT-060~065 | PASS | `frontend/OrgSyncPage.test.tsx` |
| TS-ORGALERT-001~005, 070~074 [int] | 就緒（未執行） | `backend/test/int/org-sync-alerts.itest.ts` |

## 兩個新 alertKind ＋ 產生接線

- 型別：`AlertKind` 於 `org-change-alert.types.ts`（後端）與 `frontend/src/api/types.ts` 各新增 `DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED`。
- 偵測純函式（不依賴 `ORG_CHANGE_ALERT` 儲存形狀，若日後改方案 (B) 可直接沿用）：
  - `data-inconsistency-detection.ts::detectDataInconsistencyAlerts()` — 全量掃描在職帳號，`status==='active' && resignDate!==null && resignDate < createdAt`（嚴格早於，恰等於當下不算過去）；`loginId` 去重；beforeValue=`EMPSTS=A（在職）`、afterValue=`RESIGNDT={YYYY-MM-DD}（過去日期，與在職狀態矛盾）`。
  - `account-disappeared-detection.ts::detectAccountDisappearedAlerts()` — 消費 `disappearedLoginIds`，帶入消失前 `existingAcc` 快照與最後已知部門（`orgUnits` 解析名稱，孤兒退回 null）；`deptCloseDate` 恆 null；beforeValue=`上次同步：在職`、afterValue=`本次同步來源查無此帳號（消失）`。
- 接線（沿用 F006 既有整合點，不新增掛載點）：
  - `org-sync.types.ts::SyncAlertInput` 新增 `disappearedLoginIds: string[]`。
  - `org-sync.service.ts::run()` 收尾組裝 `generateFromSyncPlan(...)` 時多帶 `disappearedLoginIds: disappeared.missingIds`（`missingIds` 此欄位第一個生產消費者；閾值中止路徑提前 return，不會走到此處）。
  - `org-change-alert.service.ts::generateFromSyncPlan()` 於既有兩偵測外，再呼叫兩新純函式；`existingPending{Incon,Vanish}LoginIds` 兩個**獨立**集合依 `alertKind` 自既有 pending 列分流建立（互不污染），四類輸出合併一次 `insertMany`。`listActiveAccounts()` 之結果同時餵給 closed-dept 與 data-inconsistency（不另查庫）。

## Migration

`backend/src/database/migrations/1723248000000-org-sync-alert-account-login.ts`：
- `ALTER TABLE [ORG_CHANGE_ALERT] ADD [accountLoginId] varchar(20) NULL`
- 兩個 filtered unique index（各限定自身 alertKind＋`status='pending'`）：`UQ_ORG_CHANGE_ALERT_login_inconsistency`、`UQ_ORG_CHANGE_ALERT_login_disappeared`。
- 去重鍵＝`loginId`（**非 EMPNO**：F005 明文「一人多帳號、不以 EMPNO 連坐」）。
- `beforeValue`/`afterValue`/`deptOrgCode`/`deptName` 語意重用，無 schema 變更。
- 對應擴充：`org-change-alert.entity.ts` 新增 `accountLoginId` 欄；store `toRow()`/`insertMany()` 帶入該欄；`listActiveAccounts()` 之 select 白名單多列 `loginId`/`resignDate`（同一查詢，非新查詢；仍絕不 `SELECT *`）。

**已對真實 SOP 執行**（`npm run migration:run`）：唯一 pending 之 `OrgSyncAlertAccountLogin1723248000000` 於單一交易成功套用並 COMMIT。事後查證：`accountLoginId` = `varchar(20)` NULLABLE；兩索引皆 `is_unique=1, has_filter=1`。（migration:show 顯示其餘 20 支皆早已套用，本次僅新增 1 支；未觀察到 sibling 之 `1723161600000` 存在於此 DB 視圖。）

## 兩個既有二元缺陷修正（必要，非選配）

1. **稽核 `writeAudit()` 二元三元運算子**（`org-change-alert.service.ts`）：抽出 `auditTarget(row)` 純函式，改依 `alertKind` 完整 `switch` 四路分流。修正前，新兩類之 `targetName` 會被誤植文字「掛於已關閉部門」。四路對照：
   - DOCUMENT_FIELD → `documentNumber` / `affectedField`
   - CLOSED_DEPT_PERSON → `personEmployeeNo` / `掛於已關閉部門`
   - DATA_INCONSISTENCY → `accountLoginId` / `資料不一致（EMPSTS/RESIGNDT）`
   - ACCOUNT_DISAPPEARED → `accountLoginId` / `帳號消失（來源查無）`
2. **前端 `AlertCard` 二元 `isDoc` 分流**（`frontend/src/pages/OrgSyncPage.tsx`）：改為依 `alertKind` 四路渲染（抽 `BeforeAfterDiff` 共用元件）。修正前，新兩類會被誤判為 CLOSED_DEPT_PERSON 版式（顯示錯誤情境文案、讀取不存在欄位）。TS-ORGALERT-060/065 為此防退化守門。

## Prototype-09 落差（比照 F006 R-4 之既有先例）

`prototypes/09-org-sync-management.html` 之 `alerts` 假資料僅含 `DOCUMENT_FIELD` 情境，對 F005 兩類無現成視覺規格。本次**沿用既有 amber 卡骨架**（`border-amber-200`/`待確認` pill/`標記無需變更` resolve 動作），依 AC 之必要資訊最小且一致呈現：主要識別＝`accountLoginId`＋姓名、情境標籤「資料不一致」/「帳號消失」、before→after 事實快照、ACCOUNT_DISAPPEARED 另顯示「消失前最後已知部門」。**未新造無關樣式**。→ 建議 UI/UX 後續補一版 prototype 09 卡片變體供像素級人工核對（RTL 現僅斷言結構/文字存在性）。

## OQ-ORGSYNC-02（每日重新浮現）

兩類告警在上游資料真正被修正前，每次排程同步之全量掃描/差異計算皆會重新命中；`resolved` 後不擋，故未修正前每日重新浮現。經設計接受為**刻意/合乎 spec**（AC 僅要求「產生告警」「不中止同步」，未要求抑制重複浮現）——本次無變更。若日後產品需要「近 N 天已處理且情境不變則抑制」之時間窗機制，屬新增邏輯（非本次範圍）。

## 與設計之偏差（誠實記錄，需 spec owner 知悉）

- **TS-ORGALERT-032 目標檔**：設計標 `document-change-subscriber.spec.ts`，但該 spec 之 fake 服務僅記錄呼叫、無法驗證提示列狀態。改置於 `org-change-alert.service.spec.ts` 之 autoResolve 區塊（服務層，真正驗證「新兩類 documentId=null，結構上不可能被 (documentId,affectedField) 命中而解除」）。行為與設計意圖一致，僅落點更能斷言。
- **TS-ORGALERT-073 [int] 之 `targetNumber` 斷言**：設計期望自 `AUDIT_LOG` 讀回 `targetNumber='zzint-orgsyncdi'`，但**實際 AUDIT_LOG 無 `targetNumber` 欄**，且 `buildAuditRow`（`audit-event.ts`）對 `targetType='ORG_CHANGE_ALERT'` **無對應 case** → `documentNumber` 亦保持 null（比照 F006 既有先例：AUDIT_LOG 無 alertId 欄）。故 int 版改驗**真實堆疊之 `targetName` 依 alertKind 正確分流**（自 `AUDIT_LOG_OUTBOX.payload` JSON 讀回；recordAccess 先入 Outbox）；`targetNumber=accountLoginId` 之行為改由**單元 TS-ORGALERT-042** 保證。此為對真實 schema 之忠實對齊，非弱化。**建議 spec owner**：若要在 AUDIT_LOG 落地 F005 兩類之 `accountLoginId`，需 architect 決定是否於 `audit-event.ts` 為 `ORG_CHANGE_ALERT` 補 case（跨 audit 模組，超出本 worktree 授權範圍）。

## 整合測試（未執行本輪）

`backend/test/int/org-sync-alerts.itest.ts`（獨立新檔，比照 doc-seams 慣例，降低與 `org-change-alert.itest.ts` 合併衝突）。自帶 `cleanupOrgSyncAlertMarkers()`（**不改** 共用 `harness.ts`）：刪 `accountLoginId LIKE 'zzint-%'` **或** `alertKind IN ('DATA_INCONSISTENCY','ACCOUNT_DISAPPEARED')`——後者因全量掃描可能對非 marker 真實在職帳號產生列，而此二 alertKind 為 F005 全新、尚未上線，任何此類列皆測試產物，清除安全。marker 帳號沿用 `zzint-`（harness 清）。已以 throwaway tsconfig 確認 test/ 型別淨。**未執行 `npm run test:int`**（依任務指示）。

## feature-status.md 建議變更（供 orchestrator；本 worktree 未改該檔）

- F005 由「🟡 部分」→「✅ 完成」（缺口「EMPSTS='A' 但 RESIGNDT 過去日之資料不一致告警」「逐帳號『消失』警告」已補齊，unit＋int 就緒、migration 落 SOP、稽核/前端二元缺陷一併修正）。
- 第 40 行 🟡 清單移除 F005；tally 由 `✅23 🟡11` → `✅24 🟡10`。
- 第 45/60 行「非 RAG 🟡 僅剩…F005（資料不一致告警）…」移除 F005。
- 全套件數字更新：backend **1171 單元**（原 1131）、frontend **396**（原 390）、**21 migration 落 SOP**（原 20）。
