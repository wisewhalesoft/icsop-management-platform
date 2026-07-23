---
type: implementation-log
feature_id: F010
feature_name: 建立 ICSOP 文件（前端 STEP4 補齊）
status: complete
last_updated: 2026-07-23
---

# F010: 建立 ICSOP 文件 — Implementation Log（doc-frontend worktree · 前端 STEP4）

範圍＝將建立頁（既有 STEP1~3 已接線）之 **STEP4「後續步驟」佔位**替換為真實「附件與關聯文件」，
消費既有附件（F016）／使用表單（F018）／連結點（F015）端點。移植 prototype 14 STEP4。

## 本輪實作
- STEP4（`DocumentCreatePage.tsx`，選定循環後開放）：
  - **ICSOP PDF／OJT 附件**：`UploadCard` 點擊選檔、暫存 File；建立取得 UUID 後依序
    `uploadIcsopPdf(id,file)` / `uploadOjtAttachment(id,file)`（multipart）。
  - **ICSOP 原始檔 .xls**：依 prototype 版面呈現卡片，但標示為「待 AI 索引管線就緒（F027/F029）」之
    informational 停用狀態（後端 .xls 保存需 [integration] 模板解析，非單純 multipart）。
  - **使用表單**：`getUsageFormPool()` 載入表單池，`MultiSearchCombobox` 多選；建立後 `linkUsageForms(id, formIds)`。
  - **文件連結點**：以既有文件為選項多選；建立後 `updateDocument(id, { links })`。
  - 建立流程：`createDocument()`（回 DocumentView，取 `id`）→ 依序上傳附件→關聯表單→整批連結→導回清單。
- 既有 STEP1~3（循環 gating／基本資訊／制定組織三級／當責室長）維持；`getDocuments` 改回傳分頁物件後
  建立頁之唯一性即時檢查改讀 `.items`。

## Test Results Summary
| Scenario | 說明 | Status |
|---|---|---|
| 既有 STEP1~3 回歸 | 循環 gating/必填/唯一性/制定組織 | PASS（既有 15 例） |
| STEP4 渲染 | 附件卡/使用表單/文件連結點 | PASS |
| 選使用表單＋連結點 → 建立後關聯 | linkUsageForms('new1',['form1'])＋updateDocument('new1',{links:['docB']}) | PASS |
| 選 ICSOP PDF → 建立後上傳 | uploadIcsopPdf('new1', file) | PASS |

## Files Changed
| File Path | Change | Description |
|---|---|---|
| frontend/src/pages/DocumentCreatePage.tsx | modified | STEP4 真實附件/表單/連結＋建立後續步驟 |
| frontend/src/pages/DocumentCreatePage.test.tsx | modified | getDocuments 分頁 mock＋STEP4 3 例 |
| frontend/src/api/endpoints.ts | modified | uploadIcsopPdf/uploadOjtAttachment/getUsageFormPool/linkUsageForms |

## Architectural Decisions
- 附件/表單/連結於**建立取得 UUID 後**才落地（附件與 usage-form 端點以 documentId 為路徑；links 走 update()），
  與 prototype「儲存時存 Blob」語意一致。各後續步驟以「有選才呼叫」gate，未選則跳過（既有建立測試不受影響）。

## 已知後端缺口（回報，未改後端）
- .xls 原件保存需 AI 索引管線之模板解析（`POST :id/source-xls` 以 JSON+templateSummary，屬 [integration]）→
  建立頁 .xls 卡片以停用/說明呈現，未接線真實上傳。

## 需回報之 spec-doc 變更
- `docs/specs/features/F010-create-document.md` Status：Draft → 建議「Implemented（前端建立四步含 STEP4 附件/
  使用表單/連結點已接線；.xls 上傳待 F027/F029）」。
- `docs/specs/feature-status.md` F010 列：🟡/✅ → ✅（STEP4 補齊）。
