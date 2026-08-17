/**
 * 檔案下載之回應標頭組裝（`Content-Disposition` ＋ `Content-Type`）——**全站唯一實作**。
 *
 * 🔴 為何必須共用：本專案之附件／附錄／使用表單檔名皆為**使用者上傳之原始檔名**，實務上多為中文，
 * 而 Node 之 `res.setHeader` 只接受 ISO-8859-1——直接把中文內插進 `filename="…"` 會拋
 * `ERR_INVALID_CHAR`，**整個回應失敗**（既有各下載端點之檔名皆為伺服器自組之 ASCII，如
 * `lifecycle-${id}.pdf`，故從未踩到此點）。三個消費端各寫一份轉義幾乎必然只修其中一份。
 *
 * 輸出同時給兩種形式：
 *  - `filename="…"`：ASCII 化之相容值（非 ASCII 字元以 `_` 取代；引號與反斜線亦然，避免破壞標頭語法）。
 *  - `filename*=UTF-8''…`：RFC 5987 之百分比編碼，保留原始檔名。前端 `download-blob.ts` 之
 *    `filenameFromContentDisposition()` **優先讀取本項**，故使用者存下的檔名為原始中文檔名。
 */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * 白名單副檔名／格式 → 回應 `Content-Type`（`storage/file-rules.ts` 三組白名單之聯集：
 * 附件 ICSOP_PDF＝pdf、OJT_SIGNIN＝pdf/jpg/jpeg/png、使用表單與附錄＝pdf/xlsx/xls）。
 *
 * 🔴 **判定依據恆為伺服器端事實**（上傳時已通過白名單驗證之 `format` 欄或檔名副檔名，
 * architecture-spec §10.3），**絕不採客戶端宣告之 content-type**——後者等同讓上傳者
 * 宣告「我這份 PDF 不是 PDF」。
 *
 * 🔴 **為何併為一張表**：本表原有**三份逐字重複**的私有實作（`watermark.controller.ts` 之
 * `attachmentContentType`、`usage-forms.service.ts` 之 `usageFormContentType`、
 * `appendices.service.ts` 之 `contentTypeOf`），與 `attachmentDisposition` 當初被抽出來的
 * 理由完全相同：三份各改一份必然漂移。白名單擴充時只有一處要動。
 */
const DOWNLOAD_CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

/** 白名單外／無法判定 → `application/octet-stream`（瀏覽器一律當成下載，不嘗試內嵌渲染）。 */
export const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

/** 已驗證之 `format` 欄（使用表單、附錄）→ `Content-Type`。 */
export function contentTypeOfFormat(format: string): string {
  return DOWNLOAD_CONTENT_TYPES[format.toLowerCase()] ?? FALLBACK_CONTENT_TYPE;
}

/** 檔名副檔名（附件無 `format` 欄，以已驗證之檔名為事實）→ `Content-Type`。 */
export function contentTypeOfFileName(fileName: string): string {
  return contentTypeOfFormat(fileName.split('.').pop() ?? '');
}
