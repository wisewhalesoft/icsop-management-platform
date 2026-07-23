# Feature Status Tracker（功能完成度追蹤）

> **這是全專案「功能是否真正完成」的唯一彙總視圖（single source of truth）。**
> 每個 Fxxx 在此有一列，狀態以嚴格 Definition of Done 判定。功能規格散在 `features/Fxxx-*.md`，
> 各檔 `Status:` 行是局部狀態；**本檔負責把它們攤在一頁、並以「端到端可達」把關**，避免「有 commit、有按鈕就當作完成」。
>
> Product: ICSOP 文件管理平台 · 稽核基準：**2026-07-22**（初審 @ `e6045d9`；平行 worktree 一輪推進後 @ `4af5a02`）· 對照 [spec-index.md](spec-index.md)

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
| ✅ 已完成-已驗證 | **5** | F002 F004 F008 F009 F025 |
| 🟡 部分 | **14** | F001 F003 F005 F007 F010 F012 F013 F016 F017 F018 F023 F024 F026 F027 |
| 🔵 進行中 | **1** | F014 |
| ⬜ 未開始 | **18** | F006 F011 F015 F019 F020 F021 F022 F036 F037 F038 F028 F029 F030 F031 F032 F033 F034 F035 |
| | **38** | |

> **2026-07-22 平行 worktree 一輪推進**（3 分支已併回 main、全 unit-green）：F023/F024（audit）、F016/F018/F027（storage backend）自 ⬜→🟡；F001 途徑B＋F003 閉環自「死鏈」推進至 unit-green。**皆停在 🟡**：DoD 要求端到端可達，而這批的關鍵路徑（build→login 真 DB 往返、AUDIT_LOG 持久化/REVOKE、Blob/上傳）屬 `[integration]`、待序列化 DB 階段才可升 ✅。backend 500 測、frontend 119 測、tsc 全淨。

**P0-MVP 尚未完成者（優先盯）**：F001 F003 F005 F007 F010 F012 F013 F016 F017 F019 F020 F023 F024 F026 F027 F028 F029 F030 F036，以及 Phase 3 之 F032 F033 F034 F035。

---

## 逐功能狀態

### E01 驗證與帳號
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F001 | 雙軌驗證登入與 Session | P0 | 1 | 🟡 部分 | 途徑 A（OIDC）已端到端；**途徑 B 帳密登入已補**（`POST /auth/login` by loginId、統一 `AUTH_INVALID_CREDENTIALS`、unit-green）；剩：登出非「即時撤銷」（無狀態 JWT，需 denylist infra）＋帳密登入節流未做（本輪外） |
| F002 | 登入後角色分流導向 | P0 | 1 | ✅ 已完成-已驗證 | 邊界：session 有效但 roleCode=undefined 不會導回登入頁（低風險） |
| F003 | 帳號與角色指派管理 | P0 | 1 | 🟡 部分 | **死鏈已於讀取端閉合**（決策：登入識別鍵＝loginId；帳密登入路徑驗 `createManual` 寫入的 `passwordHash`，無需寫 email）。剩：build→login→`/auth/me` 真 MSSQL 往返＝`[integration]` 待驗，通過後可升 ✅ |

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
| F011 | 編輯 ICSOP 文件與版本對照 | P0 | 1 | ⬜ 未開始 | **完全未做**：無 `PATCH :id` 編輯端點、無 `store.update`、無編輯頁、無新舊值對照、無編輯側編號唯一性排除自身 |
| F012 | 文件狀態切換 | P0 | 1 | 🟡 部分 | 切換＋切回有效重驗編號已測；OQ-E04-02「切換原因」欄未做；變更歷程 F037 事件＋操作者稽核未做 |
| F013 | 文件編號唯一性管理 | P0 | 1 | 🟡 部分 | 建立/狀態切換路徑可達且測試；編輯側排除自身**不可達**（依賴未建之 F011）；併發衝突 DB 會丟 `QueryFailedError` 未捕捉映射 → 恐回 500 而非 409 |
| F014 | 制定組織與當責室長設定 | P0 | 1 | 🔵 進行中 | 僅 scalar 欄位骨架（3 組織 ID＋主要室長可存）；**無組織/人員讀取端點**、無三級級聯下拉、無次要室長/使用部門關聯表、無 managerEmpNo 預設候選；UI 為 disabled 佔位 |
| F015 | 文件連結點管理 | P1 | 1 | ⬜ 未開始 | 僅欄位鍵佔位（送出即被丟棄）；無 `DOCUMENT_LINK` 表/端點/目標存在性驗證/UI |
| F016 | PDF 與 OJT 附件上傳 | P0 | 1 | 🟡 部分 | backend unit-green：Blob 抽象（`BlobStore`＋FakeBlobStore）、`DOCUMENT_ATTACHMENT`、兩層授權、格式白名單≤50MB、單份覆蓋、受控下載。剩：**前端上傳 UI**、真 Azure Blob＋migration＝`[integration]` |
| F017 | 後台文件清單與搜尋 | P0 | 1 | 🟡 部分 | 統計卡＋關鍵字/狀態篩選＋衍生狀態＋未指派警示可用；14 欄只做 ~7、9 篩選只做 2（缺循環別/編號/書名/制定/室長/連結 combobox）；**無分頁**（後端 take 2000） |

