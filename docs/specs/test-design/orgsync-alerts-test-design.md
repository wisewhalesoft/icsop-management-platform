---
type: test-design-feature
covers: [F005, F006]
priority: P0-MVP
related_spec:
  - docs/specs/features/F005-auto-disable-departed.md
  - docs/specs/features/F006-org-change-alert-backend.md
  - docs/specs/upstream-hr-source-contract.md
  - docs/specs/data-model.md
last_updated: 2026-07-24
status: draft
---

# orgsync-alerts — F005 離職者自動停用帳號：剩餘告警縫隙 · Test Design

> source: `docs/specs/features/F005-auto-disable-departed.md`、`docs/specs/feature-status.md`（F005 列）、`backend/src/org-sync/`（現況程式碼，權威）、`backend/src/org-change-alert/`（F006 現況程式碼，權威）、`prototypes/09-org-sync-management.html` · worktree: `icsop-orgsync-alerts`（branch `feature/orgsync-alerts`）· 2026-07-24

## 0. 範圍聲明

`feature-status.md` 對 F005 之判定：**🟡 部分** — 「停用→即時撤銷已達成；缺『EMPSTS=\'A\' 但 RESIGNDT 過去日』資料不一致**告警**、逐帳號『消失』警告」。本文件**只設計這兩個缺口**，不重新設計 F005 已完成之部分，亦不重新設計 F006（已 ✅ 已完成-已驗證）之既有基礎設施——而是**在其上擴充**。

**不重新設計、直接沿用既有覆蓋範圍（既有 `*.spec.ts` 已綠燈，本文件不重複）：**
- `backend/src/org-sync/change-classification.spec.ts`：`classifyAccount()` 之 create/update/disable/noop 判定本體（含「離職以 EMPSTS 觸發、消失不觸發」之核心規則）。
- `backend/src/org-sync/disappeared-threshold.spec.ts`：`computeDisappeared()`／`disappearedRatioExceeded()` 之閾值運算本體（**唯一新增**：本文件會使用其既有回傳值 `missingIds`，該欄位目前無任何下游消費者，見 D3）。
- `backend/src/org-sync/normalization.spec.ts`：`normalizeAccount()` 之 `RESIGNDT` 正規化（哨兵/超範圍 → `null`）本體——本文件之偵測邏輯**直接信任**此正規化結果，不重新驗證。
- `backend/src/org-sync/org-sync.service.spec.ts`：同步引擎主流程（互斥鎖、水位、髒資料、閾值中止、單一交易套用）本體。
- `backend/src/org-change-alert/*.spec.ts`（`alert-generation.spec.ts`／`closed-dept-detection.spec.ts`／`org-change-alert.service.spec.ts`／`org-change-alert.controller.spec.ts`／`typeorm-org-change-alert.store.spec.ts`）：`DOCUMENT_FIELD`／`CLOSED_DEPT_PERSON` 兩既有 `alertKind` 之產生/去重/查詢/RBAC/稽核本體，及既有 `docs/specs/test-design/F006-test-design.md` 之 TS-F006-001~079 全數場景（已 int-verified）。
- `frontend/src/pages/OrgSyncPage.test.tsx`：頁籤/KPI/既有兩種提示卡渲染/RBAC 前端守門之既有場景。

本文件聚焦兩個縫隙，逐一給出資料/整合設計決策（第 1 節），再據此設計測試場景（第 3 節）：

| 縫隙 | F005 條文 | 短碼 |
|---|---|---|
| 資料不一致告警 | 「`EMPSTS='A'` 但 `RESIGNDT` 為過去日期之不一致資料…同步須容忍此不一致並記錄告警…不得因此中止同步」 | `INCON` |
| 逐帳號「消失」警告 | 「帳號未出現於本次來源查詢結果（消失）而非 `EMPSTS` 轉為離職…不停用該帳號並記錄警告」 | `VANISH` |

---

## 1. 設計決策（Design Decisions）

### D1 — 告警存放位置：**建議方案 (A) 擴充既有 `ORG_CHANGE_ALERT`**（★需人類裁定，見第 6.1 節）

> 任務要求本檔列出兩個方案、分析取捨、給出建議，並使測試設計不因人類最終選擇而整份作廢。以下為分析與建議。

**方案 (A)：重用 `ORG_CHANGE_ALERT`（F006 表），新增 `alertKind` 值**（`DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED`）。
**方案 (B)：獨立 F005 告警面（新表／新端點／新 UI）**，與文件影響類提示（F006）分開。

| 考量 | (A) 重用 ORG_CHANGE_ALERT | (B) 獨立 F005 告警面 |
|---|---|---|
| 既有 seam | `OrgSyncService` 已有 `OrgChangeAlertGenerator` 介面（`org-sync.types.ts`）＋**已在 `OrgSyncModule` 生產環境注入**（非僅測試替身）；`OrgSyncService.run()` 成功收尾後**已經**呼叫 `alerts.generateFromSyncPlan()`。(A) 只需在既有呼叫的輸入/輸出上加欄位。 | 需新增第二個 generator 介面＋在 `OrgSyncService` 建構子再掛一個選填相依，或讓既有 generator 介面身兼兩種語意（模糊化其單一職責） |
| Migration 成本 | 每筆既有欄位（`personEmployeeNo`/`personName`/`beforeValue`/`afterValue`/`status`/`resolvedBy`/`resolvedAt`/`createdAt`/`sourceSyncRunId`）**語意上皆可重用**；僅需 1 個新欄位（`accountLoginId`，見 D2）＋ 2 個 filtered unique index | 全新表（≥10 欄位）＋新 migration＋新 entity＋新 store 介面＋新 controller |
| API/端點 | 重用 `GET /admin/org-change-alerts`／`PATCH .../:id/resolve`（已有 RBAC／稽核／dedup 骨架） | 新端點（`GET/PATCH /admin/account-warnings/...` 或類似），需重新設計 RBAC decorator、稽核事件、dedup 機制 |
| 前端 UI | prototype 09「組織人員異動管理」頁「待確認異動」頁籤語意上**天然涵蓋**「本次同步後需人工複核的事」——離職資料完整性疑慮與文件受影響提示同屬此類；沿用既有頁籤/徽章/卡片骨架，僅需擴充卡片版式（見 D8） | 需在 prototype 08（帳號管理）或另闢新頁籤插入新 UI 區塊；prototype 現況兩頁皆**無**任何草稿或假資料可供對照（見 6.4），等同從零設計 UI |
| 使用者心智模型 | 單一「待確認」收件匣，管理員一處看完同步後所有需複核事項（含 F006 既有兩類＋本次兩類） | 概念上「F005 帳號完整性」與「F006 文件影響」分屬不同關注點，職責分離更純粹；但使用者需在兩處分別檢查，增加漏看風險 |
| 耦合風險 | `ORG_CHANGE_ALERT` 表隨時間演變為「同步後雜項待辦」的萬用桶，未來若 F005/F006 各自演化，schema 變更需協調雙方 | 完全解耦，F005 未來演化不受 F006 影響，反之亦然 |
| 實作/測試工作量 | 明顯較小（見下方測試場景數量對比） | 明顯較大（重造 dedup/RBAC/稽核/查詢/UI 骨架） |

**建議：採方案 (A)**。核心理由：現有程式碼已經把「同步完成後 → 產生待人工複核事項 → 單一待確認清單 → Route B 手動處理」這條路徑蓋好，且**已在生產環境接線**（非草稿）；F005 的這兩個缺口在語意上與 F006 的 `CLOSED_DEPT_PERSON`（同樣是「同步後全量掃描、產生人員層警示、不停用不覆寫、只能 Route B 處理」）幾乎同構，重造一套只會複製相同邏輯兩次。方案 (B) 的「關注點分離」優點是真實的，但在目前系統規模（單一「組織人員異動管理」頁面即涵蓋同步操作與其後續事項）下，使用者價值不足以抵銷重複建置的成本。

**降低人類裁定風險之參數化設計**：第 3 節之**偵測邏輯**（`detectDataInconsistencyAlerts`／`detectAccountDisappearedAlerts`，見 D3）為**純函式、不依賴任何持久化型別**，僅消費/產出與 `ORG_CHANGE_ALERT` 無關的中介資料結構（`AlertCreateCommand`-like 物件）。若人類最終裁定改採方案 (B)，第 3.2／3.3 節（純邏輯偵測，佔全部場景近半數）**可直接沿用**，僅第 3.1（schema）、3.4~3.7（服務整合/查詢/處理/稽核，綁定 `ORG_CHANGE_ALERT` 之 store/controller）、3.9（前端頁籤位置）需要依方案 (B) 之新端點/新表重寫。本文件在標題與段落中明確區分「與儲存位置無關」與「綁定方案 (A)」兩類場景，供改採方案 (B) 時精準辨識需重寫範圍。

### D2 — 新增欄位 `accountLoginId`（唯一需要的 schema 變更）

