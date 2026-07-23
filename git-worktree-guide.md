# Worktree Guide: feature/storage-F016-F018-F027

> 由 Git Worktree Design Skill 產生。本文件為**導航指引**，不重複 spec 內容。
> ⚠ **依 /tdd：先寫 test-spec → 寫失敗測試（red）→ 最小實作（green）→ 重構 → impl log。不得跳過測試設計直接實作。**

## 目標
建立全站缺失的**檔案儲存/上傳地基**（[[feature-status.md]] 標為附件/RAG 來源的共同前置）：
- **Blob 抽象**：新增 `backend/src/storage/`（Azure Blob 介面＋本機/測試替身），供以下共用。
- **F016 PDF 與 OJT 附件上傳**：附件實體＋Blob 參照、格式白名單（`FILE_FORMAT_NOT_ALLOWED`）、大小上限、PDF/OJT 各 1 份覆蓋語意、受控下載＋未授權拒絕（`FILE_ACCESS_DENIED`）。
- **F018 使用表單管理**：表單池模組＋CRUD 畫面（`prototypes/19`）、excel/pdf 上傳、文件多對多可搜尋多選、覆蓋/移除二次確認、下載稽核。
- **F027 .xls 原件保存**：`DOC_SOURCE_XLS` 實體、.xls 上傳、ICSOP 模板驗證（`XLS_TEMPLATE_INVALID`）、覆蓋不留版本；為 RAG（F028+）之內容來源。

> 三者共用同一 Blob 抽象；先把介面定穩再各自接。附件/表單與 documents 的掛接點是與 doc-family worktree 的**唯一衝突面**，接線盡量薄。

## 分支資訊
| 項目 | 值 |
|------|-----|
| 分支 | `feature/storage-F016-F018-F027` |
| 基於 | `main` @ `9837b61` |
| 路徑 | `C:/Users/cacab/Claude/icsop-storage` |
| 建立 | 2026-07-22 |

## 指派 Features（狀態源＝docs/specs/feature-status.md）
| F### | 名稱 | 優先級 | 目前狀態 | 本 worktree 目標 |
|------|------|--------|----------|------------------|
| F016 | PDF 與 OJT 附件上傳 | P0 | ⬜ 未開始 | Blob 抽象＋附件實體＋上傳/下載/格式/大小/授權 |
| F018 | 使用表單管理 | P1 | ⬜ 未開始 | 表單池模組＋CRUD 畫面＋多對多關聯 |
| F027 | .xls 原件保存（RAG 來源） | P0 | ⬜ 未開始 | DOC_SOURCE_XLS＋.xls 上傳＋模板驗證 |

## Spec 參照（直接讀取，勿重複）
| F### | Feature Spec | Test Design | Prototype |
|------|-------------|-------------|-----------|
| F016 | `docs/specs/features/F016-pdf-ojt-attachment.md` | ⚠ **尚無，須先產出** | `prototypes/14-document-create.html`（STEP4 附件） |
| F018 | `docs/specs/features/F018-usage-form-management.md` | ⚠ **尚無，須先產出** | `prototypes/19-usage-form-management.html` |
| F027 | `docs/specs/features/F027-xls-source-presentation-pdf.md` | ⚠ **尚無，須先產出** | `prototypes/14-document-create.html`（STEP4 .xls） |

## 全域參照
| 文件 | 路徑 |
|------|------|
| 完成度追蹤（狀態源） | `docs/specs/feature-status.md` |
| Data Model | `docs/specs/data-model.md`（附件/來源實體綱要） |
| NFR | `docs/specs/nfr.md`（單檔上限、格式；OQ-E04-06） |
| 模板分析（F027/F028 依據） | `docs/specs/icsop-template-analysis.md` |
| Architecture | `docs/specs/architecture-spec.md`（Blob/儲存邊界） |

## 跨分支依賴
| 類型 | 說明 |
|------|------|
| 需先合併 | 無（基礎線）；三 feature 共用 Blob 抽象，先做抽象再做各 feature |
| 被依賴於 | F020 浮水印燒錄、F028+ RAG（.xls 來源）依賴本 worktree 產物 → 建議早併回 main |
| 共用檔案熱點 | 新增 `backend/src/storage/*`＋附件/表單/來源實體（新，衝突低）；與 doc-family worktree 僅在 documents 掛接點交會；migration 時間戳勿撞 audit worktree |

## TDD 開發流程（依 /tdd，每個 feature 依序）
1. **寫 test-spec** — 先用 `/tdd`（或 test-designer agent）依 AC 產出 test scenarios，落檔 `docs/test-specs/features/F###-test.md`（本專案尚無此目錄，一併建立）。Blob 抽象以測試替身（fake store）驅動，不打真 Azure。
2. **讀** feature spec ＋ data-model ＋ nfr（格式/大小）＋ prototype ＋（F027）模板分析。
3. **寫失敗測試** → **red** → **最小實作 green** → **refactor**。
4. **收尾** — impl log `docs/implementation-logs/F016|F018|F027-*.md`，**同 commit 更新 `feature-status.md` 三列＋各 `Fxxx-*.md` 的 `Status:` 行**（DoD：AC 測試＋端到端可達＋Blob 真的存取＋授權拒絕生效）。

## 專案特有注意（並行環境）
- **`.env` 已複製**。單元測試（Blob 用替身）不需真 Azure/DB → 可與其他 worktree 平行。
- **Azure Blob 憑證**：若整合測真 Blob，所需連線字串加到本 worktree `.env`（勿提交）。
- **migration 協調**：本 worktree 新增附件/表單/來源表；與 audit worktree 的 AUDIT_LOG **時間戳勿撞**。整合跑 migration 改 `.env` 的 `APP_MSSQL_DATABASE` 指自己 dev DB。
- docker 埠固定 → 同時只起一套；各 worktree 自行 `npm install`（backend＋frontend）。
