---
type: implementation-log
feature_id: F004
feature_name: 組織資料同步（後端同步引擎）
status: partial
last_updated: 2026-07-21
---

# F004: 組織資料同步 — Implementation Log（後端引擎 pass）

> 本 pass 聚焦「後端同步引擎核心邏輯（TDD）＋ 手動觸發 API ＋ SYNC_RUN 實體/migration ＋ 可實跑驗證指令」。
> 明確不做（下一增量）：prototype 09 前端頁移植、排程 cron 掛載（引擎已寫成可被 cron 或 API 呼叫）。
> 本專案無 `docs/test-specs/`，測試來源＝F004 之 16 條 AC ＋ US-010/011/012 ＋ upstream-hr-source-contract.md。

## 測試結果（red → green）

- 純邏輯層先寫 spec（模組不存在 → red）→ 實作 → green。
- 編排層（service/guard/controller）同樣先 spec → red → 實作 → green。
- 全套 `npm test`：**16 suites / 145 tests 全綠**（既有 33 未受影響 + 新增 112；含下方三個 Bugfix 之回歸）。

| AC / 情境 | 對應測試 | 狀態 |
|---|---|---|
| 階層推導 JAC00→SECTION/parentCode JA000/codePrefix JAC；不參考 P_DEPTID | `org-hierarchy.spec.ts` | PASS |
| JCHA0（第 4 碼有值）→ SUBSECTION（課），5 層不壓縮 | `org-hierarchy.spec.ts` | PASS |
| 在職判定 EMPSTS='A'；部門有效 CLOSE_DATE>now（哨兵 9999-12-31） | `employment-status.spec.ts` | PASS |
| 消失閾值 60/1000=6%→中止；20/1000=2%→放行；恰 5%→放行 | `disappeared-threshold.spec.ts` | PASS |
| 白名單 11 欄、OPENQUERY 下推、USERPW/DEFAULTPW 不出現於查詢 | `upstream-queries.spec.ts` | PASS |
| 正規化 + 髒資料 → DirtyRowError | `normalization.spec.ts` | PASS |
| 異動分類 新增/更新/離職停用/無異動（EMPSTS 權威、誤判恢復） | `change-classification.spec.ts` | PASS |
| 引擎：新增/更新/離職停用/無異動不寫/閾值中止不停用/閾值放行/孤兒保留/來源不可用/髒資料跳過/SYNC_IN_PROGRESS/增量水位 | `org-sync.service.spec.ts`（11 tests） | PASS |
| 非系統管理員→403 PERMISSION_DENIED（佔位待 F025） | `sys-admin.guard.spec.ts` | PASS |
| 手動觸發 API：以 manual+loginId 呼叫引擎、SYNC_IN_PROGRESS 傳遞 409 | `org-sync.controller.spec.ts` | PASS |

## 檔案異動

