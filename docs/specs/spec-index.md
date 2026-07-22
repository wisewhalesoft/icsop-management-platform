# Spec Index
Product: ICSOP 文件管理平台 | Version: 1.3 | Status: Draft
Last Updated: 2026-07-17

> 進入點：所有下游 agent 先讀本檔，再依 Agent Loading Guide 選擇性載入所需檔案。定案決策見各 feature；未定案見 [open-questions.md](open-questions.md)。

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

## 關鍵定案（貫穿全 spec）
- 雙軌登入（**Azure AD OIDC**＋管理員帳密）並存；Azure AD 僅負責初次認證，其後由我方核發 JWT，Session 閒置 30 分鐘逾時（2026-07-20 由「上游簽章」改版，見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md) §12）。
- 5 種固定角色；主管/部門窗口/**系統管理員**對 ICSOP 文件（及循環/使用表單）**皆唯讀**，僅 ICSOP 管理員可寫；**主管無使用表單管理/調閱歷程權限**。
- 文件僅保存當前版本（覆蓋儲存、UUID 不變）；狀態（有效/失效/作廢）管理員手動切換、無簽核。
- 循環＝DAG（有向無環、禁止成環，多 parent/多 child、上到下）。
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
