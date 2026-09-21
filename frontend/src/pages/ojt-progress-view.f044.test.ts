import { describe, it, expect } from 'vitest';
import type { OjtProgressRow } from '../api/types';
import {
  // ── 既有符號（🔒 AC-G80：一行未改，本檔僅作回歸旁證）──
  EDITION_NONE_TEXT,
  NO_STATISTICS_TEXT,
  canViewDashboard,
  coveragePercent,
  exclusionNote,
  groupRowsByOrg,
  trainingDueDate,
  type OjtRowGroup,
  // ── 本輪新增之純函式（建環當下尚不存在 ⇒ 模組連結失敗即預期紅燈）──
  addMonthsClamped,
  excludedUnitCount,
  ojtOnTimeNote,
  readSortParam,
  readTabParam,
  sortGroupsIncompleteFirst,
} from './ojt-progress-view';

/**
 * F044 — `frontend/src/pages/ojt-progress-view.ts` 之**新增純函式**建環。
 *
 * 涵蓋：`AC-G8`（`addMonthsClamped` 孿生向量表 ＋ `trainingDueDate` 改為委派）、
 * `AC-G89`（`ojtOnTimeNote`：🔴 **不共用** `exclusionNote()`）、
 * `AC-G20`／`AC-G93`／§癸 (h)（`sortGroupsIncompleteFirst` 之分段與段內次序）、
 * `AC-G88`（`readTabParam`／`readSortParam` 兩參數**各自獨立解析**）、
 * `AC-G80`（🔒 既有四個符號一行未改之回歸旁證）。
 *
 * 🔴 **檔案落點之刻意偏離，逐字記錄**：`AC-G8` 執行要求 1 原文指名向量表落在
 *    `frontend/src/pages/ojt-progress-view.test.ts` **之新增 describe**。本輪改置於同目錄之
 *    姊妹檔（本檔），理由＝在那份既有的 F042 綠燈測試裡 import 一個尚不存在的符號，會使
 *    **整份既有檔案**於建環當下翻紅，違反 `AC-G21`／§庚「既有測試全數維持綠燈」。
 *    🔒 `AC-G8` 之實質要求（向量陣列逐字相同、兩側檔頭互指）逐項滿足，見下。
 *
 * 🔴 **孿生檔（向量陣列逐字相同，兩側須同步維護）**：
 *    `backend/src/ojt-progress/add-months-clamped.spec.ts`。
 *
 * 🔒 **契約**（`architecture-spec` §15.2／§15.6／§15.8）：
 * ```
 * export function addMonthsClamped(isoDate: string, delta: number): string | null;
 * export function ojtOnTimeNote(stats: {
 *   numerator: number; denominator: number; rate?: number;
 *   excludedInactive: number; excludedOrphaned: number; excludedNoAnnouncedDate: number;
 * }): string;
 * export function sortGroupsIncompleteFirst(groups: OjtRowGroup[]): OjtRowGroup[];
 * export function readTabParam(q: URLSearchParams): 'dashboard' | 'sessions' | null;
 * export function readSortParam(q: URLSearchParams): 'incomplete-first' | null;
 * ```
 */

// ══════════════════════ AC-G8 · addMonthsClamped 孿生向量表 ══════════════════════

/**
 * 🔒 `AC-G8` 之 8 列固定向量表（architecture-spec §15.2 逐列確認並鎖定）。
 * 🔴 本陣列與孿生檔之同名陣列**逐字相同**，任何一側調整必須同步另一側。
 */
const VECTORS: readonly { no: string; input: string; delta: number; expected: string; guards: string }[] = [
  { no: '①', input: '2026-01-15', delta: +1, expected: '2026-02-15', guards: '一般情形' },
  { no: '②', input: '2026-01-31', delta: +1, expected: '2026-02-28', guards: '月底溢位未夾回（天真 setMonth 得 2026-03-03）' },
  { no: '③', input: '2024-01-31', delta: +1, expected: '2024-02-29', guards: '閏年之夾回點' },
  { no: '④', input: '2026-12-31', delta: +1, expected: '2027-01-31', guards: '跨年' },
  { no: '⑤', input: '2026-03-31', delta: -1, expected: '2026-02-28', guards: '反向之月底夾回' },
  { no: '⑥', input: '2024-03-31', delta: -1, expected: '2024-02-29', guards: '反向＋閏年' },
  { no: '⑦', input: '2026-01-01', delta: -1, expected: '2025-12-01', guards: '反向跨年' },
  { no: '⑧', input: '2026-05-31', delta: -1, expected: '2026-04-30', guards: '反向 31→30' },
];

