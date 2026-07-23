# 上游 PERSON / ORG 權威來源（org-foundation 定案）

> 2026-07-22 定案。補足 `upstream-hr-source-contract.md`：PERSON 名稱與 ORG 階層之權威來源與取法。
> 來源依據：隔壁專案 `portalapp-sp`（讀**同一顆**上游 HR DB `[APYHFC23].HR2.dbo`）之實作，**未採用** `VW_PERSONNEL_SQL`（其 `NAME`＝銀行名、INNER JOIN 掉人、hire/rehire 對調三雷）。

## PERSON — `VW_HPMUSER`
- 白名單欄（**絕不 `SELECT *`**，上游含 `USERPW`/`DEFAULTPW` 密碼欄）：`USERID, EMPNO, USERNM, COMPID, DEPTID, EMPSTS, DIRECTOR`。
- **姓名＝`USERNM`**（真實中文姓名，如 吳奇聰）。**employeeNo＝`EMPNO`**（RTRIM 後比對；= `VW_DEPT_SQL.JOB_CODE`）。
- **在職＝`RTRIM(EMPSTS)='A'`**（無 hire/leave 日期邏輯；`B`＝離職、`C`＝未定義）。
- **跨公司 `EMPNO` 不唯一** → 取一列時 `COMPID='AS'` 優先、否則 `MIN(COMPID)`。
- `DIRECTOR` 語意未確認（文件稱 flag、實為某 EMPNO）→ **不採用**；主管改由 ORG 之 `JOB_CODE` 推導。
- ⚠ ICSOP org-sync **已在讀 `VW_HPMUSER`**（ACCOUNT 同步，範圍 AS）。實作前先確認 `ACCOUNT` 是否已涵蓋「全體 AS 在職員工」：
  - 若是 → 名稱解析直接查 `ACCOUNT`（employeeNo→name），**無需另建 PERSON 表**；
  - 若否（ACCOUNT 為子集）→ 另建 PERSON directory（同引擎、同 `EMPSTS='A'`，不含帳號語意）。

## ORG — `VW_DEPT_SQL`
- 白名單欄：`COMPID, CODE, DESC_FULL, DESC_CHI, JOB_CODE, CLOSE_DATE`。
- **`CODE`＝5 碼前綴階層鍵**；**tier＝去尾 0 後長度 `plen`**：`plen≤1`＝公司/本部、`2`＝部、`3`＝處/室、更深＝課。
- **在職部門＝`CLOSE_DATE > GETDATE()`**（哨兵 `9999-12-31`）。
- **子樹＝字串前綴**：`LEFT(child.CODE, plen)=LEFT(parent.CODE, plen)`；**必須 `COMPID` 分區**（`00000`/`A0000` 跨公司同碼異名，不分區會洩漏他公司）。（另有明確父指標 `TOP_DEPTID` 但 portalapp-sp 未用/未驗。）
- **主管＝`JOB_CODE`**（部門主管 EMPNO，100% 有值）→ 再以 PERSON 解析姓名。
- 業務單位分類（若需）：`DESC_FULL LIKE`（**勿用 `DESC_CHI`**，短名漏關鍵字）；用 `'%電話行銷%'` 非 `'%電銷%'`。
- `person.DEPTID = dept.CODE` 以 **LEFT/outer join**（不掉未匹配/已關部門者）。

## ICSOP 三級化（沿用既有定案）
ICSOP 組織模型＝**公司 / 部 / 處室**（捨本部層，見 project-icsop-org-data-convergence）。將 `VW_DEPT_SQL` 5 級映射至此 3 級；注意實資料 tier 位置與命名未必一致（`AS/A0000`＝本部、`AD/A0000`＝處），以 `COMPID`＋`plen` 為準、名稱僅顯示。

## COMPFULLNM（公司全稱）— **上游無來源**
portalapp-sp 全專案無公司全稱來源；`COMPID` 僅 2 碼。**採靜態 `COMPID→全稱` 對映**（`AS＝和潤企業股份有限公司`，與 prototype 14 `COMPANY_NAME` 常數一致）。多公司時再改為設定表／上游。供 F020 浮水印公司欄。

## Session 擴充（定案）
`orgCode/name/employeeNo` **不進 signed JWT**（避免 PII 揭露、避免陳舊）；改擴 `SessionGuard` 每請求查回之 `CurrentAccount`（本就每請求查 DB），經 `/auth/me`＋request context 提供。

## 讀取端點 RBAC
新 ORG/PERSON/COMPANY 讀取端點需新增對應 F025 function key（或沿用既有唯讀權限）；預設：後台管理角色可讀組織樹/人員（供下拉/搜尋）。

_權威檔引用（`C:\Users\cacab\Claude\portalapp-sp\`）：`sql/11_source_views_prod.sql:16-33`、`sql/00_staging_ddl.sql:13-69`、`sql/20_helper_sp_resolve_org_scope.sql:59-155`、`reference/VW_HPMUSER_*.csv`、`reference/VW_DEPT_SQL_*.csv`。_
