# Worktree Guide: feature/audit-F023-F024

> 由 Git Worktree Design Skill 產生。本文件為**導航指引**，不重複 spec 內容。
> ⚠ **依 /tdd：先寫 test-spec → 寫失敗測試（red）→ 最小實作（green）→ 重構 → impl log。不得跳過測試設計直接實作。**

## 目標
建立全站缺失的**稽核基礎**（[[feature-status.md]] 標為阻擋最多功能的地基）：
- **F023 AUDIT_LOG**：新增 `backend/src/audit/` 模組 — append-only 稽核實體＋migration＋共用 `AuditWriter` 服務（VIEW/DOWNLOAD/PRINT 等動作寫入），不可竄改守衛（改寫回 `AUDIT_IMMUTABLE`），寫入失敗補償/重試。
- **F024 調閱歷程查詢後台**：查詢 API（型別/人員/對象/時間範圍篩選、角色 403、空條件近30天預設、分頁）＋前端頁（`/admin/access-history` 現為 ModulePlaceholder）＋單列展開＋CSV/Excel 匯出。

> 設計重點：`AuditWriter` 是**共用服務**，日後 F005/F007/F012/F020/F034/F037/F038 都會呼叫。介面要穩、先獨立可用；消費端於各自 worktree 掛接。

## 分支資訊
| 項目 | 值 |
|------|-----|
| 分支 | `feature/audit-F023-F024` |
| 基於 | `main` @ `9837b61` |
| 路徑 | `C:/Users/cacab/Claude/icsop-audit` |
| 建立 | 2026-07-22 |

## 指派 Features（狀態源＝docs/specs/feature-status.md）
| F### | 名稱 | 優先級 | 目前狀態 | 本 worktree 目標 |
|------|------|--------|----------|------------------|
| F023 | 稽核軌跡記錄 | P0 | ⬜ 未開始 | AUDIT_LOG 實體＋migration＋AuditWriter＋不可竄改守衛 |
| F024 | 文件調閱歷程查詢後台 | P0 | ⬜ 未開始 | 查詢 API＋前端頁（取代 ModulePlaceholder）＋匯出 |

## Spec 參照（直接讀取，勿重複）
| F### | Feature Spec | Test Design | Prototype |
|------|-------------|-------------|-----------|
| F023 | `docs/specs/features/F023-audit-logging.md` | ⚠ **尚無，須先產出** | （無 UI；write-side） |
| F024 | `docs/specs/features/F024-access-history-query.md` | ⚠ **尚無，須先產出** | `prototypes/17-access-history.html` |

## 全域參照
| 文件 | 路徑 |
|------|------|
| 完成度追蹤（狀態源） | `docs/specs/feature-status.md` |
| Data Model | `docs/specs/data-model.md`（AUDIT_LOG 綱要、baseline migration 已註明延後建） |
| Architecture | `docs/specs/architecture-spec.md` |
| Error Handling | `docs/specs/error-handling.md`（`AUDIT_IMMUTABLE` 等） |
| RBAC 矩陣 | `backend/src/rbac/function-matrix.ts`（`DOCUMENT_ACCESS_HISTORY` 已有鍵） |

## 跨分支依賴
| 類型 | 說明 |
|------|------|
| 需先合併 | 無（基礎線，可獨立開發）；F024 依賴 F023（同 worktree 內序列） |
| 被依賴於 | **多**：F005/F007/F012/F020/F034/F037/F038 之「記錄稽核」皆呼叫 AuditWriter → 本 worktree 建議**早併回 main** |
| 共用檔案熱點 | 新增 `backend/src/audit/*`（新模組，衝突低）；`app.module.ts` 註冊、migration 時間戳需與其他 worktree 錯開 |

## TDD 開發流程（依 /tdd，每個 feature 依序）
1. **寫 test-spec** — 先用 `/tdd`（或 test-designer agent）依 AC 產出 test scenarios，落檔 `docs/test-specs/features/F###-test.md`（本專案尚無此目錄，一併建立）。
2. **讀** feature spec ＋ data-model（AUDIT_LOG 綱要）＋ error-handling ＋（F024）prototype 17。
3. **寫失敗測試** → **red** → **最小實作 green** → **refactor**。
4. **收尾** — impl log `docs/implementation-logs/F023-*.md`／`F024-*.md`，**同 commit 更新 `feature-status.md` 兩列＋各 `Fxxx-*.md` 的 `Status:` 行**（DoD：AC 測試＋端到端可達＋append-only 真的寫入且不可竄改）。

## 專案特有注意（並行環境）
- **`.env` 已複製**。單元測試不需 DB → 可與其他 worktree 平行。
- **migration 協調**：本 worktree 新增 `AUDIT_LOG` 表；與 storage worktree 的附件表**時間戳勿撞**、各建各的表。整合跑 migration 時改 `.env` 的 `APP_MSSQL_DATABASE` 指向自己的 dev DB，避免多分支打同一顆 SOP 造成 migrations 追蹤漂移。
- docker 埠固定 → 同時只起一套；各 worktree 自行 `npm install`（backend＋frontend）。
