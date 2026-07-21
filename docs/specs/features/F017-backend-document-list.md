# F017: 後台文件清單與搜尋
Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-17
Epic/Story: E04 / US-037

## Description
後台以分頁清單檢視所有 ICSOP 文件，頂部呈現 3 張統計卡，提供 9 個可搜尋下拉篩選與依編號/公告日期排序。清單顯示 14 欄（UI 顯示標籤，實體名維持「ICSOP 文件」）。狀態欄依「公告日期」衍生顯示（已公告/進度中/失效/作廢，見 F012）。與前台清單邏輯不同：**後台不套用「使用部門置頂」規則**，預設依最後更新時間或編號排序。未指派節點文件明顯標示。19 欄位權威定義見 [data-model.md](../data-model.md#document-entity)。

## Preconditions
- 操作者具後台文件管理存取權（F025；系統管理員/主管/部門窗口唯讀，ICSOPAdmin 可寫）。

## Main Flow
1. 進入後台清單頁 → 頂部顯示 3 張統計卡：程序書數量（總數）、已公告（衍生數）、進度中（衍生數）。
2. 分頁呈現清單，由左至右 14 欄：
   1. 制定公司
   2. 制定部門
   3. 制定室別
   4. 當責室長（顯示「當責室長-主要」，次要以 tooltip/次列呈現）
   5. 狀態（徽章：已公告／進度中／失效／作廢，依公告日期衍生）
   6. 檔案（ICSOP PDF，下載鈕/圖示）
   7. 樹狀圖圖示（點擊開啟 [F036 循環樹狀圖預覽](F036-lifecycle-tree-preview.md)，帶入該文件所屬循環 `?cycle=<code>`）
   8. 程序書編號（documentNumber，等寬字）
   9. 程序書書名（documentName）
   10. 版次（edition，如 `26'01`，等寬字）
   11. 內容摘要（contentSummary，可截斷 + title 顯示全文）
   12. 連結點程序書（文件連結點，下載鈕/圖示；0..*）
   13. 公告日期（announcedDate）
   14. 循環別（lifecycleId 名稱）
3. 關鍵字查詢（程序書編號/程序書書名）→ 僅顯示符合結果。
4. 套用 9 個可搜尋下拉（combobox 可輸入過濾）篩選：循環別、狀態、程序書編號、程序書書名、制定部門、制定室別、當責室長、制定公司、連結點程序書 → 清單即時更新。
5. 依程序書編號/公告日期排序 → 清單即時更新。
6. 點擊某列「樹狀圖圖示」→ 開啟 [F036 循環樹狀圖預覽](F036-lifecycle-tree-preview.md)（新頁 `22-lifecycle-tree-preview.html?cycle=<該文件所屬循環代碼>`），以該文件所屬循環為預選之唯讀 DAG；可視範圍依 F036／F025「循環管理」唯讀規則（主管對循環管理為**全公司唯讀**，雙入口一致、無 403 落差，OQ-E08-03 已定案；DeptContact／User 無此權限）。

## Alternative Flows
- 依 F026 決定各角色可見欄位；唯讀角色顯示唯讀 banner。
- 統計卡與狀態徽章之「已公告/進度中」計數與顯示採 F012 衍生規則（有效＋公告日期≤今日＝已公告、有效＋公告日期>今日＝進度中）。

## Edge Cases
- 查無符合結果：顯示空狀態，非錯誤。
- 存在「未指派節點」文件：以明顯標示（警示圖示）呈現；其「樹狀圖圖示」仍可開啟該文件**所屬循環**之 F036 預覽（文件所屬循環為建立時必填，僅尚未定位於特定節點）。
- 內容摘要過長：清單截斷顯示，滑鼠停留（title）顯示全文。
- 文件無連結點程序書（0 筆）：該欄留空或顯示「—」。

## Postconditions
- 管理員可定位需維護文件並掌握文件池狀態（含程序書數量/已公告/進度中總覽）。

## Acceptance Criteria
- Given 進入清單頁, When 載入, Then 頂部顯示 3 張統計卡（程序書數量/已公告/進度中），清單分頁顯示 14 欄。
- Given 輸入既存程序書編號或書名關鍵字, When 查詢, Then 僅回傳符合結果。
- Given 套用「制定部門+狀態」複合篩選, When 條件套用, Then 清單反映交集結果。
- Given 於循環別/狀態/程序書編號/程序書書名/制定部門/制定室別/當責室長/制定公司/連結點程序書 任一下拉輸入關鍵字, When 過濾, Then 下拉選項即時縮小並可選取。
- Given 有效文件, When 呈現狀態欄, Then 依公告日期衍生顯示「已公告」（≤今日）或「進度中」（>今日），失效/作廢照原樣顯示。
- Given 點擊某列樹狀圖圖示, When 觸發, Then 開啟 [F036](F036-lifecycle-tree-preview.md) 循環樹狀圖預覽（帶入該文件所屬循環 `?cycle=<code>`）。
- Given 查詢無符合關鍵字, When 查詢, Then 顯示空狀態而非錯誤。
- Given 清單含未指派節點文件, When 呈現, Then 正確顯示警示標示。

## Error Scenarios
- 空結果/搜尋跳脫：見 [error-handling.md#public](../error-handling.md#public)。分頁效能見 [NFR-001](../nfr.md#performance)。

## Related
- Data: [ICSOP_DOCUMENT（19 欄位）](../data-model.md#document-entity)
- Depends on: [F010](F010-create-document.md), [F012](F012-document-status-toggle.md)（狀態衍生）, [F014](F014-accountable-dept-chief.md)（制定組織/當責室長）, [F016](F016-pdf-ojt-attachment.md)（檔案下載）
- Related: 樹狀圖預覽（第二入口）見 [F036](F036-lifecycle-tree-preview.md)；DAG 資料見 [F008](F008-dag-node-edge.md)/[F009](F009-node-drawer-maintenance.md)；連結點見 [F015](F015-document-cross-link.md)
- 對比前台: [F019](F019-public-list-browsing.md)（後台不套用部門置頂）
