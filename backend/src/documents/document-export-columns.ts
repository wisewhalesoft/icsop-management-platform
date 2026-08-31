import { CsvColumn, formatExportTimestamp, joinLinkedDocumentNumbers } from '../storage/csv-export';
import { DocumentListItem } from './documents.store';
import { DISPLAY_LABEL, deriveDisplayStatus } from './display-status';
import { OJT_STATUS_LABEL } from './ojt-completion.reader';
import { orderLinksForExport } from './export-link-order';

/**
 * F017 §清單匯出（CSV）delta —— **十四欄之逐欄值層**（`AC-X1` ②／`AC-X3`／`AC-X4`～`AC-X8`）。
 *
 * 欄集合＝畫面 15 欄**去掉「樹狀圖」**（該欄為導覽圖示、無資料值可落地；🔒 該欄仍留在畫面上）。
 * 🔴 **十四欄全部由後端解析**（架構 §13.3）——不得由前端把畫面上算好的字串塞進請求，那會使匯出
 * 與清單成為兩條各自可漂移的路徑。
 *
 * 🔒 **產生器唯一**：BOM／CRLF／RFC 4180／注入前綴一律由 `storage/csv-export.ts` 之 `toCsvBuffer()`
 * 與 `cell()` 負責，本檔只提供「表頭字面 ＋ 取值」。本檔**不得**出現第二份逸出／前綴／上限邏輯。
 *
 * 🔴 **`toTaipei()` 只用於格式化，一律不用於比較**（`AC-X7`／`AC-X8` 之時區鐵則）：
 *  · `公告日期` 欄走 `formatExportTimestamp()`（其內部即為顯式 +8 位移）；
 *  · `狀態` 欄之「今日」恆為 `new Date()`（絕對瞬間），**禁止**對其套 `toTaipei()`——誤套會在
 *    台北時間 00:00–08:00 之窗口讓 CSV 說「已公告」而畫面說「進度中」，而固定時鐘之測試
 *    只要把 now 釘在台北 08:00 之後，兩種寫法結果相同、完全測不到。
 */

/**
 * `AC-X5` `當責室長` 欄之分隔符：**全形頓號**（前後無空白）。
 *
 * 🔴 明文禁用半形逗號：逗號會觸發 RFC 4180 之引號包覆逸出，使該格在原始 CSV 文字中被雙引號包住，
 * 欄內逗號與欄間逗號在肉眼上無從分辨——而本欄的用途正是讓人一眼看出這份文件由哪幾位室長當責。
 * 🔒 與第 12 欄之半形分號（`LINKED_DOC_NUMBER_SEPARATOR`）**刻意不同、不得統一**：本欄之畫面既有
 * 載體即以 `、` 相接（次要室長之 title），第 12 欄用分號則是為了與**編號**之字面不混淆。
 */
const CHIEF_NAME_SEPARATOR = '、';

/**
 * `AC-X5`：主要 ∪ 次要之姓名，主要在前、次要依既有陣列順序在後，**去重**。
 * 主要姓名解析失敗時以**員編**代入（與畫面 `primaryChiefName ?? primaryChiefId` 之 fallback 相同）；
 * 兩者皆無 → 空儲存格。
 *
 * 📌 本欄之匯出值恆為畫面之**嚴格超集**（畫面因欄寬收合為 `王小明 +2`，次要姓名只在 tooltip）——
 * CSV 為存查用途，必須把 tooltip 的內容展開（`AC-X1` ⑤ (b)）。
 */
export function exportChiefValue(item: DocumentListItem): string {
  const names = [item.primaryChiefName ?? item.primaryChiefId, ...(item.secondaryChiefNames ?? [])];
  const present = names.filter((n): n is string => typeof n === 'string' && n !== '');
  return [...new Set(present)].join(CHIEF_NAME_SEPARATOR);
}

