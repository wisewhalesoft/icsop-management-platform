# US-037: 後台文件清單與搜尋

> **Story ID**: US-037
> **Epic**: [E04 ICSOP 文件管理](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a **ICSOP 管理員**,
I want **在後台以清單檢視所有 ICSOP 文件，並可查詢、篩選、排序**,
So that **我能快速找到需要維護的文件並掌握文件池整體狀態**。

## Acceptance Criteria

**AC1 — 清單呈現（14 欄）＋ 3 統計卡**
- Given 我進入後台「ICSOP 文件管理」清單頁
- When 頁面載入
- Then 頂部顯示 3 張統計卡（程序書數量/已公告/進度中），清單以分頁方式呈現，由左至右 14 欄：制定公司、制定部門、制定室別、當責室長、狀態、檔案、樹狀圖圖示、程序書編號、程序書書名、版次、內容摘要、連結點程序書、公告日期、循環別

**AC2 — 關鍵字查詢**
- Given 我在搜尋框輸入程序書編號或程序書書名關鍵字
- When 我送出查詢
- Then 清單僅顯示符合條件的文件

**AC3 — 可搜尋下拉篩選（9 個）與排序**
- Given 我於清單頁使用可搜尋下拉（combobox 可輸入過濾）篩選：循環別、狀態、程序書編號、程序書書名、制定部門、制定室別、當責室長、制定公司、連結點程序書，或選擇依程序書編號/公告日期排序
- When 條件套用
- Then 清單即時更新為符合條件、依指定順序排列的結果

**AC4 — 未指派節點標示**
- Given 有文件尚未於 [E03 節點抽屜](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md) 完成節點指派
- When 該文件顯示於清單
- Then 清單以明顯標示（如警示圖示）呈現「所屬節點未指派」狀態

**AC5 — 狀態衍生顯示**
- Given 一筆儲存狀態為「有效」的文件
- When 呈現於清單狀態欄與統計卡
- Then 依公告日期衍生顯示「已公告」（≤今日）或「進度中」（>今日）；「失效」/「作廢」照原樣顯示（見 [US-032](US-032-status-toggle.md)）

**AC6 — 樹狀圖圖示**
- Given 一筆已指派節點的文件
- When 我點擊該列「樹狀圖圖示」
- Then 系統開啟該文件所屬節點的循環預覽（呈現該節點於所屬循環 DAG 之位置）

## Technical Notes

- 清單 14 欄與統計卡/篩選欄位之顯示標籤（程序書編號/程序書書名/連結點程序書/循環別/檔案）為 UI 標籤，實體/欄位名維持「ICSOP 文件」；欄位權威定義見 [E04 文件欄位](epic-brief.md)
- 3 張統計卡：程序書數量（總數）、已公告（衍生數）、進度中（衍生數）；已公告/進度中計數採 [US-032](US-032-status-toggle.md) 之公告日期衍生規則
- 9 個可搜尋下拉沿用專案既有 searchable combobox 樣式（可輸入即時過濾選項）
- 樹狀圖圖示點擊開啟該文件「所屬節點」之循環預覽（見 [E03 US-021 DAG 畫布](../E03-lifecycle-dag/US-021-dag-node-edge-maintenance.md)）；未指派節點文件點擊時提示「所屬節點未指派」
- 後台清單與 [E06 US-050 前台清單](../E06-public-browsing/US-050-public-list-sorting.md) 邏輯不同：後台不套用「使用部門置頂」規則，預設排序建議依最後更新時間或編號
- 清單資料需依 [E08 US-071 角色×欄位權限矩陣](../E08-permission-matrix/US-071-role-field-matrix.md) 決定各角色可見欄位
- 分頁筆數與效能目標見 [NFR-001 效能與可擴展性](../../non-functional/NFR-001-performance.md)

## Test Cases

- **TC-037-01（Happy Path）**：開啟清單頁，正確顯示 3 統計卡與 14 欄分頁文件清單
- **TC-037-02（Happy Path）**：輸入既存程序書編號關鍵字查詢，僅回傳符合結果
- **TC-037-03（Happy Path）**：套用「制定部門+狀態」複合篩選，清單正確反映交集結果
- **TC-037-04（Happy Path）**：於「當責室長」可搜尋下拉輸入關鍵字，選項即時縮小並可選取
- **TC-037-05（Edge）**：查詢無符合結果的關鍵字，清單顯示空狀態而非錯誤
- **TC-037-06（Edge）**：清單中存在「未指派節點」文件，正確顯示警示標示
- **TC-037-07（Happy Path — 狀態衍生）**：有效文件公告日期已過顯示「已公告」、未到顯示「進度中」
- **TC-037-08（Happy Path — 樹狀圖圖示）**：點擊已指派節點文件之樹狀圖圖示，開啟該節點循環預覽

## Dependencies

**Blocked By**:
- [US-030 建立 ICSOP 文件](US-030-create-icsop-document.md)
- [US-032 文件狀態切換](US-032-status-toggle.md)
- [US-034 制定組織與當責室長設定](US-034-accountable-dept-chief-assignment.md)
- [US-036 PDF 與 OJT 附件上傳](US-036-pdf-ojt-attachment-upload.md)

**Blocks**: 無直接下游 story，為後台管理入口頁面

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E04 ICSOP 文件管理](epic-brief.md)
- [NFR-001 效能與可擴展性](../../non-functional/NFR-001-performance.md)
- [E06 US-050 前台清單與排序規則](../E06-public-browsing/US-050-public-list-sorting.md)