describe('addMonthsClamped（AC-G8 · 孿生向量表）', () => {
  it('向量表恰 8 列（與孿生檔逐字相同）——自我守護：表被刪空則 it.each 零案例恆綠', () => {
    expect(VECTORS).toHaveLength(8);
  });

  it.each(VECTORS)(
    '$no addMonthsClamped($input, $delta) === $expected — 防：$guards',
    ({ input, delta, expected }) => {
      expect(addMonthsClamped(input, delta)).toBe(expected);
    },
  );

  /**
   * 🔴 `AC-G8` 執行要求 2：**前端側即使本功能不呼叫 `delta = −1`**（窗口計算全在後端），
   * 仍須以 ⑤～⑧ 鎖住——否則兩份實作只有一半被比對，**反向夾回可以在後端漂移而前端全綠**。
   */
  it('⑤～⑧（delta = −1）於前端側同樣被鎖住，即使本功能不呼叫它', () => {
    const backward = VECTORS.filter((v) => v.delta === -1);
    expect(backward).toHaveLength(4);
    for (const v of backward) expect(addMonthsClamped(v.input, v.delta)).toBe(v.expected);
  });

  it('不可解析之輸入 → null（不得拋例外、不得回 "Invalid Date"）', () => {
    expect(addMonthsClamped('', +1)).toBeNull();
    expect(addMonthsClamped('not-a-date', +1)).toBeNull();
  });
});

describe('🔒 AC-G8／AC-G80 — `trainingDueDate` 改為委派，對外行為一字不改', () => {
  it('trainingDueDate(d) === addMonthsClamped(d, +1)（逐列，含月底夾回）', () => {
    for (const v of VECTORS.filter((x) => x.delta === +1)) {
      expect(trainingDueDate(v.input)).toBe(addMonthsClamped(v.input, +1));
      expect(trainingDueDate(v.input)).toBe(v.expected);
    }
  });

  it('🔒 既有行為：無公告日期 → null（委派後仍然如此）', () => {
    expect(trainingDueDate(null)).toBeNull();
    expect(trainingDueDate(undefined)).toBeNull();
    expect(trainingDueDate('')).toBeNull();
  });
});

// ══════════════════════ AC-G89 · ojtOnTimeNote ══════════════════════

type OnTimeStats = Parameters<typeof ojtOnTimeNote>[0];

const stats = (over: Partial<OnTimeStats> = {}): OnTimeStats => ({
  numerator: 3,
  denominator: 4,
  rate: 75,
  excludedInactive: 0,
  excludedOrphaned: 0,
  excludedNoAnnouncedDate: 0,
  ...over,
});

/**
 * 🔴 **2026-09-21 就地改寫（`AC-G89` 已由 lead 於規格內就地改寫，本 describe 隨之重寫）**
 *
 * **改寫之成因（逐字記於規格）**：第六輪「實作理由退出畫面」把卡④ 的說明文字搬進 ⓘ，
 * `AC-G15`／`AC-G29`／`AC-G38`／`AC-G40`／`AC-G57`／`AC-G68` 六條都加了指標，**唯獨 `AC-G89` 漏了**
 * ⇒ 它仍要求一支帶「覆蓋率頭句＋百分比＋`NO_STATISTICS_TEXT`」的函式，而那些內容在新版面上已經不存在。
 * 🔒 **裁定＝(b)**：`ojtOnTimeNote` **即為 ⓘ 之產生者**（廢止本條會留下一支沒有消費者的死函式）。
 *
 * 🔒 **本 describe 之逐字權威＝[F044 §癸四 第 1 列](../../../docs/specs/features/F044-admin-dashboard-analytics.md)
 *    之【ⓘ popover】四段**（規格明文禁止在 `AC-G89` 內再抄一份 ⇒ 下方常數即為環內唯一之複本）。
 *
 * 🔴 **`NO_STATISTICS_TEXT` 於 F044 自此無消費者**：分母為 0 之空狀態走 `AC-G14` 之
 *    `近 1 個月內無應完成之 OJT 單位`（卡面），**不再由本函式產出**。
 *    ⚠ 它在 [F042](F042-ojt-progress-management.md) 仍有消費者，一行未改（`AC-G80`）。
 *    📌 **且它本身就違反 `AC-G94`**——其字面 `尚無可統計之進度列` 含禁用之內部欄位語言 `進度列`，
 *    而本函式之輸出現在恆在 ⓘ 內、必然進入 `AC-G94` 之掃描面 ⇒ 兩條 AC 在舊形狀下**不可能同時綠**。
 *    🔒 下方向量 ① 之 `not.toContain(NO_STATISTICS_TEXT)` 即為「不得回頭塞回去」之負向鎖。
 */

