# ORG-PERSON-sync · Test Design
> worktree: org-foundation · 2026-07-22
> source: docs/specs/upstream-hr-source-contract.md（§2/§3.1-3.3/§7）、docs/specs/data-model.md#person-entity、docs/specs/features/F014-accountable-dept-chief.md、git-worktree-guide.md

## 範圍聲明（沿用/擴充之既有 org-sync 元件，不重設其既有測試）

- **新增**：`PERSON` 實體＋其專屬同步邏輯（正規化／異動分類／讀取端點）。目標＝同步**全體在職員工**（非僅 `ACCOUNT` 帳號持有者），供「當責室長」名稱解析（F014）與人員搜尋。
- **沿用既有 org-sync 引擎骨架，不重寫其邏輯本身**：`OrgSyncService` 之「互斥鎖→建立 running SYNC_RUN→讀取→正規化→分類 create/update/noop→消失閾值保護→單一交易套用→結束 SYNC_RUN」流程模式；`disappeared-threshold.ts`（消失比例保護）；`param-batching.ts`（MSSQL 2100 參數上限切批）；`change-classification.ts` 之 create/update/noop 判定慣例。PERSON 同步應複用這些**純邏輯模組**（不重複實作、不重測其既有單元測試，見 `disappeared-threshold.spec.ts`／`param-batching.spec.ts`）。
- **不重設**：`org-sync.service.spec.ts`／`normalization.spec.ts`／`org-hierarchy.spec.ts` 等既有 `ORG_UNIT`／`ACCOUNT` 同步情境。
- **待上游來源 view/欄位定案前的測試設計限制**：本檔多數情境以「抽象 `RawPerson` 介面」設計（欄位名以概念層 `employeeNo`/`name`/`orgCode`/`employmentStatus` 表示），不預先綁定特定上游 view 之實際欄位名稱。標記 `[pending-source]` 之情境明確依賴**尚未定案**之來源 view 選擇（見開放設計問題 OQ-PERSON-1），這些情境的「Given」為條件式（若採候選來源 A／B），供來源定案後直接收斂為可執行測試，不代表本次可直接紅燈起跑。

## 測試策略（unit＝假 upstream reader/假 store；真上游/DB 同步＝[integration] 序列化）

- **unit**：注入假 `PersonUpstreamReader`（回傳 `RawPerson[]`）與假 `PersonStore`（記憶體 Map），比照 `org-sync.service.spec.ts` 之 Fake 慣例；純邏輯（正規化／分類／消失閾值）不經 IO。
- **[integration]**：真實上游 PERSON 來源查詢、真實 MSSQL 寫入、與既有 `SYNC_RUN` 互斥鎖之實際競態，序列化執行（同 Wave 1 並行硬限制）。
- 陷阱防禦類情境（§3.1 姓名欄位陷阱／§3.2 INNER JOIN 靜默吞人）以候選來源 A（`VW_PERSONNEL_SQL`）為假設撰寫；若最終選用其他來源，需覆核這批情境是否仍適用（見 OQ-PERSON-1）。

## Test Scenarios

### TS-PERSON-001 全量同步建立新人員（含非帳號持有者）[unit]
- **Given** 假 reader 回傳 5 筆在職員工原始列，其中 2 筆之 `employeeNo` 於既有 `ACCOUNT` 表查無對應帳號（純 HR 員工、無登入權限）；假 `PersonStore` 為空
- **When** 執行 PERSON 同步
- **Then** 5 筆全數建立於 `PersonStore`，含該 2 筆無帳號者；不因「無對應 ACCOUNT」而略過
- 對應 worktree 目標「全體在職員工，非僅有帳號者」；data-model PERSON 實體

### TS-PERSON-002 既有人員無異動 → noop（冪等）[unit]
- **Given** 來源列與既有 `PersonStore` 記錄逐欄相同
- **When** 執行同步
- **Then** 分類為 `noop`，不產生任何寫入
- 對應 US-010 AC2 同類冪等慣例（比照 `change-classification.ts`）

