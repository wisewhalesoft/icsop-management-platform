---
spec-id: upstream-hr-source-contract
title: 上游人資來源資料契約（組織／人員／職級）
version: 2.0
date: 2026-08-24
status: Draft（實測定案；人員主來源已於 2026-08-24 經上游單位確認後更換）
---

# 上游人資來源資料契約

> ## 🔄 v2.0 修訂（2026-08-24）：人員主來源由 `VW_HPMUSER` 改為 `VW_PERSONNEL_SQL`，範圍由 AS 單一公司擴為四家
>
> **變更緣由**：上游單位確認 **`VW_HPMUSER` 的寫法有問題**——各公司皆出現不該出現的員工（推測為當初建 view 時為某種用途／建立帳號目的而為）。**`VW_PERSONNEL_SQL` 才是公司各系統取用人事資料的共同基礎**。
>
> **v1.0 §2 選用 `VW_HPMUSER` 的理由（它有 `USERID`／`EMPSTS`）依然成立，但前提錯了**：來源母體本身不可信，欄位再齊也沒有意義。
>
> **連帶作廢的 v1.0 實測結論**（皆在污染母體上量得，不得再引用）：
> - §7.2「`EMPNO` 不唯一（AE 166 帳號僅 60 員編）」——AE 真實在職僅 **17** 人
> - §7.3 孤兒率 AD 22.1%／AE 65.7%／AJ 84.9%——量到的是 `VW_HPMUSER` 的污染，**非部門資料缺漏**
> - §10.1「AD／AJ 部門主檔嚴重不完整，不具納入條件」——**實為誤判**，四家部層祖先皆齊備
> - §10.2 規模數字（全體在職 2,430）——真實為 **1,362**
>
> **三項人類裁決（2026-08-24，經上游 HR 負責人確認）**：
> 1. `(COMPID, NO)` 於**正式環境無重複**（dev 有 1 筆 `AS/20012`）；同步端仍須以去重方式防禦
> 2. 同一 `EMAIL` 對應多個帳號時 → **跳出選單由使用者選擇**（不再拒絕登入）
> 3. `RESIGN_DATE` 語意＝**最後在職日** ⇒ 在職判定為 `RESIGN_DATE >= CAST(GETDATE() AS DATE)`
>
> 本次驗證於 dev 環境以唯讀聚合進行（未讀取個別人員資料列、未讀取任何禁欄值）。

> 本文件為 **OQ-E02-01 的定案產出**。v1.0 內容皆來自 2026-07-20 之**唯讀實測盤點**（schema metadata、view 定義 SQL、純聚合統計），非推測。
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
| **人員主檔（v2.0 主來源）** | **`VW_PERSONNEL_SQL`** | `HREMPMF` + 3 表 join | **`INNER JOIN HRDEPTMF`**，見 §3.2 |
| 職稱／職務功能指派 | `VW_PERSONAL_JOB` | `HREMPMF` + 3 表 join | 無 |
| **職位（職級／職務名稱）定義** 🔴 | `VW_JOB_FUN` | `HRJFUNMF` | `END_DT >= GETDATE()`（view 內建，本系統不另加過濾） |
| ~~帳號／在職狀態~~（v2.0 起**不採用**） | ~~`VW_HPMUSER`~~ 🔴 | `PORTAL_HPMUSER` | 無（`SELECT *`）；見 §3.7 |

**為何以 `VW_PERSONNEL_SQL` 為人員主來源（2026-08-24 定案，推翻 v1.0）**：上游單位確認 `VW_HPMUSER` 各公司皆混入不該出現的員工，而 `VW_PERSONNEL_SQL` 是**公司各系統取用人事資料的共同基礎**。v1.0 以 `VW_HPMUSER` 提供 `USERID`／`EMPSTS` 為由選用它，但那兩欄的價值建立在母體正確的前提上——前提不成立時，欄位齊全反而使錯誤資料看起來可信。

替代欄位已全數落實（見 §5.2）：穩定鍵改 `(COMPID, NO)`、在職判定改 `RESIGN_DATE`（§6）。**`VW_PERSONNEL_SQL` 無 `USERID`，故上游帳號不再具備「登入帳號名」**——這不構成問題，因為 AD SSO 以 `EMAIL` 定位帳號（§12.2），`loginId` 僅作內部穩定鍵；帳密登入（途徑 B）僅適用手動帳號。

---

## 3. ⚠ 陷阱與風險（實作前必讀）

### 3.1 🔴 `VW_PERSONNEL_SQL` 三個欄位名稱與內容不符

> ⚠️ **v2.0 起本節適用於主來源**，重要性大幅提高：`NAME` 不是人名、`ACCOUNT` 不是登入帳號。
> 取人名必須用 `NAME_IN_CHINESE`（§5.2），取部門必須用 `DEPT_CODE` 而**非** `DIV_CODE`。

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

**v2.0 語意變更**：本來源成為主來源後，此 `INNER JOIN` 由「缺陷」轉為**資料品質閘門**——沒有有效部門的人不會進入 ICSOP。風險敘述隨之改變：

- ❌ 舊風險（v1.0）：孤兒被吞 → 誤判離職
- ✅ 新風險（v2.0）：**HR 若關閉或刪除一個部門，該部門全員會整批自 view 消失** → [F005](features/F005-auto-disable-departed.md) 誤判離職 → **大規模誤停用**
- **緩解不變**：§7.3 消失筆數閾值保護（5%）仍為必要防線，**理由已改變，勿因「孤兒率為 0」而移除**

> 🔴 **孤兒率在本 view 上恆為 0，不得作為資料品質指標**。孤兒的定義是「`DEPT_CODE` 於部門主檔查無」，而此 `INNER JOIN` 已將這類列濾除——查詢結果是**恆真式**，不論上游資料多不完整都會回 0.0%。
> 2026-08-24 實測四家皆為 0（AD 163／AE 17／AJ 131／AS 1,051），正是此效應，**不是**資料品質良好的證據。
> 要衡量真實的部門資料完整度，須改查「部層祖先是否存在於 `VW_DEPT_SQL`」（§8.1）。

### 3.3 `VW_PERSONNEL_SQL` 日期欄語意被客製改寫

view 內註解明載（2013-12-27 應和潤需求）：

| 欄位 | 實際語意 |
|---|---|
| `HIRE_DATE` ← `HISTORY_DT` | **年資起算日**（非到職日） |
| `REHIRE_DATE` ← `ASSUME_DT` | **到職日** |

取「到職日」須用 `REHIRE_DATE`。

### 3.4 🔴 `VW_HPMUSER` 含密碼欄位（v2.0：本風險已因換來源而消解）

