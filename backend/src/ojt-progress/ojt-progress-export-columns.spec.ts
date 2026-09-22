/**
 * F042 UX16 delta — `buildOjtExportColumns()`（`AC-UX52`，項 16）。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md#ux16-delta `AC-UX52`；
 * docs/specs/architecture-spec.md §16.8（`ARCH-UX8`⑤：新檔
 * `ojt-progress-export-columns.ts`，比照 `document-export-columns.ts` 之風格，共用
 * `csv-export.ts` 之 `toCsvBuffer`／`cell`）。
 *
 * ⚠ 對實作全盲：`./ojt-progress-export-columns` 尚不存在——import 失敗即本環之預期紅燈。
 *
 * 🔴 「應完成日」欄不在既有 `OjtProgressRow`（`ojt-progress.test-support.ts`）之欄位表內——
 * 依既有 F042 第五輪「應完成訓練日期＝公告日 +1 月之單一推導點」（`AC-37`～`AC-40`），本欄應
 * 由既有 `addMonthsClamped(announcedDate, 1)` 於欄位組裝時計算，**不得**另立第二個推導點。
 *
 * 🔴 **2026-09-22 lead 實機覆核追加（本環之血訓再現一次，`feedback-clean-fixtures-blind-to-
 * display-defects`）**：測試站實測匯出之同一列、同一檔案內，`公告日期` 欄逐字為
 * `2026-03-23T00:00:00.000Z`（原始 ISO 時間戳，未正規化），`應完成日` 欄逐字為 `2026-04-23`
 * （乾淨 `YYYY-MM-DD`）——同一份 CSV 兩個日期欄格式不一致，Excel 對前者不辨識為日期。
 * 本檔原有向量之 `row()` 預設值 `announcedDate: '2026-01-15'` 為**乾淨字串**，而正式環境經
 * DB→JSON 回來的是 **ISO 時間戳**（型別宣告 `string | null` 對兩者皆合法）⇒ 在乾淨語料下，
 * 「原樣透傳」與「正確格式化（`.slice(0,10)`）」輸出**逐字相同**，斷言因而恆綠、對此缺陷零
 * 鑑別力。下方 `AC-UX52 ④-b` describe 區塊以**真實 ISO 形狀**語料補向量，見該區塊之裁決與
 * 鑑別力設計。
 */
import { toCsvBuffer, CsvColumn, formatExportTimestamp } from '../storage/csv-export';
import { addMonthsClamped } from './add-months-clamped';
import { buildOjtExportColumns as buildOjtExportColumnsImpl } from './ojt-progress-export-columns';
import type { OjtProgressRow } from './ojt-progress.test-support';

/** 型別輔助（非行為變更）：`./ojt-progress-export-columns` 尚不存在，見同目錄其餘 UX16 spec 之同型註解。 */
function buildOjtExportColumns(): CsvColumn<OjtProgressRow>[] {
  return (buildOjtExportColumnsImpl as () => CsvColumn<OjtProgressRow>[])();
}

const row = (over: Partial<OjtProgressRow> = {}): OjtProgressRow => ({
  key: 'd1__JAC00',
  documentId: 'd1',
  documentNumber: 'ICSOP-SRC-101-1-01',
  documentName: '車輛分期進件作業',
  companyCode: 'AS',
  orgCode: 'JAC00',
  orgName: '和潤企業 / 營運管理部 / 審查室',
  inactive: false,
  orphaned: false,
  sessionCount: 1,
  currentEditionSessionCount: 1,
  completed: true,
  trainingEdition: "26'01",
  documentEdition: "26'01",
  announcedDate: '2026-01-15',
  ...over,
});

function linesOf(buf: Buffer): string[] {
  return buf.subarray(3).toString('utf8').replace(/\r?\n$/, '').split(/\r?\n/);
}

