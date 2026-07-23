# Worktree Guide: feature/authfix-F001-F003

> 由 Git Worktree Design Skill 產生。本文件為**導航指引**，不重複 spec 內容。
> ⚠ **依 /tdd：先寫 test-spec → 寫失敗測試（red）→ 最小實作（green）→ 重構 → impl log。不得跳過測試設計直接實作。**

## 目標
修掉「帳號建立後無法登入」的端到端死鏈（[[feature-status.md]] 揪出的 P0）：
- **F001 途徑 B**：新增帳密登入端點，接 `accounts/password.ts::verifyPassword`，錯誤回統一 `AUTH_INVALID_CREDENTIALS`。
- **F003 閉環**：`createManual`／`TypeOrmAccountStore.create` 寫入 `email`（或建立 loginId→帳號的登入對映），使手動帳號真能被登入路徑命中。
- 範圍外（本輪不做）：登出即時撤銷（需 Redis/denylist infra，已於 F001 spec 標為 gap）。

## 分支資訊
| 項目 | 值 |
|------|-----|
| 分支 | `feature/authfix-F001-F003` |
| 基於 | `main` @ `9837b61` |
| 路徑 | `C:/Users/cacab/Claude/icsop-authfix` |
| 建立 | 2026-07-22 |

## 指派 Features（狀態源＝docs/specs/feature-status.md）
| F### | 名稱 | 優先級 | 目前狀態 | 本 worktree 目標 |
|------|------|--------|----------|------------------|
| F001 | 雙軌驗證登入與 Session | P0 | 🟡 部分 | 補途徑 B 帳密登入端點＋`AUTH_INVALID_CREDENTIALS` |
| F003 | 帳號與角色指派管理 | P0 | 🟡 部分（e2e 不可達） | createManual 寫 email、閉合登入迴路 |

## Spec 參照（直接讀取，勿重複）
| F### | Feature Spec | Test Design | Prototype |
|------|-------------|-------------|-----------|
| F001 | `docs/specs/features/F001-auth-login-session.md`（§Main Flow 途徑 B、§AC 帳密段） | ⚠ **尚無，須先產出** | `prototypes/01-login.html`（途徑 B 表單） |
| F003 | `docs/specs/features/F003-account-role-management.md` | ⚠ **尚無，須先產出** | `prototypes/08-account-management.html` |

## 全域參照
| 文件 | 路徑 |
|------|------|
| 完成度追蹤（狀態源） | `docs/specs/feature-status.md` |
| Spec Index | `docs/specs/spec-index.md` |
| Architecture | `docs/specs/architecture-spec.md` |
| Error Handling（錯誤碼） | `docs/specs/error-handling.md` |
| 既有實作 log | `docs/implementation-logs/F003-account-role-management.md` |

## 跨分支依賴
| 類型 | 說明 |
|------|------|
| 需先合併 | 無（基礎線，可獨立開發） |
| 被依賴於 | 無強依賴；建議早併回 main（P0 且解鎖真人以非-SSO 帳號登入測試其他功能） |
| 共用檔案熱點 | `backend/src/auth/*`、`backend/src/accounts/*`、`frontend/src/pages/LoginPage.tsx`（與其他 worktree 幾乎不重疊） |

## TDD 開發流程（依 /tdd，每個 feature 依序）
1. **寫 test-spec** — 本專案尚無 `docs/test-specs/`。先用 `/tdd`（或 test-designer agent）依該 feature 的 `## Acceptance Criteria` 產出測試設計（test scenarios `TS-F###-NNN`），落檔 `docs/test-specs/features/F###-test.md`。
2. **讀** feature spec ＋ prototype ＋ error-handling 錯誤碼。
3. **寫失敗測試** — 由 test scenarios 轉自動化測試（backend `*.spec.ts` / 前端 `*.test.tsx`）。
4. **red** — 確認正確失敗。
5. **green** — 最小實作通過。
6. **refactor** — 保持綠燈。
7. **收尾** — 產出/更新 `docs/implementation-logs/F###-*.md`，並**同 commit 更新 `docs/specs/feature-status.md` 該列狀態＋`features/Fxxx-*.md` 的 `Status:` 行**（達 DoD 才可標 ✅：AC 測試覆蓋＋端到端可達＋副作用落地）。

## 專案特有注意（並行環境）
- **`.env` 已複製到本 worktree 根**（secrets）。單元測試（jest/vitest）不需 DB，可與其他 worktree **平行跑**。
- **DB/docker 整合**：與其他 worktree **共用同一顆外部 MSSQL「SOP」**。要跑 migration/整合時，改本 worktree `.env` 的 `APP_MSSQL_DATABASE` 指向**自己的 dev DB**，或整合階段一次只起一個 worktree。docker 埠固定（3000/5173/5432）→ 同時只能起一套（或設 `COMPOSE_PROJECT_NAME`＋埠覆寫）。
- 本 worktree 需各自 `cd backend && npm install`、`cd frontend && npm install`（node_modules 不共享）。
