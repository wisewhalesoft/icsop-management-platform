---
spec-id: upstream-hr-source-contract
title: 上游人資來源資料契約（組織／人員／職級）
version: 1.0
date: 2026-07-20
status: Draft（實測定案，待上游單位書面確認）
---

# 上游人資來源資料契約

> 本文件為 **OQ-E02-01 的定案產出**。所有內容皆來自 2026-07-20 之**唯讀實測盤點**（schema metadata、view 定義 SQL、純聚合統計），非推測。
> 盤點過程未讀取任何個別人員資料列、未查詢任何密碼欄位。
>
> ⚠️ **盤點環境與資料可信度分級**：盤點對象為 **dev 環境**（端點 DB 名為 `ZZIPPROD`，易誤判為正式環境；**個資欄位已經過遮罩處理**）。因此本文件之結論須分兩級看待：
> - **結構性結論可信**（schema、欄位型別、view 定義 SQL、部門代碼編碼規則、階層推導、哨兵日期語意、`EMPSTS` 值域）——這些不受遮罩影響，且部門/公司名稱經與使用者提供之資料比對確認為真實值。
> - **值層級統計須向正式環境覆核**（尤其 **email 相關之唯一性、網域分布、重複率**，以及員編重複率）——遮罩可能改變這些分布。凡引用此類數字作為設計依據前，須先於正式環境重驗。見 §11 #8。
> 相關：[F004 組織同步](features/F004-org-sync.md)、[F005 離職停用](features/F005-auto-disable-departed.md)、[F006 組織異動](features/F006-org-change-alert-backend.md)、[F014 當責室長](features/F014-accountable-dept-chief.md)、[F020 浮水印](features/F020-watermark.md)、[data-model.md](data-model.md)、[nfr.md](nfr.md)

---

## 1. 來源拓撲

```
ICSOP 後端  ──►  172.20.202.193 (APYHFC16, SQL Server 2016 Standard 13.0.6300.2)
                      │  登入 DB：ZZIPPROD
                      │  Collation：Chinese_Taiwan_Stroke_BIN
                      ▼  linked server（4 段式命名）
                 [APYHFC23].[HR2]   ← 人資系統，664 物件（87 views／577 tables）
```

