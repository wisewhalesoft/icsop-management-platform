# ORG-COMPANY-sync · Test Design
> worktree: org-foundation · 2026-07-22
> source: docs/specs/upstream-hr-source-contract.md（§2/§5.3/§10.1/§11 #2）、docs/specs/data-model.md（COMPANY 未獨立條目，見 §5.3 對映）、docs/specs/features/F020-watermark.md（消費端）

## 範圍聲明（沿用/擴充之既有 org-sync 元件，不重設其既有測試）

- **新增**：`COMPANY` 實體＋其同步邏輯（`VW_HRCOMF` → `COMPANY`），供 F020 浮水印「公司名稱」欄使用 `COMPFULLNM` 全稱（F004 已標記 `VW_HRCOMF` 未同步，本輪補上）。
- **沿用既有引擎骨架**：與 `ORG_UNIT` 同為「小量、全量取回」模式（`VW_HRCOMF` 全體僅 3 筆：`AC`/`AE`/`AS`），比照 `org-hierarchy`／`normalization` 之純邏輯＋假 store 測試慣例；**不重測** `ORG_UNIT`／`ACCOUNT` 既有同步情境。
- 本輪目標欄位以 F020 消費需求為底線（`companyName`＝`COMPFULLNM`），但為避免日後欄位需求零星增補，測試設計涵蓋契約 §5.3 全部 4 欄（`companyCode`/`companyName`/`companyShortName`/`isActive`）。
- 同步排程/交易邊界（併入既有 `OrgSyncService.run()` 或獨立服務）、同步範圍（僅 AS 或全 3 家）皆未定案，見開放設計問題；本檔情境依「引擎無關」（純邏輯＋介面）方式設計，供任一實作路徑收斂。

## 測試策略（unit＝假 upstream reader/假 store；真上游/DB 同步＝[integration] 序列化）

- **unit**：假 `CompanyUpstreamReader`（回傳 `RawCompany[]`）＋假 `CompanyStore`（記憶體 Map），比照 `org-sync` 系列 Fake 慣例。
- **[integration]**：真實 `VW_HRCOMF` 讀取（`OPENQUERY` 下推）與真實 DB 寫入，序列化執行。

## Test Scenarios

### TS-COMPANY-001 全量同步建立公司主檔 [unit]
- **Given** 假 reader 回傳 3 筆（`AC`/`AE`/`AS`），假 `CompanyStore` 為空
- **When** 執行 COMPANY 同步
- **Then** 3 筆皆建立（或依 OQ-COMPANY-2 定案僅 1 筆 `AS`，兩方案見 TS-COMPANY-006）
- 對應契約 §10.1「`VW_HRCOMF` 僅 3 筆」

### TS-COMPANY-002 既有公司資料無異動 → noop（冪等）[unit]
- **Given** 來源列與既有記錄逐欄相同
- **When** 執行同步
- **Then** 分類為 `noop`，無寫入
- 對應 US-010 同類冪等慣例

### TS-COMPANY-003 COMPFULLNM 異動 → update，正確寫入新全名 [unit]
- **Given** 既有 `companyName` 與來源不同
- **When** 執行同步
- **Then** 分類為 `update`，套用後 `companyName` 與來源一致
- 對應 F020 浮水印公司名稱正確性之前置資料

### TS-COMPANY-004 isActive 由 COMPENDDT 判定（哨兵 9999-12-31 → true）[unit]
- **Given** 來源 `COMPENDDT` 為契約 §4 定義之哨兵值
- **When** 正規化
- **Then** `isActive=true`；判定式與既有 `isDeptActive`（`org-hierarchy`/`employment-status` 之哨兵處理慣例）一致（`> now` 嚴格大於）
- 對應契約 §4 哨兵語意；§5.3 `isActive ← COMPENDDT > GETDATE()`

### TS-COMPANY-005 已結束公司（COMPENDDT 為過去日期）→ isActive=false，仍落地保存 [unit]
- **Given** 來源列 `COMPENDDT` 為過去日期（如契約 §10.1 所述 `AC`(test1) 之 `1900-01-01`）
- **When** 執行同步
- **Then** `isActive=false`，但該筆**仍正常落地**（不因非本輪同步範圍或已結束而整筆略過）
- 對應契約 §10.2「保留 `COMPID` 維度以利日後擴充」之一致精神；惟是否應排除 `AC` 測試資料見 OQ-COMPANY-3

### TS-COMPANY-006 [pending-decision] 同步範圍二擇一情境（比照 ORG_UNIT/ACCOUNT 限 AS，或全量 3 家）
- **方案 A（全量）— Given** 上游回傳 3 筆 **When** 同步 **Then** 3 筆皆落地
- **方案 B（限 AS，比照 `SYNC_COMPID`）— Given** 上游回傳 3 筆 **When** 同步（帶 `compid='AS'` 過濾條件）**Then** 僅 1 筆（`AS`）落地，其餘 2 筆非錯誤、純粹不在查詢範圍
- 兩方案互斥，實作依 OQ-COMPANY-2 定案後保留其一、刪除另一