/** 🔒 §癸四 第 1 列【ⓘ popover】第 1 段（無條件）。 */
const P1_SCOPE = '這張卡只看最近一個月內應完成訓練的單位；應完成日為文件公告日再加一個月。';
/** 🔒 第 2 段（前兩項＝**單位**）。 */
const p2Units = (a: number, b: number) =>
  `其中 ${a} 個單位已裁撤、${b} 個單位已不再使用該文件，不列入計算。`;
/** 🔒 第 3 段（第三項＝**文件**）。🔴 規格逐字：**獨立成句，不得串入上一句的加總**。 */
const p3Docs = (c: number) =>
  `另有 ${c} 份文件尚未設定公告日期，無法推算應完成日，因此從一開始就不在這張卡的範圍內。`;
/** 🔒 第 4 段（無條件）。 */
const P4_CROSSREF = '「OJT 進度管理」頁不限期限，也會列出這裡不計入的單位，因此兩邊的數字不同。';

/** 🔴 空白不敏感比對：函式可用 `\n` 分段、元件可用 `<p>` 分段，兩者不應造成假紅。 */
const norm = (s: string) => s.replace(/\s+/g, '');

describe('ojtOnTimeNote — AC-G89 之四列固定向量（🔴 不共用 exclusionNote）', () => {
  /**
   * ① 分母為 0。
   * 🔒 卡面走 `AC-G14` 之空狀態；ⓘ **仍在**（§癸四 第 1 列逐字：「`a+b` ＝ 0 時無可見排除文字，**ⓘ 仍在**」）。
   */
  it('① denominator === 0 ⇒ ⓘ 仍在（第 1／4 段恆在），且不得出現 NO_STATISTICS_TEXT／0%／100%／NaN', () => {
    const note = ojtOnTimeNote(stats({ numerator: 0, denominator: 0, rate: undefined }));
    expect(norm(note)).toContain(norm(P1_SCOPE));
    expect(norm(note)).toContain(norm(P4_CROSSREF));
    // 🔴 `AC-G14` 明文禁止
    expect(note).not.toMatch(/\b0%|\b100%|NaN/);
    // 🔴 就地改寫之負向鎖：舊形狀不得回流（其字面含 `AC-G94` 禁用之 `進度列`）
    expect(note).not.toContain(NO_STATISTICS_TEXT);
    expect(note).not.toContain('進度列');
  });

  it('② 三種排除皆為 0 ⇒ 第 1／4 段仍在，且輸出隨資料而變（非常數字串）', () => {
    const zero = ojtOnTimeNote(stats());
    expect(norm(zero)).toContain(norm(P1_SCOPE));
    expect(norm(zero)).toContain(norm(P4_CROSSREF));
    /**
     * 🔴 **鑑別力**：若實作把四段寫成一個與 `stats` 無關的常數字串，第 1／4 段之斷言仍會全綠。
     *    ⇒ 以「同一支函式在兩組不同輸入下輸出必不相同」證明它真的讀了 `stats`。
     */
    const nonZero = ojtOnTimeNote(
      stats({ excludedInactive: 2, excludedOrphaned: 5, excludedNoAnnouncedDate: 7 }),
    );
    expect(nonZero).not.toBe(zero);
  });

  it('③ 三種排除皆 > 0 ⇒ 第 2／3 段逐字，且 🔴 第 3 段獨立成句（不得串入第 2 段之加總）', () => {
    const note = ojtOnTimeNote(
      stats({ excludedInactive: 2, excludedOrphaned: 5, excludedNoAnnouncedDate: 7 }),
    );
    expect(norm(note)).toContain(norm(p2Units(2, 5)));
    expect(norm(note)).toContain(norm(p3Docs(7)));
    /**
     * 🔴 §癸四 第 1 列逐字：「**獨立成句（不得串入上一句的加總）**」。
     * `OLD>` 之違規形狀＝把三項串成一句，把**文件**混進**單位**的列舉裡。
     * 🔒 沒有這一條，「串成一句」與「獨立成句」在 `toContain` 之下**都會綠**（第 2 段只是前綴變長）。
     */
    expect(norm(note)).not.toContain(
      norm('其中 2 個單位已裁撤、5 個單位已不再使用該文件、7 份文件尚未設定公告日期，不列入計算。'),
    );
  });

  /**
   * ④ 🔴 **第三個原因之唯一鑑別力來源**（`AC-G89` 逐字，且與 §癸四 第 1 列之「語料要求」同一個向量）：
   *    若語料中 `excludedNoAnnouncedDate` 恆為 0，「多一個原因」這件事恆真。
   *    🔒 同一組數字下之【可見】側（`已排除 {a+b}` 應為空）由 `excludedUnitCount` 與
   *       `DashboardHome.f044.rationale.test.tsx` 之元件層斷言承接。
   */
  it('④ 只有 excludedNoAnnouncedDate > 0（前兩項為 0）⇒ ⓘ 仍逐字說明那 {c} 份文件', () => {
    const note = ojtOnTimeNote(stats({ excludedNoAnnouncedDate: 9 }));
    expect(norm(note)).toContain(norm(p3Docs(9)));
    expect(norm(note)).toContain(norm(P1_SCOPE));
    expect(norm(note)).toContain(norm(P4_CROSSREF));
  });

  /**
   * 🔴 `AC-G89` 之核心：**兩支函式刻意不合流**（`ARCH-G6` 之裁定理由未隨載體而消失）。
   * 可觀測之證明＝同一組數字下，F042 之 `exclusionNote()` **無法**表達第三個原因
   * （它只收四個參數、只列兩個原因），而 `ojtOnTimeNote` 可以。
   * 🔒 同時是 `AC-G80` 之回歸旁證：`exclusionNote()` 一行未改。
   */
  it('🔒 與既有 exclusionNote 為兩支不同函式（頭句、排除列舉、尾句三段皆不同）', () => {
    const s = stats({ excludedInactive: 2, excludedOrphaned: 5, excludedNoAnnouncedDate: 7 });
    const legacy = exclusionNote(s.numerator, s.denominator, s.excludedInactive, s.excludedOrphaned);
    const next = ojtOnTimeNote(s);
    // 🔒 既有函式之頭句逐字未改
    expect(legacy).toContain('覆蓋率為 3 / 4（75%）');
    // 🔴 新函式不得沿用「覆蓋率」之頭句（NFR-F044-3 #4：兩個口徑不同的數字必須在畫面上可分辨）
    expect(next).not.toContain('覆蓋率');
    // 🔴 舊函式**表達不了**第三個原因 ⇒ 兩者不可能是同一支
    expect(legacy).not.toContain('公告日期');
    expect(norm(next)).toContain(norm(p3Docs(7)));
    expect(next).not.toBe(legacy);
  });

  /**
   * 🔒 `AC-G13` 之共用要求**並未消失，只是換了載體**（`AC-G89` 逐字）：
   *    百分比現在渲染於**卡面** `ojt-ontime-value`（`已完成 X / 應完成 Y（Z%）`），**不在 ⓘ 裡**。
   *    ⇒ 本 it 只鎖既有共用符號 `coveragePercent` 之行為（`AC-G80` 回歸旁證）＋
   *      🔴 **負向鎖：ⓘ 不得再擺百分比**（否則同一個數字出現在兩處、且只有一處受逐字鎖）。
   *    🔒 卡面之逐字句由 `DashboardHome.f044.test.tsx`（`ojt-ontime-value`）承接。
   */
  it('🔒 AC-G13：coveragePercent 行為未改，且百分比已移出 ⓘ（改鎖於卡面）', () => {
    expect(coveragePercent(3, 4)).toBe(75);
    expect(coveragePercent(3, 7)).toBe(43);
    expect(coveragePercent(0, 0)).toBeNull();
    const note = ojtOnTimeNote(stats({ numerator: 3, denominator: 7, rate: 43 }));
    expect(note).not.toMatch(/\d+\s*%/);
  });

  /**
   * 🔴 **自證（本 describe 之兩條負向鎖無法以「擾動實作」驗證，改以建構法自證其鑑別力）**：
   * ① 「第 3 段獨立成句」之鎖——折合形狀不可能由 `sed` 盲改產生，故直接建構折合字串，
   *    證明本 it ③ 的兩條斷言**確實會把它判紅**（而不是一條對任何輸入都成立的恆真式）。
   * ② 「百分比已移出 ⓘ」之鎖——證明該 regex 真的抓得到百分比。
   * ③ `NO_STATISTICS_TEXT` ↔ `AC-G94` 禁用詞之連結**仍然活著**：若 F042 日後改寫該字面而不再含
   *    `進度列`，本斷言翻紅 ⇒ 提醒下一個人「兩條 AC 不可能同時綠」這個理由已經消失、可重新評估。
   */
  it('🔒 自證：折合形狀會被判紅、百分比 regex 有效、禁用詞連結仍活著', () => {
    const folded =
      `${P1_SCOPE}\n` +
      '其中 2 個單位已裁撤、5 個單位已不再使用該文件、7 份文件尚未設定公告日期，不列入計算。\n' +
      `${P4_CROSSREF}`;
    // ① 折合版**不含**獨立成句之第 3 段 ⇒ it ③ 之 `toContain(p3Docs(7))` 會翻紅
    expect(norm(folded)).not.toContain(norm(p3Docs(7)));
    // ① 且折合版**命中**負向型樣 ⇒ it ③ 之 `not.toContain(...)` 會翻紅
    expect(norm(folded)).toContain(
      norm('其中 2 個單位已裁撤、5 個單位已不再使用該文件、7 份文件尚未設定公告日期，不列入計算。'),
    );
    // ② regex 真的抓得到百分比（含有無空白兩形）
    // 📝 第七輪起卡面已拆為兩個節點（`AC-G13`），百分比單獨住在 `[data-ojt-ontime-rate]`。
    //    本行只是證明 regex 拓得到百分比，樣本隨之更新為現行文案。
    expect('75%').toMatch(/\d+\s*%/);
    expect('比率 75 %').toMatch(/\d+\s*%/);
    // ③ 禁用詞連結仍活著
    expect(NO_STATISTICS_TEXT).toContain('進度列');
  });
});

