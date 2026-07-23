# ORG-descfull-normalization · Test Design
> worktree: org-foundation · 2026-07-22
> source: backend/src/org-sync/normalization.ts、change-classification.ts、typeorm-org-sync.store.ts、database/entities/org-unit.entity.ts、docs/specs/upstream-hr-source-contract.md（§5.1/§8.2）、docs/specs/data-model.md#orgunit-entity

## 範圍聲明（沿用/擴充之既有 org-sync 元件，不重設其既有測試）

- **不重設**：`normalization.spec.ts`／`org-hierarchy.spec.ts`／`typeorm-org-sync.store.spec.ts`／`org-sync.service.spec.ts` 之既有 `ORG_UNIT` 同步情境（`tier`/`parentCode`/`codePrefix`/`name`/`managerEmpNo`/`isActive` 之既有正規化與分類邏輯不變）。
- **本檔僅新增**：`DESC_FULL`（部門全名，衍生部門完整名稱，供 F020 浮水印「部門」欄）之保留相關情境——正規化（`normalizeDept`）、異動分類（`classifyOrgUnit`）、儲存（`applySync`/entity）、既有列回填（backfill）四層變更。
- **已確認之現況（讀碼結果）**：`upstream-queries.ts` 之 `DEPT_COLUMNS` **已包含** `DESC_FULL`（第 36 行），即上游查詢層已取回該欄位；但 `normalization.ts` 之 `RawDept` 介面雖宣告 `DESC_FULL?: string | null`（第 34 行），`normalizeDept()` 函式本體**完全未使用該欄位**，`NormalizedOrgUnit` 介面（第 55-64 行）亦無 `descFull` 欄位——資料在正規化這一步被靜默丟棄，非查詢層缺漏。本檔測試據此鎖定正規化層為主要變更點。
- **明確排除於本檔範圍**：`descFull` 之「無部層時 fallback 取本部層」語意（契約 §8.2）屬 **F020 浮水印組裝**之責任，非本次「保留欄位」之責任（本次僅需忠實保存上游原始 `DESC_FULL` 值）；此邊界以聲明性情境 TS-DESCFULL-010 明確標註，避免與 F020 worktree 範圍混淆。

## 測試策略（unit＝假 upstream reader/假 store；真上游/DB 同步＝[integration] 序列化）

- **以 unit 為主**（純邏輯＋假 store），因既有全量同步機制（`ORG_UNIT` 每次全量取回，非增量）本身即會在下次同步時覆蓋既有列，其「同步流程是否正確觸發」已由既有 `org-sync.service.spec.ts` 覆蓋，本檔僅新增 `descFull` 相關斷言，不重複測試同步流程骨架。
- **[integration]**：驗證既有（加欄前建立、`descFull=null`）之真實 `ORG_UNIT` 資料列，在欄位新增＋下一次真實全量同步後，是否確實被回填，序列化執行一次即可（非重複驗證項）。

## Test Scenarios

### TS-DESCFULL-001 正規化：DESC_FULL 有值 → descFull 保留 [unit]
- **Given** `RawDept.DESC_FULL = '營運管理部'`
- **When** 呼叫 `normalizeDept(raw, now)`
- **Then** 回傳之 `NormalizedOrgUnit.descFull === '營運管理部'`
- 對應 worktree 目標「DESC_FULL 保留」；契約 §5.1「`name` ← `DESC_CHI` 簡稱；`DESC_FULL` 為全名備用」

### TS-DESCFULL-002 正規化：DESC_FULL 為 null/空字串 → 正規化為 null [unit]
- **Given** `RawDept.DESC_FULL = null` 或 `''`
- **When** 呼叫 `normalizeDept`
- **Then** `descFull === null`（比照既有 `nullableStr` 慣例，不因此使整列成髒資料）

### TS-DESCFULL-003 正規化：DESC_FULL 前後有空白 → trim 後儲存 [unit]
- **Given** `RawDept.DESC_FULL = '  營運管理部  '`
- **When** 呼叫 `normalizeDept`
- **Then** `descFull === '營運管理部'`（去頭尾空白）

### TS-DESCFULL-004 classifyOrgUnit：僅 descFull 變更 → 現況會誤判為 noop（迴歸缺口）[unit]
- **Given** 既有 `ExistingOrgUnit` 之 `descFull` 與來源不同、其餘欄位（`tier`/`codePrefix`/`parentCode`/`name`/`managerEmpNo`/`isActive`）皆相同
- **When** 呼叫 `classifyOrgUnit(source, local)`
- **Then**（**現況程式碼會回傳 `noop`，因比對清單未含 `descFull`**——本情境明確標註為「必須修正之迴歸缺口」，非既有正確行為）；修正後應回傳 `update`
- 對應 OQ-DESCFULL-1；直接影響 TS-DESCFULL-006 之回填是否可達成

### TS-DESCFULL-005 classifyOrgUnit：descFull 變更與既有欄位變更同時發生 → 仍判定 update（不受影響）[unit]
- **Given** `descFull` 與 `name` 皆與來源不同
- **When** 呼叫 `classifyOrgUnit`
- **Then** 判定為 `update`（此情境現況已通過，因 `name` 變更本身即觸發 update；用於與 TS-DESCFULL-004 對照，證明問題僅發生於「唯獨 descFull 變更」時）

