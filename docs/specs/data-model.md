---
spec-id: data-model
title: 資料模型（概念層）
version: 1.2
date: 2026-07-17
status: Draft
---

# 資料模型（Data Model）

> 本文件為**概念層**資料模型，定義實體、屬性、擁有權與狀態轉換，供 Architect 決定實際 DB schema、TypeORM Entity 與索引。欄位型別為建議值，非最終 DDL。
> ER 圖：[er-diagram.mmd](diagrams/er-diagram.mmd)｜文件狀態機：[document-status-lifecycle.mmd](diagrams/document-status-lifecycle.mmd)
> 應用資料庫為 MSSQL，與上游組織來源（MSSQL/View）為**不同連線**。附件檔案存 Azure Blob Storage，資料庫僅存 Blob 參照。
> **上游來源之權威定義（欄位對應、階層規則、在職判定、穩定鍵、資料品質實測值）見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md)（2026-07-20 dev 環境唯讀實測定案；資料已遮罩，值層級統計待正式環境覆核）。`ORG_UNIT`／`PERSON`／`ACCOUNT` 三實體之上游對應以該契約為準。**
> **v1.1（2026-07-16）新增 E09 智慧問答（RAG）相關實體**：DOC_SOURCE_XLS、DOCUMENT_CHUNK、VECTOR_EMBEDDING、INDEX_RUN、QA_LOG；並擴充 AUDIT_LOG（`source` / `qaLogId`）以區分「經 AI 問答導引」之調閱。向量之物理儲存（pgvector / Qdrant / Milvus / MSSQL 2025 向量）由 Architect 選型（見 [open-questions.md](open-questions.md) OQ-E09-03），本文件僅定義概念層實體與其 metadata。
> **v1.2（2026-07-17）新增 E07 變更歷程（F037/F038）相關實體**：`DOCUMENT_CHANGE_LOG`（文件欄位層變更事件）、`LIFECYCLE_CHANGE_LOG`＋`LIFECYCLE_SNAPSHOT`（循環 DAG 結構變更事件＋快照）；併同定案 `AUDIT_LOG` 之 `targetType`/`actionType` 擴充（涵蓋 F036/F037/F038 調閱事件，OQ-E07-02 已定案 ✅）。完整理由見 architecture-spec.md §4.8。

## 實體總覽

| 實體 | 說明 | 資料擁有權 |
|------|------|-----------|
| ORG_UNIT | 組織單位（公司/本部/部/處室/課，共 5 層） | 上游 MSSQL View（唯讀來源），本系統僅鏡射 |
| PERSON | 人員（含員工編號、職級、在職狀態） | 上游 MSSQL View（唯讀來源），本系統僅鏡射 |
| ROLE | 5 種固定角色列舉 | 程式碼層級固定值 |
| ACCOUNT | 登入帳號（手動 / 上游兩來源） | 本系統 |
| LIFECYCLE | 循環（Life Cycle）池 | 本系統 |
| LIFECYCLE_NODE | 循環內 DAG 節點 | 本系統 |
| LIFECYCLE_EDGE | 循環內 DAG 有向邊 | 本系統 |
| ICSOP_DOCUMENT | ICSOP 文件（19 欄位主體） | 本系統 |
| DOCUMENT_LINK | 文件連結點（文件間關聯） | 本系統 |
| DOCUMENT_ATTACHMENT | 附件（ICSOP PDF / OJT / 使用表單） | 本系統（檔案於 Azure Blob） |
| SYNC_RUN | 同步執行紀錄 | 本系統 |
| ORG_CHANGE_ALERT | 組織異動待確認提示 | 本系統 |
| AUDIT_LOG | 稽核紀錄（append-only） | 本系統 |
| DOCUMENT_CHANGE_LOG | ICSOP 文件欄位層變更事件（append-only，F037） | 本系統 |
| LIFECYCLE_CHANGE_LOG | 循環 DAG 結構變更事件（append-only，F038） | 本系統 |
| LIFECYCLE_SNAPSHOT | 循環 DAG 結構變更後之完整快照（append-only，F038） | 本系統 |
| DOC_SOURCE_XLS | ICSOP 文件之 .xls 原始檔（authoring source） | 本系統（檔案於 Azure Blob） |
| DOCUMENT_CHUNK | 抽取清洗後依章/節切分之 chunk 內文＋metadata（RAG 檢索用） | 本系統（衍生資料） |
| VECTOR_EMBEDDING | chunk 之向量表示 | 本系統（物理落地由向量庫選型決定） |
| INDEX_RUN | 抽取/建索引執行紀錄 | 本系統 |
| QA_LOG | 智慧問答事件稽核（提問／回答／引用來源） | 本系統（AUDIT 延伸） |

---

## 組織單位 ORG_UNIT {#orgunit-entity}

代表「公司 >（多）本部 >（多）部 >（多）處/室 >（多）課」**5 層**階層（2026-07-20 實測定案，較原假設之 4 層多出「課」層；見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md) §3.5／§8.1）。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| tier | 層級列舉：`ROOT` / `DIVISION`(本部) / `DEPARTMENT`(部) / `SECTION`(處室) / `SUBSECTION`(課)；**由 `orgCode` 前綴推導** | 是 |
| name | 單位名稱（← `DESC_CHI` 簡稱；全名 `DESC_FULL` 另存供浮水印「部門」欄使用） | 是 |
| orgCode | 上游 5 碼部門代碼（← `DEPTID`／`CODE`），與 `companyCode` 併為複合來源鍵；**須建索引**以支援 `LIKE 'prefix%'` index-seek | 是 |
| codePrefix | 有效前綴＝**去除 `orgCode` 尾端連續 `0` 後**之字串（Root `00000` → 空字串），供子樹前綴比對 | 是 |
| companyCode | 所屬公司代碼（← `COMPID`；本輪僅同步 `AS`，欄位保留供多公司擴充） | 是 |
| managerEmpNo | 部門主管員工編號（← `VW_DEPT_SQL.JOB_CODE`，實為 `MANGER_EMPNO`；實測 100% 有值，F014 當責室長候選來源） | 否 |
| parentId | 上層單位（self-reference，Root 為 null）；**由代碼前綴推導**，非取自上游欄位 | 否 |
| externalId | 上游來源鍵，同步比對用 | 是 |
| status | `active` / `inactive`（← `CLOSE_DATE > GETDATE()`，哨兵值 `9999-12-31`） | 是 |
| syncedAt | 最後同步時間 | 是 |

### 階層來源：代碼前綴推導（權威規則）

