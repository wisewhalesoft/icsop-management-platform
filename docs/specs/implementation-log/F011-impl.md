---
type: implementation-log
feature_id: F011
feature_name: 編輯 ICSOP 文件與版本對照（前端）
status: complete
last_updated: 2026-07-23
---

# F011: 編輯頁與版本對照 — Implementation Log（doc-frontend worktree · 前端）

範圍＝純前端消費既有（int-verified）之 `GET /admin/documents/:id`、`PATCH /admin/documents/:id`、
`GET /admin/documents/:id/links`，新建 `DocumentEditPage`（route `/admin/documents/:id/edit`），移植 prototype 15。

## 本輪實作
- 端點：`getDocument(id)`、`updateDocument(id, body)`（回 `{document, changes}`）、`getDocumentLinks(id)`；
  型別 `DocumentView`/`DocumentUpdateResult`/`DocumentFieldChange`/`DocumentLinkView`。
- `DocumentEditPage.tsx`：載入 DocumentView + links → 建立 `orig`（原值快照）與 `draft`（可編輯副本）。
  - **目前值／新值對照**：每欄以 `DiffRow`（scalar）或 `ComboDiff`（組織/室長）並列，變更欄位標「已變更」+
    可還原；頂部「已變更 N 個欄位」計數列。
  - **儲存**＝僅變更欄位之 partial patch `PATCH :id`（UUID 不變、不留歷史）；回應之 document 覆寫 orig。
  - **取消**＝draft 還原為 orig（不污染原值）。
  - **編輯側編號唯一性**：前綴依循環代碼、後段序號輸入；比對既有「有效＋作廢」文件並**排除自身**，內嵌 DUPLICATE。
  - **所屬節點唯讀**＋「前往畫布改派」→ `/admin/lifecycles/:lifecycleId/canvas`。
  - RBAC：ICSOPAdmin 可編輯；Supervisor/DeptContact/SysAdmin 唯讀（欄位停用＋banner，無儲存/取消）；User→403。

## Test Results Summary
| Scenario | 說明 | Status |
|---|---|---|
| TS-F011-001 載入供對照 | 新值欄帶入目前值、目前值並列 | PASS |
| RBAC User 403 / Supervisor 唯讀 | 功能面 gating | PASS ×2 |
| 修改顯示「已變更」計數 + 取消還原 | cancel 不污染原值 | PASS |
| 編輯側唯一性排除自身 + 擋下儲存 | 命中他文件佔用編號→DUPLICATE | PASS |
| 節點唯讀 + 前往畫布改派導向 | navigate 目標正確 | PASS |
| 儲存以 patch 呼叫 updateDocument | 僅變更欄位 | PASS |
| F015 連結點隨儲存整批送出 | links[] 併入 patch | PASS |

## Files Changed
| File Path | Change | Description |
|---|---|---|
| frontend/src/pages/DocumentEditPage.tsx | new | 編輯頁（版本對照＋F015 連結＋附件＋使用表單） |
| frontend/src/pages/DocumentEditPage.test.tsx | new | 元件測試（8 例） |
| frontend/src/api/endpoints.ts | modified | getDocument/updateDocument/getDocumentLinks |
| frontend/src/api/types.ts | modified | DocumentView/DocumentUpdateResult/DocumentFieldChange/DocumentLinkView |
| frontend/src/App.tsx | modified | 掛載 `/admin/documents/:id/edit` |

## Architectural Decisions
- 狀態切換併入統一儲存（PATCH :id 之 status 欄）以貼合 prototype 之單一「儲存」；`setDocumentStatus` 專用端點保留。
  註：僅當 patch 含 documentNumber 時 update() 才重驗唯一性；「切回有效」之編號重驗於本頁改由統一 patch 觸發，
  兩枚失效文件同號切換之極端情境仍以後端 setStatus 專用路徑為權威（本頁未觸及，屬既知後端 nuance）。

## 已知後端缺口（唯讀呈現＋回報，未改後端）
- update() 剔除多值（次要室長／使用部門）＝F014 create-side only、edit-side deferred → 本頁該二欄唯讀顯示載入值。
- 附件無列表端點 → 僅提供 ICSOP PDF／OJT 取代上傳（不顯示現有檔名）。

## 需回報之 spec-doc 變更
- `docs/specs/features/F011-edit-with-comparison.md` Status：Draft → 建議「Implemented（後端 update int-verified；
  前端編輯頁版本對照/連結/附件已接線）」。
- `docs/specs/feature-status.md` F011 列：⬜/🟡 → ✅。
