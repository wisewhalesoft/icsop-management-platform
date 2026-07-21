# Epic E04: ICSOP 文件管理

> **Epic ID**: E04
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Stories**: 8

## Epic Goal

管理 ICSOP 文件池的完整生命週期：建立、編輯（帶當前版本對照）、狀態切換（有效／失效／作廢）、附件管理（ICSOP PDF、OJT 實體簽到表）、文件間交叉連結，以及編號唯一性維護。ICSOP 文件是整個平台的核心資料實體，其資料品質與正確性直接影響前台瀏覽（E06）、稽核追蹤（E07）與循環 DAG 畫布（E03）的正確運作。

本 Epic 不含「循環／節點」本身的維護（見 E03），也不含「使用表單」的獨立上傳流程（見 E05，ICSOP PDF 與 OJT 簽到表除外，兩者於本 Epic 的 US-036 處理）。版本管理策略為「同時間只存在 1 個版本，不保留歷史版本檔案」，編輯時僅在畫面上呈現當前值與新值的對照，儲存後即覆蓋。

## 單一 ICSOP 文件欄位清單（權威定義）

> **欄位調整（2026-07-17 定案）**：移除「當責部門」（由制定公司/部門/室別承接組織歸屬；當責室長-主要/次要保留）；新增 制定公司/制定部門/制定室別/內容摘要；「發布日期」改名「公告日期」；「人為版本號」改名「版次」（格式 `{YY}'{NN}`）。共 19 欄。權威定義以 [data-model.md#document-entity](../../specs/data-model.md#document-entity) 為準。
>
> **UI 顯示標籤**（實體名維持「ICSOP 文件」）：文件編號→「程序書編號」、文件名稱→「程序書書名」、文件連結點→「連結點程序書」、所屬循環→「循環別」、ICSOP PDF→「檔案」。

| # | 欄位 | 說明 |
|---|------|------|
| 1 | 系統 UUID | 系統產生，唯讀 |
| 2 | 文件狀態 | 有效／失效／作廢，管理員手動切換，無簽核流程（清單依公告日期把「有效」衍生顯示為 已公告/進度中） |
| 3 | 制定公司 | 1 個（新增） |
| 4 | 制定部門 | 1 個（新增） |
| 5 | 制定室別 | 1 個（新增）；三級可依組織階層由室別回溯部門/公司 |
| 6 | ICSOP 文件編號（程序書編號） | 人為定義，可更新，同時間文件間不可重複 |
| 7 | 當責室長－主要 | 1 位 |
| 8 | 當責室長－次要 | 可多位 |
| 9 | 文件使用部門 | 可多個 |
| 10 | 版次 | 兩段式字串 `{YY}'{NN}`（年度＇序號，如 `26'01`）（原「人為版本號」改名） |
| 11 | 所屬循環（循環別） | 1 個，見 [E03](../E03-lifecycle-dag/epic-brief.md) |
| 12 | 所屬節點 | 0..1，見 [E03](../E03-lifecycle-dag/epic-brief.md)（一律經節點抽屜指派） |
| 13 | ICSOP 文件連結點（連結點程序書） | 多個，連到其他 ICSOP 文件 |
| 14 | ICSOP PDF（檔案） | 1 份 |
| 15 | 使用表單 | 多個（excel／pdf），獨立管理見 [E05](../E05-usage-form/epic-brief.md) |
| 16 | 公告日期 | 單一日期（原「發布日期」改名）；決定有效文件於清單顯示為已公告/進度中 |
| 17 | OJT 實體簽到表 | 1 份（pdf 或圖片） |
| 18 | 文件名稱（程序書書名） | 人為定義之可讀標題，與 ICSOP 編號分離；前台清單顯示與關鍵字搜尋用（定案 OQ-DATA-01） |
| 19 | 內容摘要 | 程序書內容摘要（可讀文字）（新增） |

## User Stories

| Story ID | Title | Priority | File |
|---|---|---|---|
| US-030 | 建立 ICSOP 文件 | P0 | [US-030-create-icsop-document.md](US-030-create-icsop-document.md) |
| US-031 | 編輯與版本對照 | P0 | [US-031-edit-with-comparison.md](US-031-edit-with-comparison.md) |
| US-032 | 文件狀態切換 | P0 | [US-032-status-toggle.md](US-032-status-toggle.md) |
| US-033 | 文件編號唯一性管理 | P0 | [US-033-document-number-uniqueness.md](US-033-document-number-uniqueness.md) |
| US-034 | 制定組織與當責室長設定 | P0 | [US-034-accountable-dept-chief-assignment.md](US-034-accountable-dept-chief-assignment.md) |
| US-035 | 文件連結點管理 | P1 | [US-035-document-cross-link.md](US-035-document-cross-link.md) |
| US-036 | PDF 與 OJT 附件上傳 | P0 | [US-036-pdf-ojt-attachment-upload.md](US-036-pdf-ojt-attachment-upload.md) |
| US-037 | 後台文件清單與搜尋 | P0 | [US-037-backend-document-list-search.md](US-037-backend-document-list-search.md) |

## Dependencies

**Depends On**:
- [E03 循環池與 DAG 畫布維護](../E03-lifecycle-dag/epic-brief.md) — 文件之所屬循環／所屬節點欄位
- [E02 組織同步與異動管理](../E02-org-sync/epic-brief.md) — 制定公司／制定部門／制定室別／當責室長／使用部門下拉選單資料來源
- [E08 權限矩陣](../E08-permission-matrix/epic-brief.md) — 角色×功能、角色×欄位權限矩陣

**Blocks**:
- [E05 文件使用表單管理](../E05-usage-form/epic-brief.md) — 使用表單掛載於本 Epic 建立的文件之上
- [E06 前台 RWD 瀏覽](../E06-public-browsing/epic-brief.md) — 前台展示資料來源
- [E07 稽核與文件調閱歷程](../E07-audit-trail/epic-brief.md) — 稽核記錄之操作對象

**相關 NFR**：[NFR-001 效能與可擴展性](../../non-functional/NFR-001-performance.md)、[NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)

## Success Criteria

- ICSOP 管理員可完成文件的建立、編輯、狀態切換、附件上傳等全套操作，且所有 19 個欄位皆可被正確維護
- 文件編號唯一性規則在建立與編輯時皆被強制驗證，無法儲存重複編號
- 編輯畫面可正確呈現「當前值 vs 新值」對照，儲存後不留歷史版本檔案
- 後台清單可依編號、狀態、部門等條件查詢與排序

## Open Questions

> **本 Epic 之 Open Questions 已全數定案**，保留於此供追溯。完整決策紀錄見 [open-questions.md](../../../specs/open-questions.md)。

- [x] （已定案）文件建立時僅指定「所屬循環」（必填），允許以「所屬節點未指派」狀態建立；「所屬節點」一律稍後透過 E03 節點抽屜（US-023）指派——節點抽屜為唯一權威寫入路徑（見 US-030、US-023）
- [x] **（已定案 2026-07-17，OQ-E04-01b）ICSOP 文件編號唯一性檢查範圍**：比對範圍為「有效」＋「作廢」狀態文件；「失效」狀態文件之編號視為已釋出、可被重用（非原草案「全庫檢查」）。詳見 [US-033](US-033-document-number-uniqueness.md) AC1／AC2／AC4。
- [x] **（已定案 2026-07-17，OQ-E04-02）文件狀態切換原因欄位**：新增「切換原因」選填欄位（非必填），記錄於 [E07 US-062 變更歷程](../E07-audit-trail/US-062-document-change-history.md)。詳見 [US-032](US-032-status-toggle.md) AC5。
- [x] **ICSOP PDF、OJT 簽到表、使用表單之檔案大小上限與允許格式**（OQ-E04-06 ✅）— **定案**：單檔上限 **≤ 50MB**；ICSOP PDF／OJT 簽到表＝**PDF 或圖片（jpg/png）**；使用表單＝**xlsx／xls／pdf**。詳見 [US-036](US-036-pdf-ojt-attachment-upload.md)。
- [x] **文件連結點是否允許連結到「已作廢」或「已失效」文件**（OQ-E04-05 ✅）— **定案**：允許，並於前台標示目標文件狀態。詳見 [US-035](US-035-document-cross-link.md)。
