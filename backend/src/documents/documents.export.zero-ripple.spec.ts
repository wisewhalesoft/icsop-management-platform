import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EXPORT_ROW_LIMIT,
  LINKED_DOC_NUMBER_SEPARATOR,
  exportFileName,
  formatExportTimestamp,
  joinLinkedDocumentNumbers,
  toTaipei,
} from '../storage/csv-export';

/**
 * F017 `AC-X16` —— 匯出 delta 之**零漣漪負向鎖定**（靜態原始碼掃描 ＋ 共用產生器行為回歸）。
 *
 * 權威：
 *  - `AC-X16` ⑦：🔴「**不得**為本頁分岔出第二份 CSV 產生器；全庫 grep **不得出現第二個 BOM 常數、
 *    第二份注入前綴表、第二個 `EXPORT_ROW_LIMIT` 字面值**」（沿用 F039 `AC-D10` 之既有負向鎖定）
 *  - `AC-X16` ⑨：🔒「**不新增任何錯誤碼**」——`EXPORT_IDS_INVALID` 為被撤回之候選碼，全庫不得出現
 *  - `architecture-spec.md` §13.4 (iv)：共用 `toCsvBuffer()`／`assertExportRowLimit()`／
 *    `exportFileName()`／`joinLinkedDocumentNumbers()`，**無第二份實作**
 *  - `architecture-spec.md` §13.1「被否決：丙案（前端純客端產 CSV）」之三條理由
 *
 * 📌 **基線已實測為綠**（2026-08-31 建環時）：`backend/src` 之上述四種樣式**目前僅存在於**
 *    `storage/csv-export.ts` 一處。⇒ 本檔為**綠燈回歸守衛**（green regression guard），
 *    它只在有人「分岔第二份產生器」或「新增錯誤碼」時轉紅，不構成本輪之預期紅燈。
 *
 * ⚠ **掃描範圍刻意限於 `backend/src`**：前端 `frontend/src/domain/export-feedback.ts` 之
 *    `EXPORT_ROW_LIMIT = 10000` 為**既有且經裁決之跨專案鏡像**（前後端為兩個獨立 TS 專案、
 *    無共用 package，見 `AC-X4` 之同型處置），非本條所指之「第二份實作」。
 *
 * 🔴 **本檔刻意不含之項目**：`backend/src/main.ts` 之 body-parser 設定（`AC-X12` 第三條陷阱、
 *    architecture §13.5 #1 #2）。`bootstrap()` 無單元測試、body-parser 完全不在單元測試路徑上，
 *    **任何在本輪環內為它撰寫之測試都只會給出「已驗」的錯覺**。已如實登錄於
 *    `docs/test-specs/risks-and-gaps.md` §F017-export。
 */

const BACKEND_SRC = path.resolve(__dirname, '..');
/** 共用產生器本體——四種樣式之**唯一**合法所在。 */
const GENERATOR_REL = path.join('storage', 'csv-export.ts');

interface SourceFile {
  rel: string;
  text: string;
}

function collectSources(dir: string, acc: SourceFile[] = []): SourceFile[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSources(full, acc);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.spec.ts')) continue; // 測試檔本就會寫出這些字面以做斷言
    const rel = path.relative(BACKEND_SRC, full);
    if (rel === GENERATOR_REL) continue;
    acc.push({ rel, text: fs.readFileSync(full, 'utf8') });
  }
  return acc;
}

const SOURCES = collectSources(BACKEND_SRC);
const hits = (re: RegExp): string[] => SOURCES.filter((f) => re.test(f.text)).map((f) => f.rel);

