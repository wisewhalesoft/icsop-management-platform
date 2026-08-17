import { BadRequestException } from '@nestjs/common';

/**
 * 匯出（CSV）之共用產生器——F037／F038／F039 三處匯出**共用同一組規則**。
 *
 * 權威：`docs/specs/error-handling.md#export`、`docs/specs/architecture-spec.md` §10.4。
 *
 * 落點理由：`storage/` 已是跨模組**檔案類純規則**之家（`storage/file-rules.ts` 由四個模組直接
 * import）。本模組為**零 Nest DI 之純函式**，由各 module 依路徑直接 import——NestJS 的模組相依圖
 * 只看 `@Module` metadata，不看 TS 檔案層的函式 import ⇒ 結構上不可能產生循環模組相依。
 */

/** 單一 CSV 欄之定義（表頭逐字，值由 row 取出）。 */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** 匯出筆數上限（超過即拒絕，不產生任何檔案、不回傳部分結果）。 */
export const EXPORT_ROW_LIMIT = 10_000;

/** RFC 4180 明訂之行終止符；Excel 於部分地區設定下對純 LF 解析不穩定。 */
const CRLF = '\r\n';

/** UTF-8 BOM。⚠ 缺失即為 Excel 開啟中文亂碼之經典成因。 */
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * 🔴 CSV 注入防護：值之**第一個字元**為下列任一時，前置一個半形單引號。
 * Excel／LibreOffice 會把 `=` 開頭之儲存格當公式執行（DDE 執行、`HYPERLINK` 資料外洩），
 * 而三處匯出之欄位含使用者可控字串（書名、附錄名稱、變更歷程之舊值／新值）⇒ 真實可達之注入面。
 */
const INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/** 筆數上限檢查。**必須在組 CSV 之前**單點執行（AC 明訂「不產生任何檔案」）。 */
export function assertExportRowLimit(count: number): void {
  if (count > EXPORT_ROW_LIMIT) {
    throw new BadRequestException(
      `EXPORT_ROW_LIMIT_EXCEEDED: 符合條件之筆數超過上限 ${EXPORT_ROW_LIMIT} 筆，請縮小查詢條件後再匯出`,
    );
  }
}

/**
 * 單一儲存格之最終字串：**先加注入前綴、再 RFC 4180 包覆逸出**（順序不可顛倒）。
 * `null`／`undefined` → 空儲存格（不得輸出字面 `null`／`undefined`）。
 */
function cell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const asText = String(raw);
  const guarded = INJECTION_PREFIXES.includes(asText.charAt(0)) ? `'${asText}` : asText;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * 產生 CSV 位元組（UTF-8 with BOM）。
 *
 * 🔴 BOM 以 **bytes** 前置而非字元前置：`'﻿' + body` 結果雖相同，但一旦有人把編碼改成
 * `latin1`、或改用 `res.send(string)` 讓 Express 自行決定編碼，BOM 就會悄悄壞掉而測試仍可能綠。
 * Controller 端須 `res.setHeader('Content-Type', 'text/csv; charset=utf-8')` 並 **`res.send(buffer)`**。
 *
 * 表頭列**不套用**注入前綴（表頭為規格逐字固定之字面值）。0 筆 → 僅含表頭列（非錯誤、非空檔）。
 */
export function toCsvBuffer<T>(rows: readonly T[], cols: readonly CsvColumn<T>[]): Buffer {
  const lines = [
    cols.map((c) => c.header).join(','),
    ...rows.map((r) => cols.map((c) => cell(c.value(r))).join(',')),
  ];
  // 含最末一列亦以 CRLF 結尾（RFC 4180）。
  return Buffer.concat([BOM, Buffer.from(lines.join(CRLF) + CRLF, 'utf8')]);
}

/**
 * 台北時間（UTC+8）之顯式位移——與 `backend/src/public/watermark.ts` 之
 * `formatWatermarkTimestamp()` **完全相同的手法**。
 *
 * 🔴 絕不可用 `toLocaleString('zh-TW')`／`toLocaleDateString` 或任何依賴行程本地時區的格式化：
 * 行程時區已釘死 UTC（`backend/Dockerfile` `ENV TZ=UTC`），該類寫法在容器內產生 UTC 時間、
 * 在開發機（UTC+8）產生 UTC+8 時間，**而兩邊的測試都會綠**（各自符合各自的本地時間）。
 * 這與本 repo 2026-08-14／15 的 MSSQL 時區 bug 是同一類錯誤。
 */
export function toTaipei(date: Date): Date {
  return new Date(date.getTime() + 8 * 3600 * 1000);
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 匯出檔名：`{scope}_{YYYYMMDD}_{HHmmss}.csv`，時間為 UTC+8。 */
export function exportFileName(scope: string, now: Date): string {
  const t = toTaipei(now);
  const ymd = `${t.getUTCFullYear()}${pad2(t.getUTCMonth() + 1)}${pad2(t.getUTCDate())}`;
  const hms = `${pad2(t.getUTCHours())}${pad2(t.getUTCMinutes())}${pad2(t.getUTCSeconds())}`;
  return `${scope}_${ymd}_${hms}.csv`;
}

/** 時間戳儲存格：`YYYY-MM-DD HH:mm:ss`（UTC+8，不附 `(UTC+8)` 字樣）。 */
export function formatExportTimestamp(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const t = toTaipei(d);
  return (
    `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())} ` +
    `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}:${pad2(t.getUTCSeconds())}`
  );
}