沿用方案 (A) 之既有欄位（`personEmployeeNo`/`personName`/`beforeValue`/`afterValue`/`status`/`resolvedBy`/`resolvedAt`/`createdAt`/`sourceSyncRunId`）**即足以承載**兩個新 `alertKind` 之顯示需求，**但去重（dedup）鍵不可沿用 `personEmployeeNo`**：

> 🔴 **F005 spec 明文警示**（Edge Cases）：「一人多帳號（實測 AS 在職 1,114 人對應 1,108 個相異員編）：停用以 `(COMPID, USERID)` 為單位逐帳號判定，**不以 `EMPNO` 連坐**」。本文件之兩個新告警類型皆是「**帳號**層級事件」（某帳號的資料矛盾／某帳號從來源消失），語意上必須以 `(companyCode, loginId)` 精確定位，而非 `employeeNo`（非唯一鍵，同一員編可能對應 ≥2 個帳號，用 `employeeNo` 去重會使其中一個帳號的告警被另一個帳號的既有 pending 列「頂替」而永遠不出現）。

**決策：新增欄位 `accountLoginId varchar(20) nullable`**（條件必填：`DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 時必填，其餘既有兩類仍為 `null`）。寬度比照 `ACCOUNT.loginId`（`varchar(20)`）。本 MVP 範圍僅同步單一公司 `COMPID='AS'`（見 spec-index 關鍵定案），`loginId` 本身即可作為去重鍵，不需併入 `companyCode`（與既有 `CLOSED_DEPT_PERSON` 之 `personEmployeeNo` 去重鍵之既有先例作法一致，僅將鍵改精確為 `loginId`）。

> ⚠ **附帶發現（既有程式碼觀察，非本次範圍需修正）**：`CLOSED_DEPT_PERSON` 現行以 `personEmployeeNo` 去重，理論上同樣受一人多帳號影響（若同一員編之兩個帳號皆掛於已關閉部門，只會產生一筆提示，另一帳號被靜默吞掉）。此為 F006 既有設計之潛在精度落差，**不在本 worktree 範圍內修正**（`org-change-alert` 模組本體屬 F006，已 ✅ 完成-已驗證），僅於第 6.2 節記錄供日後參考。

migration（**保留時間戳 `1723248000000`**，晚於本 worktree 現有最大值 `1723075200000`、亦不與 lifecycle track 之 `1723161600000` 衝突）：
```sql
ALTER TABLE [ORG_CHANGE_ALERT] ADD [accountLoginId] varchar(20) NULL;

CREATE UNIQUE INDEX [UQ_ORG_CHANGE_ALERT_login_inconsistency]
  ON [ORG_CHANGE_ALERT] ([accountLoginId])
  WHERE [status] = 'pending' AND [alertKind] = 'DATA_INCONSISTENCY';

CREATE UNIQUE INDEX [UQ_ORG_CHANGE_ALERT_login_disappeared]
  ON [ORG_CHANGE_ALERT] ([accountLoginId])
  WHERE [status] = 'pending' AND [alertKind] = 'ACCOUNT_DISAPPEARED';
```
兩個 filtered unique index **各自獨立**（非合併為一個涵蓋兩 `alertKind` 之索引）：兩類事件依資料語意互斥於同一次同步（見 D3 尾註），分開索引使測試/除錯時鍵之歸屬單純且與既有 `UQ_ORG_CHANGE_ALERT_doc_field`／`UQ_ORG_CHANGE_ALERT_person` 之「一 `alertKind` 一索引」風格一致。目標檔：`backend/src/database/migrations/1723248000000-org-sync-alert-account-login.ts`；同步擴充 `backend/src/database/entities/org-change-alert.entity.ts`（新增 `accountLoginId!: string | null` 欄位）。

`alertKind` 值域（`varchar(30)` 足以容納）：新增 `'DATA_INCONSISTENCY'`（19 字）／`'ACCOUNT_DISAPPEARED'`（20 字）。

### D3 — 偵測邏輯：觸發點、範圍與 `beforeValue`/`afterValue` 欄位重用語意

| 類型 | 偵測策略 | 資料來源 | 理由 |
|---|---|---|---|
| `DATA_INCONSISTENCY` | **全量掃描**（比照 F006 `CLOSED_DEPT_PERSON`）：每次同步完成後，對「本地目前 `status='active'` 之全部上游帳號」逐筆檢查 `resignDate !== null && resignDate < 本次同步 createdAt` | `OrgChangeAlertStore.listActiveAccounts()`（既有方法，**加寬**回傳型別 `ActiveAccountRef` 新增 `loginId`／`resignDate` 兩欄；底層 SQL 只需在既有 `select` 白名單多列 2 欄，`ACCOUNT` 表本身已有這兩欄，非新查詢） | 上游資料矛盾一旦寫入本地即**不會自行改變**（`RESIGNDT` 不隨後續同步之增量水位而重新出現於 `readAccountChanges` 之結果——見下方「持續性」說明），若僅在「本次異動列」中比對將導致同一筆矛盾資料只能被抓到一次；全量掃描確保只要矛盾未被人工處理／上游未修正，就持續可見（與 `CLOSED_DEPT_PERSON` 之「不變式檢查」哲學一致） |
| `ACCOUNT_DISAPPEARED` | **差異事件**：直接消費 `disappeared-threshold.ts::computeDisappeared()` 既有回傳之 `missingIds`（本次同步「先前在職、本次來源查無」之 `loginId` 清單） | `OrgSyncService.run()` 步驟 4（消失閾值保護）中已計算之 `disappeared` 區域變數；**目前 `missingIds` 無任何下游消費者**（唯一使用處是其自身單元測試），本設計是此欄位第一個實際用途 | 個別帳號之「消失」定義本身即是「與上次同步之差異」，天然是 diff-based；不需另外全量比對來源（源頭已由 `computeDisappeared` 算好） |

**整合點（沿用 F006 D2 之既有整合點，不新增掛載點）**：`OrgSyncService.run()` 於 `applySync()` 成功、`finishSyncRun()` 之後呼叫 `alerts.generateFromSyncPlan(syncInput)`——本設計僅將 `syncInput`（`SyncAlertInput`）多帶一個既有已算出的欄位：
```ts
// org-sync.types.ts SyncAlertInput 新增：
disappearedLoginIds: string[];  // ← disappeared.missingIds（run() 中既有變數，非新查詢）
```
`OrgChangeAlertService.generateFromSyncPlan()` 內在既有兩個偵測呼叫（`generateDocumentFieldAlerts`／`detectClosedDeptAlerts`）之外，新增兩個純函式呼叫（`detectDataInconsistencyAlerts`／`detectAccountDisappearedAlerts`），四者輸出之 `AlertCreateCommand[]` 合併後一次 `insertMany`（沿用既有合併寫入模式，`org-change-alert.service.ts:107`）。

**`beforeValue`/`afterValue` 欄位重用（不新增欄位）**：F006 D1 原將此二欄定義為「`alertKind=DOCUMENT_FIELD` 時使用」。本設計**擴大**其適用範圍為「任何需要一句話『異動前→異動後』事實快照的 `alertKind`」：
- `DATA_INCONSISTENCY`：`beforeValue='EMPSTS=A（在職）'`、`afterValue='RESIGNDT={YYYY-MM-DD}（過去日期，與在職狀態矛盾）'`。
- `ACCOUNT_DISAPPEARED`：`beforeValue='上次同步：在職'`、`afterValue='本次同步來源查無此帳號（消失）'`。

**`deptOrgCode`/`deptName` 欄位重用（語意擴大，僅 `ACCOUNT_DISAPPEARED`）**：原僅 `CLOSED_DEPT_PERSON` 使用。本設計借用以顯示「消失前最後已知部門」（來自 `existingAcc.orgCode` 解析 `orgUnits`），便於管理員判斷是否為特定部門集體異常。`deptCloseDate` 對此類**恆為 `null`**（與「部門是否關閉」無關，語意不適用）。`DATA_INCONSISTENCY` **不**使用此三欄（矛盾與部門無關）。

**兩類事件之互斥性（供理解 D2 之獨立索引設計，非強制斷言）**：`DATA_INCONSISTENCY` 之全量掃描對象為 `status='active'` 帳號（即本次同步後仍視為在職者）；`ACCOUNT_DISAPPEARED` 之來源為「本次來源查無」之帳號。一個 `loginId` 若同時符合兩者條件（例如：本地既有 `resignDate` 為過去日期之帳號，其後又從來源消失），**兩筆各自獨立產生**（見 3.2/3.3 之跨情境獨立性場景），非本文件試圖以資料互斥去避免的情境——只是實務上多數情況下兩者不會同時發生。

### D4 — 去重（Dedup）鍵與「每日重新浮現」之刻意行為（★次要待確認事項，見第 6.1 節）

- 兩類皆以 `accountLoginId` 為自然鍵，`status='pending'` 範圍內唯一（同 D2 filtered index）。
- **與 `CLOSED_DEPT_PERSON` 之關鍵差異**：`CLOSED_DEPT_PERSON` 之底層事實（部門是否關閉）一旦成立通常不會逆轉，故 `resolved` 後鮮少真的再次產生（見 F006 TS-F006-029 之測試僅為理論邊界）。**本設計之兩類新告警則不然**：
  - `DATA_INCONSISTENCY` 之矛盾（`resignDate` 是否為過去日期）在**上游資料真正被修正之前恆為真**；若管理員以 Route B「標記無需變更」處理（語意＝「已知悉，非資料已修正」），**下次排程同步（每日 02:00）之全量掃描會再次命中同一帳號**，因去重僅擋「既有 `pending`」，`resolved` 列不擋。
  - `ACCOUNT_DISAPPEARED` 亦同：只要該帳號持續「本地在職、來源查無」，`computeDisappeared()` 每次同步都會將其計入 `missingIds`，`resolved` 後同樣會於下次同步再度浮現。
  - 此為**依 spec 逐字之刻意設計**（AC 僅要求「產生告警」「不中止同步」，未要求抑制重複浮現機制），非實作疏漏；但會造成管理員「每天看到同一筆『新』告警」之體驗落差，已列為第 6.1 節之次要待確認事項（是否需要「近 N 天內曾處理且情境不變則抑制」之時間窗機制）。

### D5 — 處理（Resolve）：僅 Route B，無 Route A

兩類皆無對應之「文件欄位實際更新」事件可作為自動解除訊號（不涉及任何 `ICSOP_DOCUMENT` 欄位），**比照 `CLOSED_DEPT_PERSON` 之既有先例**，僅能經既有 `PATCH /admin/org-change-alerts/:id/resolve`（Route B，預設 `resolutionKind='NO_CHANGE_NEEDED'`）人工解除。不新增端點、不新增 RBAC decorator。

### D6 — 稽核：修正既有 `writeAudit()` 之二元分支（發現的既有缺陷，本次必須一併修正）

`org-change-alert.service.ts::writeAudit()` 現況：
```ts
targetNumber: row.alertKind === 'DOCUMENT_FIELD' ? row.documentNumber : row.personEmployeeNo,
targetName:   row.alertKind === 'DOCUMENT_FIELD' ? row.affectedField : '掛於已關閉部門',
```
此二元運算子在僅有兩種 `alertKind` 時正確；**新增第三、四種後，`targetName` 會將 `DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 之稽核事件皆誤植為文字「掛於已關閉部門」**——稽核紀錄將永久記載錯誤的處理內容描述，屬必須修正之既有缺陷（由本次擴充揭露，非本次引入）。

