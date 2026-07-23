# Feature Status Tracker（功能完成度追蹤）

> **這是全專案「功能是否真正完成」的唯一彙總視圖（single source of truth）。**
> 每個 Fxxx 在此有一列，狀態以嚴格 Definition of Done 判定。功能規格散在 `features/Fxxx-*.md`，
> 各檔 `Status:` 行是局部狀態；**本檔負責把它們攤在一頁、並以「端到端可達」把關**，避免「有 commit、有按鈕就當作完成」。
>
> Product: ICSOP 文件管理平台 · 稽核基準：**2026-07-22**（初審 `e6045d9` → Wave 1 `4af5a02` → Wave 2 `8d5f35d`）· 對照 [spec-index.md](spec-index.md)

---

## Definition of Done（完成的定義）

一個功能標為 **✅ 已完成-已驗證**，必須同時滿足：

1. **AC 覆蓋** — 規格 `## Acceptance Criteria` 的每條主線，都有對應測試（後端 `*.spec.ts` / 前端 `*.test.tsx`）。
2. **端到端可達** — 已 wire 進 module/route，且**存在一條真實路徑實際行使它**。
   - 反例（本次揪出的經典失效）：F003 可以「建立帳號」，但建立出的帳號**無法登入**（建立時未寫 `email`，而唯一登入途徑用 email 比對；帳密登入端點又不存在）。端點存在 ≠ 功能可用 → 判 **部分**，不是完成。
3. **稽核/副作用落地**（若 AC 要求） — 例如「記錄稽核」需真的寫入。目前全站無 `AUDIT_LOG`，故所有「記錄稽核」條款一律未達成。

未達上述者，依實況標 `部分 / 進行中 / 未開始`。

## 狀態列舉

| 標記 | 意義 |
|---|---|
| ✅ 已完成-已驗證 | AC 覆蓋 ＋ 端到端可達 ＋ 副作用落地 |
| 🟡 部分 | 核心可用但有明確缺口（AC 未全覆蓋／某路徑不可達／副作用未落地） |
| 🔵 進行中 | 有骨架但尚無法端到端達成任何 AC |
| ⬜ 未開始 | 無實作（或僅權限鍵/欄位鍵佔位） |

`P`＝優先級（P0-MVP/P1/P2）；`Ph`＝規劃階段（Phase 1/2/3）。Phase 2/3 未開始屬「規劃上本就晚做」，非落後。

---

## 總覽

| 狀態 | 數量 | 功能 |
|---|---|---|
| ✅ 已完成-已驗證 | **7** | F002 F003 F004 F008 F009 F013 F025 |
| 🟡 部分 | **22** | F001 F005 F007 F010 F011 F012 F015 F016 F017 F018 F019 F020 F021 F022 F023 F024 F026 F027 F028 F029 F030 F031 |
| 🔵 進行中 | **1** | F014 |
| ⬜ 未開始 | **8** | F006 F036 F037 F038 F032 F033 F034 F035 |
| | **38** | |

