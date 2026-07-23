---
type: implementation-log
feature_id: F017
feature_name: 後台文件清單與搜尋（前端整併）
status: complete
last_updated: 2026-07-23
---

# F017: 後台程序書清單 — Implementation Log（doc-frontend worktree · 前端）

範圍＝純前端消費既有（已 int-verified）後端清單端點，將既有「7 欄／2 篩選／無分頁」之清單頁
補齊為 prototype 13 之完整版面。後端 `GET /admin/documents` 之分頁/篩選/排序/名稱解析既有。

## 本輪實作
- `frontend/src/api/endpoints.ts::getDocuments` 由「解出 items」改為**回傳完整分頁物件 `DocumentListPage`**，
  並補齊全部後端查詢參數（documentNumber/documentName/draftingCompanyId|DeptId|SectionId/primaryChiefId/
  linkTargetId/sortBy/sortDir/page/pageSize）。
- `DocumentListItem` 型別補**解析名稱欄**（draftingCompanyName/DeptName/SectionName、primaryChiefName）。
- `DocumentListPage.tsx` 全面移植 prototype 13：全寬（AppShell main 已 `px-4 py-6`，頁面不再 max-w）、
  3 統計卡（總數/已公告/進度中）、**14 欄**（制定公司/部門/室別/當責室長/狀態/檔案/樹狀圖/程序書編號/
  程序書書名/版次/內容摘要/連結點程序書/公告日期/循環別）、**9 可搜尋下拉篩選**（reuse `SearchCombobox`，
  首項「全部」＝清除）、依編號/公告日期可切換排序、真分頁（每頁 50，功能性 prev/next）。
- 資料策略：一次載入完整工作集（pageSize 2000）→ 客端衍生篩選選項/篩選/排序/分頁/統計（比照 prototype
  client-side 模型）；「連結點」篩選因清單項無連結明細，改以後端 `linkTargetId` 查詢取得目標集合後客端交集。
- 移除**非原型**之每列「變更狀態」下拉（prototype 13 無此欄；狀態改於編輯頁 F011/F012 維護）。
- 導覽：建立程序書→`/admin/documents/new`；書名→檢視 `/admin/documents/:id`；鉛筆→編輯
  `/admin/documents/:id/edit`（write-only）；樹狀圖→`window.open('/lifecycles/:lifecycleId/tree')`。

## Test Results Summary
| Scenario | 說明 | Status |
|---|---|---|
| 載入渲染（編號/書名/組織/室長名稱） | 解析後名稱正確呈現 | PASS |
| pageSize 大值一次載入 | getDocuments 以 pageSize:2000 呼叫 | PASS |
| 14 欄表頭齊全 | columnheader ×14 | PASS |
| 統計卡總數 | 依篩選結果衍生 | PASS |
| RBAC：ICSOPAdmin 建立/編輯鈕、Supervisor 唯讀、User 403 | 功能面 gating | PASS ×3 |
| 導覽：書名→檢視、鉛筆→編輯 | navigate 目標正確 | PASS |
| 未指派節點警示 | alert-triangle | PASS |
| 循環別篩選 | 選定後僅顯示該循環 | PASS |
| 公告日期排序切換 | 表頭可點、升冪最早在前 | PASS |
| 全前端套件 / tsc / vite build | 194 綠 / 0 err / 通過 | PASS |

## Files Changed
| File Path | Change | Description |
|---|---|---|
| frontend/src/api/endpoints.ts | modified | getDocuments 回傳分頁物件＋全查詢參數 |
| frontend/src/api/types.ts | modified | DocumentListItem 補名稱欄；新增 DocumentListPage/DocumentSortBy/SortDir；擴充 DocumentFilters |
| frontend/src/components/Icon.tsx | modified | 註冊 library/megaphone/pause-circle/x-circle/file-down/link 等 |
| frontend/src/pages/DocumentListPage.tsx | modified | 全面移植 prototype 13（14 欄/9 篩選/排序/分頁/全寬） |
| frontend/src/pages/DocumentListPage.test.tsx | modified | 對應新版面之元件測試（12 例） |

## Architectural Decisions
- 客端分頁（載入完整工作集）而非逐頁後端查詢：因 9 篩選之下拉選項與統計卡衍生數皆需完整集合；
  與 prototype 之 client-side 模型一致；後端逐頁參數已於 getDocuments 備妥供未來大量資料切換。

## 已知後端缺口（以「—」呈現並回報，未自行改後端）
- 清單項未含「檔案（附件 blobPath）」→ 檔案欄以「—」呈現（無 attachment 列表端點）。
- 清單項未含「連結點程序書」明細 → 連結點欄以「—」呈現（連結點篩選仍可經 linkTargetId 運作）。
- 當責室長姓名解析依 org-foundation；查無回員編（F017-test 已載明之已知限制）。

## 需回報之 spec-doc 變更（未自行編輯共用/功能 spec）
- `docs/specs/features/F017-backend-document-list.md` Status：Draft → 建議「Implemented（後端清單/篩選/
  分頁/排序/名稱解析 int-ready；前端 14 欄/9 篩選/排序/分頁全寬清單已接線，194 前端測試綠）」。
- `docs/specs/feature-status.md` F017 列：🟡 → ✅（前端補齊 14 欄/9 篩選/分頁/排序）。