**修正設計**：改為依 `alertKind` 完整分流（`switch`/查表，非三元運算子鏈）：

| alertKind | targetNumber | targetName |
|---|---|---|
| `DOCUMENT_FIELD` | `documentNumber`（既有不變） | `affectedField`（既有不變） |
| `CLOSED_DEPT_PERSON` | `personEmployeeNo`（既有不變） | `'掛於已關閉部門'`（既有不變） |
| `DATA_INCONSISTENCY` | **`accountLoginId`**（非 `personEmployeeNo`——見 D2 之精確定位理由） | `'資料不一致（EMPSTS/RESIGNDT）'` |
| `ACCOUNT_DISAPPEARED` | **`accountLoginId`** | `'帳號消失（來源查無）'` |

提示「產生」（pending 建立）延續既有原則**不**寫入 `AUDIT_LOG`（沿用 D6/F006 之既有理由：系統自動產生非調閱事件）。

### D7 — RBAC：不變

沿用既有 `FunctionKey.ORG_SYNC_MANAGEMENT` 矩陣（`SysAdmin`=CRUD、`ICSOPAdmin`=READ、其餘=NONE）。新 `alertKind` 之列與既有兩類共用同一查詢/處理端點，guard chain 不因 body 內容而分流，故本次無需新增 RBAC 測試邏輯，僅做輕量回歸確認（見 3.8）。

### D8 — 前端：`AlertCard` 二元分流需改為四路分流（既有程式碼缺陷，需一併修正）

`frontend/src/pages/OrgSyncPage.tsx::AlertCard()` 現況：
```tsx
const isDoc = alert.alertKind === 'DOCUMENT_FIELD';
// ... isDoc ? <DOCUMENT_FIELD 版式> : <視為 CLOSED_DEPT_PERSON 版式>
```
此布林分流在僅有兩種 `alertKind` 時等價於完整分流；新增兩種後，**`DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 的提示會被誤判為 `CLOSED_DEPT_PERSON` 版式渲染**（顯示「受影響情境：掛於已關閉部門」等錯誤文案、嘗試讀取不存在的 `deptCloseDate` 等）。**必須改為依 `alertKind` 之完整 switch/查表渲染**，本節同時是本次前端變更之核心設計要求，非僅新增功能。

**Prototype 落差聲明（比照 F006 R-4 之既有先例）**：`prototypes/09-org-sync-management.html` 之 `alerts` 假資料陣列**僅含 `DOCUMENT_FIELD` 情境**（`08-account-management.html` 亦未含任何組織同步告警元素），對 `DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED`（以及既有 `CLOSED_DEPT_PERSON`）皆無現成視覺規格可逐項對照。本文件依 AC 文字要求之**必要資訊內容**設計卡片斷言（存在性/文字/不含 before-after diff 版式/不含前往文件按鈕），**不**對精確像素/色彩/圖示做逐項比對——此為**已知 prototype 缺口**，需 UI/UX 於後續補一張 prototype 變體（第 6.4 節）。

卡片內容設計（供測試斷言依循）：

| 顯示欄位 | `DATA_INCONSISTENCY` | `ACCOUNT_DISAPPEARED` |
|---|---|---|
| 主要識別 | `accountLoginId` + `personName`（若有） | `accountLoginId` + `personName`（若有） |
| 情境標籤 | 「資料不一致」 | 「帳號消失」 |
| 內容 | `beforeValue` → `afterValue`（沿用既有 before/after diff 版式即可，語意仍是「一句事實→另一句事實」） | 同左 |
| 部門 | 不顯示（與部門無關） | `deptName`（`deptOrgCode`）── 消失前最後已知部門，若有 |
| 「前往當責設定」按鈕 | 不提供（無 `documentId`） | 不提供（無 `documentId`） |
| 「標記無需變更」按鈕 | 提供（write-only） | 提供（write-only） |

### D9 — Migration 與目標檔案配置

**Migration**：`backend/src/database/migrations/1723248000000-org-sync-alert-account-login.ts`（D2 內容）。

**既有檔案擴充**：
| 檔案 | 變更 |
|---|---|
| `backend/src/database/entities/org-change-alert.entity.ts` | 新增 `accountLoginId` 欄位 |
| `backend/src/org-change-alert/org-change-alert.types.ts` | `AlertKind` 新增兩值；`AlertRow`/`AlertCreateCommand` 新增 `accountLoginId`；`ActiveAccountRef` 新增 `loginId`/`resignDate`；新增 `DataInconsistencyDetectionInput`/`AccountDisappearedDetectionInput` |
| `backend/src/org-change-alert/typeorm-org-change-alert.store.ts` | `toRow()` 映射新欄位；`insertMany()` 帶入新欄位；`listActiveAccounts()` 之 `select` 白名單新增 `loginId`/`resignDate`（**同一查詢**，非新增查詢） |
| `backend/src/org-change-alert/org-change-alert.service.ts` | `generateFromSyncPlan()` 新增兩偵測呼叫＋`existingPendingLoginIds` 兩個獨立集合建構（沿用既有 `listByStatus('pending')` 之同一次呼叫結果篩選，非新查詢）；`writeAudit()` 改四路分流（D6） |
| `backend/src/org-sync/org-sync.types.ts` | `SyncAlertInput` 新增 `disappearedLoginIds` |
| `backend/src/org-sync/org-sync.service.ts` | `run()` 收尾組裝 `syncInput` 時多帶 `disappearedLoginIds: disappeared.missingIds` |
| `frontend/src/pages/OrgSyncPage.tsx` | `AlertCard` 改四路分流（D8） |
| `frontend/src/api/types.ts` | `AlertKind` 新增兩值；`OrgChangeAlertView` 新增 `accountLoginId` |

**新增檔案**：
| 檔案 | 內容 |
|---|---|
| `backend/src/org-change-alert/data-inconsistency-detection.ts` | 純函式 `detectDataInconsistencyAlerts()`（比照 `closed-dept-detection.ts` 風格） |
| `backend/src/org-change-alert/data-inconsistency-detection.spec.ts` | 對應單元測試（3.2 節） |
| `backend/src/org-change-alert/account-disappeared-detection.ts` | 純函式 `detectAccountDisappearedAlerts()` |
| `backend/src/org-change-alert/account-disappeared-detection.spec.ts` | 對應單元測試（3.3 節） |
| `backend/test/int/org-sync-alerts.itest.ts` | 新 itest 檔（獨立於既有 `org-change-alert.itest.ts`，降低與 F006 既有整合測試檔案之合併衝突風險，比照 doc-seams worktree 之慣例：新縫隙用新 itest 檔） |

---

## 2. 測試策略

- **[unit]**：兩個新純函式（`detectDataInconsistencyAlerts`／`detectAccountDisappearedAlerts`）採假輸入直接呼叫，比照 `closed-dept-detection.spec.ts` 之 builder 慣例（`account()`/`unit()`/`input()` 工廠函式）；服務層（`generateFromSyncPlan` 混合四類、`writeAudit` 四路分流）以假 `OrgChangeAlertStore` 驗證；`OrgSyncService` 整合點以既有 `org-sync-alert-integration.spec.ts` 之 Fake 慣例延伸驗證 `disappearedLoginIds` 正確傳遞。
- **[integration]**（`backend/test/int/org-sync-alerts.itest.ts`，`npm run test:int`，本輪**不執行**）：migration 真實建表/索引、兩類告警之真實 round-trip、跨兩次同步之去重（真實 DB 唯一索引與服務層邏輯雙重驗證）、resolve 之真實稽核寫入內容正確性（驗證 D6 修正在真實堆疊下生效）、RBAC 403 邊界回歸。
- **[frontend]**（Vitest + RTL，`OrgSyncPage.test.tsx` 擴充）：`AlertCard` 四路分流正確性（含防止新類型被誤判為 `CLOSED_DEPT_PERSON` 版式之退化測試）、卡片內容存在性、write-only 按鈕、徽章計數含新類型。

### 測試替身契約（新增部分；既有 `FakeOrgChangeAlertStore` 等見 F006-test-design.md §2）

```ts
// ActiveAccountRef 加寬（既有介面，兩個新欄位）
interface ActiveAccountRef {
  employeeNo: string | null;
  name: string | null;
  orgCode: string | null;
  status: 'active' | 'disabled';
  loginId: string;          // 新增
  resignDate: Date | null;  // 新增
}