> **2026-07-22 Wave 1 平行 worktree**（3 分支併回 main、unit-green）：F023/F024（audit）、F016/F018/F027（storage）⬜→🟡；F001 途徑B＋F003 閉環推進。backend 500／frontend 119。
> **2026-07-22 Wave 2 平行 worktree**（org-foundation ＋ doc-edit/public/rag，4 分支併回 main、unit-green）：**org-foundation**（ACCOUNT 即在職員工目錄→名稱解析、ORG 讀取端點、DESC_FULL、session 擴充；權威來源 [upstream-person-org-source.md]，參考 portalapp-sp）解鎖名稱/身分。**10 功能 ⬜→🟡**：F011 F015（doc-edit）、F019 F020 F021 F022（public）、F028 F029 F030 F031（rag）；F012/F013/F017 補強。backend **816** 測、frontend **143** 測、tsc 全淨。
>
> **2026-07-22 整合階段 ②（真 SOP 自動化整合測試 `npm run test:int`）**：載具啟動完整 AppModule 接真 SOP、鑄 session、marker 清理。**5 場景綠**——**F003 死鏈閉合經真往返驗證**（建立手動帳號→`POST /auth/login`→`/auth/me`）＋錯誤密碼 401；F010 建立→F011 `GET/PATCH /:id` 編輯→F017 清單→**F013 重複編號 409（真 filtered unique index）**；F024 查詢 200。**→ F003、F013 升 ✅**（其餘 F001途徑B/F010/F011/F017/F024 後端流程 int-verified，但仍有 logout/STEP3-4/前端/匯出 等缺口留 🟡）。**🔴 整合實測發現**：F023 `AUDIT_LOG` best-effort `REVOKE` 對 role 授權之 app 登入**無效** → **目前非 append-only 強制**（UPDATE 可成功），需改 `DENY UPDATE,DELETE`／觸發器；已以 `it.failing` 記錄。
>
> **2026-07-22 整合階段 ①（app-DB 落地＋啟動驗證）**：**12 個 migration 全數對真 SOP app DB 執行成功**（含 AUDIT_LOG/附件/DOC_SOURCE_XLS/USAGE_FORM/DOCUMENT_LINK/ORG_DESCFULL/INDEX_RUN/DOCUMENT_CHUNK＋F013 篩選唯一索引）。**整個 Wave 1+2 合併系統成功對 SOP 啟動**（`Nest application successfully started`；所有路由掛載；**real TypeORM stores** 皆接真庫：audit/documents+links/attachments(meta)/usage-forms/xls-source(meta)/org-directory/public）；HTTP smoke：守門 401、OIDC 登入 302（含 PKCE）。**仍為 fake**：ingestion/rag（FakeChunk/IndexRun/VectorStore，待 pgvector＋embedding 選型 OQ-E09-02）、Blob（FakeBlobStore，待 Azure 憑證）。**升 ✅ 尚缺**：各 feature AC 之逐流程 e2e（真人 UI 登入或自動化整合測試）——本階段已證「系統可對真庫啟動且路由/守門/DB store 皆接真」，個別流程驗證為下一步。

**P0-MVP 尚未完成者（優先盯）**：F001 F003 F005 F007 F010 F012 F013 F016 F017 F019 F020 F023 F024 F026 F027 F028 F029 F030 F036，以及 Phase 3 之 F032 F033 F034 F035。

---

## 逐功能狀態

### E01 驗證與帳號
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F001 | 雙軌驗證登入與 Session | P0 | 1 | 🟡 部分 | 途徑 A（OIDC）已端到端；**途徑 B 帳密登入已補＋int-verified vs SOP**（`POST /auth/login` by loginId、統一 `AUTH_INVALID_CREDENTIALS`、build→login→`/auth/me` 真往返過）；剩：登出非「即時撤銷」（無狀態 JWT，需 denylist infra）＋帳密登入節流未做（本輪外） |
| F002 | 登入後角色分流導向 | P0 | 1 | ✅ 已完成-已驗證 | 邊界：session 有效但 roleCode=undefined 不會導回登入頁（低風險） |
| F003 | 帳號與角色指派管理 | P0 | 1 | ✅ 已完成-已驗證 | 死鏈閉合＋**int-verified vs SOP**（建立手動帳號→`POST /auth/login`→`/auth/me` 真往返過；錯誤密碼 401）；CRUD/角色指派 unit-covered＋AccountManagementPage |

### E02 組織同步
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F004 | 組織資料同步（排程＋手動） | P0 | 1 | ✅ 已完成-已驗證 | OQ-E02-02 失敗重試＋通知刻意延後（cron 僅 try/catch 記 log）；公司主檔 VW_HRCOMF 未同步 |
| F005 | 離職者自動停用帳號 | P0 | 1 | 🟡 部分 | 停用→即時撤銷已達成；缺「EMPSTS='A' 但 RESIGNDT 過去日」資料不一致**告警**、逐帳號「消失」警告；稽核完整性依賴未建之 F023 |
| F006 | 組織異動影響提示與異動後台 | P1 | 1/2 | ⬜ 未開始 | 無 `ORG_CHANGE_ALERT` 表/端點/UI；提示產生、三頁籤後台、導向 F014 編輯、pending→resolved 全缺；依賴 F014 |

### E03 循環與 DAG
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F007 | 循環池 CRUD | P0 | 1 | 🟡 部分 | 核心 CRUD＋刪除保護已測；AC「建立後導向 DAG 畫布」未做（Modal 只關閉重載）；AC「刪除記錄稽核」未做（無 AUDIT_LOG） |
| F008 | DAG 節點與連線維護（含防環） | P0 | 1 | ✅ 已完成-已驗證 | 交易內成環再驗＝權威；僅服務層假 store 測、無整合測（碼正確） |
| F009 | 節點抽屜維護與文件過濾警示 | P0 | 1 | ✅ 已完成-已驗證 | 邊界：雙管理員同時掛載無樂觀鎖（last-write-wins）；前端多筆存檔為非交易連續 API |
| F036 | 循環樹狀圖預覽（唯讀＋浮水印） | P0 | 1 | ⬜ 未開始 | 整個唯讀檢視器、伺服端浮水印、角色可見性、循環切換、下游高亮、下載/列印燒錄 PDF 全缺（prototype 22 未移植） |