### TS-DESCFULL-006 既有列回填：既有列 descFull=null（加欄前建立）→ 下次全量同步自動補齊 [unit]
- **Given** 假 `OrgSyncStore.findOrgUnits()` 回傳一筆既有記錄 `descFull=null`；假 reader 本次回傳同一部門且 `DESC_FULL` 有值
- **When** 執行完整同步流程（`OrgSyncService.run`）
- **Then**（**依 TS-DESCFULL-004 之修正後行為**）該筆被分類為 `update` 並寫入非 null 之 `descFull`；驗證「回填是下一次全量同步自動達成的副作用，不需要獨立 migration/backfill script」
- 對應 worktree 目標「DESC_FULL backfill for existing rows」；**此情境之通過前提為 TS-DESCFULL-004 之修正已落實**，兩者為因果關係，非各自獨立

### TS-DESCFULL-007 applySync 寫入：orgCreates／orgUpdates 皆包含 descFull 欄位並正確落地 [unit]
- **Given** `SyncPlan.orgCreates`／`orgUpdates` 內之 `NormalizedOrgUnit` 含 `descFull`
- **When** 呼叫 `applySync`（對假 store）
- **Then** 假 store 收到之 insert/update 物件皆含正確 `descFull` 值
- 對應 `typeorm-org-sync.store.ts` 之 `applySync` 現有寫入邏輯需同步擴充（`orgRows` insert 物件、`manager.update` 之 update 物件皆須新增此欄位）

### TS-DESCFULL-008 Entity 契約：OrgUnit entity 新增 descFull 為 nullable [unit，schema 層級斷言]
- **Given** `OrgUnit` entity 定義
- **When** 檢視新增欄位
- **Then** `descFull` 型別為 nullable `nvarchar`（比照既有 `name` 欄位之 `nvarchar` 型別，但允許 null，因既有列回填前必為 null、且上游本身亦可能為 null，見 OQ-DESCFULL-2）

### TS-DESCFULL-009 [integration] 既有真實資料列於加欄＋全量同步後 descFull 皆非 null
- **Given** 真實 MSSQL、`ORG_UNIT` 表已新增 `descFull` 欄位（migration 已執行）、既有 114 筆有效部門列 `descFull` 皆為 null（加欄前建立）
- **When** 執行一次真實全量同步
- **Then** 除上游本身 `DESC_FULL` 為 null 之列外，其餘皆被回填為非 null 值
- 一次性驗證項，非重複執行測試

### TS-DESCFULL-010 範圍聲明性測試：descFull 之 fallback 語意不在本檔斷言範圍 [unit，聲明性]
- **Given** 一個位於 `本部`(`DIVISION`) 層或 `Root` 層、無下層部門單位之情境
- **When** 讀取該單位之 `descFull`
- **Then** 本檔僅斷言「保存上游原始值」（可能為該層本身之 `DESC_FULL`，或 null），**不斷言**契約 §8.2「無部層時 fallback 取本部層 DESC_FULL」之組裝邏輯——該 fallback 屬 F020 浮水印組裝服務之責任，非本次 `ORG_UNIT` 保留欄位之責任；此情境用於避免測試設計範圍混淆，非功能斷言

## 覆蓋對照表

| Scenario | 類型 | 對應來源/AC |
|---|---|---|
| TS-DESCFULL-001~003 | unit | worktree 目標「DESC_FULL 保留」；契約 §5.1 |
| TS-DESCFULL-004/005 | unit | 迴歸缺口辨識（OQ-DESCFULL-1）|
| TS-DESCFULL-006 | unit | worktree 目標「backfill」 |
| TS-DESCFULL-007/008 | unit | 儲存層/schema 擴充 |
| TS-DESCFULL-009 | integration | 端到端回填驗證 |
| TS-DESCFULL-010 | unit（聲明性）| 範圍邊界（vs F020） |

## 開放設計問題

1. **OQ-DESCFULL-1（實作範圍提醒，非產品決策）：現行 `classifyOrgUnit`（`change-classification.ts`）之異動比對清單未含 `descFull`。** 若僅新增 `descFull` 欄位與正規化邏輯、卻不同步修改 `classifyOrgUnit` 之比對清單，將導致「既有列回填」機制永遠不會被觸發——因為既有列除 `descFull` 外其餘欄位皆相同，會被誤判為 `noop` 而不寫入。此為**必須連動修正**的程式碼變更範圍，需於 tdd-developer 實作階段明確涵蓋 `change-classification.ts` 之修改（新增一行 `source.descFull !== local.descFull` 至 `changed` 判斷式），並同步在 `ExistingOrgUnit` 介面新增 `descFull` 欄位。TS-DESCFULL-004/006 已將此依賴關係明確標註。
2. **OQ-DESCFULL-2：`DESC_FULL` 上游是否保證非 null 未經契約明確聲明。** 契約 §5.1 僅稱其為「全名備用」，未如 `DESC_CHI`／`CODE` 等欄位明確聲明其必填性。若確實可能為 null（尤其 `Root`／`DIVISION` 層是否恆有值未經實測），F020 浮水印之 fallback 鏈（部→本部→Root）最終落底情境（若 Root 本身 `DESC_FULL` 亦為 null）需額外處理規則，建議與 F020 worktree 協調是否需要一次性上游實測（比照 OQ-E02-01 唯讀盤點模式）確認各層 `DESC_FULL` 之實際填值率。
