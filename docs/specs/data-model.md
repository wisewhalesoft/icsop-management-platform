---
spec-id: data-model
title: 資料模型（概念層）
version: 1.6
date: 2026-08-16
status: Draft（v1.4 之 LIFECYCLE 子分類段落為 🟢 APPROVED 2026-08-07 人類閘門通過；**v1.5 之 ACCOUNT.userSubtype 段落為 🟢 APPROVED 2026-08-11 人類閘門通過**；**v1.6 之 USAGE_FORM_POOL／DOC_USAGE_FORM 補登錄與 `formNumber` 新欄為 2026-08-16 使用者裁決**）
---

# 資料模型（Data Model）

> 本文件為**概念層**資料模型，定義實體、屬性、擁有權與狀態轉換，供 Architect 決定實際 DB schema、TypeORM Entity 與索引。欄位型別為建議值，非最終 DDL。
> ER 圖：[er-diagram.mmd](diagrams/er-diagram.mmd)｜文件狀態機：[document-status-lifecycle.mmd](diagrams/document-status-lifecycle.mmd)
> 應用資料庫為 MSSQL，與上游組織來源（MSSQL/View）為**不同連線**。附件檔案存 Azure Blob Storage，資料庫僅存 Blob 參照。
> **上游來源之權威定義（欄位對應、階層規則、在職判定、穩定鍵、資料品質實測值）見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md)（2026-07-20 dev 環境唯讀實測定案；資料已遮罩，值層級統計待正式環境覆核）。`ORG_UNIT`／`PERSON`／`ACCOUNT` 三實體之上游對應以該契約為準。**
> **v1.1（2026-07-16）新增 E09 智慧問答（RAG）相關實體**：DOC_SOURCE_XLS、DOCUMENT_CHUNK、VECTOR_EMBEDDING、INDEX_RUN、QA_LOG；並擴充 AUDIT_LOG（`source` / `qaLogId`）以區分「經 AI 問答導引」之調閱。向量之物理儲存（pgvector / Qdrant / Milvus / MSSQL 2025 向量）由 Architect 選型（見 [open-questions.md](open-questions.md) OQ-E09-03），本文件僅定義概念層實體與其 metadata。
> **v1.2（2026-07-17）新增 E07 變更歷程（F037/F038）相關實體**：`DOCUMENT_CHANGE_LOG`（文件欄位層變更事件）、`LIFECYCLE_CHANGE_LOG`＋`LIFECYCLE_SNAPSHOT`（循環 DAG 結構變更事件＋快照）；併同定案 `AUDIT_LOG` 之 `targetType`/`actionType` 擴充（涵蓋 F036/F037/F038 調閱事件，OQ-E07-02 已定案 ✅）。完整理由見 architecture-spec.md §4.8。
> **v1.4（2026-08-07）🟢 APPROVED（2026-08-07 人類閘門通過）**：[LIFECYCLE](#lifecycle-entity) **新增非必填 `subcategory`（子分類）欄位**，循環之業務身分改為 `(name, subcategory)` 組合（**additive**：既有列全數落在 `subcategory = null`，語意與行為向後相容、不需回填）；併同新增唯一性不變式 INV-1／INV-2／INV-3 與 [MSSQL 唯一索引之實作前置檢查](#lifecycle-unique-index-precheck)。權威規格見 [F040](features/F040-lifecycle-subcategory.md)。**既有欄位、既有實體與 ICSOP 文件編號規則皆不變**。
> **🟢 v1.5（2026-08-11）APPROVED（2026-08-11 人類閘門通過）**：[ACCOUNT](#account-entity) **新增 `userSubtype`（一般使用者子分類：`business`／`other`）欄位**（**additive**：`NOT NULL DEFAULT 'other'`，既有列一律落在 `'other'` ＝不限縮，行為向後相容、不需回填、無前置檢查）。權威規格見 [F041](features/F041-user-subtype-business-scope.md)。**[ROLE](#role-entity) 維持固定 5 種、不新增第 6 種角色**（`OQ-E08-04` 已定案為選項 B）。**既有欄位、既有實體與所有既有行為皆不變**；`AUDIT_LOG` 亦不受影響（`OQ-E08-10` 定案為「不記錄拒絕稽核」，本需求完全不觸及稽核子系統）。
> **🔵 v1.6（2026-08-16）使用者裁決（缺失／變更 delta 第 18 項）**：① **補登錄 [USAGE_FORM_POOL](#usage-form-entity)／[DOC_USAGE_FORM](#doc-usage-form) 兩實體**（F018 早已實作，本文件此前缺漏——`OQ-E10-05` 就此**結案**）；② `USAGE_FORM_POOL` **新增選填欄 `formNumber`（表單編號）**——`nullable`、trim 後儲存、**唯一（不分大小寫、`null` 不參與比對）**、`nvarchar(100)`；既有列一律 `null`、不自動產生。權威規格見 [F018 §表單編號 delta](features/F018-usage-form-management.md#form-number-delta)。**本項為 2026-08-16 delta 中唯一需 migration 者**（MSSQL 須以 **filtered unique index `WHERE formNumber IS NOT NULL`** 實作）。**`APPENDIX_POOL` 刻意不比照新增編號欄**（OQ-D18-23）。
> **v1.3（2026-08-06）新增 E10 附錄管理（F039）相關實體**：`APPENDIX_POOL`（附錄池）＋`DOC_APPENDIX`（文件↔附錄多對多關聯，**帶 `sortOrder`**）；併同 `AUDIT_LOG` 之 **additive 擴充**（`targetType` 新增 `APPENDIX`、新增 `appendixId` 參照欄）與 `ICSOP_DOCUMENT` 新增第 20 欄「附錄」。權威規格見 [F039](features/F039-appendix-management.md)。

## 實體總覽

| 實體 | 說明 | 資料擁有權 |
|------|------|-----------|
| ORG_UNIT | 組織單位（公司/本部/部/處室/課，共 5 層） | 上游 MSSQL View（唯讀來源），本系統僅鏡射 |
| PERSON | 人員（含員工編號、職級、在職狀態） | 上游 MSSQL View（唯讀來源），本系統僅鏡射 |
| ROLE | 5 種固定角色列舉 | 程式碼層級固定值 |
| ACCOUNT | 登入帳號（手動 / 上游兩來源） | 本系統 |
| JOB_TITLE | 職稱代碼→名稱對照主檔（供帳號清單「職位」欄） | 上游 MSSQL View（唯讀來源），本系統僅鏡射 |
| LIFECYCLE | 循環（Life Cycle）池 | 本系統 |
| LIFECYCLE_NODE | 循環內 DAG 節點 | 本系統 |
| LIFECYCLE_EDGE | 循環內 DAG 有向邊 | 本系統 |
| ICSOP_DOCUMENT | ICSOP 文件（19 欄位主體＋F039 新增第 20 欄「附錄」） | 本系統 |
| DOCUMENT_LINK | 文件連結點（文件間關聯） | 本系統 |
| DOCUMENT_ATTACHMENT | 附件（ICSOP PDF / OJT；`type='USAGE_FORM'` 為池模型導入前之歷史型態） | 本系統（檔案於 Azure Blob） |
| USAGE_FORM_POOL | 使用表單池（跨文件共用，含選填唯一之 `formNumber`，F018） | 本系統（檔案於 Azure Blob） |
| DOC_USAGE_FORM | 文件↔使用表單多對多關聯（**無** `sortOrder`，F018） | 本系統 |
| APPENDIX_POOL | 附錄池（跨文件共用之補充說明/對照表/範例，F039） | 本系統（檔案於 Azure Blob） |
| DOC_APPENDIX | 文件↔附錄多對多關聯（帶每份文件內之顯示序位 `sortOrder`，F039） | 本系統 |
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
- 🟢 **2026-08-11 明確聲明（[F041](features/F041-user-subtype-business-scope.md)，人類閘門通過）**：「業務／其他」**非第 6 種角色**，而是 [ACCOUNT](#account-entity) 之獨立欄位 `userSubtype`（僅對 `User` 角色生效）。本表維持 **5 種固定列舉值不變**（`OQ-E08-04` 已定案為選項 B）。📝 追溯：若當初裁為選項 A（新增 `BusinessUser` 角色），本表須新增第 6 列，並須同步改寫本節「不可由前後台新增/刪除」之定案文字及 [US-006](../stories/epics/E01-account-auth/US-006-role-assignment.md) AC3、[F003](features/F003-account-role-management.md) AC。
- **相關功能**：F002、F003、F025、F026、**F041**（🟢 APPROVED）。

## 帳號 ACCOUNT {#account-entity}

**上游來源穩定鍵＝`(companyCode, loginId)`**（`loginId` ← `VW_HPMUSER.USERID`）。上游欄位對應之權威定義見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md) §5.2（**12 欄白名單**）。

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
| jobTitleCode | **職稱代碼**（← `JOBTITLEID`）。⚠ 存代碼不存名稱——名稱由 [JOB_TITLE](#job-title-entity) 對照解析，避免上游改名時需 backfill 全部帳號（帳號增量以 `MTDT` 為水位，僅主檔改名不會觸發帳號重寫）。2026-08-12 實測：AS 在職 1,115 筆空值 0 | 否 |
| upstreamModifiedAt | 上游最後異動時間（← `MTDT`），**增量同步依據** | 否 |
| passwordHash | bcrypt/argon2 加鹽雜湊（**僅手動帳號有值**；上游密碼欄嚴禁落地，見下） | 否 |
| source | `manual`(手動建立) / `upstream`(上游同步) | 是 |
| roleCode | 指派角色（→ ROLE） | 是 |
| **userSubtype** | **一般使用者子分類**：`business`(業務) / `other`(其他)。**🟢 APPROVED（[F041](features/F041-user-subtype-business-scope.md)，2026-08-11 人類閘門通過）**；`NOT NULL DEFAULT 'other'`；**僅在 `roleCode = 'User'` 時具效力**（見下） | 是（有預設值） |
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

### `userSubtype` 一般使用者子分類（🟢 APPROVED 2026-08-11 人類閘門通過） {#account-user-subtype}

> **權威＝[F041](features/F041-user-subtype-business-scope.md)**（欄位語意、不變式、判定契約）。本節僅登錄資料模型面之定義，不重複規範行為。
> ✅ **`OQ-E08-04` 已定案為選項 B（子分類旗標）**，故新增本欄。📝 追溯：若當初裁為選項 A（新增第 6 種角色 `BusinessUser`），本欄將不新增，改為擴充 [ROLE](#role-entity) 之列舉值（並須改寫該節「固定 5 種列舉值」之定案文字）。

- **型別**：`nvarchar(20) NOT NULL DEFAULT 'other'`，並加 `CHECK (userSubtype IN ('business','other'))` 約束。
  - 選 `nvarchar(20)` 而非 `bit`／`tinyint`：語意自明、日後若需第三種子分類為 additive 變更（比照 `source`／`status`／`disableReason` 等既有列舉欄之慣例）。
- **預設 `'other'`（＝不限縮）之理由**：既有帳號（含上游同步之全部在職者）於 migration 後一律落在 `'other'`，**行為與變更前完全相同**，不會因欄位缺值而意外全數受限。
- **非上游來源欄位**：`VW_HPMUSER` 12 欄白名單**不含**此欄；[F004](features/F004-org-sync.md) 組織同步之 upsert **不得**寫入本欄（[F041](features/F041-user-subtype-business-scope.md) AC-34）。指派入口僅有一處＝[F003](features/F003-account-role-management.md) 之角色指派 modal。
- **僅對 `roleCode = 'User'` 生效**：其餘 4 種角色之本欄值恆被忽略（[F041](features/F041-user-subtype-business-scope.md) INV-2）。**刻意不以 DB 約束強制「非 User 角色必為 'other'」**——若如此約束，角色升降級將被迫連動改寫本欄，使 additive 欄位變成有狀態耦合；改由判定函式 `isDeptScopedViewer` 於讀取端保證（[F041](features/F041-user-subtype-business-scope.md) AC-03）。
- **不新增索引**：本欄不用於任何查詢條件（判定發生於已取得 session 身分之後、以純函式進行），無索引需求。
- **migration 前置檢查**：無（純 additive 欄位＋預設值，既有列不需盤點或清理，與 [F040](features/F040-lifecycle-subcategory.md) 之 `LIFECYCLE.subcategory` 需前置盤點之情形不同）。

### 上游欄位白名單與密碼欄禁令

- 🔴 上游 `VW_HPMUSER` 定義為 `SELECT *`（57 欄），內含 **`USERPW`／`DEFAULTPW`／`PWCHANGEDT`／`PWERRCNT`** 及 `BIRTHDAY`／`ADDR`／`TELNO`／`MOBILNO`／`EDUCATIONLVL` 等非必要個資。
- **同步作業絕對不得 `SELECT *`，必須逐欄白名單**（上表標註 ← 之 12 欄）。**`USERPW`／`DEFAULTPW` 永不讀取、永不落地、永不記錄於任何日誌**（見 [nfr.md#security](nfr.md#security)）。
- 本表 `passwordHash` **僅供手動建立之管理員帳號使用**，與上游密碼欄無任何關聯，不得由上游寫入。

- 手動帳號與上游帳號**共用同一資料表**，以 `source` 區分（US-005）；手動帳號之 `companyCode`／`loginId` 由本系統自行指派，不與上游衝突。
- **手動帳號之 `name`／`orgCode`／`jobTitleCode` 由 [F003](features/F003-account-role-management.md) 之建立/編輯 modal 維護**（`AC-P1`～`AC-P12`，2026-08-14 delta）：`name` 於手動建立為**必填**（trim 後非空、≤ 30）；`orgCode`／`jobTitleCode` 選填，留空一律存 `null`（空字串不得落地），且須為 [ORG_UNIT](#orgunit-entity)／[JOB_TITLE](#job-title-entity) 主檔內、且與該帳號 `companyCode` 相符之代碼；`companyCode`（NOT NULL）**可於建立與編輯時跨公司選擇**（🔵 2026-08-14 使用者裁決 `OQ-E01-07`；候選＝`SELECTABLE_COMPANIES` ≡ `COMPANY_FULL_NAMES` 之鍵集合，見 F003 `AC-P5`／`AC-P10`／`AC-P15`）。**本規則不新增任何欄位、不需 migration**（四欄皆已存在）。上游帳號之同四欄維持唯讀（`OQ-E01-03`，違反回 `ACCOUNT_UPSTREAM_READONLY`）。
- **跨公司帳號之連帶不變式（F003 `AC-P23`～`AC-P27`）**：① 手動帳號之 `loginId` 為 **全域唯一**（跨全部公司；DB 唯一鍵仍為 `(companyCode, loginId)`，全域性由應用層保證，**不新增索引**）；② 由 `orgCode`／`jobTitleCode` 解析名稱時，**必須以 `(companyCode, orgCode)`／`(companyCode, jobTitleCode)` 複合鍵為之**——[ORG_UNIT](#orgunit-entity) 與 [JOB_TITLE](#job-title-entity) 之唯一鍵皆為複合鍵，不同公司可存在相同代碼但不同單位/職稱，僅以代碼比對將解析出他公司之名稱；③ `ORG_UNIT` 目前僅同步 `AS`（`SYNC_COMPID`），故非 `AS` 之帳號其 `orgCode` 恆為 `null`，屬資料現實而非錯誤。
- 上游帳號的姓名/部門等以同步結果為準（見 [open-questions](open-questions.md)）。
- 帳號停用為**軟刪除**，不可實體刪除（維持稽核外鍵完整性）。
- 帳號狀態：`active → disabled`（手動或離職）；`disabled → active`（誤判恢復，處理方式見 open-questions）。
- **相關功能**：F001、F002、F003、F005、F023、**F041**（`userSubtype`，🔴 Draft）。

## 職稱對照 JOB_TITLE {#job-title-entity}

← `VW_PERSONAL_JOB` 之 `(COMPID, JTITLE_ID, JTITLE_NM)`（契約 [§5.4.1](upstream-hr-source-contract.md)）。
供帳號管理清單「職位」欄（prototype 08 第 5 欄）之代碼→名稱解析。由 F004 組織同步一併攝入。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID（內部代理鍵） | 是 |
| companyCode | 公司代碼（← `COMPID`） | 是 |
| code | 職稱代碼（← `JTITLE_ID`），對應 `ACCOUNT.jobTitleCode` | 是 |
| name | 職稱名稱（← `JTITLE_NM`；業務專員／課長／協理…） | 是 |

- **唯一鍵＝`(companyCode, code)`**，⚠ **不得以 `code` 單獨為鍵**——上游跨公司存在一碼多名
  （實測：全公司 71 組 pair／63 種代碼，8 種歧義，如 `C01` ＝協理｜高級協理）；限單一公司內則為 1:1
  （AS：54／54，零歧義）。
- **解析為兩段式**：本公司優先 → 查無再跨公司 fallback（固定取 `companyCode` 字典序最小者以保確定性）。
  實測 AS 在職 1,115 筆命中率 100%（僅第一段為 99.10%）。
- ⚠ **不刪除本地已無對應之列**：上游移除某代碼時，既有帳號仍可能引用它，刪除會使歷史帳號之職位顯示驟失。

## 循環 LIFECYCLE {#lifecycle-entity}

> **🟢 APPROVED（2026-08-07 人類閘門通過，含 4 項裁決）**：本節之 `subcategory` 欄位與不變式 INV-1～INV-3 為 [F040](features/F040-lifecycle-subcategory.md) 新增，待人類審核。其餘內容不變。

**循環之業務身分＝`(name, subcategory)` 組合**（雙主鍵概念，[F040](features/F040-lifecycle-subcategory.md) 定案 2026-08-07）：同一名稱下之不同子分類視為**彼此獨立的循環**，各自擁有獨立 UUID、獨立 DAG 結構與獨立文件掛載。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| name | 循環名稱（建議 `nvarchar(100)`，現行實作值）；儲存前 trim | 是 |
| subcategory | **子分類**（建議 `nvarchar(100)`，同 `name`）；與 `name` 併為業務身分。**無子分類時恆為 `null`，不得以空字串表示**；輸入之空白／空字串一律正規化為 `null`（`normalizeSubcategory`）**（F040 新增，2026-08-07）** | 否 |
| description | 說明 | 否 |
| status | `active`(啟用) / `inactive`(停用) | 是 |
| createdAt / updatedAt | 建立/更新時間 | 是 |

### 唯一性不變式（F040，2026-08-07） {#lifecycle-uniqueness}

| ID | 不變式 | 違反時 |
|---|---|---|
| **INV-1** | `(name, subcategory)` 組合於全表唯一；`subcategory = null` 視為單一具體值參與比對（同名之「無子分類」列至多一筆） | `LIFECYCLE_DUPLICATE`（409） |
| **INV-2** | 對任一 `name`，其列集合**要麼恰為一筆 `subcategory = null`，要麼全部 `subcategory ≠ null`**，兩者不得並存（雙向禁止） | `LIFECYCLE_SUBCATEGORY_CONFLICT`（409） |
| **INV-3** | `subcategory` 持久化值恆為 `null` 或非空之 trim 後字串 | 由服務層入口之 `normalizeSubcategory` 保證 |

- **比對範圍（已定案 ✅，2026-08-07 使用者裁定，OQ-E03-10）**：涵蓋**全部列、不分 `status`**（`active` 與 `inactive` 皆納入）。停用之循環仍存在於池中並被既有文件之 `lifecycleId` 參照，排除比對將產生兩筆語意相同之列；此語意與 DB 唯一索引一致，**不需篩選索引**。
- 子分類值**可跨名稱重複**（`A（甲）` 與 `B（甲）` 併存合法）——唯一性是「組合」而非「子分類本身」。
- **顯示名稱**一律由純函式 `lifecycleDisplayName({ name, subcategory })` 組合：有子分類 → `名稱（子分類）`（**全形括號、前後無空白**）；無 → `名稱`。清單、下拉、頁面標題、`AUDIT_LOG.lifecycleName` 之快照值皆用此輸出（F040 AC-30／AC-35）；[LIFECYCLE_CHANGE_LOG](#lifecyclechangelog-entity) **不存**循環名稱，其顯示為查詢時 join 本表取**當前值**後再經此函式組合（**非快照**，F040 AC-34）。
- **文件編號不受影響**：ICSOP 文件編號第 2 段之循環代碼（`SRC`／`PUC`／…）**僅依 `name` 查表推導**，`subcategory` 不參與、不改變既有九大循環代碼與任何既有文件編號（F040 AC-28／AC-29，已定案）。

#### MSSQL 唯一索引與 NULL 之處理（實作前置檢查，非開放問題） {#lifecycle-unique-index-precheck}

**MSSQL 之 `UNIQUE INDEX` 視多個 `NULL` 為相等**（與 ANSI 標準相反）。此語意對本需求**恰好正確**：`UNIQUE (name, subcategory)` 使同名之「無子分類」列只能存在一筆，正是 INV-1 所欲，**不需**篩選索引或哨兵值代換。但也因此，**既有同名重複列會使建立索引之 migration 直接失敗**——現行 `LIFECYCLE.name` **無任何唯一鍵**（見 `backend/src/database/entities/lifecycle.entity.ts`），故必須前置檢查：

1. **盤點**：`SELECT name, COUNT(*) AS c FROM LIFECYCLE GROUP BY name HAVING COUNT(*) > 1`。
2. **清理**（有結果時）：由 ICSOP 管理員**逐筆裁定**——為重複列補上相異 `subcategory`、更名、或刪除（刪除須先依 [F007](features/F007-lifecycle-pool-crud.md) 清空全部文件掛載）。**嚴禁自動合併**（會改變既有文件之 `lifecycleId` 參照與 DAG 歸屬）。
3. **加欄**：`ALTER TABLE LIFECYCLE ADD subcategory nvarchar(100) NULL`；既有列全數落在 `NULL`（＝無子分類），語意向後相容、不需回填。
4. **建索引**：於 `(name, subcategory)` 建立唯一索引；若因殘留重複失敗，migration **必須中止並回報**，不得靜默略過（略過將使 INV-1 僅剩服務層單保險）。
5. **驗證**：對真實 app DB（SOP）實跑 migration，並以 `GROUP BY name, subcategory HAVING COUNT(*) > 1` 覆核為 0 筆。

> **INV-2 無法由單一唯一索引表達**（它是「同一 `name` 之列集合形狀」之約束，非列層唯一性）。本模型定義 INV-2 由**服務層權威保證**；DB 層是否另以 indexed view／trigger 二線強制屬實作選擇，不阻塞。

- **[OQ-E03-03 已定案 ✅，2026-07-17]** **允許刪除循環，但需先清空所有文件掛載**；仍有掛載時回 `LIFECYCLE_HAS_DOCUMENTS`（語意＝需先解除全部掛載才能刪除，非「永不可刪」）。清空後刪除將一併移除其節點/連線。**停用（`inactive`）不受此限制**，可隨時執行（F007）。
- **[OQ-E03-01／OQ-E03-02 已定案 ✅]** 循環**不需**「擁有部門」等欄位；循環狀態（啟用/停用）與文件狀態**不聯動**。
- **[OQ-E03-05 已定案 ✅]** 循環/節點之結構變更歷程**予以保留**，採 [F038](features/F038-lifecycle-tree-change-history.md)（append-only 事件＋快照，見 [LIFECYCLE_CHANGE_LOG](#lifecyclechangelog-entity)／[LIFECYCLE_SNAPSHOT](#lifecyclesnapshot-entity)）；循環本體仍僅保存當前狀態。
- **相關功能**：F007、F008、F009、F010、**F040**（子分類與唯一性不變式之權威規格）。

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

欄位權威定義（來源：E04 epic-brief；1–19 欄為 2026-07-17 定案之 19 欄制，第 20 欄「附錄」由 [F039](features/F039-appendix-management.md) 於 2026-08-06 新增）。**唯一權威欄位清單**，其他文件皆引用此表。UI 顯示標籤（實體名維持「ICSOP 文件」）：文件編號＝「程序書編號」、文件名稱＝「程序書書名」、文件連結點＝「連結點程序書」、所屬循環＝「循環別」、ICSOP PDF＝「檔案」。

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
| 20 | 附錄 | appendixIds | 0..* | → APPENDIX_POOL（經 [DOC_APPENDIX](#doc-appendix)，**有序**，`sortOrder` 1..N）；excel/pdf，Azure Blob，跨文件共用**（F039 新增，2026-08-06）** | ICSOPAdmin |

- **第 20 欄「附錄」（2026-08-06，[F039](features/F039-appendix-management.md)）**：與第 15 欄「使用表單」同性質（皆為池模型之多對多共用檔案），差異在**附錄帶每份文件內之顯示順序** `DOC_APPENDIX.sortOrder`。⚠ **既有落差（不逕改他人 spec）**：多份文件／stories 之散文仍以「19 欄」指涉本表（F010／F011／F017／F026／F037／architecture-spec／E04 epic-brief），**既有 1–19 之欄位序號與屬性名一律不變動**（下游 `fieldName` 字串不受影響），僅新增第 20 列；「19 欄」措辭之全域同步已登錄 [open-questions.md](open-questions.md) OQ-E10-03。
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

## 使用表單池 USAGE_FORM_POOL {#usage-form-entity}

> **2026-08-16 補登錄（償還 `OQ-E10-05`）**：本實體與 [DOC_USAGE_FORM](#doc-usage-form) 於 [F018](features/F018-usage-form-management.md) 早已實作（migration `1722124800000-usage-form`），惟本文件此前僅以 `DOCUMENT_ATTACHMENT.type=USAGE_FORM` 描述使用表單，屬既有文件缺口。本次因新增 `formNumber` 欄而先補登錄實體本體，避免出現「只有新欄、沒有本體」之殘缺定義。
> ⚠ **與 [DOCUMENT_ATTACHMENT](#attachment-entity) 之關係**：該表之 `type='USAGE_FORM'` 為**池模型導入前之歷史型態**；現行權威為本實體＋[DOC_USAGE_FORM](#doc-usage-form) 之多對多池模型（OQ-E05-04 定案）。[ICSOP_DOCUMENT](#document-entity) 第 15 欄「使用表單」之關聯即經 `DOC_USAGE_FORM`。

跨文件共用之使用表單（excel／pdf），採**池模型**：一份表單可被 0..* 份 ICSOP 文件引用。**覆蓋式，不保留歷史版本**。權威規格：[F018](features/F018-usage-form-management.md)。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| **formNumber** | **表單編號**（`nvarchar(100)` **`COLLATE Chinese_Taiwan_Stroke_CI_AS`**）。**選填（`nullable`）**；trim 後量測與儲存，空白／未提供 → `null`（**空字串不得落地**）；> 100 字元 → `USAGE_FORM_NUMBER_TOO_LONG`。**唯一（trim、不分大小寫），`null` 不參與比對**；重複 → `USAGE_FORM_NUMBER_DUPLICATE`。**（F018，2026-08-16 新增）** | 否 |
| name | 表單名稱（`nvarchar(400)`）；上傳時可自訂，trim 後量測；空白／未提供 → fallback 原始檔名；> 400 字元 → `USAGE_FORM_NAME_TOO_LONG` | 是 |
| blobPath | Azure Blob 參照路徑（**不綁定單一文件**，因表單為多對多共用） | 是 |
| format | 副檔名（`xlsx` / `xls` / `pdf`），供清單「格式」欄與格式篩選（`excel` 篩選 ＝ `xlsx` ∪ `xls`） | 是 |
| size | 檔案大小（bytes），上限 50MB（含邊界） | 是 |
| uploadedBy / uploadedAt | 上傳（或最後覆蓋）者帳號與時間；**管理端操作記錄，非前台調閱稽核** | 是 |

- **`formNumber` 之唯一性實作（2026-08-16；🔴 同日經真庫實跑修正）**：MSSQL 之一般 UNIQUE 索引視多個 `NULL` 為相等，故須以 **filtered unique index（`WHERE formNumber IS NOT NULL`）** 或等效機制實作；應用層另做同一驗證（雙保險）。
  - 🔴 **大小寫不敏感之達成方式已定案＝欄位級 `COLLATE Chinese_Taiwan_Stroke_CI_AS` 覆寫**（**不**新增正規化比較欄）。**此為必要而非選配**：SOP 資料庫之實際 collation 為 **`Chinese_Taiwan_Stroke_BIN`（二進位比對＝大小寫敏感）**，若不於欄位級覆寫，filtered unique index 雖然建得出來，**「不分大小寫唯一」在 DB 層完全不成立**——實測交易內插入 `FM-001` 與 `fm-001` **兩筆皆成功**，所謂「雙保險」實際只剩應用層 `toLowerCase()` 一道（擋得住一般路徑、擋不住併發）。
  - **已對真庫驗證**（`OQ-D18-30`）：欄位 collation ＝ `Chinese_Taiwan_Stroke_CI_AS`；插 `FM-001` 後插 `fm-001` **被拒（MSSQL err 2601）**；插兩筆 `NULL` **皆成功**（filtered index 語意未於「DROP INDEX → ALTER COLUMN → 重建」中遺失）。**應用層 `toLowerCase()` 維持不動**——雙保險兩道都要在。
  - ⚠ **本前提之教訓（供其他欄位參考）**：**DB collation 是規格從未言明、卻決定唯一性行為的隱藏前提**。凡規格寫「不分大小寫唯一」之欄位，**必須於 DDL 明示 collation 並對真庫實跑驗證**——單元測試以 fake 對「重複 → 409」，真庫若為 `_BIN` 則從不產生該錯誤，測試恆綠而缺陷仍在。全庫「唯一索引 × 字元欄」共 18 項，除本欄外**其餘 17 項皆為 `_BIN`**（多數為 app 自產／上游同步之代碼與 enum，無使用者輸入之大小寫變異，判定不構成缺口）；其中 `ACCOUNT.email`（`OQ-D18-31`）與 `ICSOP_DOCUMENT.documentNumber`（`OQ-D18-32`）兩項已如實登錄、**本 delta 經使用者裁決「只登錄、不修」**。逐項判讀見 [open-questions.md §D18 追加三](open-questions.md)。
- **`formNumber` 之既有列處置**：一律為 `null`（系統從未收集過此資訊、上游無對應欄位）；**不自動產生、不回填假值**（[F018](features/F018-usage-form-management.md) `AC-D7`）。因此該欄**必須 `nullable`**，否則 migration 無法執行。
- 欄位形狀與 [APPENDIX_POOL](#appendix-entity) 刻意同構（附錄之設計即以本實體為樣板）。⚠ **`formNumber` 為兩者之刻意不對稱**：`APPENDIX_POOL` **不**比照新增編號欄（OQ-D18-23 裁決＝不主動擴及，使用者只提使用表單）。
- 覆蓋語意：新檔寫入後更新 `blobPath`/`format`/`size`/`uploadedBy`/`uploadedAt` 並回收舊 blob；**名稱與表單編號皆不隨覆蓋改變**。引用文件數 ≥ 2 且未二次確認 → `USAGE_FORM_OVERWRITE_SHARED`（409，實作常數 `SHARED_OVERWRITE_MIN_REFS = 2`；F018 散文之「≥1」為未同步之殘留，見 [open-questions.md](open-questions.md) OQ-E10-04）。
- 移除：引用文件數 ≥ 1 且未二次確認 → `USAGE_FORM_IN_USE`（409）。
- 存取須經權限驗證＋短效期憑證（SAS Token），禁止直接猜測網址存取（[NFR-002](nfr.md#security)）。
- **相關功能**：F018、F010／F011（關聯）、F017（第 11 項篩選，選項 label ＝ `{編號} {名稱}`）、F019（前台詳情列出與下載）、F023（前台下載稽核）、F026（欄位權限「使用表單（多）」）。

### 文件↔使用表單關聯 DOC_USAGE_FORM {#doc-usage-form}

| 屬性 | 說明 | 必填 |
|------|------|------|
| documentId | → ICSOP_DOCUMENT | 是 |
| formId | → USAGE_FORM_POOL | 是 |

- **唯一性**：`(documentId, formId)` 唯一（同一表單於同一文件至多一筆）；建議複合主鍵。`formId` 另建索引供「關聯文件數」查詢與 [F017](features/F017-backend-document-list.md) 之「使用表單」篩選。
- ⚠ **與 [DOC_APPENDIX](#doc-appendix) 之刻意差異**：本表**無 `sortOrder`**——使用表單無「每份文件內之顯示順序」概念（F039 之排序為附錄特有）。
- **相關功能**：F018、F010、F011、F017、F019。

## 附錄池 APPENDIX_POOL {#appendix-entity}

跨文件共用之附錄（補充說明、對照表、範例文件），採**池模型**：一份附錄可被 0..* 份 ICSOP 文件引用（關聯見 [DOC_APPENDIX](#doc-appendix)）。**覆蓋式，不保留歷史版本**（比照全域「僅保存當前版本」原則）。權威規格：[F039](features/F039-appendix-management.md)。

| 屬性 | 說明 | 必填 |
|------|------|------|
| id | 系統 UUID | 是 |
| name | 附錄名稱（建議 nvarchar(400)）；上傳時可自訂，trim 後量測；空白／未提供 → fallback 原始檔名；> 400 字元 → `APPENDIX_NAME_TOO_LONG` | 是 |
| blobPath | Azure Blob 參照路徑（**不綁定單一文件**，因附錄為多對多共用） | 是 |
| format | 副檔名（`xlsx` / `xls` / `pdf`），供清單「格式」欄與格式篩選（`excel` 篩選 ＝ `xlsx` ∪ `xls`） | 是 |
| size | 檔案大小（bytes），上限 50MB（含邊界） | 是 |
| uploadedBy / uploadedAt | 上傳（或最後覆蓋）者帳號與時間；**管理端操作記錄，非前台調閱稽核** | 是 |

- 欄位形狀刻意與既有 [`USAGE_FORM_POOL`](#usage-form-entity)（F018 實作）同構，以共用上傳／覆蓋／移除之驗證與 Blob 存取機制。⚠ **2026-08-16 起出現一處刻意不對稱**：`USAGE_FORM_POOL` 新增 `formNumber`（表單編號），**`APPENDIX_POOL` 不比照新增**（OQ-D18-23 裁決＝使用者只提使用表單，不主動擴大範圍）。
- 存取須經權限驗證＋短效期憑證（SAS Token），禁止直接猜測網址存取（[NFR-002](nfr.md#security)）。
- **覆蓋語意**：新檔寫入後更新 `blobPath`/`format`/`size`/`uploadedBy`/`uploadedAt` 並回收舊 blob；**名稱不隨覆蓋改變**。關聯文件數 ≥ 2 且未二次確認 → `APPENDIX_OVERWRITE_SHARED`（409）。
- **移除**：關聯文件數 ≥ 1 且未二次確認 → `APPENDIX_IN_USE`（409）；確認後解除全部關聯＋刪除記錄＋回收 blob。
- ✅ ~~**既有落差**：`USAGE_FORM_POOL`／`DOC_USAGE_FORM`（F018 已實作）尚未登錄於本文件，屬既有文件缺口，見 [open-questions.md](open-questions.md) OQ-E10-05。~~ **已於 2026-08-16 償還**：見 [USAGE_FORM_POOL](#usage-form-entity)／[DOC_USAGE_FORM](#doc-usage-form)（`OQ-E10-05` 結案）。
- **相關功能**：F039、F023（下載稽核）、F026（欄位權限）。

### 文件↔附錄關聯 DOC_APPENDIX {#doc-appendix}

| 屬性 | 說明 | 必填 |
|------|------|------|
| documentId | → ICSOP_DOCUMENT | 是 |
| appendixId | → APPENDIX_POOL | 是 |
| sortOrder | **該文件內之顯示序位**，1-based 整數 | 是 |

- **唯一性**：`(documentId, appendixId)` 唯一（同一附錄於同一文件至多一筆）；建議複合主鍵，比照 `DOC_USAGE_FORM`。`appendixId` 另建索引供「關聯文件數」查詢。
- **不變式（invariant）**：同一 `documentId` 之 `sortOrder` 集合恆為 **{1, 2, …, N} 之連續整數且互異**——新選取者取 `max(sortOrder)+1`（末位）；上移／下移為相鄰互換；解除關聯後剩餘列依原相對順序重新編號為 1..N（不留缺口）。
- **排序之權威寫入路徑**：建立／編輯畫面送出「已選＋排序」最終狀態，以 delete-then-insert **replace-set（單一交易）** 依陣列索引重寫 `sortOrder`（比照 [F014](features/F014-accountable-dept-chief.md) 多值欄位既有模式）。
- ⚠ **給 system-architect**：`(documentId, sortOrder)` 是否加唯一索引須權衡——重排期間之中間態會暫時違反唯一性（MSSQL 無 deferred constraint），可行解為「同一交易內先刪後插」或不加該唯一索引而以服務層保證。此為實作決策，見 [open-questions.md](open-questions.md) OQ-E10-02。
- **前後台呈現**：`GET /documents/:documentId/appendices` 一律 `ORDER BY sortOrder ASC`，前後台共用（F039 AC-25）。
- **相關功能**：F039、F010、F011、F019。

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
| documentId / documentNumber | 被調閱文件（**條件必填**：`targetType∈{DOCUMENT, USAGE_FORM, APPENDIX, DOCUMENT_CHANGE_LOG}` 時必填，其餘為 null） | 否 |
| lifecycleId / lifecycleName | 被調閱循環（**新增**；**條件必填**：`targetType∈{LIFECYCLE, LIFECYCLE_CHANGE_LOG}` 時必填，其餘為 null） | 否 |
| targetType | `DOCUMENT` / `USAGE_FORM` / `APPENDIX`（**新增**，F039 附錄下載）/ `LIFECYCLE`（F036 循環樹狀圖）/ `DOCUMENT_CHANGE_LOG`（F037 變更歷程）/ `LIFECYCLE_CHANGE_LOG`（F038 循環變更歷程）/ `ORG_CHANGE_ALERT`（F006 組織異動提示處理） | 是 |
| formId | 使用表單附件（targetType=USAGE_FORM 時） | 否 |
| appendixId | 附錄池記錄（**新增**，→ APPENDIX_POOL；**條件必填**：`targetType=APPENDIX` 時必填，其餘為 null） | 否 |
| actionType | `VIEW` / `DOWNLOAD` / `PRINT`（既有，`targetType=DOCUMENT/USAGE_FORM` 適用）／`DOWNLOAD`（**`targetType=APPENDIX` 之唯一合法動作**，F039）／`LIFECYCLE_VIEW` / `LIFECYCLE_DOWNLOAD` / `LIFECYCLE_PRINT`（`targetType=LIFECYCLE`，F036）／`CHANGE_LOG_VIEW`（`targetType=DOCUMENT_CHANGE_LOG`，F037）／`LIFECYCLE_CHANGELOG_VIEW` / `LIFECYCLE_CHANGELOG_DOWNLOAD`（`targetType=LIFECYCLE_CHANGE_LOG`，F038）／`ALERT_RESOLVED`（**新增**，`targetType=ORG_CHANGE_ALERT`，F006 提示解除） | 是 |
| watermarkSnapshot | 當次浮水印完整字串快照（`DOWNLOAD`/`PRINT` 系列動作皆須填；純 `VIEW` 系列亦填，與檢視器疊加一致） | 是 |
| occurredAt | 伺服器時間戳記 | 是 |
| source | `DIRECT`(一般前台路徑) / `AI_QA`(經 AI 智慧問答導引)，預設 `DIRECT`（E09 US-097） | 是 |
| qaLogId | 觸發此次調閱之問答事件（→ QA_LOG，`source=AI_QA` 時有值） | 否 |

- 身分/時間快照須與該次浮水印內容**完全一致**（F020、F023）。
- **`ORG_CHANGE_ALERT` 之限制（F006）**：本表無 `alertId` 外鍵欄，`targetType=ORG_CHANGE_ALERT` 之解除稽核僅落 `targetNumber`/`targetName`（文件編號/名稱或人員資訊），未落 alert 主鍵。刻意不 ALTER 共用 AUDIT_LOG schema；如需以 alertId 反查稽核，屬後續 schema 決策。
- **問答事件本身**（提問→回答）記於 [QA_LOG](#qalog-entity)，非以 `actionType` 表示；經 AI 問答導引之檢視/下載仍寫本表，並以 `source=AI_QA`＋`qaLogId` 標示來源（F034）。
- **[OQ-E07-02 已定案 ✅，system-architect 2026-07-17]** 循環樹狀圖預覽（[F036](features/F036-lifecycle-tree-preview.md)）之檢視/下載/列印、變更歷程（[F037](features/F037-document-change-history.md)／[F038](features/F038-lifecycle-tree-change-history.md)）之查詢檢視/下載，皆屬「**調閱/存取事件**」（誰在何時存取了什麼），與既有 VIEW/DOWNLOAD/PRINT 語意一致，**擴充本表**（`targetType`＋`actionType` 各新增列舉值，見上）而非另建稽核表；三個 feature（F036/F037/F038）共用同一組決策，家族一致。決策理由：(1) 這些動作的資料形狀（操作者/時間/被存取對象/浮水印快照）與既有 VIEW/DOWNLOAD/PRINT 完全同構，另建表僅為重複 schema；(2) `documentId`/`lifecycleId` 皆改為條件必填（依 `targetType` 二擇一），不強迫每列填滿兩組外鍵；(3) `actionType` 沿用 feature spec 既有文字定義之草案動作名（`CHANGE_LOG_VIEW` 等）逐字落地，不重新發明命名以維持與已核准 spec 文件（F036/F037/F038 AC、US-062/US-063 AC）之字面一致性，降低下游 test-designer/tdd-developer 之轉譯落差風險。
- **[OQ-E07-02 已定案 ✅]** 變更歷程記錄的是「**資料異動事件**」本體（欄位/結構層 old→new diff），與上述「調閱事件」性質不同（前者是「什麼被改了」，後者是「誰看了什麼」），**不併入本表**，另建獨立實體 [DOCUMENT_CHANGE_LOG](#documentchangelog-entity)、[LIFECYCLE_CHANGE_LOG](#lifecyclechangelog-entity)、[LIFECYCLE_SNAPSHOT](#lifecyclesnapshot-entity)（詳見下方「變更歷程相關實體」）。不併表理由：(1) 欄位形狀截然不同（`fieldName`/`oldValue`/`newValue` 或 `changeType`/`entityType`/`beforeValue`/`afterValue` vs 本表之 `actionType`/`watermarkSnapshot`），併表將產生大量依 `targetType` 才有意義的稀疏可空欄位（polymorphic 反樣式），複雜化本表既有查詢；(2) 一致性模型不同——本表為 Outbox 非阻斷寫入（§5.5），變更歷程須與來源交易強一致（見 architecture-spec.md §5.9，遺失即等同稽核造假，不可退化為 best-effort）；(3) 獨立表使 [OQ-NFR003](open-questions.md) 之「變更歷程是否需獨立保留政策」在不修改本表結構前提下即可彈性套用不同歸檔策略。
- **`APPENDIX` 擴充（F039，2026-08-06，additive）**：前台下載附錄須寫本表。變更為**純新增**——`targetType` 聯集新增字面值 `APPENDIX`、新增參照欄 `appendixId`（nullable），**既有 6 種 targetType 之語意與既有欄位皆不變**（比照 `ORG_CHANGE_ALERT`／`LIFECYCLE_DELETE` 之先例）。落列規則：`targetType='APPENDIX'` 時 `appendixId`＋`documentId` 皆必填（附錄下載恆發生於某份文件之詳情頁脈絡），`formId`／`lifecycleId` 為 null，`actionType` 恆為 `DOWNLOAD`。<br>🔴 **`watermarkSnapshot` 之落值規則於 2026-08-16 使用者裁決推翻，理由：前台附錄與使用表單之 PDF 改為燒錄浮水印**——原條文為「`watermarkSnapshot` 為 null（附錄**不燒錄浮水印**，OQ-E05-03 定案沿用）」。**現行規則（適用 `targetType ∈ {APPENDIX, USAGE_FORM}`）**：前台下載之 `format = pdf` 者，`watermarkSnapshot` **落值**（與該次燒錄之浮水印字串逐字相同，比照 `DOCUMENT` 之既有語意）；`format ∈ {xlsx, xls}` 者（策略 A，未燒錄）`watermarkSnapshot` **為 null**。**後台下載一律不寫本表**（OQ-FM-01 維持有效），故不存在後台列。**本項為落值語意之變更，非 schema 變更——欄位本即 nullable，不需 migration。**
  - **`buildAuditRow` 之 switch 對映**須新增 `APPENDIX → appendixId` 分支（既有分支 `DOCUMENT→documentId`／`USAGE_FORM→formId`／`LIFECYCLE→lifecycleId` 不動）。
  - **[F024](features/F024-access-history-query.md) 類型篩選歸屬（定案）**：`APPENDIX` 歸入既有「**文件**」類，即 `kindToTargetTypes('文件') = ['DOCUMENT', 'USAGE_FORM', 'APPENDIX']`。理由：附錄下載與使用表單下載同為「對某份文件之附屬檔案之調閱」，語意同群；**不新增第四種類型篩選值**，F024 之 UI 篩選選項與匯出範本皆不需變更。
- 保留年限草案 ≥ 3 年（[NFR-003](nfr.md#audit-retention)，待確認）。
- **相關功能**：F020、F023、F024、F034、F036、F037、F038、F039。

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
| lifecycleId | 所屬循環（→ LIFECYCLE）。**本表不存循環名稱**，顯示時 join 取當前值（見下方說明） | 是 |
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
- **循環名稱不落本表（2026-08-08 使用者裁定之取捨）**：本表**不存**任何循環名稱欄位（無 `lifecycleName`），僅存 `lifecycleId`；[F038](features/F038-lifecycle-tree-change-history.md) 事件清單、新舊樹狀圖標題與下載 PDF 之「循環別」一律以 `lifecycleId` **join [LIFECYCLE](#lifecycle-entity) 取當前之 `{ name, subcategory }`**，再經 `lifecycleDisplayName` 組合（含子分類，[F040](features/F040-lifecycle-subcategory.md) AC-34）。
  - **已知代價（明列，非缺陷）**：此為**當前值**而非快照——循環於事件寫入後改名或改子分類，既有事件將顯示**新名稱**，**不具名稱快照語意**；與 F038 原意之「歷史事件可唯一辨識所屬循環」有落差（`lifecycleId` 仍唯一辨識，人類可讀名稱不保證）。使用者於 2026-08-08 裁定**不為此新增欄位與 migration**（原 spec 曾列 `lifecycleName` 欄，實作 schema 從未有此欄，本次以修規格收斂）。日後是否補快照欄，追溯見 [open-questions.md](open-questions.md) OQ-E07-11。
  - **對照**：[AUDIT_LOG](#auditlog-entity) 之 `lifecycleName` **仍為快照**（寫入當下值，F040 AC-35／AC-36）；兩表語意不同，不得互相套用。
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