/**
 * `AC-X6`：連結點目標之 `documentNumber`，以半形分號相接（共用 `joinLinkedDocumentNumbers()`）。
 * 順序＝`orderLinksForExport()`（命中者排第一顆）；N=0 → 空儲存格（**非** `—`、**非** `0`）。
 * 🔴 目標查無編號者（目標已刪除）**跳過**，不得輸出空字串而產生 `;;` 或前／後綴分號。
 * 🔒 不輸出書名、不輸出 `targetHasPdf`——畫面該格之可見文字本即只有編號。
 */
export function exportLinkValue(item: DocumentListItem, linkTargetId?: string): string {
  const numbers = orderLinksForExport(item.links, linkTargetId)
    .map((l) => l.targetNumber)
    .filter((n): n is string => typeof n === 'string' && n !== '')
    .map((documentNumber) => ({ documentNumber }));
  return joinLinkedDocumentNumbers(numbers);
}

/**
 * 十四欄之逐字表頭與取值（欄序即 CSV 欄序）。
 *
 * @param linkTargetId 第 12 欄之欄內排序命中值（選填；`AC-X6`）。**僅供排序，不參與任何篩選判定。**
 * @param now `狀態` 欄之「今日」基準（＝匯出當下之 `new Date()`；🔴 不得套 `toTaipei()`）。
 */
export function buildDocumentExportColumns(
  linkTargetId: string | undefined,
  now: Date,
): CsvColumn<DocumentListItem>[] {
  return [
    // 1 OJT：`AC-X4` 三值中文標籤；缺鍵（undefined）視同 `none` → `尚未開始`（**非**空儲存格）。
    { header: 'OJT', value: (r) => OJT_STATUS_LABEL[r.ojtStatus ?? 'none'] },
    { header: '制定公司', value: (r) => r.draftingCompanyName },
    { header: '制定部門', value: (r) => r.draftingDeptName },
    // 4 制定室別：畫面之 `—` 是空值佔位符、不是資料 → null 一律輸出空儲存格（`AC-X2` ②）。
    { header: '制定室別', value: (r) => r.draftingSectionName },
    { header: '當責室長', value: (r) => exportChiefValue(r) },
    // 6 狀態：`AC-X7` 衍生顯示標籤（非儲存值 active／inactive／void），共用全站唯一判定點。
    {
      header: '狀態',
      value: (r) => DISPLAY_LABEL[deriveDisplayStatus(r.status, r.announcedDate, now)],
    },
    // 7 檔案：該文件自身之 ICSOP PDF **檔名**（畫面該格只有一顆圖示鈕，其 title 即 `下載 {fileName}`）。
    { header: '檔案', value: (r) => r.icsopPdfFileName },
    // 8/9：必填恆非空；🔒 不落地「尚未指派節點」警示圖示與「編輯」鉛筆鈕（它們是元件，不是值）。
    { header: '程序書編號', value: (r) => r.documentNumber },
    { header: '程序書書名', value: (r) => r.documentName },
    { header: '版次', value: (r) => r.edition },
    // 11 內容摘要：**全文不截斷**（畫面之 truncate 為 CSS 視覺截斷，其 DOM 文字與 title 本即全文）。
    { header: '內容摘要', value: (r) => r.contentSummary },
    { header: '連結點程序書', value: (r) => exportLinkValue(r, linkTargetId) },
    // 13 公告日期：`AC-X8` `YYYY-MM-DD`（UTC+8），**不附時分秒**。
    // 🔴 取既有 `formatExportTimestamp()` 之前 10 碼（同檔同位移），**不新增第二個 `toTaipei()` 位移**；
    //    亦不得對 ISO 字串直接 slice——UTC 16:00 之後會差一天，而開發機與容器兩邊測試都會綠。
    { header: '公告日期', value: (r) => formatExportTimestamp(r.announcedDate).slice(0, 10) },
    // 14 循環別：含子分類之顯示名（＝後端 `lifecycleDisplayName()` 之輸出，與畫面同一份字）。
    { header: '循環別', value: (r) => r.lifecycleName },
  ];
}