interface DataInconsistencyDetectionInput {
  activeAccounts: ActiveAccountRef[];
  existingPendingLoginIds: Set<string>;
  createdAt: Date;
  sourceSyncRunId: string | null;
}

interface AccountDisappearedDetectionInput {
  disappearedLoginIds: string[];
  existingAcc: Map<string, ExistingAccount>;   // 既有型別（change-classification.ts）
  orgUnits: Map<string, OrgUnitSnapshot>;      // 既有型別（org-change-alert.types.ts）
  existingPendingLoginIds: Set<string>;
  createdAt: Date;
  sourceSyncRunId: string | null;
}
```

---

## 3. Test Scenarios

### 3.1 Migration 與 Schema（★方案 (A) 綁定；方案 (B) 需改寫）

#### TS-ORGALERT-001 Migration 新增 `accountLoginId` 欄位與兩個 filtered unique index [integration]
- **Given**：已跑至 `1723075200000` 之 SOP schema
- **When**：執行 `1723248000000-org-sync-alert-account-login.ts`
- **Then**：`ORG_CHANGE_ALERT.accountLoginId` 欄位存在（`varchar(20)`, nullable）；`UQ_ORG_CHANGE_ALERT_login_inconsistency`／`UQ_ORG_CHANGE_ALERT_login_disappeared` 兩索引存在
- 對應：D2 ／ 目標檔：`backend/test/int/org-sync-alerts.itest.ts`

#### TS-ORGALERT-002 filtered unique index 阻擋重複 pending（`DATA_INCONSISTENCY`） [integration]
- **Given**：已有一筆 `alertKind='DATA_INCONSISTENCY', accountLoginId='zzint-x1', status='pending'`
- **When**：插入另一筆相同 `accountLoginId`、同 `alertKind`、`status='pending'`
- **Then**：違反 unique constraint，插入失敗
- 對應：D2 ／ 目標檔：同上

#### TS-ORGALERT-003 filtered unique index 阻擋重複 pending（`ACCOUNT_DISAPPEARED`） [integration]
- **Given**：已有一筆 `alertKind='ACCOUNT_DISAPPEARED', accountLoginId='zzint-x1', status='pending'`
- **When**：插入另一筆相同鍵、同 `alertKind`、`status='pending'`
- **Then**：插入失敗
- 對應：D2 ／ 目標檔：同上

#### TS-ORGALERT-004 相同 `accountLoginId`、不同 `alertKind` 同時 pending → 兩者皆允許（索引各自獨立） [integration]
- **Given**：`accountLoginId='zzint-x1'` 已有一筆 `DATA_INCONSISTENCY` pending
- **When**：插入 `accountLoginId='zzint-x1'`、`alertKind='ACCOUNT_DISAPPEARED'`、`status='pending'`
- **Then**：插入成功（兩索引各自僅限定自身 `alertKind`，互不阻擋，對應 D3 尾註之「兩類各自獨立」）
- 對應：D2、D3 ／ 目標檔：同上

#### TS-ORGALERT-005 同鍵但既有列為 `resolved` → 允許新增 `pending`（歷史多筆） [integration]
- **Given**：`accountLoginId='zzint-x1'`、`alertKind='DATA_INCONSISTENCY'` 已有一筆 `resolved`
- **When**：插入同鍵新一筆 `pending`
- **Then**：插入成功（filtered index 僅限定 `status='pending'`）
- 對應：D2、D4（每日重新浮現之底層機制） ／ 目標檔：同上

### 3.2 資料不一致偵測 `detectDataInconsistencyAlerts`（★純邏輯，與儲存方案無關）

#### TS-INCON-001 在職帳號之 `resignDate` 為過去日期 → 產生 `DATA_INCONSISTENCY` [unit]
- **Given**：`ActiveAccountRef{loginId:'u1', employeeNo:'E001', name:'王小明', status:'active', resignDate: 2024-12-31}`；`createdAt`（本次同步時間）晚於該日期
- **When**：`detectDataInconsistencyAlerts()` 執行
- **Then**：產生一筆 `{alertKind:'DATA_INCONSISTENCY', accountLoginId:'u1', personEmployeeNo:'E001', personName:'王小明', status:'pending'}`；`documentId`/`affectedField`/`deptOrgCode`/`deptName`/`deptCloseDate` 皆為 `null`
- 對應 F005 AC「產生資料不一致告警」／ 目標檔：`backend/src/org-change-alert/data-inconsistency-detection.spec.ts`

#### TS-INCON-002 `beforeValue`/`afterValue` 內容正確（含矛盾日期） [unit]
- **Given**：同上，`resignDate=2024-12-31`
- **When**：執行
- **Then**：`beforeValue` 含「EMPSTS=A」或「在職」字樣；`afterValue` 含日期子字串 `2024-12-31` 與「過去日期」或「矛盾」字樣
- 對應：D3（欄位重用內容） ／ 目標檔：同上

#### TS-INCON-003 `resignDate=null`（哨兵已由 normalization 收斂） → 不產生 [unit]
- **Given**：`resignDate: null`
- **When**：執行
- **Then**：不產生提示
- 對應：F005「`RESIGNDT='9999-12-31'`（正規化後為 null）→ 帳號維持啟用」之既有 AC，本場景驗證告警層亦一致不誤判 ／ 目標檔：同上

#### TS-INCON-004 `resignDate` 等於或晚於 `createdAt`（今天/未來） → 不視為過去，不產生（邊界） [unit]
- **Given**：`resignDate = createdAt`（同一時刻）
- **When**：執行
- **Then**：不產生（採嚴格早於 `createdAt` 之定義；本場景明確標記此邊界為設計假設，非逐字 AC 規則，見第 6.3 節）
- 對應：D3 邊界定義 ／ 目標檔：同上

#### TS-INCON-005 `resignDate` 早於 `createdAt` 一毫秒 → 產生（邊界另一側） [unit]
- **Given**：`resignDate = createdAt - 1ms`
- **When**：執行
- **Then**：產生提示
- 對應：D3 邊界定義（與 TS-INCON-004 成對驗證嚴格小於之正確實作） ／ 目標檔：同上

#### TS-INCON-006 `status='disabled'` 帳號 → 不產生（縱深防禦） [unit]
- **Given**：`ActiveAccountRef{status:'disabled', resignDate: 過去日期}`（理論上 `listActiveAccounts()` 之 SQL 查詢已篩 `status='active'`，本場景驗證函式本身之防禦性判斷）
- **When**：執行
- **Then**：不產生
- 對應：D3（僅在職者適用，比照 F005 spec 之「帳號之 `EMPSTS='A'`」限定詞） ／ 目標檔：同上

#### TS-INCON-007 既有 `pending` 同 `accountLoginId` → 不重複產生（去重） [unit]
- **Given**：`existingPendingLoginIds = Set(['u1'])`；情境同 TS-INCON-001
- **When**：執行
- **Then**：不產生（`insertMany` 呼叫端應收到空陣列或該筆被排除）
- 對應：D4 ／ 目標檔：同上

#### TS-INCON-008 既有同鍵已 `resolved`（不在 pending 集合） → 允許再次產生 [unit]
- **Given**：`existingPendingLoginIds = Set()`（該帳號前次已 `resolved`，故不在 pending 集合中）；情境同 TS-INCON-001
- **When**：執行
- **Then**：產生新一筆 `pending`
- 對應：D4（去重僅擋 pending，非永久排除） ／ 目標檔：同上

#### TS-INCON-009 連續兩次同步、情境未變（矛盾資料未被修正） → 每次全量掃描皆命中，但第二次因既有 pending 不重複建立 [unit]
- **Given**：第一次呼叫（`existingPendingLoginIds=Set()`）已產生 1 筆；第二次呼叫改帶 `existingPendingLoginIds=Set(['u1'])`
- **When**：分別執行兩次
- **Then**：第一次回傳 1 筆；第二次回傳空陣列（驗證「持續命中＋去重」而非「僅偵測一次」，仿 F006 TS-F006-027 之驗證精神）
- 對應：D3（全量掃描理由）、D4 ／ 目標檔：同上

#### TS-INCON-010 多名帳號同時符合 → 各自獨立產生多筆 [unit]
- **Given**：3 個不同 `loginId` 之帳號皆為 `resignDate` 過去日期
- **When**：執行
- **Then**：產生 3 筆，`accountLoginId` 分別對應
- 對應：批次正確性 ／ 目標檔：同上

#### TS-INCON-011 `employeeNo=null`（資料缺漏） → 仍正常產生，`personEmployeeNo=null` [unit]
- **Given**：`ActiveAccountRef{employeeNo:null, resignDate:過去日期}`
- **When**：執行
- **Then**：仍產生提示（本告警為**帳號層級**事件，不因員編缺漏而跳過——與人員層之 `CLOSED_DEPT_PERSON` 要求 `employeeNo` 存在之既有規則刻意不同，見 D2 之精確定位理由）；`personEmployeeNo` 為 `null`
- 對應：D2（帳號層 vs 人員層之區分） ／ 目標檔：同上

#### TS-INCON-012 同一帳號同時掛於已關閉部門且 `resignDate` 過去日期 → `DATA_INCONSISTENCY` 與 `CLOSED_DEPT_PERSON` 各自獨立產生（跨情境獨立性） [unit]
- **Given**：`loginId='u1'` 同時符合兩偵測函式之條件
- **When**：`detectDataInconsistencyAlerts()` 與 `detectClosedDeptAlerts()`（既有）分別執行（於 `generateFromSyncPlan()` 內皆被呼叫，見 3.4）
- **Then**：兩函式各自獨立產生一筆（`alertKind` 分別為 `DATA_INCONSISTENCY`／`CLOSED_DEPT_PERSON`），互不影響、互不阻擋（比照 F006 TS-F006-026 之「兩類提示各自獨立」精神延伸至第三類）
- 對應：D3 尾註 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`（跨函式場景，非單一偵測函式檔案）

