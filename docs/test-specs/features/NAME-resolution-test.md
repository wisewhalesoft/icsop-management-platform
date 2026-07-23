# NAME-resolution · Test Design
> worktree: org-foundation · 2026-07-22
> source: git-worktree-guide.md（名稱解析服務）、docs/specs/data-model.md#person-entity #orgunit-entity #documentchangelog-entity、docs/specs/features/F014-accountable-dept-chief.md、F017-backend-document-list.md

## 範圍聲明（沿用/擴充之既有 org-sync 元件，不重設其既有測試）

- **新增**：共用 `employeeNo → 姓名`、`orgId → 名稱/路徑` 名稱解析 helper，供 F014（當責室長顯示）、F017（清單室長欄）、public、doc-edit 等模組重用，避免各模組各自查詢/各自組字。
- **沿用既有讀取儲存介面，不重測其同步本身**：helper 委派 `PersonStore`（ORG-PERSON-sync-test.md 新增）與 `OrgUnitReadStore`（ORG-read-endpoints-test.md 新增）之既有讀取方法，本檔僅測試 helper 本身之**純邏輯**（組合、fallback、批次化）與其呼叫契約，不重複驗證底層 store 之資料正確性。
- 本檔為**跨模組共用元件**，優先於各消費模組（F014/F017/public/doc-edit）各自實作前定案，避免介面形狀分歧。

## 測試策略（unit＝假 upstream reader/假 store；真上游/DB 同步＝[integration] 序列化）

- **unit**：假 `PersonStore`／`OrgUnitStore`（記憶體 Map，比照既有 org-sync 測試慣例）。
- **無 [integration]**：helper 本身不含額外 IO（純委派既有 store 之查詢方法），真實 DB 之查詢正確性已由 ORG-PERSON-sync-test.md／ORG-read-endpoints-test.md 之 `[integration]` 情境涵蓋，本檔不重複。

## Test Scenarios

### TS-NAMERES-001 employeeNo → 姓名：命中在職人員 [unit]
- **Given** `PersonStore` 內有 `employeeNo='E001', name='王小明', employmentStatus='active'`
- **When** 呼叫 `resolvePersonName('E001')`
- **Then** 回傳 `'王小明'`

### TS-NAMERES-002 employeeNo → 姓名：命中離職人員仍正確回傳 [unit]
- **Given** `employeeNo='E002', employmentStatus='departed'`
- **When** 呼叫 `resolvePersonName('E002')`
- **Then** 回傳姓名（非「找不到」），**不因離職而拒絕解析**
- 對應 hard constraint「name-resolution for departed persons」；呼應 ORG-PERSON-sync-test.md TS-PERSON-005

### TS-NAMERES-003 employeeNo → 姓名：查無此員編 → 明確「找不到」值，非 throw [unit]
- **Given** `PersonStore` 查無該 `employeeNo`
- **When** 呼叫 `resolvePersonName('E999')`
- **Then** 回傳明確之「找不到」值（`null` 或約定 fallback 字串，如 `'（查無此人）'`——具體值待與消費端 UI 約定），**不拋未捕捉例外**

### TS-NAMERES-004 批次解析：多個 employeeNo → Map，含未命中鍵之寬容處理 [unit]
- **Given** 5 個 `employeeNo`，其中 2 個查無對應人員
- **When** 呼叫批次解析（如 `resolvePersonNames(['E1'..'E5'])`）
- **Then** 回傳 `Map<employeeNo, name>`，3 筆命中鍵含正確姓名；2 筆未命中鍵**不拋錯**（可為缺席於 Map、或值為 null，具體約定待實作時定案），呼叫端可自行決定如何呈現缺漏
- 對應 F017 清單頁需一次解析多筆室長姓名之效能情境（避免每列逐一查詢造成 N+1）

### TS-NAMERES-005 orgId → 名稱：命中 → 回傳單層名稱（DESC_CHI）[unit]
- **Given** `OrgUnitStore` 內有 `orgCode='JAC00', name='審查室'`
- **When** 呼叫 `resolveOrgUnitName('JAC00')`
- **Then** 回傳 `'審查室'`

### TS-NAMERES-006 orgId → 路徑：命中 → 回傳由 Root 至該單位之完整路徑 [unit]
- **Given** fixture 含完整鏈：Root(`00000`,「和潤本部」) → `J0000`「營業二本部」→ `JA000`「營運管理部」→ `JAC00`「審查室」
- **When** 呼叫 `resolveOrgUnitPath('JAC00')`
- **Then** 回傳依層級由上至下組成之路徑（各層 `name` 以既定分隔符連接，如「和潤本部/營業二本部/營運管理部/審查室」；分隔符具體約定見 OQ-NAMERES-1）

### TS-NAMERES-007 orgId → 路徑：Root 節點本身 → 路徑為單一節點 [unit]
- **Given** 查詢對象為 Root 節點自身
- **When** 呼叫 `resolveOrgUnitPath('00000')`
- **Then** 回傳僅含 Root 名稱之路徑（不因無上層而回傳空字串或拋錯）