> ✅ **2026-08-24 實測**：`VW_PERSONNEL_SQL` 之 40 欄**不含任何密碼欄**（無 `USERPW`／`DEFAULTPW`）。
> 換來源為一項**實質資安改善**。本節保留作為歷史紀錄，以及「若日後有人重新引入 `VW_HPMUSER`」的警告。
> ⚠️ 但 `VW_PERSONNEL_SQL` 有**另一組**敏感欄位需禁讀（身分證字號、金融個資、第三人聯絡資料），見 §5.2。

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

### 3.7 🔴 `VW_HPMUSER` 母體受污染（2026-08-24 上游確認，v2.0 停用之根因）

上游單位確認：**`VW_HPMUSER` 各公司皆出現不該出現的員工**，推測係當初建 view 時為某種用途（或建立帳號目的）而刻意如此。**該 view 不得作為「誰是在職員工」的權威來源。**

實測落差（在職者，2026-08-24）：

| 公司 | `VW_HPMUSER` | `VW_PERSONNEL_SQL` | 差異 |
|---|---|---|---|
| AS | 1,113 | 1,051 | −62 |
| AD | 244 | 163 | −81 |
| AE | 166 | **17** | −149 |
| AJ | 900 | 131 | −769 |
| ILS | 1 | 0 | −1 |
| **合計** | **2,424** | **1,362** | **−1,062（43.8%）** |

> 🔴 **此差異即為 v1.0「高孤兒率」的真正成因**。被錯誤掛在某 `COMPID` 下的人，其 `DEPTID` 自然對不上該公司的部門主檔，因而呈現為孤兒。v1.0 §10.1 據此判定「AD／AJ 部門主檔嚴重不完整，不具納入條件」——**該判定為誤判**，實際上四家的組織結構皆完整（§10.1）。

**唯一仍可引用 `VW_HPMUSER` 之處**：無。`EMAILADDR` 雖經實測與 `VW_PERSONNEL_SQL.EMAIL` **逐筆 100% 相同**（§12.2），但既然主來源已具備 `EMAIL`，不應再連此 view。

---

## 4. 哨兵日期（Sentinel）

本系統以 **`9999-12-31`** 表示「未結束／無期限」，**不使用 NULL**（多數日期欄為 `NOT NULL`）。

| 欄位 | 哨兵含義 | 實測 |
|---|---|---|
| `VW_DEPT_SQL.CLOSE_DATE` | 部門仍有效 | 184 筆＝有效部門數，完全吻合 |
| **`VW_PERSONNEL_SQL.RESIGN_DATE`** | 未離職 | v2.0 主來源；語意＝**最後在職日**（§6） |
| ~~`VW_HPMUSER.RESIGNDT`~~ | ~~未離職~~ | v1.0 來源，已停用（§3.7） |
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

### 5.2 `ACCOUNT` ← `VW_PERSONNEL_SQL`（白名單，共 11 欄；v2.0 改寫，2026-08-31 加入 `JOB_CODE`）

該 view 共 **40 欄**，ICSOP 僅取下列 11 欄。2026-08-24 實測四家在職 1,362 筆，白名單欄位**空值率全為 0**（`EMAIL` 除外，AS 有 1 筆）；2026-08-31 補測 `JOB_CODE` 亦為 NULL 0／空字串 0。

| ICSOP | 上游 | 備註 |
|---|---|---|
| `loginId` | **`NO`** | **穩定鍵**，與 `COMPID` 併為複合鍵（見 §7.2） |
| `employeeNo` | **`NO`** | 與 `loginId` **同一欄**——人員層 view，一人一列 |
| `name` | **`NAME_IN_CHINESE`** | 🔴 **不是 `NAME`**（那是銀行名稱，見 §3.1）。浮水印姓名來源 |
| `companyCode` | `COMPID` | |
| `orgCode` | **`DEPT_CODE`** | 🔴 **不是 `DIV_CODE`**（那是薪資發放部門，見 §3.1）。實測 1,362/1,362 皆為 5 碼 |
| `email` | **`EMAIL`** | AD SSO 對應鍵（§12.2）。實測與舊 `VW_HPMUSER.EMAILADDR` **逐筆 100% 相同** |
| `isActive` | **`RESIGN_DATE >= CAST(GETDATE() AS DATE)`** | 見 §6 |
| `resignDate` | `RESIGN_DATE` | 語意＝**最後在職日**（2026-08-24 上游確認）；9999-12-31 ＝未離職 |
| `hireDate` | **`REHIRE_DATE`** | 🔴 **不是 `HIRE_DATE`**（那是年資起算日，見 §3.3） |
| `managerEmpNo` | **`DIRECT_BOSS`** | |
| `jobTitleCode` | **`TITLE_CODE`** | 職稱代碼＝畫面之「**資位**」（非名稱）；名稱由 §5.4.1 對照主檔解析。實測四家對照**命中率 100%** |
| `jobPositionCode` | **`JOB_CODE`** | 職位代碼＝畫面之「**職位**」（非名稱）；名稱由 §5.4.2 對照主檔解析。🔴 **與 `VW_DEPT_SQL.JOB_CODE`（＝部門主管員編，§5.1）同名異義**，切勿互推。實測 `(COMPID, CODE)` 精確命中 **1,356/1,362＝99.56%** |
| `lastModifiedAt` | `MTDT` | 增量同步依據；欄名與舊來源相同，語意亦相同 |

> 表列 13 行但白名單為 **11 欄**：`NO` 供應 `loginId`／`employeeNo` 兩個目的，`RESIGN_DATE` 供應 `isActive`／`resignDate` 兩個目的。

#### 🔴 明確排除（不得讀取）

`VW_PERSONNEL_SQL` **不含密碼欄**（§3.4），但含另一組高敏感欄位：

| 類別 | 欄位 |
|---|---|
| **身分證字號** | `ID_NO` |
| **金融個資** | `ACCOUNT`（銀行帳號）、`BK_BR_ID`（分行）、`NAME`（銀行名稱） |
| **第三人個資** | `CONTACTER`、`CONTACTER_REL`、`CONTACT_PHONE`（緊急聯絡人） |
| **特種／敏感個資** | `ABORIGINAL`、`MARRIAGE_STATUS`、`DEPENDENCE`、`BIRTHDAY`、`NATIONALITY`、`SEX`、`BIRTH_PLACE` |
| **聯絡個資** | `LEGAL_PHONE`、`LEGAL_ADDRESS`、`CURRENT_PHONE`、`CURRENT_ADDRESS` |
| **其他非必要** | `INS_CON_ID`、`INS_CON_REMARK`、`NAME_IN_ENGLISH`、`REMARK`、`OLDDPT`、`EMPTP_CODE`、`JOB_LEVEL_CODE`、`AREA_CODE`、`DEPT_SDT`<br>🔵 `JOB_CODE` 已於 2026-08-31 **自本列移出、改列為白名單第 11 欄**（見上表 `jobPositionCode`）——原判定「非必要」係基於「`VW_JOB_FUN` 是職務功能主檔、與人員側無對應鍵」之誤解，2026-08-25 更正後該路徑成立 |
| **⚠ 陷阱欄（存在但語意錯，禁用）** | `DIV_CODE`（薪資部門）、`HIRE_DATE`（年資起算日） |

