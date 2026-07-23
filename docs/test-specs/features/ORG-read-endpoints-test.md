# ORG-read-endpoints · Test Design
> worktree: org-foundation · 2026-07-22
> source: docs/specs/upstream-hr-source-contract.md（§3.5/§9）、docs/specs/data-model.md#orgunit-entity、docs/specs/features/F014-accountable-dept-chief.md、F019-public-list-browsing.md、F026-role-field-matrix.md

## 範圍聲明（沿用/擴充之既有 org-sync 元件，不重設其既有測試）

- **新增**：`ORG_UNIT` 讀取端點（list／三級樹／級聯查詢），供 F014 制定組織下拉、F019 部門篩選使用。`ORG_UNIT` 資料本身**已由 F004 同步**（`org-hierarchy.ts`／`normalization.ts`／`org-sync.service.spec.ts` 等既有測試涵蓋其同步正確性），本檔**僅涵蓋讀取端**之新端點行為，不重設同步邏輯測試。
- **子樹前綴展開規則**（`codePrefix` ＋ `LIKE 'prefix%'`）已由契約 §9／data-model 定案，屬**低歧義**規則，可精確測試（TS-ORGREAD-005~008）。
- **「三級樹（公司→部→室）」與 F014 UI 需求之對應方式屬結構性未決問題**（見 OQ-ORGREAD-1/3）：`ORG_UNIT.tier` 列舉為 5 層（`ROOT`/`DIVISION`/`DEPARTMENT`/`SECTION`/`SUBSECTION`），不含「公司」；而 F014 spec 文字「制定公司 → ORG_UNIT（公司層級）」與此列舉矛盾。相關情境以雙軌（方案 A／B）呈現，實作定案後保留其一。

## 測試策略（unit＝假 upstream reader/假 store；真上游/DB 同步＝[integration] 序列化）

- **unit**：假 `OrgUnitReadStore`（記憶體樹），fixture 涵蓋契約 §8.1 實測範例資料（`J0000` 營業二本部 → `JA000` 營運管理部 → `JAC00` 審查室 → `JCHA0` 消費/商品北一/一課，5 層俱全），比照 `org-hierarchy.spec.ts` 之純邏輯測試慣例。
- **[integration]**：真實 MSSQL 查詢之索引使用（`orgCode LIKE 'prefix%'` 是否走 index seek）與大量資料下之查詢效能，序列化執行。

## Test Scenarios

### TS-ORGREAD-001 list 端點：依 companyCode 取回全部 ORG_UNIT（5 層俱全）[unit]
- **Given** fixture 含 AS 公司 5 層資料
- **When** 呼叫 list 端點（`companyCode=AS`）
- **Then** 回傳全部單位，涵蓋 `ROOT`/`DIVISION`/`DEPARTMENT`/`SECTION`/`SUBSECTION` 5 層
- 對應 data-model「ORG_UNIT 完整保存 5 層」（契約 §8.3 定案）

### TS-ORGREAD-002 list 端點：預設僅回傳 isActive=true [unit]
- **Given** fixture 含 1 筆已關閉部門（`CLOSE_DATE` 已過）
- **When** 呼叫 list 端點（未帶額外旗標）
- **Then** 該已關閉部門預設不出現於結果
- 是否提供 `includeInactive` 旗標供 F006 後台檢視已關閉部門，待 OQ-ORGREAD-4

### TS-ORGREAD-003 三級樹端點：依上層 orgCode 回傳直屬子層（cascade）[unit]
- **Given** fixture 中 `JA000`（部）之直屬子層為若干 `SECTION`（處/室，如 `JAC00`）
- **When** 呼叫級聯查詢（`parentCode=JA000`）
- **Then** 僅回傳其直屬子層（不含孫層 `SUBSECTION`）
- 對應 F014 AC「室別選項僅顯示所選部門底下之室別」——由上而下逐層查詢，非一次展開整棵子樹

### TS-ORGREAD-004 級聯查詢：查無上層 → 回空陣列，非錯誤 [unit]
- **Given** 一個不存在或已無下層之 `orgCode`
- **When** 呼叫級聯查詢
- **Then** 回傳空陣列（非 404/500），供前端「上層變更時清空下層」之後端保證
- 對應 F014 Main Flow「上層變更時清空下層」

