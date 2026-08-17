/**
 * 檔案下載之 `Content-Disposition` 組裝——**全站唯一實作**。
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
