# US-094: 管理端檢視提取結果與重新索引狀態

> **Story ID**: US-094
> **Epic**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
> **Priority**: P1 (Should Have)
> **Phase**: 1
> **Estimated Points**: 5

---

## User Story

**As a** ICSOP 管理員,
**I want** 於後台檢視某文件的 chunk 提取結果預覽與重新索引狀態（成功／失敗／進行中）,
**So that** 我能在 Phase 3 前台問答上線前確認抽取品質，並在索引失敗時即時察覺並排查問題。

---

## Acceptance Criteria

### AC-1: chunk 預覽
- **Given** 一份已完成索引建立的文件
- **When** 我於後台開啟該文件的「AI 索引狀態」頁籤
- **Then** 我可看到該文件被切分出的全部 chunk 清單，包含每個 chunk 的內容片段與其 metadata（ICSOP 編號／循環／章節／使用部門／狀態／公告日期／版次／頁次）

### AC-2: 索引狀態顯示
- **Given** 一份文件正在或已完成抽取／索引流程
- **When** 我查看該文件的索引狀態
- **Then** 系統顯示三種狀態之一：「進行中」、「成功」（含最後索引時間）、「失敗」（含失敗原因摘要）

### AC-3: 失敗詳情與重試
- **Given** 一份文件的索引狀態為「失敗」
- **When** 我點擊查看詳情
- **Then** 我可看到具體失敗階段（抽取失敗／切 chunk 失敗／向量化失敗）與錯誤訊息，並可手動觸發重新索引

### AC-4: 批次總覽
- **Given** 後台有多份文件已建立或嘗試建立索引
- **When** 我進入「AI 索引管理」總覽頁
- **Then** 我可看到全部文件的索引狀態彙總（如成功 N 份／失敗 N 份／進行中 N 份），並可篩選出失敗項目逐一處理

---

## Technical Notes

- 本 story 為 Phase 1「管理端可視性」定案項目（見 `AI-RAG-評估報告.md` 第九節），目的是讓管理員在 Phase 3 前台問答尚未上線前，能獨立驗證 ingestion 管線品質，降低 Phase 3 上線後才發現抽取品質不佳的風險。
- chunk 預覽僅供管理員檢視（不對一般使用者開放），不涉及前台問答互動。
- 重新索引狀態的三態（進行中／成功／失敗）與失敗詳情之資料來源為 [US-092](US-092-chunking-metadata-vector-index.md)／[US-093](US-093-reversion-reextract-reindex.md) 執行過程產生的紀錄，本 story 為其呈現層。
- Priority 定為 P1（而非 P0）：管線本身（US-090～093）為 Phase 1 核心必要功能，本 story 為輔助管理員驗證品質的可視性工具，若時程緊迫可短暫以資料庫直接查詢／日誌替代，但正式上線前建議補齊此 UI 以降低營運風險。

---

## Test Cases

### TC-094-01: 成功索引之 chunk 預覽（Happy Path）
- **Given**: 已成功索引的文件
- **When**: 開啟其 AI 索引狀態頁籤
- **Then**: 可看到完整 chunk 清單與 metadata

### TC-094-02: 進行中狀態顯示（Happy Path）
- **Given**: 索引尚在處理中的文件
- **When**: 查看其索引狀態
- **Then**: 顯示「進行中」

### TC-094-03: 失敗詳情顯示（Error）
- **Given**: 索引失敗的文件
- **When**: 查看其索引狀態詳情
- **Then**: 顯示具體失敗階段與錯誤訊息

### TC-094-04: 批次篩選與重試（Happy Path）
- **Given**: 總覽頁存在多筆失敗項目
- **When**: 我篩選出全部失敗項目並對其中一筆手動觸發重新索引
- **Then**: 重新索引成功，該筆狀態更新為「成功」

### TC-094-05: 尚未建立索引之文件（Edge）
- **Given**: 文件尚未上傳 .xls 原始檔
- **When**: 查看其索引狀態
- **Then**: 顯示「尚未建立」而非誤判為失敗

---

## Dependencies

- **Blocked By**: [US-092 依章/節切 chunk 並掛 metadata、建向量索引](US-092-chunking-metadata-vector-index.md)、[US-093 文件改版重抽與重建索引、舊版排除](US-093-reversion-reextract-reindex.md)
- **Blocks**: 無直接下游 story，為 Phase 3 上線前的品質驗證工具

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

---

## Related

- **Epic Brief**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
- **Related Stories**: US-092、US-093、[E04 US-037 後台文件清單與搜尋](../E04-icsop-document/US-037-backend-document-list-search.md)（可能之入口掛載點）
