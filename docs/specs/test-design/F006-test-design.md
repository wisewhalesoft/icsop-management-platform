---
type: test-design-feature
feature_id: F006
feature_name: 組織異動影響提示與異動管理後台
priority: P1
related_spec: docs/specs/features/F006-org-change-alert-backend.md
last_updated: 2026-07-24
status: draft
---

# F006：組織異動影響提示與異動管理後台 · Test Design

> source: `docs/specs/features/F006-org-change-alert-backend.md`、`prototypes/09-org-sync-management.html`（authoritative UI）、`docs/specs/upstream-person-org-source.md`、`docs/specs/data-model.md#orgchangealert-entity` · worktree: `icsop-f006-alerts`（branch `feature/f006-alerts`）· 2026-07-24

## 0. 範圍聲明

F006 現況為 **⬜ 未開始**（`feature-status.md`）；`backend/src/org-sync/` 僅有 F004 同步引擎（`OrgSyncService`/`change-classification`/`typeorm-org-sync.store`）與 `POST/GET admin/org-sync/{run,runs}` 兩端點，`frontend/src/pages/OrgSyncPage.tsx` 僅有同步狀態卡＋同步歷史表（其檔頭註解明講「總覽 KPI／待確認異動頁籤...尚未實作故未納入」）。因此本文件**不是「補缺口」型測試設計**，而是完整新 feature 設計：既有 `data-model.md#orgchangealert-entity` 只定義了「單一文件欄位異動」語意之 `ORG_CHANGE_ALERT`（`documentId` 標必填），**未涵蓋** F006 spec §7.3「掛於已關閉部門」之人員層提示情境——本文件第 1 節先給出資料/API 設計決策（含對既有 data-model 之必要擴充與理由），再據此設計測試場景。

不重新設計、直接沿用既有覆蓋範圍：F004 同步引擎本體（`org-sync.service.spec.ts`／`change-classification.spec.ts`／`normalization.spec.ts`／`disappeared-threshold.spec.ts` 等）、F025/F026 矩陣本體（`function-matrix.spec.ts`／`field-matrix.spec.ts`）、`RolePermissionGuard`／`SessionGuard` 本體、F023 `AuditWriter` 契約本體、F014 既有 create-side 邏輯。本文件僅設計「這些既有元件之上，F006 新增的部分」。

---

## 1. 設計決策（Design Decisions）

> 任務要求本檔自行決定持久化 schema 與 API 形狀（無既有實作可循）。以下決策為測試場景之依據；每項附理由，供實作端與人類決策者覆核。標示 **[需人類決策]** 者為本文件無法自行拍板之開放問題，另彙整於第 6 節。

### D1 — `ORG_CHANGE_ALERT` 採單表＋判別欄位（discriminator），不拆兩表

F006 spec 明確有兩種提示語意：
- **DOCUMENT_FIELD**：文件層欄位異動（當責室長-主要/次要、制定公司/部門/室別、使用部門）——`documentId` 必填。
- **CLOSED_DEPT_PERSON**（§7.3）：人員層提示（在職者掛於已關閉部門）——**不綁定任何特定文件**（Edge Case 明講此類提示與「該人員同時為某文件當責室長」之提示各自獨立）。

**決策：擴充既有 `ORG_CHANGE_ALERT` 為單表＋`alertKind` 判別欄位**，而非新建第二實體。

理由：
1. US-014 步驟 6「待確認異動頁籤：列出 `pending` 提示」與 prototype 09 之 `alertBadge`/`renderAlerts()` 皆要求**兩類提示合併於同一清單**（依 `createdAt` 排序呈現）；若拆兩表，查詢層仍須 `UNION`，並未省去複雜度。
2. `status`/`resolvedBy`/`resolvedAt`/`createdAt`/來源同步批次五個生命週期欄位在兩類間**完全相同**；拆表只會複製這五欄。
3. `data-model.md` 已將 `ORG_CHANGE_ALERT` 定義為一個實體，擴充（新增可空欄位＋判別欄）為 additive migration，較新增實體＋兩條查詢路徑改動更小。

擴充後欄位（**新增/變更處標粗體**；其餘沿用 `data-model.md#orgchangealert-entity`）：

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uniqueidentifier | 是 | 系統 UUID |
| **alertKind** | varchar(30) | 是 | `DOCUMENT_FIELD` \| `CLOSED_DEPT_PERSON`（判別欄，**新增**） |
| documentId | uniqueidentifier | **條件必填**（`alertKind=DOCUMENT_FIELD` 時必填，否則 null；**由「必填」改為條件必填**） | 受影響文件 |
| **documentNumber** | varchar(100) | 條件必填（同上） | 文件編號快照（**新增**，供清單/稽核顯示免 join，比照 `DOCUMENT_CHANGE_LOG.documentNumber` 之既有慣例） |
| affectedField | varchar(30) | 條件必填（同上） | **值沿用既有 `FieldKey`**（`backend/src/rbac/field-matrix.ts`）：`制定公司`/`制定部門`/`制定室別`/`當責室長-主要`/`當責室長-次要`/`文件使用部門`（重用既有列舉字串，不另造一套平行命名） |
| beforeValue / afterValue | nvarchar(200) / nullable | 否 | 顯示用文字快照（人員/組織顯示名稱，非 ID；`alertKind=DOCUMENT_FIELD` 時使用；`CLOSED_DEPT_PERSON` 不使用，資訊改存下列專屬欄位） |
| **personEmployeeNo** | varchar(20) | 條件必填（`alertKind=CLOSED_DEPT_PERSON` 時必填，否則 null） | 受影響人員員編（**新增**） |
| **personName** | nvarchar(30) | 條件必填（同上） | 人員姓名快照（**新增**） |
| **deptOrgCode** | varchar(10) | 條件必填（同上） | 已關閉部門代碼（**新增**） |
| **deptName** | nvarchar(100) | 條件必填（同上） | 已關閉部門名稱快照（**新增**） |
| **deptCloseDate** | datetime2 | 條件必填（同上） | 部門 `CLOSE_DATE`（**新增**） |
| status | varchar(20) | 是 | `pending` / `resolved` |
| **resolutionKind** | varchar(20) | 條件必填（`status=resolved` 時必填） | `FIELD_UPDATED`（Route A 自動）/ `NO_CHANGE_NEEDED`（Route B 手動）（**新增**，見 D4） |
| resolvedBy | uniqueidentifier | 否 | 處理者 `Account.id`（**由「處理者帳號」精確為 accountId**，供稽核 `actorId` 對齊） |
| resolvedAt | datetime2 | 否 | 處理時間 |
| createdAt | datetime2 | 是 | 產生時間 |
| **sourceSyncRunId** | uniqueidentifier | 是 | → `SYNC_RUN`（**新增**，追溯「此提示由哪次同步產生」，FK `ON DELETE SET NULL`） |

索引（見 D9 migration 草案）：`(status)`；filtered unique `(documentId, affectedField) WHERE status='pending' AND alertKind='DOCUMENT_FIELD'`（DB 層防重複，呼應 D3）；filtered unique `(personEmployeeNo) WHERE status='pending' AND alertKind='CLOSED_DEPT_PERSON'`。

> **[需人類決策 · 低阻擋]**：`data-model.md#orgchangealert-entity` 目前寫「`documentId` 必填」，與本擴充之「條件必填」不一致。因 `data-model.md` 屬凍結文件（任務指示不得修改共用 spec），本設計以此擴充作為**實作依據**，但建議請負責 spec 維運的角色事後同步更新 `data-model.md` 之措辭（非阻塞本 worktree 開發）。

### D2 — Alert generation 觸發點與比對範圍

**整合點**：`OrgSyncService.run()` 於 `applySync()` 成功、`finishSyncRun(status:'success')` 之後，呼叫新模組 `OrgChangeAlertService.generateFromSyncPlan(...)`（見 D9 目標檔案配置）。手動觸發（`POST run`）與每日排程（`ScheduledOrgSyncService.runScheduled()`）皆共用 `OrgSyncService.run()` 同一路徑，故此整合點**對兩種觸發方式自動一致生效**，無需額外接線。輸入資料**直接複用同步引擎已算出的物件**，不重新查庫：
- `orgUpdates: NormalizedOrgUnit[]` 配對 `existingOrg.get(orgCode)`（同步前快照）→ 組織單位變動 diff。
- `accountUpdates: NormalizedAccount[]` 配對 `existingAcc.get(loginId)`（同步前快照）→ 人員變動 diff。
- 同步後之全量在職帳號＋組織單位（`applySync` 完成後之當下狀態）→ §7.3 已關閉部門掃描。

**比對範圍（決策，需與人類確認範圍是否過寬/過窄，見第 6 節 OQ-F006-01）**：

