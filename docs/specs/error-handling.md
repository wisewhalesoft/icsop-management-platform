---
spec-id: error-handling
title: 錯誤處理與失敗模式
version: 1.9
date: 2026-08-20
status: Draft（v1.2 之 [#lifecycle-subcategory](#lifecycle-subcategory) 段落與 3 個 `LIFECYCLE_*` 錯誤碼為 🟢 APPROVED 2026-08-07 人類閘門通過；**v1.3 之 [#dept-restriction](#dept-restriction) 段落為 🟢 APPROVED 2026-08-11 人類閘門通過——OQ-E06-03 定案為 404 `DOCUMENT_NOT_FOUND`、OQ-E08-10 定案為不記錄拒絕稽核，均沿用既有錯誤碼、不新增**；**v1.4 新增 [#account-profile](#account-profile) 段落與 3 個 `ACCOUNT_*_INVALID` 錯誤碼，對應 F003 手動帳號基本資料 delta，2026-08-14 使用者直接裁定**；**v1.5 同日第二次裁決——公司別可跨公司選擇：`ACCOUNT_COMPANY_CODE_INVALID` 語意放寬為「非有效公司」、`ACCOUNT_USERNAME_EXISTS` 比對範圍擴為全域，均不新增錯誤碼**；**v1.6 新增 [#export](#export) 與 [#usage-form-number](#usage-form-number) 兩段落與 3 個錯誤碼（`EXPORT_ROW_LIMIT_EXCEEDED`／`USAGE_FORM_NUMBER_DUPLICATE`／`USAGE_FORM_NUMBER_TOO_LONG`），對應 2026-08-16 缺失／變更 delta 第 14／16／18 項，使用者裁定**；**v1.7 新增 [#aad-authority-host](#aad-authority-host) 段落，對應 F001 `AC-E1`～`AC-E15` Azure AD endpoint host 覆寫 delta（2026-08-18 遠端環境防火牆對 canonical host 注入偽造 RST 之修復）——**擴充 `AUTH_OIDC_EXCHANGE_FAILED` 之適用階段至 `/auth/login`，並定義一類啟動期 fail-fast；**不新增任何錯誤碼**）；**v1.8 將 [#export](#export) 之適用範圍由三處擴為四處——新增 [F024](features/F024-access-history-query.md#export-fix-delta) 文件調閱歷程匯出（2026-08-18 人類閘門裁決 `OQ-D18-26` 選項 (a)），並解除該節原「F024 不在範圍」之範圍紀律；本節既有規則逐字不變、不新增任何錯誤碼*；**v1.9 為 2026-08-20 使用者裁決（D9 delta，缺失／變更 9 項）之連帶更新——新增 [#d9-delta](#d9-delta) 一節，🔴 **不新增任何錯誤碼**（本輪全數複用既有碼）**）
---

# 錯誤處理（Error Handling）

> 定義使用者可見錯誤、系統失敗、重試/回退與不可恢復情境，供 TDD/QA 撰寫測試。錯誤碼採 `DOMAIN_REASON`（SCREAMING_SNAKE）慣例；實際常數字串以實作為準，本文件定義語意契約。
> **HTTP 狀態碼慣例**：400 輸入驗證/格式錯誤、401 驗證失敗、403 授權不足、404 找不到、409 衝突（唯一性/成環/同步互斥/刪除保護）、**429 請求過於頻繁（節流）**、5xx 系統錯誤。

## 錯誤碼一覽

| 錯誤碼 | HTTP | 使用者訊息（示意） | 出處 |
|--------|------|-------------------|------|
| `AUTH_OIDC_TOKEN_INVALID` | 401 | 驗證失敗 | F001 |
| `AUTH_OIDC_STATE_MISMATCH` | 401 | 驗證失敗，請重新登入 | F001 |
| `AUTH_OIDC_EXCHANGE_FAILED` | 401 | 驗證失敗，請重新登入 | F001 |
| `AUTH_EMAIL_CLAIM_MISSING` | 401 | 驗證失敗，請洽系統管理員 | F001 |
| ~~`AUTH_SIGNATURE_INVALID`~~ | — | **已汰換（2026-07-20）**：原「上游 POST ＋自訂簽章」驗證方式已改為 Azure AD OIDC（見 [upstream-hr-source-contract.md §12](upstream-hr-source-contract.md)），無共享密鑰亦無自訂簽章，本錯誤碼之情境不再存在，改由 `AUTH_OIDC_TOKEN_INVALID` 承接 | ~~F001~~ |
| `AUTH_ACCOUNT_NOT_FOUND` | 401 | 查無有效帳號，請洽系統管理員 | F001 |
| `AUTH_INVALID_CREDENTIALS` | 401 | 帳號或密碼錯誤 | F001 |
| `AUTH_ACCOUNT_DISABLED` | 401 | 帳號已停用 | F001, F005 |
| `AUTH_SELECTION_TICKET_INVALID` | 401 | 登入未完成，請重新登入 | F001 |
| `AUTH_MISSING_FIELD` | 400 | 必要欄位缺漏 | F001 |
| `AUTH_TOO_MANY_ATTEMPTS` | 429 | 帳密登入嘗試過於頻繁（節流，60 秒視窗；同帳號 5 次／同來源 IP 20 次失敗）；不洩漏帳號是否存在 | F001 |
| `AUTH_SESSION_EXPIRED` | 401 | 工作階段已逾時，請重新登入 | F001 |
| `ACCOUNT_USERNAME_EXISTS` | 409 | 帳號名稱已存在（比對 `ACCOUNT.loginId`；錯誤碼名稱沿用不改，避免跨層識別碼churn） | F003 |
| `ACCOUNT_UPSTREAM_READONLY` | 403 | 上游同步帳號資料請透過組織同步更新 | F003 |
| `VALIDATION_ERROR` | 400 | 必要欄位缺漏或格式/長度不合法（**既有實作常數**，非本次新增；範圍＝帳號建立/編輯之 `loginId`／`password`／`roleCode`／`name` 與四欄長度上限，見 [#account-profile](#account-profile)；**2026-08-31 additive 擴及** F017 匯出端點之請求 body（`documentIds` 缺席／非陣列／任一成員非字串），見 [#export](#export)。**沿用不改名**，避免跨層識別碼 churn） | F003, F017 |
| `ACCOUNT_COMPANY_CODE_INVALID` | 400 | 公司代碼**不是有效公司**（不在 `SELECTABLE_COMPANIES`；含空字串、未知代碼、已結束之公司）。⚠ 語意於 2026-08-14 由「≠ 操作者所屬公司」放寬——使用者裁定公司別可跨公司選擇 | F003 |
| `ACCOUNT_ORG_CODE_INVALID` | 400 | 部門代碼不存在於組織主檔，或不屬於該帳號之公司 | F003 |
| `ACCOUNT_JOB_TITLE_INVALID` | 400 | 資位代碼不存在於該公司之職稱對照主檔（`JOB_TITLE`） | F003 |
| `ACCOUNT_JOB_POSITION_INVALID` | 400 | 職位代碼不存在於該公司之職位對照主檔（`JOB_POSITION`） | F003 |
| `ROLE_INVALID` | 400 | 角色值不合法 | F003 |
| `ROLE_SELF_DOWNGRADE_BLOCKED` | 409 | 無法降級自身系統管理員角色（草案，待確認） | F003 |
| **`ROLE_ASSIGN_SCOPE_FORBIDDEN`** 🔴 | 403 | **操作者無權指派該角色**。2026-08-25 角色自動化 delta 新增（`OQ-RA-03`）：ICSOP 管理員對「角色指派」為 `受限CRUD`，可指派 `Supervisor`／`DeptContact`／`User`，**不得指派 `SysAdmin`／`ICSOPAdmin`**。與 `ROLE_INVALID`（角色字串本身不合法，400）為**兩種不同情形**，不得合併 | F003, F025 |
| `SYNC_IN_PROGRESS` | 409 | 同步進行中，請稍候 | F004 |
| `SYNC_SOURCE_UNAVAILABLE` | 5xx | 組織來源暫時無法連線 | F004 |
| `SYNC_DATA_FORMAT_ERROR` | 5xx | 來源資料格式異常 | F004 |
| `SYNC_WRITE_FAILED` | 5xx | 同步寫入失敗（交易已回滾，資料未變） | F004 |
| `DISAPPEARED_RATIO_EXCEEDED` | 5xx | 在職帳號消失比例超過閾值，已中止同步、未執行任何停用 | F004 |
| `LIFECYCLE_NAME_REQUIRED` | 400 | 循環名稱不可為空 | F007 |
| `LIFECYCLE_HAS_DOCUMENTS` | 409 | 循環仍有文件掛載，**需先解除全部掛載才能刪除**（可改為停用） | F007 |
| `LIFECYCLE_DUPLICATE` | 409 | 此循環名稱與子分類之組合已存在（`subcategory` 為 null 之「無子分類」亦視為一種具體組合） | F040, F007 |
| `LIFECYCLE_SUBCATEGORY_CONFLICT` | 409 | 同一循環名稱不可同時存在「無子分類」與「有子分類」之設定（雙向皆適用）；請先處理既有該筆 | F040, F007 |
| `LIFECYCLE_SUBCATEGORY_REQUIRED` | 400 | 此循環名稱底下設有子分類，請選擇具體子分類後再送出。**後端唯一觸發＝所帶 `lifecycleId` 在其名稱下非合法唯一解**（INV-2 髒資料）；`lifecycleId` **缺漏**歸 `DOCUMENT_REQUIRED_FIELD_MISSING`，不在本碼範圍 | F040, F010, F011 |
| `DAG_SELF_LOOP` | 409 | 節點不可連向自己 | F008 |
| `DAG_CYCLE_DETECTED` | 409 | 此連線會造成循環結構成環，請重新確認流程方向 | F008 |
| `NODE_NOT_FOUND` | 404 | 找不到節點 | F009 |
| `LIFECYCLE_CHANGE_LOG_NOT_FOUND` | 404 | 找不到指定之循環結構變更事件（重建新舊樹狀圖／下載時） | F038 |
| `NODE_DOC_LIFECYCLE_MISMATCH` | 400 | 文件不屬於此循環 | F009 |
| `NODE_DOC_ALREADY_ASSIGNED` | 409（需二次確認） | 文件已掛載於節點 {name}，是否改派？ | F009 |
| `DOCUMENT_REQUIRED_FIELD_MISSING` | 400 | 必填欄位未填寫 | F010 |
| `DOCUMENT_NOT_FOUND` | 404 | 找不到文件 | F011, F016 |
| `DOCUMENT_PDF_NOT_FOUND` | 404 | 前台檢視器 VIEW/DOWNLOAD/PRINT 或 `getOriginalPdf` 查無文件之原始 PDF | F020 |
| `ALERT_NOT_FOUND` | 404 | 找不到組織異動待確認提示 | F006 |
| `ALERT_ALREADY_RESOLVED` | 409 | 此提示已處理，無法重複解除 | F006 |
| `DOCUMENT_NUMBER_DUPLICATE` | 409 | 文件編號已存在（**比對「有效＋作廢」**；「失效」編號已釋出不觸發） | F013 |
| `DOCUMENT_STATUS_INVALID` | 400 | 文件狀態值不合法 | F012 |
| `DOCUMENT_LINK_TARGET_NOT_FOUND` | 400 | 連結目標文件不存在 | F015 |
| `FILE_FORMAT_NOT_ALLOWED` | 400 | 檔案格式不允許 | F016, F018, F039 |
| `FILE_SIZE_EXCEEDED` | 400 | 檔案超過大小上限 | F016, F018, F039 |
| `FILE_ACCESS_DENIED` | 403 | 無權存取此檔案 | F016, F018, F020, F039 |
| `USAGE_FORM_NAME_TOO_LONG` | 400 | 使用表單名稱超過長度上限（去空白後 400 字元，對齊 `USAGE_FORM_POOL.name` nvarchar(400)） | F018 |
| `USAGE_FORM_OVERWRITE_SHARED` | 409（需二次確認） | 此表單另被 {N} 份文件引用，覆蓋將同時更新全部，是否繼續？（門檻：引用 ≥2） | F018 |
| `USAGE_FORM_IN_USE` | 409（需二次確認） | 此表單仍被 {N} 份文件引用，移除將自所有引用解除，是否繼續？ | F018 |
| `USAGE_FORM_NOT_FOUND` | 404 | 找不到此使用表單 | F018 |
| `USAGE_FORM_NUMBER_TOO_LONG` | 400 | 表單編號超過長度上限（trim 後 100 字元，對齊 `USAGE_FORM_POOL.formNumber` nvarchar(100)）**（2026-08-16 新增）** | F018 |
| `USAGE_FORM_NUMBER_DUPLICATE` | 409 | 表單編號已存在（比對前 trim、**不分大小寫**；`null` 不參與比對；編輯時排除自身列）**（2026-08-16 新增）** | F018 |
| `EXPORT_ROW_LIMIT_EXCEEDED` | 400 | 匯出筆數超過上限 10,000，請縮小篩選／查詢條件（訊息含上限值）；**不產生任何檔案**。**（2026-08-16 新增，三處匯出共用同一碼）** | F039, F037, F038 |
| `APPENDIX_NAME_TOO_LONG` | 400 | 附錄名稱超過長度上限（去空白後 400 字元，對齊 `APPENDIX_POOL.name` nvarchar(400)） | F039 |
| `APPENDIX_OVERWRITE_SHARED` | 409（需二次確認） | 此附錄另被 {N} 份文件引用，覆蓋將同時更新全部，是否繼續？（門檻：引用 ≥2） | F039 |
| `APPENDIX_IN_USE` | 409（需二次確認） | 此附錄仍被 {N} 份文件引用，移除將自所有引用解除，是否繼續？（門檻：引用 ≥1） | F039 |
| `APPENDIX_NOT_FOUND` | 404 | 找不到此附錄 | F039 |
| `PERMISSION_DENIED` | 403 | 權限不足 | F025 |
| `FIELD_WRITE_FORBIDDEN` | 403 | 無權修改此欄位 | F026 |
| `AUDIT_IMMUTABLE` | 403 | 稽核紀錄不可修改或刪除 | F023 |
| `AUDIT_TARGET_REF_REQUIRED` | 400 | 稽核事件缺少此類型必要之對象參照（targetId） | F023 |
| ~~`QUERY_CONDITION_REQUIRED`~~ | — | **F024 改為非阻擋**（定案 2026-07-22）：空查詢條件不報錯，改套用近 30 天預設範圍並回 `appliedDefaultRange`（見下方查詢空條件）。代碼保留供他處。 | ~~F024~~ |
| `XLS_TEMPLATE_INVALID` | 400 | 檔案不符合 ICSOP 標準模板 | F027, F028 |
| ~~`XLS_PDF_CONVERSION_FAILED`~~ | — | **已移除**（OQ-E09-10 定案：取消 .xls→PDF 自動轉檔，.xls 與呈現用 PDF 分開手動上傳，無轉檔行為） | ~~F027~~ |
| `EXTRACTION_FAILED` | 400/5xx | 內文抽取失敗（模板不符 400；解析工具錯誤 5xx） | F028 |
| `CHUNKING_FAILED` | 5xx | 切 chunk 失敗 | F029 |
| `EMBEDDING_FAILED` | 5xx | 向量化失敗 | F029 |
| `INDEX_BUILD_FAILED` | 5xx | 向量索引建立失敗 | F029 |
| `REINDEX_FAILED` | 5xx | 重新索引失敗（保留舊索引繼續服務） | F030 |
| `RAG_QUERY_EMPTY` | 400 | 問題不可為空 | F032 |
| `LLM_SERVICE_UNAVAILABLE` | 5xx | 智慧問答生成服務暫時無法使用 | F032, F035 |
| `VECTOR_STORE_UNAVAILABLE` | 5xx | 向量檢索服務暫時無法使用 | F033 |

---

## 驗證與登入 {#auth}

> **2026-07-20 變更**：途徑 A 由「上游 POST ＋自訂簽章」改為 **Azure AD OIDC**（authorization code flow ＋ PKCE），詳見 [upstream-hr-source-contract.md §12](upstream-hr-source-contract.md) 與 [F001](features/F001-auth-login-session.md)。

### OIDC 回呼與 token 驗證

- **`state` 不符或缺漏**：判定為 CSRF／回呼竄改，回 `AUTH_OIDC_STATE_MISMATCH`，**不執行 authorization code 交換**，記錄失敗事件。
- **authorization code 交換失敗**（code 已使用／過期、client 認證失敗、Azure AD token endpoint 不可用）：回 `AUTH_OIDC_EXCHANGE_FAILED`，不核發任何憑證；錯誤訊息不得回傳上游原始錯誤內容。
- **id_token 驗證失敗**：以 Azure AD JWKS 公鑰驗簽，並檢查 `iss`／`aud`／`exp`／`nbf`／`nonce`；任一項不符回 `AUTH_OIDC_TOKEN_INVALID`，**不得洩漏**是哪一項檢查未通過，並記錄失敗事件（[NFR-002](nfr.md#security)）。
- **`email` claim 缺漏或為空**：回 `AUTH_EMAIL_CLAIM_MISSING`，提示洽系統管理員；此為 app registration 或 HR 資料面問題，不得以其他 claim 或 `HREMAILADDR` 靜默 fallback。
- **防重放**：以標準 OIDC `state` ＋ `nonce` ＋ PKCE 達成，取代原「時間戳＋nonce 自訂簽章」機制；`state`／`nonce`／`code_verifier` 均為單次使用，用畢即失效。

### Azure AD endpoint host 覆寫之失敗處理 {#aad-authority-host}

> **v1.7 新增（2026-08-18）**，對應 [F001](features/F001-auth-login-session.md) `AC-E1`～`AC-E15`。**不新增任何錯誤碼**——本段僅（a）擴充既有 `AUTH_OIDC_EXCHANGE_FAILED` 之**適用階段**，（b）定義一類**啟動期失敗**（非 HTTP 錯誤，故無錯誤碼）。背景＝遠端環境之防火牆對 SNI `login.microsoftonline.com` 注入偽造 RST，改走 Microsoft 官方別名 endpoint；issuer 仍釘死為 canonical。

- **設定 host 於執行期不可達**（RST／逾時／DNS 解析失敗）：
  - 於 `/auth/callback` 之 authorization code 交換階段 → 回 `AUTH_OIDC_EXCHANGE_FAILED`（既有語意，F001 `AC-E11`）。
  - 🔴 於 `/auth/login` 之 authorization URL 建構階段 → **兩分支全稱**（F001 `AC-E12`，2026-08-18 改寫）：**分支 A** 該階段零出網（`AC-E3` 靜態注入手法下之現況）⇒ `/auth/login` 仍正常回 302，成敗與設定 host 可達性無關；**分支 B** 該階段有出網且失敗 ⇒ **亦回 `AUTH_OIDC_EXCHANGE_FAILED`**，與 callback 階段同碼、同使用者訊息。**兩分支共同禁止**：不得回 500、不得回未處理例外、不得回堆疊或例外 `message`（此禁止項與實作手法無關、永遠可測）。分支 B 為既有錯誤碼**適用階段之擴充**：原文義僅涵蓋 callback 之 token 交換。
- 🔴 **登入失敗頁之揭露封閉集（F001 `AC-E13`；2026-08-18 精確化——現況已被違反，屬既有 AC 之缺陷修正而非新需求）**：
  - **允許顯示（封閉集）**：① 我方錯誤碼常數；② 本表所定之該碼**固定使用者訊息**；③ 重試登入連結；④ 選配之**我方產生**之隨機 correlation id。
  - **判準**：使用者可見字串**必須完整取自原始碼中可列舉之有限常數集合**（`AUTH_*` 碼 ∪ 固定訊息 ∪ 我方撰寫之靜態說明句）加上 ④。**任何執行期插值之外部來源字串一律禁止**：例外 `message`／`name`／`stack`、`fetch failed`／`network_error`／`ECONNRESET`、上游 HTTP 狀態與 body、`AADSTS*` 及其描述、**Azure 回呼之 `error`／`error_description` query 參數**、authority host 或任何主機名／URL、`tenantId`／`clientId`／`clientSecret`、email／`loginId`。
  - **診斷保全**：上述細節**必須**改寫入伺服器端日誌（附同一 correlation id），日誌不得含 `clientSecret`。**畫面收斂、日誌保全**（搭配 F001 `AC-E14`）。
  - **適用範圍**：`/auth/callback` 與 `/auth/login` 之**全部**失敗呈現路徑（`AUTH_OIDC_STATE_MISMATCH`／`AUTH_OIDC_TOKEN_INVALID`／`AUTH_EMAIL_CLAIM_MISSING`／`AUTH_ACCOUNT_*` 同受拘束——其現有 detail 皆為我方靜態字串，**屬回歸鎖而非變更**）。
  - 沿用並精確化 [#訊息揭露原則](#auth)（「不得回傳上游原始錯誤內容」）與 [NFR-002](nfr.md#security)。
- **id_token `iss` 不符 canonical issuer**：沿用 `AUTH_OIDC_TOKEN_INVALID`。期望值**恆為** `https://login.microsoftonline.com/{tenantId}/v2.0`，**不得由 `AZURE_AD_AUTHORITY_HOST` 導出**（F001 `AC-E5`～`AC-E7`）；即使 endpoint 走別名亦然。
- **`AZURE_AD_AUTHORITY_HOST` 值不合法**（不在白名單 `{login.microsoftonline.com, login.microsoft.com, login.windows.net}`，或含 scheme／path／port／query／userinfo）：**啟動期 fail-fast**，比照既有 `requireEnv` 之啟動期 throw；錯誤訊息含收到之值與完整允許清單。**不得靜默回退為 canonical host**——靜默回退會使遠端重現原症狀且無診斷線索，屬**不可恢復之設定錯誤**而非執行期錯誤，因此不落任何 HTTP 錯誤碼（F001 `AC-E9`／`AC-E10`）。
- **不可恢復情境（登記，不修）**：三個別名**同時**被同一防火牆策略封鎖時，本機制無解——屬網路層問題，須由網管開通或改採出口代理。見 [open-questions.md](open-questions.md) 風險表。

### 帳號對應與狀態

- **AD 驗證通過但查無對應在職帳號**（OQ-E01-01 定案）：回 `AUTH_ACCOUNT_NOT_FOUND`，提示「查無有效帳號，請洽系統管理員」，**不自動建立帳號**。比對規則為完整 email（含網域）逐字、不分大小寫，且強制 `status=active`（← `EMPSTS='A'`）。
- **停用帳號登入**：即使 AD 驗證通過，仍須檢查本地帳號狀態，停用即回 `AUTH_ACCOUNT_DISABLED`。
- **email 於在職帳號中命中多筆**（🔄 **2026-08-24 人類裁決 #2 改寫**，權威＝[upstream-hr-source-contract.md §12.2](upstream-hr-source-contract.md)；AC 見 [F001 `AC-M1`～`AC-M29`](features/F001-auth-login-session.md#multi-account-picker)）：
  - **候選集合姓名全部一致**（＝同一自然人在多家公司之人事記錄）→ **不再拒登**。進入登入中繼狀態、下發短時效之**選擇票證**（5 分鐘、非 sliding、一次性消耗），導向帳號選擇畫面；使用者選定後方核發 session。票證之缺漏／過期／簽章不符／被竄改／已使用／所選帳號不在票證集合內 → `AUTH_SELECTION_TICKET_INVALID`（`AC-M19`～`AC-M23`）。
  - **姓名不一致**（＝真正的共用信箱）→ **維持既有拒登**：回 `AUTH_ACCOUNT_NOT_FOUND`（沿用既有「不可列舉」處置、**不新增對外可區分之狀態**），並於伺服器日誌以 WARN 記錄共用信箱告警（`AC-M8`）。此為刻意之 fail-closed——共用信箱持有者若能任選帳號登入即為權限提升。
  - **所選帳號於兌換時已被停用** → `AUTH_ACCOUNT_DISABLED`，且**不得**自動改選集合中其他帳號（`AC-M24`）。
  - 上述任一失敗呈現皆受 `AC-E13` 之封閉允許集拘束（`AC-M26`）。
- **帳密錯誤/帳號不存在**：一律回相同 `AUTH_INVALID_CREDENTIALS`，不洩漏帳號是否存在。

### 訊息揭露原則

- 所有登入失敗之使用者可見訊息**不得洩漏可列舉資訊**，包含但不限於：某 email 是否存在於系統、該帳號是否啟用、比對在哪一階段失敗、token 中哪一項檢查未通過。詳細判別資訊僅寫入伺服器端失敗日誌供稽核。
- **登入失敗鎖定**：定案本輪不做（OQ-E01-02）。

## 手動帳號基本資料（姓名／公司／部門／職位） {#account-profile}

> 對應 [F003](features/F003-account-role-management.md) 之 2026-08-14 delta（`AC-P1`～`AC-P22`）。**新增 3 個錯誤碼**（`ACCOUNT_COMPANY_CODE_INVALID`／`ACCOUNT_ORG_CODE_INVALID`／`ACCOUNT_JOB_TITLE_INVALID`），必填與長度沿用既有 `VALIDATION_ERROR`、上游唯讀沿用既有 `ACCOUNT_UPSTREAM_READONLY`。

- **輸入正規化（先於一切驗證）**：`name`／`companyCode`／`orgCode`／`jobTitleCode` 一律 trim；`orgCode`／`jobTitleCode` 於 trim 後為空字串、純空白或未提供者收斂為 `null`（**空字串不得落地**，比照 [#lifecycle-subcategory](#lifecycle-subcategory) 之 `normalizeSubcategory`）。
- **驗證順序（固定，先後不可調換；同時違反多項時僅回序位最前者）**：① `VALIDATION_ERROR`（必填缺漏／長度超限，400）→ ② `ROLE_INVALID`（400）→ ③ `ACCOUNT_COMPANY_CODE_INVALID`（400）→ ④ `ACCOUNT_ORG_CODE_INVALID`（400）→ ⑤ `ACCOUNT_JOB_TITLE_INVALID`（400）→ ⑥ `ACCOUNT_JOB_POSITION_INVALID`（400）→ ⑦ `ACCOUNT_USERNAME_EXISTS`（409）。③④⑤ 係插入於既有 ②⑦ 之間、⑥ 係於 2026-08-31 插入於 ⑤ 之後（`AC-P30`），既有各項之相對順序皆不變。
- **`VALIDATION_ERROR`（400）**：`loginId`／`password`／`roleCode`／`name` 任一缺漏或 trim 後為空；或 trim 後長度 `name` > 30、`companyCode` > 10、`orgCode` > 10、`jobTitleCode` > 10。**不建立／不更動任何帳號記錄**。刻意不細分為 `ACCOUNT_NAME_REQUIRED` 等專屬碼——維持本端點單一之「必填缺漏」語意，欄位層提示屬前端責任。
- **`ACCOUNT_COMPANY_CODE_INVALID`（400）**（🔵 **2026-08-14 語意放寬**，使用者裁定公司別可跨公司選擇）：payload 之 `companyCode` **不存在於 `SELECTABLE_COMPANIES`**（＝`COMPANY_FULL_NAMES` 之鍵集合，見 [F003](features/F003-account-role-management.md) `AC-P15`）。建立與編輯皆適用；未提供時採操作者 session 之公司（建立）或維持現值（編輯），非錯誤。**跨公司本身不再是錯誤**。<br>📝 已被取代之舊語意（「≠ 操作者所屬公司即拒絕」）保留於此供追溯：其理由為 `companyCode` 為 `(companyCode, loginId)` 唯一鍵之一半且為清單租戶過濾鍵；使用者已知悉此代價仍裁定放寬，代價之處置見 [F003](features/F003-account-role-management.md) `AC-P23`～`AC-P27`。
- **`ACCOUNT_USERNAME_EXISTS`（409）之範圍擴大**：手動帳號建立之 `loginId` 唯一性檢查由「所選公司內」擴為 **全部公司**（[F003](features/F003-account-role-management.md) `AC-P24`）；編輯變更公司致 `(companyCode, loginId)` 與他筆碰撞亦回本碼（`AC-P10a`）。**錯誤碼與 HTTP 狀態不變**，僅比對範圍擴大（為既有行為之嚴格超集）。
- **變更公司時未一併給定 `orgCode`／`jobTitleCode`（400 `VALIDATION_ERROR`）**：公司一變更，舊部門／職位代碼必然失效（其有效性以 `companyCode` 為範圍）。兩者須於同一請求明確出現（合法代碼或 `null`），否則拒絕整筆；**嚴禁靜默沿用舊值**（會於 DB 留下跨公司髒代碼，使部門／職位解析永久錯位）。見 [F003](features/F003-account-role-management.md) `AC-P10b`。
- **跨公司帳號之登入解析**：見 [F001](features/F001-auth-login-session.md) `AC-C1`～`AC-C3`——拒絕一律沿用 `AUTH_INVALID_CREDENTIALS`（含「`loginId` 跨公司命中多筆」之資料異常情境，不任選一筆、不洩漏原因），**不新增錯誤碼**。
- **`ACCOUNT_ORG_CODE_INVALID`（400）**：`orgCode` 非 `null` 但查無 `ORG_UNIT` 同時滿足「`orgCode` 相等」且「`companyCode` 等於該帳號之公司」。⚠ **刻意不檢查 `isActive`**——下拉候選雖僅列 active，但既有帳號之部門可能於組織同步後停用，若寫入端強制 active 將使該帳號連姓名都無法儲存。
- **`ACCOUNT_JOB_TITLE_INVALID`（400）**：`jobTitleCode`（畫面「資位」）非 `null` 但查無 `JOB_TITLE` 之 `(companyCode, code)` 精確相等列。⚠ 寫入驗證**不採**顯示端之兩段式跨公司 fallback（[data-model.md#job-title-entity](data-model.md#job-title-entity)）；不對稱之追溯見 [open-questions.md](open-questions.md) `OQ-E01-08`。
- **`ACCOUNT_JOB_POSITION_INVALID`（400）**：`jobPositionCode`（畫面「職位」）非 `null` 但查無 `JOB_POSITION` 之 `(companyCode, code)` 精確相等列。⚠ 此處**不存在**上一條那種不對稱——職位之顯示端與寫入端皆為單段精確解析（同代碼跨公司語意可相反，見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md) §5.4.2）。
- **`ACCOUNT_UPSTREAM_READONLY`（403）**：`source='upstream'` 之帳號，其 `name`／`password`／`orgCode`／`jobTitleCode` 一律不可經 `PATCH /admin/accounts/:id` 變更（**含明確傳 `null` 之清空意圖**）；本檢查**先於**一切值驗證，且**不寫入任何欄位**（非部分更新）。角色指派與啟用狀態不受此限（`OQ-E01-03` 定案）。
- **不涉稽核**：建立／編輯手動帳號**不寫入 `AUDIT_LOG`**（`targetType` 列舉無 `ACCOUNT`），見 [F003](features/F003-account-role-management.md) `AC-P21`。

## Session 逾時 {#session}

- 閒置超過 30 分鐘後之下一次操作回 `AUTH_SESSION_EXPIRED`，導回登入頁。
- 手動登出/帳號被停用：token 立即撤銷，後續任何請求以 401 拒絕。
- 補償：操作中（30 分內持續互動）不得中途登出。

## 同步失敗與互斥 {#sync}

- **來源不可連線/逾時/格式異常**：中止本次同步、**保留同步前既有資料不變**、寫 `failed` 紀錄與錯誤訊息（F004 AC3）。
- **重試**：自動重試（草案 3 次、間隔遞增），最終失敗通知系統管理員（[NFR-006](nfr.md#integration)；通知管道為 open-questions）。
- **交易性**：同步之組織＋帳號寫入於**單一交易**內套用；中途失敗**整批回滾**、寫 `failed` 紀錄（`SYNC_WRITE_FAILED`，本地寫入/交易失敗，與來源不可用 `SYNC_SOURCE_UNAVAILABLE` 區分），不得處於部分更新之不一致狀態（F004 Postconditions／AC3）。
- **互斥**：已有同步進行中時，再次觸發回 `SYNC_IN_PROGRESS`，不啟動第二個並行程序。
- **消失筆數保護**：在職帳號自來源消失之比例超過閾值（草案 5%）→ 中止同步、**不執行任何停用**、記 `failed`＋`DISAPPEARED_RATIO_EXCEEDED`、告警系統管理員（F004 Edge Cases，防上游 INNER JOIN 靜默吞人導致誤停用）。
- **髒資料**：單筆型別不符時中止該筆寫入並記警告，不影響其他正常筆數。上游日期值（如哨兵 `9999-12-31`／異常值）於寫入前正規化：哨兵與不可儲存值轉 null。

## 循環與 DAG {#dag}

- **刪除保護（OQ-E03-03 定案）**：仍有文件掛載之循環回 `LIFECYCLE_HAS_DOCUMENTS`（409），語意＝**需先解除全部文件掛載才能刪除**（非「永不可刪」）；清空掛載後即可刪除（含其節點/連線）。**停用（inactive）不受此限制**，可隨時執行（F007）。
- **成環**：`DAG_SELF_LOOP`（自我連線）與 `DAG_CYCLE_DETECTED`（直接/間接成環）皆於**後端交易內權威驗證**，即使前端已預覽亦以後端為準（F008）。
- **刪除節點**：連動移除相關邊；若節點已掛載文件，提示掛載關係將被移除並要求確認。

## 循環子分類（唯一性與選取有效性） {#lifecycle-subcategory}

> **🟢 APPROVED（2026-08-07 人類閘門通過，含 4 項裁決）**。對應 [F040](features/F040-lifecycle-subcategory.md)（循環子分類）。循環之業務身分＝`(name, subcategory)` 組合；`subcategory` 非必填，無值時恆為 `null`。

- **輸入正規化（先於一切驗證）**：`name` 與 `subcategory` 一律 trim；`subcategory` 於 trim 後為空字串、純空白或未提供者，一律收斂為 `null`（`normalizeSubcategory`）。**空字串不得落地**（[data-model.md INV-3](data-model.md#lifecycle-uniqueness)）。
- **驗證順序（固定，先後不可調換）**：① `LIFECYCLE_NAME_REQUIRED`（名稱 trim 後為空，400）→ ② `LIFECYCLE_DUPLICATE`（INV-1，409）→ ③ `LIFECYCLE_SUBCATEGORY_CONFLICT`（INV-2，409）。名稱為空時**不得**先回任何唯一性錯誤（F040 AC-14）。
- **`LIFECYCLE_DUPLICATE`（409）**：`(name, subcategory)` 組合已存在。`subcategory = null` 之「無子分類」亦視為單一具體值參與比對（同名之無子分類列至多一筆）。**比對範圍涵蓋全部列、不分 `status`**（停用之循環仍參與比對；**已定案 ✅** 2026-08-07 使用者裁定，OQ-E03-10）；**編輯時排除自身列**（維持原值不視為衝突，比照 [#document](#document) 之編號唯一性慣例）。並發下以 DB 唯一索引（MSSQL 視多個 NULL 為相等，恰符本語意）＋應用層驗證雙保險，僅一筆成功、另一筆回本碼。
- **`LIFECYCLE_SUBCATEGORY_CONFLICT`（409）**：違反 INV-2——同一名稱之「無子分類」列與「有子分類」列將並存。**雙向皆適用**：① 已存在 `A(無子分類)` 時新增／改成 `A(甲)`；② 已存在 `A(甲)` 時新增／改成 `A(無子分類)`。訊息須提示「請先處理既有該筆」（更名、補子分類或刪除），**不得**自動更動既有列。此不變式使「有子分類就必須選子分類」不自相矛盾。
- **`LIFECYCLE_SUBCATEGORY_REQUIRED`（400，人類閘門 2026-08-07 裁決 1 已收斂）**：**後端唯一觸發情境**＝文件建立／編輯（[F010](features/F010-create-document.md)／[F011](features/F011-edit-with-comparison.md)）payload **帶有** `lifecycleId`，但該列在其名稱下**非合法唯一解**——判定式：所指列 `subcategory = null` **且**池中存在同 `name`、`subcategory ≠ null` 之其他列（過渡期違反 INV-2 之髒資料）。**不產生／不更動任何文件記錄**。
  - **`lifecycleId` 缺漏（`null`／空字串／未帶）之情形歸 [`DOCUMENT_REQUIRED_FIELD_MISSING`](#document)，不在本碼範圍**——既有 [F010](features/F010-create-document.md) 行為，本次**不變更**。
  - **本次不新增 `lifecycleName` payload 欄位**：建立／編輯之「所屬循環」在 API 契約中恆僅 `lifecycleId` 一欄；名稱→子分類之兩段式選取純屬**前端 UI 狀態**，送出前已解析為單一 `lifecycleId`，故「payload 只帶名稱層」在後端非可達之請求形狀。
  - **前端**仍以純函式 `resolveLifecycleSelection` 於「僅選名稱層」時回本碼並阻擋送出（[F040](features/F040-lifecycle-subcategory.md) AC-21，行為不變）；後端之上述權威再驗獨立於前端，不可僅信任前端。
- **名稱底下無子分類時不得誤擋**：該名稱僅有一筆 `subcategory = null` 之列時，只選名稱即為完整選取，**不要求**亦不呈現子分類層（向後相容，F040 AC-23／AC-33）。
- **顯示一致性**：錯誤訊息、清單、下拉、標題與快照中之循環名稱一律使用 `lifecycleDisplayName`（有子分類 → `名稱（子分類）`，全形括號無空白；無 → `名稱`），避免使用者無法分辨衝突對象。
- **不影響文件編號**：子分類**不參與** ICSOP 文件編號第 2 段之循環代碼推導；本節任何錯誤情境皆不觸發編號重算（見 [#document](#document)）。

## 節點掛載/改派 {#node-assign}

- **候選過濾**：後端以 `lifecycleId` 過濾，非同循環文件不出現（不可僅靠前端過濾）。
- **重複掛載**：目標文件已屬其他節點時回 `NODE_DOC_ALREADY_ASSIGNED`（附原節點名稱），須**二次確認**方可改派。
- **改派原子性**：於同一交易內「解除原節點掛載 + 綁定新節點」，避免中間態；並發改派以樂觀鎖/序列化避免競爭（F009）。

## 文件 CRUD 與唯一性 {#document}

- **必填缺漏**：`DOCUMENT_REQUIRED_FIELD_MISSING`（建立時 4 項核心必填：所屬循環／循環別、文件狀態、文件編號、文件名稱），不產生記錄。
- **編號唯一（OQ-E04-01b 定案）**：建立與編輯皆檢查；編輯時**排除自身**（維持原值不視為衝突）。**比對範圍＝狀態「有效」＋「作廢」**；**「失效」文件之編號視為已釋出、不參與比對、可被重用**。並發下以 DB 唯一性保護 + 應用層驗證雙保險，僅一筆成功、另一筆回 `DOCUMENT_NUMBER_DUPLICATE`（F013）。**狀態切回「有效」時需重驗唯一性**（原編號可能已被重用），衝突則阻擋切換（F012）。<br>※ 因唯一性僅限部分狀態，DB 層不可用單純全表 UNIQUE，需**條件式/篩選索引**（`WHERE status IN ('有效','作廢')`）或等效機制，實作方式由 system-architect 定。
- **狀態切換競態**：連續快速切換以最後一次送出為準，無不一致（F012）。
- **取消編輯**：不影響原資料，欄位回編輯前值。

## 附件與檔案存取 {#file}

- **格式不符**：`FILE_FORMAT_NOT_ALLOWED`，附允許格式清單，不建立任何關聯。
- **超過大小上限**：`FILE_SIZE_EXCEEDED`（上限值為 open-questions）。
- **覆蓋上傳**：ICSOP PDF / OJT 重新上傳覆蓋舊檔，舊檔不再可經文件記錄存取。
- **未授權存取**：以直接 Blob URL 存取回 `FILE_ACCESS_DENIED`；一律經後端核發短效期憑證。
- **移除表單**：需二次確認以避免誤刪（F018）。
- **覆蓋共用表單（OQ-E05-05）**：更新被 ≥1 份其他文件引用之表單時，回 `USAGE_FORM_OVERWRITE_SHARED`（409，需二次確認，附引用文件數 N）；確認後覆蓋、舊檔不再可存取、不保留歷史版本；取消則原檔不變。僅當前文件引用或無其他引用時免跨文件警示（F018）。<br>⚠ 本段散文之「≥1」與 [US-042](../stories/epics/E05-usage-form/US-042-usage-form-pool-management.md) AC6／實作常數 `SHARED_OVERWRITE_MIN_REFS = 2` 不一致，見 [open-questions.md](open-questions.md) OQ-E10-04（**附錄 F039 一律以 ≥2 為準**）。

## 附錄（附錄池與文件關聯） {#appendix}

> 對應 [F039](features/F039-appendix-management.md)（E10 / US-100、US-101、US-102）。格式／大小／未授權存取沿用 [#file](#file) 之共用規則（類別 `APPENDIX` ＝ xlsx／xls／pdf、單檔 ≤ 50MB）。

- **名稱長度**：`name` 於 **trim 後**量測，> 400 字元回 `APPENDIX_NAME_TOO_LONG`（400）；未提供／空白時 fallback 採原始檔名，**fallback 值亦受同一長度檢查**。
- **驗證優先序（定案）**：覆蓋上傳一律**先驗格式／大小，後判引用數**——格式或大小不合法時回 `FILE_FORMAT_NOT_ALLOWED`／`FILE_SIZE_EXCEEDED`（400），**不得**先回 `APPENDIX_OVERWRITE_SHARED`。
- **覆蓋共用附錄**：關聯文件數 **N ≥ 2** 且未二次確認 → `APPENDIX_OVERWRITE_SHARED`（409，訊息含 N），**不寫入任何 blob 或記錄**；確認後覆蓋、舊 blob 回收且不再可經任何引用文件存取、不保留歷史版本；取消則原檔與全部關聯（含 `sortOrder`）不變。**N ≤ 1（0 或 1）時直接覆蓋，不出現跨文件警示**。
- **移除附錄**：關聯文件數 **N ≥ 1** 且未二次確認 → `APPENDIX_IN_USE`（409，訊息含 N）；確認後一併解除全部關聯＋刪除池記錄＋回收 blob。N＝0 時直接移除（二次確認屬前端 UI 責任）。
- **找不到附錄**：關聯／覆蓋／移除／下載時 `appendixId` 不存在 → `APPENDIX_NOT_FOUND`（404）。
- **關聯排序之錯誤面**：關聯清單含重複 `appendixId` 時去重處理（非錯誤）；解除關聯後剩餘列重新編號為連續 1..N，不得留下順位缺口。
- **未授權存取**：未登入或無權限者組合下載網址 → `FILE_ACCESS_DENIED`（403），**不核發短效期憑證、不寫稽核**。
- **權限層**：無「附錄管理」功能權限之角色（Supervisor／DeptContact／User）呼叫後台端點 → `PERMISSION_DENIED`（403，路由層）；SysAdmin 之寫入類動作 → `FIELD_WRITE_FORBIDDEN`（403，欄位層），與 F018 守門鏈一致。
- **稽核**：前台下載成功須寫入 `targetType=APPENDIX`／`actionType=DOWNLOAD`；寫入暫時失敗**不阻斷下載**，進補償佇列重試（見 [#audit](#audit)）。

## 使用表單編號（唯一性與長度） {#usage-form-number}

> 對應 [F018 §表單編號 delta](features/F018-usage-form-management.md#form-number-delta)（2026-08-16 使用者裁決，OQ-D18-22）。欄位定義見 [data-model.md#usage-form-entity](data-model.md#usage-form-entity)。**本段僅適用使用表單；`APPENDIX_POOL` 無編號欄**（OQ-D18-23）。

- **輸入正規化（先於一切驗證）**：`formNumber` 一律 trim；trim 後為空字串、純空白或未提供者**收斂為 `null`**（**空字串不得落地**，比照 [#lifecycle-subcategory](#lifecycle-subcategory) 之 `normalizeSubcategory` 與 [#account-profile](#account-profile) 之既有慣例）。
- **驗證順序（固定，先後不可調換；同時違反多項時僅回序位最前者）**：① `FILE_FORMAT_NOT_ALLOWED`／`FILE_SIZE_EXCEEDED`（400，沿用 [#file](#file) 之既有優先序）→ ② `USAGE_FORM_NAME_TOO_LONG`（400）→ ③ `USAGE_FORM_NUMBER_TOO_LONG`（400）→ ④ `USAGE_FORM_NUMBER_DUPLICATE`（409）。**格式／大小驗證恆優先於任何唯一性判斷**（比照 [#appendix](#appendix) 之既有定案）。
- **`USAGE_FORM_NUMBER_TOO_LONG`（400）**：`formNumber` trim 後長度 > 100 字元；**不建立／不更動任何記錄、不寫 blob**。恰 100 字元通過。
- **`USAGE_FORM_NUMBER_DUPLICATE`（409）**：`formNumber`（非 `null`）與池中他筆之 trim 後、**不分大小寫**之值相等。**編輯時排除自身列**（維持原值不視為衝突，比照 [#document](#document) 之編號唯一性慣例）。`null` 值**不參與比對**，多筆空編號可並存。
- **編輯情境之比對範圍（2026-08-16 追加裁決後之明確化）**：本段之驗證同時適用**上傳建立**與 **[F018](features/F018-usage-form-management.md#edit-number-action)「編輯編號」動作**兩條寫入路徑。編輯路徑之比對式為「池中**其他列**（`id ≠ 本列 id`）之 `formNumber` 正規化後是否與送出值相等」——**必須排除自身列**，否則使用者無法對同一筆重複送出相同編號（例如點兩次儲存、或只改大小寫後又改回）。
  - **清空（設回 `null`）為合法操作**，**不觸發本碼亦不觸發任何比對**（`null` 不參與唯一性）。
  - **「編輯編號」不得觸發 `USAGE_FORM_OVERWRITE_SHARED`**——該碼專屬於**覆蓋上傳**（換檔）路徑；編號更新不碰檔案、與引用數無關（[F018](features/F018-usage-form-management.md#edit-number-action) `AC-D20`）。
  - **權限錯誤沿用既有碼、不新增**：SysAdmin → `FIELD_WRITE_FORBIDDEN`（403，欄位層）；Supervisor／DeptContact／User → `PERMISSION_DENIED`（403，路由層）。
- **並發保護**：以 DB **filtered unique index（`WHERE formNumber IS NOT NULL`）** ＋應用層驗證雙保險，僅一筆成功、另一筆回本碼。⚠ **不可用單純全表 UNIQUE**——MSSQL 視多個 `NULL` 為相等，會誤擋第二筆空編號。
- **覆蓋上傳不觸發本段**：換檔（`PUT`）**不改變 `formNumber`**，故不重驗唯一性（比照「覆蓋不改名稱」之既有語意）。改編號須走**編號專用端點**（[F018 §Interface Contract](features/F018-usage-form-management.md#interface-contract)），不得夾帶於覆蓋上傳。

## 匯出（CSV） {#export}

> 對應 2026-08-16 使用者裁決之三處匯出：[F039 附錄池](features/F039-appendix-management.md#export-delta)（缺失 delta 第 14 項）、[F037 ICSOP 程序書變更歷程](features/F037-document-change-history.md#export-delta) 與 [F038 循環樹狀圖變更歷程](features/F038-lifecycle-tree-change-history.md#export-delta)（第 16 項）。三處**共用同一組規則與同一錯誤碼**，不得各自為政。
> 🟢 **v1.8（2026-08-18 人類閘門裁決，`OQ-D18-26` 採選項 (a)）：本節之適用範圍擴為四處——新增 [F024 文件調閱歷程](features/F024-access-history-query.md#export-fix-delta)（`AC-F1`～`AC-F19`）。** 下方原「⚠ 範圍紀律：F024 不在本次範圍」之排除語句**已失效**（見該項之更新註記）。**本次不新增任何錯誤碼、不改動本節任何既有規則**——F024 向既有共用規則對齊，而非反過來。<br>⚠ **F024 有兩處刻意偏離「CSV 值＝畫面所見逐字」之不變式，均經人類認可、已於其 AC 明文載明「刻意不同、非疏漏」**：① 「操作類型」欄畫面為複合格式 `VIEW · 檢視`、CSV **只出中文標籤**（遵守本節之值層通則，通則優先於逐字比照畫面，`AC-F5` ②）；② 畫面顯示 `—` 之空值欄，CSV 輸出**空儲存格**（`—` 為視覺佔位符而非資料，`AC-F15` ③）。
> 🔵 **v1.9（2026-08-31 使用者裁決）：本節之適用範圍再擴為五處——新增 [F017 後台文件清單](features/F017-backend-document-list.md#export-delta)（`AC-X1`～`AC-X17`）。** 使用者原文「ICSOP 文件管理：比照使用表單管理/附錄管理，新增匯出功能。」**本次不新增任何錯誤碼、不改動本節任何既有規則**——F017 向既有共用規則對齊，而非反過來；**既有四處之規則、逐字文案與錯誤碼一字不改**。乙案之請求 body 雖帶入外部可構造之結構化輸入，其驗證失敗**沿用既有 `VALIDATION_ERROR`**（見下方「匯出請求 body 之驗證」條目）。<br>📝 **本段曾於同日短暫改為「恰新增一個錯誤碼 `EXPORT_IDS_INVALID`」，已由 lead 撤回並復原**（逐字保留供追溯）——撤回理由＝該新增碼與 [F017](features/F017-backend-document-list.md#export-delta) `AC-X16` ⑨「不新增任何錯誤碼」相衝，而 `VALIDATION_ERROR` 既有且語意吻合，**無需為此開例外**。<br>📝 **就地更正一處計數**：上方 2026-08-16 之引言仍寫「三處」，而 v1.8 已將 F024 納入為第四處 ⇒ **本次新增者為第五處**（原引言之「三處」為當時之事實，逐字保留供追溯、不改寫）。<br>⚠ **F017 有一處刻意偏離「CSV 值＝畫面所見逐字」之不變式，已於其 AC 明文載明「刻意不同、非疏漏」**：畫面之「當責室長 +N」徽章（次要室長姓名僅在 tooltip）於 CSV **展開為主要∪次要之完整清單**，理由＝匯出為存查用途（[F017](features/F017-backend-document-list.md#export-delta) `AC-X1` ⑤ (b)／`AC-X5`）。<br>⚠ **另有一處與 [F039](features/F039-appendix-management.md#export-delta) `AC-D13` ③ 之刻意差異**：F017 之 `公告日期` 欄維持 **`YYYY-MM-DD`（不附時分秒）**——該欄為**日期欄**而非時間戳欄（粒度即為日），畫面本身亦只呈現日期，補上 `00:00:00` 等於憑空捏造精確度；本節「時間戳欄一律 `YYYY-MM-DD HH:mm:ss`」之通則**對本欄不適用、亦未被修改**（[F017](features/F017-backend-document-list.md#export-delta) `AC-X8`）。<br>🔴 **F017 為本節五處中唯一之「客端篩選」頁**——其 13 項篩選全部在瀏覽器端施加、前後端之篩選語言不同構（顯示名稱 vs id／代碼）、其中兩項（`公告日期` 區間、`程序書書名內` contains）後端根本無對應參數、另三項（`連結點程序書`／`附錄`／`使用表單`）於前端是「先取 id 集合再交集」。⇒ **本節「匯出範圍＝符合當前篩選／查詢條件之全部結果、列序與畫面當前排序一致」之語意逐字不變且仍為 F017 之唯一約束**，惟**該範圍以何種請求形狀攜帶屬架構裁決、不入本節**（✅ `OQ-X-01` 已於 2026-08-31 定案＝**`POST /admin/documents/export`，body 恰兩鍵（文件 id 清單 ＋ 選填之連結點命中值），後端完全不重跑任何篩選與排序**；權威＝architecture-spec §13。四項查證事實見 [F017](features/F017-backend-document-list.md#export-delta) `AC-X11`）。<br>⚠ **本節之「上限檢查」對 F017 之落點與其餘四處不同、語意相同**：其餘四處於**篩選後**檢查 `rows.length`，F017 於**後端、id 清單長度、任何 DB 查詢之前**檢查（在該形狀下該長度**即是**符合條件之筆數）。🔒 **不得有第二處檢查；前端得顯示事前提示，但不得因此擋下請求或 `disabled` 匯出鈕**——提示與檢查一旦合流，後端之錯誤路徑就再也跑不到（[F017](features/F017-backend-document-list.md#export-delta) `AC-X12`）。<br>⚠ **其餘四處之「帶入與清單查詢相同之篩選參數」句式（如 [F018](features/F018-usage-form-management.md#name-and-export-column-delta) `AC-X7`）不得逐字套用於 F017**——那四頁之篩選由後端施加，F017 不是；照抄會產生端到端不可達之規格。<br>🔴 **F017 之可匯出角色集合與其餘四處不同**：其功能列（`ICSOP 文件管理`）對 **SysAdmin／Supervisor／DeptContact 皆為唯讀** ⇒ 四種角色（含 ICSOPAdmin）皆可匯出，僅 **User** 回 403；此為 [F025](features/F025-role-function-matrix.md) 矩陣既有列值之結果，**非本節之權限規則有變**（本節「唯讀角色允許匯出」逐字不變）。

- **`EXPORT_ROW_LIMIT_EXCEEDED`（400）**：符合當前篩選／查詢條件之筆數 **> 10,000** 時回本碼，訊息含上限值並提示縮小條件，**不產生任何檔案、不回傳部分結果**。**恰 10,000 筆通過**（邊界值含）。
  - **🔴 使用者可見呈現載體（2026-08-16 補訂）**：本碼之拒絕**必須以使用者可見之錯誤回饋呈現**（toast 或等效之 alert 區塊，`role="alert"` 或等效可存取角色）。其**逐字訊息由各 feature 定義**（[F037](features/F037-document-change-history.md#export-delta) `AC-D10`／[F038](features/F038-lifecycle-tree-change-history.md#export-delta) `AC-D6`／[F039](features/F039-appendix-management.md#export-delta) `AC-D12`／**[F024](features/F024-access-history-query.md#export-fix-delta) `AC-F9` ②（2026-08-18 新增）**／**[F017](features/F017-backend-document-list.md#export-delta) `AC-X14`（2026-08-31 新增）**）。
  - **兩段式斷言（因 `ToastApi` 現無 code 參數）**：① **訊息逐字**出現於畫面；② 字串 **`EXPORT_ROW_LIMIT_EXCEEDED`** 出現於**同一個回饋容器內**。**達成方式不拘**——可為 `ToastApi` 新增 code 欄位，亦可直接把碼串接於訊息尾端（如 `…請縮小查詢條件（EXPORT_ROW_LIMIT_EXCEEDED）`）；**規格不指定實作，只要求兩者同時可見**。<br>📝 理由：錯誤碼是使用者回報問題時唯一可靠之定位資訊（本 repo 既有慣例，見 [F019](features/F019-public-list-browsing.md) `AC-U8` 之 `DOCUMENT_NOT_FOUND · 404` 錯誤碼列與 [F024](features/F024-access-history-query.md) 無權限畫面）；但要求特定元件形狀會過度綁死實作。
- **匯出請求 body 之驗證（2026-08-31，僅 [F017](features/F017-backend-document-list.md#export-delta) 適用）＝沿用既有 `VALIDATION_ERROR`（400），🔴 本節不新增任何錯誤碼**：`documentIds` **缺席／非陣列／任一成員非字串** → **400 `VALIDATION_ERROR`**，**整批拒絕**、**不產生任何檔案、不執行任何 DB 查詢**（`AC-X17` ①）。<br>📝 **成員層之處置曾一度定為「以 `typeof === 'string'` 過濾、不整批拒絕」，已由 lead 於同日否決**（逐字保留供追溯）——被過濾之成員會使 CSV 列數變短，而該現象與「該文件已被刪除」之靜默略過**在輸出上無從區辨**，與缺席／非陣列所要防的是**同一種**靜默失敗。
  - 📝 **被撤回之表述逐字保留供追溯**：`OLD>` 「**`EXPORT_IDS_INVALID`（400）— 🆕 2026-08-31 新增**：匯出請求之文件 id 清單鍵缺席／非陣列／成員非字串時回本碼…🔴 **必須有明確代碼、不得回泛用 400**」。<br>**撤回理由**：新增錯誤碼與 [F017](features/F017-backend-document-list.md#export-delta) `AC-X16` ⑨「不新增任何錯誤碼」相衝，而該鎖**無需為此開例外**——`VALIDATION_ERROR` 為**既有實作常數**且語意完全吻合（「請求 body 不合法」），`DocumentsController.setStatus()` 已在同一個 controller 內以 `throw new BadRequestException('VALIDATION_ERROR')` 使用之。⇒ **零新增碼、零 AC 例外，且錯誤仍可定位。**
  - 🔴 **同時被否決者為架構初稿之「視同空陣列 → 200 ＋ 僅表頭列」**（lead 2026-08-31 裁決）：畸形 body 會退化成一份**看似成功**的僅表頭 CSV，使用者沒有任何訊號說它是壞的——「請求壞掉」與「0 筆符合」產生**逐位元組相同**之輸出，無測試可區分、無定位資訊。此為本 repo 反覆付出代價之**靜默失敗**形狀。
  - 🔴 **檢查順序：本項先於 `EXPORT_ROW_LIMIT_EXCEEDED`**。顛倒會對非陣列輸入取 `.length` 而得 `undefined`，比較恆為偽 ⇒ **驗證靜默通過**。
  - 🔒 **僅適用於「以請求 body 攜帶文件 id 清單」之匯出**（現況只有 F017 走此形狀）；**其餘四處匯出之參數形狀未變、不適用本項、其錯誤碼集合一字不改**。
- **匯出範圍**：一律為「符合**當前篩選／查詢條件之全部結果**」，**非**當前分頁之結果；列序與畫面當前排序一致。
- **編碼**：CSV 以 **UTF-8 with BOM（`EF BB BF`）** 輸出。⚠ **BOM 缺失是 Excel 開啟中文亂碼之經典成因**；此與 [F020](features/F020-watermark.md) 之 PDF 燒錄 CJK 字型亂碼（根因＝`backend/Dockerfile` 未 COPY `assets/`）是**兩件不同的事**，不得混為一談。
- **逸出**：欄值含 `,`／`"`／換行時以雙引號包覆，內部 `"` 逸出為 `""`（RFC 4180）。
- **行終止符（2026-08-16 補訂）**：資料列與表頭列之終止符一律為 **CRLF（`\r\n`）**，含**最末一列亦以 CRLF 結尾**。理由：RFC 4180 明訂 CRLF，且 Excel 於部分地區設定下對純 LF 之解析不穩定。⚠ 本項與 [#usage-form-number](#usage-form-number) 無關；注入防護所偵測之 CR（`\r`）指的是**儲存格值本身以 CR 開頭**，與列終止符是兩回事。
- **🔴 值層之通則（2026-08-16 補訂；**2026-08-18 起四處**匯出一體適用）**：
  - **列舉／代碼欄一律輸出「畫面所見之中文標籤」，不得輸出屬性名或列舉代碼**（例：`documentName` → `程序書書名`；`NODE_ADDED` → `新增節點`）。理由：匯出檔之讀者是人，屬性名對其無意義；且各 feature 之匯出 AC 已定「欄位＝畫面所見」，**值層理應一致**。
  - **對照表必須只有一份**：中文標籤之對照表為**單一權威**，前端畫面與後端 CSV **不得各存一份**。⚠ 現況該對照表只存在於前端 ⇒ 須搬至後端（或抽為前後端共用之單一模組）；**落點由 system-architect 定**（建議與 `csv-export.ts` 同層之 domain 純模組，或由查詢端點直接回傳已解析之 label 供前端直接顯示）——⚠ **本句非過時佔位字**：F024 之落點已於 2026-08-18 定案（見本項末之 ✅），**F037／F038／F039 三處則仍待定**，故本句對那三處持續有效。**可觀測不變式（各 feature AC 之斷言標的）＝「CSV 該儲存格之值，與畫面同一列同一欄之可見文字逐字相同」。**<br>📝 **2026-08-16 lead 裁決之落地現實（規範文字未改，此為指向性註記）**：本 repo 前後端為**兩個獨立 TS 專案、無共用 package** ⇒ 「只有一份」在本輪**架構上不可達**，後端 `backend/src/change-history/change-labels.ts` 與前端 `frontend/src/pages/ChangeHistoryPage.tsx` 各持一份。**本輪之機器可驗約束改為「兩份逐字相同」**——沿用 [architecture-spec.md](architecture-spec.md) §10.14 對 `watermarkLines()` 之既有處置（兩份刻意各留、以同一組值綁定、以兩端逐字相同之不變式約束）。逐條斷言見 [F038](features/F038-lifecycle-tree-change-history.md#export-delta) `AC-D7` ④；決策追溯見 [open-questions.md](open-questions.md) `OQ-D18-34`。**「須搬至後端／抽為共用單一模組」之要求並未取消，僅延後**。<br>✅ **2026-08-18 已定案（architecture-spec v1.8 §10.18 決策 A16-2，[#a16-f024-export-decisions](architecture-spec.md#a16-f024-export-decisions)）**：[F024](features/F024-access-history-query.md#export-fix-delta) 之三張對照表落在 `backend/src/audit/access-history-labels.ts`（後端專屬純函式模組），沿用本段已述之「兩份逐字相同」既有處置，**不創新模式**。⚠ 本定案僅適用於 F024；F037／F038／F039 之 `change-labels.ts` 現狀不變，「搬至單一模組」之要求對那三處**仍屬延後**。
  - **時間戳欄一律為 `YYYY-MM-DD HH:mm:ss`（UTC+8）**，且**不附 `(UTC+8)` 字樣於每一格**。時區以與 `formatWatermarkTimestamp()` **完全相同之顯式 +8 位移**計算，**不得**使用 `toLocaleString` 或任何依賴行程 TZ 之格式化（行程 TZ 已釘死 UTC，該類寫法在容器與開發機各產生不同結果而兩邊測試都會綠）。<br>📝 **為何不在每格附 `(UTC+8)`**：① 各 feature 之表頭已逐字鎖定（`時間`／`上傳時間`）且下游約束環已依其建環，改表頭為 churn；② 每列重複同一標註無資訊量、且使值層斷言變脆；③ 全系統單一時區（`OQ-NFR007b`）。**若日後需標註，應改表頭而非改值。**
  - **數值格式化欄（如檔案大小）**：CSV 值 **＝ 畫面所見之同一格式化結果**，且**與畫面共用同一格式化函式**（不得後端另寫一份）。
- **空結果**：符合筆數為 0 時產生**僅含表頭列**之 CSV，**非錯誤、非空檔**。
- **檔名**：`{scope}_{YYYYMMDD}_{HHmmss}.csv`，時間為伺服器時間（UTC+8，沿用 OQ-NFR007b 之時區慣例）。
- **權限**：沿用各 feature 既有之功能閘門，**不新增功能矩陣列**；無權者回 `PERMISSION_DENIED`（403，路由層）。唯讀角色（SysAdmin）**允許匯出**（匯出屬讀取類動作）。
- **稽核**：F039 附錄池匯出**不寫稽核**（管理存取，比照後台下載）；**F018 表單池匯出與 F017 後台文件清單匯出（2026-08-31）同此——不寫稽核、`actionType`／`targetType` 列舉不新增任何值、[F023](features/F023-audit-logging.md)／[F024](features/F024-access-history-query.md) 不需 delta**（[F017](features/F017-backend-document-list.md#export-delta) `AC-X10`）；F037／F038 匯出**各記一筆既有之查詢類稽核**（`CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW`），**不新增 `actionType`**；寫入失敗不阻斷匯出，進補償佇列重試（見 [#audit](#audit)）。
  - 🔴 **F024（2026-08-18 新增之第四處）＝本節唯一新增 `actionType` 者**：記一筆 **`ACCESS_HISTORY_EXPORT`**（additive 列舉擴充，不改既有變體；`AUDIT_LOG.actionType` 為 `varchar(40)` 且無 CHECK ⇒ **不需 migration**）。**理由**：F037／F038 之所以能重用既有代碼，是因為那兩處之查詢對象本即有「查詢即記一筆」之既有義務可攀附；**F024 沒有**——其「查詢」動作目前完全不記稽核（既有缺口，登錄於 [open-questions.md](open-questions.md) `OQ-E07-12`，**2026-08-18 明確不修**）。逐條見 [F024](features/F024-access-history-query.md#export-fix-delta) `AC-F13`。<br>✅ **`targetType`／`targetId` 之落點已於 2026-08-18 定案（architecture-spec v1.8 §10.18 決策 A16-1，[#a16-f024-export-decisions](architecture-spec.md#a16-f024-export-decisions)）**：新增 `AuditTargetType='ACCESS_HISTORY'`，`targetId` 採**固定哨兵常數**（沿用 `ORG_CHANGE_ALERT` 之「無對映欄」既有模式，`buildAuditRow()` 不需改動任何既有程式碼）；`targetType`（`varchar(30)`）與 `actionType`（`varchar(40)`）皆無 CHECK 約束，**不需 migration**。
- **🔴 CSV 注入防護（2026-08-16 lead 裁定採用；system-architect 提出）**：任一儲存格之值，若其**第一個字元**為 `=`、`+`、`-`、`@`、Tab（`\t`）或 CR（`\r`），一律**先在該值最前面加一個半形單引號 `'`**（`=cmd|...` → `'=cmd|...`），**再**套用上述 RFC 4180 之引號包覆與逸出。順序不可顛倒。
  - **理由**：Excel／LibreOffice 會把 `=` 開頭之儲存格當公式執行（DDE 執行、`HYPERLINK` 資料外洩）。三處匯出之欄位含**使用者可控字串**（程序書書名、附錄名稱、變更歷程之舊值／新值），為**真實可達**之注入面。
  - **適用範圍**：僅適用**資料列之儲存格值**；**表頭列不適用**（表頭為本規格逐字固定之字面值，且無一以上述字元開頭）。
  - ⚠ **對「欄位＝畫面所見」逐字斷言之影響（下游 test-generator 必讀）**：加了前綴之儲存格，其 CSV 內之值**不再與畫面所見字串逐字相同**，兩者相差一個前導 `'`。故各 feature 之匯出 AC，其**值層**期望值一律為「**畫面所見字串經本規則轉換後之結果**」，**不得**直接以畫面原字串斷言。**表頭層之逐字斷言不受影響。** 值未以上述六種字元開頭時，轉換為恆等（無前綴），此為絕大多數案例。
- 🛑 **範圍紀律（2026-08-16 訂立，🔴 2026-08-18 由人類閘門正式解除）**：下列排除語句**自 2026-08-18 起失效**——`OQ-D18-26` 裁決採選項 (a)，F024 之匯出**已正式納入本節**（第四處），其 F024 鎖定條款由 [F024](features/F024-access-history-query.md#export-fix-delta) `AC-F17` 取代（F037 `AC-D8`／F039 `AC-D10` 兩檔已加註）。原條文保留供追溯——<br>⚠ ~~**範圍紀律**~~：[F024](features/F024-access-history-query.md) 之既有匯出**不在本次範圍**——**且其「匯出」實際上不產生任何檔案**（`GET /admin/access-history/export` 回傳 JSON `{rows,total}`，前端收到後直接丟棄、僅跳 toast；2026-08-16 由 system-architect 查證）。⇒ **本節之共用規則為淨新增、無既有樣板可對齊**；各 feature 原寫之「與 F024 同構」已一律改為「向本節對齊」。**不得**藉本 delta 改動 F024 之端點、參數或前端行為，**亦不得**為其缺口撰寫 AC——該缺口已如實登錄為 [open-questions.md](open-questions.md) `OQ-D18-26`。

## 權限（功能面 / 欄位面） {#permission}

- **功能面**：角色對功能為「無/唯讀」時，呼叫寫入型 API 回 `PERMISSION_DENIED`（403）。組織範圍限定須由**後端強制過濾**，不可信任前端傳入條件（F025）；**現行矩陣已無啟用之「本部門」範圍**（主管循環管理已放寬為全公司唯讀，OQ-E08-03 定案），範圍過濾機制保留備用。
- **欄位面**：唯讀欄位被寫入時回 `FIELD_WRITE_FORBIDDEN`（**非靜默忽略**業務欄位變更），該更新不得寫入；惟系統產生欄位（UUID）一律**忽略傳入值**而非報錯（F026）。<br>🔴 **2026-08-20 之唯一例外（`OQ-D9-19`／`OQ-D9-20`）**：欄位 **「OJT 簽到表」對主管（`Supervisor`）與部門窗口（`DeptContact`）為可寫** ⇒ 兩者之 OJT 上傳**不得**回 `FIELD_WRITE_FORBIDDEN`。**其餘 19 欄與另兩類附件（ICSOP PDF／使用表單）＋附錄對兩者仍為唯讀**，寫入一律回 `FIELD_WRITE_FORBIDDEN`（[F026](features/F026-role-field-matrix.md#ojt-write-exception-delta) `AC-N24`／`AC-N25`）。`SysAdmin`／`User` 不受本例外影響。
- **資料列面（🟢 APPROVED 2026-08-11）**：「業務」子分類之一般使用者對非其使用部門文件之存取，屬**資料列層級**之限縮，既非功能面亦非欄位面；其回應碼為 **404 `DOCUMENT_NOT_FOUND`（刻意隱藏存在性，非 403）**——本系統唯一之此類例外，不自動推廣至其他越權場景，見 [#dept-restriction](#dept-restriction)（F041）。

## 業務子分類之使用部門限縮（🟢 APPROVED 2026-08-11 人類閘門通過） {#dept-restriction}

> 對應 [F041](features/F041-user-subtype-business-scope.md)（E08 / [US-072](../stories/epics/E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md)、E06 / [US-057](../stories/epics/E06-public-browsing/US-057-business-user-dept-scoped-browsing.md)）。
> **本節不新增任何錯誤碼**——沿用既有 `DOCUMENT_NOT_FOUND`。

**適用對象**：`roleCode = 'User'` 且 `userSubtype = 'business'` 之使用者，存取使用部門與其不相符之已公告文件時（清單以外之路徑：詳情直連 URL、檢視器、PDF 代理、下載、列印）。

### ✅ 拒絕之回應碼：404 `DOCUMENT_NOT_FOUND`（`OQ-E06-03` → 選項 A，2026-08-11 定案）

- **一律回 404 `DOCUMENT_NOT_FOUND`**（既有錯誤碼），**不得**回 403 `PERMISSION_DENIED`。
- 理由：與本系統既有「非已公告文件對前台**視同不存在** → 404」之慣例一致（[F019](features/F019-public-list-browsing.md) 詳情路徑現行行為）；403 本身即透露「此文件確實存在、只是你無權」，屬**存在性洩漏**——使業務使用者得知某編號文件確實存在於系統中。
- ⚠ **已明確接受之代價（不得隱藏）**：這是本系統**第一個刻意隱藏資源存在性**之例外，與其餘越權一律回 403 之全域慣例（見 [#permission](#permission)）不一致。日後若被要求推廣至其他越權場景（如部門窗口對非其唯讀範圍之操作），需另案評估——**本次裁決僅限業務子分類之前台文件存取路徑，不自動推廣**。
- 📝 否決之選項 B（回 403，與 [F025](features/F025-role-function-matrix.md)／[F026](features/F026-role-field-matrix.md) 越權慣例一致、無特例）：其代價為洩漏「該編號之文件存在」此一事實（僅存在性、非內容）。保留於此供追溯。

**強制要求**：
- 回應**不得包含任何文件欄位**（`documentNumber`／`documentName`／`draftingDeptName`／`usingDeptNames`／`contentSummary` 等），亦不得回傳任何 PDF 位元組（[F041](features/F041-user-subtype-business-scope.md) AC-20／AC-25／AC-26）。
- 錯誤訊息文案**不得**因「文件不存在」與「文件存在但不在你部門」而不同——否則以文案差異即可還原存在性，架空本裁決之目的（[F041](features/F041-user-subtype-business-scope.md) AC-21）。
- **清單路徑不套用本節**——過濾屬正常查詢行為，回傳較少結果，**非錯誤**；空結果顯示既有「查無符合結果」空狀態（見 [#public](#public)）。
- **孤兒帳號**（`orgCode` 缺值或查無）之業務使用者：清單為空、所有文件不可見（deny-by-default），**非錯誤**、不提示「您的部門資料異常」；🔴 **2026-08-27 起前台清單頂部已無任何範圍說明句**（說明列整條移除，[F019](features/F019-public-list-browsing.md#ux-20260827-public-delta) `AC-Y1`；`AC-40` 一併作廢）——**本節之要求未鬆動、只是達成方式改變**：原以「孤兒帳號沿用業務句、不另立第三句」達成，現以「任何帳號都沒有說明句」達成；孤兒帳號畫面上**不得**補上任何替代提示。<br>📝 OLD> 「**前台清單頂部說明句亦沿用業務子分類之同一句 `SCOPE_NOTICE_BUSINESS`、不另立第三句**（[F041](features/F041-user-subtype-business-scope.md) AC-40）」——避免以錯誤訊息或文案差異區分「無文件」與「帳號異常」。

### ✅ 不記錄拒絕稽核事件（`OQ-E08-10` → 選項 A，2026-08-11 定案）

- 拒絕路徑**一律不得寫入 `VIEW`／`DOWNLOAD`／`PRINT` 成功事件**（調閱事實未發生，[F041](features/F041-user-subtype-business-scope.md) AC-27），且 **`AuditWriter` 完全未被呼叫**（AC-28）。
- **直接後果：本需求完全不觸及稽核子系統**——`AUDIT_LOG` 不動、[F023](features/F023-audit-logging.md)／[F024](features/F024-access-history-query.md) 皆不需 AC delta、[nfr.md](nfr.md) 稽核保留規則不需覆核。
- 📝 否決之選項 B（寫入 `actionType = 'ACCESS_DENIED_DEPT_RESTRICTION'` 供資安／外流意圖偵測）：曾是本需求**唯一會擴散到 schema** 者，需 `AUDIT_LOG` 列舉擴充 ＋ 上述三項連帶變更。保留於此供追溯；日後若組織將「業務人員嘗試繞過限制」視為需追蹤之風險訊號，此為 additive 變更、不阻塞現有實作。

## D9 delta：2026-08-20 缺失／變更 9 項之錯誤面（**零新增錯誤碼**） {#d9-delta}

> 對應 [stories/2026-08-20-defect-delta-9.md](../stories/2026-08-20-defect-delta-9.md) 與 [open-questions §D9](open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)。
> 🔴 **本輪不新增任何錯誤碼**——九項需求全數複用既有碼。本節逐項說明「為何不需要新碼」，避免下游實作者自行發明。

### 後台下載改為燒錄（#5，`OQ-D9-08`／`OQ-D9-09`／`OQ-D9-10`）

- **未授權存取**：沿用 [#file](#file) 之 `FILE_ACCESS_DENIED`（403）與 [#appendix](#appendix) 之既有規則，**語意一字不變**——「誰能下載」未因燒錄而改變（[F039](features/F039-appendix-management.md) `AC-N58` 明文鎖定）。
- **燒錄失敗**（PDF 損毀、字型缺失等）：**不新增錯誤碼**，沿用既有 5xx 系統錯誤路徑；⚠ **不得**靜默退化為回傳未燒錄之原始位元組——那會使 `OQ-D9-09`（不保留任何無浮水印下載路徑）於失敗路徑上被架空。
- **稽核寫入失敗**：**不阻斷下載**，進補償佇列重試（沿用 [#audit](#audit)）。
- ⚠ **`OQ-FM-01`／`OQ-D18-01` 已失效**：本文件他處若仍以「後台維持 RAW／不寫稽核」為前提之措辭，一律以 [F020 §後台燒錄範圍 delta](features/F020-watermark.md#backend-burn-delta) 為準。

### OJT 上傳開放主管／部門窗口（#8，`OQ-D9-19`～`OQ-D9-24`）

- **權限錯誤沿用既有碼、不新增**：`SysAdmin` → `FIELD_WRITE_FORBIDDEN`（403，欄位層）；`User` → `PERMISSION_DENIED`（403，路由層）；`Supervisor`／`DeptContact`／`ICSOPAdmin` → **允許**。見 [#permission](#permission) 與 [F016](features/F016-pdf-ojt-attachment.md#ojt-role-open-delta) `AC-N34`。
- **上傳驗證不因角色而異**：格式／大小／覆蓋語意一律沿用 [#file](#file)（`FILE_FORMAT_NOT_ALLOWED`／`FILE_SIZE_EXCEEDED`／重傳即覆蓋），**驗證順序不變**。
- **不限權責範圍**（`OQ-D9-21` 選項 A）：**不存在**「非權責範圍」之錯誤情境——任一主管／部門窗口對任何文件之 OJT 上傳皆為合法請求，**不得**新增任何範圍相關錯誤碼。
- **稽核寫入失敗**：不阻斷上傳（沿用 [#audit](#audit)）。

### 使用表單整頁化與制定部門（#7，`OQ-D9-15`～`OQ-D9-18`）

- **編號唯一性**：**完全沿用** [#usage-form-number](#usage-form-number) 之既有規則與兩個既有錯誤碼（`USAGE_FORM_NUMBER_DUPLICATE` 409／`USAGE_FORM_NUMBER_TOO_LONG` 400），含驗證順序、trim、不分大小寫、`null` 不參與比對、**編輯時排除自身列**、清空為合法操作——`OQ-D9-16` 裁定本項**不新增後端工作**。使用者可見之錯誤文案亦**逐字沿用**（[F018](features/F018-usage-form-management.md#usage-form-page-delta) `AC-N44`）。
- **制定部門（多選）**：**不新增錯誤碼**——比照 [`DOC_USING_DEPT`](data-model.md#doc-using-dept) 之既有處置，`orgCode` **不驗證存在性**，僅 trim／去空值／去重；**0 筆為合法狀態**、**不得**回必填錯誤。
- **整頁化為純版面搬遷**：後端建立流程與 API 契約不變 ⇒ **既有上傳／覆蓋／移除之全部錯誤路徑一字不動**（含 `USAGE_FORM_OVERWRITE_SHARED` 409 與 `USAGE_FORM_IN_USE` 409）；⚠ **編輯 metadata 之路徑不得觸發 `USAGE_FORM_OVERWRITE_SHARED`**（[F018](features/F018-usage-form-management.md) `AC-D20`／`AC-N49`）。

### 浮水印呈現與檢視器（#1／#2／#3／#4）、字級（#6）、OJT 圖示欄（#9）

- **皆為呈現層或常數層變更，不產生任何新錯誤路徑**：色值／不透明度（`AC-N1`～`AC-N3`）、canvas 渲染（`AC-N4`～`AC-N9`）、公司簡稱（`AC-N10`～`AC-N13`）、前台字級（`AC-N59`～`AC-N62`）、清單圖示欄（`AC-N37`～`AC-N40`）**一律不新增錯誤碼、不改變任何 API 契約**。
- **公司簡稱查無**：沿用 `resolveCompanyName` 之既有寬容處置——回 `null` 並由 [F020](features/F020-watermark.md) §8.4 之分隔符收合規則吸收，**不拋錯、不回退為全稱**（[F020](features/F020-watermark.md#d9-watermark-delta) `AC-N12`）。

## OJT 進度管理（🟢 **已裁決 — 2026-08-28，人類閘門已對 E11 全部 16 題 OQ 裁決完畢**） {#ojt-progress}

> 權威＝[F042](features/F042-ojt-progress-management.md)；逐題見 [open-questions §E11](open-questions.md#e11-2026-08-27)。本節依 `OQ-E11-04=A`（僅 ICSOPAdmin 可刪、寫稽核）／`OQ-E11-09=A`（訓練日期必填、不可未來日）／`OQ-E11-16=B`（不可編輯）／`OQ-E11-01=C`（既有單份 OJT 檔標「待指派單位」，見 [data-model.md §既有資料遷移](data-model.md#ojt-session-migration)）收斂定稿。
> 🔒 **檔案類一律沿用既有 `FILE_*` 錯誤碼、不新增**（見 [#file](#file)）——場次之簽到表檔案與 [F016](features/F016-pdf-ojt-attachment.md) 之附件共用同一套格式／大小／存取規則（沿用既有清單、≤50MB，`OQ-E11-10=A`）。
> 🔒 **權限類一律沿用 `PERMISSION_DENIED`（403，路由層）**（見 [#permission](#permission)）——本 feature **不採** [#dept-restriction](#dept-restriction) 之 404 隱藏存在性例外，該例外於 `OQ-E06-03` 定案時已明文「本系統唯一之此類例外、不推廣」。
> 🔒 **後台下載燒錄政策延伸**：場次簽到檔若為 `pdf` 格式，其後台下載沿用既有 D9 已定案之政策（`OQ-D9-08`，[F016](features/F016-pdf-ojt-attachment.md#ojt-role-open-delta) `AC-N14`～`AC-N19`：一律燒錄浮水印、一律寫調閱稽核）——既有已裁決政策之延伸套用，**不新增任何錯誤碼**。

### 錯誤碼

> 🔒 **職權分工（2026-08-28 與 sw-ojt／ux-ojt 核對確認）**：**本表為錯誤碼字面與 HTTP 狀態碼之單一權威**；**使用者可見訊息之逐字文案另由 prototype 25 定稿，權威＝[F042 §6 ⑬](features/F042-ojt-progress-management.md#prototype-25-dom-contract)**（ux-ojt 定稿）。本表**刻意不重複收錄逐字訊息**——同一組文案若在兩處各打一份，其中一處日後修訂而另一處未同步，即為分歧之起點（本 repo 已多次記載此類缺陷之成因）；下游實作訊息文案時請直接引用 F042 §6 ⑬，不得照抄本表舊版曾列出之示意句。

| 錯誤碼 | HTTP | 觸發情境 | 依據 |
|---|---|---|---|
| `OJT_SESSION_NOT_FOUND` | 404 | 刪除或下載某場次之簽到檔時，該場次不存在或已被刪除；「歸位」（見下）指定之 `sessionId` 不存在 | `OQ-E11-04=A`（刪除）／[data-model.md §既有資料遷移](data-model.md#ojt-session-migration)（歸位） |
| `OJT_ORG_NOT_USING_DEPT` | 400 | ① 對不存在之進度列新增場次；② 「歸位」指定之單位非該文件之使用部門；③ 「歸位」時未選任何單位（`orgCode` 空值／未提供，見下方規則說明——與②同一碼，非另立） | [F042](features/F042-ojt-progress-management.md) `AC-01`（列粒度依使用部門原樣）／`AC-26`（歸位） |
| `OJT_TRAINING_DATE_REQUIRED` | 400 | 訓練日期缺漏 | `OQ-E11-09=A`（必填） |
| `OJT_TRAINING_DATE_FUTURE` | 400 | 訓練日期晚於今日 | `OQ-E11-09=A`（不可未來日） |
| `OJT_SESSION_ALREADY_ASSIGNED` | 409 | 對 `orgCode` 已非 `NULL`（已歸位）之場次再次執行「歸位」操作（`UPDATE ... WHERE orgCode IS NULL` 命中 0 筆） | [data-model.md §既有資料遷移](data-model.md#ojt-session-migration)（歸位單向、不可逆） |

- **`OJT_ORG_NOT_USING_DEPT` 用於「歸位」未選單位之理由（回應 sw-ojt 提報之②）**：後端對「單位是否為該文件使用部門」之驗證為**單一成員資格檢查**——`orgCode ∈ 該文件之 DOC_USING_DEPT 集合`。空值／未提供之 `orgCode` 天然不是任何集合的成員，**該檢查本身即自然涵蓋「未選」情境，不需要為此另立一道獨立的必填檢查分支**，故**沿用同一錯誤碼、不新增碼**（比照本檔一貫之「能沿用既有碼就不新增」原則）。<br>⚠ **後端不因此取代前端之必填檢查**：正常操作流程下，`<input>` 之 `required` 或送出前之 JS 檢查應攔在使用者實際送出空值之前；本碼之「未選」子情境是**防呆／繞過前端**（直接呼叫 API、瀏覽器擴充功能干預等）時之最後防線，非預期之主要觸發路徑。<br>📌 **同一機讀碼在不同呼叫情境下之人讀訊息不同**（新增場次情境 vs. 歸位情境，逐字見 F042 §6 ⑬）為刻意設計、非缺陷——機讀碼（給程式判斷用）與人讀訊息（給使用者看）本可依呼叫脈絡分離，兩者不需要一一對應。

### 規則

- **驗證失敗一律為 all-or-nothing**：訓練日期或檔案任一驗證失敗時，**不建立任何場次紀錄、不寫入任何 Blob**（[F042](features/F042-ojt-progress-management.md) `AC-09`）。<br>⚠ **部分成功為缺陷**：若先寫 Blob 再驗日期，失敗時會留下一個沒有任何紀錄指向它的孤兒檔案。
- **稽核寫入失敗不阻斷場次建立／刪除**：進補償佇列重試，沿用 [#audit](#audit) 之既有規則、**不新增錯誤碼**（[F042](features/F042-ojt-progress-management.md) `AC-18`）。
- **場次之簽到檔於 Blob 中不存在**（參照指向空氣）：下載時回 `FILE_ACCESS_DENIED`／404（沿用 [#file](#file)）；🔒 **該場次紀錄本身不因此消失，該列亦不退回「未完成」**——場次紀錄與檔案可用性為兩個正交維度。
- **`OJT_ORG_NOT_USING_DEPT` 為 400 而非 403 之理由**：這不是權限問題（[F042](features/F042-ojt-progress-management.md) `AC-08` 明文不限權責範圍），而是**輸入指向了一個不存在的進度列**——用 403 會讓操作者以為是自己權限不足而去申請權限，實際上該單位根本不在這份文件的使用部門裡。
- **刪除（`OQ-E11-04=A`）僅 ICSOPAdmin**：其餘角色（含 Supervisor／DeptContact，儘管其可新增場次）呼叫刪除端點一律 `PERMISSION_DENIED`（403，沿用 [#permission](#permission)，非本節新錯誤碼）。
- **無編輯路徑（`OQ-E11-16=B`）**：場次一旦建立（含歸位後），`trainingDate`／檔案皆不可更正，**端點層級不存在**（非「回某錯誤碼拒絕」，而是根本無此路由）——與既有「裁決前不開放」之呈現方式相同，差異僅在於本題已**永久**如此定案，非暫時性 Phase A 限制。
- **`OJT_SESSION_ALREADY_ASSIGNED` 之 409 選用理由**：比照本檔既有 `USAGE_FORM_NUMBER_DUPLICATE`、`LIFECYCLE_DUPLICATE` 等「操作與當前資源狀態衝突」之既有 409 慣例——並非輸入格式錯誤（400）亦非資源不存在（404），而是「資源存在但已不在可執行本操作之狀態」。

## 稽核 {#audit}

- **記錄失敗不阻斷瀏覽**：稽核寫入暫時性失敗時，使用者仍可正常查看文件；失敗事件進**補償佇列**（outbox 類），服務恢復後重試補寫（F023 AC3、[NFR-003](nfr.md#audit-retention)）。
- **不可竄改**：任何角色經一般介面/API 修改或刪除稽核紀錄回 `AUDIT_IMMUTABLE`（403/405），資料表 append-only。
- **查詢空條件**：F024 查詢未帶任何條件時**非阻擋**（定案 2026-07-22）——自動套用預設近 30 天範圍並於回應標記 `appliedDefaultRange`，避免全表掃描（不回 `QUERY_CONDITION_REQUIRED`）。

## 前台瀏覽與檢視 {#public}

- **查無結果**：搜尋/篩選無命中時顯示「查無符合結果」空狀態，**非錯誤畫面**。
- **關鍵字萬用字元**：`% _ '` 等須正確跳脫，不得產生錯誤或注入風險（F019）。
- **未登入存取檢視器/下載**：拒絕並導回登入頁（F020）。
- **彈出視窗被封鎖**（F022）：提供替代提示（如改同分頁開啟）。

## RAG 智慧問答：Ingestion（抽取/索引） {#rag-ingestion}

- **模板不符**：.xls 非 ICSOP 標準五表模板時回 `XLS_TEMPLATE_INVALID`（F027 上傳阻擋）或於抽取階段標記 `EXTRACTION_FAILED`（F028），**不產生殘缺/錯誤內容進入索引**。
- **~~.xls→PDF 轉檔失敗~~（OQ-E09-10 定案：已取消自動轉檔，本情境不再存在）**：`XLS_PDF_CONVERSION_FAILED` 已移除。.xls 原件與呈現用 PDF **分開手動上傳、各自獨立**；.xls 僅做**模板格式驗證**（`XLS_TEMPLATE_INVALID`），驗證失敗僅阻擋該次 .xls 上傳，既有 .xls 與既有 ICSOP PDF 皆不受影響。**兩者內容一致性由 ICSOPAdmin 人工負責，系統不偵測、不告警**（F027）。
- **切 chunk/向量化/索引失敗**：`CHUNKING_FAILED`／`EMBEDDING_FAILED`／`INDEX_BUILD_FAILED`，該文件索引狀態標記「失敗」，**不留部分/不完整索引殘留**，錯誤訊息與失敗階段（extract/chunk/embed）保留供 F031 查詢。
- **改版重抽失敗**：回 `REINDEX_FAILED`，**保留舊版索引繼續可用**（直到重抽成功），不使文件落入「完全無索引」（F030 AC-4）。
- **狀態切換連動**：純狀態切換僅更新 chunk 之 `status` metadata，不重抽；此路徑失敗僅影響有效性排除，不影響內文索引。
- **尚未建立索引**：文件從未上傳 .xls／無 INDEX_RUN 時，F031 呈現「尚未建立」，**非錯誤畫面**、非「失敗」。

## RAG 智慧問答：查詢與生成 {#rag-query}

- **空問題**：回 `RAG_QUERY_EMPTY`（F032）。
- **權限過濾為靜默排除**：受限 chunk（狀態≠有效 或 使用部門不可見）於檢索層即被排除，**不回傳權限錯誤、不進入生成上下文**；過濾後無可用結果時導向下列「無結果」處理，**不得放寬過濾去檢索受限文件**（F033、[NFR-009](nfr.md#rag-security)）。
- **無結果（功能性回應，非 HTTP 錯誤）**：過濾後無相關 chunk 時，明確回覆「找不到相關文件內容」（`resultType=no_result`），**不得生成看似合理但無依據之答案**（F035）；此回應仍寫 QA_LOG（F034）。
- **低信心**：檢索相關性偏低時加註低信心提醒（`resultType=low_confidence`），不以高確定性語氣呈現（F035）。相關性/無結果門檻為量化參數（OQ-E09-08）。
- **Prompt injection**：因過濾在檢索層，誘導繞過部門/狀態限制、揭露系統 prompt、產生未授權內容等仍僅回權限範圍內內容或明確拒答；負向測試納入上線前 security review（[NFR-009](nfr.md#rag-security)）。
- **生成/檢索服務不可用**：`LLM_SERVICE_UNAVAILABLE`／`VECTOR_STORE_UNAVAILABLE`（5xx），明確告知暫時無法使用，不回傳無依據內容。
- **稽核寫入失敗不阻斷問答**：QA_LOG／導引調閱之 AUDIT_LOG 寫入暫時失敗時使用者仍取得答案，失敗進補償佇列重試補寫（F034，比照 [#audit](#audit)）。

## 不可恢復情境

| 情境 | 處置 |
|------|------|
| 上游來源長期不可用 | 保留最後一次成功同步資料，持續告警；不自動清空本地資料 |
| 誤判離職導致帳號停用 | 帳號軟停用可恢復；恢復是否需人工確認為 open-questions（F005） |
| 螢幕截圖/拍照繞過浮水印 | 技術無法完全防禦，屬已知限制（[NFR-007](nfr.md#watermark)），需利害關係人接受風險 |