describe('F017 AC-X16 ⑦：全庫不得出現第二份 CSV 產生器（backend/src 靜態掃描）', () => {
  it('🔒 自證：掃描確實有涵蓋到檔案，且刻意排除了產生器本體', () => {
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES.map((f) => f.rel)).not.toContain(GENERATOR_REL);
    // 反向自證：產生器本體確實含有本檔所禁之四種樣式（否則下方斷言全為恆真）
    const generator = fs.readFileSync(path.join(BACKEND_SRC, GENERATOR_REL), 'utf8');
    expect(generator).toMatch(/0xef,\s*0xbb,\s*0xbf/i);
    expect(generator).toMatch(/\[\s*'='[\s\S]{0,80}'@'/);
    expect(generator).toMatch(/(?:const|let|var)\s+[A-Za-z_]*EXPORT_ROW_LIMIT[A-Za-z_]*\s*=/);
    expect(generator).toMatch(/\b10_000\b/);
  });

  it('🔴 不得出現第二個 UTF-8 BOM 常數（bytes 形式或字元形式）', () => {
    expect(hits(/0x\s*ef\s*,\s*0x\s*bb\s*,\s*0x\s*bf/i)).toEqual([]);
    expect(hits(/\\ufeff/i)).toEqual([]);
    expect(hits(new RegExp(String.fromCharCode(0xfeff)))).toEqual([]);
  });

  it('🔴 不得出現第二份 CSV 注入前綴表（`=`／`+`／`-`／`@` 之字串陣列）', () => {
    expect(hits(/\[\s*'='[\s\S]{0,80}'@'/)).toEqual([]);
    expect(hits(/\[\s*"="[\s\S]{0,80}"@"/)).toEqual([]);
  });

  it('🔴 不得出現第二個 `EXPORT_ROW_LIMIT` 之宣告／字面值', () => {
    expect(hits(/(?:const|let|var)\s+[A-Za-z_]*EXPORT_ROW_LIMIT[A-Za-z_]*\s*=/)).toEqual([]);
    expect(hits(/\b10_000\b/)).toEqual([]);
  });

  it('🔒 AC-X16 ⑨ 不新增任何錯誤碼——被撤回之 `EXPORT_IDS_INVALID` 不得出現於任何原始碼', () => {
    expect(hits(/EXPORT_IDS_INVALID/)).toEqual([]);
  });
});

describe('F017 AC-X16 ⑦：`csv-export.ts` 之既有函式行為一字未改（F018／F039／F024／F037／F038 共用）', () => {
  it('`EXPORT_ROW_LIMIT` 仍為 10,000；`LINKED_DOC_NUMBER_SEPARATOR` 仍為半形分號', () => {
    expect(EXPORT_ROW_LIMIT).toBe(10_000);
    expect(LINKED_DOC_NUMBER_SEPARATOR).toBe(';');
  });

  it('`joinLinkedDocumentNumbers()` 之空值與分隔行為不變（0 筆 → 空字串）', () => {
    expect(joinLinkedDocumentNumbers(undefined)).toBe('');
    expect(joinLinkedDocumentNumbers([])).toBe('');
    expect(joinLinkedDocumentNumbers([{ documentNumber: 'A' }, { documentNumber: 'B' }])).toBe('A;B');
  });

  it('`toTaipei()` 仍為顯式 +8 小時位移（不依賴行程時區）', () => {
    const utc = new Date('2026-06-10T00:00:00.000Z');
    expect(toTaipei(utc).getTime() - utc.getTime()).toBe(8 * 3600 * 1000);
  });

  it('`formatExportTimestamp()` 仍為 `YYYY-MM-DD HH:mm:ss`（UTC+8），空值 → 空字串', () => {
    expect(formatExportTimestamp('2026-06-10T16:00:00.000Z')).toBe('2026-06-11 00:00:00');
    expect(formatExportTimestamp(null)).toBe('');
  });

  /**
   * 🔵 **lead 2026-08-31 裁決（`X-CONFLICT-2` 之第三條路）**：`AC-X8`／`AC-X16` ⑦（spec，放寬後）
   * 與 architecture §13.3 (iii)／§13.6（依放寬**前**字面否決）互相引用對方之舊版而僵持。
   * 裁定＝**兩案都不採**：實作直接用 `formatExportTimestamp(announcedDate).slice(0, 10)`，
   * **不新增 `formatExportDate()`**，`csv-export.ts` **維持一行未改** ⇒ `AC-X16` ⑦ 回到未放寬之嚴格字面，
   * 且不產生第二份 `toTaipei()` 位移（那正是當初放寬所要防的東西）。
   * 📌 值層之行為約束不受本條影響——`documents.export.service.spec.ts` 之 `AC-X8` describe
   * 已以「儲存格 ≡ `formatExportTimestamp(x).slice(0,10)`」＋ UTC 16:30 差一天判別案完整涵蓋。
   */
  it('🔵 AC-X16 ⑦（lead 裁決）`csv-export.ts` 不得新增 `formatExportDate()`——公告日期欄改用既有 `formatExportTimestamp(...).slice(0,10)`', () => {
    const generator = fs.readFileSync(path.join(BACKEND_SRC, GENERATOR_REL), 'utf8');
    expect(generator).not.toMatch(/export\s+function\s+formatExportDate\b/);
    // 🔒 亦不得改落於他處（否則就是第二份 `toTaipei()` 位移，等同分岔出第二份產生器）。
    expect(hits(/function\s+formatExportDate\b/)).toEqual([]);
  });

  it('🔒 AC-X16 ⑥ 既有各處匯出之檔名 scope 不變，且 F017 之 `documents` 與其並列不重複', () => {
    const now = new Date('2026-06-10T00:00:00.000Z');
    expect(exportFileName('appendices', now)).toMatch(/^appendices_\d{8}_\d{6}\.csv$/);
    expect(exportFileName('usage-forms', now)).toMatch(/^usage-forms_\d{8}_\d{6}\.csv$/);
    expect(exportFileName('documents', now)).toMatch(/^documents_\d{8}_\d{6}\.csv$/);
    expect(new Set(['appendices', 'usage-forms', 'documents']).size).toBe(3);
  });
});