#### TS-INCON-013 已 `resolved` 但底層 `resignDate` 未變 → 下次全量掃描再次產生（刻意行為，非 bug） [unit]
- **Given**：`existingPendingLoginIds=Set()`（已被人工 resolved，但帳號的 `resignDate` 欄位本身未被任何機制修改，仍是過去日期）
- **When**：執行
- **Then**：產生新一筆 `pending`（驗證 D4 所述「每日重新浮現」之底層機制正確運作，而非誤判為已解決便永久排除）
- 對應：D4（已於第 6.1 節列為待確認之產品體驗事項，本場景僅驗證機制本身正確） ／ 目標檔：同上

### 3.3 逐帳號消失偵測 `detectAccountDisappearedAlerts`（★純邏輯，與儲存方案無關）

#### TS-VANISH-001 `loginId` 出現於 `disappearedLoginIds` → 產生 `ACCOUNT_DISAPPEARED`，帶入既有快照 [unit]
- **Given**：`disappearedLoginIds=['u1']`；`existingAcc.get('u1') = {employeeNo:'E001', name:'王小明', orgCode:'JAC00', ...}`
- **When**：`detectAccountDisappearedAlerts()` 執行
- **Then**：產生 `{alertKind:'ACCOUNT_DISAPPEARED', accountLoginId:'u1', personEmployeeNo:'E001', personName:'王小明', status:'pending'}`；`documentId`/`affectedField` 為 `null`
- 對應 F005 AC「未出現於本次來源查詢結果（消失）…記錄警告」／ 目標檔：`backend/src/org-change-alert/account-disappeared-detection.spec.ts`

#### TS-VANISH-002 `beforeValue`/`afterValue` 內容正確 [unit]
- **Given**：同上
- **When**：執行
- **Then**：`beforeValue` 含「在職」字樣；`afterValue` 含「查無」或「消失」字樣
- 對應：D3 ／ 目標檔：同上

#### TS-VANISH-003 `deptOrgCode`/`deptName` 取自消失前最後已知部門 [unit]
- **Given**：`existingAcc.get('u1').orgCode='JAC00'`；`orgUnits.get('JAC00') = {name:'客服室', descFull:null, ...}`
- **When**：執行
- **Then**：`deptOrgCode='JAC00'`、`deptName='客服室'`；`deptCloseDate=null`（D3：對此類恆不適用）
- 對應：D3（欄位語意擴大） ／ 目標檔：同上

#### TS-VANISH-004 消失前所屬部門於本地亦查無（孤兒邊界） → `deptOrgCode` 仍填入代碼、`deptName` 退回 `null`（不臆測） [unit]
- **Given**：`existingAcc.get('u1').orgCode='ZZ999'`；`orgUnits` 無此鍵
- **When**：執行
- **Then**：`deptOrgCode='ZZ999'`、`deptName=null`
- 對應：既有孤兒帳號處理慣例延伸（比照 `alert-generation.ts` 之 `orgLabel` fallback 精神，但不臆測名稱） ／ 目標檔：同上

#### TS-VANISH-005 `existingAcc` 查無該 `loginId`（防禦性邊界） → 仍以最低限度資訊產生，不拋錯 [unit]
- **Given**：`disappearedLoginIds=['u-ghost']`；`existingAcc` 無此鍵（理論上不應發生，因 `missingIds` 衍生自同一 `existingAcc` 來源，僅為函式邊界防禦）
- **When**：執行
- **Then**：產生 `{accountLoginId:'u-ghost', personEmployeeNo:null, personName:null, deptOrgCode:null, deptName:null, ...}`，不拋例外
- 對應：防禦性設計 ／ 目標檔：同上

#### TS-VANISH-006 既有 `pending` 同 `accountLoginId` → 不重複產生 [unit]
- **Given**：`existingPendingLoginIds=Set(['u1'])`
- **When**：執行
- **Then**：不產生
- 對應：D4 ／ 目標檔：同上

#### TS-VANISH-007 既有同鍵已 `resolved` → 允許再次產生 [unit]
- **Given**：`existingPendingLoginIds=Set()`
- **When**：執行
- **Then**：產生新一筆
- 對應：D4 ／ 目標檔：同上

#### TS-VANISH-008 空 `disappearedLoginIds` → 回傳空陣列 [unit]
- **Given**：`disappearedLoginIds=[]`
- **When**：執行
- **Then**：`[]`
- 對應：正常路徑（多數同步無人消失） ／ 目標檔：同上

#### TS-VANISH-009 多人同時消失 → 各自獨立產生多筆 [unit]
- **Given**：`disappearedLoginIds=['u1','u2','u3']`
- **When**：執行
- **Then**：產生 3 筆，`accountLoginId` 分別對應
- 對應：批次正確性 ／ 目標檔：同上

#### TS-VANISH-010 `deptCloseDate` 恆為 `null`（不適用部門關閉日期語意） [unit]
- **Given**：任意情境（含消失前部門本身已被標記關閉）
- **When**：執行
- **Then**：`deptCloseDate` 恆為 `null`（此類提示之語意是「帳號消失」，非「部門關閉」；即使消失前部門恰好也已關閉，不與 `CLOSED_DEPT_PERSON` 混淆）
- 對應：D3（欄位語意邊界） ／ 目標檔：同上

#### TS-VANISH-011 已 `resolved` 但帳號持續消失（下次同步仍在 `missingIds`） → 再次產生（刻意行為） [unit]
- **Given**：`existingPendingLoginIds=Set()`；`disappearedLoginIds` 仍含該 `loginId`（因該帳號本地 `status` 從未被停用，`computeDisappeared()` 每次同步皆會重新計入，見 D4）
- **When**：執行
- **Then**：產生新一筆 `pending`
- 對應：D4 ／ 目標檔：同上

### 3.4 服務整合 `generateFromSyncPlan()` 混合四類（★方案 (A) 綁定）

#### TS-ORGALERT-010 一次呼叫同時產生四類提示，互不排擠 [unit]
- **Given**：輸入同時滿足 `DOCUMENT_FIELD`／`CLOSED_DEPT_PERSON`／`DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 四種觸發條件
- **When**：`generateFromSyncPlan()` 執行
- **Then**：`store.insertMany()` 收到之陣列含四種 `alertKind` 各至少一筆
- 對應：D3、D9 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`