| 檔案 | 類型 | 說明 |
|---|---|---|
| `backend/src/org-sync/org-hierarchy.ts`(+spec) | new | deriveTier/deriveParentCode/deriveCodePrefix（純字串前綴推導） |
| `backend/src/org-sync/employment-status.ts`(+spec) | new | isEmploymentActive/isDeptActive + 哨兵常數 |
| `backend/src/org-sync/disappeared-threshold.ts`(+spec) | new | computeDisappeared/disappearedRatioExceeded（預設 0.05） |
| `backend/src/org-sync/normalization.ts`(+spec) | new | RawDept/RawAccount → Normalized*；DirtyRowError |
| `backend/src/org-sync/change-classification.ts`(+spec) | new | classifyOrgUnit/classifyAccount（冪等分類） |
| `backend/src/org-sync/upstream-queries.ts`(+spec) | new | OPENQUERY 建構器 + 白名單/禁欄常數 + assertNoForbiddenColumns |
| `backend/src/org-sync/org-sync.types.ts` | new | UpstreamOrgReader/OrgSyncStore 介面、SyncPlan/SyncResult |
| `backend/src/org-sync/org-sync.service.ts`(+spec) | new | 引擎核心 + SyncInProgressError |
| `backend/src/org-sync/sys-admin.guard.ts`(+spec) | new | 佔位 RBAC 守門（僅 SysAdmin，待 F025） |
| `backend/src/org-sync/org-sync.controller.ts`(+spec) | new | `POST /admin/org-sync/run` |
| `backend/src/org-sync/mssql-upstream-reader.ts` | new | 實際上游唯讀讀取器（mssql + OPENQUERY，非 unit test） |
| `backend/src/org-sync/typeorm-org-sync.store.ts` | new | 實際本地寫入端（TypeORM 交易，非 unit test） |
| `backend/src/org-sync/org-sync.config.ts` | new | 由 UPSTREAM_* 環境變數組上游連線設定 |
| `backend/src/org-sync/org-sync.module.ts` | new | Nest 模組（延遲連線 factory） |
| `backend/src/org-sync/sync-once.ts` | new | 可實跑驗證指令 `npm run sync:once` |
| `backend/src/types/mssql.d.ts` | new | mssql 最小 ambient 型別（stopgap，見下） |
| `backend/src/database/entities/sync-run.entity.ts` | new | SYNC_RUN 實體 |
| `backend/src/database/entities/org-unit.entity.ts` | modified | 新增 `parentCode` 欄 |
| `backend/src/database/entities/account.entity.ts` | modified | 新增 managerEmpNo/resignDate/hireDate/upstreamModifiedAt/disableReason/disabledAt |
| `backend/src/database/migrations/1721606400000-org-sync.ts` | new | ALTER ORG_UNIT/ACCOUNT + CREATE SYNC_RUN（未改 baseline） |
| `backend/src/auth/auth.module.ts` | modified | 匯出 SessionGuard/SessionTokenService 供 OrgSyncModule 重用 |
| `backend/src/app.module.ts` | modified | 匯入 OrgSyncModule |
| `backend/package.json` | modified | 新增 `sync:once` script |

## 設計決策

### 1. PERSON vs ACCOUNT（依規指示明確 flag）
- **決策：本 pass 不建立 PERSON 實體/資料表。** F004 之上游人員/在職資料一律經 `VW_HPMUSER` 白名單 11 欄寫入 **ACCOUNT**（契約 §5.2）。
- 理由（以契約為準，data-model PERSON 之上游對應由 data-model.md line 14 明定「以契約為準」）：
  1. 契約 §5.2 是唯一定義 VW_HPMUSER 之對應，且對應到 **ACCOUNT**；契約**未**定義任何 `VW_* → PERSON` 對應。
  2. PERSON 與 ACCOUNT 之欄位（employeeNo/name/orgCode/status）幾乎完全重疊；在 F004 範圍另建 PERSON 將重複資料且與契約單一對應牴觸 —— 符合本任務「不要自行臆造多餘實體」之指示。
  3. PERSON 之獨有欄位 `jobLevel` 來自 **VW_PERSONAL_JOB**（契約 §5.4），屬職稱/職級同步，**不在 F004 三來源（VW_DEPT_SQL/VW_HPMUSER/VW_HRCOMF）範圍**。
- **待裁決/待辦**：日後實作職級同步或 F014（當責室長，data-model 以 PERSON 為 primaryChiefId）時，需由 system-architect 決定：PERSON 是否獨立實體（承載 VW_PERSONAL_JOB 之職級），或以 ACCOUNT 承接。因「一人多帳號」（AS 6 筆），若需「人」的單一身分，PERSON 可能仍有價值——此為 F014/職級 pass 之決策，非 F004。

