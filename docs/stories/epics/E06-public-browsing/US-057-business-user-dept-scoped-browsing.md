# US-057: 業務使用者之前台使用部門限縮瀏覽

> **Story ID**: US-057
> **Epic**: [E06 前台 RWD 瀏覽](epic-brief.md)
> **Priority**: P0（建議，待人類確認）
> **Phase**: 1
> **Status**: **DRAFT**（從屬 story，依賴 [E08 US-072](../E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md) 之身分模型定案；其 Open Questions 未裁決前，本 story 之 AC 亦不可視為最終規格）
> **Estimated Points**: 5

## 主從關係

本 story 為 [E08 US-072 一般使用者子分類——業務／其他](../E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md) 之**從 story**。US-072 定義「業務／其他」子分類之身分模型與矩陣層級漣漪（F025/F026/F033）；本 story 聚焦於**前台瀏覽行為**本身——即業務使用者於 [F019](../../../specs/features/F019-public-list-browsing.md) 清單/搜尋/篩選、文件詳情頁、[F020](../../../specs/features/F020-watermark.md) 檢視器與下載/列印路徑之具體限縮 AC。若 US-072 之 OQ-1（身分模型）或 OQ-3（限制作用範圍）之裁決結果與本 story 假設不同，本 story 之 AC 需同步調整。

## User Story

As a 子分類為「業務」之一般使用者,
I want 無論透過清單瀏覽、搜尋、篩選、或取得他人分享之文件連結，皆僅能存取使用部門與我所屬部門相符（含子樹展開）之已公告文件,
So that 我不會因清單以外之管道（直連網址、檢視器、下載）意外瀏覽或取得非我職掌部門之內控程序書內容，達成「避免外流」之目的。

## 業務價值／風險（外流防護）

延續 [US-072](../E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md) 之風險陳述：若限制僅發生於清單畫面、而詳情頁直連 URL／檢視器／下載 API 未同步收斂，業務使用者仍可透過「已知文件編號」或「他人分享連結」繞過清單限制取得非其部門文件，防護效果將被完全架空。本 story 之核心價值即是把「使用部門限制」落實到**每一個能取得文件內容或中繼資料的路徑**，而非僅清單入口。

## 範圍與非範圍

### 範圍（In Scope）
- 前台清單（F019）之查詢/搜尋/篩選結果過濾。
- 文件詳情頁與直連 URL 之存取控制。
- 檢視器（F020 網頁疊加）之開啟權限。
- 下載/列印（F020 燒錄）之執行權限。

### 非範圍（Out of Scope）
- 身分模型與矩陣漣漪（見主 story [US-072](../E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md)）。
- RAG 問答檢索（F033，Phase 3，見 US-072 AC8）。
- 後台管理路徑（F017 後台清單等）——業務子分類僅限制「一般使用者」角色之前台瀏覽，不影響其餘角色之後台存取。

## 具體驗收準則草案（Given/When/Then）

以下 AC 依賴 [US-072](../E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md) OQ-2（比對語意）與 OQ-3（作用範圍）之建議選項（沿用子樹展開 predicate；清單/搜尋/篩選/詳情直連/檢視器/下載列印全面收斂）撰寫，裁決結果不同時需回頭調整。

### AC1：清單/搜尋/篩選之過濾（承接 US-072 AC3/AC5/AC6/AC7）
**Given** 業務使用者開啟前台清單、套用關鍵字搜尋、或套用部門/狀態/循環篩選之任意組合
**When** 送出查詢
**Then** 回傳結果一律先套用「已公告 AND 使用部門與使用者相符（含子樹）」之基底過濾，再套用其餘篩選/搜尋條件（AND 組合）；使用部門不相符者於任何組合下皆不出現，不因排列組合不同而洩漏。

### AC2：詳情頁直連 URL 之存取控制
**Given** 業務使用者取得（如經同事分享、書籤、瀏覽器歷史）一個非其使用部門文件之詳情頁直連網址
**When** 該使用者開啟該網址
**Then** 系統回應如同該文件不存在（詳細回應碼與文案見 OQ-A），不得回傳該文件之任何中繼資料（文件名稱、制定部門等）供業務使用者得知其存在。

### AC3：檢視器開啟權限
**Given** 業務使用者嘗試開啟非其使用部門文件之網頁檢視器（F020 VIEW）
**When** 請求送出
**Then** 系統拒絕開啟，不疊加浮水印、不回傳檔案內容任何片段。

### AC4：下載/列印執行權限
**Given** 業務使用者嘗試下載或列印非其使用部門文件（F020 DOWNLOAD/PRINT）
**When** 請求送出
**Then** 系統拒絕執行，不產生任何燒錄浮水印之檔案位元組。

### AC5：使用部門相符者之路徑不受影響
**Given** 業務使用者存取使用部門與其相符之文件（清單、詳情、檢視器、下載/列印任一路徑）
**When** 操作執行
**Then** 系統行為與現行一般使用者完全一致（含既有浮水印/稽核機制），不因子分類而額外增加限制或步驟。

