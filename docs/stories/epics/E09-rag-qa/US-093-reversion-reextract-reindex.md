# US-093: 文件改版重抽與重建索引、舊版排除

> **Story ID**: US-093
> **Epic**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 8

---

## User Story

**As a** ICSOP 管理員,
**I want** 文件改版（內容更新或狀態切換）時系統自動重新抽取內文並重建向量索引，同時將舊版排除於有效檢索範圍,
**So that** 前台問答（Phase 3）未來的回答永遠依據最新且有效的文件內容，不會引用已失效或過期資訊。

---

## Acceptance Criteria

### AC-1: 改版觸發重抽
- **Given** 一份已產生索引的文件
- **When** 管理員更新該文件的 .xls 原始檔（見 [US-090](US-090-xls-source-and-presentation-pdf.md)）或編輯內容（見 [E04 US-031](../E04-icsop-document/US-031-edit-with-comparison.md)）
- **Then** 系統自動觸發 [US-091](US-091-template-aware-extraction-cleaning.md) 抽取與 [US-092](US-092-chunking-metadata-vector-index.md) 切 chunk／索引流程，產生新版索引

### AC-2: 舊版排除
- **Given** 文件已產生新版索引
- **When** 前台問答（Phase 3）執行檢索
- **Then** 檢索結果僅包含最新有效版本之 chunk，舊版 chunk 依「狀態」metadata 被排除，不出現在檢索結果中

### AC-3: 狀態切換連動
- **Given** 文件狀態被切換為「失效」或「作廢」（見 [E04 US-032](../E04-icsop-document/US-032-status-toggle.md)）
- **When** 系統偵測到狀態變更
- **Then** 對應文件之全部 chunk 的狀態 metadata 同步更新，使其被排除於「有效」檢索範圍，不需重新抽取內文本身

### AC-4: 重抽失敗不影響舊索引可用性
- **Given** 文件改版觸發重抽
- **When** 新版抽取或索引建立過程失敗
- **Then** 系統保留舊版索引繼續可用（直到重抽成功），並標記重新索引狀態為「失敗」供 [US-094](US-094-admin-extraction-reindex-visibility.md) 查詢，文件不會在修復前處於「完全無索引」狀態

---

## Technical Notes

- 「重新抽取重建索引」與「狀態 metadata 排除」為兩種不同機制：前者處理內容變更（需重跑 US-091／US-092），後者處理純狀態切換（僅更新 metadata，不需重抽，效能較輕量）。
- 與 [E04 US-032 文件狀態切換](../E04-icsop-document/US-032-status-toggle.md)、[E04 US-031 編輯與版本對照](../E04-icsop-document/US-031-edit-with-comparison.md) 為觸發來源之整合點，建議以事件／webhook 方式串接，具體技術方案待架構師確認。
- AC-4 之「保留舊版索引直到重抽成功」與 E04「不保留歷史版本檔案」的版本管理精神略有差異——此處保留的是「索引重建緩衝期」而非永久保留舊版，重抽成功後舊版索引即被新版取代，屬技術層面的過渡機制，不影響 E04 文件本身的版本策略。

---

## Test Cases

### TC-093-01: 內容更新觸發重抽（Happy Path）
- **Given**: 文件 .xls 內容更新
- **When**: 系統偵測改版
- **Then**: 自動重抽並產生新版索引，舊版 chunk 不再出現於檢索結果

### TC-093-02: 狀態切換立即排除（Happy Path）
- **Given**: 文件狀態切換為「作廢」
- **When**: 系統偵測狀態變更
- **Then**: 不需重抽，其 chunk 立即被排除於有效檢索範圍

### TC-093-03: 重抽失敗保留舊版（Edge）
- **Given**: 重抽過程失敗
- **When**: 系統執行重建索引
- **Then**: 保留舊版索引繼續服務檢索，並標記失敗狀態

### TC-093-04: 狀態還原（Edge）
- **Given**: 文件狀態由「失效」切回「有效」
- **When**: 系統偵測狀態變更
- **Then**: 對應 chunk 重新納入有效檢索範圍（無需重抽，僅 metadata 還原）

---

## Dependencies

- **Blocked By**: [US-092 依章/節切 chunk 並掛 metadata、建向量索引](US-092-chunking-metadata-vector-index.md)、[E04 US-031 編輯與版本對照](../E04-icsop-document/US-031-edit-with-comparison.md)、[E04 US-032 文件狀態切換](../E04-icsop-document/US-032-status-toggle.md)
- **Blocks**: [US-094 管理端檢視提取結果與重新索引狀態](US-094-admin-extraction-reindex-visibility.md)、[US-096 權限感知檢索](US-096-permission-aware-retrieval.md)（依賴狀態 metadata 正確性）

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

---

## Related

- **Epic Brief**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
- **Related Stories**: US-092、[E04 US-031](../E04-icsop-document/US-031-edit-with-comparison.md)、[E04 US-032](../E04-icsop-document/US-032-status-toggle.md)、US-094、US-096