describe('buildOjtExportColumns — AC-UX52 欄位集合與順序（11 欄，逐字）', () => {
  it('表頭逐字為：使用單位全名,單位代碼,程序書編號,程序書書名,文件版次,訓練版次,公告日期,應完成日,場次數,完成狀態,備註', () => {
    const cols = buildOjtExportColumns();
    expect(cols.map((c) => c.header)).toEqual([
      '使用單位全名', '單位代碼', '程序書編號', '程序書書名', '文件版次', '訓練版次',
      '公告日期', '應完成日', '場次數', '完成狀態', '備註',
    ]);
  });

  it('恰 11 欄，不含任何操作類欄位（新增場次鈕／下載鈕／展開鈕等）', () => {
    const cols = buildOjtExportColumns();
    expect(cols).toHaveLength(11);
    expect(cols.map((c) => c.header)).not.toContain('操作');
  });

  it('① 使用單位全名＝orgName（四段格式），單位代碼＝orgCode（不併入全名欄）', () => {
    const cols = buildOjtExportColumns();
    const r = row({ orgName: '和潤企業 / 營運管理部 / 審查室', orgCode: 'JAC00' });
    const buf = toCsvBuffer([r], cols);
    const line = linesOf(buf)[1];
    expect(line).toContain('和潤企業 / 營運管理部 / 審查室');
    expect(line).toContain(',JAC00,');
  });

  it('② 完成狀態逐字為「已完成」／「尚未完成」——不得輸出 true/false/1/0', () => {
    const cols = buildOjtExportColumns();
    const completedCol = cols.find((c) => c.header === '完成狀態')!;
    expect(completedCol.value(row({ completed: true }))).toBe('已完成');
    expect(completedCol.value(row({ completed: false }))).toBe('尚未完成');
  });

  it('④ 應完成日＝addMonthsClamped(announcedDate, 1)（既有單一推導點，不另立第二套）', () => {
    const cols = buildOjtExportColumns();
    const dueCol = cols.find((c) => c.header === '應完成日')!;
    const r = row({ announcedDate: '2026-01-31' }); // 月底溢位夾回情境，證明真的呼叫了 addMonthsClamped
    expect(dueCol.value(r)).toBe(addMonthsClamped('2026-01-31', 1));
    expect(dueCol.value(r)).toBe('2026-02-28');
  });

  it('④ 公告日期／應完成日無值時為空儲存格（announcedDate 為 null）', () => {
    const cols = buildOjtExportColumns();
    const announceCol = cols.find((c) => c.header === '公告日期')!;
    const dueCol = cols.find((c) => c.header === '應完成日')!;
    const r = row({ announcedDate: null });
    expect(announceCol.value(r) ?? '').toBe('');
    expect(dueCol.value(r) ?? '').toBe('');
  });
});

/**
 * 🔴 **AC-UX52 ④-b（lead 2026-09-22 實機覆核裁決，非本檔原有向量）**：`公告日期`／`應完成日`
 * 兩欄皆為 `YYYY-MM-DD`（UTC+8），且**共用單一正規化推導點**——`公告日期` 直接取
 * `formatExportTimestamp(announcedDate).slice(0, 10)`（逐字比照 [F017](../documents/
 * documents.export.service.spec.ts) `AC-X8` 之既有等式、[F024](../audit/access-history)
 * `AC-F6` 同一函式），`應完成日` 取 `addMonthsClamped(` 上述**已正規化之值** `, 1)`——
 * **不得**各自對原始 `announcedDate` 獨立解析。
 *
 * 理由（裁決三點，逐字保留）：
 *   ① 與既有樣板一致：F017 `AC-X8` 明訂公告日期欄為 `YYYY-MM-DD`（UTC+8）、不附時分秒，本
 *      delta 之檔頭本就寫「比照 F017 匯出樣板」。
 *   ② 不只是格式問題、是正確性問題：`formatExportTimestamp()` 帶明確 +8 位移，原樣透傳沒有
 *      ⇒ 接近 UTC 午夜的時間戳會顯示錯一天。
 *   ③ 兩欄必須自同一個已正規化的值推導——若 `公告日期` 改套 +8 而 `應完成日` 仍吃原始 ISO，
 *      兩欄會在跨日邊界各說各話，比現在更糟（看起來是對的）。
 *
 * 🔴 語料鑑別力設計（不得只用 `T00:00:00.000Z`——加不加 +8 都同一天，對「是否套了 +8」零鑑別
 * 力）：向量 A 為 lead 實機量到之真實值（`2026-03-23T00:00:00.000Z`），驗證「完全未格式化」
 * 這個已發生的缺陷本身；向量 B 為**跨日邊界**（`2026-06-10T16:00:00.000Z`＝ UTC 16:00 之後即
 * 台北隔日 00:00，逐字沿用 F017 `AC-X8` 既有之同一組邊界值，全庫同型邊界一致，非另立新邊界），
 * 若 +8 位移未真的套用，`.slice(0,10)` 直接切 UTC 值會得 `2026-06-10`（差一天）。
 */