### TS-PERSON-003 姓名／部門異動 → update 且僅反映實際變更欄位 [unit]
- **Given** 既有人員之 `name` 或 `orgUnitId` 與來源不同
- **When** 執行同步
- **Then** 分類為 `update`，套用後之欄位與來源一致
- 對應 F006 組織異動提示之前置資料正確性（PERSON 為 F006 判斷人員部門異動之資料來源之一）

### TS-PERSON-004 在職→離職轉換：PERSON 紀錄不刪除，僅狀態轉換 [unit]
- **Given** 既有 `employmentStatus=active` 之人員，來源本次回報為離職
- **When** 執行同步
- **Then** `PersonStore` 該筆 `employmentStatus` 轉為 `departed`；**紀錄本身不刪除**、不觸發帳號停用（帳號停用之權威判定仍為既有 F005／`ACCOUNT.EMPSTS`，PERSON 僅為人員名冊鏡射，見開放設計問題 OQ-PERSON-3）
- 對應 data-model PERSON 實體；F005 既有權威判定不變

### TS-PERSON-005 離職人員仍可被名稱解析（不自表中移除）[unit]
- **Given** `employmentStatus=departed` 之既有人員
- **When** 呼叫名稱解析（見 NAME-resolution-test.md）以其 `employeeNo` 查詢
- **Then** 正確回傳姓名（非「找不到」）
- 對應 hard constraint「name-resolution for departed persons」；F037 變更歷程快照需可回溯顯示離職人員姓名

### TS-PERSON-006 消失保護：批次消失比例超閾值 → 中止本次同步 [unit]
- **Given** 上次在職人員集合 100 人，本次來源僅回報 90 人在職（消失 10%，> 預設閾值 5%，比照 `disappeared-threshold.ts` 之 `DEFAULT_DISAPPEARED_THRESHOLD`）
- **When** 執行同步
- **Then** 中止本次同步、**不標記任何人為離職**、記錄失敗與消失比例；複用既有 `computeDisappeared`／`disappearedRatioExceeded` 純函式，不重新實作閾值邏輯
- 對應契約 §3.2／§7.3「INNER JOIN 靜默吞人」風險——若 PERSON 來源同樣採用會靜默丟列的 join（候選來源 A 之已知風險），此保護對 PERSON 甚至比 ACCOUNT 更關鍵（非帳號持有者更依賴此 join）

### TS-PERSON-007 孤兒人員（orgCode 對應部門查無）→ 保留、記警告，不中止 [unit]
- **Given** 某人員 `orgCode` 於本次 `ORG_UNIT` 部門集合查無對應
- **When** 執行同步
- **Then** 該人員仍保留（建立/更新），產生警告訊息，不中止整批同步
- 對應既有 ACCOUNT 同步之「孤兒帳號」對稱處理慣例（`org-sync.service.ts` 現有邏輯）

### TS-PERSON-008 髒資料：employeeNo 缺漏 → 該筆略過，不影響其他列 [unit]
- **Given** 來源列中 1 筆 `employeeNo` 為空字串/null
- **When** 執行同步
- **Then** 該筆以 `DirtyRowError` 略過並記警告；其餘列正常處理
- 對應 F004 Edge Cases（TC-010-03）之髒資料防禦慣例，比照 `normalization.ts` 既有 `nullableStr`＋拋錯模式

### TS-PERSON-009 [pending-source] 姓名欄位陷阱防禦（若採候選來源 VW_PERSONNEL_SQL）
- **Given** 原始列以 `NAME` 欄位承載——依契約 §3.1，該欄底層實為 `HRBANKMF.BANK_NM`（銀行名稱，非人名），真正姓名於 `NAME_IN_CHINESE`
- **When** 正規化為 `NormalizedPerson`
- **Then** `name` 欄位**必須**取自 `NAME_IN_CHINESE` 對映欄位，不得誤用 `NAME` 直接落地
- 依 OQ-PERSON-1 定案結果決定是否適用；若最終選用之來源無此陷阱，本情境可標記不適用並移除