### TS-ORGREAD-005 子樹展開查詢：codePrefix='JA' → 回傳 JA 開頭全部單位（跨層混合）[unit]
- **Given** fixture 含 `JA000`(部)/`JAC00`(處室)/`JCHA0`(課，隸屬另一部門非本例) 等
- **When** 呼叫子樹查詢（`prefix=JA`）
- **Then** 回傳所有 `orgCode` 以 `JA` 開頭之單位，不論其 tier（部/處室/課混合結果）
- 對應契約 §9.2 範例表（`JA000` → `JA%`）

### TS-ORGREAD-006 子樹展開查詢：Root（codePrefix=''）代表全域，不施加限制 [unit]
- **Given** 選定單位為 Root（`00000`，有效前綴為空字串）
- **When** 呼叫子樹查詢
- **Then** 回傳全部單位（等同無過濾條件）
- 對應契約 §9.2「Root 之有效前綴為空字串，代表全域」

### TS-ORGREAD-007 前綴查詢之萬用字元跳脫（% _）[unit]
- **Given** 假設性 `codePrefix` 或關鍵字含 `%`/`_`
- **When** 執行前綴查詢
- **Then** 正確跳脫，不產生誤配對或查詢錯誤
- 對應 F019 Edge Cases「前綴含 % _ 須跳脫」

### TS-ORGREAD-008 課層（最細單位）前綴比對精確不誤含同處室其他課 [unit]
- **Given** fixture 中同一處室下有 `JCHA0`（一課）與 `JCHB0`（二課，假設）
- **When** 以 `prefix=JCHA` 查詢
- **Then** 僅回傳 `JCHA0`，不含 `JCHB0`
- 對應 F019 AC「消費/商品北一/一課」精確比對範例

### TS-ORGREAD-009 [OQ-ORGREAD-1 方案 A] 三級樹端點「公司」對映獨立 COMPANY 實體
- **Given** 選定 `companyCode=AS`（COMPANY 實體之一筆，見 ORG-COMPANY-sync-test.md）
- **When** 呼叫三級樹端點
- **Then** 回傳其下 `ORG_UNIT` 樹（自 `DIVISION` 或更下層起算），**不將 COMPANY 節點混入 `ORG_UNIT` 回應結構**
- 與 TS-ORGREAD-010 互斥，依 OQ-ORGREAD-1 定案保留其一

### TS-ORGREAD-010 [OQ-ORGREAD-1 方案 B] 三級樹端點「公司」對映 ORG_UNIT 之 ROOT tier
- **Given** 選定 `ROOT` 節點（`00000`，本部之上層概念性節點）
- **When** 呼叫三級樹端點
- **Then** 回傳結構將 `ROOT` 呈現為「公司」層級選項，其下依序為 `DIVISION`/`DEPARTMENT` 供 F014 三級選單（略過或合併呈現 `DIVISION` 本部層，因 F014 僅需公司→部→室 3 層 UI）
- 與 TS-ORGREAD-009 互斥；本方案額外需回答 OQ-ORGREAD-3（5 層對 3 層 UI 之對應規則）

### TS-ORGREAD-011 RBAC：未登入呼叫任一讀取端點 → 401 [unit]
- **Given** 請求未帶有效 session cookie
- **When** 呼叫 list／三級樹／級聯端點
- **Then** 401（`AUTH_SESSION_EXPIRED`）
- 安全基準，不受 OQ-ORGREAD-2 影響

### TS-ORGREAD-012 RBAC：已登入角色之可讀範圍 [unit，待 OQ-ORGREAD-2 覆核]
- **Given** 分別以 5 種角色（`SysAdmin`/`ICSOPAdmin`/`Supervisor`/`DeptContact`/`User`）之有效 session 呼叫
- **When** 呼叫讀取端點
- **Then**（暫定假設）比照「前台瀏覽」（F025 矩陣 5 角色皆「可」），5 角色皆可讀，僅需已登入；此假設待 OQ-ORGREAD-2 定案後覆核是否應限縮（如限管理端角色）
- 對應 F019「使用者已登入」前置條件、F014 之 ICSOPAdmin 專屬編輯情境（惟編輯權限與讀取權限可分離設計）