### TS-NAMERES-008 orgId → 路徑：查無此 orgId → 明確「找不到」值，非 throw [unit]
- **Given** `OrgUnitStore` 查無該 `orgCode`
- **When** 呼叫 `resolveOrgUnitPath('ZZZZZ')`
- **Then** 回傳明確之「找不到」值，不拋未捕捉例外

### TS-NAMERES-009 orgId → 路徑：5 層皆存在時路徑含全部 5 段（含課層）[unit]
- **Given** fixture 含 5 層完整鏈，查詢對象為 `SUBSECTION`（課）層單位（如契約 §8.3 範例 `BJAA0`「醫療一課」，其鏈為 供應商金融部→北區綜合處→醫療一課）
- **When** 呼叫 `resolveOrgUnitPath`
- **Then** 路徑含全部層級（不因原 4 層假設而漏「課」層這最後一段）
- 對應契約 §3.5「較原假設多出課層」之防退化測試——確保本 helper 之實作未沿用舊有「4 層」假設

### TS-NAMERES-010 employeeNo 重複情境：不因重複而中斷呼叫端 [unit]
- **Given** `PersonStore` 內（若 PERSON 唯一性假設最終未成立，見 ORG-PERSON-sync-test.md OQ-PERSON-2）對同一 `employeeNo` 存在 2 筆記錄
- **When** 呼叫 `resolvePersonName`
- **Then** 不拋未捕捉例外，回傳其中一筆（具體選取規則——如「最新 `syncedAt`」——待 OQ-PERSON-2 定案後補完，本情境先驗證「不中斷」之底線行為）
- 與 ORG-PERSON-sync-test.md OQ-PERSON-2 為同一議題之交叉引用，不於本檔重複展開細節

### TS-NAMERES-011 消費端契約：F014 當責室長預設候選姓名顯示 [unit]
- **Given** 選定制定室別之 `ORG_UNIT.managerEmpNo` 有值
- **When** F014 呼叫 `resolvePersonName(managerEmpNo)` 取得候選人姓名顯示
- **Then** 正確回傳姓名，驗證 helper 介面滿足 F014 之呼叫需求（純契約驗證，非重測 F014 業務邏輯本身）
- 對應 F014 AC「managerEmpNo 有值且在職 → 帶入為預設候選值」

### TS-NAMERES-012 消費端契約：helper 為同步可用之立即回傳（適合交易內呼叫）[unit]
- **Given** data-model 對 `DOCUMENT_CHANGE_LOG`（F037，尚未開始）之明確要求：「人員/組織欄位快照須於來源功能計算 diff **當下（同一交易內）**解析顯示名稱並存入，非延遲解析」
- **When** 於模擬交易情境內呼叫 `resolvePersonName`／`resolveOrgUnitPath`
- **Then** 呼叫為單次 `await` 即可取得結果之型態（非需另行排入非同步佇列），介面設計本身即支援「交易內同步呼叫」模式
- 雖 F037 本身未開始（feature-status.md 標記 ⬜），但本 helper 之呼叫介面設計需及早滿足此未來需求，避免日後 API 形狀不相容而需重構呼叫端

## 覆蓋對照表

| Scenario | 類型 | 對應來源/AC |
|---|---|---|
| TS-NAMERES-001~004 | unit | worktree 目標「employeeNo→姓名」；F017 批次效能 |
| TS-NAMERES-005~009 | unit | worktree 目標「orgId→名稱/路徑」；契約 §3.5 5 層防退化 |
| TS-NAMERES-010 | unit | 交叉引用 OQ-PERSON-2 |
| TS-NAMERES-011 | unit | F014 消費端契約 |
| TS-NAMERES-012 | unit | F037 未來需求前瞻相容性 |

## 開放設計問題

1. **OQ-NAMERES-1：orgId → 路徑之分隔符與呈現格式未定案。** F020 浮水印對「處/室」欄有專屬定案格式（契約 §8.2：`DESC_CHI` 以 `/` 切分取最後一段），本 helper 之「完整路徑」用途（如 UI 麵包屑、F014 選單顯示脈絡）是否需與浮水印格式一致，或可獨立設計較寬鬆之呈現格式（如用於畫面顯示可用「>」分隔更易讀）。建議與 F020 worktree 協調，避免兩套路徑組字邏輯各自發展造成不一致的使用者體驗（同一組織路徑在不同畫面呈現不同格式）。
2. **OQ-NAMERES-2：承 ORG-PERSON-sync-test.md OQ-PERSON-2（`employeeNo` 唯一性未定案）。** 本 helper 之 `resolvePersonName` 查詢鍵設計（單筆 vs 需處理多筆匹配）直接依賴該定案結果，TS-NAMERES-010 已預留底線行為測試，完整規則待上游來源確認後回填。
3. **OQ-NAMERES-3：快取策略未定。** 是否需要 in-memory cache 減少高頻查詢之 DB 往返（如 F017 清單頁每列皆需解析室長姓名，若無批次化易產生 N+1）。因規模小（契約規模：≤1,114 在職人員／114 有效組織單位），效能風險低，TS-NAMERES-004 之批次化介面已提供基本緩解，暫不視為阻塞項，僅記錄供未來效能量測階段（NFR-001 P95 門檻）覆核是否仍需額外快取層。
