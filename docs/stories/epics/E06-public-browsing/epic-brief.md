# Epic E06: 前台 RWD 瀏覽

> **Epic ID**: E06
> **Priority**: P0
> **Phase**: 1/2
> **Status**: Draft
> **Stories**: 8 個（US-057 為 2026-08-10 新增之 DRAFT story，從屬 [E08 US-072](../E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md)，待人類裁決 Open Questions）

## Epic Goal

提供公司同仁使用的響應式（RWD）前台網頁，讓使用者能瀏覽、搜尋、篩選 ICSOP 文件清單，並在檢視/下載/列印文件時取得帶有個人身分資訊的浮水印。登入成功後，一般使用者角色直接導向此前台頁（見 [E01 US-003](../E01-account-auth/US-003-role-based-routing.md)），其餘角色可透過選單進入。

清單排序規則為固定邏輯：使用部門與目前登入使用者所屬部門相符的文件「置頂」，其餘依 ICSOP 文件編號「降冪」排序；並提供關鍵字搜尋與部門/狀態/循環三種篩選器。文件檢視/下載/列印皆須疊加或燒錄浮水印（格式：`{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現}-{當下時間}`，含固定機密聲明），且同步觸發稽核記錄。

## User Stories

| Story ID | Title | Priority | File |
|---|---|---|---|
| US-050 | 前台清單與排序規則 | P0 | [US-050-public-list-sorting.md](US-050-public-list-sorting.md) |
| US-051 | 關鍵字搜尋 | P0 | [US-051-keyword-search.md](US-051-keyword-search.md) |
| US-052 | 部門/狀態/循環篩選 | P0 | [US-052-filter-dept-status-lifecycle.md](US-052-filter-dept-status-lifecycle.md) |
| US-053 | 網頁檢視器浮水印疊加 | P0 | [US-053-viewer-watermark-overlay.md](US-053-viewer-watermark-overlay.md) |
| US-054 | 下載/列印 PDF 浮水印燒錄 | P0 | [US-054-download-print-watermark-burn.md](US-054-download-print-watermark-burn.md) |
| US-055 | RWD 響應式版面 | P1 | [US-055-rwd-responsive-layout.md](US-055-rwd-responsive-layout.md) |
| US-056 | 後台開啟前台瀏覽頁 | P2 | [US-056-backend-launch-public-page.md](US-056-backend-launch-public-page.md) |
| US-057 | 業務使用者之前台使用部門限縮瀏覽 **DRAFT** | P0（建議） | [US-057-business-user-dept-scoped-browsing.md](US-057-business-user-dept-scoped-browsing.md) |

## Dependencies

**Depends On**：
- [E04 ICSOP文件管理](../E04-icsop-document/epic-brief.md) — 文件資料來源（清單、狀態、欄位）。
- [E02 組織同步與異動管理 / US-010](../E02-org-sync/US-010-daily-scheduled-sync.md) — 使用部門/當前使用者部門比對用於排序置頂。
- [E01 帳號與驗證](../E01-account-auth/epic-brief.md) — 使用者身分與角色分流、登入後導向。
- [E05 文件使用表單管理](../E05-usage-form/epic-brief.md) — 文件詳情頁之表單下載入口。

**Blocks**：
- [E07 稽核與文件調閱歷程](../E07-audit-trail/epic-brief.md) — 瀏覽/下載/列印動作觸發稽核記錄。

## Success Criteria

- 前台清單依固定規則排序（使用部門相符置頂 + 文件編號降冪），搜尋與篩選可正確組合運作。
- 網頁檢視與下載/列印皆正確帶出格式一致之浮水印，內容由伺服器端動態產生。
- 前台頁面於桌機/平板/手機三種斷點皆可正常操作。

## Open Questions

> 本 Epic 之 Open Questions 已處理完畢：1 項為正式是非題定案；另 2 項在 open-questions.md 中係以「本輪不納入範疇」（Out of Scope）處理，非一般定案，故未標 ✅，如實反映於下。完整紀錄見 [open-questions.md](../../../specs/open-questions.md)。

- [x] **關鍵字搜尋涵蓋欄位範圍**（OQ-E06-01 ✅）— **定案**：涵蓋「文件編號＋文件名稱」（可後續擴充）。
- [x] 使用者是否可自訂排序（如切換依公告日期排序）？— **對應 open-questions.md「（備註）自訂排序、前台顯示 DAG 結構」列**：**本輪不納入**（見 [scope.md](../../../specs/scope.md) Out of Scope），如未來有需求另立為新 Story；此為範疇排除，非「是否需要」之是非定案，未使用 ✅ 標記。
- [x] 前台頁面是否需要顯示文件的「所屬循環」DAG 結構？— **對應 open-questions.md「（備註）自訂排序、前台顯示 DAG 結構」列，並與 [E03 OQ-E03-08](../E03-lifecycle-dag/epic-brief.md) 一致**：循環樹狀圖預覽（US-025）已**定案為後台限定，本輪不開放前台**（OQ-E03-08 ✅：「後台限定，本輪不開放前台；未來若開放，可視範圍/稽核動作類型須另行定義，不可直接沿用後台版本規則」）；前台是否另以簡化形式呈現所屬循環，比照上一項為**本輪不納入範疇**（Out of Scope），未使用 ✅ 標記。
- [ ] **（2026-08-10 新增，DRAFT，待人類裁決）業務子分類使用者之前台限縮瀏覽**：詳見 [US-057](US-057-business-user-dept-scoped-browsing.md)（從 story，前台行為 AC）與 [E08 US-072](../E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md)（主 story，身分模型）。核心待裁決點：直連 URL 被拒絕時應回 404（隱藏存在性）或 403（現行慣例）（OQ-A）。
