---
spec-id: error-handling
title: 錯誤處理與失敗模式
version: 1.0
date: 2026-07-15
status: Draft
---

# 錯誤處理（Error Handling）

> 定義使用者可見錯誤、系統失敗、重試/回退與不可恢復情境，供 TDD/QA 撰寫測試。錯誤碼採 `DOMAIN_REASON`（SCREAMING_SNAKE）慣例；實際常數字串以實作為準，本文件定義語意契約。
> **HTTP 狀態碼慣例**：400 輸入驗證/格式錯誤、401 驗證失敗、403 授權不足、404 找不到、409 衝突（唯一性/成環/同步互斥/刪除保護）、5xx 系統錯誤。

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
| `AUTH_MISSING_FIELD` | 400 | 必要欄位缺漏 | F001 |
| `AUTH_SESSION_EXPIRED` | 401 | 工作階段已逾時，請重新登入 | F001 |
| `ACCOUNT_USERNAME_EXISTS` | 409 | 帳號名稱已存在（比對 `ACCOUNT.loginId`；錯誤碼名稱沿用不改，避免跨層識別碼churn） | F003 |
| `ACCOUNT_UPSTREAM_READONLY` | 403 | 上游同步帳號資料請透過組織同步更新 | F003 |
| `ROLE_INVALID` | 400 | 角色值不合法 | F003 |
| `ROLE_SELF_DOWNGRADE_BLOCKED` | 409 | 無法降級自身系統管理員角色（草案，待確認） | F003 |
| `SYNC_IN_PROGRESS` | 409 | 同步進行中，請稍候 | F004 |
| `SYNC_SOURCE_UNAVAILABLE` | 5xx | 組織來源暫時無法連線 | F004 |
| `SYNC_DATA_FORMAT_ERROR` | 5xx | 來源資料格式異常 | F004 |
| `SYNC_WRITE_FAILED` | 5xx | 同步寫入失敗（交易已回滾，資料未變） | F004 |
| `DISAPPEARED_RATIO_EXCEEDED` | 5xx | 在職帳號消失比例超過閾值，已中止同步、未執行任何停用 | F004 |
| `LIFECYCLE_NAME_REQUIRED` | 400 | 循環名稱不可為空 | F007 |
| `LIFECYCLE_HAS_DOCUMENTS` | 409 | 循環仍有文件掛載，**需先解除全部掛載才能刪除**（可改為停用） | F007 |
| `DAG_SELF_LOOP` | 409 | 節點不可連向自己 | F008 |
| `DAG_CYCLE_DETECTED` | 409 | 此連線會造成循環結構成環，請重新確認流程方向 | F008 |
| `NODE_NOT_FOUND` | 404 | 找不到節點 | F009 |
| `NODE_DOC_LIFECYCLE_MISMATCH` | 400 | 文件不屬於此循環 | F009 |
| `NODE_DOC_ALREADY_ASSIGNED` | 409（需二次確認） | 文件已掛載於節點 {name}，是否改派？ | F009 |
| `DOCUMENT_REQUIRED_FIELD_MISSING` | 400 | 必填欄位未填寫 | F010 |
| `DOCUMENT_NUMBER_DUPLICATE` | 409 | 文件編號已存在（**比對「有效＋作廢」**；「失效」編號已釋出不觸發） | F013 |
| `DOCUMENT_STATUS_INVALID` | 400 | 文件狀態值不合法 | F012 |
| `DOCUMENT_LINK_TARGET_NOT_FOUND` | 400 | 連結目標文件不存在 | F015 |
| `FILE_FORMAT_NOT_ALLOWED` | 400 | 檔案格式不允許 | F016, F018 |
| `FILE_SIZE_EXCEEDED` | 400 | 檔案超過大小上限 | F016, F018 |
| `FILE_ACCESS_DENIED` | 403 | 無權存取此檔案 | F016, F018, F020 |
| `USAGE_FORM_OVERWRITE_SHARED` | 409（需二次確認） | 此表單另被 {N} 份文件引用，覆蓋將同時更新全部，是否繼續？ | F018 |
| `PERMISSION_DENIED` | 403 | 權限不足 | F025 |
| `FIELD_WRITE_FORBIDDEN` | 403 | 無權修改此欄位 | F026 |
| `AUDIT_IMMUTABLE` | 403 | 稽核紀錄不可修改或刪除 | F023 |
| `QUERY_CONDITION_REQUIRED` | 400 | 請至少提供一項查詢條件 | F024 |
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

### 帳號對應與狀態

- **AD 驗證通過但查無對應在職帳號**（OQ-E01-01 定案）：回 `AUTH_ACCOUNT_NOT_FOUND`，提示「查無有效帳號，請洽系統管理員」，**不自動建立帳號**。比對規則為完整 email（含網域）逐字、不分大小寫，且強制 `status=active`（← `EMPSTS='A'`）。
- **停用帳號登入**：即使 AD 驗證通過，仍須檢查本地帳號狀態，停用即回 `AUTH_ACCOUNT_DISABLED`。
- **email 於在職帳號中命中多筆**：視為上游資料異常，拒絕登入並告警系統管理員，**不得任選一筆**。
- **帳密錯誤/帳號不存在**：一律回相同 `AUTH_INVALID_CREDENTIALS`，不洩漏帳號是否存在。

### 訊息揭露原則

- 所有登入失敗之使用者可見訊息**不得洩漏可列舉資訊**，包含但不限於：某 email 是否存在於系統、該帳號是否啟用、比對在哪一階段失敗、token 中哪一項檢查未通過。詳細判別資訊僅寫入伺服器端失敗日誌供稽核。
- **登入失敗鎖定**：定案本輪不做（OQ-E01-02）。

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
- **覆蓋共用表單（OQ-E05-05）**：更新被 ≥1 份其他文件引用之表單時，回 `USAGE_FORM_OVERWRITE_SHARED`（409，需二次確認，附引用文件數 N）；確認後覆蓋、舊檔不再可存取、不保留歷史版本；取消則原檔不變。僅當前文件引用或無其他引用時免跨文件警示（F018）。

## 權限（功能面 / 欄位面） {#permission}

- **功能面**：角色對功能為「無/唯讀」時，呼叫寫入型 API 回 `PERMISSION_DENIED`（403）。組織範圍限定須由**後端強制過濾**，不可信任前端傳入條件（F025）；**現行矩陣已無啟用之「本部門」範圍**（主管循環管理已放寬為全公司唯讀，OQ-E08-03 定案），範圍過濾機制保留備用。
- **欄位面**：唯讀欄位被寫入時回 `FIELD_WRITE_FORBIDDEN`（**非靜默忽略**業務欄位變更），該更新不得寫入；惟系統產生欄位（UUID）一律**忽略傳入值**而非報錯（F026）。

## 稽核 {#audit}

- **記錄失敗不阻斷瀏覽**：稽核寫入暫時性失敗時，使用者仍可正常查看文件；失敗事件進**補償佇列**（outbox 類），服務恢復後重試補寫（F023 AC3、[NFR-003](nfr.md#audit-retention)）。
- **不可竄改**：任何角色經一般介面/API 修改或刪除稽核紀錄回 `AUDIT_IMMUTABLE`（403/405），資料表 append-only。
- **查詢空條件**：F024 查詢未帶任何條件時回 `QUERY_CONDITION_REQUIRED` 或套用預設近 30 天範圍，避免全表掃描。

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