### E05 使用表單
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F018 | 使用表單管理 | P1 | 1 | 🟡 部分 | backend unit-green：`USAGE_FORM_POOL`＋`DOC_USAGE_FORM` 多對多、上傳/覆蓋（引用≥2 警示）/移除（`USAGE_FORM_IN_USE`）、下載稽核（佔位）。剩：**前端管理頁**、真 Blob/DB、稽核接真 AuditWriter＝`[integration]` |

### E06 前台瀏覽
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F019 | 前台清單瀏覽（排序/搜尋/篩選） | P0 | 1 | ⬜ 未開始 | `/public` 為 placeholder；無公開 GET 端點（強制 status=有效 AND 公告≤今日）、置頂排序、使用部門子樹前綴篩選、分頁與整個前台 UI |
| F020 | 文件浮水印（疊加＋燒錄） | P0 | 1 | ⬜ 未開始 | 無浮水印快照組裝、檢視器疊加、伺服端 PDF 內容層燒錄、VIEW/DOWNLOAD/PRINT 端點與稽核觸發（依賴 F016） |
| F021 | RWD 響應式版面 | P1 | 1 | ⬜ 未開始 | 前台頁不存在，三斷點/行動檢視器無法行使（依賴 F019/F020；後台已用 Tailwind RWD 但非本 AC 範圍） |
| F022 | 後台開啟前台瀏覽頁 | P2 | 2 | ⬜ 未開始 | 現只有 same-tab `<Link to="/public">` 到 placeholder；缺新視窗開啟、置頂排序、彈窗被擋 fallback、真前台目標 |

