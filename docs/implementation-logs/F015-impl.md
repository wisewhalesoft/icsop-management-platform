---
type: implementation-log
feature_id: F015
feature_name: 文件連結點管理（前端 UI）
status: complete
last_updated: 2026-07-23
---

# F015: 文件連結點 — Implementation Log（doc-frontend worktree · 前端）

範圍＝純前端消費既有後端連結點契約（決策：links 隨 `PATCH /admin/documents/:id` 整批送出；
`GET :id/links` 讀取），於建立頁與編輯頁提供 chips＋可搜尋下拉。

## 本輪實作
- 端點 `getDocumentLinks(id)` → `DocumentLinkView[]`（linkId/targetDocumentId/targetNumber/targetName/targetStatus）。
- **編輯頁**（F011）：載入 `getDocumentLinks` → draft.links（targetDocumentId 集合）；`MultiSearchCombobox`
  以既有文件（排除自身）為選項（label＝編號＋書名）；新增/移除更新 draft.links；儲存時若變更則 `patch.links = draft.links`
  併入 PATCH，由後端做目標存在性預查＋差集同步。
- **建立頁**（F010 STEP4）：`MultiSearchCombobox` 選連結目標；建立取得 UUID 後以 `updateDocument(newId, { links })` 落地。
- **唯讀頁**（F016）：`getDocumentLinks` 呈現連結點（附狀態 pill），可點擊導向目標文件檢視。

## Test Results Summary
| Scenario | 說明 | Status |
|---|---|---|
| 編輯頁新增連結 → 隨儲存整批送出 links | patch.links=['d2'] | PASS |
| 建立頁選連結 → 建立後 updateDocument links | 建立後整批 | PASS |
| 唯讀頁連結點可點擊導向目標 | navigate `/admin/documents/:target` | PASS |

## Files Changed
| File Path | Change | Description |
|---|---|---|
| frontend/src/api/endpoints.ts | modified | getDocumentLinks |
| frontend/src/api/types.ts | modified | DocumentLinkView |
| frontend/src/pages/DocumentEditPage.tsx | new | 連結點 chips＋搜尋（隨 PATCH 整批） |
| frontend/src/pages/DocumentCreatePage.tsx | modified | STEP4 連結點多選＋建立後 PATCH |
| frontend/src/pages/DocumentReadonlyPage.tsx | new | 連結點唯讀導覽 |

## 需回報之 spec-doc 變更
- `docs/specs/features/F015-document-cross-link.md` Status：Draft → 建議「Implemented（後端 store/端點 unit-green；
  前端連結點 UI 於建立/編輯隨 PATCH 整批送出、唯讀頁可導覽）」。
- `docs/specs/feature-status.md` F015 列：⬜ → ✅（unit-green；真併發 FK/唯一約束仍 [integration]）。
