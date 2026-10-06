import { BadRequestException } from '@nestjs/common';
import { extensionOf } from './file-rules';

/**
 * 🔵 2026-10-06 後台唯讀頁附件「檢視」（F016 `AC-AV1`～`AC-AV6`）：可線上檢視之格式＝**僅 PDF**。
 *
 * 🔒 判定依據恆為伺服器端事實（上傳時已驗證之檔名副檔名或 `format` 欄），**不採**客戶端宣告之
 * content-type（architecture-spec §10.3）。白名單外 ⇒ 400 `FILE_FORMAT_NOT_ALLOWED`，且**先於**
 * 讀取位元組、燒錄與寫稽核（拒絕路徑不留稽核）。
 * 📌 OJT 簽到表之檢視白名單另含 jpg/jpeg/png（F042 `AC-OV1` ④）；本處三類附件之上傳白名單中
 * 唯一可於瀏覽器內嵌呈現者即 PDF（xlsx/xls 只能下載），故兩者不共用同一份清單。
 */
export const VIEWABLE_ATTACHMENT_FORMATS: readonly string[] = ['pdf'];

/** `fileNameOrFormat` 可為檔名（取副檔名）或已驗證之 `format` 值（如 `pdf`）。 */
export function assertViewableFormat(fileNameOrFormat: string): void {
  const v = fileNameOrFormat.includes('.') ? extensionOf(fileNameOrFormat) : fileNameOrFormat.toLowerCase();
  if (!VIEWABLE_ATTACHMENT_FORMATS.includes(v)) {
    throw new BadRequestException('FILE_FORMAT_NOT_ALLOWED');
  }
}