**`tier` 與 `parentId` 一律由 5 碼部門代碼之前綴推導，每一碼代表一層。**

| 代碼樣式 | 判定式 | tier |
|---|---|---|
| `00000` | `orgCode = '00000'` | `ROOT` |
| `A0000` | `SUBSTRING(orgCode,2,4) = '0000'` | `DIVISION`（本部） |
| `AN000` | `SUBSTRING(orgCode,3,3) = '000'` | `DEPARTMENT`（部） |
| `ANA00` | `SUBSTRING(orgCode,4,2) = '00'` | `SECTION`（處/室） |
| `BJAA0` | 其餘（第 4 碼有值） | `SUBSECTION`（課） |

上層推導：部層＝`LEFT(orgCode,2)+'000'`；本部＝`LEFT(orgCode,1)+'0000'`。

- ⚠ **上游 `P_DEPTID`（`CAPITAL`）／`TOP_DEPTID`／`S_DEPTID`（`DEPARTMENT`）三欄皆不可作為階層依據**：前二者指向之部門散布於第 1/2/3 層非固定層級，`P_DEPTID` 更會**跳過「部」層**（處/室 直接指向本部），遞迴僅得 3 層而遺失真實層級。理由與實測數據見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md) §3.5。
- **子樹展開以 `codePrefix` 字串前綴比對達成**（`orgCode LIKE 'JA%'`），**不需 closure table、不需遞迴 CTE**；`orgCode` 之索引使前綴比對為 index-seek 友善。此規則同時適用於文件使用部門之任意層級指定與子樹展開（F026）、前台部門篩選（F019），以及 RAG 檢索層權限過濾（F033，可直接下推為 SQL `WHERE`）。
- 階層以 `parentId` 自參照建構；下拉選單依此層級呈現（F014）。
- 資料由 F004 同步維護，本系統不回寫上游；階層資料量小（AS 有效部門 114 筆），F004 建議每次**全量取回**而非增量。
- **相關功能**：F004、F014、F019、F020、F024、F026、F033。

## 人員 PERSON {#person-entity}

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| employeeNo | 員工編號（來源唯一鍵） | 是 |
| name | 姓名 | 是 |
| orgUnitId | 所屬處室/部門（→ ORG_UNIT） | 是 |
| jobLevel | 職級 | 是 |
| employmentStatus | `active`(在職) / `departed`(離職) | 是 |
| externalId | 上游來源鍵 | 是 |
| syncedAt | 最後同步時間 | 是 |

- `employmentStatus = departed` 觸發 F005 帳號停用。
- 僅 `active` 人員可出現在「當責室長」可選清單（F014）。
- **相關功能**：F004、F005、F006、F014。

## 角色 ROLE {#role-entity}

固定 5 種列舉值，**不可由前後台新增/刪除**（US-006 AC3）。

| code | 名稱 |
|------|------|
| `SysAdmin` | 系統管理員 |
| `ICSOPAdmin` | ICSOP 管理員 |
| `Supervisor` | 主管（當責室長/部門主管） |
| `DeptContact` | 部門窗口 |
| `User` | 一般使用者 |

- 權限依 F025（角色×功能）、F026（角色×欄位）判定。
- **相關功能**：F002、F003、F025、F026。

## 帳號 ACCOUNT {#account-entity}

**上游來源穩定鍵＝`(companyCode, loginId)`**（`loginId` ← `VW_HPMUSER.USERID`）。上游欄位對應之權威定義見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md) §5.2（**11 欄白名單**）。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID（內部代理鍵） | 是 |
| companyCode | 公司代碼（← `COMPID`）；與 `loginId` 併為**上游穩定鍵** | 是 |
| loginId | 登入帳號（← `USERID`）；**實測 100% 唯一**（各公司 `COUNT(*) = COUNT(DISTINCT USERID)`） | 是 |
| employeeNo | 員工編號（← `EMPNO`）；⚠ **非唯一，不可作為鍵** | 否 |
| name | 姓名（← `USERNM`），浮水印姓名來源 | 是 |
| orgCode | 所屬部門代碼（← `DEPTID`，對應 `ORG_UNIT.orgCode`） | 是 |
| email | 電子郵件（← `EMAILADDR`；AS 實測 76 筆空值，不得假設必有值）。**同時為 Azure AD 身分對應鍵**（見下） | 否 |
| resignDate | 離職日（← `RESIGNDT`；哨兵 `9999-12-31` ＝未離職） | 否 |
| hireDate | 到職日（← `HIREDT`） | 否 |
| managerEmpNo | 直屬主管員工編號（← `DIRECTOR`） | 否 |
| upstreamModifiedAt | 上游最後異動時間（← `MTDT`），**增量同步依據** | 否 |
| passwordHash | bcrypt/argon2 加鹽雜湊（**僅手動帳號有值**；上游密碼欄嚴禁落地，見下） | 否 |
| source | `manual`(手動建立) / `upstream`(上游同步) | 是 |
| roleCode | 指派角色（→ ROLE） | 是 |
| status | `active` / `disabled`（上游同步時 ← `EMPSTS = 'A'`） | 是 |
| disableReason | `manual` / `departed`（nullable） | 否 |
| disabledAt | 停用時間（nullable） | 否 |
| lastActivityAt | 最後有效操作時間（供 Session 逾時判定，實作方式由 Architect 決定） | 否 |

### 鍵設計（定案，實測依據）

- **主鍵/唯一鍵採 `(companyCode, loginId)`** —— `USERID` 為真正的入口網站登入帳號，實測各公司 100% 唯一。
- 🔴 **不得以 `(companyCode, employeeNo)` 為主鍵或唯一鍵** —— 實測全體有 **18 組重複／133 筆**；AS 在職者 **1,114 人僅對應 1,108 個相異員編**（6 筆一人多帳號），AE 尤為極端（166 帳號僅 60 個員編）。以員編為鍵將導致同步時筆數塌陷或衝突。
- 浮水印需顯示員工編號時，以該 `loginId` 對應之 `employeeNo` 呈現；一人多帳號時各帳號各自呈現，屬預期行為。

### `email` 為 Azure AD 身分對應鍵（定案 2026-07-20） {#account-email-ad-key}