### 2. 消失閾值 vs EMPSTS 權威（US-010 AC4 × AC5 之交互，重要 flag）
- 增量同步依 `VW_HPMUSER.MTDT`；未異動之在職者本就不會出現在增量結果，故**不得以「未出現於增量結果」判定離職**（US-010 AC4）。
- 因此本引擎將兩者分離：
  - **停用（disable）唯一觸發＝來源回報 EMPSTS≠'A'**（classifyAccount）。
  - **消失閾值僅作為「安全閘」**：以獨立廉價投影 `SELECT USERID WHERE COMPID='AS' AND EMPSTS='A'`（OPENQUERY 下推）取得**來源在職集合**，與**本地在職集合**比對；消失比例 > 5% 視為上游來源異常（如 join/連線問題）→ **整批中止、不套用任何異動、不停用任何帳號**、SYNC_RUN 記 failed + `DISAPPEARED_RATIO_EXCEEDED`。
  - 閾值以下（放行）時：**僅** EMPSTS≠'A' 之帳號被停用；「僅消失但未帶 EMPSTS=B」之帳號**維持在職**（測試明確驗證此點，`org-sync.service.spec.ts`「閾值放行」）。
- 此詮釋同時滿足 AC4（EMPSTS 權威、不以消失判離職）與 AC5（閾值保護防大規模誤停用）。

### 3. IO 邊界抽象（可注入 mock）
- `UpstreamOrgReader`（讀 OPENQUERY）／`OrgSyncStore`（寫 ACCOUNT/ORG_UNIT/SYNC_RUN + 互斥鎖）為介面；引擎僅依賴介面，整合測試以 in-memory fake 驗證行為。
- **互斥鎖**＝「是否已有 running 之 SYNC_RUN」；第二次觸發 → `SYNC_IN_PROGRESS`（ConflictException→409）。
- **交易性**：引擎先完成所有讀取＋分類，組出 `SyncPlan` 後一次 `store.applySync()` 於**單一 DB 交易**套用（失敗整批回滾，AC3）。任何讀取失敗 → 未 applySync → 同步前資料完全不變。

### 4. 上游連線：採 `mssql` 套件（非 TypeORM 第二 DataSource）
- 理由：上游僅四支固定 OPENQUERY 字串、無 entity/migration；獨立唯讀連線與應用 ORM 完全隔離（杜絕誤寫上游）；沿用 auth 盤點（OQ-E02-01）之連線方式；直接掌控 pool/timeout/TLS。
- 應用自身寫入（ACCOUNT/ORG_UNIT/SYNC_RUN）仍用 TypeORM（`AppDataSource`）。

### 5. SYNC_RUN.errorCode 欄（最小擴充，已 flag）
- data-model §syncrun-entity 概念層僅列 `errorMessage`。為滿足 **US-011 AC4**「已中止（未執行停用）」須與一般「失敗」於前端**可程式化區分**，新增 `errorCode` 欄（`DISAPPEARED_RATIO_EXCEEDED` vs `SYNC_SOURCE_UNAVAILABLE`/`SYNC_DATA_FORMAT_ERROR`）。status 仍維持 data-model 之 running/success/failed 三態（中止＝failed + errorCode 區分）。另新增 `watermark` 欄承載 F004 Main Flow step 8「本次 MTDT 水位」。

### 6. ORG_UNIT.parentCode（持久化 AC 之 parentCode）
- baseline ORG_UNIT 無 parentId/parentCode 欄。為直接持久化 AC 要求之 `parentCode`（JAC00→JA000）並避免「先插入再解析 parentId UUID」之兩段式複雜度，新增 `parentCode` 字串欄。`parentId`（自參照 UUID）可日後由 parentCode 衍生，本 pass 不建。

### 7. 上游帳號新建之角色
- 上游同步新建帳號 `roleCode` 預設 `User`（最低角色）、`source='upstream'`；角色調升由 F003 手動處理，同步**不覆寫** roleCode/passwordHash（本地擁有欄位）。

## Bugfix — MSSQL 2100 參數上限（2026-07-21 dev 實跑 `sync:once`，AS 2771 帳號）