> ⚠️ **`assertNoForbiddenColumns` 需以字界比對**：新來源之 `ID_NO` 是舊 `VW_PERSONAL_JOB.ID_NUMBER` 之外的**另一個**欄名，兩者皆須列入；字界比對可避免 `ID_NO` 誤中 `ID_NUMBER`（反之亦然）。
> ⚠️ 本 view 為明確欄位清單（非 `SELECT *`），無 v1.0 §3.4 第 3 點之無聲漂移風險；但欄位集合防禦性檢查仍應保留。

### 5.3 公司 ← `VW_HRCOMF`

| ICSOP | 上游 |
|---|---|
| `companyCode` | `COMPID` |
| `companyName` | **`COMPFULLNM`**（浮水印用，定案見 §8） |
| `companyShortName` | `COMPSIMPNM` |
| `isActive` | `COMPENDDT > GETDATE()` |

### 5.4 資位（職稱）／職位（職級）

> 🔵 **2026-08-31 用語與範圍更正（使用者裁定）**：本節原稱之「職稱」（`JTITLE_NM`：業務專員／
> 辦事員／副理…）語意實為**資位**（職等），畫面欄位已更名為「資位」；真正的**職位**（職務位置：
> 營業一般職／事務一般職／室長／處長／部長…）取自 `VW_PERSONNEL_SQL.JOB_CODE` 對照 `VW_JOB_FUN`，
> 見新增之 §5.4.2。二者為**正交維度**——實測 AS 在職 1,051 人中，資位「副理」× 職位「室長」16 人、
> 資位「課長」× 職位「處長」12 人，同資位對應多種職位、反之亦然。

> 🔴 **2026-08-25 正式環境實查更正（本節原標題為「職稱／職務功能」，記載有誤）**，見
> [`docs/stories/2026-08-25-role-automation-delta.md`](../stories/2026-08-25-role-automation-delta.md)。

- 職稱名稱：`VW_PERSONAL_JOB.JTITLE_NM`（63 種，空值 0）。**人員側之對應鍵＝`VW_PERSONNEL_SQL.TITLE_CODE`**（見 §5.4.1）。
- 🔴 **`VW_JOB_FUN` 不是「職務功能」定義主檔，而是「職級／職務名稱」主檔**——實查其欄位僅
  `COMPID`／`CODE`／`DESC_CHI`／`DESC_ENG` ＋ 四個異動軌跡欄（`CRTUSERID`/`CRTPGMID`/`CRTDT`/`MTUSERID`/`MTPGMID`/`MTDT`），
  **不含任何 `JFUN_*` 欄**；內容為 董事長／總經理／本部長／部長／處長／科長／事務一般職／營業一般職／臨時人員 等。
  正式環境四家共 **75 列**（本節原記「AS 23 種」為 dev 舊值），其中 **17 列無任何人員使用**（死代碼）。
  ⚠ **一碼多名跨公司成立且語意可相反**：`D04` 在 AS＝「營業經理」、在 AD＝「科長」；`C04` 在 AD＝「部長」、他家＝「處長」。
  任何以本表為基礎之對照**必須以 `(COMPID, CODE)` 為鍵**。
- `VW_PERSONAL_JOB.JFUN_NM` 之值域與 `VW_JOB_FUN.DESC_CHI` **逐筆 100% 命中**（含 `代理科長`／`處長代行`／
  `營業副理(消)`／`借調主管職` 等冷僻值），證實兩者為同一字典。**該欄本身仍不採用**——它長在
  `VW_PERSONAL_JOB` 上，受 §5.4.1「`EMPNO` 非唯一、無法安全 join 至 `ACCOUNT`」之同一限制。
  🔵 **但這不代表整條職位路徑不可行**（2026-08-31 更正）：人員側另有 `VW_PERSONNEL_SQL.JOB_CODE`
  自帶職位代碼，與 `TITLE_CODE` 完全同一手法即可繞開該 join——見 §5.4.2。
- 🔴 **`VW_PERSONNEL_SQL.JOB_LEVEL_CODE` 已排除，不得用於任何判定**：實測在職者空白率
  AD 98.8%（166/168）／AE 93.8%／AJ 96.3%／AS 81.7%（858/1050），
  且其值為純數字（`003`／`004`／`10`）與 `VW_JOB_FUN.CODE`（`A03`／`N03`）**編碼體系不同**，無從對照。
  → §11 未結項 #6 據此結案，見該節。

#### 5.4.1 `JOB_TITLE` ← `VW_PERSONAL_JOB`（職稱對照主檔，2026-08-12 定案並實作）

> ⚠ **請勿將本節與 §11 #6「職級名稱主檔」混為一談。**「職稱」（`JTITLE_NM`，本節，**上游已具備**）
> 與「職級」（`GRADECD`，§11 #6，**上游待交付**）是兩件事。二者曾一併掛在 `OQ-E02-07` 之下，
> 導致「職位欄無法實作」的錯誤結論；該 OQ 已於 2026-08-12 拆分，見 [open-questions.md](open-questions.md)。

| ICSOP | 上游 | 備註 |
|---|---|---|
| `companyCode` | `COMPID` | 對照鍵之一（見下方歧義說明） |
| `code` | `JTITLE_ID` | 對應 `ACCOUNT.jobTitleCode` |
| `name` | `JTITLE_NM` | 顯示名稱（業務專員／課長／協理…） |

**明確排除（不得讀取）**：`ID_NUMBER`（身分證字號）、`EMPNM`、`BUSINESS_TYPE` 及其餘未列於上表之欄位。
該 view 底層為 `HREMPMF` ＋ 3 表 join，含高敏感個資；本系統僅需上述三欄之對照關係。

**為何以「代碼 + 對照主檔」而非直接取每個人的職稱名稱**：`VW_PERSONAL_JOB` 以「人」為粒度，
其身分鍵為 `EMPNO`——而 `EMPNO` **非唯一**（§7.2）且存在一人多帳號，無法安全 join 至 `ACCOUNT`。
改以 **`VW_PERSONNEL_SQL.TITLE_CODE`**（人員自身即帶職稱代碼；v1.0 為 `VW_HPMUSER.JOBTITLEID`）＋ 本對照主檔解析，即完全繞開該 join。2026-08-24 實測四家在職 1,362 筆，**本公司對照命中率 100%**（v1.0 之 `I10`／`G03` 需跨公司 fallback 之情形不再出現）。