- 存取一律以 **4 段式命名** `[APYHFC23].[HR2].[dbo].[<view>]`。
- **`APYHFC23` 的 `is_collation_compatible = False`** → 跨 server 查詢無法有效下推述詞。**所有彙總/過濾必須以 `OPENQUERY` 推送至對端執行**，否則會整表拉回本地端比對。
- 連線參數以環境變數注入（見 `.env.sample`），不得寫死（[nfr.md#deployment](nfr.md#deployment) AC2）。

---

## 2. 權威來源物件

| 用途 | 物件 | 底層 | view 內建過濾 |
|------|------|------|---------------|
| 公司主檔 | `VW_HRCOMF` | `HRCOMF` | 無 |
| 組織階層 | `VW_DEPT_SQL` | `HRDEPTMF` | 無（原 `WHERE COMPID IN ('AS','AR','BF')` 已被註解） |
| 帳號／在職狀態 | `VW_HPMUSER` ⚠ | `PORTAL_HPMUSER` | 無（`SELECT *`） |
| 職稱／職務功能指派 | `VW_PERSONAL_JOB` | `HREMPMF` + 3 表 join | 無 |
| 職務功能定義 | `VW_JOB_FUN` | `HRJFUNMF` | `END_DT >= GETDATE()` |
| （參考，本輪不採用為主來源）員工主檔 | `VW_PERSONNEL_SQL` | `HREMPMF` + 3 表 join | 無 |

**為何以 `VW_HPMUSER` 而非 `VW_PERSONNEL_SQL` 為人員主來源**：ICSOP 使用者＝能登入公司入口網站者，`VW_HPMUSER` 提供 **`USERID`（真正的登入帳號）** 與 **`EMPSTS`（在職狀態）**，而 `VW_PERSONNEL_SQL` 兩者皆無（其 `ACCOUNT` 欄是銀行帳號，見 §3）。兩者筆數不同（5,703 vs 5,799；AS 為 2,771 vs 5,221），屬正常——非所有 HR 員工皆有入口帳號，且存在一人多帳號。

---

## 3. ⚠ 陷阱與風險（實作前必讀）

### 3.1 `VW_PERSONNEL_SQL` 三個欄位名稱與內容不符

| 欄位（名稱） | 底層實際來源 | 實際語意 |
|---|---|---|
| `ACCOUNT` | `HRBANKEMPMF.ACCOUNT` | **銀行帳號**（非登入帳號，且屬金融個資） |
| `NAME` | `HRBANKMF.BANK_NM` | **銀行名稱**（非人名；人名為 `NAME_IN_CHINESE`） |
| `DIV_CODE` | `HRDEPTMF.SALARY_DEPTID` | **薪資發放部門**（非「處/室」層級） |

### 3.2 `VW_PERSONNEL_SQL` 的 `INNER JOIN` 會靜默吞人

```sql
FROM HREMPMF A INNER JOIN HRDEPTMF B ON A.COMPID=B.COMPID AND A.DEPTID=B.DEPTID
```
員工之 `DEPTID` 若在部門主檔查無，**該員工整筆不出現於 view**。
**同步風險**：人員憑空消失 → [F005](features/F005-auto-disable-departed.md) 可能誤判為離職 → **誤停用帳號**。
**緩解**：見 §7.3 消失筆數閾值保護。

### 3.3 `VW_PERSONNEL_SQL` 日期欄語意被客製改寫

view 內註解明載（2013-12-27 應和潤需求）：

| 欄位 | 實際語意 |
|---|---|
| `HIRE_DATE` ← `HISTORY_DT` | **年資起算日**（非到職日） |
| `REHIRE_DATE` ← `ASSUME_DT` | **到職日** |

取「到職日」須用 `REHIRE_DATE`。

### 3.4 🔴 `VW_HPMUSER` 含密碼欄位

`VW_HPMUSER` 定義為 `SELECT * FROM [HR2].[dbo].[PORTAL_HPMUSER]`，57 欄中包含：

- **`USERPW` varchar(200)**、**`DEFAULTPW` varchar(200)**、`PWCHANGEDT`、`PWERRCNT`
- 另有 `BIRTHDAY`、`MARRITALSTS`、`ADDR`、`TELNO`、`ZIPCODE1/2`、`EDUCATIONLVL`、`SCHNM`、`MAJOR`、`MOBILNO`、`HRMOBILENO` 等非必要個資

**強制要求**：
1. ICSOP 同步**絕對不得 `SELECT *`**，必須逐欄白名單（見 §5）。
2. **`USERPW` / `DEFAULTPW` 永不讀取、永不落地、永不記錄**於任何日誌。
3. `SELECT *` 之 view 定義代表**上游 base table 增欄時 view 會無聲變動** → 同步作業須對欄位集合做防禦性檢查。
4. 已向上游提出「最小欄位專用 view」需求（見 §10）。

### 3.5 🔴 三個階層欄位皆不可用，階層須以**部門代碼前綴**推導

`VW_DEPT_SQL` 提供三個疑似階層欄位，實測**全部不可作為層級依據**：

| 欄位 | 問題 |
|---|---|
| `TOP_DEPTID` | 指向之部門散布於第 1／2／3 層（13／18／83），非固定層級 |
| `DEPARTMENT`(`S_DEPTID`) | 同上（4／27／83） |
| `CAPITAL`(`P_DEPTID`) | **跳過「部」層**——處/室 直接指向本部，導致遞迴僅得 3 層，遺失真實層級 |

**權威規則：層級由 5 碼部門代碼之前綴決定，每一碼代表一層。**

| 代碼樣式 | 判定式 | 層級 | AS 有效數 |
|---|---|---|---|
| `00000` | `CODE = '00000'` | Root（和潤本部） | 1 |
| `A0000` | `SUBSTRING(CODE,2,4) = '0000'` | 本部 | 5 |
| `AN000` | `SUBSTRING(CODE,3,3) = '000'` | **部** | 24 |
| `ANA00` | `SUBSTRING(CODE,4,2) = '00'` | **處/室** | 57 |
| `BJAA0` | 其餘（第 4 碼有值） | **課** | 27 |

**上層推導**：
- 部層代碼 ＝ `LEFT(CODE,2) + '000'`（實測處/室→部 命中 56/57＝98.2%）
- 本部代碼 ＝ `LEFT(CODE,1) + '0000'`

**交叉驗證**：`DESC_CHI` 中 `/` 的出現次數恰等於相對深度（0＝部層以上／1＝處室／2＝課），與代碼推導結果一致。

> ⚠️ 這代表**上游實際為 5 層**（公司＞本部＞部＞處/室＞課），較原 spec 假設的 4 層（公司＞本部＞部＞處/室）**多出「課」層**。見 §8.3。

### 3.6 其他

- 所有來源 view 皆使用 `(NOLOCK)` → 存在 dirty read 可能，同步須具備重跑冪等性。
- `VW_DEPT_SQL.JOB_CODE` 實為 `MANGER_EMPNO`（**部門主管員工編號**），非職務代碼 —— 對 [F014](features/F014-accountable-dept-chief.md) 為有價值來源，實測 **100% 有值**。

---

## 4. 哨兵日期（Sentinel）

本系統以 **`9999-12-31`** 表示「未結束／無期限」，**不使用 NULL**（多數日期欄為 `NOT NULL`）。

| 欄位 | 哨兵含義 | 實測 |
|---|---|---|
| `VW_DEPT_SQL.CLOSE_DATE` | 部門仍有效 | 184 筆＝有效部門數，完全吻合 |
| `VW_HPMUSER.RESIGNDT` | 未離職 | 2,429 筆，全數對應 `EMPSTS='A'` |
| `VW_HRCOMF.COMPENDDT` | 公司仍存續 | AE／AS 為 9999-12-31 |

**判定式**：有效部門 ⇔ `CLOSE_DATE > GETDATE()`（等價於 `= '9999-12-31'`）。

---

## 5. 欄位對應（ICSOP ← 上游）

### 5.1 `ORG_UNIT` ← `VW_DEPT_SQL`

| ICSOP | 上游 | 備註 |
|---|---|---|
| `orgCode` | `CODE` (`DEPTID`) | 與 `COMPID` 併為複合鍵 |
| `companyCode` | `COMPID` | |
| `name` | `DESC_CHI` | 簡稱；`DESC_FULL` 為全名備用 |
| `tier` | 由 `CODE` 前綴推導 | **階層唯一權威來源**，見 §3.5（`P_DEPTID` 不可用） |
| `parentCode` | 由 `CODE` 前綴推導之上層代碼 | 部層＝`LEFT(CODE,2)+'000'`；本部＝`LEFT(CODE,1)+'0000'` |
| `managerEmpNo` | `JOB_CODE` (`MANGER_EMPNO`) | F014 當責室長來源 |
| `effectiveFrom` | `ESTABLISHED_DATE` | |
| `isActive` | `CLOSE_DATE > GETDATE()` | 見 §4 |

### 5.2 `ACCOUNT` ← `VW_HPMUSER`（白名單，共 11 欄）

| ICSOP | 上游 | 備註 |
|---|---|---|
| `loginId` | `USERID` | **穩定鍵**，100% 唯一（見 §7.2） |
| `employeeNo` | `EMPNO` | ⚠ 非唯一，見 §7.2 |
| `name` | `USERNM` | 浮水印姓名來源 |
| `companyCode` | `COMPID` | |
| `orgCode` | `DEPTID` | 對應 `ORG_UNIT.orgCode` |
| `email` | `EMAILADDR` | AS 有 76 筆空值 |
| `isActive` | `EMPSTS = 'A'` | 見 §6 |
| `resignDate` | `RESIGNDT` | 9999-12-31 ＝未離職 |
| `hireDate` | `HIREDT` | |
| `managerEmpNo` | `DIRECTOR` | |
| `lastModifiedAt` | `MTDT` | 增量同步依據 |

**明確排除（不得讀取）**：`USERPW`、`DEFAULTPW`、`PWCHANGEDT`、`PWERRCNT`、`BIRTHDAY`、`MARRITALSTS`、`ADDR`、`ZIPCODE1`、`ZIPCODE2`、`TELNO`、`TELAREA`、`MOBILNO`、`HRMOBILENO`、`EDUCATIONLVL`、`SCHNM`、`MAJOR` 及其餘未列於白名單之欄位。

### 5.3 公司 ← `VW_HRCOMF`

| ICSOP | 上游 |
|---|---|
| `companyCode` | `COMPID` |
| `companyName` | **`COMPFULLNM`**（浮水印用，定案見 §8） |
| `companyShortName` | `COMPSIMPNM` |
| `isActive` | `COMPENDDT > GETDATE()` |

### 5.4 職稱／職務功能

- 職稱名稱：`VW_PERSONAL_JOB.JTITLE_NM`（63 種，空值 0）
- 職務功能：`VW_PERSONAL_JOB.JFUN_NM` / 定義主檔 `VW_JOB_FUN`（AS 23 種）
- ⚠ **職級（`GRADECD` / `JOB_LEVEL_CODE`）之名稱對照主檔尚未定位**，見 §10。

---

## 6. 在職／離職判定

**權威判定：`EMPSTS = 'A'`**（優於 `RESIGNDT`）。

| `EMPSTS` | 筆數 | 語意 | 離職日分布 |
|---|---|---|---|
| `A` | 2,430 | **在職** | 2,429 筆為 9999 哨兵 |
| `B` | 3,248 | 已離職 | 2014-11-23 ～ 2026-07-08 |
| `C` | 25 | 非在職（語意待上游確認） | 2023-11-28 ～ 2026-07-02 |

- **已知不一致**：1 筆 `EMPSTS='A'` 卻帶過去離職日（2024-12-31）。同步須容忍並記錄告警，不得因此中止。
- `USERKIND` 實測僅單一值 `I`（5,703 筆），本輪不作為判斷條件。

---

## 7. 同步策略

### 7.1 增量同步

- 依據 `VW_HPMUSER.MTDT`（實測範圍 2020-03-02 ～ 2026-07-09；近 30 天異動 2,277 筆）。
- 每日排程 02:00 (UTC+8)（OQ-E02-02 定案），失敗 3 次遞增間隔重試。
- 因異動量可觀（日均約 76 筆、且有批次尖峰），增量同步具實益；但**組織階層（`VW_DEPT_SQL`，僅 114 筆有效）建議每次全量取回**，成本極低且免除階層增量的正確性風險。

### 7.2 穩定鍵

- **`ACCOUNT` 主鍵採 `(COMPID, USERID)`** —— `USERID` 實測 100% 唯一（各公司 `COUNT(*) = COUNT(DISTINCT USERID)`）。
- **不得以 `(COMPID, EMPNO)` 為主鍵** —— 實測全體 18 組重複／133 筆；AS 在職者 1,114 人對應 1,108 個相異員編（6 筆一人多帳號）；AE 尤為極端（166 帳號僅 60 個員編）。
- 浮水印需顯示員工編號時，以該 `USERID` 對應之 `EMPNO` 呈現（一人多帳號時各帳號各自呈現，屬預期行為）。

### 7.3 孤兒與消失保護

- **孤兒**＝`VW_HPMUSER.DEPTID` 於 `VW_DEPT_SQL` 查無。實測在職者孤兒率：**AS 0.0%**、AD 22.1%、AE 65.7%、AJ 84.9%。
- AS 另有 **11 名在職者掛於已關閉部門**（`CLOSE_DATE` 已過）→ 屬 [F006](features/F006-org-change-alert-backend.md) 組織異動提示對象，不停用帳號。
- **消失筆數閾值保護（因應 §3.2）**：單次同步若「上次存在、本次消失」之在職帳號比例超過閾值（草案 **5%**），**中止同步並告警系統管理員**，不執行任何停用，避免上游資料異常導致大規模誤停用。

---

## 8. 浮水印欄位對應（定案）

權威格式：`{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{固定機密聲明}-{當下時間}`

| 浮水印欄位 | 來源 | 定案 |
|---|---|---|
| 員工編號 | `VW_HPMUSER.EMPNO` | |
| 姓名 | `VW_HPMUSER.USERNM` | |
| 公司名稱 | `VW_HRCOMF.COMPFULLNM` | **採全稱**（例：和潤企業股份有限公司）。理由：浮水印用於內控嚇阻與洩密追溯，正式全稱無歧義；且機密聲明已另起一行，長度非瓶頸 |
| 部門 | 使用者所屬部門之 **parent**（Level 2）`DESC_CHI` | |
| 處/室 | 使用者所屬部門（Level 3）`DESC_CHI` | |

### 8.1 組織階層與浮水印層級對應

AS 有效組織實測為 **5 層**（層級判定見 §3.5，一律由代碼前綴決定）：

| 層級 | 代碼樣式 | 部門數 | 在職者 | 浮水印用途 |
|---|---|---|---|---|
| Root | `00000` | 1 | 2 | — |
| 本部 | `A0000` | 5 | 8 | 部門欄 fallback |
| **部** | `AN000` | 24 | 84 | **「部門」欄**（取 `DESC_FULL`） |
| **處/室** | `ANA00` | 57 | **854（77%）** | **「處/室」欄** |
| **課** | `BJAA0` | 27 | **166（15%）** | 見 §8.3 |

實測範例（完全對應現行 prototype 的「營管部-…室」形態）：

| 使用者部門代碼 | 本部 | 部（→浮水印「部門」） | 處/室（→浮水印「處/室」） |
|---|---|---|---|
| `JAC00` | 營業二本部 | **營運管理部** | **審查室** |
| `BBC00` | 營業一本部 | **車輛分期營業二部** | **台中** |
| `CDB00` | 風險管理服務本部 | **債權管理部** | **法催一室** |

### 8.2 取值規則

- **部門** ＝ 由使用者部門代碼推導之**部層**（`LEFT(CODE,2)+'000'`）之 `DESC_FULL`（完整名稱，如「營運管理部」）。
  - Fallback：若無部層 → 取本部層 `DESC_FULL`；再無 → Root。
- **處/室** ＝ 使用者所屬部門 `DESC_CHI` 之**最末段**（以 `/` 切分後取最後一段）。
  - 理由：`DESC_FULL` 為串接全名（「營運管理部審查室」）無分隔符不可拆；`DESC_CHI` 以 `/` 明確分段（「營管部/審查室」→「審查室」）。

### 8.3 「課」層之處理（定案 2026-07-20）

上游多出的「課」層（27 個單位、**166 名在職者，佔 15%**）在浮水印兩欄格式中無獨立位置。
例：`BJAA0` ＝ 供應商金融部 → 北區綜合處 → 醫療一課。

**定案**：
1. **`ORG_UNIT` 完整保存 5 層**，不壓縮、不遺失層級資訊。
2. **浮水印「處/室」欄一律取使用者所屬之「最細單位」名稱**（`DESC_CHI` 最末段）——單一規則、無特例：
   - 處/室層使用者（854 人）→ 顯示室名（如「審查室」）
   - 課層使用者（166 人）→ 顯示課名（如「醫療一課」），略過中間的「北區綜合處」

理由：浮水印用於洩密追溯，取最細單位資訊量最高；且規則單一可保證檢視器疊加／PDF 燒錄／稽核快照三者一致。

### 8.4 無下層者之處理（定案）

掛於部層（84 人）、本部層（8 人）、Root（2 人）者，共 **94 人（8.4%）** 無處/室：
**「處/室」欄留空，並自動收合分隔符**——浮水印呈現為
`{員工編號}-{姓名}-{公司名稱}-{部門}-{機密聲明}-{時間}`（不出現連續分隔符）。

⚠ **檢視器疊加、PDF 燒錄、稽核快照三者必須套用同一收合規則**，確保 [nfr.md#watermark](nfr.md#watermark) AC3 之字串一致性不被破壞。

---

## 9. 組織層級之應用：文件使用部門與權限過濾（定案 2026-07-20）

### 9.1 文件使用部門之粒度

**定案：「文件使用部門」可指定至任意層級（本部／部／處室／課），權限判定時自動展開子樹。**

指定「營運管理部」(`JA000`) ⇒ 其底下所有處/室/課之人員皆視為使用部門相符。
理由：實務上 SOP 適用範圍粗細不一（有些全部適用、有些僅單一室適用），限定單一層級會迫使使用者逐一勾選或過度授權。

### 9.2 子樹展開之實作（前綴比對）

因部門代碼為**前綴編碼**（§3.5），子樹查詢可直接以字串前綴比對達成，**不需 closure table、不需遞迴 CTE**：

| 選定單位 | 代碼 | 有效前綴 | 子樹查詢 |
|---|---|---|---|
| 營業二本部 | `J0000` | `J` | `CODE LIKE 'J%'` |
| 營運管理部 | `JA000` | `JA` | `CODE LIKE 'JA%'` |
| 營管部/審查室 | `JAC00` | `JAC` | `CODE LIKE 'JAC%'` |
| 消費/商品北一/一課 | `JCHA0` | `JCHA` | `CODE LIKE 'JCHA%'` |

**有效前綴 ＝ 去除代碼尾端連續 `0` 後之字串**（Root `00000` 為全域，前綴視為空字串）。

實作要求：
- `ORG_UNIT` 應儲存 `orgCode` 與預先計算之 `codePrefix`，並於 `orgCode` 建立索引；前綴比對為 index-seek 友善（`LIKE 'JA%'` 可用索引）。
- 此規則同時適用於 [F019](features/F019-public-list-browsing.md) 前台部門篩選、[F026](features/F026-role-field-matrix.md) 文件使用部門欄位、以及 **[F033](features/F033-permission-aware-retrieval.md) RAG 檢索層權限過濾**——後者依 [nfr.md#rag-security](nfr.md#rag-security) AC2 必須在向量檢索查詢條件層實作，前綴比對可直接下推為 SQL `WHERE`，符合該要求。

---

## 10. 範圍決策與實測資料品質

**定案：AS（和潤企業）優先，資料模型與同步邏輯保留 `COMPID` 維度以利日後擴充。**

本輪僅同步 `COMPID = 'AS'`；`ORG_UNIT`／`ACCOUNT`／浮水印皆保留公司維度，日後上游補齊 AD/AJ 資料後可直接開啟，無需 schema 變更。

### 10.1 實測資料品質（2026-07-20）

| 公司 | 在職者 | 部門數（有效） | 在職者孤兒率 | 公司主檔 |
|---|---|---|---|---|
| **AS 和潤企業** | **1,114** | 303（**114**） | **0.0%** ✅ | ✅ |
| AD 和潤興業 | 240 | 40（36） | 22.1% | ❌ 缺 |
| AE 和潤電能 | 166 | 8（5） | 65.7% | ✅ |
| AJ 和勁企業 | 909 | 39（29） | 84.9% 🔴 | ❌ 缺 |
| ILS（不明） | 1 | — | 100% | ❌ 缺 |

- `VW_HRCOMF` 僅 3 筆：`AC`(test1，`COMPENDDT`=1900-01-01 測試資料)、`AE`、`AS`。**缺 AD／AJ／ILS**。
- AD／AJ 之部門主檔嚴重不完整，於補齊前**不具備納入條件**。

### 10.2 規模數字（供 [OQ-NFR001](open-questions.md) 校準）

| 項目 | AS | 全體 |
|---|---|---|
| 在職使用者 | **1,114** | 2,430 |
| 有效部門 | **114** | 184 |
| 組織階層深度 | **5 層**（本部 5／部 24／處室 57／課 27） | — |
| 職稱種類 | — | 63 |
| 職務功能（有效） | 23 | 73 |
| 帳號異動量（近 30 天） | — | 2,277 |

→ 前台並發 ≥500、查詢 P95 < 2s 等草案值對此規模（約 1,100 使用者）**應屬寬裕**，可於 [nfr.md#performance](nfr.md#performance) 據此收斂。

---

## 11. 待上游單位確認／提供（未結項）

| # | 事項 | 影響 | 優先 |
|---|---|---|---|
| 1 | **提供最小欄位專用 view**（僅 §5.2 白名單 11 欄，排除密碼與非必要個資） | 資料最小化、降低個資保管責任；同時解決 `SELECT *` 的 schema 漂移風險 | **高** |
| 2 | 補齊 `VW_HRCOMF` 之 AD／AJ／ILS，並釐清 `AC`(test1) 測試資料是否應排除 | 多公司擴充前提 | 中 |
| 3 | 補齊 AD／AJ 之部門主檔（現孤兒率 22.1%／84.9%） | 多公司擴充前提 | 中 |
| 4 | `EMPSTS = 'C'`（25 筆）之正式語意 | 在職判定完整性 | 中 |
| 5 | `ILS` 公司代碼之來源與是否應納入 | 資料清理 | 低 |
| 6 | **職級（`GRADECD`）名稱對照主檔位於何處** | 職級顯示；現僅有職稱與職務功能 | 中 |
| 7 | 上游 view 之變更通知機制與 SLA | 同步穩定性（[nfr.md#integration](nfr.md#integration)） | 中 |
| 8 | **於正式環境覆核值層級統計**：本次盤點於 dev 環境（個資欄位已遮罩）進行，`email` 唯一性／網域分布／重複率、員編重複率等**可能為遮罩產物**，不可直接作為設計依據（尤其身分對應鍵之選擇，見 §12.1） | 身分對應鍵設計正確性 | **高** |
| 9 | 處/室代碼推導部層之 1 筆 miss（57 中 1 筆查無上層部） | 資料完整性，需上游補建該部層節點 | 低 |
| 10 | 確認 5 碼部門代碼之編碼規則為**正式且穩定**之約定（本契約 §3.5／§9.2 均以此為基礎） | 若上游改變編碼規則，階層推導與權限前綴比對將全面失效 | **高** |

---

## 12. 身分驗證與 AD 身分對應（2026-07-20 部分定案）

### 12.1 驗證方式（已定案並**實測打通** 2026-07-20）

> ✅ **端到端 spike 已驗證**（`backend/`，NestJS＋`@azure/msal-node`）：真人以公司帳號登入，走完 `/auth/login`（state＋nonce＋PKCE）→ Azure AD → `/auth/callback` → 後端換 id_token、驗簽解碼 → 取 `email` claim → `resolveAccountByEmail` 回傳 **SingleMatch**。憑證（tenant／client／secret）以 client-credentials 先行驗證有效；**`email` optional claim 確實發出**；authorization code flow＋PKCE 全程可用。
> 尚未實作（屬完成度，非決策）：核發我方 JWT／session、30 分鐘閒置逾時、帳號來源改接真實 `ACCOUNT` 表（現為種子）、cookie 簽章、nonce 由顯示改為強制驗證。

**ICSOP 不是 Portal 的 iframe 子站台**。Portal 僅新增一個入口連結導向 ICSOP，使用者攜帶既有的 AD 登入身分進入。

**採 ICSOP 自行註冊為 Azure AD 應用、走標準 OIDC**（使用者已有 AD session ⇒ 靜默 SSO）。相較於「Portal 傳遞 token」之各種變體，此方案：
- 無共享密鑰、無自訂簽章、token 不經網址傳遞 ⇒ 原 `OQ-NFR002` 之「簽章演算法／共享密鑰交換輪替」大部分消解
- Azure AD 為唯一身分來源，不需信任 Portal 轉手之資料
- 登出、MFA、Conditional Access 沿用公司既有 AD 政策；Portal 端零開發

> 參考 `reference/App.vue`（上游另一子站台之範例）採 iframe + `postMessage` 雙向握手 + 自家後端 `valid(token)`；**該嵌入模型不適用於 ICSOP**，僅其「後端驗證 token 後回傳使用者資料」的分層概念可借鏡。
> ⚠️ 該範例之 `handleMessage` **未驗證 `event.origin`**（送出端有指定 origin、接收端卻無），屬不對稱缺陷；ICSOP 若日後有任何 `postMessage` 需求，必須加上 origin 白名單檢查。

### 12.2 AD 身分 → `ACCOUNT` 對應鍵（**已定案 2026-07-20**）

| 項目 | 定案 |
|---|---|
| 對應欄位 | **`VW_HPMUSER.EMAILADDR`**（非 `HREMAILADDR`） |
| 比對方式 | **完整 email（含網域）**逐字比對，不拆 local-part／不做網域正規化 |
| 兼職者跨公司區分 | 由**網域**天然區分（各公司 AD domain 不同），故完整 email 已足以唯一定位，**不需**額外併入 `COMPID` |
| 狀態過濾 | 比對時強制 `EMPSTS = 'A'`（僅在職帳號，避免命中已離職者） |
| Portal 之對應規則 | **不採用、不需索取**——ICSOP 直接對 Azure AD 認證，Portal 僅為一個連結入口，不參與身分傳遞 |

已排除：`USERID` **不是** AD 帳號名（與 email local-part 幾乎不相同），僅作為 `ACCOUNT` 之內部穩定鍵（§7.2）。

> ✅ **實測佐證（2026-07-20 spike）**：真人 id_token 的 `email` claim 之 local-part 以**大寫**發出，而其網域為 `hfcfinance.com.tw`（＝AS 和潤企業主網域，與 §10.1 遮罩 dev 資料觀察到的主網域一致）。此直接證明**不分大小寫比對是承載性的、非理論**——大寫 claim 需能比對到儲存為小寫之帳號。

> ⚠️ 實作注意：比對應以**不分大小寫**進行（email 網域不分大小寫，local-part 雖理論上區分但實務上不應區分）。
> 若某在職者 `EMAILADDR` 從缺，該員將無法登入——屬資料面問題，應由 HR 補齊，**不得**以 `HREMAILADDR` 靜默 fallback（該欄非 AD 信箱，會對應到錯誤身分）。

### 12.3 Azure AD 應用註冊需求

ICSOP 需向 IT 申請一組 Azure AD app registration：

| 項目 | 說明 |
|---|---|
| Redirect URI | ICSOP 之 OIDC 回呼網址（依環境各一組：development／staging／production） |
| Tenant ID / Client ID | 由 IT 提供 |
| Client Secret 或憑證 | 以環境變數／密鑰機制注入，**不得寫入版控**（[nfr.md#deployment](nfr.md#deployment) AC2） |
| 必要 claim | **`email`**（對應鍵）；另建議取得 `name`、`oid` 供稽核與除錯 |
| 防護 | 標準 OIDC `state` ＋ `nonce` ＋ PKCE（取代原設計之「時間戳＋nonce 自訂簽章」防重放） |

---

## 13. 影響之既有 spec

| 文件 | 需更新內容 |
|---|---|
| [open-questions.md](open-questions.md) | `OQ-E02-01` → 已定案（指向本文件）；`OQ-NFR001` 部分收斂（§10.2） |
| [data-model.md](data-model.md) | `ORG_UNIT` **改為 5 層＋`codePrefix`**（§3.5、§9.2）；`ACCOUNT` 主鍵 `(COMPID, USERID)`（§7.2） |
| [F004](features/F004-org-sync.md) | 增量依據 `MTDT`、階層全量、`OPENQUERY` 下推、消失筆數閾值保護（§7）；**階層以代碼前綴推導，不可用 `P_DEPTID`**（§3.5） |
| [F005](features/F005-auto-disable-departed.md) | 在職判定改以 `EMPSTS='A'`；誤停用防護（§3.2、§7.3） |
| [F006](features/F006-org-change-alert-backend.md) | 掛已關閉部門者（AS 11 人）為提示對象 |
| [F014](features/F014-accountable-dept-chief.md) | `MANGER_EMPNO` 作為當責室長候選來源（實測 100% 有值） |
| [F019](features/F019-public-list-browsing.md) | 部門篩選採任意層＋子樹前綴展開（§9） |
| [F020](features/F020-watermark.md) / [nfr.md#watermark](nfr.md#watermark) | 公司名稱＝`COMPFULLNM` 全稱；處/室＝**最細單位**；無下層者留空收合（§8.2–8.4） |
| [F026](features/F026-role-field-matrix.md) | 文件使用部門可指定任意層級（§9.1） |
| [F033](features/F033-permission-aware-retrieval.md) | 使用部門過濾採前綴比對，可下推為檢索層 SQL `WHERE`，符合 [nfr.md#rag-security](nfr.md#rag-security) AC2（§9.2） |
| [nfr.md#performance](nfr.md#performance) | 依 §10.2 規模收斂草案值（約 1,114 使用者、114 部門） |
| [nfr.md#security](nfr.md#security) | 密碼欄禁讀、白名單存取（§3.4） |
| `prototypes/00,05,17,22,23` | 浮水印公司名稱「和潤企業」→「和潤企業股份有限公司」 |