### TS-PERSON-010 [pending-source] INNER JOIN 靜默吞人防禦（若採候選來源 VW_PERSONNEL_SQL）
- **Given** 某在職員工之 `DEPTID` 於部門主檔（`HRDEPTMF`）查無
- **When** 上游來源查詢執行（若沿用契約 §3.2 所述 `HREMPMF INNER JOIN HRDEPTMF` 語意）
- **Then** 該員工**整筆不會出現**於來源結果（非本檔 TS-PERSON-007 之「孤兒警告」情境，而是「來源根本未回傳」，同步引擎無從得知其存在）——此為必須在來源查詢層（而非同步邏輯層）解決之風險，需評估改用 `LEFT JOIN` 或等效手段消弭
- 對應契約 §3.2「員工憑空消失」風險；此為對來源選型的硬性審查項，不可留待正規化層補救

### TS-PERSON-011 employeeNo 唯一性防護（來源以帳號粒度輸出時的塌陷風險）[unit]
- **Given** 來源回傳 2 筆相同 `employeeNo`（模擬「一人多帳號」情境下若來源仍以帳號/登入粒度而非真實人員粒度輸出）
- **When** 執行同步
- **Then** 依 data-model「`employeeNo` 為 PERSON 來源唯一鍵」之既定假設，同步邏輯需明確去重或標記為髒資料告警，避免同一員編重複寫入造成主鍵衝突或筆數不可預期；**具體去重規則（保留哪一筆／如何選擇）待 OQ-PERSON-1 定案後補完**
- 對應 data-model PERSON 實體「employeeNo（來源唯一鍵）」；與 ACCOUNT 之「employeeNo 非唯一」形成對照（PERSON 若真為人員粒度，理論上應唯一，但實測前不可假設成立）

### TS-PERSON-012 讀取端點：employeeNo → 姓名（單筆）[unit]
- **Given** `PersonStore` 內已有在職人員資料
- **When** 呼叫讀取端點以 `employeeNo` 查詢
- **Then** 正確回傳對應姓名（含所屬部門，依需求）
- 對應 F014「當責室長名稱解析」

### TS-PERSON-013 讀取端點：人員搜尋（姓名/員編關鍵字，僅回在職者）[unit]
- **Given** `PersonStore` 內含在職與離職人員各數筆
- **When** 以關鍵字搜尋（供 F014 當責室長候選選單）
- **Then** 搜尋結果**僅含在職者**，離職人員不出現於候選清單
- 對應 F014 AC「已停用（離職）人員不出現在當責室長可選清單」；data-model「僅 active 人員可出現在當責室長可選清單」

### TS-PERSON-014 讀取端點：搜尋排除離職者，但個別 ID 查詢仍可解析（與 013 對照）[unit]
- **Given** 同上資料
- **When** 分別呼叫「人員搜尋」（關鍵字）與「單筆姓名解析」（TS-PERSON-012 端點，帶入離職者 employeeNo）
- **Then** 搜尋結果不含該離職者；但單筆解析仍成功回傳其姓名（供歷史文件顯示既有室長，即使其已離職）
- 對應 TS-PERSON-005／hard constraint「name-resolution for departed persons」——兩種端點語意刻意不同，行為差異須有明確測試錨定，避免日後誤合併為同一過濾規則

### TS-PERSON-015 讀取端點 RBAC：未登入呼叫 → 401 [unit]
- **Given** 請求未帶有效 session cookie
- **When** 呼叫任一 PERSON 讀取端點
- **Then** 401（`AUTH_SESSION_EXPIRED`，比照既有 `SessionGuard` 慣例）
- 角色範圍（哪些已登入角色可查）待 OQ-PERSON-4 定案，本情境為安全基準，不受該 OQ 影響

### TS-PERSON-016 [integration] 真實上游 PERSON 讀取＋真實 DB 寫入全流程
- **Given** 真實上游來源（來源定案後）、真實 MSSQL、無既有 PERSON 資料
- **When** 執行首次全量同步
- **Then** 落地筆數與上游來源之在職員工數一致，抽樣比對姓名/部門正確、`USERPW`/`DEFAULTPW`等禁欄不出現於任何查詢（沿用 `assertNoForbiddenColumns` 之二次防禦慣例）
- 待來源定案後方可執行；本情境先行預留

## 覆蓋對照表