#### TS-ORGALERT-011 `existingPendingLoginIds`（兩個獨立集合）正確自既有 `pending` 列依 `alertKind` 分流建立 [unit]
- **Given**：既有 pending 列：1 筆 `DATA_INCONSISTENCY`（`accountLoginId='u1'`）、1 筆 `ACCOUNT_DISAPPEARED`（`accountLoginId='u2'`）
- **When**：`generateFromSyncPlan()` 執行（不重新觸發 `u1`/`u2` 之情境）
- **Then**：`detectDataInconsistencyAlerts` 收到之 `existingPendingLoginIds` 含 `'u1'` 不含 `'u2'`；`detectAccountDisappearedAlerts` 收到之集合含 `'u2'` 不含 `'u1'`（兩集合不互相污染，亦不與既有 `existingPendingKeys`/`existingPendingEmployeeNos` 混淆）
- 對應：D9（服務層 wiring 正確性） ／ 目標檔：同上

#### TS-ORGALERT-012 `SyncAlertInput.disappearedLoginIds` 為空陣列（防禦性/首次同步） → `detectAccountDisappearedAlerts` 正常回傳空陣列，不拋錯 [unit]
- **Given**：`disappearedLoginIds=[]`
- **When**：`generateFromSyncPlan()` 執行
- **Then**：無 `ACCOUNT_DISAPPEARED` 提示產生，其餘三類不受影響
- 對應：正常路徑 ／ 目標檔：同上

#### TS-ORGALERT-013 `OrgSyncService.run()` 整合點：`syncInput.disappearedLoginIds` 正確等於 `disappeared.missingIds` [unit]
- **Given**：`FakeStore` 預先有 20 個在職帳號、來源僅回報其中 19 個在職（1 個消失，5% 閾值下方安全放行）
- **When**：`OrgSyncService.run('manual')` 執行完畢
- **Then**：`alerts.generateFromSyncPlan` 收到之 `SyncAlertInput.disappearedLoginIds` 恰為該消失之 1 個 `loginId`（延伸既有 `org-sync-alert-integration.spec.ts` 之 Fake 慣例）
- 對應：D3（整合點正確接線） ／ 目標檔：`backend/src/org-sync/org-sync-alert-integration.spec.ts`

#### TS-ORGALERT-014 消失閾值中止 → 不呼叫 `generateFromSyncPlan`（沿用既有行為，回歸） [unit]
- **Given**：消失比例超過閾值（既有 `org-sync-alert-integration.spec.ts` 情境）
- **When**：`run()` 執行
- **Then**：`alerts.calls` 為空（既有斷言不變；本場景僅確認新增 `disappearedLoginIds` 欄位之存在不改變此既有中止路徑）
- 對應：F005 AC「F004 觸發消失筆數閾值保護…本次不執行任何帳號停用」（延伸至「亦不產生任何告警」，因整批未套用） ／ 目標檔：同上

#### TS-ORGALERT-015 提示產生失敗（含新兩類邏輯拋錯）不使同步失敗，僅記警告 [unit]
- **Given**：`alerts.generateFromSyncPlan` 拋出例外（模擬新偵測邏輯之未預期錯誤）
- **When**：`run()` 執行
- **Then**：`res.status='success'`；`res.warnings` 含「提示」字樣（沿用既有非阻斷慣例，回歸延伸）
- 對應：既有非阻斷設計 ／ 目標檔：同上

#### TS-ORGALERT-016 `DATA_INCONSISTENCY` 情境下，帳號本身於同步後 `status` 仍為 `'active'`（不停用） [unit]
- **Given**：帳號 `resignDate` 為過去日期、`EMPSTS='A'`
- **When**：完整同步流程（`classifyAccount` → `applySync` → `generateFromSyncPlan`）執行
- **Then**：`plan.accountDisables` 不含該帳號（`classifyAccount` 對 `empActive=true` 之帳號本就不會產生 `disable`，本場景以 spy／實際 plan 內容驗證此既有正確行為在告警新增後仍成立，對應 F005 AC「帳號維持啟用」）
- 對應 F005 AC ／ 目標檔：`backend/src/org-sync/change-classification.spec.ts`（既有 spec 內確認回歸，不新增邏輯）或 `org-sync-alert-integration.spec.ts`

#### TS-ORGALERT-017 `ACCOUNT_DISAPPEARED` 情境下，該帳號於同步後 `status` 仍為 `'active'`（不停用） [unit]
- **Given**：帳號本地在職、本次來源查無
- **When**：完整同步流程執行
- **Then**：該帳號未出現於 `rawAccts`（未被 `readAccountChanges` 回報），故 `classifyAccount` 從未對其判定，`applySync` 不觸碰其 `status`（維持既有值 `active`）——本場景驗證「消失不停用」在告警機制加入後仍成立
- 對應 F005 AC「不停用該帳號並記錄警告」 ／ 目標檔：`backend/src/org-sync/org-sync-alert-integration.spec.ts`

### 3.5 查詢端點混合四類（★方案 (A) 綁定）

#### TS-ORGALERT-020 `GET /admin/org-change-alerts?status=pending` 回傳混合四種 `alertKind`，含 `accountLoginId` 欄位 [unit]
- **Given**：既有 4 筆，各 `alertKind` 一筆
- **When**：ICSOPAdmin 呼叫
- **Then**：回傳 4 筆，每筆含 `alertKind` 判別欄；`DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 兩筆之 `accountLoginId` 非 `null`，其餘兩筆為 `null`
- 對應：D9 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.controller.spec.ts`

#### TS-ORGALERT-021 `status=resolved` 查詢正確回傳新兩類之歷史列 [unit]
- **Given**：`DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 各 1 筆 `resolved`
- **When**：`GET ?status=resolved`
- **Then**：回傳含完整 `resolvedBy`/`resolvedAt`/`resolutionKind`
- 對應：既有查詢機制回歸 ／ 目標檔：同上

### 3.6 處理（Resolve，僅 Route B）（★方案 (A) 綁定）

#### TS-ORGALERT-030 `DATA_INCONSISTENCY` 提示可經 `PATCH .../resolve` 轉為 `resolved` [unit]
- **Given**：`pending` 提示 X（`alertKind='DATA_INCONSISTENCY'`）
- **When**：`PATCH /admin/org-change-alerts/X/resolve`（SysAdmin，無 body）
- **Then**：`status='resolved'`、`resolutionKind='NO_CHANGE_NEEDED'`、`resolvedBy`/`resolvedAt` 正確
- 對應：D5 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`

#### TS-ORGALERT-031 `ACCOUNT_DISAPPEARED` 提示可經 `PATCH .../resolve` 轉為 `resolved` [unit]
- **Given**：同上，`alertKind='ACCOUNT_DISAPPEARED'`
- **When**：同上
- **Then**：同上
- 對應：D5 ／ 目標檔：同上

#### TS-ORGALERT-032 兩類皆無 Route A 對應：任意 `DocumentChangedEvent` 不影響其狀態 [unit]
- **Given**：`DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 各 1 筆 `pending`
- **When**：任意文件欄位變更事件觸發 `OrgChangeAlertAutoResolveSubscriber`
- **Then**：兩筆皆不受影響、仍為 `pending`（延伸既有 TS-F006-049 邏輯至新兩類）
- 對應：D5 ／ 目標檔：`backend/src/org-change-alert/document-change-subscriber.spec.ts`

#### TS-ORGALERT-033 已 `resolved` 再次 `resolve` → 409（既有防重複邏輯回歸） [unit]
- **Given**：`DATA_INCONSISTENCY` 提示已 `resolved`
- **When**：再次 `PATCH .../resolve`
- **Then**：409 `ALERT_ALREADY_RESOLVED`
- 對應：既有機制不因新 `alertKind` 而失效 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`

### 3.7 稽核（含 D6 缺陷修正）（★方案 (A) 綁定；方案 (B) 需以其自身稽核事件重寫，但「targetName 需按 alertKind 精確分流」之原則不變）

