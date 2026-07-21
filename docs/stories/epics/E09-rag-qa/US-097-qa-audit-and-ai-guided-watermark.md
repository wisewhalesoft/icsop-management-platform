# US-097: 問答稽核與經 AI 導引之浮水印/稽核

> **Story ID**: US-097
> **Epic**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 3
> **Estimated Points**: 8

---

## User Story

**As a** 稽核管理者,
**I want** AI 智慧問答本身的每次提問、以及經其導引之文件檢視／下載，都比照既有調閱歷程一併記錄稽核軌跡,
**So that** 公司能完整掌握「誰、何時、透過 AI 問答得知了哪些文件內容」，滿足內控與稽核合規要求，不因新增 AI 問答管道而出現稽核缺口。

---

## Acceptance Criteria

### AC-1: 問答事件稽核
- **Given** 使用者透過智慧問答提出一次問題並取得答案
- **When** 系統完成該次問答
- **Then** 系統記錄一筆稽核紀錄，內容包含操作人員、部門／處室、問題內容、回覆所引用之文件清單、時間戳記

### AC-2: AI 導引檢視/下載沿用既有機制
- **Given** 使用者點擊智慧問答答案中的引用連結進入文件檢視器或下載文件
- **When** 該檢視／下載動作發生
- **Then** 系統比照 [E07 US-060](../E07-audit-trail/US-060-audit-trail-logging.md) 既有機制產生對應之檢視／下載稽核紀錄，並套用 [E06 US-053](../E06-public-browsing/US-053-viewer-watermark-overlay.md)／[US-054](../E06-public-browsing/US-054-download-print-watermark-burn.md) 既有浮水印機制，不因入口是 AI 問答而有差異或遺漏

### AC-3: 併入既有稽核查詢後台
- **Given** 管理者於 [E07 US-061](../E07-audit-trail/US-061-access-history-query-backend.md) 文件調閱歷程查詢後台查詢
- **When** 查詢條件命中某筆經 AI 問答導引產生的檢視／下載紀錄
- **Then** 該紀錄可被查詢到，並可標示其「來源為 AI 智慧問答」以利區分於一般前台瀏覽路徑之調閱

### AC-4: 稽核記錄失敗不阻斷問答
- **Given** 稽核紀錄寫入發生錯誤
- **When** 使用者完成一次問答
- **Then** 使用者仍可正常取得答案（不因稽核寫入失敗而阻斷問答功能），但比照 E07 既有原則需有補償／重試機制避免稽核資料遺漏

---

## Technical Notes

- 本 story 為 [E07 稽核與文件調閱歷程](../E07-audit-trail/epic-brief.md) 的直接擴充：新增「問答事件」為稽核紀錄的新操作類型（在既有的檢視／下載／列印之外），並將「AI 問答導引」標示為既有檢視／下載紀錄的來源分類，而非另建一套獨立稽核系統。
- 問題內容本身是否需要完整記錄（可能涉及使用者輸入之原始文字）或僅記錄摘要／雜湊，待與稽核政策／個資考量一併確認，列為 Open Question。
- AC-4 之補償／重試機制設計原則與 E07 既有 Open Question「稽核紀錄記錄失敗時的補償／重試機制」相同，建議統一技術方案，不重複設計。

---

## Test Cases

### TC-097-01: 問答稽核紀錄完整性（Happy Path）
- **Given**: 使用者完成一次問答
- **When**: 系統記錄稽核
- **Then**: 產生一筆問答稽核紀錄且欄位完整

### TC-097-02: AI 導引檢視稽核與浮水印（Happy Path）
- **Given**: 使用者點擊答案引用連結檢視文件
- **When**: 系統處理該檢視動作
- **Then**: 產生對應檢視稽核紀錄＋浮水印，與一般前台路徑一致

### TC-097-03: 稽核查詢區分來源（Happy Path）
- **Given**: 管理者於稽核查詢後台查詢
- **When**: 命中經 AI 問答導引之調閱紀錄
- **Then**: 可查到並區分出「來源為 AI 問答」

### TC-097-04: 稽核寫入失敗不阻斷問答（Edge）
- **Given**: 稽核紀錄寫入當下失敗
- **When**: 使用者完成問答
- **Then**: 使用者仍正常取得答案，系統另行補償寫入

---

## Dependencies

- **Blocked By**: [US-095 前台自然語言智慧問答](US-095-frontend-nl-qa-with-citations.md)、[E07 US-060 查看/下載/列印稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)、[E07 US-061 文件調閱歷程查詢後台](../E07-audit-trail/US-061-access-history-query-backend.md)
- **Blocks**: 無下游 story，為稽核合規之延伸能力

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

---

## Related

- **Epic Brief**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
- **Related Stories**: US-095、[E07 US-060](../E07-audit-trail/US-060-audit-trail-logging.md)、[E07 US-061](../E07-audit-trail/US-061-access-history-query-backend.md)