**現象**：`SELECT ... FROM ACCOUNT WHERE companyCode=@0 AND loginId IN (@1..@2771)` →
`The incoming request has too many parameters. The server supports a maximum of 2100 parameters.`
→ 帳號 新增/更新/停用 全 0、整批 rollback、SYNC_RUN failed（errorCode 誤記 `SYNC_SOURCE_UNAVAILABLE`）。
單元測試因 mock 資料量小（≤ 數十筆）未觸發，故未捕捉。

**根因**：MSSQL 單一陳述式參數硬上限＝2100。此上限在**兩處**被踩到（實跑先爆 SELECT；若首次同步走批次 INSERT，303 部門×9 欄＝2727、2771 帳號×13 欄≈36000 亦會爆）：
1. 帳號存在性預查 `loginId IN (…全部來源鍵…)`。
2. 批次多列 `INSERT`（列數 × 每列欄位數）。

**修法**：
1. **存在性比對改 load-all**：`OrgSyncStore.findAccountsByLoginIds(compid, loginIds)` → **`findExistingAccounts(compid)`**（介面**不再接受鍵清單** → 結構上不可能組出逐鍵 IN）。real store 以單一 `WHERE companyCode=@0 AND source='upstream'`（AS ~2771 筆，可接受）一次載入，服務層以記憶體 Map 比對。ORG_UNIT 端（`findOrgUnits`）本就是 load-all，無需改。
2. **批次 INSERT 切批**：新增純函式 `chunkByParamBudget(rows, fieldsPerRow, maxParams=2000)`（`param-batching.ts`）；`applySync` 之 orgCreates（9 欄）、accountCreates（13 欄）皆依此切批 INSERT。每批 列數×欄位數 ≤ 2000 < 2100。
3. **errorCode 正確性**：新增 `SyncWriteError`（本地寫入/交易階段失敗），`classifyFailure` 映射為 **`SYNC_WRITE_FAILED`**；上游讀取失敗仍 `SYNC_SOURCE_UNAVAILABLE`、髒資料 `SYNC_DATA_FORMAT_ERROR`。
   - ⚠ **error-handling.md#sync 未由本 agent 編輯**（docs/specs 為唯讀，屬 spec owner 職權）。建議 spec owner 於錯誤碼一覽最小新增一列：`| SYNC_WRITE_FAILED | 5xx | 同步寫入失敗（交易已回滾，資料未變） | F004 |`。
4. **單一交易確認**：`applySync` 全程包在單一 `ds.transaction(manager => …)`（org insert/update + account insert/update/disable，含所有切批 INSERT）。任一步失敗 → 整批 rollback → 同步前資料完全一致（F004 Postconditions / US-010 AC3）。SYNC_RUN 之 create/finish 為交易外之獨立寫入（失敗紀錄本應持久化）。

**新增回歸測試（讓 bug 不再回來）**：
| 測試 | 驗證 |
|---|---|
| `param-batching.spec.ts`（7） | 2771×13 / 303×9 每批 ≤ 2000 且 < 2100、不遺漏不重複順序保留、欄位數>預算時每批至少 1 列 |
| `org-sync.service.spec.ts`「>2100 筆來源 → load-all O(1)」 | 2771 筆來源 → `findExistingAccounts` **只呼叫 1 次**（與筆數無關）、全數新增成功 |
| `org-sync.service.spec.ts`「applySync 交易失敗」 | failed + **`SYNC_WRITE_FAILED`**（非 SOURCE_UNAVAILABLE）、`applied` 為空、資料不變、鎖釋放 |