- **來源**：`VW_HPMUSER.EMAILADDR`（**非** `HREMAILADDR`——該欄非 AD 信箱，會對應到錯誤身分，**嚴禁作為 fallback**）。
- **用途**：[F001](features/F001-auth-login-session.md) 途徑 A 以 Azure AD id_token 之 `email` claim 比對本欄，定位登入者身分。權威規則見 [upstream-hr-source-contract.md §12.2](upstream-hr-source-contract.md)。
- **比對規則**：**完整 email（含網域）逐字比對、不分大小寫**；不拆 local-part、不做網域正規化。跨公司兼職者由網域天然區分，**不需**併入 `companyCode`。比對時強制 `status=active`（← `EMPSTS='A'`）。
- **實作建議**：因每次登入皆需以 email 查詢，應於 `email` 建立**不分大小寫之索引**（如正規化小寫之持久化計算欄位＋索引，或不分大小寫 collation 之索引），避免全表掃描；具體機制由 system-architect 決定。
- ⚠ **本欄非必填且實測有空值**（AS 76 筆）：`EMAILADDR` 從缺之在職者**將無法經 AD 登入**，屬 HR 資料面問題，應由 HR 補齊，系統不得以其他欄位補位。
- ⚠ **唯一性未保證**：本欄未設唯一鍵（主鍵仍為 `(companyCode, loginId)`）。若同一 email 命中多筆在職帳號，視為上游資料異常，登入拒絕並告警（見 [error-handling.md#auth](error-handling.md#auth)）。email 唯一性須於正式環境覆核（契約 §11 #8）。

### 上游欄位白名單與密碼欄禁令

- 🔴 上游 `VW_HPMUSER` 定義為 `SELECT *`（57 欄），內含 **`USERPW`／`DEFAULTPW`／`PWCHANGEDT`／`PWERRCNT`** 及 `BIRTHDAY`／`ADDR`／`TELNO`／`MOBILNO`／`EDUCATIONLVL` 等非必要個資。
- **同步作業絕對不得 `SELECT *`，必須逐欄白名單**（上表標註 ← 之 11 欄）。**`USERPW`／`DEFAULTPW` 永不讀取、永不落地、永不記錄於任何日誌**（見 [nfr.md#security](nfr.md#security)）。
- 本表 `passwordHash` **僅供手動建立之管理員帳號使用**，與上游密碼欄無任何關聯，不得由上游寫入。

- 手動帳號與上游帳號**共用同一資料表**，以 `source` 區分（US-005）；手動帳號之 `companyCode`／`loginId` 由本系統自行指派，不與上游衝突。
- 上游帳號的姓名/部門等以同步結果為準（見 [open-questions](open-questions.md)）。
- 帳號停用為**軟刪除**，不可實體刪除（維持稽核外鍵完整性）。
- 帳號狀態：`active → disabled`（手動或離職）；`disabled → active`（誤判恢復，處理方式見 open-questions）。
- **相關功能**：F001、F002、F003、F005、F023。

## 循環 LIFECYCLE {#lifecycle-entity}

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| name | 循環名稱 | 是 |
| description | 說明 | 否 |
| status | `active`(啟用) / `inactive`(停用) | 是 |
| createdAt / updatedAt | 建立/更新時間 | 是 |

- **[OQ-E03-03 已定案 ✅，2026-07-17]** **允許刪除循環，但需先清空所有文件掛載**；仍有掛載時回 `LIFECYCLE_HAS_DOCUMENTS`（語意＝需先解除全部掛載才能刪除，非「永不可刪」）。清空後刪除將一併移除其節點/連線。**停用（`inactive`）不受此限制**，可隨時執行（F007）。
- **[OQ-E03-01／OQ-E03-02 已定案 ✅]** 循環**不需**「擁有部門」等欄位；循環狀態（啟用/停用）與文件狀態**不聯動**。
- **[OQ-E03-05 已定案 ✅]** 循環/節點之結構變更歷程**予以保留**，採 [F038](features/F038-lifecycle-tree-change-history.md)（append-only 事件＋快照，見 [LIFECYCLE_CHANGE_LOG](#lifecyclechangelog-entity)／[LIFECYCLE_SNAPSHOT](#lifecyclesnapshot-entity)）；循環本體仍僅保存當前狀態。
- **相關功能**：F007、F008、F009、F010。

## 循環節點 LIFECYCLE_NODE {#node-entity}

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| lifecycleId | 所屬循環（→ LIFECYCLE） | 是 |
| name | 節點名稱（可先建立未命名） | 否 |
| positionX / positionY | 畫布座標（top-down 佈局） | 是 |

- 節點與文件為 1..*（一節點可掛多份文件，草案假設，見 open-questions）；反向「一份文件僅屬一個節點」為定案。
- **相關功能**：F008、F009、F010。

## 循環有向邊 LIFECYCLE_EDGE {#edge-entity}

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| lifecycleId | 所屬循環 | 是 |
| sourceNodeId | 起點節點（parent） | 是 |
| targetNodeId | 終點節點（child） | 是 |

- **不變式（invariant）**：同一循環內所有邊構成有向無環圖（DAG）；禁止 self-loop 與任何成環。由 F008 於後端交易內權威驗證。
- 支援節點多 parent / 多 child。
- **相關功能**：F008。

## ICSOP 文件 ICSOP_DOCUMENT {#document-entity}

19 欄位權威定義（來源：E04 epic-brief）。**唯一權威欄位清單**，其他文件皆引用此表。UI 顯示標籤（實體名維持「ICSOP 文件」）：文件編號＝「程序書編號」、文件名稱＝「程序書書名」、文件連結點＝「連結點程序書」、所屬循環＝「循環別」、ICSOP PDF＝「檔案」。

| # | 欄位 | 屬性名 | 基數 | 說明 | 可寫角色 |
|---|------|--------|------|------|----------|
| 1 | 系統 UUID | id | 1 | 系統產生，唯讀 | 無（系統） |
| 2 | 文件狀態 | status | 1 | `有效`/`失效`/`作廢`，預設有效；**清單顯示衍生**：有效＋公告日期已過→`已公告`、有效＋公告日期未到→`進度中`（不另存值） | ICSOPAdmin |
| 3 | 制定公司 | draftingCompanyId | 1 | → ORG_UNIT（公司層級）**新增** | ICSOPAdmin |
| 4 | 制定部門 | draftingDeptId | 1 | → ORG_UNIT（部層級）**新增** | ICSOPAdmin |
| 5 | 制定室別 | draftingSectionId | 1 | → ORG_UNIT（處/室層級）**新增**；三級可依組織階層由室別回溯部門/公司 | ICSOPAdmin |
| 6 | ICSOP 文件編號（程序書編號） | documentNumber | 1 | 人為定義，唯一（F013） | ICSOPAdmin |
| 7 | 當責室長-主要 | primaryChiefId | 1 | → PERSON | ICSOPAdmin |
| 8 | 當責室長-次要 | secondaryChiefIds | 0..* | → PERSON（DOC_SECONDARY_CHIEF） | ICSOPAdmin |
| 9 | 文件使用部門 | usingDeptIds | 1..* | → ORG_UNIT（DOC_USING_DEPT）；前台排序/權限檢索用 | ICSOPAdmin |
| 10 | 版次 | edition | 1 | 兩段式字串 `{YY}'{NN}`（年度＇序號，如 `26'01`）**（原「人為版本號 manualVersion」改）** | ICSOPAdmin |
| 11 | 所屬循環（循環別） | lifecycleId | 1 | → LIFECYCLE，建立時必填 | ICSOPAdmin |
| 12 | 所屬節點 | nodeId | 0..1 | → LIFECYCLE_NODE，**唯一權威寫入路徑＝節點抽屜 F009**，可為未指派 | ICSOPAdmin（僅經節點抽屜） |
| 13 | ICSOP 文件連結點（連結點程序書） | links | 0..* | → DOCUMENT_LINK，提供下載 | ICSOPAdmin |
| 14 | ICSOP PDF（檔案） | attachment(ICSOP_PDF) | 1 | Azure Blob，覆蓋式，提供下載 | ICSOPAdmin |
| 15 | 使用表單 | attachment(USAGE_FORM) | 0..* | excel/pdf，Azure Blob | ICSOPAdmin |
| 16 | 公告日期 | announcedDate | 1 | 日期**（原「發布日期 publishedDate」改名）**；決定有效文件顯示為已公告/進度中 | ICSOPAdmin |
| 17 | OJT 實體簽到表 | attachment(OJT_SIGNIN) | 1 | pdf 或圖片，覆蓋式 | ICSOPAdmin |
| 18 | 文件名稱（程序書書名） | documentName | 1 | 人為定義之可讀標題，與編號分離；前台清單顯示、關鍵字搜尋涵蓋（OQ-DATA-01） | ICSOPAdmin |
| 19 | 內容摘要 | contentSummary | 1 | 程序書內容摘要（可讀文字）**新增** | ICSOPAdmin |

- **欄位調整（2026-07-17 定案）**：移除「當責部門 accountableDeptId」（由制定公司/部門/室別承接組織歸屬；**當責室長保留**）；新增 制定公司/制定部門/制定室別/內容摘要；「發布日期」改名「公告日期 announcedDate」；「人為版本號」改名「版次 edition」（格式 `{YY}'{NN}`）。
- **狀態顯示**：儲存維持 有效/失效/作廢（F012 手動切換）；清單/統計卡以公告日期把「有效」衍生顯示為 已公告（已過）/進度中（未到）。
- **建立時必填（F010，2026-07-17 定案）**：新增文件僅強制 4 項核心必填——所屬循環（循環別）、文件狀態、文件編號、文件名稱；表中其餘欄位之基數代表「完整/目標狀態」，建立時可留白、日後經編輯（F011/F014）補齊（未填公告日期者狀態顯示為進度中）。制定三級於表單以**由上而下**（公司→部門→室別）相依選取。
- 版本策略：僅保存當前版本，覆蓋儲存，UUID 不變，不留歷史版本檔（F011）。
- 「所屬節點」不在文件表單設定，一律經節點抽屜（F009）掛載/改派。
- 欄位層級可寫/唯讀依 F026 矩陣；主管、部門窗口、**系統管理員**對所有欄位**皆唯讀**（定案），僅 ICSOPAdmin 可寫。
- **相關功能**：F010、F011、F012、F013、F014、F015、F016、F017、F019、F020、F026。

### 附屬關聯表

- **DOC_SECONDARY_CHIEF** {#doc-secondary-chief}：(id, documentId, **employeeNo**)，多對多，當責室長-次要。以員工編號（`VW_HPMUSER.EMPNO`）為人員參照，非代理鍵。
- **DOC_USING_DEPT** {#doc-using-dept}：(id, documentId, **orgCode**)，多對多，文件使用部門。以組織代碼（`VW_DEPT_SQL.CODE`，5 碼前綴階層）為單位參照，非代理鍵；可指定任意層級，權限/置頂判定時以前綴展開子樹（契約 §9.1/§9.2）。

## 文件連結點 DOCUMENT_LINK {#documentlink-entity}

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| sourceDocumentId | 來源文件（→ ICSOP_DOCUMENT） | 是 |
| targetDocumentId | 目標文件（→ ICSOP_DOCUMENT，須存在） | 是 |

- 草案假設**單向**（A→B 不代表 B→A），是否雙向見 open-questions。
- 是否允許連結至「失效/作廢」文件見 open-questions；草案允許但前台標示目標狀態。
- **相關功能**：F015、F019。

## 附件 DOCUMENT_ATTACHMENT {#attachment-entity}

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| documentId | 所屬文件 | 是 |
| type | `ICSOP_PDF` / `OJT_SIGNIN` / `USAGE_FORM` | 是 |
| fileName | 原始檔名 | 是 |
| blobPath | Azure Blob 參照路徑（可追溯所屬文件） | 是 |
| contentType | MIME 類型 | 是 |
| size | 檔案大小（bytes） | 是 |
| uploadedBy / uploadedAt | 上傳者/時間（管理端操作記錄，非調閱稽核） | 是 |

- `ICSOP_PDF`、`OJT_SIGNIN` 各 1 份，重新上傳即覆蓋舊檔。
- `USAGE_FORM` 多份（excel/pdf），個別新增/移除。
- 存取須經權限驗證＋短效期憑證（SAS Token），禁止直接猜測網址存取（[NFR-002](nfr.md#security)）。
- 檔案大小上限與允許格式清單為 open-questions。
- **相關功能**：F016、F018、F020。

## 同步執行紀錄 SYNC_RUN {#syncrun-entity}

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| triggerType | `scheduled` / `manual` | 是 |
| startedAt / endedAt | 開始/結束時間 | startedAt 是 |
| status | `running` / `success` / `failed` | 是 |
| changeCount | 異動筆數（綜合） | 是 |
| createdCount / updatedCount / disabledCount | 新增/更新（部門·職級）/離職停用 三分類統計（F006 KPI；nullable，遷移前歷史以 0 計） | 否 |
| errorMessage | 失敗訊息（nullable） | 否 |
| triggeredBy | 觸發者帳號（手動時） | 否 |

- 同一時間至多一筆 `running`（互斥鎖，F004）。
- 三分類統計欄由 migration `1722902400000-sync-run-account-stats` 追加（皆 nullable int）；`GET /admin/org-sync/monthly-summary` 以 `COALESCE(SUM(COALESCE(col,0)),0)` 聚合，全 NULL 歷史回 0。
- **相關功能**：F004、F006。

## 組織異動待確認提示 ORG_CHANGE_ALERT {#orgchangealert-entity}

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| alertKind | 判別：`DOCUMENT_FIELD`（文件欄位受影響）/ `CLOSED_DEPT_PERSON`（在職者掛已關閉部門，契約 §7.3） | 是 |
| documentId | 受影響文件 | **條件必填**（`DOCUMENT_FIELD` 必填；`CLOSED_DEPT_PERSON` 為 null，該類無對應文件） |
| documentName | 文件名稱快照（供卡片顯示，免二次 join） | 否 |
| changeType | 異動類型（部門異動/轉調/不再任該單位室長…） | 否 |
| affectedField | 受影響欄位（制定公司/制定部門/制定室別/當責室長-主要/次要/使用部門） | 條件必填（同 documentId） |
| beforeValue / afterValue | 異動前後差異 | 否 |
| personEmployeeNo / personName | 人員（`CLOSED_DEPT_PERSON` 類） | 條件必填 |
| deptOrgCode / deptName / deptCloseDate | 所掛已關閉部門代碼/名稱/關閉日（`CLOSED_DEPT_PERSON` 類） | 條件必填 |
| status | `pending` / `resolved` | 是 |
| createdAt | 產生時間 | 是 |
| sourceSyncRunId | 產生此提示之同步執行 | 否 |
| resolvedBy / resolvedAt | 處理者/時間 | 否 |

- 單表＋`alertKind` 判別，兩類共用同一生命週期（status/resolvedBy/resolvedAt）並於待確認清單交錯呈現。
- **dedup**：未處理之 `pending` 不因後續同步重複產生。dedup key＝`DOCUMENT_FIELD` 為 `(documentId, affectedField)`、`CLOSED_DEPT_PERSON` 為 `personEmployeeNo`；服務層查詢先擋＋DB filtered unique index 二線（比照 F013，int-verified）。
- 提示為**非強制**，不自動覆寫文件當責設定、不停用帳號（F006 AC2/AC9）。
- **相關功能**：F006、F014。

## 稽核紀錄 AUDIT_LOG {#auditlog-entity}

**Append-only**：一經寫入不可修改/刪除（含 SysAdmin/ICSOPAdmin）。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| accountId | 操作者帳號 | 是 |
| employeeNo / name / department / section | 操作者身分快照（與浮水印同一來源） | 是 |
| documentId / documentNumber | 被調閱文件（**條件必填**：`targetType∈{DOCUMENT, USAGE_FORM, DOCUMENT_CHANGE_LOG}` 時必填，其餘為 null） | 否 |
| lifecycleId / lifecycleName | 被調閱循環（**新增**；**條件必填**：`targetType∈{LIFECYCLE, LIFECYCLE_CHANGE_LOG}` 時必填，其餘為 null） | 否 |
| targetType | `DOCUMENT` / `USAGE_FORM` / `LIFECYCLE`（F036 循環樹狀圖）/ `DOCUMENT_CHANGE_LOG`（F037 變更歷程）/ `LIFECYCLE_CHANGE_LOG`（F038 循環變更歷程）/ `ORG_CHANGE_ALERT`（**新增**，F006 組織異動提示處理） | 是 |
| formId | 使用表單附件（targetType=USAGE_FORM 時） | 否 |
| actionType | `VIEW` / `DOWNLOAD` / `PRINT`（既有，`targetType=DOCUMENT/USAGE_FORM` 適用）／`LIFECYCLE_VIEW` / `LIFECYCLE_DOWNLOAD` / `LIFECYCLE_PRINT`（`targetType=LIFECYCLE`，F036）／`CHANGE_LOG_VIEW`（`targetType=DOCUMENT_CHANGE_LOG`，F037）／`LIFECYCLE_CHANGELOG_VIEW` / `LIFECYCLE_CHANGELOG_DOWNLOAD`（`targetType=LIFECYCLE_CHANGE_LOG`，F038）／`ALERT_RESOLVED`（**新增**，`targetType=ORG_CHANGE_ALERT`，F006 提示解除） | 是 |
| watermarkSnapshot | 當次浮水印完整字串快照（`DOWNLOAD`/`PRINT` 系列動作皆須填；純 `VIEW` 系列亦填，與檢視器疊加一致） | 是 |
| occurredAt | 伺服器時間戳記 | 是 |
| source | `DIRECT`(一般前台路徑) / `AI_QA`(經 AI 智慧問答導引)，預設 `DIRECT`（E09 US-097） | 是 |
| qaLogId | 觸發此次調閱之問答事件（→ QA_LOG，`source=AI_QA` 時有值） | 否 |

- 身分/時間快照須與該次浮水印內容**完全一致**（F020、F023）。
- **`ORG_CHANGE_ALERT` 之限制（F006）**：本表無 `alertId` 外鍵欄，`targetType=ORG_CHANGE_ALERT` 之解除稽核僅落 `targetNumber`/`targetName`（文件編號/名稱或人員資訊），未落 alert 主鍵。刻意不 ALTER 共用 AUDIT_LOG schema；如需以 alertId 反查稽核，屬後續 schema 決策。
- **問答事件本身**（提問→回答）記於 [QA_LOG](#qalog-entity)，非以 `actionType` 表示；經 AI 問答導引之檢視/下載仍寫本表，並以 `source=AI_QA`＋`qaLogId` 標示來源（F034）。
- **[OQ-E07-02 已定案 ✅，system-architect 2026-07-17]** 循環樹狀圖預覽（[F036](features/F036-lifecycle-tree-preview.md)）之檢視/下載/列印、變更歷程（[F037](features/F037-document-change-history.md)／[F038](features/F038-lifecycle-tree-change-history.md)）之查詢檢視/下載，皆屬「**調閱/存取事件**」（誰在何時存取了什麼），與既有 VIEW/DOWNLOAD/PRINT 語意一致，**擴充本表**（`targetType`＋`actionType` 各新增列舉值，見上）而非另建稽核表；三個 feature（F036/F037/F038）共用同一組決策，家族一致。決策理由：(1) 這些動作的資料形狀（操作者/時間/被存取對象/浮水印快照）與既有 VIEW/DOWNLOAD/PRINT 完全同構，另建表僅為重複 schema；(2) `documentId`/`lifecycleId` 皆改為條件必填（依 `targetType` 二擇一），不強迫每列填滿兩組外鍵；(3) `actionType` 沿用 feature spec 既有文字定義之草案動作名（`CHANGE_LOG_VIEW` 等）逐字落地，不重新發明命名以維持與已核准 spec 文件（F036/F037/F038 AC、US-062/US-063 AC）之字面一致性，降低下游 test-designer/tdd-developer 之轉譯落差風險。
- **[OQ-E07-02 已定案 ✅]** 變更歷程記錄的是「**資料異動事件**」本體（欄位/結構層 old→new diff），與上述「調閱事件」性質不同（前者是「什麼被改了」，後者是「誰看了什麼」），**不併入本表**，另建獨立實體 [DOCUMENT_CHANGE_LOG](#documentchangelog-entity)、[LIFECYCLE_CHANGE_LOG](#lifecyclechangelog-entity)、[LIFECYCLE_SNAPSHOT](#lifecyclesnapshot-entity)（詳見下方「變更歷程相關實體」）。不併表理由：(1) 欄位形狀截然不同（`fieldName`/`oldValue`/`newValue` 或 `changeType`/`entityType`/`beforeValue`/`afterValue` vs 本表之 `actionType`/`watermarkSnapshot`），併表將產生大量依 `targetType` 才有意義的稀疏可空欄位（polymorphic 反樣式），複雜化本表既有查詢；(2) 一致性模型不同——本表為 Outbox 非阻斷寫入（§5.5），變更歷程須與來源交易強一致（見 architecture-spec.md §5.9，遺失即等同稽核造假，不可退化為 best-effort）；(3) 獨立表使 [OQ-NFR003](open-questions.md) 之「變更歷程是否需獨立保留政策」在不修改本表結構前提下即可彈性套用不同歸檔策略。
- 保留年限草案 ≥ 3 年（[NFR-003](nfr.md#audit-retention)，待確認）。
- **相關功能**：F020、F023、F024、F034、F036、F037、F038。

---

## 變更歷程相關實體（E07 擴充，system-architect 2026-07-17 定案） {#change-history-entities}

> 對應 [F037](features/F037-document-change-history.md)（ICSOP 程序書變更歷程）／[F038](features/F038-lifecycle-tree-change-history.md)（循環樹狀圖變更歷程）。三個實體皆為 **append-only**（DB 層撤銷應用帳號 UPDATE/DELETE 權限，比照 AUDIT_LOG），記錄「資料異動事件」本體；「誰查詢/檢視/下載了變更歷程」之調閱事件另記於 [AUDIT_LOG](#auditlog-entity)（見上方已定案說明）。與 AUDIT_LOG 之關係、DAG 儲存粒度決策（OQ-E07-05）之完整理由見 architecture-spec.md §4.8。

### 文件變更日誌 DOCUMENT_CHANGE_LOG {#documentchangelog-entity}

ICSOP 文件欄位層變更事件，一次儲存中每個實際變更之欄位各一筆（同一次儲存共用同一 `batchId` 供查詢層分組還原）。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| documentId | 所屬文件（→ ICSOP_DOCUMENT） | 是 |
| documentNumber | 文件編號快照（供查詢/顯示，不需 JOIN 回文件表） | 是 |
| batchId | 同一次儲存交易之群組鍵（UUID，同次儲存之多筆欄位變更共用） | 是 |
| fieldName | 變更欄位屬性名（19 欄權威定義之屬性名，如 `documentName`/`edition`/`announcedDate`/`status`/`primaryChiefId`/`draftingCompanyId`…；附件替換事件填 `ICSOP_PDF`/`OJT_SIGNIN`/`USAGE_FORM`） | 是 |
| oldValue / newValue | 舊值／新值（人員/組織欄位存**當下顯示名稱快照字串**，非 ID；附件替換事件二者為 null，僅示意「已替換」） | 否 |
| changedByAccountId | 操作者帳號（→ ACCOUNT） | 是 |
| employeeNo / name / department / section | 操作者身分快照（與 AUDIT_LOG／浮水印同一來源） | 是 |
| changedAt | 伺服器時間戳記 | 是 |
| sourceFeature | 來源功能：`F011`（一般編輯）／`F012`（狀態切換）／`F014`（制定組織/當責室長/使用部門）／`F016`（附件替換） | 是 |

- **未變更欄位不記錄**：僅實際發生變化之欄位各寫一筆（F037 AC-2/AC-5）。
- **人員/組織欄位快照時機**：於來源功能（F014）計算 diff 當下（同一交易內）解析 `PERSON.name`／`ORG_UNIT` 顯示名稱並存入 `oldValue`/`newValue`，非儲存 ID 後延遲解析（避免日後組織異動使歷史顯示跑掉，F037 AC-4）。
- **附件替換事件**：`sourceFeature=F016`、`fieldName=`附件類型，`oldValue`/`newValue` 皆為 null（僅記事件發生，不留舊檔內容，F037 AC-6）。
- **「所屬節點」欄位**：不落於本表（掛載/改派事件記於 [LIFECYCLE_CHANGE_LOG](#lifecyclechangelog-entity)，`entityType=MOUNT`），是否亦於本 tab 交叉呈現為產品決策，見 [open-questions.md OQ-E07-08](open-questions.md)。
- **相關功能**：F011、F012、F014、F016、F037。

### 循環結構變更日誌 LIFECYCLE_CHANGE_LOG {#lifecyclechangelog-entity}

循環 DAG 結構變更事件，**逐原子操作各一筆**（與 F008/F009 現行「逐動作持久化」模式一致；短時間內連續操作之「編輯階段」聚合為**查詢/呈現層**分組，非儲存層聚合，理由見 architecture-spec.md §4.8）。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| lifecycleId | 所屬循環（→ LIFECYCLE） | 是 |
| lifecycleName | 循環名稱快照 | 是 |
| changeType | `NODE_ADDED` / `NODE_REMOVED` / `EDGE_ADDED` / `EDGE_REMOVED` / `NODE_RENAMED` / `DOCUMENT_MOUNTED` / `DOCUMENT_REASSIGNED` / `DOCUMENT_UNMOUNTED` | 是 |
| entityType | `NODE` / `EDGE` / `MOUNT` | 是 |
| entityId | 受影響節點/邊 ID，或掛載關係之文件 ID（`entityType=MOUNT`） | 是 |
| beforeValue / afterValue | 結構化差異（JSON 或文字，如節點名稱新舊字串、改派來源/目標節點 ID＋名稱快照） | 否 |
| changedByAccountId | 操作者帳號（→ ACCOUNT） | 是 |
| employeeNo / name / department / section | 操作者身分快照 | 是 |
| changedAt | 伺服器時間戳記 | 是 |
| snapshotId | → [LIFECYCLE_SNAPSHOT](#lifecyclesnapshot-entity)，本次動作完成後之完整結構快照（1:1，同一交易內產生） | 是 |

- **唯一寫入路徑**：`LifecycleModule`（F008 新增/刪除節點/邊、F009 節點改名/掛載改派），於自身既有交易內同步寫入本表＋對應快照，不經 Outbox（見 architecture-spec.md §5.9 交易一致性）。
- **重建「變更前」狀態**：取同 `lifecycleId`、`changedAt` 早於本筆之最近一筆本表紀錄之 `snapshotId`；若無更早紀錄（該循環第一筆事件），視為空 DAG。
- **相關功能**：F008、F009、F038。

### 循環結構快照 LIFECYCLE_SNAPSHOT {#lifecyclesnapshot-entity}

每筆 `LIFECYCLE_CHANGE_LOG` 事件完成後之完整循環結構快照（節點＋邊，結構化資料非檔案），供 F038 新舊樹狀圖渲染直接讀取，不需重放（replay）運算。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| lifecycleId | 所屬循環 | 是 |
| changeLogId | 回指產生此快照之事件（→ LIFECYCLE_CHANGE_LOG，1:1） | 是 |
| nodesJson | 當下節點集合快照（`id`/`name`/`positionX`/`positionY`/掛載文件 `id`+`documentNumber` 清單） | 是 |
| edgesJson | 當下邊集合快照（`id`/`sourceNodeId`/`targetNodeId`） | 是 |
| capturedAt | 快照時間（＝對應事件之 `changedAt`） | 是 |

- 為自我完備（self-contained）之結構化 JSON，F038 預覽/下載渲染時不需回查 `LIFECYCLE_NODE`/`LIFECYCLE_EDGE` 即時表，避免「歷史快照」與「當前結構」因後續異動而混淆。
- 儲存量評估：單一循環節點 < 200（[NFR-001](nfr.md#performance)），DAG 編輯屬低頻管理操作（architecture-spec.md §5.4 既有判斷），逐動作快照之增量儲存成本可忽略（結構化 JSON，非二進位檔案）。
- **相關功能**：F038。

---

# RAG 智慧問答相關實體（E09）

> 雙軌 ingestion（定案）：**軌道 A 權威原件**＝ DOC_SOURCE_XLS（.xls 原始檔，RAG 內容來源）＋ ICSOP PDF（呈現用，沿用 [DOCUMENT_ATTACHMENT](#attachment-entity) `type=ICSOP_PDF`）；**軌道 B 檢索內文**＝ DOCUMENT_CHUNK（衍生、僅供 RAG 檢索、不對使用者顯示）＋ VECTOR_EMBEDDING。軌道 B 為衍生資料，改版時可整批重建，不影響軌道 A 之權威性。
> **[OQ-E09-10 已定案 ✅，2026-07-17]** **取消 .xls→PDF 自動轉檔**：ICSOP PDF **不再由 .xls 衍生**，改為與 .xls **分開手動上傳、各自獨立**（PDF 循 F016 既有手動上傳路徑）；兩者無系統層產出關係、**內容一致性由 ICSOPAdmin 人工負責**（系統不產出、不驗證、不告警）。

## .xls 原始檔 DOC_SOURCE_XLS {#docsourcexls-entity}

ICSOP 文件之可再編輯權威原始檔（authoring source），**僅作 RAG 內容來源**：抽取管線（F028）直接讀此檔，不讀 PDF。**不產出 PDF**（OQ-E09-10 定案）。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| documentId | 所屬文件（→ ICSOP_DOCUMENT，1:1，覆蓋式，不留歷史檔） | 是 |
| blobPath | Azure Blob 參照路徑 | 是 |
| fileName | 原始檔名 | 是 |
| contentType | MIME 類型（`application/vnd.ms-excel` 等） | 是 |
| size | 檔案大小（bytes） | 是 |
| edition | 上傳當下文件版次快照（供改版判斷，F030） | 是 |
| ~~derivedPdfAttachmentId~~ | **已移除**（OQ-E09-10 定案：取消自動轉檔，PDF 非由 .xls 衍生、無產出關聯） | — |
| ~~conversionStatus~~ | **已移除**（無轉檔行為；.xls 僅做模板格式驗證，失敗即 `XLS_TEMPLATE_INVALID` 阻擋該次上傳） | — |
| uploadedBy / uploadedAt | 上傳者/時間 | 是 |

- 覆蓋式保存（呼應 E04「不留歷史版本檔」精神）；重新上傳覆蓋舊 .xls 並觸發重抽（F030）。
- **[OQ-E09-10 已定案 ✅]** 本實體與 `DOCUMENT_ATTACHMENT (type=ICSOP_PDF)` **無產出/衍生關聯**：.xls 與呈現用 PDF 分開手動上傳、各自獨立、互不觸發（重新上傳 .xls 不替換 PDF，反之亦然）。**內容一致性由 ICSOPAdmin 人工負責**，系統不驗證、不告警。
- 僅有 PDF 而無 .xls 之文件：允許存在，但無 RAG 內容來源 → 不進索引（F031 呈現「尚未建立索引」）。
- **相關功能**：F027、F028、F030、F016（呈現用 PDF 之獨立上傳路徑）。

## 文件 Chunk DOCUMENT_CHUNK {#documentchunk-entity}

抽取清洗後依「節」切分之最小檢索單位（每 chunk＝一個完整作業步驟）。`status`、`announcedDate`、`usingDeptIds` 為**權限感知檢索（F033）之過濾依據**（前台/檢索可見基底＝已公告＝`status=有效 且 announcedDate≤今日`），必須於索引時即正確寫入，不可於檢索後才過濾（[NFR-009](nfr.md#rag-security)）。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| documentId | 來源文件（→ ICSOP_DOCUMENT） | 是 |
| indexRunId | 產生自哪次索引執行（→ INDEX_RUN） | 是 |
| content | 清洗接合後之 chunk 內文（純文字） | 是 |
| chunkSeq | chunk 序（文件內／節內順序） | 是 |
| documentNumber | ICSOP 文件編號（metadata，反正規化快照，供檢索過濾與引用） | 是 |
| lifecycleId | 所屬循環（metadata，→ LIFECYCLE） | 是 |
| chapterSection | 章/節（節次）識別（抽取過程產生之結構性 metadata） | 是 |
| pageNumber | 原始頁次（引用回原文件定位用） | 是 |
| usingDeptIds | 使用部門集合（metadata，多值；**權限過濾用**，反正規化自 [DOC_USING_DEPT](#doc-using-dept)） | 是 |
| status | 文件狀態快照 `有效`/`失效`/`作廢`（metadata，**權限過濾用**，隨 F030 同步） | 是 |
| announcedDate | 公告日期快照（metadata，**權限過濾用**；檢索層以 `announcedDate≤今日` 判定已公告，隨 F030 同步） | 是 |
| edition | 版次快照（metadata） | 是 |
| createdAt | 建立時間 | 是 |

- metadata 8 項（ICSOP 編號、循環、章節、使用部門、狀態、公告日期、版次、頁次）對應 US-092 AC-2。
- **狀態切換（F030 AC-3）僅更新本表 `status` metadata，不需重抽內文**；內容改版才重跑 F028/F029 產生新一批 chunk。
- `usingDeptIds`／`status`／`announcedDate` 之物理實作可為 join 表或向量庫 payload 欄位，由 Architect 決定，但語意上必為「可於向量檢索查詢條件直接篩選」。
- **相關功能**：F028、F029、F030、F031、F033。

## 向量嵌入 VECTOR_EMBEDDING {#vectorembedding-entity}

chunk 之向量表示，與 chunk 分離以支援「重新 embedding（換模型版本）不重寫 chunk 內文」。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| chunkId | 對應 chunk（→ DOCUMENT_CHUNK，1:1） | 是 |
| embeddingModel | embedding 模型識別＋版本（如 `bge-m3@vX`，選型見 OQ-E09-02） | 是 |
| vector | 向量值（維度依模型） | 是 |
| dimension | 向量維度 | 是 |
| createdAt | 建立時間 | 是 |

- 物理儲存位置（pgvector / Qdrant / Milvus / MSSQL 2025 向量）為 Architect 選型（OQ-E09-03）；概念層僅要求「可依 chunk metadata 過濾後做相似度檢索」。
- 檢索之權限過濾**發生在此層的查詢條件**（結合 DOCUMENT_CHUNK 之 `status`/`usingDeptIds`），非生成後丟棄（[NFR-009](nfr.md#rag-security)）。
- **相關功能**：F029、F033。

## 索引執行紀錄 INDEX_RUN {#indexrun-entity}

單一文件之抽取／切 chunk／向量化執行紀錄，供 F031 管理端可視性與失敗排查。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| documentId | 對象文件（→ ICSOP_DOCUMENT） | 是 |
| triggerType | `manual`(手動重新索引) / `document_edit`(內容改版) / `xls_update`(換 .xls) / `status_change`(僅狀態切換) / `batch`(全量批建) | 是 |
| status | `running`(進行中) / `success`(成功) / `failed`(失敗) | 是 |
| stage | 最後到達/失敗階段：`extract` / `chunk` / `embed`（F031 失敗詳情用） | 是 |
| chunkCount | 本次產生之 chunk 數（成功時） | 否 |
| errorStage | 失敗階段（`extract`/`chunk`/`embed`，nullable） | 否 |
| errorMessage | 失敗原因摘要（nullable） | 否 |
| startedAt / endedAt | 開始/結束時間（endedAt 於結束時） | startedAt 是 |
| triggeredBy | 觸發者帳號（手動時） | 否 |

- 文件**尚未上傳 .xls／從無索引**時，無任何 INDEX_RUN → F031 呈現「尚未建立」而非「失敗」（F031 AC / TC-094-05）。
- `status_change` 觸發為輕量：僅更新 DOCUMENT_CHUNK.status metadata，`stage` 記為 `chunk`（不重跑 extract/embed，F030）。
- 重抽失敗（`failed`）時**保留舊索引繼續可用**，不使文件落入「完全無索引」（F030 AC-4）。
- **相關功能**：F029、F030、F031。

## 問答稽核 QA_LOG {#qalog-entity}

智慧問答事件之稽核紀錄（每次提問一筆），為 [AUDIT_LOG](#auditlog-entity) 之延伸類型。經此問答導引之檢視/下載另記於 AUDIT_LOG（`source=AI_QA`＋`qaLogId` 回指本表）。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| accountId | 提問者帳號（→ ACCOUNT） | 是 |
| employeeNo / name / department / section | 提問者身分快照（比照 AUDIT_LOG 同來源） | 是 |
| question | 問題內容（是否全文/摘要/雜湊見 OQ-E09-09） | 是 |
| answerSummary | 回答摘要 | 否 |
| resultType | `answered`(有依據作答) / `low_confidence`(低信心提示) / `no_result`(明確拒答) | 是 |
| citedChunkIds | 回答所依據之 chunk 清單（→ DOCUMENT_CHUNK，多值；`no_result` 時為空） | 否 |
| citedDocumentNumbers | 回答引用之 ICSOP 文件編號清單（去重，供稽核查詢與引用呈現） | 否 |
| occurredAt | 伺服器時間戳記 | 是 |

- **Append-only**：比照 AUDIT_LOG，不可竄改/刪除（[NFR-009](nfr.md#rag-security) AC4 存取控管，僅授權角色查詢，見 F024）。
- 稽核寫入暫時失敗不阻斷問答，進補償佇列重試補寫（F034 AC-4，比照 [#audit](error-handling.md#audit)）。
- 檢索之權限過濾確保 `citedChunkIds` 僅含使用者有權查看之 chunk（F033）。
- **相關功能**：F032、F033、F034、F024。

---

## 狀態轉換彙整

| 實體 | 狀態集合 | 轉換觸發 |
|------|----------|----------|
| ICSOP_DOCUMENT.status | 有效 / 失效 / 作廢 | 管理員手動切換，任意方向，即時生效（[document-status-lifecycle.mmd](diagrams/document-status-lifecycle.mmd)） |
| ACCOUNT.status | active / disabled | 手動停用、離職自動停用；恢復方式待確認 |
| LIFECYCLE.status | active / inactive | 管理員手動切換 |
| SYNC_RUN.status | running → success / failed | 同步執行結果 |
| ORG_CHANGE_ALERT.status | pending → resolved | 管理員更新欄位或標記無需變更 |
| INDEX_RUN.status | running → success / failed | 抽取／切 chunk／向量化執行結果（F029/F030）；failed 保留舊索引 |
| DOCUMENT_CHUNK.status | 有效 / 失效 / 作廢 | 隨來源文件狀態切換同步（F030 AC-3，僅更新 metadata，不重抽） |
