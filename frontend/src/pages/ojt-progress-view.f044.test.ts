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

describe('ojtOnTimeNote — AC-G89 之四列固定向量（🔴 不共用 exclusionNote）', () => {
  it('① denominator === 0（空狀態）⇒ 使用既有 NO_STATISTICS_TEXT', () => {
    const note = ojtOnTimeNote(stats({ numerator: 0, denominator: 0, rate: undefined }));
    expect(note).toContain(NO_STATISTICS_TEXT);
    // 🔴 明文禁止 `0%`／`100%`／`NaN`
    expect(note).not.toMatch(/\b0%|\b100%|NaN/);
  });

  it('② 三種排除皆為 0 ⇒ 仍恆顯示，且明說「目前無任何進度列因此被排除」之意', () => {
    const note = ojtOnTimeNote(stats());
    expect(note).toContain('3');
    expect(note).toContain('4');
    // AC-G15 ③：被排除者於 `OJT 資料清單` 分頁仍可能呈現
    expect(note).toContain('OJT 資料清單');
  });

  it('③ 三種排除皆 > 0 ⇒ 三個原因與其列數皆載明', () => {
    const note = ojtOnTimeNote(
      stats({ excludedInactive: 2, excludedOrphaned: 5, excludedNoAnnouncedDate: 7 }),
    );
    expect(note).toContain('裁撤');
    expect(note).toContain('2');
    expect(note).toContain('移出');
    expect(note).toContain('5');
    expect(note).toContain('公告日');
    expect(note).toContain('7');
  });

  /**
   * ④ 🔴 **第三個原因之唯一鑑別力來源**（`AC-G89` 逐字）：
   *    若語料中 `excludedNoAnnouncedDate` 恆為 0，「多一個原因」這件事恆真。
   */
  it('④ 只有 excludedNoAnnouncedDate > 0 ⇒ 該原因仍被載明', () => {
    const note = ojtOnTimeNote(stats({ excludedNoAnnouncedDate: 9 }));
    expect(note).toContain('公告日');
    expect(note).toContain('9');
  });

  /**
   * 🔴 `AC-G89` 之核心：**兩支函式刻意不合流**。
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
    expect(legacy).not.toContain('無公告日');
    expect(next).toContain('公告日');
    expect(next).not.toBe(legacy);
  });

  it('🔒 AC-G13：百分比委派既有 coveragePercent（禁止另打一份 Math.round）', () => {
    expect(coveragePercent(3, 4)).toBe(75);
    expect(coveragePercent(3, 7)).toBe(43);
    expect(coveragePercent(0, 0)).toBeNull();
    const note = ojtOnTimeNote(stats({ numerator: 3, denominator: 7, rate: 43 }));
    expect(note).toContain('43');
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