// ══════════════════════ §癸四 第 1 列 · excludedUnitCount ══════════════════════

/**
 * F044 §癸四 第 1 列（2026-09-21 第二次就地更正；本環提報「混單位」後 lead 裁為**必須改**
 * ——口徑錯誤，不是文案偏好）。
 *
 * 🔴 **「不進母體」≠「被排除」**（規格逐字）：
 * | 欄位 | 計數單位 | 語意 | 計入可見之「已排除 N 個單位」 |
 * |---|---|---|---|
 * | `excludedInactive` | **單位** | 曾在母體內、被排除 | ✅ |
 * | `excludedOrphaned` | **單位** | 曾在母體內、被排除 | ✅ |
 * | `excludedNoAnnouncedDate` | 🔴 **文件** | 依 `OQ-D44-12b` **根本不進母體** | 🔴 ❌ |
 *
 * 🔒 **可見數字須有單一推導點**：`excludedUnitCount(stats)` ⇒ `excludedInactive + excludedOrphaned`；
 *    🔴 **可見文字一律委派它**，明文禁止在元件層再寫一次加法
 *    （否則日後有人把第三項加回去，而**兩處都會綠**）。
 */
describe('excludedUnitCount — 恰加總前兩項（§癸四 第 1 列）', () => {
  type Stats = Parameters<typeof excludedUnitCount>[0];
  const st = (over: Partial<Stats> = {}): Stats =>
    ({
      numerator: 3,
      denominator: 4,
      rate: 75,
      excludedInactive: 0,
      excludedOrphaned: 0,
      excludedNoAnnouncedDate: 0,
      ...over,
    }) as Stats;

  it('恰加總前兩項（單位）', () => {
    expect(excludedUnitCount(st({ excludedInactive: 1, excludedOrphaned: 2 }))).toBe(3);
  });

  /**
   * 🔴 **本條唯一的鑑別力來源**（規格逐字）：一筆 `excludedNoAnnouncedDate > 0` 且
   * `excludedInactive + excludedOrphaned === 0` 之向量。
   * ⇒ 🔴 **若實作仍三項相加，本案會翻紅**（它會得到 5 而非 0）。
   * ⚠ 少了這個向量，「只加前兩項」與「三項相加」在一般語料下輸出相同——又是恆真。
   */
  it('🔴 excludedNoAnnouncedDate **完全不計入**（本條唯一之鑑別向量）', () => {
    expect(excludedUnitCount(st({ excludedNoAnnouncedDate: 5 }))).toBe(0);
    expect(
      excludedUnitCount(st({ excludedInactive: 1, excludedOrphaned: 2, excludedNoAnnouncedDate: 5 })),
    ).toBe(3);
  });

  it('三項皆為 0 ⇒ 0（可見層據此不顯示排除文字）', () => {
    expect(excludedUnitCount(st())).toBe(0);
  });

  /** 🔒 `ojtOnTimeNote` 之 ⓘ 內容仍須說明那 `{c}` 份文件（它只是不進可見的加總）。 */
  it('🔒 第三項雖不計入可見加總，ⓘ 仍須說明它', () => {
    const note = ojtOnTimeNote(st({ excludedNoAnnouncedDate: 5 }));
    expect(note).toContain('5');
    expect(note).toContain('公告日');
  });
});