**⚠ 一碼多名（跨公司）與鍵之選擇**：以 `JTITLE_ID` 單獨為鍵**不成立**——全公司範圍下
71 組 `(JTITLE_ID, JTITLE_NM)` 對應 63 種代碼，其中 8 種歧義（如 `C01` ＝協理｜高級協理、
`D00` ＝資深經理｜資深經理(主管職)）。**限單一公司內則為 1:1**（AS：54 組 pair／54 種代碼，零歧義），
故對照主檔以 `(COMPID, JTITLE_ID)` 為唯一鍵。

**解析規則（兩段式，讀寫端一致）**：
1. **本公司優先** —— `(companyCode, code)` 精確命中；此段即保證 1:1、無歧義。
2. **跨公司 fallback** —— 本公司對照缺該代碼時，取其他公司之同代碼，
   固定選 `companyCode` 字典序最小者（**確定性**，避免同帳號在不同次同步解析出不同職稱）。

**實測命中率（2026-08-12，AS 在職 1,115 筆）**：

| 解析方式 | 命中 | 說明 |
|---|---|---|
| 僅第 1 段（本公司） | 1,105 / 1,115（99.10%） | `I10`(9 筆)／`G03`(1 筆) 不存在於 AS 之對照列 |
| 兩段式（含 fallback） | **1,115 / 1,115（100%）** | `I10`／`G03` 皆不在上述 8 種歧義代碼之列，fallback 無歧義風險 |

**⚠ 兩個易混淆的列數口徑**：`71` 組是 `DISTINCT (JTITLE_ID, JTITLE_NM)`（用以論證上述歧義）；
攝入 `JOB_TITLE` 的則是 `DISTINCT (COMPID, JTITLE_ID, JTITLE_NM)`＝**109 列**（2026-08-12 實測，
含 `JTITLE_NM IS NOT NULL` 過濾），其中 AS 佔 54 列。

> 🔴 **加欄後之回填不會自然發生**：帳號同步為增量（`MTDT > watermark`），既有帳號不會被取回。
> 新增任何上游帳號欄位後，**必須執行一次全量重同步**：`SYNC_FULL_RESYNC=1 npm run sync:once`。
> ⚠ 不可類比 `ORG_UNIT.descFull`（組織來源本就全量取回，故其回填可自然完成）。
> 2026-08-12 實跑：全量取回 2,772 筆 → 新增 1／更新 1,113，職稱覆蓋 1,115/1,115（100%）；
> 再跑一次為 0 異動（冪等驗證通過）。

實作對應：`ACCOUNT.jobTitleCode`／`JOB_TITLE` 表（migration `1723852800000-account-job-title`）、
查詢建構 `buildJobTitleQuery`、解析 `backend/src/org-directory/job-title-directory.ts`。

#### 5.4.2 `JOB_POSITION` ← `VW_JOB_FUN`（職位對照主檔，2026-08-31 定案並實作）

> 畫面「職位」欄之來源。人員側對應鍵＝**`VW_PERSONNEL_SQL.JOB_CODE`**（§5.2），與 §5.4.1 之
> `TITLE_CODE` 為完全相同的手法：人員自身即帶代碼，故繞開 `VW_PERSONAL_JOB` 之 `EMPNO` join 限制。

| ICSOP | 上游 | 備註 |
|---|---|---|
| `companyCode` | `COMPID` | 對照鍵之一（**必要**，見下方歧義說明） |
| `code` | `CODE` | 對應 `ACCOUNT.jobPositionCode` |
| `name` | `DESC_CHI` | 顯示名稱（營業一般職／事務一般職／室長／處長／部長…） |

**取用方式**：`SELECT COMPID, CODE, DESC_CHI FROM VW_JOB_FUN`，全公司全量、非增量。
該 view 逐「代碼」一列（非逐人），四家共 **73 列**，故不需 `DISTINCT`、不需分頁。
**不另加 `END_DT` 過濾**——view 定義本身已內建 `END_DT >= GETDATE()`（§2），且該 view 亦無 `END_DT` 欄。
其餘欄位（`DESC_ENG` 與六個異動軌跡欄）不取。

**🔴 解析必須「本公司精確命中、查無即空」，嚴禁跨公司 fallback**——這是與 §5.4.1（資位，兩段式含
fallback）之**刻意差異**。2026-08-31 實查四家 73 列中，**7 個代碼跨公司一碼多名且語意可相反**：

| 代碼 | AS | AE | AD |
|---|---|---|---|
| `B01` | 本部長 | 本部長 | **本處長** |
| `B03` | 部長 | 部長 | **處長** |
| `C04` | 處長 | 處長 | **部長** |
| `D04` | **營業經理** | —（無此碼） | **科長** |
| `M03` | 事務一般職 | 事務一般職 | **事務職** |
| `N03` | 營業一般職 | 營業一般職 | **營業職** |

資位之 fallback 最壞情況是顯示他公司的同義職稱；職位之 fallback 會把「科長」顯示成「營業經理」
——**顯示錯誤的職位比顯示「—」嚴重得多**。

**實測數字（2026-08-31，dev `ZZIPPROD` → `[APYHFC23].[HR2]`）**：

| 項目 | AS | AD | AE | AJ | 合計 |
|---|---|---|---|---|---|
| 在職者 | 1,051 | 163 | 17 | 131 | 1,362 |
| `JOB_CODE` NULL／空字串 | 0 | 0 | 0 | 0 | **0** |
| `(COMPID, CODE)` 未命中 | 6 | 0 | 0 | 0 | **6（99.56% 命中）** |
| `VW_JOB_FUN` 列數 | 23 | 11 | 18 | 21 | **73** |
| 其中無人使用之死代碼 | 6 | 3 | 11 | 4 | 24 |

- **唯一未命中之代碼＝AS 的 `B20`（6 人）**：該代碼於四家 `VW_JOB_FUN` 中**皆不存在**，
  故縱使開放跨公司 fallback 亦無從命中 → 這 6 人之職位欄顯示「—」（F003 `AC-P18`）。
  ⚠ 此為**上游主檔缺列**，非本系統缺陷；若日後上游補上該代碼，下次同步即自動生效、無需改碼。
- ⚠ 本次實查於 **dev** 進行（個資已遮罩，但代碼欄非遮罩對象）。在職母體 1,362 與 §10.2 記載一致、
  `VW_JOB_FUN` 73 列亦與 §10.2 之「職務功能（有效）」欄一致（正式環境 2026-08-25 實查為 75 列），
  故結構與命中率結論可用；正式站上線前建議以同一組查詢複跑一次。

