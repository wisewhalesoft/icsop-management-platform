/**
 * F042 OJT 進度管理 · TAB2 匯出之欄位定義（🔵 UX16 delta `AC-UX52`，項 16）。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md#ux16-delta `AC-UX52`；
 *       docs/specs/architecture-spec.md §16.8（`ARCH-UX8` ⑤）。
 *
 * 落點理由（比照既有 `documents/document-export-columns.ts`）：本檔為**零 IO 純函式**，
 * 只宣告「哪幾欄、逐字叫什麼、值怎麼從列取出」；BOM／CRLF／RFC 4180 逸出／CSV 注入前綴一律
 * 由共用之 `storage/csv-export.ts#toCsvBuffer` 施加，🔴 **本檔不得再寫第二份檔案層規則**。
 *
 * 🔒 **恰 11 欄、順序即 `AC-UX52` 之逐字順序**；🔴 **不含任何操作類欄位**（新增場次／下載／
 * 展開鈕）——那些是畫面上的按鈕，不是資料。
 */
import { CsvColumn } from '../storage/csv-export';
import { addMonthsClamped } from './add-months-clamped';
/**
 * 🔴 **`import type` 是刻意的**：`ojt-progress.service.ts` 反過來 import 本檔之
 * `buildOjtExportColumns()`。型別匯入於編譯期抹除 ⇒ 不產生 runtime 循環相依
 * （`.dependency-cruiser.cjs` 之 `tsPreCompilationDeps: false` 即為此意）。
 * ⚠ 改成值匯入（去掉 `type`）即成為真實循環，`no-circular` 閘門會失敗。
 */
import type { OjtProgressRow } from './ojt-progress.service';

/**
 * `完成狀態` 欄之逐字標籤（`AC-UX52` ②，與 TAB2 徽章逐字相同，`AC-03`）。
 * 🔴 **不得**輸出 `true`／`false`／`1`／`0`——布林落進 CSV 之後，開檔的人要自己猜哪一邊是完成。
 */
export const EXPORT_COMPLETED_TEXT = '已完成';
export const EXPORT_PENDING_TEXT = '尚未完成';

/** `備註` 欄之兩種註記（`AC-UX52` ③）與其相接符（**全形頓號**，前後無空白）。 */
export const EXPORT_NOTE_INACTIVE_TEXT = '已裁撤';
export const EXPORT_NOTE_ORPHANED_TEXT = '已移出使用部門';
export const EXPORT_NOTE_SEPARATOR = '、';

/**
 * `備註` 欄之組字（`AC-UX52` ③）。
 *
 * 🔴 **皆非時為空儲存格**，明文禁止改以 `0`／`—` 表示「無註記」——`—` 是**畫面**之空值佔位符
 * 而非資料（F017 `AC-B9` ③ 之既有通則）；落到 CSV 會被下游當成一個真實的值。
 *
 * 📝 「兩者兼具」之分支在實作端**真實可達**（`AC-37`～`AC-40` 之版次追蹤使一個孤兒列可以同時
 * 尚未完成），只是 prototype 之示範模型停在舊的「場次數 > 0」推導而構造不出來——故本分支由
 * 本純函式直接以向量覆蓋。
 */
export function ojtExportNoteValue(row: Pick<OjtProgressRow, 'inactive' | 'orphaned'>): string {
  const parts: string[] = [];
  if (row.inactive) parts.push(EXPORT_NOTE_INACTIVE_TEXT);
  if (row.orphaned) parts.push(EXPORT_NOTE_ORPHANED_TEXT);
  return parts.join(EXPORT_NOTE_SEPARATOR);
}

/**
 * `AC-UX52` 之 11 欄（由左至右逐字）：
 * `使用單位全名,單位代碼,程序書編號,程序書書名,文件版次,訓練版次,公告日期,應完成日,場次數,完成狀態,備註`
 *
 * 🔴 **`使用單位全名` 與 `單位代碼` 分為兩欄**：代碼是給人回查上游用的，併進全名欄之後就無法
 * 以欄為單位比對（`AC-UX52` ①）。
 * 🔴 **`應完成日` 取自既有之單一推導點 `addMonthsClamped(announcedDate, 1)`**（`AC-40`），
 * **不得**在此另立第二套加月規則——月底溢位之夾回行為只能有一份。
 * 🔒 無值（`announcedDate` 為 `null`）時兩個日期欄皆為**空儲存格**（`null` 由 `toCsvBuffer` 之
 * `cell()` 轉為空字串，不輸出字面 `null`）。
 */
export function buildOjtExportColumns(): CsvColumn<OjtProgressRow>[] {
  return [
    { header: '使用單位全名', value: (r) => r.orgName },
    { header: '單位代碼', value: (r) => r.orgCode },
    { header: '程序書編號', value: (r) => r.documentNumber },
    { header: '程序書書名', value: (r) => r.documentName },
    { header: '文件版次', value: (r) => r.documentEdition },
    { header: '訓練版次', value: (r) => r.trainingEdition },
    { header: '公告日期', value: (r) => r.announcedDate },
    { header: '應完成日', value: (r) => addMonthsClamped(r.announcedDate, 1) },
    { header: '場次數', value: (r) => r.sessionCount },
    { header: '完成狀態', value: (r) => (r.completed ? EXPORT_COMPLETED_TEXT : EXPORT_PENDING_TEXT) },
    { header: '備註', value: (r) => ojtExportNoteValue(r) },
  ];
}
