# NFR-007: 浮水印防竄改與一致性 (Watermark Integrity)

> **NFR ID**: NFR-007
> **Category**: Security / Compliance
> **Priority**: P0
> **Status**: Draft

## Requirement

公司同仁於網頁檢視器檢視、或下載/列印 ICSOP 文件時，須疊加/燒錄浮水印以標示使用者身分，格式為：

```
{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現}-{當下時間}
```

此為權威格式定義，[E06 US-053](../epics/E06-public-browsing/US-053-viewer-watermark-overlay.md)（網頁檢視器疊加）與 [E06 US-054](../epics/E06-public-browsing/US-054-download-print-watermark-burn.md)（下載/列印 PDF 燒錄）兩處必須完全一致。

## Acceptance Criteria

- **AC1（伺服器端產生）**：浮水印內容須於伺服器端動態組裝（讀取當下登入使用者身分與伺服器時間），不可由前端 JavaScript 自行組裝或可被使用者竄改。
- **AC2（PDF 實際燒錄）**：下載/列印取得之 PDF 檔案本身須將浮水印文字實際嵌入頁面內容（如以 PDF 處理函式庫疊加文字圖層），而非僅前端顯示樣式，確保檔案脫離系統後浮水印仍存在。
- **AC3（格式一致性）**：網頁檢視器疊加與 PDF 燒錄兩者的浮水印文字格式、欄位順序須完全一致，符合上述權威格式。
- **AC4（時間即時性）**：「當下時間」須為使用者實際檢視/下載/列印當下的伺服器時間戳記，同一文件不同次檢視應產生不同時間戳記的浮水印。
- **AC5（防繞過）**：檢視器需採取合理技術手段降低使用者透過瀏覽器開發工具或列印預覽移除浮水印圖層的風險（草案：至少確保浮水印為疊加圖層而非可簡單以 CSS 選取刪除的獨立 DOM 元素；完整防繞過非本系統範疇內可完全保證，列為 Open Question）。

## Impacted Stories

- [E06 US-053 網頁檢視器浮水印疊加](../epics/E06-public-browsing/US-053-viewer-watermark-overlay.md)
- [E06 US-054 下載/列印PDF浮水印燒錄](../epics/E06-public-browsing/US-054-download-print-watermark-burn.md)
- [E07 US-060 查看/下載/列印稽核軌跡記錄](../epics/E07-audit-trail/US-060-audit-trail-logging.md)（浮水印內容與稽核紀錄欄位需一致）

## Validation Method

- 下載多份不同使用者身分產生的 PDF，以 PDF 文字擷取工具驗證浮水印文字確實存在於檔案內容中（非僅畫面截圖可見）。
- 比對網頁檢視器畫面截圖與下載 PDF 之浮水印文字，確認格式一致。
- 使用瀏覽器開發工具嘗試移除網頁浮水印 DOM 元素，記錄實際防護程度並列入已知限制文件。

## Open Questions

- [ ] 浮水印在網頁檢視器上的視覺樣式（透明度、角度、重複排列方式、字體大小）未定義，需 UI/UX 設計階段補充。
- [ ] 「當下時間」的時區與格式（例如 `YYYY-MM-DD HH:mm:ss`，是否含時區標示）未定義。
- [ ] 完全防止使用者以螢幕截圖/拍照方式繞過浮水印非技術可完全解決之問題，此為已知限制，需與利害關係人確認可接受風險等級。