#### TS-ORGALERT-040 Route B 解除 `DATA_INCONSISTENCY` → 稽核 `targetName` 正確為「資料不一致」相關文字，非誤植「掛於已關閉部門」 [unit]
- **Given**：ICSOPAdmin 呼叫 resolve 一筆 `DATA_INCONSISTENCY` 提示
- **When**：完成
- **Then**：`AuditWriter.recordAccess()` 收到之 `targetName` 為「資料不一致（EMPSTS/RESIGNDT）」（**非**「掛於已關閉部門」——本場景直接驗證 D6 所述既有二元運算子缺陷已修正）
- 對應：D6 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`

#### TS-ORGALERT-041 Route B 解除 `ACCOUNT_DISAPPEARED` → 稽核 `targetName` 正確為「帳號消失」相關文字 [unit]
- **Given**：同上，`alertKind='ACCOUNT_DISAPPEARED'`
- **When**：完成
- **Then**：`targetName='帳號消失（來源查無）'`
- 對應：D6 ／ 目標檔：同上

#### TS-ORGALERT-042 兩類之稽核 `targetNumber` 皆為 `accountLoginId`，非 `personEmployeeNo`（精確定位） [unit]
- **Given**：`DATA_INCONSISTENCY` 提示，`accountLoginId='u1'`、`personEmployeeNo='E001'`
- **When**：resolve
- **Then**：`targetNumber='u1'`（非 `'E001'`——刻意與 `CLOSED_DEPT_PERSON` 沿用 `personEmployeeNo` 之既有先例不同，理由見 D2）
- 對應：D2、D6 ／ 目標檔：同上

#### TS-ORGALERT-043 提示「產生」（pending 建立）本身仍不寫入 `AUDIT_LOG`（回歸延伸至新兩類） [unit]
- **Given**：同步產生 `DATA_INCONSISTENCY`/`ACCOUNT_DISAPPEARED` 新提示
- **When**：`generateFromSyncPlan()` 執行
- **Then**：`AuditWriter.recordAccess()` 全程未被呼叫
- 對應：既有 D6 原則（F006）延伸 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`

### 3.8 RBAC（回歸，沿用既有 D7）

#### TS-ORGALERT-050 新兩類提示之讀取/處理權限沿用既有矩陣（輕量回歸，非重新推導） [unit]
- **Given**：清單含新兩類 `alertKind`
- **When**：`ICSOPAdmin` 呼叫 `GET`（預期 200）、`PATCH .../resolve`（預期 403）；`DeptContact`／`Supervisor`／`User` 呼叫任一端點（預期 403）
- **Then**：結果與既有（不含新 `alertKind` 資料時）完全一致——guard chain 於 body/資料內容之前攔截，不因新增 `alertKind` 值而改變授權結果
- 對應：D7 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.controller.spec.ts`（延伸既有參數化案例，不新增矩陣邏輯）

### 3.9 前端 `OrgSyncPage.tsx` / `AlertCard`（★D8 之四路分流為本節核心）

#### TS-ORGALERT-060 `DATA_INCONSISTENCY` 卡片渲染專屬內容，且**不**誤用 `CLOSED_DEPT_PERSON` 版式 [frontend]
- **Given**：1 筆 `alertKind='DATA_INCONSISTENCY'` pending 提示（`accountLoginId`/`personName`/`beforeValue`/`afterValue` 皆有值）
- **When**：渲染於「待確認異動」頁籤
- **Then**：卡片顯示 `accountLoginId`、`beforeValue`→`afterValue`；**不**顯示「受影響情境：掛於已關閉部門」文字（防止既有二元 `isDoc` 分流退化將其誤判為 `CLOSED_DEPT_PERSON` 版式——此為本場景之核心防退化目的）
- 對應：D8 ／ 目標檔：`frontend/src/pages/OrgSyncPage.test.tsx`

#### TS-ORGALERT-061 `ACCOUNT_DISAPPEARED` 卡片渲染專屬內容（含消失前部門） [frontend]
- **Given**：1 筆 `alertKind='ACCOUNT_DISAPPEARED'` pending 提示，`deptName='客服室'`、`deptOrgCode='JAC00'`
- **When**：渲染
- **Then**：卡片顯示 `accountLoginId`、`beforeValue`→`afterValue`、「客服室（JAC00）」部門資訊
- 對應：D8 ／ 目標檔：同上

#### TS-ORGALERT-062 兩類卡片皆**不**提供「前往當責設定」按鈕（無 `documentId`） [frontend]
- **Given**：`DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 各 1 筆
- **When**：渲染（SysAdmin，可寫）
- **Then**：兩張卡片皆無「前往當責設定」按鈕（DOM 不存在）
- 對應：D5（無關聯文件） ／ 目標檔：同上

#### TS-ORGALERT-063 兩類卡片皆提供「標記無需變更」按鈕；ICSOPAdmin 唯讀時不存在於 DOM [frontend]
- **Given**：同上
- **When**：分別以 SysAdmin／ICSOPAdmin 渲染
- **Then**：SysAdmin 可見兩張卡片之按鈕；ICSOPAdmin 檢視時按鈕皆不存在於 DOM（既有 write-only 慣例延伸）
- 對應：D7、既有 RBAC DOM 安全性慣例 ／ 目標檔：同上

#### TS-ORGALERT-064 待確認頁籤徽章計數含新兩類（4 種混合時徽章＝全部 pending 加總） [frontend]
- **Given**：pending 清單含四種 `alertKind` 各 1 筆
- **When**：渲染
- **Then**：頁籤旁徽章顯示「4」（既有邏輯本就是 `alerts.length`，不論 `alertKind`；本場景明確驗證新增資料不破壞既有全量計數行為，防止未來誤加 `alertKind` 過濾條件）
- 對應：既有 badge 邏輯（F006）延伸驗證 ／ 目標檔：同上

