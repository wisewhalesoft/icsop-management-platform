# Worktree Guide: feature/doc-edit-F011-F017 (Wave 2)

> 導航指引，不重複 spec 內容。
> ⚠ **依 /tdd：先寫 test-spec → 失敗測試（red）→ 最小實作（green）→ 重構 → impl log。不得跳過測試設計直接實作。**

## 目標
E04 文件編輯核心（P0）。全部落在 `backend/src/documents/*`＋前端文件頁，序列進行；Wave 2 其他線不碰此檔集。
- **F011 編輯 ICSOP 文件與版本對照**：`PATCH /admin/documents/:id`＋`store.update`、目前值/新值對照 UI、覆蓋不留歷史/UUID 不變、所屬節點唯讀＋跳畫布、取消不污染、編輯側編號唯一性排除自身（F013 `isNumberAvailable(selfId)`）。
- **F012 切換原因**：狀態切換補 OQ-E04-02 選填「原因」欄。
- **F013 編輯側唯一性**：接上 F011 編輯路徑；併發衝突捕捉 `QueryFailedError`→409 `DOCUMENT_NUMBER_DUPLICATE`（現恐回 500）。
- **F015 文件連結點**：`DOCUMENT_LINK` 表＋新增/移除端點＋目標存在性（`DOCUMENT_LINK_TARGET_NOT_FOUND`）＋前台顯示。
- **F017 清單補齊**：14 欄補足、9 篩選 combobox、分頁（後端現 take 2000）、排序。

## 可用地基（Wave 1 已併 main，**重用勿重建**）
- **AuditWriter**：`backend/src/audit/`（`AuditModule` → 注入 `AuditWriterService`；型別 `audit.types.ts`）。F011/F012 變更事件、之後 F037 change-log 由此喂。
- 文件建立面 F010/F026 欄位面 enforcement 已在 `documents.service.ts::create`；編輯面沿用 `classifyFields`/`FIELD_WRITE_FORBIDDEN`。

## 指派 Features（狀態源＝docs/specs/feature-status.md）
| F### | 名稱 | P | 狀態 | 目標 |
|------|------|---|------|------|
| F011 | 編輯＋版本對照 | P0 | ⬜ | 編輯端點＋對照 UI＋唯一性排除自身 |
| F012 | 狀態切換 | P0 | 🟡 | 補「切換原因」＋（可）變更事件 |
| F013 | 編號唯一性 | P0 | 🟡 | 編輯側排除自身＋併發 409 映射 |
| F015 | 文件連結點 | P1 | ⬜ | DOCUMENT_LINK 全鏈 |
| F017 | 清單與搜尋 | P0 | 🟡 | 14 欄/9 篩選/分頁/排序補齊 |

## Spec 參照
| F### | Feature Spec | Test Design | Prototype |
|------|-------------|-------------|-----------|
| F011 | `docs/specs/features/F011-edit-with-comparison.md` | ⚠ 先產出 | `prototypes/15-document-edit.html` |
| F012 | `docs/specs/features/F012-document-status-toggle.md` | ⚠ 先產出 | `prototypes/13-document-list.html` |
| F013 | `docs/specs/features/F013-document-number-uniqueness.md` | ⚠ 先產出 | `prototypes/14/15` |
| F015 | `docs/specs/features/F015-document-cross-link.md` | ⚠ 先產出 | `prototypes/15-document-edit.html` |
| F017 | `docs/specs/features/F017-backend-document-list.md` | ⚠ 先產出 | `prototypes/13-document-list.html` |

## 全域參照
完成度：`docs/specs/feature-status.md`｜Data Model：`docs/specs/data-model.md`｜Error：`docs/specs/error-handling.md`｜UI 對照：`docs/ui-ux-design-overview.md`

## 跨分支依賴 / 衝突面
- 需先合併：無（Wave 1 已在 main）。F014（制定組織/當責室長）**延後 Wave 3**（需 org 讀取端點、且會撞本線 documents.*）—本線**勿碰 F014 欄位**。
- 衝突熱點：`documents.service.ts`/`documents.controller.ts`（僅本線動）；`app.module.ts`/migration 時間戳（與其他線協調，各建各表）。

## TDD 流程（每 feature 依序）
先產 `docs/test-specs/features/F###-test.md`（本專案 test-specs 由前輪起建）→ 失敗測試 → red → green → refactor → impl log `docs/implementation-logs/F###-impl.md`＋更新該 `Fxxx-*.md` Status 行。**勿改** shared spec（data-model/error-handling/feature-status）—回報缺口，主線集中套用。

## 並行硬限制（同 Wave 1）
單元測試（jest/vitest，不碰 DB）可與其他線並行；DB/docker 整合序列化、各指自己 dev DB 名（改 `.env` `APP_MSSQL_DATABASE`）。埠固定 3000/5173/5432。各自 `npm install`（backend＋frontend）。migration 寫但**勿執行**。conventional commits ＋ `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
