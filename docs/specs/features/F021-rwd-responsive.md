# F021: RWD 響應式版面
Priority: P1 | Status: Draft | Last Updated: 2026-07-15
Epic/Story: E06 / US-055

## Description
前台網頁為 RWD，於桌機（≥1024px）、平板（768–1023px）、手機（<768px，最小 360px）三斷點皆可正常操作清單、搜尋、篩選與文件檢視器。此為橫向貫穿前台各功能之關注點。

## Preconditions
- 前台核心功能（F019/F020）已具備。斷點依 [NFR-005](../nfr.md#browser-rwd)。

## Main Flow
1. 依斷點調整版面（如清單改卡片式/單欄）。
2. 三斷點下清單瀏覽、搜尋、篩選、開啟檢視器等核心操作皆可觸及且無版面錯亂。
3. 手機檢視器：文件內容可縮放/捲動，浮水印清晰可辨。

## Alternative Flows
- 觸控操作：手機/平板互動元件觸控目標 ≥ 44×44px。

## Edge Cases
- 平板橫/直向切換（觸發斷點變化）：搜尋關鍵字與篩選條件維持不變。
- 手機最小 360px：不出現水平捲動或內容截斷。
- 極小寬度（如 280px）：不強制支援，但不得版面完全崩壞（降級處理）。

## Postconditions
- 使用者於任何支援裝置皆可完成核心瀏覽任務。

## Acceptance Criteria
- Given 桌機 1440px, When 瀏覽, Then 清單/篩選列/檢視器版面正確。
- Given 手機 375px, When 瀏覽, Then 清單改單欄卡片式，功能皆可觸及。
- Given 平板橫/直向切換, When 版面重排, Then 搜尋/篩選條件不遺失。
- Given 手機 360px, When 瀏覽, Then 無水平捲動或內容截斷。
- Given 手機開啟檢視器, When 載入, Then 內容可縮放/捲動，浮水印清晰可辨。

## Error Scenarios
- 極小寬度降級：見 [NFR-005](../nfr.md#browser-rwd)（後台 DAG 畫布以桌機為主）。

## Related
- Depends on: [F019](F019-public-list-browsing.md), [F020](F020-watermark.md)
- NFR: [瀏覽器相容與 RWD](../nfr.md#browser-rwd)
- OQ: OQ-NFR005（後台畫布平板編輯? 標準瀏覽器政策）
