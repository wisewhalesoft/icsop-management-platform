# US-053: 網頁檢視器浮水印疊加

> **Story ID**: US-053
> **Epic**: [E06 前台RWD瀏覽](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 8

## User Story

As a 公司同仁,
I want 在網頁內嵌檢視器開啟 ICSOP 文件時，畫面上自動疊加標示我身分的浮水印,
So that 若文件內容外流，可追溯來源，達成內部管控與嚇阻不當外流之目的。

## Acceptance Criteria

### AC1：開啟檢視器時正確疊加浮水印

**Given** 使用者於前台點擊某份 ICSOP 文件
**When** 系統開啟內嵌網頁檢視器顯示該文件
**Then** 畫面上疊加浮水印，內容格式為 `{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現}-{當下時間}`（其中機密聲明為固定字串），且此內容由伺服器端當下動態產生（見 [NFR-007](../../non-functional/NFR-007-watermark-integrity.md)）。各欄位取值定案（2026-07-20）：**公司名稱採全稱**（如「和潤企業股份有限公司」，非簡稱）；「部門」為使用者所屬**部層**之完整名稱；「處/室」為使用者所屬**最細單位**名稱（處/室層使用者顯示室名，課層使用者則顯示課名、略過中間處層），詳見 Technical Notes。

### AC4：無下層單位者之收合規則

**Given** 使用者所屬部門無「處/室」以下之下層單位（掛於部層、本部層或 Root，實測約 8.4% 使用者屬此情形）
**When** 系統產生浮水印內容
**Then** 「處/室」欄位留空，且**自動收合該欄位造成的多餘分隔符**，浮水印呈現為 `{員工編號}-{姓名}-{公司名稱}-{部門}-{僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現}-{當下時間}`（不得出現連續分隔符或空欄位）；此收合規則須與 [US-054 下載/列印燒錄](US-054-download-print-watermark-burn.md) 及稽核快照情境完全一致，確保同一使用者同一文件之浮水印字串在三種情境下相同（見 [NFR-007](../../non-functional/NFR-007-watermark-integrity.md)）。

### AC2：浮水印內容需即時反映開啟當下時間

**Given** 使用者兩次於不同時間點開啟同一份文件
**When** 分別產生浮水印
**Then** 兩次浮水印之時間戳記不同，且皆為各自開啟當下之伺服器時間。

### AC3：開啟檢視器同步觸發稽核記錄

**Given** 使用者成功開啟文件檢視器
**When** 檢視器載入完成
**Then** 系統同步記錄一筆「查看」稽核軌跡（見 [E07 US-060](../E07-audit-trail/US-060-audit-trail-logging.md)）。

## Technical Notes

- 浮水印疊加方式（例如以浮水印圖層覆蓋 PDF.js 渲染畫面、或後端合成含浮水印之預覽圖）由架構師決定，需符合 [NFR-007](../../non-functional/NFR-007-watermark-integrity.md) 之防竄改精神。
- 檢視器本身不應提供「另存無浮水印原始檔」的途徑；原始 ICSOP PDF 檔案僅可透過 [US-054 下載/列印](US-054-download-print-watermark-burn.md) 流程取得（同樣帶浮水印）。
- **欄位來源定案（2026-07-20，依上游 dev 環境唯讀實測）**：公司名稱取 `VW_HRCOMF.COMPFULLNM`（全稱）；「部門」取使用者所屬部門代碼推導之**部層**（`LEFT(CODE,2)+'000'`，無部層則 fallback 本部層再 fallback Root）之 `DESC_FULL`（完整名稱，如「營運管理部」）；「處/室」取使用者所屬部門 `DESC_CHI` 以 `/` 切分後之**最末段**（例如「營管部/審查室」→「審查室」），此規則同時涵蓋課層使用者（例：`DESC_CHI` 為「…/北區綜合處/醫療一課」→ 顯示「醫療一課」，略過中間處層）。詳見[上游人資來源資料契約 §8](../../../specs/upstream-hr-source-contract.md)。
- 上游組織實測為 5 層（本部／部／處室／課），較原規格假設之 4 層多出「課」層；「處/室」欄一律取「最細單位」，故課層使用者不需獨立第三欄位，維持既有兩欄格式不變。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-053-01 | 一般使用者開啟文件 → 浮水印正確顯示其員工編號/姓名/公司名稱/部門/處室/固定機密聲明/時間 | Happy Path |
| TC-053-02 | 同一使用者相隔 10 分鐘兩次開啟同文件 → 浮水印時間戳記不同 | Happy Path |
| TC-053-03 | 未登入使用者嘗試直接存取檢視器網址 → 拒絕存取並導回登入頁 | Error Case |
| TC-053-04 | 開啟檢視器同時檢查稽核紀錄是否同步寫入 → 稽核紀錄內容與浮水印內容一致 | Edge Case |
| TC-053-05 | 使用瀏覽器開發工具嘗試移除浮水印 DOM 元素 → 記錄於 NFR-007 之風險評估，非本 story 可完全防禦之範圍 | Edge Case |
| TC-053-06 | 使用者所屬部門為本部層或更高（無處/室下層），開啟檢視器 → 浮水印「處/室」欄留空且分隔符自動收合，不出現連續符號或空段 | Edge Case |
| TC-053-07 | 使用者所屬部門為「課」層（如醫療一課），開啟檢視器 → 浮水印「處/室」欄顯示課名（略過中間處層），符合最細單位規則 | Edge Case |
| TC-053-08 | 公司名稱正確顯示為 `COMPFULLNM` 全稱（如「和潤企業股份有限公司」），非 `COMPSIMPNM` 簡稱 | Happy Path |

## Dependencies

- **Blocked By**：[US-050 前台清單與排序規則](US-050-public-list-sorting.md)、[E01 帳號與驗證](../E01-account-auth/epic-brief.md)（使用者身分）、[E02 組織同步與異動管理](../E02-org-sync/epic-brief.md)（部門/處室資訊）
- **Blocks**：[E07 US-060 查看/下載/列印稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E06 前台RWD瀏覽](epic-brief.md)
- [NFR-007 浮水印防竄改與一致性](../../non-functional/NFR-007-watermark-integrity.md)
- [US-054 下載/列印PDF浮水印燒錄](US-054-download-print-watermark-burn.md)
- [E07 US-060 查看/下載/列印稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)
- Spec: [上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)（浮水印欄位對應與收合規則定案 §8）