// ══════════════════════ AC-G20／AC-G93／§癸 (h) · 分段排序 ══════════════════════

function row(documentNumber: string, completed: boolean): OjtProgressRow {
  return {
    documentId: `doc-${documentNumber}`,
    documentNumber,
    documentName: `文件 ${documentNumber}`,
    companyCode: 'AS',
    orgCode: 'X0000',
    orgName: '和潤企業 / 甲部',
    sessionCount: completed ? 1 : 0,
    currentEditionSessionCount: completed ? 1 : 0,
    completed,
    trainingEdition: null,
    documentEdition: null,
    announcedDate: '2026-01-01',
    inactive: false,
    orphaned: false,
  };
}

function group(key: string, allDone: boolean): OjtRowGroup {
  return {
    key,
    companyCode: 'AS',
    code: key,
    label: `和潤企業 / ${key}`,
    inactive: false,
    rows: [row(`${key}-1`, allDone), row(`${key}-2`, allDone)],
  };
}

/**
 * 🔴 §癸 (h) 之語料要求（designer 誠實提報 prototype 25 之示範語料只有 1 個全完成群組，
 * 其向量長度為 1，**無法區分「穩定分段」與「把全完成者以任意次序丟到最後」**）：
 *   · 至少 **2 個全部完成**之群組；
 *   · 至少 **2 個未全部完成**之群組；
 *   · 且兩段在**輸入序列中是交錯排列**的。
 * 🔴 **若輸入本來就已經是「未完成在前」，排序前後輸出相同，整條恆真。**
 */
