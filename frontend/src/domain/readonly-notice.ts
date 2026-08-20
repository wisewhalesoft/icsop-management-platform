import { canWriteField, FieldKey } from './field-matrix';

/**
 * 後台文件唯讀頁／編輯頁之唯讀提示逐字常數（F016 `AC-N74`；`prototypes/16-document-readonly.html` 為權威）。
 *
 * 🔴 **兩頁共用同一份，不得各自重打**（F026 `AC-N76` ③）——`16` 與 `15` 若各自維護一份，
 * 下一次改文案時必然只改一頁，畫面便會出現「同一 delta 下兩頁互相矛盾」的既有病灶。
 *
 * 🔒 `RO_NOTICE_FULL` 為 2026-08-20 D9 delta **一字未改**之原句：它對 `SysAdmin` **仍然為真**
 * （`AC-N26`：其對 OJT 亦唯讀）⇒ 本常數同時是 `AC-N26` 在畫面上之載體。
 */

/** 僅 `SysAdmin`：全欄位唯讀、無任何寫入項。 */
export const RO_NOTICE_FULL =
  '唯讀模式 · 此角色對 ICSOP 文件全欄位皆唯讀；附件可下載（燒錄浮水印），但不可上傳/取代（FIELD_WRITE_FORBIDDEN）。';

/**
 * `Supervisor`／`DeptContact`：19 欄位＋另兩類附件＋附錄皆唯讀，唯一例外為 OJT 簽到表。
 * 📌 刻意**明講「19 個欄位」與「另兩類附件＋附錄」**（而非只寫「除了 OJT 以外」）——
 *    後者容易被讀成「附件區都放行了」，那正是 `AC-N24`／`AC-N25` 要防的誤解。
 */
export const RO_NOTICE_OJT_EXCEPTION =
  '唯讀模式 · 此角色對 ICSOP 文件其餘 19 個欄位、ICSOP PDF、使用表單與附錄皆唯讀（FIELD_WRITE_FORBIDDEN）；' +
  '唯一例外為「OJT 實體簽到表」，可上傳或覆蓋，該次上傳會寫入稽核。全部附件皆可下載（下載一律燒錄浮水印並寫入稽核）。';

/** 欄位區之唯讀說明（`data-field-readonly-note`），三角色皆同。 */
export const FIELD_RO_NOTE =
  '此區 19 個欄位對本角色一律唯讀（FIELD_WRITE_FORBIDDEN）；本頁唯一可寫項為下方附件區之「OJT 實體簽到表」。';

/** 附件區說明：本角色對 OJT 亦唯讀時。 */
export const ATTACH_NOTE_RO =
  '下載/列印時伺服器端燒錄浮水印並寫入稽核；本角色無任何上傳/取代入口。';

/** 附件區說明：本角色對 OJT 可寫時。 */
export const ATTACH_NOTE_OJT =
  '下載/列印時伺服器端燒錄浮水印並寫入稽核。本角色僅「OJT 實體簽到表」一項可上傳/覆蓋，其餘各列皆為唯讀（見各列標記）。';

/**
 * 該角色對「OJT 簽到表」是否可寫（F026 `AC-N23`／`AC-N26`／`AC-N27`）。
 *
 * 🔴 **判定之單一權威為 `FIELD_MATRIX`**，本函式僅是呼叫端之語意命名——**不得**在頁面內另寫一份
 * 角色白名單，更不得改用「非 ICSOPAdmin 之後台角色一律放行」之寫法：`SysAdmin` 與 `User`
 * 已由 `OQ-D9-24`／`AC-N27` 明文排除，自建白名單正是「開一個洞、鬆一片牆」之典型形狀。
 */
export function canWriteOjt(roleCode: string | undefined): boolean {
  return canWriteField(roleCode, FieldKey.OJT_SIGNIN) === 'WRITABLE';
}