> 🔴 **加欄後之回填不會自然發生**（同 §5.4.1 之陷阱）：必須 `SYNC_FULL_RESYNC=1 npm run sync:once`，
> 且 `classifyAccount` 已將 `jobPositionCode` 納入比對——漏列會使全部既有列判為 noop，
> 連全量重同步都寫不進去。

實作對應：`ACCOUNT.jobPositionCode`／`JOB_POSITION` 表（migration `1725062400000-account-job-position`）、
查詢建構 `buildJobPositionQuery`、解析 `backend/src/org-directory/job-position-directory.ts`。

---

## 6. 在職／離職判定（v2.0 改寫）

**權威判定：`RESIGN_DATE >= CAST(GETDATE() AS DATE)`**

`RESIGN_DATE` 之語意經上游單位確認（2026-08-24）為 **「最後在職日」**——當日仍屬在職。因此：

- ✅ 正確：`RESIGN_DATE >= CAST(GETDATE() AS DATE)` —— 最後在職日為今天者，今日整天仍判為在職
- ❌ 錯誤：`RESIGN_DATE >= GETDATE()` —— `GETDATE()` 含時分秒，會使「最後在職日為今天」者自今日 00:00:01 起即被判離職；且同一天不同時刻執行同步會得到**不同結果**

> ⚠️ **時間相依性**：此判定隨執行時點改變（跨日時邊界移動）。2026-08-24 兩次執行相差 6 人，即此效應。同步日誌須記錄判定基準日，供事後對帳。

**`EMPSTS` 於 v2.0 起不再使用**（該欄僅存在於已停用的 `VW_HPMUSER`）。v1.0 §11 #4「`EMPSTS='C'` 25 筆語意待確認」隨之**結案，無需上游回覆**。

實測在職母體（2026-08-24）：AS 1,051／AD 163／AE 17／AJ 131，合計 **1,362**。

---

## 7. 同步策略

### 7.1 增量同步

- 依據 **`VW_PERSONNEL_SQL.MTDT`**（欄名與 v1.0 之來源相同，語意亦相同；實測 1,362 筆**零空值**）。v1.0 記載之異動量統計（近 30 天 2,277 筆）係於污染母體上量得，**須重新量測**。
- 每日排程 02:00 (UTC+8)（OQ-E02-02 定案），失敗 3 次遞增間隔重試。
- 因異動量可觀（日均約 76 筆、且有批次尖峰），增量同步具實益；但**組織階層（`VW_DEPT_SQL`，僅 114 筆有效）建議每次全量取回**，成本極低且免除階層增量的正確性風險。

### 7.2 穩定鍵（v2.0 改寫）

- **`ACCOUNT` 主鍵採 `(COMPID, NO)`**（2026-08-24 上游確認之權威人員鍵）。
- **正式環境無重複**（上游單位確認）。dev 環境實測有 **1 筆**違反：`AS`／`NO=20012` 兩列，同部門、同 `REHIRE_DATE`（2004-01-01）、`RESIGN_DATE` 皆哨兵 ⇒ 研判為 dev 之重複資料列，非兩個自然人。
- 🔒 **同步端仍須以去重方式防禦**（人類裁決 #1）：撞鍵不得使整批同步失敗。去重須為**確定性**（例如取 `MTDT` 最新者，同值再取先出現者），避免同一份資料在不同次同步解析出不同結果。
- **`loginId` 與 `employeeNo` 同源於 `NO`**：人員層 view 一人一列，v1.0「不得以 `EMPNO` 為主鍵（一人多帳號）」之顧慮**隨來源更換而消失**——該現象是 `VW_HPMUSER` 的帳號層粒度所致（見 §3.7）。
- 🔴 **遷移風險**：既有 `ACCOUNT.loginId` 存的是舊來源之 `USERID`。改用 `NO` 後**每筆上游帳號的鍵都會變** ⇒ 同步將判定「舊帳號全數消失、新帳號全數新增」⇒ 觸發 §7.3 之 5% 閾值而中止。**必須以一次性資料遷移改寫既有 `loginId`（舊 `EMPNO` ↔ 新 `NO`），不得讓同步自然收斂。**

### 7.3 孤兒與消失保護

- ~~**孤兒**＝`VW_HPMUSER.DEPTID` 於 `VW_DEPT_SQL` 查無。實測孤兒率 AS 0.0%／AD 22.1%／AE 65.7%／AJ 84.9%。~~
  🔴 **v2.0 作廢**：該組數字量到的是 `VW_HPMUSER` 的母體污染，**非部門資料缺漏**（見 §3.7）。且新來源之 `INNER JOIN` 使孤兒率**恆為 0**，此指標於 v2.0 起**不具診斷價值**（見 §3.2）。
- AS 另有 **11 名在職者掛於已關閉部門**（`CLOSE_DATE` 已過）→ 屬 [F006](features/F006-org-change-alert-backend.md) 組織異動提示對象，不停用帳號。（此結論仍成立：關閉之部門仍存在於主檔，不被 `INNER JOIN` 濾除。）
- **消失筆數閾值保護（因應 §3.2）**：單次同步若「上次存在、本次消失」之在職帳號比例超過閾值（草案 **5%**），**中止同步並告警系統管理員**，不執行任何停用。
  🔒 **v2.0 起此防線更為關鍵**：新來源之 `INNER JOIN` 意味著「HR 關閉一個部門 ⇒ 該部門全員自 view 消失」，是最可能觸發大規模誤停用的路徑。**不得因孤兒率為 0 而放寬或移除此閾值。**

---

### 7.4 切換作業 runbook（v2.0 換來源，一次性）

> 🔴 **順序不可調換**。跳過任一步會使切換卡在「同步中止」，且錯誤訊息看起來像上游故障。

| # | 步驟 | 指令／動作 | 驗證 |
|---|---|---|---|
| 1 | 備份 `ACCOUNT` | 依現行備援程序 | 可還原 |
| 2 | 部署新 image | ⚠ `--build` 只換 image 不換容器，**必須 `--force-recreate`** | 容器內 `dist` 為新版 |
| 3 | 跑 migration | `AccountLoginIdToEmployeeNo1724198400000` | `ACCOUNT.legacyLoginId` 已存在且上游帳號皆有值 |
| 4 | 確認鍵已改寫 | `SELECT COUNT(*) FROM ACCOUNT WHERE source='upstream' AND loginId<>legacyLoginId` | 數量 ≈ 上游帳號數 |
| 5 | 清點**未**改寫者 | `... AND loginId=legacyLoginId`（碰撞或已被占用而略過者） | 逐筆人工確認皆為 §3.7 之污染列 |
| 6 | **一次性**放寬閾值 | `SYNC_DISAPPEARED_THRESHOLD=0.5` | `sync:once` 啟動日誌印出「閾值已被覆寫」警示 |
| 7 | 全量重同步 | `SYNC_FULL_RESYNC=1 npm run sync:once`（⚠ 不可用 `-- --full`） | `status=success`；帳號數對上 §10.1 |
| 8 | 🔴 **移除**閾值覆寫 | 自 `.env` 刪除 `SYNC_DISAPPEARED_THRESHOLD` 並 `--force-recreate` | 再跑一次 `sync:once` 為 0 異動（冪等）且閾值警示消失 |

