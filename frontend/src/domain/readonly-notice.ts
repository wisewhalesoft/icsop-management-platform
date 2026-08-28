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
 * 📝 **`RO_NOTICE_OJT_EXCEPTION` 已於 2026-08-28 隨 F042 `AC-J4`② 整條作廢**（任何角色皆不應
 * 再看到它）。原內容逐字保留於此供追溯：
 *
 * ```
 * '唯讀模式 · 此角色對 ICSOP 文件其餘 19 個欄位、ICSOP PDF、使用表單與附錄皆唯讀（FIELD_WRITE_FORBIDDEN）；' +
 * '唯一例外為「OJT 實體簽到表」，可上傳或覆蓋，該次上傳會寫入稽核。全部附件皆可下載（下載一律燒錄浮水印並寫入稽核）。'
 * ```
 *
 * 🔴 `RO_NOTICE_FULL` 逐字一字未改，但其**適用範圍**由「僅 SysAdmin」擴為
 * 「SysAdmin／Supervisor／DeptContact 三個唯讀角色皆適用」——唯讀提示自此**不再依角色分支**。
 */

/**
 * 欄位區之唯讀說明（`data-field-readonly-note`），三個唯讀角色皆同。
 * 🔴 F042 `AC-J8`／`AC-J9`：範圍由「19 個欄位」擴為**全部 20 欄**（OJT 併回），
 * 且本頁**無任何可寫項**——原句之「唯一可寫項為下方附件區之『OJT 實體簽到表』」已不成立。
 * 📝 原句逐字保留供追溯：
 * `'此區 19 個欄位對本角色一律唯讀（FIELD_WRITE_FORBIDDEN）；本頁唯一可寫項為下方附件區之「OJT 實體簽到表」。'`
 */
export const FIELD_RO_NOTE =
  '此區全部 20 個欄位對本角色一律唯讀（FIELD_WRITE_FORBIDDEN）；本頁無任何可寫項。';

/**
 * 附件區說明（自 F042 起唯一之一份——`ATTACH_NOTE_OJT` 隨 OJT 破例收回而作廢）。
 * 📝 原 `ATTACH_NOTE_OJT` 逐字保留供追溯：
 * `'下載/列印時伺服器端燒錄浮水印並寫入稽核。本角色僅「OJT 實體簽到表」一項可上傳/覆蓋，其餘各列皆為唯讀（見各列標記）。'`
 */
export const ATTACH_NOTE_RO =
  '下載/列印時伺服器端燒錄浮水印並寫入稽核；本角色無任何上傳/取代入口。';

/**
 * 該角色對「OJT 簽到表」是否可寫。
 *
 * 🔴 **判定之單一權威為 `FIELD_MATRIX`**，本函式僅是呼叫端之語意命名——**不得**在頁面內另寫一份
 * 角色白名單。
 * 🔴 F042 `AC-J7`／`AC-J8` 起本函式對**五種角色一律回 `false`**（含 ICSOPAdmin）：OJT 欄已改為
 * 純衍生唯讀、無人可寫。保留本函式而非直接刪除，是為了讓「文件表單是否還有 OJT 寫入路徑」
 * 這件事仍有單一可查詢點；一旦有人把矩陣改回可寫，畫面會同步恢復而非各處失聯。
 */
export function canWriteOjt(roleCode: string | undefined): boolean {
  return canWriteField(roleCode, FieldKey.OJT_SIGNIN) === 'WRITABLE';
}