#### TS-ORGALERT-065 四種 `alertKind` 混合清單同時渲染 → 各自對應正確版式，互不誤判 [frontend]
- **Given**：pending 清單含 `DOCUMENT_FIELD`／`CLOSED_DEPT_PERSON`／`DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 各 1 筆
- **When**：渲染
- **Then**：4 張卡片個別呈現各自對應內容（文件編號 vs 已關閉部門 vs 資料不一致 vs 帳號消失），無任何卡片顯示錯誤版式之欄位（本場景為 D8 四路分流之綜合防退化測試，覆蓋率上與 TS-ORGALERT-060/061 有重疊但額外驗證「混合渲染時」之正確路由，非僅單一類型獨立渲染時正確）
- 對應：D8 ／ 目標檔：同上

#### TS-ORGALERT-066 既有行為不受影響：空清單/KPI 降級/唯讀橫幅/`DOCUMENT_FIELD`與`CLOSED_DEPT_PERSON`卡片版式（回歸，簡短） [frontend]
- **Given**：既有 F006 情境（無新 `alertKind` 資料）
- **When**：渲染
- **Then**：既有 `OrgSyncPage.test.tsx` 全數既有斷言（TS-F006-059~075）依然通過（本場景僅為提醒/佔位，非新斷言——實際驗證＝既有測試檔案於本次擴充後重跑仍綠燈）
- 對應：回歸保證 ／ 目標檔：`frontend/src/pages/OrgSyncPage.test.tsx`（既有檔案）

### 3.10 整合測試（`backend/test/int/org-sync-alerts.itest.ts`）（★方案 (A) 綁定）

> Harness 擴充比照 F006 既有先例（見 F006-test-design.md §6.5）：**不**修改共用 `backend/test/int/harness.ts`，於本檔內自行定義 `cleanupOrgSyncAlertMarkers()`（`DELETE FROM ORG_CHANGE_ALERT WHERE accountLoginId LIKE 'zzint-%'`），因既有 `cleanupMarkers()` 之 `ORG_CHANGE_ALERT` 清理僅涵蓋 `documentId`／`personEmployeeNo LIKE 'ZZINTE%'` 兩條件，未涵蓋 `accountLoginId`。Marker：帳號沿用既有 `zzint-` 前綴（`MARK.acct`）。

#### TS-ORGALERT-070 `[int]` `DATA_INCONSISTENCY` 情境 round-trip：真實全量掃描 → pending 查詢含該筆、帳號仍 `active` [integration]
- **Given**：真實 marker 帳號 `zzint-orgsyncdi`，`status='active'`、`resignDate=2024-01-01`（過去日期）
- **When**：呼叫真實 `OrgChangeAlertService.generateFromSyncPlan()`（`listActiveAccounts()` 真實查詢命中該帳號）
- **Then**：`GET /admin/org-change-alerts?status=pending` 含 `accountLoginId='zzint-orgsyncdi'` 一筆；`ACCOUNT.status` 仍為 `'active'`（未被停用）
- 對應：F005 AC、D3 ／ 目標檔：`backend/test/int/org-sync-alerts.itest.ts`

#### TS-ORGALERT-071 `[int]` 兩次連續呼叫（情境不變） → 僅 1 筆 pending（服務層去重＋DB unique index 雙重驗證） [integration]
- **Given**：TS-ORGALERT-070 情境
- **When**：`generateFromSyncPlan()` 再呼叫一次（情境完全相同）
- **Then**：`ORG_CHANGE_ALERT` 該 `accountLoginId` 僅 1 筆 `pending`（若服務層去重失效，DB 唯一索引會使第二次呼叫拋錯而非靜默略過，本場景同時驗證兩層一致）
- 對應：D4 ／ 目標檔：同上

#### TS-ORGALERT-072 `[int]` `ACCOUNT_DISAPPEARED` 情境 round-trip [integration]
- **Given**：真實 marker 帳號 `zzint-orgsyncvan`，本地 `status='active'`
- **When**：以真實 `OrgChangeAlertService.generateFromSyncPlan()` 呼叫，`disappearedLoginIds=['zzint-orgsyncvan']`
- **Then**：pending 清單含該筆 `ACCOUNT_DISAPPEARED`；帳號 `status` 仍 `'active'`
- 對應：F005 AC、D3 ／ 目標檔：同上

#### TS-ORGALERT-073 `[int]` Resolve round-trip → 真實稽核事件 `targetName` 正確（驗證 D6 修正在真實堆疊生效） [integration]
- **Given**：TS-ORGALERT-070 之 pending 提示
- **When**：SysAdmin marker 帳號呼叫 `PATCH .../resolve`
- **Then**：`200`、`status='resolved'`；查詢 `AUDIT_LOG` 該筆 `targetType='ORG_CHANGE_ALERT'`、`targetName='資料不一致（EMPSTS/RESIGNDT）'`（非「掛於已關閉部門」）、`targetNumber='zzint-orgsyncdi'`
- 對應：D6 ／ 目標檔：同上

#### TS-ORGALERT-074 `[int]` RBAC 403 邊界（真實 guard chain） [integration]
- **Given**：marker `DeptContact` 帳號
- **When**：`PATCH /admin/org-change-alerts/{id}/resolve`（id 為任一新類型提示）
- **Then**：`403 PERMISSION_DENIED`
- 對應：D7 ／ 目標檔：同上

---

## 4. AC ↔ Test Scenario 對照表

| F005 條文（Acceptance Criteria / Edge Case） | 對應 TS |
|---|---|
| 「`EMPSTS='A'` 但 `RESIGNDT` 為過去日期…帳號維持啟用、產生資料不一致告警，且同步流程正常完成不中止」 | TS-INCON-001~013、TS-ORGALERT-010, 011, 016, 043, 070, 071, 073 |
| 「帳號未出現於本次來源查詢結果（消失）而非 `EMPSTS` 轉為離職…不停用該帳號並記錄警告」 | TS-VANISH-001~011、TS-ORGALERT-010, 011, 013, 017, 043, 072 |
| 「`RESIGNDT='9999-12-31'`…帳號維持啟用」（既有，回歸交叉確認告警層不誤判） | TS-INCON-003 |
| 「F004 觸發消失筆數閾值保護…本次不執行任何帳號停用」（既有，延伸確認亦不產生告警） | TS-ORGALERT-014 |
| 「一人多帳號…不以 `EMPNO` 連坐」（既有，延伸至告警去重鍵設計） | D2、TS-INCON-011、TS-ORGALERT-042 |

---

## 5. 自動化就緒度（Automation Readiness）

- **適合自動化**：全部 3.1–3.9 場景（unit/frontend，RTL 可斷言 DOM 存在性/文字/按鈕）；3.10 需真 SOP DB，僅 `npm run test:int` 執行，本輪**不執行**。
- **環境依賴**：3.1、3.10 全部場景需 host 可連 SOP。
- **決定性/可重現性**：`DATA_INCONSISTENCY` 之「過去日期」判定需注入固定 `createdAt`（沿用既有 `OrgSyncOptions.now`／`OrgChangeAlertService` 建構子之 `now: () => Date` 慣例），避免測試因執行時刻跨日而 flaky（尤其 TS-INCON-004/005 之邊界毫秒級斷言）。
- **人工項**：3.9 之精確視覺規格（見 D8 之 prototype 缺口）建議待 UI/UX 補一版 prototype 變體後，再補一輪像素級人工核對；本階段 RTL 僅斷言結構與文字內容存在性。

---

## 6. 風險、開放問題與需人類決策事項

### 6.1 需人類裁定事項

| ID | 問題 | 影響範圍 | 阻擋等級 |
|---|---|---|---|
| **OQ-ORGSYNC-01（★主要裁定項）** | 兩個新告警之存放位置：方案 (A) 擴充 `ORG_CHANGE_ALERT`（本文件建議）或方案 (B) 獨立 F005 告警面？ | D1 全節；決定第 3.1/3.4~3.7/3.9 節是否需依方案 (B) 改寫（3.2/3.3 純邏輯場景不受影響，見 D1 之參數化說明） | 🟡 中（有明確建議與理由，非阻擋起始開發，但正式定案前不宜合併至 main） |
| OQ-ORGSYNC-02 | `DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 之「每日重新浮現」現況（D4）是否符合產品預期，或需要「近 N 天內曾處理且情境不變則抑制」之時間窗機制？ | D4；若需抑制機制，`accountLoginId`-scoped dedup 需再加時間條件，屬新增邏輯（非本次範圍） | 🟢 低（不阻擋實作，現況為「安全但可能吵」，非「危險或遺漏」） |
| OQ-ORGSYNC-03 | 「過去日期」邊界定義：`resignDate` 恰為同步當下（`createdAt`）是否視為「過去」？現況（D3/TS-INCON-004）採**不**視為過去（嚴格早於） | TS-INCON-004/005 之 Then 走向 | 🟢 低（實務發生機率極低——`RESIGNDT` 為日期非時間戳，精確撞上同步瞬間之機率可忽略） |

### 6.2 既有程式碼發現（本次揭露，部分須修正、部分僅記錄）

- **R-1（須修正，D6）**：`OrgChangeAlertService.writeAudit()` 之 `targetName` 三元運算子在僅有兩種 `alertKind` 時正確，新增後會將 `DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 之稽核事件誤植文字「掛於已關閉部門」。**本次擴充必須一併修正**（TS-ORGALERT-040/041 為驗證此修正之測試）。
- **R-2（須修正，D8）**：`frontend/src/pages/OrgSyncPage.tsx::AlertCard` 之 `isDoc` 布林分流同理，新增後會將新兩類誤判為 `CLOSED_DEPT_PERSON` 版式渲染。**本次擴充必須一併修正**（TS-ORGALERT-060/065 為驗證此修正之測試）。
- **R-3（僅記錄，不修正）**：`CLOSED_DEPT_PERSON`（F006 既有）以 `personEmployeeNo` 去重，理論上受一人多帳號影響（同員編兩帳號皆掛已關閉部門時，只產生一筆）。此為 F006 既有設計之精度落差，F006 已 ✅ 完成-已驗證、不在本 worktree 範圍內修正，僅記錄供日後 F006 若有維護窗口時參考。

### 6.3 待確認假設（非阻擋，已於場景註記）

- TS-INCON-004/005 之「過去日期」嚴格邊界定義（`< createdAt` 而非 `<= createdAt`）為本文件之設計外推，F005 spec 原文僅用「過去日期」一詞，未逐字定義邊界。
- `deptOrgCode`/`deptName` 於 `ACCOUNT_DISAPPEARED` 之語意擴大重用（D3）為設計外推，非既有 `data-model.md` 逐字定義；此擴大不影響既有 `CLOSED_DEPT_PERSON` 之既有語意（純粹新增第二種消費情境）。

### 6.4 Prototype 與任務範圍之落差

- **R-4（延伸 F006 R-4 之既有落差）**：`prototypes/09-org-sync-management.html` 與 `08-account-management.html` 皆無任何 `DATA_INCONSISTENCY`／`ACCOUNT_DISAPPEARED` 之草稿或假資料可供對照（`08` 之 `alerts` 假資料陣列僅含既有 `DOCUMENT_FIELD` 一種情境）。本文件依 F005 AC 文字要求之必要資訊內容設計卡片斷言（3.9 節），**不**對精確視覺規格（版面、色彩、圖示、與既有「待確認」pill 是否需區分顏色以與文件類提示視覺區隔）做逐項比對。若產品/UI 需要更貼近最終視覺之驗收，建議先補一版 prototype 09 之卡片變體。

### 6.5 需協調之跨模組/跨 worktree 變更

- 無。本設計之全部異動落在既有 `org-sync`／`org-change-alert` 模組邊界內（本 worktree 之授權範圍），不需其他 worktree 配合。

### 6.6 其他觀察

- `disappeared-threshold.ts::computeDisappeared()` 之 `missingIds` 欄位自其實作（更早於本 worktree）存在起即無任何下游消費者（僅其自身單元測試使用）；本設計是此欄位第一個生產用途，屬「補完既有但未完全接線之計算結果」，非新增計算邏輯——與 `feature-status.md` 對 F005 之判定字面一致（「消失…記錄警告」之「警告」半句原本就有計算基礎，只是從未真正輸出給任何介面）。

---

## 7. Agent Loading Guide

| Agent Role | 建議載入檔案 |
|---|---|
| TDD Developer（backend，偵測邏輯） | 本檔第 1 節（D2/D3/D4）＋ 3.2/3.3 ＋ 4 |
| TDD Developer（backend，服務整合/稽核） | 本檔第 1 節（D5/D6/D9）＋ 3.4~3.7 |
| TDD Developer（frontend） | 本檔第 1 節（D8）＋ 3.9 ＋ `prototypes/09-org-sync-management.html`（含缺口聲明，6.4） |
| QA / Integration | 本檔 3.1/3.10 ＋ `backend/test/int/harness.ts`、`org-change-alert.itest.ts`（既有慣例參照） |
| Product / 決策者 | 第 6.1 節（★OQ-ORGSYNC-01 為主要裁定項）＋ 6.2（既有缺陷須修正說明） |
