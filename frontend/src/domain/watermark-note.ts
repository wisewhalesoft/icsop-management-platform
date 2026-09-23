/**
 * 列內浮水印註記之逐字文案（F020 `AC-D2`／`AC-D7`／`AC-N20`）。
 *
 * 🔴 **前台詳情頁與後台五頁（清單／唯讀詳情／編輯／使用表單管理／附錄管理）共用同一組逐字文案，
 * 不得分歧**——2026-08-20 `OQ-D9-08` 選項 B 已推翻「後台恆 RAW」，後台自此亦燒錄，
 * 故 `AC-D7` ④ 之「後台不得出現本文案」禁令就地失效（見 `AC-N20`）。
 *
 * 📌 **為何只共用文字而不共用元件**：各頁之呈現樣式由各自的 prototype 決定（前台 `04` 為
 * `text-sm` 純文字、後台 `15`／`16` 為 badge、`13`／`19`／`24` 為列內小字），刻意不統一；
 * 唯一必須一致的是**文案本身**，故共用點落在字串常數而非元件。
 * 權威＝`docs/specs/features/F020-watermark.md#backend-burn-delta`。
 */
/**
 * 🔵 2026-09-23 全站文案稽核（使用者裁決）：「燒錄」是實作動詞（伺服器端把浮水印寫進 PDF
 * 內容層），使用者要知道的是**「我拿到的檔案上會有我的名字」**這個事實。
 * 📝 已作廢（⚠ 不得復原）：OLD> export const WM_BURN_TEXT = '檢視/下載將燒錄浮水印';
 * 🔒 「共用同一組逐字文案、六頁不得分歧」之約束不變——改的是字面，不是共用點。
 */
export const WM_BURN_TEXT = '檢視／下載會帶您的身分浮水印';
export const WM_UNSUPPORTED_TEXT = '此格式不支援浮水印';

/**
 * 依「該檔是否支援燒錄浮水印」取對應文案。
 * 旗標語意＝伺服器端「要不要呼叫 burnPdf」之同一個判定結果（§10.3）；
 * 呼叫端若僅有 `format` 字面，請以 `isWatermarkSupportedFormat()` 換算，不得各自另訂規則。
 */
export function watermarkNoteText(supported: boolean | undefined): string {
  return supported ? WM_BURN_TEXT : WM_UNSUPPORTED_TEXT;
}

/**
 * 由檔案格式字面判定是否支援燒錄（策略 A，`OQ-D18-02`）：僅 PDF 燒錄，其餘維持原檔。
 * ⚠ 僅供**後台清單類頁面**使用——該類端點之回應只有 `format` 欄、無伺服器端旗標；
 * 前台詳情頁仍一律採用伺服器端之 `watermarkSupported`，不得改用本函式重算（§10.3）。
 */
export function isWatermarkSupportedFormat(format: string | undefined | null): boolean {
  return (format ?? '').toLowerCase() === 'pdf';
}