### E04 ICSOP 文件
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F010 | 建立 ICSOP 文件 | P0 | 1 | 🟡 部分 | STEP1/2 可端到端建立；STEP3/4（次要室長/使用部門/制定三級/附件/連結）延後、`CreateDocumentInput` 未含；建立稽核（Main Flow 7）未做 |
| F011 | 編輯 ICSOP 文件與版本對照 | P0 | 1 | 🟡 部分 | backend unit-green：`GET`/`PATCH /:id`、編輯排除 nodeId、版本 diff、覆蓋不留歷史、編輯側唯一性排除自身、`DocumentChangedEvent` 種子。剩：**前端編輯頁**、真 DB＝`[integration]` |
| F012 | 文件狀態切換 | P0 | 1 | 🟡 部分 | 切換＋切回有效重驗編號已測；OQ-E04-02「切換原因」欄未做；變更歷程 F037 事件＋操作者稽核未做 |
| F013 | 文件編號唯一性管理 | P0 | 1 | ✅ 已完成-已驗證 | 建立唯一性經**真 filtered unique index int-verified vs SOP**（dup→409）；編輯側排除自身＋mssql 2601/2627→409 於 F011 路徑 unit-covered |
| F014 | 制定組織與當責室長設定 | P0 | 1 | 🔵 進行中 | scalar 欄位骨架已存；**org-foundation 已備**（`OrgDirectoryService` 級聯樹＋`NameResolutionService` 室長名）→ 前置解鎖。剩：制定組織三級下拉接線、次要室長/使用部門關聯表、managerEmpNo 預設候選、UI（現 disabled 佔位） |
| F015 | 文件連結點管理 | P1 | 1 | 🟡 部分 | backend unit-green：`DOCUMENT_LINK` 表、批次入 PATCH、`GET :id/links`、`DOCUMENT_LINK_TARGET_NOT_FOUND`。剩：**前端連結 UI**、FK/唯一併發＝`[integration]` |
| F016 | PDF 與 OJT 附件上傳 | P0 | 1 | 🟡 部分 | backend unit-green：Blob 抽象（`BlobStore`＋FakeBlobStore）、`DOCUMENT_ATTACHMENT`、兩層授權、格式白名單≤50MB、單份覆蓋、受控下載。剩：**前端上傳 UI**、真 Azure Blob＋migration＝`[integration]` |
| F017 | 後台文件清單與搜尋 | P0 | 1 | 🟡 部分 | backend 補強 unit-green：多篩選/排序/**真分頁**（回傳 `{items,total,…}`）＋**室長/組織名稱解析**（org-foundation）＋衍生狀態篩選。剩：**前端分頁/combobox/欄位 UI 接線**（後端契約已備）、真 join 效能＝`[integration]` |

### E05 使用表單
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F018 | 使用表單管理 | P1 | 1 | 🟡 部分 | backend unit-green：`USAGE_FORM_POOL`＋`DOC_USAGE_FORM` 多對多、上傳/覆蓋（引用≥2 警示）/移除（`USAGE_FORM_IN_USE`）、下載稽核（佔位）。剩：**前端管理頁**、真 Blob/DB、稽核接真 AuditWriter＝`[integration]` |

### E06 前台瀏覽
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F019 | 前台清單瀏覽（排序/搜尋/篩選） | P0 | 1 | 🟡 部分 | unit-green：`PublicModule`＋`/public/documents`（強制已公告、關鍵字、AND 篩選、子樹前綴、置頂、分頁）＋`PublicListPage`（取代 placeholder）＋名稱解析。剩：**`DOC_USING_DEPT` 未持久化**→置頂/部門篩選 e2e、真 DB＝`[integration]` |
| F020 | 文件浮水印（疊加＋燒錄） | P0 | 1 | 🟡 部分 | unit-green：快照組裝（公司全稱/DESC_FULL/最細單位/空欄收合）、`WatermarkService`＋VIEW/DOWNLOAD/PRINT＋`AuditWriter`、`pdf-lib` 燒錄、檢視器頁。剩：**CJK 燒錄字型**（fontkit+TTF）、真 PDF <3s＝`[integration]` |
| F021 | RWD 響應式版面 | P1 | 1 | 🟡 部分 | unit-green：響應式標記＋resize 狀態保持。剩：斷點/觸控/無橫捲等幾何 AC＝`[integration]`/人工（jsdom 無法驗） |
| F022 | 後台開啟前台瀏覽頁 | P2 | 2 | 🟡 部分 | unit-green：AppShell 改 `window.open(_blank)`＋彈窗被擋 fallback、保留後台分頁、接真前台頁。剩：瀏覽器彈窗行為＝`[integration]` |

### E07 稽核與變更歷程
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F023 | 稽核軌跡記錄 | P0 | 1 | 🟡 部分 | unit-green：`AuditWriter` 契約（5 targetType，下游 import）、outbox。migration 落 SOP。**✅ append-only 真強制＋int-verified**（INSTEAD OF 觸發器阻擋 UPDATE/DELETE，對 owner/sysadmin 亦生效；REVOKE/DENY 曾被 owner 繞過）。剩：view/download→audit row 寫入路徑 e2e（隨 F020）、usage-forms 佔位改接真 AuditWriter |
| F024 | 文件調閱歷程查詢後台 | P0 | 1 | 🟡 部分 | unit-green：查詢頁（取代 ModulePlaceholder）＋篩選/RBAC/30天預設/匯出/展開。剩：真 AUDIT_LOG 資料（依 F023 整合）、P95 索引效能＝`[integration]` |
| F037 | 程序書變更歷程（欄位 Diff） | P1 | 1 | ⬜ 未開始 | **F011/F012 已發 `DocumentChangedEvent`**（種子就緒）；仍缺 `DOCUMENT_CHANGE_LOG` 持久化（綁真 publisher＋before/after/欄位 diff 落地）＋ diff 頁；依賴 F023/F024 |
| F038 | 循環樹狀圖變更歷程 | P1 | 1 | ⬜ 未開始 | 無 `LIFECYCLE_CHANGE_LOG`/快照；F008/F009 未發結構事件；無新舊樹重建/燒錄；依賴 F036/F023 |

### E08 權限矩陣
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F025 | 角色×功能權限矩陣 | P0 | 1 | ✅ 已完成-已驗證 | 機制完整並掛於實端點；數列對應功能尚無實體端點（使用表單/文件索引/調閱歷程/變更歷程/系統參數），該列 enforcement 未於實路由行使 |
| F026 | 角色×欄位權限矩陣 | P0 | 1 | 🟡 部分 | 欄位寫入拒絕僅在**建立**路徑行使，編輯面未行使（無欄位編輯端點）；AC5-9（附件/浮水印/使用部門子樹前綴 `orgCode LIKE 'prefix%'` 判定）未實作 |

### E09 RAG／AI 問答
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F027 | .xls 原件保存（RAG 來源） | P0 | 1 | 🟡 部分 | backend unit-green：`DOC_SOURCE_XLS`、.xls 上傳（覆蓋不留版本）、模板驗證 v1（5 表名集合＋每表旗標→`XLS_TEMPLATE_INVALID`，OQ-E09-04 待更多樣本校準）。剩：真 Blob/DB、.xls 二進位解析＝`[integration]` |
| F028 | .xls 模板感知抽取與清洗 | P0 | 1 | 🟡 部分 | unit-green：五表模板 parser（fixture）＋清洗＋合併儲存格重組＋`EXTRACTION_FAILED`＋`INDEX_RUN` stage=extract。剩：**真 .xls 二進位解析**＝`[integration]` |
| F029 | 章/節 chunking、metadata、向量索引 | P0 | 1 | 🟡 部分 | unit-green：節 chunker＋8 metadata＋`FakeEmbedder`＋`DOCUMENT_CHUNK`/`VECTOR_EMBEDDING` 綱要＋metadata 過濾＋失敗不留半索引。剩：**embedding 模型/維度（OQ-E09-02）**＋真 pgvector＝`[integration]` |
| F030 | 改版重抽與重建索引、舊版排除 | P0 | 1 | 🟡 部分 | unit-green：`ReindexTriggerPort`（接 `DocumentChangedEvent`）＋內容/狀態分支＋保舊索引＋`REINDEX_FAILED`。剩：**Publisher→Reindex 接線**、`DOC_USING_DEPT` 觸發、真索引＝`[integration]` |
| F031 | 管理端提取結果與重新索引狀態 | P1 | 1 | 🟡 部分 | unit-green：`DocIndexPage`（取代 placeholder）＋overview/status/chunks/reindex 端點＋三態＋RBAC。剩：真 chunk/index 資料＝`[integration]` |
| F032 | 前台自然語言問答與引用來源 | P0 | 3 | ⬜ 未開始 | 無 QA 端點/RAG 編排；`/public` placeholder；Phase 3 |
| F033 | 權限感知檢索（已公告＋使用部門） | P0 | 3 | ⬜ 未開始 | 無檢索層 metadata 過濾下推 pgvector；Phase 3 |
| F034 | 問答稽核與 AI 導引浮水印/稽核 | P0 | 3 | ⬜ 未開始 | 無 `QA_LOG`；依賴 F032 及 F020/F023/F024；Phase 3 |
| F035 | 防幻覺護欄與無結果處理 | P0 | 3 | ⬜ 未開始 | 無生成層/LLM 整合/引用強制/拒答；Phase 3 |

---

## 跨功能缺失的地基（一建、多功能解鎖）

這些是「多個功能卡在同一塊未建地基」的根因，優先處理 CP 值最高：

1. ✅→🟡 **`AUDIT_LOG` 稽核基礎（F023）** — **共用 `AuditWriter` 契約與不可變 store 已 unit-green 併入 main**；下游 F005/F007/F012/F020/F034/F037/F038 可直接 import。剩 DB REVOKE 強制＋migration＋usage-forms 佔位改接（整合階段）。
2. 🟡 **Blob／檔案上傳層** — **`BlobStore` 抽象＋FakeBlobStore＋附件/表單/來源實體已 unit-green 併入 main**（F016/F018/F027 backend）。剩真 Azure Blob 接線＋前端 UI＋migration:run（整合階段）。
3. 🟡→ **組織／人員讀取端點（org-foundation，已併 main）** — **ACCOUNT 即在職員工目錄**（同 VW_HPMUSER/AS/EMPSTS='A'）→ 不另建 PERSON；`NameResolutionService`＋`OrgDirectoryService`（tree/subtree/search）＋DESC_FULL＋session 擴充皆 unit-green。**解鎖 F017 室長名、F019 部門篩選、F020 公司/部門名**。剩 F014（制定組織下拉接線＋當責室長寫入）、F006、F026 子樹判定接上此地基（＋真 DB）。權威來源 `upstream-person-org-source.md`。
4. 🟡 **帳密登入途徑 B（F001/F003 閉環）** — **已 unit-green 併入 main**。定案：登入識別鍵＝**loginId**（非 email）；`POST /auth/login` 驗 `createManual` 寫入的 `passwordHash`。剩 build→login 真 DB 往返驗證（整合階段）。
5. 🟡 **RAG 管線（F027→F028→F029→F030→F031）** — **F027/F028/F029/F030/F031 backend 皆 unit-green 併入 main**（fixture/FakeEmbedder/fake vector store）。剩 **embedding 模型/維度（OQ-E09-02）**、真 .xls 解析、真 pgvector upsert/查詢、`DocumentChangePublisher→ReindexService` 接線＝整合階段；F032–F035 Q&A（Phase 3）仍 greenfield。

---

## 這個追蹤機制怎麼維持不腐化

1. **同 commit 更新狀態** — 任何實作/變更某功能的 commit，**同時**更新本檔該列狀態與缺口，以及該 `features/Fxxx-*.md` 的 `Status:` 行。PR/commit 描述引用 F 編號。
2. **DoD 為合併門檻** — 標 ✅ 前自問三條（AC 測試覆蓋？端到端可達？副作用落地？）。任一不過 → 標 🟡 並寫明缺口，不得標完成。
3. **每個 epic 收尾跑一次對帳** — 用本次同樣的 spec↔code 稽核（可平行子代理）重跑該 epic，更新狀態；避免「以為做完、其實有洞」。
4. **缺口即 backlog** — 「關鍵缺口」欄即待辦來源；「跨功能地基」為排序依據（先解阻擋最多者）。

---

_稽核方法：對 38 個 `features/Fxxx-*.md` 的 Acceptance Criteria 逐條 ↔ `backend/src`、`frontend/src`、測試檔交叉核對，並以「端到端可達」嚴格判定。基準 main：初審 `e6045d9` → Wave 1 `4af5a02` → Wave 2 `8d5f35d` → 整合①②（migration 落 SOP＋`test:int` 5 綠）。測試：backend 816／frontend 143 單元＋ **5 整合（`npm run test:int` vs SOP）**，tsc 全淨。（2026-07-22）_
