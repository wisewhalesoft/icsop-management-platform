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
 */
import { toCsvBuffer, CsvColumn } from '../storage/csv-export';
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