**檔案異動（Bugfix #1）**：
- `param-batching.ts`(+spec) — new（切批純函式）
- `org-sync.types.ts` — `findAccountsByLoginIds` → `findExistingAccounts`（介面移除鍵清單參數）
- `org-sync.service.ts` — 呼叫 `findExistingAccounts`；`applySync` 包 try/catch → `SyncWriteError`；`classifyFailure` 加 `SYNC_WRITE_FAILED`
- `typeorm-org-sync.store.ts` — `findExistingAccounts` load-all（移除 `In()`）；orgCreates/accountCreates 以 `chunkByParamBudget` 切批 INSERT
- `org-sync.service.spec.ts` — FakeStore 改名 + 呼叫計數 + `failApplySync`；新增 2 回歸測試

### Bugfix #1 之後續 hotfix（coordinator，一併紀錄）
- **`fieldsPerRow` 自我推導**：`typeorm-org-sync.store.ts` 之 org/account 批次 INSERT 的每列欄位數改由 `Object.keys(row).length` 推導（原硬編 13，但帳號 insert 物件實為 **14 欄**＝153×14=2142 仍超 2100）。改推導後欄位再變動不會漂。
- **`typeorm-org-sync.store.spec.ts`(new)**：以 fake `DataSource`/`manager` 攔截 insert 批次，對真實 store 程式碼斷言「每批 列數×欄位數 ≤ 2100」（org 500 + account 3000，確有切批且兩路徑皆覆蓋）。
- `@types/mssql` 已安裝、原 `src/types/mssql.d.ts` ambient stopgap 已移除、tsc 全綠。

## Bugfix #3 — MSSQL datetime 範圍溢位（2026-07-21 dev 實跑 `sync:once`）

**現象**：帳號 INSERT → `QueryFailedError: Validation failed for parameter '795'. Out of range.`（errorCode 已正確為 `SYNC_WRITE_FAILED`）。參數 795 落在某列 datetime 欄位（`resignDate`/`hireDate`/`upstreamModifiedAt`）。

**根因**：MSSQL **`datetime` 型別範圍僅 1753-01-01 ～ 9999-12-31**。上游（遮罩 dev）之日期值有問題：可能 < 1753、Invalid Date（遮罩破壞）、或哨兵 `9999-12-31` 之上界溢位（`9999-12-31 23:59:59.999` 進位即超出）。tedious 綁定時 "Out of range"。小 mock 用的都是安全日期，故未觸發。

**修法（兩管齊下）**：
1. **日期正規化純函式**（TDD）：新增 `normalizeUpstreamDate(raw): Date | null`（`upstream-date.ts`）——
   - 哨兵年份 >= 9999（未離職/未結束，契約 §4）→ **null**（語意乾淨、且避開 datetime 上界溢位）。
   - Invalid Date（`isNaN`）→ null。
   - 低於 datetime 下界（< 1753）/ 明顯異常 → null。
   - 正常日期 → 原樣 passthrough。
   於 `normalization.ts` 之 `normalizeAccount` 對 `RESIGNDT`/`HIREDT`/`MTDT` 一律套用；`NormalizedAccount.upstreamModifiedAt` 改為 `Date | null`；服務層水位計算加 null 守衛（null 不參與水位推進）。**移除舊 `optionalDate`/`requireDate`**（原本壞日期會使整列成髒；現改為收斂 null、保留帳號其餘白名單欄位）。
2. **欄位型別 datetime → `datetime2`**（範圍 0001–9999，第二道防線）：`account.entity.ts` 之 `resignDate`/`hireDate`/`upstreamModifiedAt`、`sync-run.entity.ts` 之 `watermark`（承載 MTDT 水位）。`startedAt`/`endedAt`/`disabledAt` 屬我方 `now()`、恆在範圍內，未動。