### E07 稽核與變更歷程
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F023 | 稽核軌跡記錄 | P0 | 1 | 🟡 部分 | unit-green：`AuditWriter` 共用契約（5 targetType 判別聯合，**下游 F020/F034/F037/F038 直接 import**）、AUDIT_LOG append-only 不可變 store、outbox 重試。剩：DB `REVOKE UPDATE/DELETE` 不可變強制＋migration＋usage-forms 佔位改接＝`[integration]` |
| F024 | 文件調閱歷程查詢後台 | P0 | 1 | 🟡 部分 | unit-green：查詢頁（取代 ModulePlaceholder）＋篩選/RBAC/30天預設/匯出/展開。剩：真 AUDIT_LOG 資料（依 F023 整合）、P95 索引效能＝`[integration]` |
| F037 | 程序書變更歷程（欄位 Diff） | P1 | 1 | ⬜ 未開始 | 無 `DOCUMENT_CHANGE_LOG`；來源交易（F011/F012/F014/F016）未發變更事件；無 diff 頁；依賴 F023/F024 |
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
| F028 | .xls 模板感知抽取與清洗 | P0 | 1 | ⬜ 未開始 | 無五表模板 parser、清洗、合併儲存格重組、`INDEX_RUN`；依賴 F027 |
| F029 | 章/節 chunking、metadata、向量索引 | P0 | 1 | ⬜ 未開始 | 僅 pgvector 容器＋`CREATE EXTENSION vector`（無表）；無 chunker、8 項 metadata、embedding、`VECTOR_EMBEDDING` 寫入 |
| F030 | 改版重抽與重建索引、舊版排除 | P0 | 1 | ⬜ 未開始 | 無變更偵測事件接線、重抽分支、狀態變更輕量分支、失敗保舊索引 |
| F031 | 管理端提取結果與重新索引狀態 | P1 | 1 | ⬜ 未開始 | 路由落 `ModulePlaceholder`；無 chunk 預覽/索引狀態/手動重索引端點與資料 |
| F032 | 前台自然語言問答與引用來源 | P0 | 3 | ⬜ 未開始 | 無 QA 端點/RAG 編排；`/public` placeholder；Phase 3 |
| F033 | 權限感知檢索（已公告＋使用部門） | P0 | 3 | ⬜ 未開始 | 無檢索層 metadata 過濾下推 pgvector；Phase 3 |
| F034 | 問答稽核與 AI 導引浮水印/稽核 | P0 | 3 | ⬜ 未開始 | 無 `QA_LOG`；依賴 F032 及 F020/F023/F024；Phase 3 |
| F035 | 防幻覺護欄與無結果處理 | P0 | 3 | ⬜ 未開始 | 無生成層/LLM 整合/引用強制/拒答；Phase 3 |

---

## 跨功能缺失的地基（一建、多功能解鎖）

這些是「多個功能卡在同一塊未建地基」的根因，優先處理 CP 值最高：

1. ✅→🟡 **`AUDIT_LOG` 稽核基礎（F023）** — **共用 `AuditWriter` 契約與不可變 store 已 unit-green 併入 main**；下游 F005/F007/F012/F020/F034/F037/F038 可直接 import。剩 DB REVOKE 強制＋migration＋usage-forms 佔位改接（整合階段）。
2. 🟡 **Blob／檔案上傳層** — **`BlobStore` 抽象＋FakeBlobStore＋附件/表單/來源實體已 unit-green 併入 main**（F016/F018/F027 backend）。剩真 Azure Blob 接線＋前端 UI＋migration:run（整合階段）。
3. **組織／人員讀取端點（F014 前置）** — 阻擋 F014 制定組織三級與當責室長、F006 異動提示、F026 使用部門子樹判定。需 `PERSON` 實體＋ORG_UNIT 讀取 API＋級聯查詢＋離職過濾。**（尚未動工）**
4. 🟡 **帳密登入途徑 B（F001/F003 閉環）** — **已 unit-green 併入 main**。定案：登入識別鍵＝**loginId**（非 email）；`POST /auth/login` 驗 `createManual` 寫入的 `passwordHash`。剩 build→login 真 DB 往返驗證（整合階段）。
5. **RAG 管線（F027→F028→F029）** — F027 .xls 原件保存 backend 已 unit-green；F028/F029 抽取→chunk→embed→index 仍 greenfield。

---

## 這個追蹤機制怎麼維持不腐化

1. **同 commit 更新狀態** — 任何實作/變更某功能的 commit，**同時**更新本檔該列狀態與缺口，以及該 `features/Fxxx-*.md` 的 `Status:` 行。PR/commit 描述引用 F 編號。
2. **DoD 為合併門檻** — 標 ✅ 前自問三條（AC 測試覆蓋？端到端可達？副作用落地？）。任一不過 → 標 🟡 並寫明缺口，不得標完成。
3. **每個 epic 收尾跑一次對帳** — 用本次同樣的 spec↔code 稽核（可平行子代理）重跑該 epic，更新狀態；避免「以為做完、其實有洞」。
4. **缺口即 backlog** — 「關鍵缺口」欄即待辦來源；「跨功能地基」為排序依據（先解阻擋最多者）。

---

_稽核方法：對 38 個 `features/Fxxx-*.md` 的 Acceptance Criteria 逐條 ↔ `backend/src`、`frontend/src`、測試檔交叉核對，並以「端到端可達」嚴格判定。基準 main @ `e6045d9`（2026-07-22）。_
