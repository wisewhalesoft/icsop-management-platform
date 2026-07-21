# US-055: RWD 響應式版面

> **Story ID**: US-055
> **Epic**: [E06 前台RWD瀏覽](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 公司同仁,
I want 無論使用桌機、平板或手機瀏覽前台網頁，都能正常操作清單、搜尋、篩選與檢視文件,
So that 我可以在任何裝置上隨時查閱所需的 ICSOP 文件，不受限於特定裝置。

## Acceptance Criteria

### AC1：三種斷點下核心功能皆可操作

**Given** 使用者以桌機（≥1024px）、平板（768–1023px）或手機（<768px，最小支援寬度 360px）瀏覽前台
**When** 執行清單瀏覽、搜尋、篩選、開啟文件檢視器等核心操作
**Then** 版面正確調整（如清單改為卡片式或單欄呈現），所有核心功能皆可觸及且無版面錯亂。

### AC2：手機版檢視器可正常閱讀文件與浮水印

**Given** 使用者以手機瀏覽器開啟文件檢視器
**When** 文件與浮水印一併載入
**Then** 文件內容可縮放/捲動閱讀，浮水印清晰可辨識，不因螢幕縮小而遺失或變形至無法辨識。

### AC3：斷點切換時狀態保留

**Given** 使用者於平板瀏覽器中旋轉螢幕方向（橫向/直向切換觸發斷點變化）
**When** 版面重新排列
**Then** 使用者當前的搜尋關鍵字與篩選條件維持不變，不因版面重排而遺失。

## Technical Notes

- 斷點定義依循 [NFR-005](../../non-functional/NFR-005-browser-rwd-compatibility.md)：桌機 ≥1024px、平板 768–1023px、手機 <768px（最小 360px）。
- 前端採 React + TypeScript 實作（技術棧參考），RWD 可透過 CSS Grid/Flexbox 搭配斷點媒體查詢達成。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-055-01 | 桌機瀏覽器（1440px）→ 清單、篩選列、檢視器版面正確 | Happy Path |
| TC-055-02 | 手機瀏覽器（375px）→ 清單改為單欄卡片式，功能皆可觸及 | Happy Path |
| TC-055-03 | 平板橫向/直向切換 → 版面重排但搜尋/篩選條件不遺失 | Edge Case |
| TC-055-04 | 手機最小支援寬度 360px → 版面不出現水平捲動或內容截斷 | Edge Case |
| TC-055-05 | 不支援之極小寬度（如 280px）→ 依草案不強制支援，但不得出現版面完全崩壞（草案降級處理） | Error Case |

## Dependencies

- **Blocked By**：[US-050 前台清單與排序規則](US-050-public-list-sorting.md)（RWD 為跨多個前台功能的橫向關注點）
- **Blocks**：無

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E06 前台RWD瀏覽](epic-brief.md)
- [NFR-005 瀏覽器相容性與RWD](../../non-functional/NFR-005-browser-rwd-compatibility.md)