| 提示類型 | 觸發訊號 | 比對對象 | 理由 |
|---|---|---|---|
| 制定公司/部門/室別、使用部門（DOCUMENT_FIELD） | `classifyOrgUnit()` 判定該 `orgCode` 為 `update`（**任何**既有比對欄位——`tier`/`codePrefix`/`parentCode`/`name`/`descFull`/`managerEmpNo`/`isActive`——改變即算） | 該 `orgCode` 是否等於任一文件之 `draftingCompanyId`/`draftingDeptId`/`draftingSectionId`/`usingDeptIds`（`DOC_USING_DEPT` 表） | spec AC2 用語為未加限定之「組織單位異動」，沿用既有已算好之 `update` 訊號，不另造更窄規則（避免無 spec 依據的自行收窄） |
| 當責室長-主要/次要（DOCUMENT_FIELD） | 該人員 `NormalizedAccount.orgCode` **相對於同步前 `ExistingAccount.orgCode` 改變**，且 `empActive=true`（非離職） | 該 `employeeNo` 是否等於任一文件之 `primaryChiefId` 或存在於其 `DOC_SECONDARY_CHIEF` | spec 步驟 1 原文「人員部門/**職級**異動（非離職）」——**「職級」在現行資料模型無任何欄位可承載**（見 D5 之資料缺口），故本設計僅能偵測「部門」異動之一半；刻意**不**對 `name`/`email`/`managerEmpNo(DIRECTOR)` 單獨變動觸發（噪音降低，spec 未要求） |
| 掛於已關閉部門（CLOSED_DEPT_PERSON，§7.3） | 每次同步完成後**全量掃描**（非僅本次變動列）：`Account.status='active'` 且其 `orgCode` 對應 `OrgUnit.isActive=false` | 全體在職帳號 | 此為「不變式檢查」而非「差異事件」——部門於某次同步關閉後，即使該人員本身未變動，只要提示尚未被處理就應持續可見；每次全量掃描搭配 D3 去重，冪等且不重複建立 |

### D3 — 去重（Dedup）鍵

- **DOCUMENT_FIELD**：自然鍵 `(documentId, affectedField)`。建立前查詢是否已存在 `status='pending'` 之同鍵列，存在則**略過**（不建立、不更新既有列）。
- **CLOSED_DEPT_PERSON**：自然鍵 `personEmployeeNo`。同上邏輯，對應 spec AC10 之字面情境。
- DB 層以 filtered unique index 為第二道防線（防同步併發下之競態；惟 `SYNC_RUN` 互斥鎖已保證同時最多一個 `running` 同步，此為縱深防禦而非必要條件）。

> **[需人類決策 · 中阻擋，OQ-F006-02]**：若同一 `(documentId, affectedField)` 在既有 `pending` 提示**尚未處理完**前**再度變動**（例：室長已從 A 轉調至 B、管理員尚未處理，室長又從 B 轉調至 C），本設計採「略過」策略——`afterValue` 停留在第一次變動時的快照（B），不會更新為最新值（C）。是否應改為「就地更新既有 pending 列之 `afterValue`／`updatedAt`」需產品決策；本文件依 spec 逐字（「不重複產生提示」）採最簡單之「略過」，並在 6.3 標記此為待確認假設。DOCUMENT_FIELD 之去重規則本身亦為**設計外推**（spec AC10 原文僅描述 CLOSED_DEPT_PERSON 情境）——見 6.3。

### D4 — 處理（Resolve）：Route A 自動 ／ Route B 手動

Spec 步驟 7「管理員更新欄位**或**標記已確認無需變更」對映兩條技術路徑：

- **Route A（`resolutionKind=FIELD_UPDATED`，自動）**：文件模組已存在 `DocumentChangePublisher` seam（`backend/src/documents/document-change-event.ts`），`DocumentsService.update()` 於欄位實際變更時會 `publish({changeType:'CONTENT', changes:[{field,oldValue,newValue}], actorId, occurredAt, ...})`。本設計新增一個訂閱者（`OrgChangeAlertAutoResolveSubscriber`），對 `changes[]` 中每一筆 `field` 若可對映至 `FIELD_KEY_BY_PROP`（`draftingCompanyId`/`draftingDeptId`/`draftingSectionId`/`primaryChiefId`）產生的 `FieldKey`，即在同一 `documentId` 下自動 resolve 對應 `pending` 列（`resolvedBy=event.actorId`、`resolvedAt=event.occurredAt`、`resolutionKind=FIELD_UPDATED`）。**此路徑不經過 `POST/PATCH .../resolve` 端點**，是 F014/F011 儲存動作的自動副作用。
  - **已知缺口**：`secondaryChiefIds`／`usingDeptIds`（`CHIEF_SECONDARY`／`USING_DEPTS`）**目前**於 `DocumentsService.update()` 開頭即被 `delete clean.secondaryChiefIds / delete clean.usingDeptIds` 剔除（原始碼註解：「編輯端多值持久化屬 F014 編輯頁範圍，本輪 create-side only」——即編輯頁**尚未支援**改寫這兩個多值欄位），故這兩類提示**目前無法**經 Route A 自動解除，只能靠 Route B 手動處理。見第 6 節風險。
  - **跨模組接線需求**：`documents.module.ts` 現況 `{ provide: DOCUMENT_CHANGE_PUBLISHER, useExisting: DocumentChangeLogPublisher }` 為**單一綁定**（F037 專用）。新增 F006 訂閱者需要一個 fan-out（`CompositeDocumentChangePublisher`），**改動範圍落在 `documents` 模組**（非本 worktree `org-sync`/`org-change-alert` 模組邊界），需與該模組owner協調（見第 6 節）。
- **Route B（`resolutionKind=NO_CHANGE_NEEDED` 為預設值，亦可顯式傳 `FIELD_UPDATED` 作為人工補登逃生口）**：新端點 `PATCH /admin/org-change-alerts/:id/resolve`，body `{ resolutionKind?: 'NO_CHANGE_NEEDED' | 'FIELD_UPDATED' }`（未帶時預設 `NO_CHANGE_NEEDED`，對映 prototype「標記無需變更」按鈕）。兩種 `alertKind` 皆可透過此端點手動解除（`CLOSED_DEPT_PERSON` 僅有此路徑，無 Route A）。

錯誤碼（新增，需請架構師補入 `error-handling.md`，本文件僅設計依據）：`ALERT_NOT_FOUND`（404，`id` 不存在）、`ALERT_ALREADY_RESOLVED`（409，對已 `resolved` 列再次呼叫）。

### D5 — 「職級異動」資料缺口（開放問題，非本設計可解）

Spec 原文（步驟 1）與 prototype 範例（「陳彥廷…職級異動：升任協理，待確認是否續任當責」）皆提及「職級」，但：
- `ACCOUNT` 實體（`data-model.md#account-entity`）與上游白名單 12 欄（`upstream-person-org-source.md`）**均無**職級/職稱欄位。
- `VW_HPMUSER` 白名單僅 `USERID/EMPNO/USERNM/COMPID/DEPTID/EMPSTS/DIRECTOR`（+ `EMAILADDR/RESIGNDT/HIREDT/MTDT`），無職級。

→ 本設計**僅能偵測部門異動（orgCode 改變）**，**無法**偵測純粹的職級/頭銜升遷（部門不變、僅職稱變動）。此為現行資料模型的結構性缺口，不是測試設計可以繞過的實作疏漏；列為 **[需人類決策 · 高阻擋，OQ-F006-03]**，見第 6 節。

### D6 — 稽核：擴充 `AuditWriter` 契約（additive，跨 worktree）

`audit.types.ts` 之 `AuditAccessEvent` 為鎖定聯集型別，但**先前已有 additive 先例**（F007 新增 `LIFECYCLE_DELETE` actionType，注入 `LifecycleAuditEvent` 而不改動既有變體）。本設計依同一模式新增：
- `AuditTargetType` 新增 `'ORG_CHANGE_ALERT'`。
- `AuditActionType` 新增 `'ALERT_RESOLVED'`。
- 新增 `OrgChangeAlertAuditEvent extends AuditEventBase { targetType:'ORG_CHANGE_ALERT'; actionType:'ALERT_RESOLVED' }`；`targetId=alertId`；不帶 `watermarkSnapshot`（非文件檢視/下載/列印動作）；`targetNumber`＝`documentNumber`（DOCUMENT_FIELD）或 `personEmployeeNo`（CLOSED_DEPT_PERSON）；`targetName`＝`affectedField` 顯示文字或「掛於已關閉部門」。
- **Route A（自動解除）與 Route B（手動解除）皆寫入此稽核事件**（`actorId` 對應觸發者：Route A 為原始 F014/F011 操作者、Route B 為呼叫 resolve 端點者）。
- **提示「產生」（pending 建立）不寫入 `AUDIT_LOG`**：`AUDIT_LOG` 依 `OQ-E07-02` 定案語意為「調閱事件」（誰看了什麼），系統自動產生的提示既非調閱也非文件欄位實際異動（不寫 `DOCUMENT_CHANGE_LOG`），比照 F005 帳號自動停用亦不寫 `AUDIT_LOG` 之既有慣例，維持一致性。
- **跨 worktree 影響**：`audit.types.ts` 為「audit worktree」2026-07-23 鎖定之契約檔（已合併入 main）；本設計之新增為 additive、不改既有欄位語意，理論風險低，但實際落地仍需與該模組協調排入。

### D7 — KPI（總覽頁籤）端點與 `SYNC_RUN` 必要擴充

Prototype 總覽頁籤 4 張 KPI 卡：新增人員／更新（部門/職級）／離職停用／當責待確認，文案「本月（`{YYYY-MM}`）累計異動分類統計」。

**發現：現有 `SYNC_RUN` 落地欄位不足以組出前 3 張卡。** `OrgSyncService.run()` 內部確有算出細分 `SyncStats{accountsCreated, accountsUpdated, accountsDisabled, ...}`，但 `finishSyncRun()`／`FinishSyncRunPatch` 只落地單一混合 `changeCount`（組織+帳號 create/update/disable 總和），**未持久化細分數字**。故需擴充：
- `SYNC_RUN` 新增欄位 `accountsCreated`／`accountsUpdated`／`accountsDisabled`（int，預設 0）。
- `FinishSyncRunPatch` 介面新增同名選填欄位；`OrgSyncService.run()` 呼叫 `finishSyncRun` 時一併帶入既有已算出之 `stats.accountsCreated/accountsUpdated/accountsDisabled`（不需新邏輯，只需把已算好的數字多存 3 欄）。

**新端點**：`GET /admin/org-sync/monthly-summary`（掛於既有 `OrgSyncController`，同一 `FunctionKey.ORG_SYNC_MANAGEMENT` 'read' 權限）：
```
{ month: 'YYYY-MM',
  newPersonCount: number,        // Σ accountsCreated，本月（Asia/Taipei）startedAt 之 SYNC_RUN
  updatedCount: number,          // Σ accountsUpdated
  departedDisabledCount: number, // Σ accountsDisabled
  pendingChiefAlertCount: number // COUNT(ORG_CHANGE_ALERT) status=pending AND affectedField IN (當責室長-主要, 當責室長-次要)
}
```
「本月」＝ Asia/Taipei 時區當月 1 日 00:00 起（比照 `OQ-NFR007b`／`OQ-E02-02` 既有 UTC+8 慣例）。

> **[需人類決策 · 中阻擋，OQ-F006-04]**：「當責待確認」卡之計數範圍是**僅當責室長類**（`當責室長-主要`+`當責室長-次要`）或**全部待確認提示**（含制定組織／使用部門／掛已關閉部門）？本設計依卡片文字字面（「當責」二字明確對應室長概念）採**前者（僅當責室長類）**，但這會導致此卡數字與頁籤旁 `alertBadge`（全部 `pending` 計數，見 prototype `renderAlerts()` 之 `alerts.filter(a=>a.status==='pending').length`）**不一致**——同一頁面兩處數字語意不同，容易被誤讀為 bug。需產品確認是否接受此落差，或統一為同一計數口徑。

### D8 — RBAC

沿用既有 `FunctionKey.ORG_SYNC_MANAGEMENT`（矩陣：SysAdmin=CRUD、ICSOPAdmin=READ、其餘=NONE），不新增功能列——prototype 側選單單一項「組織人員異動管理」涵蓋同步操作＋待確認異動頁籤，F025 矩陣亦僅一列。
- `GET /admin/org-change-alerts`、`GET /admin/org-sync/monthly-summary` → `@RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'read')`。
- `PATCH /admin/org-change-alerts/:id/resolve` → `@RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'write')`（僅 SysAdmin）。
- Route A（自動解除）**不**額外檢查 `ORG_SYNC_MANAGEMENT`：其權威授權來自 F014/F011 端點自身的 F026 欄位權限（僅 ICSOPAdmin 可寫文件欄位），系統自動連動解除是該次合法寫入的副作用，比照 F005 自動停用不要求觸發同步者具備「帳號管理」寫入權之既有先例。

### D9 — Migration 與目標檔案配置

**Migration**：`backend/src/database/migrations/1722816000000-org-change-alert.ts`（保留時間戳，晚於現有最大值 `1722729600000`）。內容：`ALTER TABLE SYNC_RUN ADD accountsCreated/accountsUpdated/accountsDisabled int DEFAULT 0`；`CREATE TABLE ORG_CHANGE_ALERT`（D1 全欄位）＋索引（`IX_ALERT_status`、filtered unique ×2、`IX_ALERT_sourceSyncRunId`）＋ FK `sourceSyncRunId → SYNC_RUN(id) ON DELETE SET NULL`、`documentId → ICSOP_DOCUMENT(id) ON DELETE CASCADE`（提示應隨文件刪除而消失；本專案文件目前無硬刪除路徑，此 FK 為防禦性設計）。

**新模組 `backend/src/org-change-alert/`**（比照既有 `org-sync/`/`org-directory/` 之純邏輯＋store 介面分層慣例）：
| 檔案 | 內容 |
|---|---|
| `org-change-alert.types.ts` | `AlertKind`/`AffectedField`/`ResolutionKind`/`AlertRow`/`OrgChangeAlertStore` 介面 |
| `alert-generation.ts` | 純函式：`generateDocumentFieldAlerts(orgUpdates, existingOrg, accountUpdates, existingAcc, documentIndex, existingPendingKeys) → AlertCreateCommand[]`（含 D3 去重） |
| `closed-dept-detection.ts` | 純函式：`detectClosedDeptAlerts(activeAccounts, orgUnitsById, existingPendingEmployeeNos) → AlertCreateCommand[]` |
| `org-change-alert.service.ts` | orchestrator：`generateFromSyncPlan()`（供 `OrgSyncService` 呼叫）、`listPending()`/`listResolved()`、`resolve()`、`monthlySummary()` |
| `org-change-alert.controller.ts` | `GET /admin/org-change-alerts`、`PATCH /admin/org-change-alerts/:id/resolve` |
| `document-change-subscriber.ts` | Route A：實作 `DocumentChangePublisher`，內部呼叫 `service.autoResolveFromDocumentChange()` |
| `typeorm-org-change-alert.store.ts` | 生產 store |
| `org-change-alert.module.ts` | DI wiring |

**既有檔案擴充**：`org-sync.types.ts`（`FinishSyncRunPatch` 新增 3 欄）、`org-sync.service.ts`（`run()` 收尾呼叫 `alertService.generateFromSyncPlan()`；`recentRuns`/`finishSyncRun` 呼叫點帶入新 3 欄）、`typeorm-org-sync.store.ts`（`finishSyncRun` SQL 落地新 3 欄、`listRecentRuns` 選讀）、`org-sync.controller.ts`（新增 `GET monthly-summary`）、`frontend/src/pages/OrgSyncPage.tsx`＋`frontend/src/pages/org-sync-view.ts`（頁籤/KPI/提示卡）、`frontend/src/api/endpoints.ts`＋`types.ts`（新端點型別）。
**跨模組（需協調，非本 worktree 邊界）**：`backend/src/documents/documents.module.ts`（`DOCUMENT_CHANGE_PUBLISHER` 改 fan-out）、`backend/src/audit/audit.types.ts`（D6 additive 擴充）。

---

## 2. 測試策略

- **[unit]**：純邏輯（`alert-generation.ts`／`closed-dept-detection.ts`／去重比對／KPI 月份範圍計算／`resolutionKind` 判定）注入假 store／假 clock，比照既有 `org-sync.service.spec.ts` 之 Fake 慣例；controller 層以假 `OrgChangeAlertService` 驗證 RBAC 標註與路由委派（比照 `org-sync.controller.spec.ts`）。
- **[integration]**（`backend/test/int/*.itest.ts`，`npm run test:int`，對真 SOP DB，本輪**不執行**）：Migration 真實建表＋索引生效、`ORG_CHANGE_ALERT` 真實 round-trip、跨兩次同步之去重（真實 DB 唯一索引與服務層邏輯雙重驗證）、RBAC 403 邊界（真實 guard chain）。
- **[frontend]**（Vitest + React Testing Library，`OrgSyncPage.test.tsx`）：頁籤切換與 badge、KPI 卡渲染、提示卡結構（before/after diff、待確認 pill、按鈕）、空清單、唯讀橫幅、`前往當責設定` 導頁、既有同步歷史表搬入頁籤後之回歸。

### 測試替身契約

```
FakeOrgChangeAlertStore {
  findPendingByDocFieldKey(documentId, affectedField): Promise<AlertRow | null>
  findPendingByEmployeeNo(employeeNo): Promise<AlertRow | null>
  insertMany(commands: AlertCreateCommand[]): Promise<void>
  listByStatus(status): Promise<AlertRow[]>
  findById(id): Promise<AlertRow | null>
  resolve(id, patch: {resolvedBy, resolvedAt, resolutionKind}): Promise<void>
  monthlyAccountStats(monthStart: Date): Promise<{created, updated, disabled}>
  pendingChiefAlertCount(): Promise<number>
}
FakeDocumentIndex {
  // 供 alert-generation 純函式比對用之輕量文件索引（非真實 DocumentsService）
  findByChief(employeeNo): Promise<{documentId, documentNumber, field: 'CHIEF_PRIMARY'|'CHIEF_SECONDARY'}[]>
  findByOrgField(orgCode): Promise<{documentId, documentNumber, field: 'ESTABLISH_COMPANY'|'ESTABLISH_DEPT'|'ESTABLISH_SECTION'|'USING_DEPTS'}[]>
}
```

---

## 3. Test Scenarios

### 3.1 持久化與 Migration

#### TS-F006-001 Migration 建立 `ORG_CHANGE_ALERT` 表與必要索引 [integration]
- **Given**：全新 SOP schema（或已跑至前一版本）
- **When**：執行 `1722816000000-org-change-alert.ts` migration
- **Then**：`ORG_CHANGE_ALERT` 表存在、含 D1 全部欄位；filtered unique index 存在且可用（下一場景驗證）；`SYNC_RUN` 新增三欄存在且預設值為 0
- 對應：D1、D7 ／ 目標檔：`backend/src/database/migrations/1722816000000-org-change-alert.ts`

#### TS-F006-002 filtered unique index 阻擋重複 pending（DOCUMENT_FIELD） [integration]
- **Given**：已有一筆 `alertKind=DOCUMENT_FIELD, documentId=X, affectedField='當責室長-主要', status='pending'`
- **When**：直接以 SQL 插入另一筆相同 `(documentId, affectedField)` 且 `status='pending'`
- **Then**：違反 unique constraint，插入失敗（DB 層防線）
- 對應：D3 ／ 目標檔：`backend/test/int/org-change-alert.itest.ts`

#### TS-F006-003 相同 `(documentId, affectedField)` 但 `status='resolved'` 不受 unique 限制 [integration]
- **Given**：已有一筆 `resolved` 之 `(X, '當責室長-主要')`
- **When**：插入新一筆 `pending` 之 `(X, '當責室長-主要')`
- **Then**：插入成功（filtered index 僅限定 `status='pending'`，允許同鍵歷史多筆）
- 對應：D1、D3 ／ 目標檔：`backend/test/int/org-change-alert.itest.ts`

#### TS-F006-004 `sourceSyncRunId` FK：來源 `SYNC_RUN` 被清除時提示不連帶刪除 [integration]
- **Given**：一筆提示之 `sourceSyncRunId` 指向某 `SYNC_RUN`
- **When**：（假設性維運操作）該 `SYNC_RUN` 列被刪除
- **Then**：`ORG_CHANGE_ALERT.sourceSyncRunId` 變為 `null`（`ON DELETE SET NULL`），提示本身不消失
- 對應：D1、D9 ／ 目標檔：`backend/test/int/org-change-alert.itest.ts`

### 3.2 提示產生 — 當責室長異動（DOCUMENT_FIELD）

#### TS-F006-005 主要室長之部門異動 → 產生「當責室長-主要」提示 [unit]
- **Given**：文件 D 之 `primaryChiefId='E001'`；同步中 `E001` 之 `NormalizedAccount.orgCode` 由 `'JAB00'` 變為 `'JAC00'`（`empActive=true`）
- **When**：`generateDocumentFieldAlerts()` 執行
- **Then**：產生一筆 `alertKind='DOCUMENT_FIELD', documentId=D, affectedField='當責室長-主要', status='pending'`
- 對應 AC1 ／ 目標檔：`backend/src/org-change-alert/alert-generation.spec.ts`

#### TS-F006-006 次要室長之部門異動 → 產生「當責室長-次要」提示 [unit]
- **Given**：文件 D 之 `DOC_SECONDARY_CHIEF` 含 `E002`；`E002` 部門異動
- **When**：執行
- **Then**：產生 `affectedField='當責室長-次要'` 一筆，`documentId=D`
- 對應 AC1（次要室長，spec 步驟 2 明列「主要/次要」）／ 目標檔：同上

#### TS-F006-007 一人身兼多份文件當責室長 → 各自獨立產生提示（Edge Case） [unit]
- **Given**：`E001` 同時為文件 D1（主要）與文件 D2（次要）之室長；`E001` 部門異動
- **When**：執行
- **Then**：產生兩筆獨立提示，`documentId` 分別為 D1、D2，`affectedField` 分別為對應值；兩筆可各自獨立處理（不互相影響 resolve）
- 對應：spec Edge Case「一人為多份文件當責室長」／ 目標檔：同上

#### TS-F006-008 人員異動但與任何文件當責欄位無關聯 → 不誤判產生提示（Edge Case） [unit]
- **Given**：`E999` 部門異動，但無任何文件之 `primaryChiefId`/`DOC_SECONDARY_CHIEF` 含 `E999`
- **When**：執行
- **Then**：不產生任何提示
- 對應：spec Edge Case「人員異動與該文件當責欄位無關聯」／ 目標檔：同上

#### TS-F006-009 室長本人姓名/Email 變動但部門未變 → 不產生提示 [unit]
- **Given**：`E001`（某文件主要室長）之 `name`/`email` 於同步中改變，`orgCode` 不變
- **When**：執行
- **Then**：不產生提示（D2 決策：僅偵測 `orgCode` 變動，姓名/Email 純更新非觸發訊號）
- 對應：D2 設計決策（噪音降低）／ 目標檔：同上

#### TS-F006-010 室長本人已離職（`empActive=false`）→ 不產生 F006 提示 [unit]
- **Given**：`E001`（某文件主要室長）本次同步 `empActive` 轉為 `false`（觸發 F005 停用路徑）
- **When**：執行 `generateDocumentFieldAlerts()`
- **Then**：不產生「當責室長」提示（spec 步驟 1「非離職」；離職走 F005 既有路徑，非 F006 職責）
- 對應：spec 步驟 1「非離職」／ 目標檔：同上

#### TS-F006-011 室長部門異動但目標部門與原部門僅代碼大小寫/空白差異 → 視同未變 [unit]
- **Given**：`existingAcc.orgCode='JAB00'`、`source.orgCode='JAB00'`（正規化後相同，經 `normalizeAccount` 已 trim）
- **When**：執行
- **Then**：不產生提示（`classifyAccount` 本已判為 `noop`，本場景驗證 alert-generation 正確依賴既有分類結果、不重複自行比對造成誤判）
- 對應：D2（重用既有分類訊號）／ 目標檔：同上

#### TS-F006-012 `beforeValue`/`afterValue` 快照為人員可讀部門名稱，非 orgCode [unit]
- **Given**：`E001` 由部門 `JAB00`（顯示名「車輛行銷室」）轉調至 `JAC00`（顯示名「客服室」）
- **When**：產生提示
- **Then**：`beforeValue` 含「車輛行銷室」可讀字串（比照 prototype 範例格式，非原始 `orgCode`）、`afterValue` 含「客服室」或等義敘述
- 對應 AC1（提示需可讀）、prototype 卡片顯示格式／ 目標檔：同上

#### TS-F006-013 移除全部次要室長後 `DOC_SECONDARY_CHIEF` 已空 → 該人員異動不再比對此文件 [unit]
- **Given**：文件 D 先前 `DOC_SECONDARY_CHIEF` 含 `E002`，現已被移除（F014 編輯，空集合）；`E002` 部門異動
- **When**：執行（文件索引反映移除後現況）
- **Then**：不產生 D 之提示（比對對象為「當下」關聯，非歷史關聯）
- 對應：F014 Edge Case「移除全部次要室長」之交互影響／ 目標檔：同上

### 3.3 提示產生 — 制定組織／使用部門異動（DOCUMENT_FIELD）

#### TS-F006-014 制定室別對應組織單位更名 → 產生「制定室別」提示 [unit]
- **Given**：文件 D 之 `draftingSectionId='JAC00'`；`JAC00` 之 `name` 由「企金室」變為「企業金融室」（`classifyOrgUnit`→`update`）
- **When**：`generateDocumentFieldAlerts()` 執行
- **Then**：產生 `affectedField='制定室別'` 一筆，`beforeValue`「企金室」→`afterValue`「企業金融室」（比照 prototype 範例）
- 對應 AC2 ／ 目標檔：同上

#### TS-F006-015 制定公司/制定部門異動 → 分別產生對應 `affectedField`（參數化，同理） [unit]
- **Given**：分別以 `draftingCompanyId`、`draftingDeptId` 對應組織單位發生 `update`
- **When**：執行
- **Then**：各自產生 `affectedField='制定公司'` / `'制定部門'` 一筆
- 對應 AC2 ／ 目標檔：同上

#### TS-F006-016 使用部門（多值）其中一個部門異動 → 產生「文件使用部門」提示 [unit]
- **Given**：文件 D 之 `DOC_USING_DEPT` 含 `{JAA00, JBB00}`；`JBB00` 發生 `update`
- **When**：執行
- **Then**：產生 `affectedField='文件使用部門'` 一筆，`documentId=D`（不因使用部門為多值而略過）
- 對應 AC2（涵蓋使用部門）／ 目標檔：同上

#### TS-F006-017 使用部門有多份文件共用同一部門 → 各文件各自獨立產生提示 [unit]
- **Given**：`JBB00` 為文件 D1、D2 之共同使用部門；`JBB00` 發生 `update`
- **When**：執行
- **Then**：產生兩筆獨立提示（`documentId` 分別 D1、D2）
- 對應：比照 3.2 之「多文件獨立」原則延伸至組織單位側／ 目標檔：同上

#### TS-F006-018 組織單位因 `CLOSE_DATE` 變為非在職 → 亦視為「組織單位異動」觸發文件提示 [unit]
- **Given**：文件 D 之 `draftingDeptId` 對應部門本次同步 `isActive` 由 `true` 轉 `false`
- **When**：執行
- **Then**：產生 `affectedField='制定部門'` 提示（D2 決策：`isActive` 翻轉亦屬 `classifyOrgUnit` 之 `update` 訊號，一併觸發；比 §7.3 更即時地提醒「制定部門已關閉」）
- 對應：D2 設計決策 ／ 目標檔：同上

#### TS-F006-019 組織單位新增（`create`，非 `update`）→ 不觸發任何提示 [unit]
- **Given**：某 `orgCode` 為本次同步新建（`classifyOrgUnit`→`create`），恰巧與某文件 `usingDeptIds` 值相同（理論邊界，非真實情境）
- **When**：執行
- **Then**：不產生提示（僅 `update` 訊號觸發，`create` 無「異動前」可比較）
- 對應：D2（訊號邊界防呆）／ 目標檔：同上

#### TS-F006-020 部門主管（`managerEmpNo`）改派但文件當責室長非該主管 → 僅觸發「組織單位異動」不觸發「當責室長」 [unit]
- **Given**：文件 D 之 `draftingSectionId` 部門 `managerEmpNo` 由 `E010` 改為 `E020`；文件 D 之 `primaryChiefId='E099'`（非 E010 亦非 E020）
- **When**：執行
- **Then**：因 `draftingSectionId` 命中，產生 `affectedField='制定室別'` 一筆；**不**產生「當責室長」提示（D2 決策：室主管改派不等同該文件室長異動，除非室長本人 `orgCode` 變動）
- 對應：D2 設計決策之邊界（澄清「室主管改派」與「當責室長異動」為兩個獨立訊號）／ 目標檔：同上

### 3.4 提示產生 — 掛於已關閉部門（CLOSED_DEPT_PERSON，§7.3）

#### TS-F006-021 在職者所屬部門 `CLOSE_DATE` 已過 → 產生「掛於已關閉部門」提示 [unit]
- **Given**：`Account{employeeNo:'E777', status:'active', orgCode:'JAD00'}`；`OrgUnit{orgCode:'JAD00', isActive:false}`（`CLOSE_DATE` 為過去日期、非哨兵）
- **When**：`detectClosedDeptAlerts()` 執行（同步完成後全量掃描）
- **Then**：產生 `alertKind='CLOSED_DEPT_PERSON', personEmployeeNo='E777', deptOrgCode='JAD00', deptCloseDate=<實際日期>, status='pending'`；`documentId`/`affectedField` 為 `null`
- 對應 AC8 ／ 目標檔：`backend/src/org-change-alert/closed-dept-detection.spec.ts`

#### TS-F006-022 提示內容含部門代碼、名稱與關閉日期（AC8 顯示完整性） [unit]
- **Given**：同上，`OrgUnit.name='已裁撤室'`
- **When**：執行
- **Then**：`deptName='已裁撤室'`、`deptOrgCode='JAD00'`、`deptCloseDate` 為實際 `CLOSE_DATE` 值，皆非 null
- 對應 AC8 逐字要求（「含部門代碼／名稱與關閉日期」）／ 目標檔：同上

#### TS-F006-023 哨兵值 `9999-12-31` 不視為已關閉 → 不產生提示 [unit]
- **Given**：`OrgUnit.isActive=true`（來自 `CLOSE_DATE=9999-12-31` 正規化結果，`isDeptActive()` 判定為在職）
- **When**：執行
- **Then**：不產生提示
- 對應 AC8（僅真實過期日期觸發，非哨兵）／ 目標檔：同上

#### TS-F006-024 已停用（離職）帳號掛於已關閉部門 → 不產生提示 [unit]
- **Given**：`Account{status:'disabled'}` 掛於 `isActive:false` 部門
- **When**：執行
- **Then**：不產生提示（僅 `status='active'` 之在職者符合 §7.3 情境；已離職者由 F005 既有路徑處理，非本情境對象）
- 對應 AC8「某在職者（`EMPSTS='A'`）」之限定詞／ 目標檔：同上

#### TS-F006-025 帳號維持啟用、不觸發 F005 停用 [unit]
- **Given**：TS-F006-021 情境
- **When**：`generateFromSyncPlan()` 完整執行（含此偵測）
- **Then**：`Account.status` 仍為 `active`；未呼叫任何帳號停用相關 store 方法（以假 store spy 驗證 `disableAccount`/`applySync` 之 `accountDisables` 未含此人）
- 對應 AC9 ／ 目標檔：`backend/src/org-change-alert/closed-dept-detection.spec.ts`、`backend/src/org-sync/org-sync-alert-integration.spec.ts`

#### TS-F006-026 掛已關閉部門者同時為某文件當責室長 → 兩類提示各自獨立產生（Edge Case） [unit]
- **Given**：`E777` 掛於已關閉部門 `JAD00`，且同時為文件 D 之主要室長（`E777` 本身 `orgCode` 相對於**上次同步**未變——純粹部門後來被關閉，非本人轉調）
- **When**：`generateFromSyncPlan()` 執行（涵蓋 DOCUMENT_FIELD 與 CLOSED_DEPT_PERSON 兩條產生邏輯）
- **Then**：產生兩筆獨立提示：一筆 `CLOSED_DEPT_PERSON`（`personEmployeeNo='E777'`）、一筆 `DOCUMENT_FIELD`（`documentId=D, affectedField='制定室別'` 或視觸發訊號而定，若文件之制定組織恰為該關閉部門）；兩筆可分別處理，互不阻塞
- 對應：spec Edge Case「掛已關閉部門之在職者同時為某文件當責室長」／ 目標檔：`backend/src/org-change-alert/closed-dept-detection.spec.ts`

#### TS-F006-027 全量掃描對「本次同步未變動」但仍在職掛於已關閉部門者持續可見（非僅差異事件） [unit]
- **Given**：`E777` 於前次同步已被關閉部門（提示已建立、`pending`）；本次同步 `E777` 本身欄位無任何變動，其部門 `isActive` 亦維持 `false`（未變動）
- **When**：本次同步之全量掃描執行
- **Then**：掃描仍命中 `E777`（因採全量掃描而非差異事件），但因 D3 去重（既有 `pending` 同員編）**不建立第二筆**——本場景驗證「持續命中＋去重」兩者皆正確運作，而非「只在變動當下才檢查一次」
- 對應：D2「全量掃描」設計理由、AC10 ／ 目標檔：`backend/src/org-change-alert/closed-dept-detection.spec.ts`

### 3.5 去重（Dedup）

#### TS-F006-028 連續兩次同步皆偵測到同一人掛已關閉部門且提示未處理 → 不產生重複提示 [unit]
- **Given**：第一次同步已產生 `E777` 之 `pending` 提示；第二次同步再次掃描到同一情境（提示仍 `pending`，未被處理）
- **When**：第二次同步之 `detectClosedDeptAlerts()` 執行
- **Then**：`insertMany` 未被呼叫（或呼叫時傳入空陣列），既有 `pending` 提示筆數維持 1
- 對應 AC10（逐字）／ 目標檔：`backend/src/org-change-alert/closed-dept-detection.spec.ts`

#### TS-F006-029 提示已被處理（`resolved`）後、同一人再次符合情境 → 允許產生新提示 [unit]
- **Given**：`E777` 前次提示已 `resolved`；本次同步該人仍在職且部門仍非活躍（例如管理員誤判「無需變更」後情況未改善，或另一輪關閉）
- **When**：執行
- **Then**：允許建立新一筆 `pending`（去重僅排除「同鍵且 `status=pending`」，不排除歷史 `resolved` 列）
- 對應：D3 去重定義（僅擋 pending 重複，非永久排除）／ 目標檔：同上

#### TS-F006-030 DOCUMENT_FIELD 去重：同文件同欄位已有 pending → 略過（設計外推，見 OQ-F006-02） [unit]
- **Given**：文件 D 之「當責室長-主要」已有一筆 `pending`；室長本人在**尚未處理**期間再度轉調
- **When**：執行
- **Then**：依 D3 現行設計，不建立第二筆（`afterValue` 停留第一次快照）——本場景明確標記其正確性繫於 OQ-F006-02 之決策，若日後改為「就地更新」需重寫本場景之 Then
- 對應：D3（設計外推部分）／ 目標檔：`backend/src/org-change-alert/alert-generation.spec.ts`

#### TS-F006-031 不同文件、同一欄位種類 → 個別鍵不衝突去重 [unit]
- **Given**：文件 D1、D2 之「制定部門」皆因同一組織單位異動而符合觸發條件；D1 已有 `pending`
- **When**：執行
- **Then**：D1 略過（已存在）；D2 正常建立（鍵為 `(documentId, affectedField)`，`documentId` 不同即不同鍵）
- 對應：D3 鍵設計正確性／ 目標檔：同上

### 3.6 不覆寫保證（AC3）與不觸發 F005（AC9，補充整合層）

#### TS-F006-032 提示產生後，文件之制定組織/當責室長欄位值不被系統自動改寫 [unit]
- **Given**：文件 D 因當責室長轉調產生提示
- **When**：`generateFromSyncPlan()` 執行完畢
- **Then**：`documents` store 之 `update`/`patch` 方法**未被呼叫**（以 spy 驗證整個流程對 `ICSOP_DOCUMENT` 表零寫入，僅寫入 `ORG_CHANGE_ALERT`）
- 對應 AC3 ／ 目標檔：`backend/src/org-change-alert/alert-generation.spec.ts`

#### TS-F006-033 提示 `pending` 期間，文件經由既有 F017/F019 查詢仍回傳原制定組織/室長值 [integration]
- **Given**：文件 D 之「當責室長-主要」提示為 `pending`（原值未變）
- **When**：呼叫 `GET /admin/documents/:id`
- **Then**：`primaryChiefId` 仍為異動前之員編（人工處理前之既有值），與提示之 `beforeValue` 對應之原值一致
- 對應 AC3 ／ 目標檔：`backend/test/int/org-change-alert.itest.ts`

### 3.7 查詢端點

#### TS-F006-034 `GET /admin/org-change-alerts?status=pending` 回傳兩種 `alertKind` 混合清單 [unit]
- **Given**：既有 2 筆 `DOCUMENT_FIELD` pending ＋ 1 筆 `CLOSED_DEPT_PERSON` pending
- **When**：ICSOPAdmin 呼叫（預設或顯式 `status=pending`）
- **Then**：回傳 3 筆，依 `createdAt` 排序，每筆含判別欄 `alertKind` 供前端分辨渲染欄位
- 對應：US-014 步驟 6、prototype `alerts` 陣列混合結構／ 目標檔：`backend/src/org-change-alert/org-change-alert.controller.spec.ts`

#### TS-F006-035 `status=resolved` 查詢回傳已處理清單含 `resolvedBy`/`resolvedAt`/`resolutionKind` [unit]
- **Given**：既有 1 筆 `resolved` 列
- **When**：`GET ?status=resolved`
- **Then**：回傳含完整處理者/時間/`resolutionKind`
- 對應：任務範圍項 3（resolved/history 查詢）；**與 prototype 09 現況不符**，見第 6 節風險 R-3／ 目標檔：同上

#### TS-F006-036 空清單 → 回傳空陣列（非 404） [unit]
- **Given**：無任何 pending 提示
- **When**：`GET ?status=pending`
- **Then**：`200` + `[]`（對應 prototype 空狀態文案由前端依空陣列渲染，非後端錯誤）
- 對應：prototype `renderAlerts()` 空狀態分支／ 目標檔：同上

#### TS-F006-037 `GET /admin/org-sync/monthly-summary` 僅加總「本月」`SYNC_RUN`，跨月資料不計入 [unit]
- **Given**：`SYNC_RUN` 三筆：本月 2 筆（`accountsCreated=3,5`）、上月 1 筆（`accountsCreated=100`）
- **When**：查詢
- **Then**：`newPersonCount=8`（僅本月 2 筆加總，排除上月 100）
- 對應：D7「本月」範圍定義 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`

#### TS-F006-038 `pendingChiefAlertCount` 僅計「當責室長-主要/次要」，排除制定組織與已關閉部門提示 [unit]
- **Given**：pending 提示：2 筆「當責室長-主要」、1 筆「制定部門」、1 筆 `CLOSED_DEPT_PERSON`
- **When**：查詢 `monthly-summary`
- **Then**：`pendingChiefAlertCount=2`（依 D7 決策之窄口徑；本場景亦驗證與「頁籤 badge 應為 4」之差異，供前端測試 3.9 對照）
- 對應：D7（OQ-F006-04 待確認假設）／ 目標檔：同上

#### TS-F006-039 月份邊界：`startedAt` 恰為當月 1 日 00:00:00 (Asia/Taipei) → 計入本月 [unit]
- **Given**：`SYNC_RUN.startedAt` = 當月 1 日 00:00:00 UTC+8
- **When**：查詢（注入固定 `now`）
- **Then**：計入本月統計（邊界含頭）
- 對應：D7 邊界正確性 ／ 目標檔：同上

### 3.8 處理（Resolve）

#### TS-F006-040 Route B：標記「已確認無需變更」→ 狀態轉 resolved 並記錄處理者/時間 [unit]
- **Given**：`pending` 提示 X；呼叫者為 ICSOPAdmin 帳號 `acc-1`
- **When**：`PATCH /admin/org-change-alerts/X/resolve`（無 body 或 `{}`）
- **Then**：`status='resolved'`、`resolutionKind='NO_CHANGE_NEEDED'`、`resolvedBy='acc-1'`、`resolvedAt=<now>`
- 對應 AC4 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`

#### TS-F006-041 resolved 後從 `pending` 清單消失（US-014「提示自清單移除」） [unit]
- **Given**：同上，resolve 完成
- **When**：`GET ?status=pending`
- **Then**：X 不在回傳清單內
- 對應 AC4 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.controller.spec.ts`

#### TS-F006-042 對已 `resolved` 之提示再次呼叫 resolve → 409 `ALERT_ALREADY_RESOLVED` [unit]
- **Given**：提示 X 已 `resolved`
- **When**：再次 `PATCH .../X/resolve`
- **Then**：409，錯誤碼 `ALERT_ALREADY_RESOLVED`，原 `resolvedBy`/`resolvedAt` 不變（冪等防呆，非覆寫）
- 對應：D4 錯誤碼設計 ／ 目標檔：同上

#### TS-F006-043 對不存在之 `id` 呼叫 resolve → 404 `ALERT_NOT_FOUND` [unit]
- **Given**：`id` 不存在
- **When**：`PATCH .../{不存在id}/resolve`
- **Then**：404 `ALERT_NOT_FOUND`
- 對應：D4 錯誤碼設計 ／ 目標檔：同上

#### TS-F006-044 Route A：F014 儲存變更 `primaryChiefId` → 自動解除對應 pending 提示 [unit]
- **Given**：文件 D 之「當責室長-主要」提示為 `pending`；`OrgChangeAlertAutoResolveSubscriber` 已訂閱
- **When**：`DocumentsService.update()` 對文件 D 儲存新的 `primaryChiefId`（實際值變更），發出 `DocumentChangedEvent{changes:[{field:'primaryChiefId',...}], actorId:'acc-2', occurredAt}`
- **Then**：對應提示自動轉 `resolved`，`resolutionKind='FIELD_UPDATED'`、`resolvedBy='acc-2'`、`resolvedAt=event.occurredAt`；**不經過** `resolve` HTTP 端點
- 對應 AC4（管理員更新欄位路徑）／ 目標檔：`backend/src/org-change-alert/document-change-subscriber.spec.ts`

#### TS-F006-045 Route A：`changes[]` 不含任何可對映欄位 → 不解除任何提示（無副作用） [unit]
- **Given**：文件 D 有 pending 提示（「制定部門」欄位）；本次 `DocumentChangedEvent.changes` 僅含 `documentName` 變更
- **When**：訂閱者收到事件
- **Then**：不解除任何提示（欄位不匹配）
- 對應：D4 Route A 精確比對邊界 ／ 目標檔：同上

#### TS-F006-046 Route A：多欄同時變更 → 各自比對、分別解除對應提示 [unit]
- **Given**：文件 D 同時有「制定部門」與「當責室長-主要」兩筆 pending；一次儲存同時變更 `draftingDeptId` 與 `primaryChiefId`
- **When**：`changes` 含兩筆 field delta
- **Then**：兩筆提示皆轉 `resolved`（各自 `resolutionKind='FIELD_UPDATED'`）
- 對應：D4 ／ 目標檔：同上

#### TS-F006-047 Route A 已知缺口：`secondaryChiefIds`/`usingDeptIds` 變更事件不會觸發自動解除 [unit]
- **Given**：文件 D 有「當責室長-次要」pending 提示；`DocumentsService.update()` 現況對 `secondaryChiefIds` payload 直接於 `clean` 剔除（不落地、不產生 `changes` diff）
- **When**：呼叫編輯 API 傳入新的 `secondaryChiefIds`
- **Then**：`DocumentChangedEvent.changes` 不含 `secondaryChiefIds` 條目；訂閱者不解除該提示（提示維持 `pending`，須改走 Route B 手動處理或待 F014 編輯頁多值支援到位）
- 對應：D4 已知缺口記錄（回歸測試性質，確保此限制被明確測到而非被忽略）／ 目標檔：同上、`backend/src/documents/documents.service.spec.ts`（既有檔案交叉確認）

#### TS-F006-048 Route B 可作為 `secondaryChiefIds`/`usingDeptIds` 之逃生口（顯式 `FIELD_UPDATED`） [unit]
- **Given**：TS-F006-047 情境，提示仍 `pending`
- **When**：管理員改呼叫 `PATCH .../resolve` 傳入 `{resolutionKind:'FIELD_UPDATED'}`
- **Then**：提示轉 `resolved`、`resolutionKind='FIELD_UPDATED'`、`resolvedBy=` 呼叫者
- 對應：D4 逃生口設計 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`

#### TS-F006-049 CLOSED_DEPT_PERSON 僅能經 Route B 解除（無 Route A 對應） [unit]
- **Given**：`CLOSED_DEPT_PERSON` 提示 `pending`
- **When**：任意 `DocumentChangedEvent` 發生（與此人無文件關聯）
- **Then**：不受影響；僅 `PATCH .../resolve` 可將其轉 `resolved`
- 對應：D4（CLOSED_DEPT_PERSON 無 Route A）／ 目標檔：`backend/src/org-change-alert/document-change-subscriber.spec.ts`

### 3.9 RBAC

#### TS-F006-050 SysAdmin 對 `GET /admin/org-change-alerts` 允許讀取 [unit]
- **Given**：`roleCode='SysAdmin'`
- **When**：呼叫
- **Then**：`200`
- 對應 AC7（正向）／ 目標檔：`backend/src/org-change-alert/org-change-alert.controller.spec.ts`

#### TS-F006-051 ICSOPAdmin 對 `GET` 允許、對 `PATCH resolve` 拒絕（403） [unit]
- **Given**：`roleCode='ICSOPAdmin'`
- **When**：分別呼叫 `GET` 與 `PATCH .../resolve`
- **Then**：`GET`→200；`PATCH`→403 `PERMISSION_DENIED`（矩陣：ICSOPAdmin 對「組織人員異動管理」為唯讀）
- 對應 AC7 ／ 目標檔：同上

#### TS-F006-052 Supervisor/DeptContact/User 對任一新端點（`GET` 清單／`PATCH resolve`／`GET monthly-summary`）一律 403（參數化） [unit]
- **Given**：`roleCode ∈ {Supervisor, DeptContact, User}`
- **When**：分別呼叫三個端點
- **Then**：全部 `403 PERMISSION_DENIED`（矩陣：三者對「組織人員異動管理」為無）
- 對應 AC7 ／ 目標檔：同上、`backend/src/org-change-alert/org-change-alert.controller.spec.ts`（`monthly-summary` 部分於 `org-sync.controller.spec.ts`）

#### TS-F006-053 未登入（無 session）→ 401（早於 RBAC 判定） [unit]
- **Given**：無 session cookie
- **When**：呼叫任一新端點
- **Then**：`401`（`SessionGuard` 先於 `RolePermissionGuard` 攔截，與既有 `org-sync` 端點一致行為）
- 對應：既有 guard chain 慣例延伸 ／ 目標檔：同上

#### TS-F006-054 Route A 自動解除不受 `ORG_SYNC_MANAGEMENT` 權限限制（ICSOPAdmin 觸發合法） [unit]
- **Given**：ICSOPAdmin（對 `ORG_SYNC_MANAGEMENT` 僅 READ）透過合法的 F014/F011 寫入路徑（其對文件欄位屬 F026 CRUD 對象）變更 `primaryChiefId`
- **When**：`DocumentChangedEvent` 觸發訂閱者
- **Then**：對應提示正常自動解除（不因觸發者對 `ORG_SYNC_MANAGEMENT` 僅唯讀而被攔阻）——驗證 D8 決策之邊界正確落地
- 對應：D8 設計決策 ／ 目標檔：`backend/src/org-change-alert/document-change-subscriber.spec.ts`

### 3.10 稽核

#### TS-F006-055 Route B 手動解除寫入稽核事件（`targetType=ORG_CHANGE_ALERT`, `actionType=ALERT_RESOLVED`） [unit]
- **Given**：ICSOPAdmin 呼叫 `PATCH .../resolve`
- **When**：完成
- **Then**：`AuditWriter.recordAccess()` 被呼叫一次，`targetType='ORG_CHANGE_ALERT'`、`actionType='ALERT_RESOLVED'`、`targetId=alertId`、`actorId=` 呼叫者、無 `watermarkSnapshot`
- 對應：D6 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`

#### TS-F006-056 Route A 自動解除亦寫入稽核事件，`actorId` 取自原始編輯事件 [unit]
- **Given**：F014 編輯觸發自動解除
- **When**：完成
- **Then**：稽核事件 `actorId=event.actorId`（F014 操作者，非系統帳號）
- 對應：D6 ／ 目標檔：`backend/src/org-change-alert/document-change-subscriber.spec.ts`

#### TS-F006-057 提示「產生」（pending 建立）不寫入 `AUDIT_LOG` [unit]
- **Given**：同步產生新提示
- **When**：`generateFromSyncPlan()` 執行
- **Then**：`AuditWriter.recordAccess()` 全程未被呼叫（僅寫 `ORG_CHANGE_ALERT` 表本身）
- 對應：D6（產生非調閱事件）／ 目標檔：`backend/src/org-change-alert/alert-generation.spec.ts`

#### TS-F006-058 稽核寫入失敗不阻斷 resolve 主流程（比照既有 Outbox 非阻斷慣例） [unit]
- **Given**：`AuditWriter.recordAccess()` 模擬拋出例外
- **When**：呼叫 resolve
- **Then**：resolve 本身仍成功回應（`status` 已轉 `resolved`），稽核失敗僅記 log（比照 `AuditWriterService.recordAccess` 既有「吞例外」慣例，不重新發明）
- 對應：既有 NFR-003／AC4 精神延伸 ／ 目標檔：`backend/src/org-change-alert/org-change-alert.service.spec.ts`

### 3.11 前端（`OrgSyncPage.tsx`／`OrgSyncPage.test.tsx`）

#### TS-F006-059 頁籤列渲染三個頁籤，預設 active 為「總覽」 [frontend]
- **Given**：頁面初始載入
- **When**：渲染完成
- **Then**：DOM 含「總覽」「同步歷史」「待確認異動」三個頁籤按鈕；「總覽」具 active 樣式（`border-primary-600 text-primary-700`，比照 prototype 初始狀態）
- 對應：prototype 09 頁籤結構逐項還原 ／ 目標檔：`frontend/src/pages/OrgSyncPage.test.tsx`

#### TS-F006-060 「待確認異動」頁籤文字旁顯示 amber 徽章＝pending 總數 [frontend]
- **Given**：`GET /admin/org-change-alerts?status=pending` 回傳 3 筆
- **When**：渲染
- **Then**：頁籤旁徽章文字為「3」，樣式含 `bg-amber-100 text-amber-700`（逐項比對 prototype `#alertBadge`）
- 對應：prototype `renderAlerts()` badge 邏輯／ 目標檔：同上

#### TS-F006-061 pending 為 0 時徽章不顯示（`display:none` 或不渲染，比照 prototype 邏輯） [frontend]
- **Given**：0 筆 pending
- **When**：渲染
- **Then**：徽章不可見（prototype 原邏輯 `alertBadge.style.display=pend.length?'':'none'`——本測試僅斷言「使用者不可見」，implementation 選擇 CSS 隱藏或條件不渲染皆可接受）
- 對應：prototype 空狀態徽章行為／ 目標檔：同上

#### TS-F006-062 切換至「同步歷史」頁籤時顯示既有歷史表，其餘頁籤內容不可見 [frontend]
- **Given**：頁面已載入（含既有同步歷史資料）
- **When**：點擊「同步歷史」頁籤
- **Then**：歷史表格（既有欄位：開始時間/結束時間/觸發方式/結果/異動筆數）可見；「總覽」KPI 卡與「待確認異動」清單不可見
- 對應：既有功能（AC5 基礎）搬入頁籤結構後之回歸驗證／ 目標檔：同上

#### TS-F006-063 「總覽」頁籤渲染 4 張 KPI 卡，文案與圖示逐項比對 prototype [frontend]
- **Given**：`GET /admin/org-sync/monthly-summary` 回傳 `{newPersonCount:18, updatedCount:31, departedDisabledCount:4, pendingChiefAlertCount:3}`
- **When**：渲染
- **Then**：4 張卡依序為「新增人員」18、「更新（部門/職級）」31、「離職停用」4、「當責待確認」3；卡片下方文案含「本月（`{YYYY-MM}`）累計異動分類統計」與「離職類異動已連動自動停用對應帳號（F005）」（逐字比對 prototype）
- 對應 prototype KPI 區塊 ／ 目標檔：同上

#### TS-F006-064 「同步狀態卡」維持顯示於頁籤列**外側**（不受頁籤切換影響） [frontend]
- **Given**：任一頁籤 active
- **When**：切換頁籤
- **Then**：最上方「同步狀態卡」（最近同步時間/方式/結果/異動筆數/立即同步按鈕）內容不變、持續可見（prototype 中此卡在 tab bar 之外）
- 對應 AC5（既有功能保持不受本次結構調整影響）／ 目標檔：同上

#### TS-F006-065 提示卡結構：文件編號、名稱、待確認 pill、受影響欄位、before→after 差異區塊 [frontend]
- **Given**：1 筆 `DOCUMENT_FIELD` pending 提示，含 `documentNumber`/`documentName`/`affectedField`/`beforeValue`/`afterValue`
- **When**：渲染於「待確認異動」頁籤
- **Then**：卡片含 mono 文件編號、amber「待確認」pill（含 clock icon）、文件名稱、「受影響欄位：{affectedField}」、before（灰底刪除線）→ after（amber 底）差異區塊（逐項比對 prototype `renderAlerts()` 卡片 HTML 結構）
- 對應：prototype 提示卡結構 ／ 目標檔：同上

#### TS-F006-066 `CLOSED_DEPT_PERSON` 提示卡呈現人員/部門專屬欄位（非 documentNumber/before-after 格式） [frontend]
- **Given**：1 筆 `CLOSED_DEPT_PERSON` pending 提示
- **When**：渲染
- **Then**：卡片呈現 `personName`/`personEmployeeNo`/`deptName`/`deptOrgCode`/`deptCloseDate`（非套用 DOCUMENT_FIELD 之 before/after diff 版式，因 prototype 未提供此類卡片之現成標記，需前端依 `alertKind` 分流渲染——本場景之精確視覺規格標示為待 UI 補充，見第 6 節風險 R-4）
- 對應 AC8（前端呈現）／ 目標檔：同上

#### TS-F006-067 「前往當責設定」按鈕僅 SysAdmin 可見（write-only），ICSOPAdmin 唯讀模式不顯示 [frontend]
- **Given**：`roleCode='ICSOPAdmin'`（對本頁唯讀）
- **When**：渲染提示卡
- **Then**：「前往當責設定」按鈕**不存在於 DOM**（非僅 CSS 隱藏；比照既有 RBAC DOM 安全性慣例：`document.querySelector` 應回 `null`）——**注意此點與 prototype 原始 class-based `.write-only` 隱藏機制不同**：prototype 用 CSS class 依 `data-role` 隱藏，React 移植版應採條件渲染（DOM 不存在）以符合本專案既有雙層防護慣例（比照 `OrgSyncPage.tsx` 現有 `canTrigger` 條件渲染「立即同步」按鈕之既定模式）
- 對應：既有 RBAC DOM 安全性慣例延伸；prototype `.write-only` 語意映射 ／ 目標檔：同上

#### TS-F006-068 「標記無需變更」按鈕亦為 write-only（SysAdmin 可見、ICSOPAdmin 不可見） [frontend]
- **Given**：同上
- **When**：渲染
- **Then**：ICSOPAdmin 檢視時該按鈕不存在於 DOM
- 對應：prototype `.write-only` 涵蓋兩顆按鈕 ／ 目標檔：同上

#### TS-F006-069 點擊「前往當責設定」導向 `/admin/documents/:id/edit` 並帶入正確文件 ID [frontend]
- **Given**：SysAdmin 檢視提示卡（`documentId='doc-123'`）
- **When**：點擊「前往當責設定」
- **Then**：路由導向 `/admin/documents/doc-123/edit`（非泛用清單頁，精確帶入該文件 ID）
- 對應 AC6 ／ 目標檔：同上

#### TS-F006-070 `CLOSED_DEPT_PERSON` 提示卡**不提供**「前往當責設定」按鈕（無關聯文件可導頁） [frontend]
- **Given**：`CLOSED_DEPT_PERSON` 提示（`documentId=null`）
- **When**：渲染
- **Then**：卡片不顯示「前往當責設定」按鈕（僅顯示「標記無需變更」，因無文件可導頁——prototype 未涵蓋此分支，屬本設計新增之必要差異化，見第 6 節 R-4）
- 对應：AC6 之隱含邊界（僅 DOCUMENT_FIELD 有導頁對象）／ 目標檔：同上

#### TS-F006-071 點擊「標記無需變更」呼叫 resolve API 並樂觀移除卡片，附成功 toast [frontend]
- **Given**：SysAdmin 檢視 pending 卡片
- **When**：點擊「標記無需變更」，API 回應成功
- **Then**：卡片自清單移除（不需整頁重整）；顯示成功提示（比照 prototype `toast('success', '已標記處理完成…')`）
- 對應 AC4（前端呈現）／ 目標檔：同上

#### TS-F006-072 pending 清單為空時顯示空狀態文案與圖示 [frontend]
- **Given**：0 筆 pending
- **When**：渲染「待確認異動」頁籤
- **Then**：顯示 check-circle 圖示＋「目前無待確認組織異動」文案（逐字比對 prototype 空狀態）
- 對應：prototype 空狀態 ／ 目標檔：同上

#### TS-F006-073 唯讀橫幅：ICSOPAdmin 檢視本頁時顯示唯讀提示（沿用既有橫幅、更新文案涵蓋待確認異動） [frontend]
- **Given**：`roleCode='ICSOPAdmin'`
- **When**：渲染
- **Then**：頁面頂部顯示唯讀橫幅，文案涵蓋「可查看同步狀態**與待確認異動**，但無法觸發『立即同步』**或處理異動**」（既有橫幅文案需擴充涵蓋新增之寫入動作，非僅原「立即同步」）
- 對應：prototype 唯讀橫幅文案（「可查看同步狀態與待確認異動，但無法觸發『立即同步』」）／ 目標檔：同上（既有 `OrgSyncPage.test.tsx` 唯讀橫幅場景需同步更新斷言文案）

#### TS-F006-074 Supervisor/DeptContact/User 存取本頁 → 前端亦顯示無權限畫面（雙層防護） [frontend]
- **Given**：`roleCode ∈ {Supervisor, DeptContact, User}`
- **When**：渲染 `OrgSyncPage`
- **Then**：顯示既有「無組織同步管理權限」畫面（`PERMISSION_DENIED · 403`），三個新頁籤內容皆不渲染、不發出任何新增 API 請求（`getOrgChangeAlerts`/`getOrgSyncMonthlySummary` 未被呼叫）
- 對應 AC7（前端呈現層）；既有 `canRead` 守門邏輯延伸／ 目標檔：同上

#### TS-F006-075 KPI 查詢失敗（500）→ 總覽頁籤降級顯示、不影響其他頁籤 [frontend]
- **Given**：`GET monthly-summary` 回傳 500
- **When**：切至「總覽」頁籤
- **Then**：顯示不含技術性錯誤訊息之降級提示（比照既有 E06 管理頁降級模式），「同步歷史」與「待確認異動」頁籤不受影響、可正常切換
- 對應：既有降級處理慣例延伸（無對應 spec AC，屬 NFR/健壯性補強）／ 目標檔：同上

### 3.12 整合測試（`backend/test/int/`）

#### TS-F006-076 `[int]` 提示 round-trip：insert → query pending → resolve → query resolved [integration]
- **Given**：真實 SOP DB，marker 前綴 `ZZINT_ALERT_`（新 marker，見第 6 節 R-5 之 harness 擴充需求）
- **When**：依序執行完整生命週期
- **Then**：每步驟回應與 DB 實際列一致
- 對應：D1、D4 ／ 目標檔：`backend/test/int/org-change-alert.itest.ts`

#### TS-F006-077 `[int]` 兩次同步之去重：真實 DB 唯一索引與服務層邏輯一致 [integration]
- **Given**：真實 marker 帳號＋marker 組織單位（已關閉），第一次同步產生提示
- **When**：第二次同步（情境不變）執行
- **Then**：`ORG_CHANGE_ALERT` 該員編僅 1 筆 `pending`（服務層去重生效，DB 唯一索引未被觸發違例——驗證兩層一致，非服務層漏擋而靠 DB 擋下導致同步拋錯）
- 對應 AC10（真實 DB 驗證）／ 目標檔：同上

#### TS-F006-078 `[int]` RBAC 403 邊界（真實 guard chain，DeptContact 呼叫 resolve） [integration]
- **Given**：marker DeptContact 帳號
- **When**：`PATCH /admin/org-change-alerts/:id/resolve`
- **Then**：`403 PERMISSION_DENIED`
- 對應 AC7 ／ 目標檔：同上

#### TS-F006-079 `[int]` `monthly-summary` 對真實 `SYNC_RUN` 資料正確加總 [integration]
- **Given**：marker `SYNC_RUN` 若干筆（含新 3 欄真實落地值）
- **When**：查詢
- **Then**：加總結果與手動計算一致
- 對應：D7 ／ 目標檔：同上

---

## 4. AC ↔ Test Scenario 對照表

| AC | 內容摘要 | 對應 TS |
|----|---------|---------|
| AC1 | 當責室長轉調 → 產生提示標示「當責室長-主要」 | TS-F006-005, 006, 007, 012 |
| AC2 | 制定部門/室別對應組織單位異動 → 產生提示 | TS-F006-014, 015, 016, 017 |
| AC3 | pending 期間文件狀態/設定不被自動覆寫 | TS-F006-032, 033 |
| AC4 | 管理員更新欄位或標記無需變更 → resolved + 記錄處理者/時間 | TS-F006-040, 041, 044~049, 055, 056, 071 |
| AC5 | 後台頁載入顯示同步狀態總覽 | TS-F006-064（既有覆蓋＋結構回歸） |
| AC6 | 點擊待確認項目導向該文件當責設定編輯畫面 | TS-F006-069, 070 |
| AC7 | 非授權角色存取 API → 403 | TS-F006-050~054, 074, 078 |
| AC8 | 在職者掛已關閉部門 → 提示含代碼/名稱/關閉日期 | TS-F006-021, 022, 023, 066 |
| AC9 | 掛已關閉部門者帳號維持啟用、不被 F005 停用 | TS-F006-025 |
| AC10 | 連續兩次同步同一情境不重複產生 | TS-F006-028, 077 |
| Edge：多份文件當責室長 | 各自獨立提示 | TS-F006-007 |
| Edge：異動與當責欄位無關聯 | 不誤判 | TS-F006-008 |
| Edge：掛已關閉部門者同時為室長 | 兩類提示各自獨立 | TS-F006-026 |

---

## 5. 自動化就緒度（Automation Readiness）

- **適合自動化**：全部 3.1–3.10（unit/integration）與 3.11（frontend，RTL 可斷言 DOM 存在性/文字/路由呼叫）；[integration] 套件需真 SOP DB，不隨 `npm test` 跑，僅 `npm run test:int`。
- **環境依賴**：3.12 全部場景需 host 可連 SOP；本輪任務指示不執行 `test:int`，僅設計。
- **決定性/可重現性**：`monthly-summary` 之「本月」判定與 `resolvedAt`/`createdAt` 皆需注入固定 `now()`（比照 `OrgSyncOptions.now`／既有 `org-sync.service.ts` 慣例），避免測試因執行時刻跨月/跨日而 flaky。
- **人工項**：3.11 之精確像素/版面比對建議搭配一次性人工視覺核對（比照既有 prototype 移植慣例），RTL 僅斷言結構與文字，不斷言 CSS 精確數值以外的視覺呈現。

---

## 6. 風險、開放問題與需人類決策事項

### 6.1 阻擋性設計問題（需人類決策才能定案，已標記於第 1 節對應決策旁）

| ID | 問題 | 影響範圍 | 阻擋等級 |
|----|------|---------|---------|
| OQ-F006-01 | DOCUMENT_FIELD 觸發訊號範圍是否過寬（重用 `classifyOrgUnit`/`classifyAccount` 既有 `update` 訊號，未額外收斂） | 產生的提示筆數／使用者感受之雜訊程度 | 🟡 中（不影響可否上線，影響 UX） |
| OQ-F006-02 | 同一 `(documentId, affectedField)` pending 未解除前再度變動：略過（現行設計）或就地更新 `afterValue`？ | TS-F006-030 之 Then 走向 | 🟡 中 |
| OQ-F006-03 | 「職級異動」無任何資料欄位可偵測（D5）；是否接受僅涵蓋「部門異動」之部分覆蓋，或需新增上游欄位 | AC1 之完整性（spec 原文含「職級」二字） | 🔴 高（涉及資料模型擴充與上游協調，非本 worktree 可解） |
| OQ-F006-04 | KPI「當責待確認」卡與頁籤 `alertBadge` 計數口徑不一致（D7） | 前端使用者體驗一致性 | 🟡 中 |

### 6.2 規格內部矛盾（發現，需回報）

- **R-1**：`docs/specs/features/F006-org-change-alert-backend.md` 之「Error Scenarios」段落寫「提示是否需比文件狀態切換更嚴謹之處理流程：未定案（OQ-E02-03b）」，但 `docs/specs/open-questions.md` 之 `OQ-E02-03b` 列已標記 **[已定案 ✅]**：「非強制提示（比照無簽核精神）」。兩份文件對同一問題之定案狀態不一致（F006 spec 之 last-updated 為 2026-07-20，晚於 open-questions.md 該列疑似定案之時間點，但措辭未同步更新）。**本文件之測試設計採 open-questions.md 之定案結果**（非強制流程，AC4「非強制」語意與此一致，兩份文件在**行為**上並無實質衝突，僅 F006 spec 之措辭忘記移除「未定案」標記），建議請負責 spec 維運者將 F006 spec 之 Error Scenarios 段落同步更新、移除 `OQ-E02-03b` 未定案字樣。不阻塞本 worktree 開發。
- **R-2**：`data-model.md#orgchangealert-entity` 之 `documentId` 標「必填」，與本設計之「條件必填」不一致（見 D1 說明）。

### 6.3 待確認假設（非阻擋，已於場景註記）

- DOCUMENT_FIELD 之去重規則（D3）為本文件之設計外推，spec AC10 原文僅明確描述 CLOSED_DEPT_PERSON 情境；已比照套用於 DOCUMENT_FIELD 以避免不一致的使用者體驗，但非逐字 AC 要求。
- §7.3「掛於已關閉部門」場景之 `affectedField`／欄位比對細節（TS-F006-018「制定部門」之 `isActive` 翻轉是否也算「組織單位異動」）為本文件依 spec 廣義用詞之合理外推，非窄義逐字規則。

### 6.4 Prototype 與任務範圍之落差

- **R-3（TS-F006-035 相關）**：任務指示要求設計「resolved/history」查詢端點，但 prototype 09 之 `panel-alerts` 僅渲染 `alerts.filter(a=>a.status==='pending')`，**未提供任何已處理提示之清單 UI**（無頁面區塊、無切換開關）。本設計於**後端**保留 `status=resolved` 查詢能力（供稽核/除錯與未來擴充），但**前端**依「prototype 為權威 UI」之硬性約束，本輪**不**設計「已處理提示清單」畫面測試（3.11 全部場景僅涵蓋 pending 呈現）。若產品後續需要此畫面，需先擴充 prototype。
- **R-4（TS-F006-066/070 相關）**：prototype 之提示卡 HTML/CSS 僅針對 DOCUMENT_FIELD 情境設計（`before`/`after` diff 版式、「前往當責設定」按鈕），**未涵蓋** CLOSED_DEPT_PERSON 卡片應呈現的樣式與欄位配置（prototype 09 的假資料 `alerts` 陣列僅 3 筆皆為文件層情境，無任何「掛已關閉部門」範例卡片）。本設計依 AC8 文字要求（含部門代碼/名稱/關閉日期）指定其必要資訊內容，但精確視覺規格（版面、色彩、icon）需 UI/UX 補充一張 prototype 變體或設計稿，本文件之 TS-F006-066/070 僅能斷言「內容存在性」與「不含 before/after 與導頁按鈕」，無法比照其餘場景逐項比對像素/class。

### 6.5 需協調之跨模組/跨 worktree 變更（不在本 worktree 邊界內，僅設計、不落地）

- `backend/src/documents/documents.module.ts`：`DOCUMENT_CHANGE_PUBLISHER` 需由單一綁定改為 fan-out（Composite），供 F006 訂閱者與既有 F037 `DocumentChangeLogPublisher` 並存。
- `backend/src/audit/audit.types.ts`：新增 `ORG_CHANGE_ALERT`/`ALERT_RESOLVED`（additive，D6）。
- `backend/test/int/harness.ts`：`cleanupMarkers()` 現況未涵蓋 `ORG_UNIT`／`SYNC_RUN`／`ORG_CHANGE_ALERT`；本 worktree 之 `org-change-alert.itest.ts` 需自行比照 `usage-form-pool.itest.ts` 之模式，於檔案內定義獨立 `cleanupAlertMarkers()`（marker 建議：`ORG_UNIT.name` 前綴 `ZZINT_ORG_`、`ORG_CHANGE_ALERT` 經其 `documentId`/`sourceSyncRunId` 隨既有 marker 文件/新 marker `SYNC_RUN` 連鎖清除），不需改動共用 `harness.ts`（除非未來多個 worktree 皆需要組織同步類 marker，屆時建議收斂進 `harness.ts`）。

### 6.6 其他觀察

- `PersonRecord`/`PersonStore` 現況直接讀 `ACCOUNT`（`org-directory` 已定案不另建 `PERSON` 表），本設計之「人員」比對（當責室長）因此全數以 `ACCOUNT.employeeNo` 為準，與 `data-model.md#person-entity` 描述之獨立 PERSON 實體有落差；本文件依現行程式碼實況（權威）設計，不依 data-model.md 文件字面（過時部分）設計，此落差已於 D5/D2 段落之程式碼引用中一併呈現，不另開新 OQ（`upstream-person-org-source.md` 已記錄此定案）。

---

## 7. Agent Loading Guide

| Agent Role | 建議載入檔案 |
|---|---|
| TDD Developer（backend） | 本檔第 1 節（設計決策）＋ 3.1–3.10 ＋ 4 ／ `docs/specs/features/F006-org-change-alert-backend.md` |
| TDD Developer（frontend） | 本檔第 1 節（D7/D8）＋ 3.11 ＋ `prototypes/09-org-sync-management.html` |
| QA / Integration | 本檔 3.12 ＋ `backend/test/int/harness.ts`、`usage-form-pool.itest.ts` |
| Product / 決策者 | 第 6 節全節（尤其 6.1 OQ-F006-01~04、6.2 規格矛盾） |