### TS-ORGREAD-013 [integration] 前綴查詢走索引（index seek，非 table scan）
- **Given** 真實 MSSQL、`ORG_UNIT.orgCode` 已建索引、資料量比照契約規模（AS 114 筆有效部門）
- **When** 執行 `orgCode LIKE 'JA%'` 查詢並取執行計畫
- **Then** 執行計畫顯示 index seek，非 table/index scan
- 對應契約 §9.2「前綴比對為 index-seek 友善」；data-model「須建索引以支援 LIKE 'prefix%' index-seek」

## 覆蓋對照表

| Scenario | 類型 | 對應來源/AC |
|---|---|---|
| TS-ORGREAD-001/002 | unit | data-model 5 層保存；OQ-ORGREAD-4 |
| TS-ORGREAD-003/004 | unit | F014 由上而下級聯 AC |
| TS-ORGREAD-005~008 | unit | 契約 §9.2／F019 子樹展開 AC |
| TS-ORGREAD-009/010 | unit（雙軌） | OQ-ORGREAD-1 結構性歧義 |
| TS-ORGREAD-011/012 | unit | 安全基準／RBAC（OQ-ORGREAD-2） |
| TS-ORGREAD-013 | integration | NFR 效能（index-seek） |

## 開放設計問題

1. **OQ-ORGREAD-1（結構性歧義，需 architect/PM 定案）：「制定公司」對映 `ORG_UNIT` 或獨立 `COMPANY` 實體。** F014 spec 原文「制定公司 → ORG_UNIT（公司層級）」與 data-model `ORG_UNIT.tier` 列舉（`ROOT`/`DIVISION`/`DEPARTMENT`/`SECTION`/`SUBSECTION`，**不含 `COMPANY`**）直接矛盾——`ORG_UNIT` 之 `ROOT` 代表「和潤本部」而非「公司」概念（`companyCode` 才是公司代碼，是每一層單位的附屬屬性而非獨立層級）。本次新增之 `COMPANY` 實體（ORG-COMPANY-sync-test.md）恰可能是這個「公司層級」的正確落點，但 F014 spec 撰寫當下 `COMPANY` 實體尚未存在，故該文字之意圖需重新確認。此歧義直接決定三級樹端點的回應資料形狀（TS-ORGREAD-009 vs 010）與前端串接方式。
2. **OQ-ORGREAD-2：讀取端點之 RBAC 範圍未定。** F025 功能矩陣無對應功能鍵（現有 `ORG_SYNC_MANAGEMENT` 僅涵蓋「同步觸發/查詢紀錄」，非「讀取組織樹供下拉使用」）。傾向假設「已登入即可讀」（因 F019 前台部門篩選需求覆蓋全部 5 角色），但需與 F014（僅 ICSOPAdmin 可編輯）之權限模型是否需要在讀取層也做角色區分一併確認。
3. **OQ-ORGREAD-3：5 層資料如何對應 F014 之 3 層 UI 需求。** F014 僅需「制定公司→制定部門→制定室別」3 層下拉，但 `ORG_UNIT` 實際為 5 層（含「本部」`DIVISION` 與「課」`SUBSECTION`）。需定案：(a) 「本部」層是否於 F014 UI 略過（部門下拉直接跨過本部層？或本部本身也需可選？）；(b) 「課」層人員（15% 在職者）於 F014「制定室別」下拉中如何呈現（併入所屬處室選項、或需要第 4 層選單）。此問題同時影響三級樹端點的 `tier` 過濾邏輯設計。
4. **OQ-ORGREAD-4：`includeInactive` 旗標是否存在。** F006（組織異動後台）可能需要檢視已關閉部門（契約 §7.3 AS 11 名在職者掛已關閉部門之情境），讀取端點是否需支援「含已停用單位」查詢，或此類需求應完全由 F006 專屬邏輯處理（讀取 API 恆過濾 inactive，F006 走獨立查詢路徑）。