**第 6～8 步為何必要**：切換當下本地在職集合來自舊來源、來源在職集合來自新來源，母體不同 ⇒ 消失比例必然偏高（實測 AS 約 **5.6%**）而觸發 §7.3 之 5% 中止。中止時**不套用任何異動**，系統會停在舊資料上。

**第 8 步為何不可省**：該閾值防的是「HR 關閉一個部門 ⇒ 該部門全員自 view 消失（§3.2 之 `INNER JOIN`）⇒ 大規模誤停用」。留著 0.5 等於把這道防線關掉，而且**不會有任何徵兆**。

---

## 8. 浮水印欄位對應（定案）

權威格式：`{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{固定機密聲明}-{當下時間}`

| 浮水印欄位 | 來源 | 定案 |
|---|---|---|
| 員工編號 | **`VW_PERSONNEL_SQL.NO`** | v1.0 為 `VW_HPMUSER.EMPNO` |
| 姓名 | **`VW_PERSONNEL_SQL.NAME_IN_CHINESE`** | v1.0 為 `VW_HPMUSER.USERNM`。🔴 **不是 `NAME`**（銀行名稱，§3.1） |
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

**v2.0 定案（2026-08-24）：AD／AE／AJ／AS 四家全數納入。**

~~v1.0 定案：AS 優先，AD／AJ 因部門主檔不完整不具納入條件。~~ 🔴 **該判定為誤判**——高孤兒率量到的是 `VW_HPMUSER` 的母體污染（§3.7），四家的組織結構實際上皆完整。

`ORG_UNIT`／`ACCOUNT`／浮水印本就保留 `COMPID` 維度。

### 10.0 🔴 實作階段之更正：**仍需 schema 變更**（2026-08-24 B 階段實作發現）

規劃時判斷「無需 schema 變更」，**實作後證實為誤**。`ORG_UNIT`／`ACCOUNT` 確實早有 `companyCode`，
但下列三處在單一公司時從未被發現的缺口，於多公司資料共存後會產生**靜默錯誤**：

| # | 缺口 | 後果 | 修正 |
|---|---|---|---|
| 1 | `SYNC_RUN` **無 `compid` 欄位**；`getAccountWatermark(_compid)` 宣告了參數卻從未使用（全域查「最後一次成功同步」） | 新公司首次同步**繼承他公司水位** ⇒ 增量查詢誤判無異動 ⇒ 該公司帳號幾乎全數不寫入，**且同步回報成功** | migration `1724284800000-sync-run-compid`；互斥鎖與水位改 per-company |
| 2 | `ICSOP_DOCUMENT`／`DOC_USING_DEPT` **無 `companyCode`**；`draftingCompanyId` 等三欄存裸 `orgCode` | 文件無法自證所屬公司 ⇒ 部門名稱解析歧義（顯示他公司單位或留白） | migration `1724371200000-document-company-code`；既有列 backfill `'AS'` |
| 3 | 🔴 **安全性**：`isUsingDeptMatched` 以裸 `orgCode` 前綴比對，不含公司 | F041「業務」子分類使用者**可看到別家公司的文件**（越權瀏覽，靜默無痕） | `UsingDeptRef{companyCode,orgCode}` 取代裸字串；`ViewerScope` 補 `companyCode` |

**根因為何在單一公司時看不出來**：`orgCode` 是 5 碼部門代碼、**每家公司各自從 `00000`（Root）
獨立編碼**——AS 的 `A0000` 與 AD 的 `A0000` 字串相同、意義完全不同。只有一家公司時，
「以裸 orgCode 查詢」與「以 (companyCode, orgCode) 查詢」結果恆等，缺口因而長期潛伏。

**修法上的一致原則**：`companyCode` 一律為**必要參數，不給預設值**。舊版之
`defaultCompany = 'AS'`／`DEFAULT_COMPANY = 'AS'` 正是缺陷成因（使全部呼叫端沉默地只查 AS）；
改必填後，未接上公司別的呼叫點會**直接編譯失敗**，無法漏改——本次 12 個下游生產檔案即由
編譯器完整列出，非人工清點。

### 10.1 實測資料品質（2026-08-24，`VW_PERSONNEL_SQL` 為母體）

| 公司 | 公司全稱（`COMPFULLNM`） | 在職者 | 有效部門 | 部層祖先 | 職稱對照 | 信箱 |
|---|---|---|---|---|---|---|
| **AS** 和潤 | 和潤企業股份有限公司 | 1,051 | 114 | ⚠ 2 筆註記 | 100% | 1 筆空值 |
| **AD** 興業 | 和潤興業股份有限公司 | 163 | 36 | ✅ 齊備 | 100% | ✅ |
| **AE** 潤電 | 和潤電能股份有限公司 | 17 | 5 | ✅ 齊備 | 100% | ✅ |
| **AJ** 和勁 | 和勁企業股份有限公司 | 131 | 29 | ✅ 齊備 | 100% | ✅ |
| **合計** | | **1,362** | **184** | | | |

**組織層級分布（未關閉部門）**：

| 公司 | Root | 本部 | 部 | 處/室 | 課 |
|---|---|---|---|---|---|
| AS | 1 | 5 | 24 | 57 | 27 |
| AD | 1 | **0** | 10 | 25 | 0 |
| AE | **0** | 1 | 3 | 1 | 0 |
| AJ | 1 | 2 | 5 | 14 | 7 |

- **`VW_HRCOMF` 四家俱全**，`COMPENDDT` 皆為 `9999-12-31` 哨兵。v1.0「僅 3 筆、缺 AD／AJ」與 `AC`(test1) 之記載**已不符現況**。
- 🔴 **v1.0「上游無公司全稱來源」為誤述**——`COMPFULLNM` 存在且有值。`backend/src/org-directory/company-name.ts` 之靜態表可改接上游；**其中 `AE` 現值 `'和潤電能'` 缺「股份有限公司」，屬既有缺陷須修**（該筆原就標記 `[ASSUMPTION] 全稱待覆核`）。
- ⚠️ **公司「簡稱」不得改接 `COMPSIMPNM`**：浮水印簡稱為自訂（`AS`＝和潤企業），上游簡稱為「和潤」；改接會變更已驗收之 AS 浮水印。
- **AD 無本部層、AE 無 Root**：與 AS 之「作業改善室／職安室直屬本部」同構，套用同一裁決即可，不影響浮水印（部層皆存在）。
- **AS 之 2 筆部層祖先缺漏**（`CKA00` 作業改善室 → `CK000`、`WAA00` 職安室 → `WA000`）：人類裁決為**不處理**（兩室直屬本部）。
- **`ILS` 於新母體不存在**（v1.0 之 1 筆在職者係 `VW_HPMUSER` 污染）。v1.0 §11 #5 隨之**結案**。