### AC6：其他子分類使用者之對照組
**Given** 使用者子分類為「其他」
**When** 執行上述 AC1～AC4 對應之操作（清單/搜尋/篩選/詳情直連/檢視器/下載列印）
**Then** 系統行為與本 story 導入前完全一致，不受使用部門限制（僅置頂排序受影響，如現行 F019 規則）。

## Open Questions（待人類裁決）

### OQ-A：直連 URL 被拒絕時之回應碼與文案（存在性洩漏考量）
**選項**：
- A.（**建議**）回傳如同資源不存在之通用回應（如 404 或統一「找不到文件」訊息），**不使用 403**——因 403（禁止）本身即透露「此文件確實存在，只是你沒有權限」，屬於一種存在性洩漏（使業務使用者得知「某編號文件確實存在於系統中，只是不在我的部門」），與「避免外流」之精神有一定程度的緊張關係（雖然洩漏的僅是「存在性」而非「內容」，風險遠低於內容外流，但仍建議收斂）。
- B. 回傳 403（與現行 F025/F026 越權操作一致的既有慣例），不特別處理存在性洩漏疑慮。

**建議與理由**：**選項 A** 較嚴謹，但需注意現行系統對所有越權操作（F025/F026 AC）之慣例皆為回 403，若本 story 改採 404，將是系統中第一個「刻意隱藏資源存在性」的例外案例，需要架構面統一考量（例如是否連 API 錯誤訊息文案也要避免透露文件編號有效性）。若人類認為此風險等級不需要特別處理（403 已足夠，且與系統其餘越權處理一致性更重要），可選 B 以維持全系統慣例一致、降低實作特例之複雜度。**此為本 story 中最需要人類明確裁決之題**。

**影響面**：error-handling.md（是否新增「存在性隱藏」之錯誤慣例）、F019/F020 之 API 錯誤回應設計、系統架構一致性（此例外是否會被要求推廣至其他越權場景，如部門窗口對非其唯讀範圍之操作）。

### OQ-B：檢視器/下載 API 之權限檢查時機
**選項**：
- A.（**建議**）於 API 層（後端）統一檢查，前端僅為使用者體驗優化（如清單本就不顯示連結），不依賴前端隱藏來防護。
- B. 允許前端暫時性顯示連結、僅後端最終把關（風險：使用者可能誤以為連結可用，體驗較差，但安全性不受影響因後端仍會擋下）。

**建議與理由**：選 **A**，此為系統既有原則（[F026](../../../specs/features/F026-role-field-matrix.md) Technical Notes 已明載「前端表單應依此矩陣動態決定欄位是否唯讀顯示，但後端仍須獨立驗證，不可僅依賴前端隱藏欄位」），本 story 沿用同一原則，非新增決策，僅為完整性列出供 spec-writer 確認一致採用。

**影響面**：F020（檢視器/下載 API 授權檢查邏輯新增使用部門判斷分支）。

## Dependencies

- **Blocked By**：[E08 US-072 一般使用者子分類——業務／其他](../E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md)（主 story，身分模型須先定案）、[US-050 前台清單與排序規則](US-050-public-list-sorting.md)、[US-052 部門/狀態/循環篩選](US-052-filter-dept-status-lifecycle.md)、[US-053 網頁檢視器浮水印疊加](US-053-viewer-watermark-overlay.md)、[US-054 下載/列印 PDF 浮水印燒錄](US-054-download-print-watermark-burn.md)
- **Blocks**：無（本 story 為既有前台瀏覽行為之限縮性 delta，不阻擋其餘 Story）

## Definition of Done（本 story 之 DoD，非後續實作 story 之 DoD）

- [ ] OQ-A、OQ-B 已由人類裁決
- [ ] 與主 story（US-072）之依賴前提（身分模型、OQ-2/OQ-3 選項）已一致
- [ ] 可交付 spec-writer 轉為 F019/F020 正式 spec delta

## Related

- [Epic Brief: E06 前台 RWD 瀏覽](epic-brief.md)
- [E08 US-072 一般使用者子分類——業務／其他](../E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md)（主 story）
- [US-050 前台清單與排序規則](US-050-public-list-sorting.md)、[US-052 部門/狀態/循環篩選](US-052-filter-dept-status-lifecycle.md)、[US-053 網頁檢視器浮水印疊加](US-053-viewer-watermark-overlay.md)、[US-054 下載/列印 PDF 浮水印燒錄](US-054-download-print-watermark-burn.md)
- Spec: [F019 前台清單瀏覽](../../../specs/features/F019-public-list-browsing.md)、[F020 文件浮水印](../../../specs/features/F020-watermark.md)、[F025 角色×功能矩陣](../../../specs/features/F025-role-function-matrix.md)、[F026 角色×欄位矩陣](../../../specs/features/F026-role-field-matrix.md)
