# Spec Index
Product: ICSOP 文件管理平台 | Version: 1.6 | Status: Draft
Last Updated: 2026-08-10

> 進入點：所有下游 agent 先讀本檔，再依 Agent Loading Guide 選擇性載入所需檔案。定案決策見各 feature；未定案見 [open-questions.md](open-questions.md)。
> **🟢 2026-08-11 人類閘門通過（12 項全數裁決）：[F041 一般使用者子分類——業務／其他](features/F041-user-subtype-business-scope.md) 及其全部 delta 皆已核准。實作同日落地為 🟡 部分**（backend 117 suites／1505 tests、frontend 56 files／722 tests、兩側 tsc exit 0、migration `29 AccountUserSubtype1723766400000` 已對真 SOP DB 執行；**尚未重建 image 部署、未做瀏覽器煙霧測試**，見 [feature-status.md §F041 升 ✅ 待辦](feature-status.md#f041-to-done)）。 「一般使用者」再細分為「業務」「其他」（`ACCOUNT.userSubtype`，**不新增第 6 種角色**）；業務子分類之前台可見範圍限縮於「使用部門與其所屬部門相符（子樹展開，**重用既有 `isWithinSubtree`**）」之已公告文件，deny-by-default 涵蓋清單／搜尋／篩選／詳情直連 URL／檢視器／PDF 代理／下載／列印；「其他」與其餘 4 種角色行為完全不變。**拒絕一律回 404 `DOCUMENT_NOT_FOUND`**（刻意隱藏存在性，非 403；本系統唯一之此類例外、不推廣）；**不記錄拒絕稽核**⇒ `AUDIT_LOG` 不動、F023／F024 不需 delta。同批 delta：[F019](features/F019-public-list-browsing.md) `AC-U1`～`AC-U7`（＋一處文字勘誤）、[F020](features/F020-watermark.md) `AC-U1`～`AC-U5`、[F025](features/F025-role-function-matrix.md)／[F026](features/F026-role-field-matrix.md) `AC-U1`～`AC-U3`（**兩份矩陣逐格不變**）、[F003](features/F003-account-role-management.md) `AC-U1`～`AC-U5`、[F033](features/F033-permission-aware-retrieval.md) 釐清段、[data-model v1.5](data-model.md#account-user-subtype)、[error-handling v1.3](error-handling.md#dept-restriction)（**不新增錯誤碼**）。**唯一實質新增＝F041 AC-40／F019 `AC-U7`**：前台清單頂部範圍說明句於業務視角換為專屬文案（孤兒帳號沿用同一句；**與「空狀態文案 `查無符合結果` 不分支」為兩件不同的字串**）。逐題裁決紀錄見 [F041 §OQ 裁決紀錄](features/F041-user-subtype-business-scope.md#oq-dependency)。
> **🟢 2026-08-07 人類閘門已通過（含 4 項裁決）**：[F040 循環子分類](features/F040-lifecycle-subcategory.md) 及其於 F007／F010／F011／F017／F019／F008／F009／F036／F038 之 AC delta、data-model v1.4（`LIFECYCLE.subcategory`）、error-handling v1.2（3 個 `LIFECYCLE_*` 錯誤碼）**皆已核准，可進入實作**。四項裁決：① **不新增 `lifecycleName` API payload 欄位**——缺 `lifecycleId` 維持既有 `DOCUMENT_REQUIRED_FIELD_MISSING`，`LIFECYCLE_SUBCATEGORY_REQUIRED` 之後端唯一觸發收斂為「所帶 `lifecycleId` 在其名稱下非合法唯一解」；② OQ-E03-10 定案＝唯一性比對涵蓋全部列不分 `status`；③ 示範子分類統一為 `消金`／`企金`／`子公司`；④ F010 AC-S4 明示 `lifecycleDisplayName` 選項屬**第二段**選擇器。
> **⚠ 2026-08-08 追加裁決 5（規格↔schema 矛盾收斂）**：`LIFECYCLE_CHANGE_LOG` **不新增** `lifecycleName` 快照欄、**不新增 migration**；該表之循環名稱改以 `lifecycleId` **join `LIFECYCLE` 取當前值**再經 `lifecycleDisplayName` 組合。已改寫 [F040](features/F040-lifecycle-subcategory.md) AC-34、收斂 AC-36 適用範圍為 `AUDIT_LOG`、同步 [F008](features/F008-dag-node-edge.md) AC-S2 與 [F038](features/F038-lifecycle-tree-change-history.md) AC-S2、[data-model](data-model.md#lifecyclechangelog-entity)（移除該欄列）與 [er-diagram](diagrams/er-diagram.mmd)。**明確接受之代價＝循環改名／改子分類後舊事件顯示新名稱、失去名稱快照語意**（`AUDIT_LOG.lifecycleName` 仍為快照）；追溯見 [open-questions.md](open-questions.md) OQ-E07-11。

## Features
| ID | Name | Priority | Phase | Epic/Story | File |
|----|------|----------|-------|-----------|------|
| F001 | 雙軌驗證登入與 Session 管理 | P0 | 1 | E01 US-001/002/004 | features/F001-auth-login-session.md |
| F002 | 登入後角色分流導向 | P0 | 1 | E01 US-003 | features/F002-role-based-routing.md |
| F003 | 帳號與角色指派管理 | P0 | 1 | E01 US-005/006 | features/F003-account-role-management.md |
| F004 | 組織資料同步（每日排程＋手動） | P0 | 1 | E02 US-010/011 | features/F004-org-sync.md |
| F005 | 離職者自動停用帳號 | P0 | 1 | E02 US-012 | features/F005-auto-disable-departed.md |
| F006 | 組織異動影響提示與異動管理後台 | P1 | 1/2 | E02 US-013/014 | features/F006-org-change-alert-backend.md |
| F007 | 循環池 CRUD | P0 | 1 | E03 US-020 | features/F007-lifecycle-pool-crud.md |
| F008 | DAG 節點與連線維護（含防環） | P0 | 1 | E03 US-021/022 | features/F008-dag-node-edge.md |
| F009 | 節點抽屜維護與文件過濾警示 | P0 | 1 | E03 US-023/024 | features/F009-node-drawer-maintenance.md |
| F010 | 建立 ICSOP 文件 | P0 | 1 | E04 US-030 | features/F010-create-document.md |
| F011 | 編輯 ICSOP 文件與版本對照 | P0 | 1 | E04 US-031 | features/F011-edit-with-comparison.md |
| F012 | 文件狀態切換 | P0 | 1 | E04 US-032 | features/F012-document-status-toggle.md |
| F013 | 文件編號唯一性管理 | P0 | 1 | E04 US-033 | features/F013-document-number-uniqueness.md |
| F014 | 制定組織與當責室長設定 | P0 | 1 | E04 US-034 | features/F014-accountable-dept-chief.md |
| F015 | 文件連結點管理 | P1 | 1 | E04 US-035 | features/F015-document-cross-link.md |
| F016 | PDF 與 OJT 附件上傳 | P0 | 1 | E04 US-036 | features/F016-pdf-ojt-attachment.md |
| F017 | 後台文件清單與搜尋 | P0 | 1 | E04 US-037 | features/F017-backend-document-list.md |
| F018 | 使用表單管理 | P1 | 1 | E05 US-040/041 | features/F018-usage-form-management.md |
| F019 | 前台清單瀏覽（排序/搜尋/篩選） | P0 | 1 | E06 US-050/051/052 | features/F019-public-list-browsing.md |
| F020 | 文件浮水印（疊加＋燒錄） | P0 | 1 | E06 US-053/054 | features/F020-watermark.md |
| F021 | RWD 響應式版面 | P1 | 1 | E06 US-055 | features/F021-rwd-responsive.md |
| F022 | 後台開啟前台瀏覽頁 | P2 | 2 | E06 US-056 | features/F022-backend-launch-public.md |
| F023 | 稽核軌跡記錄 | P0 | 1 | E07 US-060 | features/F023-audit-logging.md |
| F024 | 文件調閱歷程查詢後台 | P0 | 1 | E07 US-061 | features/F024-access-history-query.md |
| F025 | 角色×功能權限矩陣 | P0 | 1 | E08 US-070 | features/F025-role-function-matrix.md |
| F026 | 角色×欄位權限矩陣 | P0 | 1 | E08 US-071 | features/F026-role-field-matrix.md |
| F027 | .xls 原件保存（RAG 內容來源） | P0 | 1 | E09 US-090 | features/F027-xls-source-presentation-pdf.md |
| F028 | ICSOP .xls 模板感知內文抽取與清洗 | P0 | 1 | E09 US-091 | features/F028-template-aware-extraction.md |
| F029 | 章/節 chunking、metadata 與向量索引 | P0 | 1 | E09 US-092 | features/F029-chunking-metadata-index.md |
| F030 | 改版重抽與重建索引、舊版排除 | P0 | 1 | E09 US-093 | features/F030-reindex-version-status.md |
| F031 | 管理端提取結果與重新索引狀態 | P1 | 1 | E09 US-094 | features/F031-admin-index-visibility.md |
| F032 | 前台自然語言問答與引用來源 | P0 | 3 | E09 US-095 | features/F032-frontend-nl-qa.md |
| F033 | 權限感知檢索（僅已公告＋使用部門） | P0 | 3 | E09 US-096 | features/F033-permission-aware-retrieval.md |
| F034 | 問答稽核與經 AI 導引之浮水印/稽核 | P0 | 3 | E09 US-097 | features/F034-qa-audit-watermark.md |
| F035 | 防幻覺護欄與無結果處理 | P0 | 3 | E09 US-098 | features/F035-hallucination-guardrail.md |
| F036 | 循環樹狀圖預覽（唯讀＋浮水印） | P0 | 1 | E03 US-025 | features/F036-lifecycle-tree-preview.md |
| F037 | ICSOP 程序書變更歷程（欄位 Before/After Diff） | P1 | 1 | E07 US-062 | features/F037-document-change-history.md |
| F038 | 循環樹狀圖變更歷程（新舊版預覽／下載燒錄浮水印） | P1 | 1 | E07 US-063 | features/F038-lifecycle-tree-change-history.md |
| F039 | 附錄管理（附錄池／多對多關聯＋自訂排序） | P1 | 1 | E10 US-100/101/102 | features/F039-appendix-management.md |
| F040 | **循環子分類（橫切：唯一性／顯示／選取有效性）** 🟢 APPROVED | P0 | 1 | E03（需求來源＝口述，無 US） | features/F040-lifecycle-subcategory.md |
| F041 | **一般使用者子分類——業務／其他（業務限縮於使用部門）** 🟢 APPROVED | P0 | 1 | E08 US-072（主）＋E06 US-057（從） | features/F041-user-subtype-business-scope.md |

## Supporting Documents
| Document | File | Relevant For |
|----------|------|--------------|
| **Feature Status Tracker（完成度彙總＋DoD）** | **feature-status.md** | **All agents — 開工前先看功能真實狀態與缺口** |
| Overview | overview.md | All agents |
| Scope | scope.md | Architect, Product |
| NFR | nfr.md | Architect, DevOps |
| Data Model | data-model.md | Architect, TDD, DB |
| Error Handling | error-handling.md | TDD, QA |
| Open Questions | open-questions.md | All agents |
| 上游來源契約 | upstream-hr-source-contract.md | Architect, TDD, DB, DevOps |
| ICSOP 模板分析（RAG 抽取依據） | icsop-template-analysis.md | E09 (F027–F029), TDD |

## Diagrams
| Diagram | File | Referenced By |
|---------|------|---------------|
| System Architecture | diagrams/system-architecture.mmd | overview.md |
| ER Diagram | diagrams/er-diagram.mmd | data-model.md |
| Document Status Lifecycle | diagrams/document-status-lifecycle.mmd | data-model.md, F012 |
| F001 登入驗簽 | diagrams/F001-auth-login.mmd | F001 |
| F004 組織同步 | diagrams/F004-org-sync.mmd | F004 |
| F008 DAG 防環 | diagrams/F008-dag-cycle-prevention.mmd | F008 |
| F009 節點改派交易 | diagrams/F009-node-reassign.mmd | F009 |
| F019 前台排序管線 | diagrams/F019-public-list-sorting.mmd | F019 |
| F020 浮水印與稽核 | diagrams/F020-watermark-audit.mmd | F020, F023, F034 |
| E09 RAG Ingestion 管線 | diagrams/F028-rag-ingestion-pipeline.mmd | F027–F031 |
| E09 權限感知問答查詢 | diagrams/F033-permission-aware-query.mmd | F032, F033, F034, F035 |
| F040 循環子分類唯一性判定 | diagrams/F040-lifecycle-subcategory.mmd | F040 |
| F041 使用者子分類可見性判定 | diagrams/F041-user-subtype-visibility.mmd | F041 |

## 關鍵定案（貫穿全 spec）
- 雙軌登入（**Azure AD OIDC**＋管理員帳密）並存；Azure AD 僅負責初次認證，其後由我方核發 JWT，Session 閒置 30 分鐘逾時（2026-07-20 由「上游簽章」改版，見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md) §12）。
- 5 種固定角色；主管/部門窗口/**系統管理員**對 ICSOP 文件（及循環/使用表單/**附錄**）**皆唯讀**，僅 ICSOP 管理員可寫；**主管無使用表單管理/附錄管理/調閱歷程權限**。
- **附錄（E10/F039，2026-08-06）**：與使用表單同構之**附錄池**（多對多共用、覆蓋不留版本、下載不燒錄浮水印、覆蓋警示門檻＝引用 ≥2），差異在**每份文件內帶自訂顯示順序** `DOC_APPENDIX.sortOrder`（建立/編輯以上移/下移調整，非拖曳）；前台下載寫稽核（`targetType=APPENDIX`，F024 歸「文件」類）。
- 文件僅保存當前版本（覆蓋儲存、UUID 不變）；狀態（有效/失效/作廢）管理員手動切換、無簽核。
- 循環＝DAG（有向無環、禁止成環，多 parent/多 child、上到下）。
- **循環子分類（E03/F040，2026-08-07，🟢 APPROVED）**：`LIFECYCLE` 新增非必填 `subcategory`；**循環業務身分＝`(name, subcategory)` 組合**（同名不同子分類＝彼此獨立的循環）。兩條不變式：`(name, subcategory)` 唯一（INV-1）＋同一名稱之「無子分類」與「有子分類」不得並存（INV-2，雙向）。凡用到循環池之選取（文件建立/編輯），名稱底下有子分類時**必須選到具體子分類**才算有效。顯示一律 `名稱（子分類）`／`名稱`（`lifecycleDisplayName`）。**ICSOP 文件編號第 2 段循環代碼仍僅依名稱推導，子分類不參與、既有編號不變。**
- **一般使用者子分類（E08＋E06／F041，2026-08-11，🟢 APPROVED）**：`ACCOUNT` 新增 `userSubtype ∈ {business, other}`（`NOT NULL DEFAULT 'other'`，**僅對 `roleCode='User'` 生效**，**不新增第 6 種角色**）。**業務**子分類使用者之前台可見範圍限縮為「已公告 **AND** 使用部門相符」（相符判定**重用既有 `isWithinSubtree`**，不新增第二套邏輯），deny-by-default 涵蓋清單／搜尋／篩選／詳情直連 URL／檢視器／PDF 代理／下載／列印，**拒絕一律回 404 `DOCUMENT_NOT_FOUND`**（隱藏存在性）且**不寫任何稽核**；**其他**子分類與其餘 4 種角色**行為完全不變**（使用部門僅影響置頂排序）。前台清單頂部**範圍說明句**依 viewer 分支（`SCOPE_NOTICE_BUSINESS`／`SCOPE_NOTICE_OTHER`，孤兒帳號沿用業務句），惟**空狀態文案 `查無符合結果` 逐字不分支**。F025 功能矩陣與 F026 欄位矩陣**逐格不變**、`AUDIT_LOG` 不動。RAG（F033）本輪僅記錄未來下限保證。
- 文件「所屬循環」建立時必填；「所屬節點」以節點抽屜（F009）為**唯一權威寫入路徑**。
- 浮水印＝伺服器端動態：`{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現}-{當下時間}`（含固定機密聲明）；下載/列印於 server 端燒錄。
- 技術棧：React+TS 前端、NestJS+TypeORM 後端、React Flow 類 DAG、Docker Compose、應用 DB=MSSQL、檔案存 Azure Blob（storage 介面抽象化）。
- 文件名稱為正式可讀標題欄位（定案）；前台清單顯示名稱、搜尋涵蓋編號＋名稱。一般使用者前台僅顯示「已公告」文件（＝有效且公告日期已過；進度中/失效/作廢隱藏）。
- **上游人資來源（2026-07-20 dev 環境唯讀實測定案；資料已遮罩，值層級統計待正式環境覆核。見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md)）**：上游組織實際為 **5 層**（公司＞本部＞部＞處/室＞課），階層一律由**部門代碼前綴**推導（`P_DEPTID`／`TOP_DEPTID`／`S_DEPTID` 三欄皆不可用）；人員主來源為 `VW_HPMUSER`（`USERID` 為穩定鍵、`EMPSTS='A'` 為在職判定）；本輪同步範圍限 `COMPID='AS'`（和潤企業），資料模型保留公司維度以利日後多公司擴充。
- E09 智慧問答（依 `AI-RAG-評估報告.md` 定案）：本地開源 LLM＋**RAG（非微調）**；**雙軌 ingestion**（權威 .xls 原件〔RAG 內容來源〕＋**另行手動上傳之呈現用 PDF**〔OQ-E09-10 定案：取消自動轉檔、各自獨立〕／檢索內文 chunk）；模板感知 parser 抽取；**權限感知過濾在檢索層**（僅「已公告＋使用部門」，防 prompt injection）；硬體 L40S×4；分期（F027–F031 Phase 1、F032–F035 Phase 3）。選型/量化目標見 open-questions（OQ-E09-*）。

## Agent Loading Guide
| Agent Role | Required Files |
|------------|----------------|
| Architect | spec-index.md, overview.md, scope.md, nfr.md, data-model.md, upstream-hr-source-contract.md, diagrams/* |
| TDD Developer | spec-index.md, features/F###-*.md（指派）, data-model.md, upstream-hr-source-contract.md（涉及組織/帳號同步、浮水印、部門權限過濾時） |
| QA / Tester | spec-index.md, features/F###-*.md, error-handling.md |
| UI/UX | spec-index.md, overview.md, features/F###-*.md（指派，尤其 F008/F009/F019/F020/F021/F031/F032/F036） |
| DevOps | spec-index.md, nfr.md（含 #rag-security on-prem L40S×4） |
