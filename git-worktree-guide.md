# Worktree Guide: feature/org-foundation (Wave 2 前置)

> 導航指引，不重複 spec 內容。
> ⚠ **依 /tdd：先寫 test-spec → 失敗測試（red）→ 最小實作（green）→ 重構 → impl log。不得跳過測試設計直接實作。**

## 目標（**Wave 2 三線的前置地基，須先併回 main**）
補齊「組織／人員／公司」資料與讀取能力＋session 擴充，解鎖 Wave 2 test-designer 揪出的三缺口之一（B：org+session 資料），並為 Wave 3 F014/F006/F026 鋪路。範圍：
- **PERSON 實體＋同步**：自上游 HR 同步**全體在職員工**（非僅有帳號者），`employeeNo → 姓名（＋部門）`，供「當責室長」名稱解析與人員搜尋。來源見 `docs/specs/upstream-hr-source-contract.md`（VW_HPMUSER、EMPSTS='A' 在職、9999-12-31 哨兵）。
- **COMPANY 實體＋同步**：`COMPFULLNM` 公司全稱（F004 標記 VW_HRCOMF 未同步）→ 供 F020 浮水印公司全稱。
- **ORG_UNIT 讀取端點**：list / 三級樹（公司→部→室）/ 級聯查詢，供 F014 制定組織下拉、F019 部門篩選。ORG_UNIT 已由 F004 同步、僅缺讀取 API。
- **DESC_FULL 保留**：`org-sync/normalization.ts` 現 drop 掉 DESC_FULL（衍生部門層全名）→ 加欄保留，供 F020 浮水印「部門」欄。
- **Session 擴充**：`SessionUser`/JWT 加 `orgCode / name / employeeNo`（`ACCOUNT` 已有這些欄）→ 供 F019 置頂（依使用者部門）＋ F020 身分快照。
- **名稱解析服務**：`employeeNo→姓名`、`orgId→名稱/路徑` 共用 helper，供 public / doc-edit / 文件清單重用。

## 相關既有程式（**擴充勿重寫**）
- `backend/src/org-sync/*`（同步引擎、`normalization.ts`、`org-hierarchy.ts`、`ORG_UNIT`/`ACCOUNT` 實體、upstream reader、param-batching）— PERSON/COMPANY 同步沿用同一引擎與交易/閾值機制。
- `backend/src/auth/session-token.service.ts`（`SessionUser` 現只有 loginId/email/companyCode/roleCode）。
- 上游契約：`docs/specs/upstream-hr-source-contract.md`（權威來源／欄位／哨兵）。

## 指派範圍（非新 F 編號；為 F014/F006/F026＋public/doc-edit 之後端前置）
| 項目 | 對應/解鎖 | 備註 |
|------|-----------|------|
| PERSON 同步＋讀取 | 室長名稱（F017/F014）、人員搜尋（F014） | 全在職員工，非僅帳號 |
| COMPANY 同步 | F020 公司全稱 | VW_HRCOMF |
| ORG_UNIT 讀取 API | F014 下拉、F019 篩選 | 三級樹/級聯 |
| DESC_FULL 保留 | F020 部門欄 | normalization 加欄 |
| Session 擴充 | F019 置頂、F020 身分 | 來源 ACCOUNT |

## 全域參照
完成度：`docs/specs/feature-status.md`｜上游契約：`docs/specs/upstream-hr-source-contract.md`｜Data Model：`docs/specs/data-model.md`｜相關 feature spec：`F014-accountable-dept-chief.md`、`F006-org-change-alert-backend.md`、`F026-role-field-matrix.md`

## 跨分支依賴 / 衝突面
- **本線須先併回 main**；之後 doc-edit/public/rag `git merge main` 取得本線產物再實作。
- 衝突熱點：`backend/src/org-sync/*`（僅本線動）、`backend/src/auth/session-token.service.ts`（session 擴充，僅本線動）、`app.module.ts`、migration 時間戳（新 PERSON/COMPANY 表、ORG_UNIT 加 DESC_FULL 欄）。與 doc-edit/public/rag 目前檔案集不重疊。

## TDD 流程
先產 `docs/test-specs/features/` 之對應 test-spec（PERSON 同步、COMPANY 同步、ORG 讀取、session 擴充、名稱解析）→ red → green → refactor → impl log ＋ 更新相關 `Fxxx-*.md` Status。**勿改** shared spec（data-model/error-handling/feature-status）—回報缺口。上游同步之真實查詢＝`[integration]`（dev 已遮罩，只信結構；單元以替身測）。

## 並行硬限制（同 Wave 1）
單元測試（假 upstream reader / 假 store）可並行；真上游/DB 同步＝`[integration]` 序列化。埠固定 3000/5173/5432。各自 `npm install`。migration 勿執行。conventional commits ＋ `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
