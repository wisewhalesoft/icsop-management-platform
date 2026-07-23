# Worktree Guide: feature/public-F019-F022 (Wave 2)

> 導航指引，不重複 spec 內容。
> ⚠ **依 /tdd：先寫 test-spec → 失敗測試（red）→ 最小實作（green）→ 重構 → impl log。不得跳過測試設計直接實作。**

## 目標
E06 前台瀏覽（P0）。新建前台頁與公開讀取端點＋浮水印，幾乎全新檔案。
- **F019 前台清單瀏覽**：公開 GET 端點（強制 `status=有效 AND 公告日≤今日`）、置頂（使用者部門）＋編號降冪排序、關鍵字（編號+名稱）、部門/狀態/循環 AND 篩選（`orgCode LIKE 'prefix%'` 子樹展開）、分頁；前台清單 UI（取代 `PublicPlaceholder`）。
- **F020 文件浮水印**：快照組裝（部層 derive、`DESC_CHI` 末段、空欄分隔符收合、`COMPFULLNM` 全稱）、檢視器疊加、**伺服端 PDF 內容層燒錄**（`pdf-lib`）、VIEW/DOWNLOAD/PRINT 端點＋稽核觸發、未登入導向、F025 下載 gate。
- **F021 RWD**：前台三斷點（1440/375/360）＋行動檢視器 zoom/scroll、觸控 ≥44px。
- **F022 後台開前台**：新視窗開啟保留後台分頁、置頂排序、彈窗被擋 fallback。

## 可用地基（Wave 1 已併 main，**重用勿重建**）
- **附件 PDF 來源**：`backend/src/attachments/`（`AttachmentsService.getAttachmentRef(documentId, type)`）＋`backend/src/storage/` `BlobStore`。F020 燒錄取 ICSOP PDF 由此。
- **AuditWriter**：`backend/src/audit/`（注入 `AuditWriterService`；`AuditAccessEvent` targetType=DOCUMENT、actionType VIEW/DOWNLOAD/PRINT，帶 `watermarkSnapshot`）。F020 三動作稽核由此。
- 衍生狀態：`documents/display-status.ts`（已公告/進度中）可重用於前台。
- ⚠ **org 名稱解析未建**（Wave 3 org-foundation）→ 制定公司/部門名等**先以 ID 或既有欄位顯示、留 TODO**，勿自建 org 讀取端點（避免與 Wave 3 撞）。

## 指派 Features
| F### | 名稱 | P | 狀態 | 依賴 |
|------|------|---|------|------|
| F019 | 前台清單瀏覽 | P0 | ⬜ | 文件資料（有）；org 名稱解析（stub） |
| F020 | 文件浮水印 | P0 | ⬜ | 附件 PDF（有）、AuditWriter（有）、pdf-lib（新相依） |
| F021 | RWD 響應式 | P1 | ⬜ | F019/F020 |
| F022 | 後台開前台 | P2 | ⬜ | F019 |

## Spec 參照
| F### | Feature Spec | Test Design | Prototype |
|------|-------------|-------------|-----------|
| F019 | `docs/specs/features/F019-public-list-browsing.md` | ⚠ 先產出 | 見 `docs/ui-ux-design-overview.md` 前台頁對照 |
| F020 | `docs/specs/features/F020-watermark.md` | ⚠ 先產出 | 前台檢視器 prototype（同上對照） |
| F021 | `docs/specs/features/F021-rwd-responsive.md` | ⚠ 先產出 | — |
| F022 | `docs/specs/features/F022-backend-launch-public.md` | ⚠ 先產出 | `AppShell`「瀏覽文件網頁」入口 |

## 全域參照
完成度：`docs/specs/feature-status.md`｜NFR（浮水印 <3s、RWD）：`docs/specs/nfr.md`｜Data Model：`docs/specs/data-model.md`｜UI 對照：`docs/ui-ux-design-overview.md`

## 跨分支依賴 / 衝突面
- 需先合併：無。與 doc-edit / rag **檔案集不重疊**（前台頁＋新 public 端點）。公開讀取盡量放**新 `PublicDocumentsController`／public module**，勿改 `documents.service.ts`（避免撞 doc-edit）。
- 衝突熱點：`frontend/src/App.tsx`（前台路由）、`endpoints.ts`（additive）、`app.module.ts`、migration 時間戳。

## TDD 流程
先產 `docs/test-specs/features/F###-test.md` → red → green → refactor → impl log ＋ 更新 `Fxxx-*.md` Status。**勿改** shared spec，回報缺口。pdf-lib 若引入需 `npm install` 並記於 impl log。

## 並行硬限制（同 Wave 1）
單元測試可並行；浮水印以樣本/替身測（不打真 Blob）；DB/docker 整合序列化、各指自己 dev DB 名。埠固定。各自 `npm install`。migration 勿執行。conventional commits ＋ `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