**新增/調整測試**：
| 測試 | 驗證 |
|---|---|
| `upstream-date.spec.ts`（8，new） | null/空→null、Invalid→null、哨兵 9999（含溢位邊界）→null、<1753→null、邊界 1753-01-01→保留、正常→passthrough |
| `normalization.spec.ts`（調整） | RESIGNDT 哨兵→null、真實離職日→保留、<1753→null；MTDT 無法解析→`upstreamModifiedAt=null`（**不再使整列成髒**，帳號仍保留） |
| `org-sync.service.spec.ts`（調整+新增） | 「髒資料」改以空 USERID 觸發（壞日期不再成髒）；新增「壞日期→帳號仍新增、日期收斂 null、dirtyRows=0」；seed helper 之未離職 resignDate 改 null（與正規化一致，無異動測試方能 noop） |

**檔案異動（Bugfix #3）**：
- `upstream-date.ts`(+spec) — new（日期正規化純函式）
- `normalization.ts` — 套用 `normalizeUpstreamDate`；`upstreamModifiedAt: Date|null`；移除 `optionalDate`/`requireDate`
- `org-sync.service.ts` — 水位計算加 `upstreamModifiedAt !== null` 守衛
- `account.entity.ts` / `sync-run.entity.ts` — 上游日期欄改 `datetime2`
- `database/migrations/1721692800000-datetime2-dates.ts` — new（ALTER COLUMN datetime→datetime2；未改已套用之 baseline/org-sync migration）
- `normalization.spec.ts` / `org-sync.service.spec.ts` — 調整如上

## 收尾增量（US-011 同步紀錄查詢端點 ＋ 每日排程 cron）— 2026-07-21

> 純後端收尾兩項，嚴格 TDD（red → green）。不碰前端。
> 全套 `npx jest`：**20 suites / 229 tests 全綠**（原 205 ＋ 新增 24）；`npx tsc --noEmit` 乾淨。

### 測試結果（red → green）
| 情境 | 對應測試 | 狀態 |
|---|---|---|
| listRecentRuns 以 `startedAt DESC` + `take=limit` 查詢 SYNC_RUN、投影為 8 欄 SyncRunSummary（不含 watermark/triggeredBy）、保留 failed 之 errorCode | `typeorm-org-sync.store.spec.ts`（+4） | PASS |
| service.recentRuns 正規化 limit（預設 20／上限 100／小數向下取整／非法回預設）並透傳 store 結果 | `org-sync.service.spec.ts`（+9） | PASS |
| controller.recentRuns 解析 limit 字串→數字並委派；路由為 `GET runs`（不與 `POST run` 衝突）；RBAC read＝SysAdmin/ICSOPAdmin 放行、Supervisor/DeptContact/User 403 | `org-sync.controller.spec.ts`（+8） | PASS |
| ScheduledOrgSyncService.runScheduled 以 `('scheduled', null)` 呼叫引擎；svc 拋一般例外／`SYNC_IN_PROGRESS` 均被吞掉不外拋 | `scheduled-org-sync.service.spec.ts`（+3，new） | PASS |

### 1. US-011 同步紀錄查詢端點（供前端輪詢）
- 端點：`GET /admin/org-sync/runs?limit=N`。
  - `limit` 預設 20、上限 100；非法值（缺省/NaN/<1）回預設 20；小數向下取整。正規化由 `OrgSyncService.recentRuns` 之純函式 `clampRunsLimit` 統一負責（單一 choke point，任何呼叫端一致）。
  - 依 `startedAt` 由新到舊取 N 筆。
