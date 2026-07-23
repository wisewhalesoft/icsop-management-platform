---
type: implementation-log
feature_id: F018
feature_name: 使用表單管理
status: partial
last_updated: 2026-07-23
---

# F018: 使用表單管理 — Implementation Log

## 範圍與定案採用
- worktree：`storage`。**僅 [unit]**。沿用 F016 Blob 抽象、共用授權閘門、`FakeBlobStore`。
- 採用 launching agent 定案：
  - **RBAC（G）**：寫入類（上傳/覆蓋/刪除/關聯）路由層 `@RequirePermission(文件使用表單管理,'read')` + 服務欄位層 → 系統管理員 `FIELD_WRITE_FORBIDDEN`；主管/部門窗口/一般使用者（功能=無）→ `PERMISSION_DENIED`（含查詢）。前台詳情清單/下載屬文件瀏覽/下載列印（全角色 READ）。
  - **OQ-E05-02**：使用表單格式 `xlsx/xls/pdf`；≤50MB。
  - **OQ-F018-02（J）**：引用文件數 **≥2** 觸發 `USAGE_FORM_OVERWRITE_SHARED`（附 N）；`0/1` 直接覆蓋。格式驗證**先於**引用數判斷。
  - **Main Flow（J）**：刪除仍被引用（≥1）→ `USAGE_FORM_IN_USE`（附 N），二次確認後解除全部關聯 + 刪除。

## Test Results Summary（`cd backend && npx jest usage-forms/`）
| Scenario | 說明 | 狀態 |
|---|---|---|
| TS-F018-001~004 | 上傳 xlsx/pdf/xls + 批次上傳 | PASS |
| TS-F018-005~007 | 格式（.docx）/50MB 邊界 | PASS |
| TS-F018-008~009 | 多對多關聯建立 / 解除單一（表單仍存池） | PASS |
| TS-F018-010~012 | 詳情頁 3 筆 / 空陣列 / 前後台共用一致 | PASS |
| TS-F018-013~014 | 前台下載 + 稽核參數 / 未登入 FILE_ACCESS_DENIED 不稽核 | PASS |
| TS-F018-015~020 | 覆蓋門檻 0/1（不警示）、2（USAGE_FORM_OVERWRITE_SHARED）、5 確認、取消、格式優先 | PASS |
| TS-F018-021~023 | 刪除 0 引用成功 / ≥1 USAGE_FORM_IN_USE 確認後刪 / 取消保留 | PASS |
| TS-F018-024~028 | RBAC 五角色（查詢 vs 寫入分流） | PASS |
| TS-F018-030 | uploadedBy/uploadedAt 操作記錄 | PASS |
| TS-F018-029 | 真 Azure 直接 URL 存取拒絕 | **[integration] 延後（TODO）** |

合計 F018 相關 unit：usage-forms 29 綠。

## Files Changed
| 路徑 | 類型 | 說明 |
|---|---|---|
| backend/src/usage-forms/usage-forms.store.ts | new | FormPoolStore + AuditRecorder 介面/token/型別 |
| backend/src/usage-forms/usage-forms.service.ts(.spec) | new | F018 服務 + 29 unit |
| backend/src/usage-forms/typeorm-usage-forms.store.ts | new | USAGE_FORM_POOL + DOC_USAGE_FORM TypeOrm 實作 |
| backend/src/usage-forms/logging-audit-recorder.ts | new | AUDIT_LOG/F023 佔位收集器 |
| backend/src/usage-forms/usage-forms.controller.ts | new | 表單池/關聯/詳情/下載端點 |
| backend/src/usage-forms/usage-forms.module.ts | new | 模組接線 |
| backend/src/database/entities/usage-form-pool.entity.ts | new | 表單池 entity（未執行 migration） |
| backend/src/database/entities/doc-usage-form.entity.ts | new | 關聯 entity（複合 PK，未執行） |
| backend/src/database/migrations/1722124800000-usage-form.ts | new | migration（未執行） |
| backend/src/app.module.ts | modified | 掛載 UsageFormsModule |

## Architectural Decisions
- 表單池採獨立表（USAGE_FORM_POOL）+ 多對多附屬表（DOC_USAGE_FORM），非併入 DOCUMENT_ATTACHMENT。
- 覆蓋/刪除門檻以 `countLinks(formId)` 驅動；`confirmed` 旗標表達「二次確認」（未確認即拋具名碼，等同取消不變更）。
- 下載為前台獨立路徑（DOCUMENT_DOWNLOAD_PRINT 全角色 READ），不受表單池功能矩陣限制；僅需 session 存在。

## Blocking Issues / spec-doc 變更需求（未自行修改共用 spec）
- **error-handling.md**：需補列 `USAGE_FORM_IN_USE`（現僅 F018 正文/prototype，OQ-F018-03）。
- **data-model.md**：需補 `USAGE_FORM_POOL` + `DOC_USAGE_FORM`（等效表單池 + 多對多附屬表，OQ-F018-07）。
- 新增防衛性碼 `USAGE_FORM_NOT_FOUND`（找不到表單，404）——非測試要求，僅內部防衛，建議一併補入中央錯誤碼表。
- OQ-F018-01（AC3 解除關聯 vs 刪除語意）、OQ-F018-05（批次部分失敗）、OQ-F018-06（後台下載稽核）待 spec 消歧。
- AUDIT_LOG 落地與 outbox 屬 F023；本 worktree 上限＝以正確參數呼叫收集器。