describe('buildOjtExportColumns — AC-UX52 ④-b：公告日期／應完成日皆為 YYYY-MM-DD（UTC+8），單一正規化推導點', () => {
  it('向量 A（lead 實機量到之真實缺陷值）：公告日期欄＝2026-03-23（不得逐字透傳原始 ISO 時間戳）', () => {
    const cols = buildOjtExportColumns();
    const announceCol = cols.find((c) => c.header === '公告日期')!;
    const r = row({ announcedDate: '2026-03-23T00:00:00.000Z' });
    expect(announceCol.value(r)).toBe('2026-03-23');
    // 🔴 正向半句之對照：只驗「不等於原始 ISO」對「印出別的錯誤格式」零鑑別力，故上一行已鎖定
    // 正確之逐字值；本行僅作為雙重保險，防止實作把時分秒黏在後面。
    expect(announceCol.value(r)).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
  });

  it('向量 B（跨日邊界，UTC 16:00 之後即台北隔日）：公告日期欄＝2026-06-11，非「對 ISO 字串直接 slice(0,10)」之 2026-06-10', () => {
    const cols = buildOjtExportColumns();
    const announceCol = cols.find((c) => c.header === '公告日期')!;
    const r = row({ announcedDate: '2026-06-10T16:00:00.000Z' });
    expect(announceCol.value(r)).toBe(formatExportTimestamp(r.announcedDate).slice(0, 10));
    expect(announceCol.value(r)).toBe('2026-06-11');
  });

  it('🔴 向量 B：應完成日欄自「已正規化之公告日期」推導，非自原始 ISO 各自解析——咬住「公告日期套 +8、應完成日沒套」之錯誤實作', () => {
    const cols = buildOjtExportColumns();
    const dueCol = cols.find((c) => c.header === '應完成日')!;
    const r = row({ announcedDate: '2026-06-10T16:00:00.000Z' });
    const normalizedAnnounced = formatExportTimestamp(r.announcedDate).slice(0, 10); // '2026-06-11'
    expect(dueCol.value(r)).toBe(addMonthsClamped(normalizedAnnounced, 1));
    expect(dueCol.value(r)).toBe('2026-07-11');
    // 🔴 有鑑別力之反例：若「應完成日」誤自未正規化之原始值（UTC 切片 '2026-06-10'）推導，
    // 會得 '2026-07-10'——與正確值恰差一天，非同義反覆。
    expect(dueCol.value(r)).not.toBe(addMonthsClamped('2026-06-10', 1));
    expect(addMonthsClamped('2026-06-10', 1)).toBe('2026-07-10'); // 自證：上一行的反例本身不是空話
  });
});

describe('buildOjtExportColumns — AC-UX52 ③ 備註欄（裁撤與孤兒之組字，含頓號相接）', () => {
  it('列 1：已裁撤 ∧ 尚未完成 ∧ 無公告日 → 備註逐字「已裁撤」，完成狀態「尚未完成」，公告日期/應完成日空儲存格', () => {
    const cols = buildOjtExportColumns();
    const remarkCol = cols.find((c) => c.header === '備註')!;
    const completedCol = cols.find((c) => c.header === '完成狀態')!;
    const r = row({ inactive: true, orphaned: false, completed: false, announcedDate: null });
    expect(remarkCol.value(r)).toBe('已裁撤');
    expect(completedCol.value(r)).toBe('尚未完成');
  });

  it('列 2：孤兒（已完成）→ 備註逐字「已移出使用部門」', () => {
    const cols = buildOjtExportColumns();
    const remarkCol = cols.find((c) => c.header === '備註')!;
    const r = row({ inactive: false, orphaned: true, completed: true });
    expect(remarkCol.value(r)).toBe('已移出使用部門');
  });

  it('🔴 兩者兼具（純函式向量覆蓋，非資料層真實共構）：備註以全形頓號相接「已裁撤、已移出使用部門」', () => {
    const cols = buildOjtExportColumns();
    const remarkCol = cols.find((c) => c.header === '備註')!;
    const r = row({ inactive: true, orphaned: true });
    expect(remarkCol.value(r)).toBe('已裁撤、已移出使用部門');
  });

  it('🔴 皆非時為空儲存格（不得改以 0 或 — 表示「無註記」）', () => {
    const cols = buildOjtExportColumns();
    const remarkCol = cols.find((c) => c.header === '備註')!;
    const r = row({ inactive: false, orphaned: false });
    expect(remarkCol.value(r) ?? '').toBe('');
    expect(remarkCol.value(r)).not.toBe('0');
    expect(remarkCol.value(r)).not.toBe('—');
  });
});