- 保護：`@UseGuards(SessionGuard, RolePermissionGuard)` + `@RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'read')`。矩陣 read → **SysAdmin 與 ICSOPAdmin 皆可讀**；主管/部門窗口/使用者 403 `PERMISSION_DENIED`（與手動觸發 `POST run` 之 `write`＝僅 SysAdmin 有別）。
- 分層：`OrgSyncStore.listRecentRuns(limit)` 介面新增（TypeOrmOrgSyncStore 以 `find({ order:{startedAt:'DESC'}, take:limit })` 實作，投影為 `SyncRunSummary`）；`OrgSyncService.recentRuns(limit?)` 薄封裝（clamp 後下推）；controller 解析查詢字串後委派。
- **端點回傳契約（前端對接）**：HTTP 200，body 為 `SyncRunSummary[]`（新到舊）。單筆形狀：
  ```json
  {
    "id": "uuid 字串",
    "triggerType": "scheduled | manual",
    "status": "running | success | failed",
    "startedAt": "ISO8601 字串（Date 序列化）",
    "endedAt": "ISO8601 字串 | null",
    "changeCount": 0,
    "errorCode": "字串 | null",
    "errorMessage": "字串 | null"
  }
  ```
  - `status='running'` 表示同步進行中（前端「執行中→輪詢」據此判定）；`failed` + `errorCode='DISAPPEARED_RATIO_EXCEEDED'` 供前端區分「已中止」與一般失敗（US-011 AC4）。
  - **刻意不外洩**：`watermark`（MTDT 水位）與 `triggeredBy`（觸發者 loginId）為內部欄位，不列入摘要。

### 2. 每日排程 cron（OQ-E02-02：02:00 UTC+8）
- 新依賴 `@nestjs/schedule`（`^6.1.3`）；`AppModule` 加 `ScheduleModule.forRoot()`（以 discovery 掃描全 app 之 `@Cron` metadata）。
- 新 provider `ScheduledOrgSyncService`（掛於 `OrgSyncModule`）：`@Cron('0 2 * * *', { name:'org-sync-daily', timeZone:'Asia/Taipei' })` 之 `runScheduled()` 呼叫 `OrgSyncService.run('scheduled', null)`，全程 try/catch — 失敗（含互斥 `SYNC_IN_PROGRESS`、`hasRunningSyncRun` 之 DB 例外）僅記 log，不讓未捕捉例外自 cron 回呼外拋而中斷程序。
- **啟動安全**：`ScheduleModule.forRoot()` 與 `@Cron` 註冊僅排定下一次觸發時間，**不連線** DB/上游；reader/store 之連線維持延遲（`ensureInit`/`getPool` 於實際 `run()` 才連）。故 `npm run start:dev` 啟動不因 DB/上游而崩潰（cron 僅於 02:00 台北時間才實跑）。
- **測試策略**：不測 `@Cron` decorator 之時間觸發（難確定性驗證），改直接測 `runScheduled()` 之委派與吞例外行為（mock svc）。

### 檔案異動（收尾增量）
| 檔案 | 類型 | 說明 |
|---|---|---|
| `backend/src/org-sync/org-sync.types.ts` | modified | 新增 `SyncRunSummary` 型別；`OrgSyncStore` 介面加 `listRecentRuns(limit)` |
| `backend/src/org-sync/typeorm-org-sync.store.ts`(+spec) | modified | 實作 `listRecentRuns`（startedAt DESC/take/投影）；spec +4 |
| `backend/src/org-sync/org-sync.service.ts`(+spec) | modified | `recentRuns` 薄封裝 + 匯出 `clampRunsLimit`/`DEFAULT_RUNS_LIMIT`/`MAX_RUNS_LIMIT`；spec +9（FakeStore 補 `listRecentRuns`） |
| `backend/src/org-sync/org-sync.controller.ts`(+spec) | modified | 新增 `@Get('runs')` + read 權限；spec +8（委派＋路由＋RBAC 契約） |
| `backend/src/org-sync/scheduled-org-sync.service.ts`(+spec) | new | `@Cron` 每日 02:00 台北；spec +3 |
| `backend/src/org-sync/org-sync.module.ts` | modified | 掛 `ScheduledOrgSyncService` provider |
| `backend/src/app.module.ts` | modified | 加 `ScheduleModule.forRoot()` |
| `backend/package.json` / `package-lock.json` | modified | 新增依賴 `@nestjs/schedule` |