### 10.2 規模數字（供 [OQ-NFR001](open-questions.md) 校準）

| 項目 | AS | 四家全體（v2.0 納入範圍） | v1.0 記載（已作廢） |
|---|---|---|---|
| 在職使用者 | **1,051** | **1,362** | ~~2,430~~ |
| 有效部門 | **114** | **184** | 184（不變） |
| 組織階層深度 | **5 層**（本部 5／部 24／處室 57／課 27） | 最深 5 層 | — |
| 職稱種類 | — | 63 | 63 |
| 職位代碼（`VW_JOB_FUN` 有效列） | 23 | 73 | 73 |
| 帳號異動量（近 30 天） | — | **待重新量測** | ~~2,277~~ |

> 🔴 **v2.0 之使用者規模比 v1.0 更小**（1,362 < 2,430）——擴充為四家公司後總量反而下降，因為 v1.0 的 2,430 含 `VW_HPMUSER` 之污染列（§3.7）。

→ 前台並發 ≥500、查詢 P95 < 2s 等草案值對此規模（約 1,360 使用者）**仍屬寬裕**，可於 [nfr.md#performance](nfr.md#performance) 據此收斂。

---

## 11. 待上游單位確認／提供（未結項）

| # | 事項 | 影響 | 優先 | 狀態 |
|---|---|---|---|---|
| 1 | **提供最小欄位專用 view**（僅 §5.2 白名單 10 欄） | 資料最小化、降低個資保管責任 | 中 | 🟡 **降級**：新來源非 `SELECT *`、且無密碼欄，急迫性大減；但仍含身分證字號與金融個資 |
| 2 | ~~補齊 `VW_HRCOMF` 之 AD／AJ／ILS~~ | — | — | ✅ **結案**：四家俱全且有 `COMPFULLNM`（§10.1） |
| 3 | ~~補齊 AD／AJ 之部門主檔~~ | — | — | ✅ **結案**：原判定係污染母體所致之誤判（§3.7） |
| 4 | ~~`EMPSTS='C'` 之正式語意~~ | — | — | ✅ **結案**：`EMPSTS` 已不使用（§6） |
| 5 | ~~`ILS` 公司代碼之來源~~ | — | — | ✅ **結案**：新母體不存在（§10.1） |
| 6 | ~~**職級（`GRADECD`）名稱對照主檔位於何處**~~ | — | — | ✅ **結案（2026-08-25）——結論為「不值得追」而非「找到了」**：`JOB_LEVEL_CODE` 在職者空白率 82–99%（AD 98.8%／AE 93.8%／AJ 96.3%／AS 81.7%），且其值為純數字與 `VW_JOB_FUN.CODE` 編碼體系不同，**縱使找到對照主檔亦套不上任何人**。見 §5.4 與 [role-automation-delta](../stories/2026-08-25-role-automation-delta.md) |
| 7 | 上游 view 之變更通知機制與 SLA | 同步穩定性（[nfr.md#integration](nfr.md#integration)） | 中 | 🟡 未結；**優先度應提高**——v2.0 之換來源即源於 view 語意問題無人通知 |
| 8 | **於正式環境覆核值層級統計** | 身分對應鍵設計正確性 | **高** | 🟡 部分覆核：`EMAIL`≡`EMAILADDR` 已逐筆比對；姓名基數 1,343/1,362 證實未遮罩。**信箱重複組數仍須於正式環境重驗** |
| 9 | ~~處/室代碼推導部層之 1 筆 miss~~ | — | — | ✅ **結案**：實為 2 筆（`CKA00`／`WAA00`），人類裁決不處理（§10.1） |
| 10 | 確認 5 碼部門代碼之編碼規則為**正式且穩定**之約定 | 若上游改變編碼規則，階層推導與權限前綴比對將全面失效 | **高** | 🟡 未結；四家實測皆為 5 碼（1,362/1,362） |
| **11** | **`(COMPID, NO)` 之唯一性保證**（dev 有 1 筆 `AS/20012` 重複） | 穩定鍵成立與否；撞鍵會使整批同步失敗 | **高** | 🟡 上游口頭確認正式環境無重複；**建議取得書面確認**，同步端仍加去重防禦（§7.2） |
| **12** | **同一 `EMAIL` 對應多個在職人員記錄**（dev 實測 6 組／16 人，含 2 組跨 4 家公司） | AD SSO 登入解析 | **高** | 🟡 已裁決以選單處理（§12.2）；**組數須於正式環境重驗** |
| **13** | `RESIGN_DATE` 語意之書面確認（＝最後在職日） | 在職判定邊界（§6） | 中 | 🟡 上游口頭確認，建議書面化 |
| **14** | 🔴 **B 階段兩支 migration 未對真庫實跑**（`1724284800000-sync-run-compid`／`1724371200000-document-company-code`） | 欄位不存在則同步與文件讀取全面失敗 | **高** | 🔴 **上線前必做**——本專案既有教訓：單元測試全綠證明不了資料表存在 |
| **15** | 🔴 **四家公司之首次同步未實跑** | 新公司首次同步為 `watermark=null` 全量取回；實跑前無法確認筆數與耗時 | **高** | 🔴 建議以 `SYNC_ONLY_COMPID=AD npm run sync:once` **逐家**驗證，勿一次四家 |
| **16** | 開放多公司後，既有 AS 文件之 `companyCode` 已 backfill `'AS'`，但**新建文件之公司別來源尚未接前端** | 非 AS 公司使用者建立文件時公司別可能錯誤 | **高** | 🔴 前端「制定公司」選單目前讀 `tier='ROOT'` 之 org-unit，四家 ROOT 代碼皆為 `00000`（AE 甚至無 ROOT 列）——**需改為真正的公司選擇器**，屬 B 階段未完成項 |

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

| 項目 | 定案（v2.0，2026-08-24 修訂） |
|---|---|
| 對應欄位 | **`VW_PERSONNEL_SQL.EMAIL`**（v1.0 為 `VW_HPMUSER.EMAILADDR`） |
| 比對方式 | **完整 email（含網域）**逐字比對，不拆 local-part／不做網域正規化（**不變**） |
| 兼職者跨公司區分 | 🔴 **v1.0 假設推翻**，見下方 |
| 狀態過濾 | **`RESIGN_DATE >= CAST(GETDATE() AS DATE)`**（v1.0 為 `EMPSTS='A'`；§6） |
| 命中多筆 | 🔄 **改為跳出選單由使用者選擇**（v1.0 為拒絕登入並告警），見下方 |
| Portal 之對應規則 | **不採用、不需索取**（**不變**） |

> ✅ **§12.1 之端到端 spike 不需重做**：2026-08-24 實測 `VW_PERSONNEL_SQL.EMAIL` 與舊 `VW_HPMUSER.EMAILADDR` **逐筆 100% 相同**（AD 163/163、AE 17/17、AJ 131/131、AS 1,052/1,052），且與 `HREMAILADDR` **0% 相同**。換來源只改「從哪支 view 取」，**值完全不變**，故那次真人登入打通的驗證仍然有效。
> 🔒 v1.0「**不得** fallback 至 `HREMAILADDR`」之警告**依然成立**（0% 相同再次證實兩欄內容不同）。

#### 🔴 v1.0 假設推翻：完整 email 不足以唯一定位

v1.0 記載「兼職者跨公司由**網域**天然區分，故完整 email 已足以唯一定位，不需併入 `COMPID`」。**實測推翻**（2026-08-24，dev）：

| 碰撞形狀 | 組數 | 人員記錄數 | 姓名是否一致 |
|---|---|---|---|
| 同一公司內重複 | 1 | 2 | ✅ 一致 |
| 跨 **2** 家公司 | 3 | 6 | ✅ 一致 |
| 跨 **4** 家公司 | 2 | 8 | ✅ 一致 |
| **合計** | **6** | **16** | **6/6 全部一致** |

#### 人類裁決 #2（2026-08-24）：命中多筆 → 跳出選單由使用者選擇

**安全論證（本裁決成立之前提）**：上表 **6 組之 `NAME_IN_CHINESE` 全部一致**，即每一組皆為**同一自然人**在多家公司的人事記錄，**不是共用信箱**。因此：

- 請求者已通過 Azure AD 驗證 ⇒ 已證明擁有該信箱
- 選單所列之每個帳號**皆屬於該自然人本人** ⇒ **無權限提升風險**

> ⚠️ **遮罩檢定**：為排除「姓名被遮罩成同一值」而導致上述論證失效，另量測姓名基數＝**1,343 相異 / 1,362 人**，證實姓名未被遮罩，論證成立。
>
> 🔒 **此前提為裁決 #2 的成立條件，不是背景說明**。若正式環境重驗（§11 #12）發現**任一組姓名不一致**（＝真正的共用信箱），則該組**不得**進入選單——否則任何能收該信箱的人都可任選帳號登入。實作時應將「同組姓名一致」列為顯示選單的**執行期前置條件**，不一致者退回 v1.0 之拒登並告警。

**衍生工作**：本裁決為 [F001](features/F001-authentication.md) 之**新增功能**（登入中繼狀態＋帳號選擇畫面），非既有行為之參數調整；`backend/src/auth/account-resolver.ts` 現行之 `MultipleActive` → 拒登路徑須改寫。須另立 spec 與 AC。

已排除：v1.0 之 `USERID` 於新來源不存在；`ACCOUNT` 之內部穩定鍵改為 `(COMPID, NO)`（§7.2）。

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
| [data-model.md](data-model.md) | `ORG_UNIT` **改為 5 層＋`codePrefix`**（§3.5、§9.2）；🔄 **v2.0**：`ACCOUNT` 主鍵改 **`(COMPID, NO)`**（§7.2），並需一次性 `loginId` 遷移 |
| 🔄 **v2.0 新增** [F001](features/F001-authentication.md) | **同一 `EMAIL` 命中多帳號 → 帳號選擇畫面**（裁決 #2，§12.2）；`account-resolver.ts` 之 `MultipleActive` 拒登路徑須改寫；對應鍵改 `VW_PERSONNEL_SQL.EMAIL`（**值不變**，spike 不需重做） |
| 🔄 **v2.0 新增** `backend/src/org-sync/org-sync.config.ts` | `SYNC_COMPID` 單值 `'AS'` → **四家清單**（§10）；四支查詢建構器與 `org-directory.module.ts` 之注入點連動 |
| 🔄 **v2.0 新增** `backend/src/org-directory/company-name.ts` | 補 `AD`／`AJ` 兩家（`COMPANY_FULL_NAMES` ＋ `COMPANY_SHORT_NAMES`，受 `INV-C2` 型別綁定）；**修正 `AE` 全稱缺「股份有限公司」**（§10.1）。⚠ 簡稱**不得**改接 `COMPSIMPNM` |
| [F004](features/F004-org-sync.md) | 增量依據 `MTDT`、階層全量、`OPENQUERY` 下推、消失筆數閾值保護（§7）；**階層以代碼前綴推導，不可用 `P_DEPTID`**（§3.5） |
| [F005](features/F005-auto-disable-departed.md) | 🔄 **v2.0**：在職判定改 **`RESIGN_DATE >= CAST(GETDATE() AS DATE)`**（§6，原 `EMPSTS='A'`）；誤停用防護之**理由改變但防線保留**（§3.2、§7.3） |
| [F006](features/F006-org-change-alert-backend.md) | 掛已關閉部門者（AS 11 人）為提示對象 |
| [F014](features/F014-accountable-dept-chief.md) | `MANGER_EMPNO` 作為當責室長候選來源（實測 100% 有值） |
| [F019](features/F019-public-list-browsing.md) | 部門篩選採任意層＋子樹前綴展開（§9） |
| [F020](features/F020-watermark.md) / [nfr.md#watermark](nfr.md#watermark) | 公司名稱＝`COMPFULLNM` 全稱；處/室＝**最細單位**；無下層者留空收合（§8.2–8.4） |
| [F026](features/F026-role-field-matrix.md) | 文件使用部門可指定任意層級（§9.1） |
| [F033](features/F033-permission-aware-retrieval.md) | 使用部門過濾採前綴比對，可下推為檢索層 SQL `WHERE`，符合 [nfr.md#rag-security](nfr.md#rag-security) AC2（§9.2） |
| [nfr.md#performance](nfr.md#performance) | 🔄 **v2.0**：依 §10.2 收斂為**約 1,362 使用者、184 部門**（四家合計；原記 1,114／114） |
| [nfr.md#security](nfr.md#security) | 🔄 **v2.0**：密碼欄風險消解，但**新增禁欄**——身分證字號 `ID_NO`、金融個資、第三人聯絡資料（§5.2） |
| `prototypes/00,05,17,22,23` | 浮水印公司名稱「和潤企業」→「和潤企業股份有限公司」 |