### TS-COMPANY-007 companyShortName（COMPSIMPNM）一併同步 [unit]
- **Given** 來源列含 `COMPSIMPNM`
- **When** 執行同步
- **Then** `companyShortName` 正確落地（雖非本輪 F020 必要，但契約 §5.3 定義之完整對映）

### TS-COMPANY-008 COMPANY 同步失敗不得回滾/中止既有 ORG_UNIT／ACCOUNT 同步之已成功結果（失敗隔離）[unit]
- **Given** 一次同步執行中，`ORG_UNIT`／`ACCOUNT` 部分已成功套用交易，COMPANY 讀取或寫入階段拋出例外
- **When** 執行同步（無論實作為併入同一 `OrgSyncService.run()` 或獨立 `CompanySyncService`）
- **Then** COMPANY 失敗需被獨立捕捉並記錄，**不得**回滾已完成之 `ORG_UNIT`/`ACCOUNT` 交易，亦不得使整個 `SYNC_RUN` 誤判為與組織/帳號同步同一失敗原因
- 對應 error-handling.md `SYNC_WRITE_FAILED`／交易性原則之精神延伸；具體交易邊界待 OQ-COMPANY-1 定案後精確化本情境之 Given

### TS-COMPANY-009 讀取端點：依 companyCode 取 companyName 全稱 [unit]
- **Given** `CompanyStore` 內已有 `AS` 公司資料
- **When** 呼叫讀取端點查詢 `companyCode='AS'`
- **Then** 正確回傳 `companyName`（`COMPFULLNM`，如「和潤企業股份有限公司」）
- 對應 F020 浮水印公司名稱來源；契約 §8 浮水印欄位對應表

### TS-COMPANY-010 讀取端點：查無公司代碼 → 明確空結果，不拋未捕捉例外 [unit]
- **Given** 查詢一個未同步之 `companyCode`
- **When** 呼叫讀取端點
- **Then** 回傳明確之「查無」結果（null 或 404，依實作慣例），不拋未捕捉例外

### TS-COMPANY-011 [integration] 真實 VW_HRCOMF 讀取＋落地全流程
- **Given** 真實上游連線、真實 MSSQL
- **When** 執行首次同步
- **Then** 落地筆數與契約實測值一致（3 筆，或依 OQ-COMPANY-2 定案後僅 1 筆），`COMPFULLNM` 與契約範例（和潤企業）比對相符

## 覆蓋對照表

| Scenario | 類型 | 對應來源/AC |
|---|---|---|
| TS-COMPANY-001~003 | unit | 契約 §5.3 欄位對映、§10.1 筆數 |
| TS-COMPANY-004/005 | unit | 契約 §4 哨兵語意 |
| TS-COMPANY-006 | pending-decision | OQ-COMPANY-2 |
| TS-COMPANY-007 | unit | 契約 §5.3 完整對映 |
| TS-COMPANY-008 | unit | 失敗隔離（error-handling 交易性精神） |
| TS-COMPANY-009/010 | unit | F020 消費端讀取 |
| TS-COMPANY-011 | integration | 端到端真實同步 |

## 開放設計問題

1. **OQ-COMPANY-1：同步排程/交易邊界未定。** 是否併入既有 `OrgSyncService.run()` 同一次呼叫/同一 `SYNC_RUN`（優點：一次觸發、一份同步歷史；缺點：COMPANY 失敗可能誤判影響 `SYNC_RUN` 整體狀態呈現），或獨立 `CompanySyncService`＋獨立排程（優點：失效隔離清楚；缺點：需額外互斥鎖與排程掛載，增加維運面）。此決定直接影響 TS-COMPANY-008 之精確 Given 條件與 `SYNC_RUN`/`errorCode` 欄位是否需要區分來源。
2. **OQ-COMPANY-2：同步範圍是否限 `COMPID='AS'`（比照 `ORG_UNIT`/`ACCOUNT` 之 `SYNC_COMPID` 慣例）或全量同步既有 3 家。** 因 `VW_HRCOMF` 資料量極小（3 筆），全量同步成本可忽略不計，但為與既有兩個實體之範圍決策保持一致性（§10 決策「本輪僅同步 `COMPID='AS'`」），建議傾向限 `AS`；惟全量落地亦不違反該決策精神（僅多存 2 筆非本輪使用之公司列）。需與既有決策脈絡對齊，避免三個實體各自不同範圍規則造成維運認知負擔。
3. **OQ-COMPANY-3：`AC`(test1) 測試資料是否應被排除同步。** 契約 §11 #2 已列為待上游確認事項（「補齊 `VW_HRCOMF` 之 AD／AJ／ILS，並釐清 `AC`(test1) 測試資料是否應排除」），本次 COMPANY 同步實作前建議與該項一併定案，避免測試資料混入正式公司清單（雖 `isActive` 判定已可自然過濾其可見性，但資料本身是否應落地仍為獨立決策）。
4. **OQ-COMPANY-4：COMPANY 讀取端點之 RBAC 範圍未定。** 因僅供 F020 浮水印組裝消費（非管理用途），推測應比 `ORG_UNIT`/`PERSON` 讀取端點更寬鬆（甚至可能為系統內部呼叫、無需獨立對外端點），但確切邊界待與 F020 worktree 協調後定案。