| Scenario | 類型 | 對應來源/AC |
|---|---|---|
| TS-PERSON-001 | unit | worktree 目標：全體在職員工 |
| TS-PERSON-002/003 | unit | 冪等／異動分類（比照 US-010 AC2/AC4） |
| TS-PERSON-004/005 | unit | data-model PERSON；hard constraint 離職人員名稱解析 |
| TS-PERSON-006 | unit | 契約 §3.2/§7.3 消失保護 |
| TS-PERSON-007 | unit | 孤兒對稱處理 |
| TS-PERSON-008 | unit | F004 Edge Cases 髒資料防禦 |
| TS-PERSON-009/010 | pending-source | 契約 §3.1/§3.2 陷阱（OQ-PERSON-1） |
| TS-PERSON-011 | unit | data-model「employeeNo 唯一鍵」假設防護 |
| TS-PERSON-012~014 | unit | F014 當責室長名稱解析／候選過濾 AC |
| TS-PERSON-015 | unit | 安全基準（401） |
| TS-PERSON-016 | integration | 端到端真實同步 |

## 開放設計問題

1. **OQ-PERSON-1（最高優先）：PERSON 上游來源 view 與欄位對映未定案。** worktree 目標明確要求「全體在職員工，非僅帳號持有者」，但契約中唯一涵蓋「全體員工」之候選來源 `VW_PERSONNEL_SQL` 被契約明文標註「本輪不採用為主來源」（脈絡為 ACCOUNT 用途，未明言是否亦排除 PERSON 用途），且該來源已知三項陷阱：(a) §3.1 欄位名稱與內容不符（`NAME`＝銀行名稱非人名，需改用 `NAME_IN_CHINESE`；`ACCOUNT`＝銀行帳號；`DIV_CODE`＝薪資部門非組織部門）；(b) §3.2 `INNER JOIN` 靜默吞人（`DEPTID` 查無部門主檔者整筆消失）；(c) §3.3 `HIRE_DATE`/`REHIRE_DATE` 語意被客製改寫。此外該來源是否具備等同 `EMPSTS`/`MTDT` 之在職判定欄位與增量水位欄位，契約未明確交代。**在此定案前，PERSON 同步之欄位級 fixture 與陷阱防禦測試（TS-PERSON-009/010）皆為條件式設計，無法收斂為可執行紅燈。** 建議下一步：比照 OQ-E02-01 之作法，對候選來源做一次唯讀實測盤點（欄位存在性、EMPSTS 對應、DEPTID join 命中率），確認後回填本檔。
2. **OQ-PERSON-2：PERSON 之 `employeeNo` 唯一性未經實測驗證。** data-model 假設其為唯一鍵，但此假設之成立與否直接依賴 OQ-PERSON-1 之來源選擇；若來源仍以帳號/登入粒度輸出（如沿用 VW_HPMUSER 類似結構），將重演 ACCOUNT 之「18 組重複／133 筆」問題。
3. **OQ-PERSON-3：PERSON 離職轉換與既有 F005（帳號停用）之關係未釐清。** data-model.md 原文「`employmentStatus = departed` 觸發 F005 帳號停用」與現行 F005 實作（權威判定為 `ACCOUNT.EMPSTS='A'`，見 feature-status.md F005 列）並存，若兩條判定路徑各自獨立運作（PERSON 同步與 ACCOUNT 同步為不同來源/不同時間點），存在**判定不一致風險**（例：PERSON 顯示已離職但 ACCOUNT 尚未同步更新，或反之）。需釐清 PERSON 同步是否僅為唯讀鏡射（不觸發任何帳號動作），或需與 F005 邏輯整合。
4. **OQ-PERSON-4：PERSON 讀取端點之 RBAC 範圍未定。** F025 功能矩陣無對應功能鍵；何角色可查詢人員搜尋/當責室長候選清單需定案（傾向與 F014 編輯權限一致，僅 ICSOPAdmin，但人員搜尋若供其他管理情境共用則範圍可能更寬）。
5. **OQ-PERSON-5：全量或增量同步策略未定。** 若無等同 `MTDT` 之增量水位欄位，需比照 `ORG_UNIT`（114 筆、全量取回、成本極低）採全量；惟全體員工規模（契約 §10.1 顯示 AS 全體員工含離職約 5,221 筆）已顯著大於 `ORG_UNIT`，全量重跑之成本/頻率需一併評估（是否比照 ACCOUNT 之增量模式更合適，取決於來源是否具備水位欄位）。