### 收尾增量之待裁決/待辦（flag）
- **排程重試未實作**：OQ-E02-02 定案含「失敗 3 次遞增間隔重試」。本增量依任務範圍僅實作「try/catch 記 log」，**尚未**實作遞增間隔重試與失敗通知（NFR-006）。屬下一增量；非本次範圍，故未阻斷。
- 上述皆不改既有 auth/RBAC/F004 引擎行為，`docs/specs/` 維持唯讀（未編輯）。

## 已知限制 / 待辦

- **前端頁**：prototype `prototypes/09-org-sync-management.html` 待移植（下一增量）。US-011 之查詢端點 **`GET /admin/org-sync/runs`（read 權限）已就緒**，前端「執行中→輪詢結果」可直接輪詢此端點（依 `status` 由 running→success/failed 收斂）。手動觸發 `POST run` 仍為同步執行並回傳結果。
- **排程 cron**：已掛載 `@nestjs/schedule`（`ScheduleModule.forRoot()` + `ScheduledOrgSyncService @Cron 02:00 Asia/Taipei`，見「收尾增量」）。OQ-E02-02 之「失敗 3 次遞增間隔重試」與通知（NFR-006）**尚未**實作，待下一增量。
- **公司主檔 VW_HRCOMF**：本 pass 未同步（無 COMPANY 實體、無對應可測 AC；浮水印公司名為 F020 範圍）。已於範圍註明，待需要時補 COMPANY 實體。
- **F025 guard**：`SysAdminGuard` 為佔位（硬編 SysAdmin）；F025 角色×功能矩陣就緒後應改由矩陣統一判定並移除硬編角色檢查。
- **AD/AJ 孤兒處理**：本輪僅 AS（孤兒率 0.0%）；AD 22.1%／AJ 84.9% 於多公司擴充前必須先處理（契約 §7.3/§10.1）。引擎已對孤兒「保留+警告」，未來多公司時之孤兒策略（是否阻擋擴充）待定。
- **`mssql` 型別**：已解決。coordinator 已安裝 `@types/mssql`（dev），原 `backend/src/types/mssql.d.ts` ambient stopgap 已移除；reader 用法相容、tsc 全綠。
- **MTDT 水位時區**：`formatSqlDate` 以 UTC 格式化；對上游 MTDT 之時區對齊須於**正式環境**覆核（dev 資料已遮罩，僅驗結構/筆數合理）。
- **SYNC_RUN 無 companyCode**：`getAccountWatermark` 取最近成功 run 之 watermark，本輪單公司（AS）正確；多公司擴充需為 SYNC_RUN 增 companyCode 或改水位鍵。

## 驗證指令（人工執行，agent 不自動跑）

```
cd backend
npm run migration:run          # 對 APP_MSSQL 套用 1721606400000-org-sync（先確保 baseline 已跑、seed 過 5 角色）
npm run sync:once              # 對真實 dev 上游 + 應用 MSSQL 跑一次同步
```

`sync:once` 會印出：SYNC_RUN 結果（runId/status/changeCount/errorCode）、讀取筆數（部門/帳號/消失）、異動筆數（組織新增更新、帳號新增更新停用、孤兒、髒資料）、推導後各 tier 分布。
- ⚠ 需真實連線（UPSTREAM_* 與 APP_MSSQL_* 皆填妥）。dev 上游個資已遮罩：驗收以「結構正確、筆數合理」為準，不對 email/姓名等遮罩值斷言。
- 預期參考量（契約 §10.2）：AS 有效部門 114、在職 1,114；tier 分布（本部 5／部 24／處室 57／課 27＋Root 1）。

## 與規格衝突需裁決之處

- 無阻斷性衝突。上述**設計決策 §1（PERSON/ACCOUNT）**、**§2（消失閾值 vs EMPSTS）**、**§5（errorCode 欄）** 為需知會之詮釋/擴充，均以契約與 AC 為據，非自行臆造；若 system-architect 對 PERSON 實體或 SYNC_RUN 欄位有不同定案，再據以調整。