const INTERLEAVED: OjtRowGroup[] = [
  group('A', false), // 未完成
  group('B', true), // 全完成
  group('C', false), // 未完成
  group('D', true), // 全完成
];

describe('sortGroupsIncompleteFirst — AC-G20／AC-G93／§癸 (h)', () => {
  it('語料自我守護：兩段各 ≥ 2 個，且輸入為交錯排列（否則本組恆真）', () => {
    const done = INTERLEAVED.filter((g) => g.rows.every((r) => r.completed));
    const notDone = INTERLEAVED.filter((g) => !g.rows.every((r) => r.completed));
    expect(done.length).toBeGreaterThanOrEqual(2);
    expect(notDone.length).toBeGreaterThanOrEqual(2);
    expect(INTERLEAVED.map((g) => g.rows.every((r) => r.completed))).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it('未全部完成之群組排在上方，已全部完成者**仍然呈現**於下方（是排序，不是篩選）', () => {
    expect(sortGroupsIncompleteFirst(INTERLEAVED).map((g) => g.key)).toEqual(['A', 'C', 'B', 'D']);
  });

  /**
   * 🔴 `AC-G93` 之**唯一不會綁死其中一邊**的寫法：段內次序規則逐字為
   * 「段內維持**該頁／該端點原本之次序**」——不提排序鍵是什麼，只描述「相對次序未被打亂」。
   * （原型為 `orgCode` 昇冪、正式站為 `orgName.localeCompare`；🔒 本輪刻意不對齊。）
   */
  it('AC-G93：兩段各自之段內次序，逐項等於它們在輸入中的**相對次序**', () => {
    const input = [...INTERLEAVED].reverse(); // D(done), C(not), B(done), A(not)
    const out = sortGroupsIncompleteFirst(input);
    const inNotDone = input.filter((g) => !g.rows.every((r) => r.completed)).map((g) => g.key);
    const inDone = input.filter((g) => g.rows.every((r) => r.completed)).map((g) => g.key);
    expect(out.map((g) => g.key)).toEqual([...inNotDone, ...inDone]);
    expect(inNotDone).toEqual(['C', 'A']); // 相對次序未被打亂（非 orgCode 昇冪、非 orgName 昇冪）
    expect(inDone).toEqual(['D', 'B']);
  });

  it('AC-G20：輸出之群組集合與輸入完全相同（元素恆等、僅順序改變）', () => {
    const out = sortGroupsIncompleteFirst(INTERLEAVED);
    expect(out).toHaveLength(INTERLEAVED.length);
    expect([...out].sort((a, b) => (a.key < b.key ? -1 : 1))).toEqual(
      [...INTERLEAVED].sort((a, b) => (a.key < b.key ? -1 : 1)),
    );
    for (const g of INTERLEAVED) expect(out).toContain(g); // 同一個物件參考，不是複本
  });

  it('空群組（rows 為空）不得被視為「全部完成」（否則會被推到最下方）', () => {
    const empty: OjtRowGroup = { ...group('E', false), rows: [] };
    const out = sortGroupsIncompleteFirst([group('A', true), empty]);
    expect(out.map((g) => g.key)).toEqual(['E', 'A']);
  });

  it('全部皆未完成／全部皆已完成時，次序一格不動', () => {
    const allNot = [group('A', false), group('B', false)];
    const allDone = [group('A', true), group('B', true)];
    expect(sortGroupsIncompleteFirst(allNot).map((g) => g.key)).toEqual(['A', 'B']);
    expect(sortGroupsIncompleteFirst(allDone).map((g) => g.key)).toEqual(['A', 'B']);
  });

  /**
   * 🔒 `AC-G79`／`AC-G21` 回歸旁證：既有 `groupRowsByOrg` 之群組次序（`key` 昇冪）一格不動。
   * ⚠ 本案在建環當下即**綠燈**——它是回歸鎖，不是閘門。
   */
  it('🔒 AC-G79：既有 groupRowsByOrg 之次序未被本功能改動', () => {
    const rows: OjtProgressRow[] = [
      { ...row('N-2', false), companyCode: 'AS', orgCode: 'B1000' },
      { ...row('N-1', true), companyCode: 'AD', orgCode: 'B1000' },
    ];
    expect(groupRowsByOrg(rows).map((g) => g.key)).toEqual(['AD__B1000', 'AS__B1000']);
  });
});

// ══════════════════════ AC-G88 · deep link 兩參數各自獨立解析 ══════════════════════

const q = (s: string): URLSearchParams => new URLSearchParams(s);

describe('readTabParam / readSortParam — AC-G88（🔴 刻意不採「恰成對」紀律）', () => {
  it('readTabParam：值域恰為既有 TabKey 之兩值', () => {
    expect(readTabParam(q('tab=sessions'))).toBe('sessions');
    expect(readTabParam(q('tab=dashboard'))).toBe('dashboard');
  });

  it.each([
    ['參數缺席', ''],
    ['空字串', 'tab='],
    ['大小寫不符', 'tab=Sessions'],
    ['未知值（🔴 不另造 tab=list 之第二套詞彙）', 'tab=list'],
    ['未知值 tab=2', 'tab=2'],
  ])('readTabParam：%s ⇒ null（靜默忽略、退回既有預設）', (_label, s) => {
    expect(readTabParam(q(s))).toBeNull();
  });

  it('readSortParam：值域恰一值 `incomplete-first`', () => {
    expect(readSortParam(q('sort=incomplete-first'))).toBe('incomplete-first');
  });

  it.each([
    ['參數缺席', ''],
    ['空字串', 'sort='],
    ['大小寫不符', 'sort=Incomplete-First'],
    ['未知值', 'sort=asc'],
    ['🔴 不得沿用 F017 之欄位＋方向詞彙', 'sort=announcedDate'],
  ])('readSortParam：%s ⇒ null（靜默忽略、退回既有次序）', (_label, s) => {
    expect(readSortParam(q(s))).toBeNull();
  });

  /**
   * 🔴 **「非成對」之鑑別力所在**（`AC-G88` 逐字）：只帶 `sort=incomplete-first`（不帶 `tab`）時，
   * `sort` **仍然生效**。若實作寫成「恰成對、任一缺席即整組忽略」，本案會紅。
   */
  it('🔴 組合向量：只帶 sort（不帶 tab）⇒ sort 仍然生效', () => {
    expect(readSortParam(q('sort=incomplete-first'))).toBe('incomplete-first');
    expect(readTabParam(q('sort=incomplete-first'))).toBeNull();
  });

  it('🔴 組合向量：只帶 tab（不帶 sort）⇒ tab 仍然生效', () => {
    expect(readTabParam(q('tab=sessions'))).toBe('sessions');
    expect(readSortParam(q('tab=sessions'))).toBeNull();
  });

  it('兩者同時帶且皆可辨識 ⇒ 兩者皆生效', () => {
    const s = q('tab=sessions&sort=incomplete-first');
    expect(readTabParam(s)).toBe('sessions');
    expect(readSortParam(s)).toBe('incomplete-first');
  });

  it('一個可辨識、一個不可辨識 ⇒ 只忽略不可辨識的那一個（不整組丟棄）', () => {
    const s = q('tab=list&sort=incomplete-first');
    expect(readTabParam(s)).toBeNull();
    expect(readSortParam(s)).toBe('incomplete-first');
  });
});

// ══════════════════════ 🔒 AC-G80 回歸旁證 ══════════════════════

/**
 * 🔒 `AC-G80`：`canViewDashboard`／`coveragePercent`／`exclusionNote`／`EDITION_NONE_TEXT`
 * **一行未改**。⚠ 本組在建環當下即綠燈——它是回歸鎖，不是閘門。
 */
describe('🔒 AC-G80 — 既有四個共用符號之行為未被本功能改動', () => {
  it('canViewDashboard ＝ ICSOPAdmin ∣ SysAdmin（值域未被擴充）', () => {
    expect(canViewDashboard('ICSOPAdmin')).toBe(true);
    expect(canViewDashboard('SysAdmin')).toBe(true);
    expect(canViewDashboard('Supervisor')).toBe(false);
    expect(canViewDashboard('DeptContact')).toBe(false);
    expect(canViewDashboard(undefined)).toBe(false);
  });

  it('coveragePercent 之分母為 0 仍回 null（不得改為 0）', () => {
    expect(coveragePercent(0, 0)).toBeNull();
  });

  it('EDITION_NONE_TEXT 逐字為 `未設版次`（🔴 禁止新增第二個常數）', () => {
    expect(EDITION_NONE_TEXT).toBe('未設版次');
  });

  it('exclusionNote 之既有三段句型逐字未改', () => {
    expect(exclusionNote(2, 3, 0, 0)).toContain('覆蓋率為 2 / 3（67%）');
    expect(exclusionNote(2, 3, 1, 1)).toContain('本次共排除 2 列');
  });
});
