import { describe, it, expect } from 'vitest';
import * as documentListPage from './DocumentListPage';
import { ojtStatusView } from '../domain/ojt-status-view';
import type { DocumentLinkView, OjtDocumentStatus } from '../api/types';

/**
 * F017 匯出 delta —— **跨執行環境向量之前端側**（`AC-X4` OJT 三值標籤／`AC-X6` 連結點欄內順序）。
 *
 * 權威：
 *  - `AC-X4`：🔴「本輪之機器可驗約束為**兩份逐字相同**——後端新增之三值→中文標籤對照表，
 *    其三個字面與 `ojt-status-view.ts` 之 `VIEWS[*].text` **逐字相同**」；
 *    「兩端各對**同一組 3 列固定向量**斷言——後端 `OJT_STATUS_LABEL[s]`、前端 `ojtStatusView(s).text`」
 *  - `AC-X6`：🔴「對同一組 `(links, 命中之目標文件 id)` 輸入，前端 `LinkCell` 之 `orderedLinks`
 *    與後端 `orderLinksForExport()` **逐案輸出相等**」
 *  - `architecture-spec.md` §13.3 (i)(ii)：綁定手法比照 §10.14 `watermarkLines()`；
 *    §13.3 (ii) 明訂前端該邏輯**必須就地抽為同檔匯出之純函式**
 *    `DocumentListPage.tsx` 之 `export function orderedLinks(links, filterLink)`，
 *    否則 `AC-X6` 之斷言標的不存在（**行為恆等、無渲染差異**，`AC-X16` ① 不受影響）
 *  - `architecture-spec.md` §13.5 盲區 #5：「若 test-generator 只在後端建向量，前端漂移**沒有任何機制會攔**」
 *
 * 🔴 **本檔之兩組常數必須與後端逐字相同**：
 *  · `CROSS_RUNTIME_VECTOR` ↔ `backend/src/documents/ojt-status-label.spec.ts`
 *  · `SIX_LINKS`／`HIT_TARGET_ID`／`EXPECTED_ORDER_ON_HIT` ↔ `backend/src/documents/export-link-order.spec.ts`
 *    （其來源為既有綠測 `DocumentListPage.linkCell.test.tsx` 之 `SIX`，`AC-X6` 明文要求同一形狀）
 *
 * ⚠ **對實作全盲**：`orderedLinks` 於本環撰寫時**尚不存在**（現為 `LinkCell` 內之 inline `useMemo`）。
 *    以命名空間 import ＋ cast 取用，使紅燈落在逐條斷言上。
 *
 * 🔵 **spec 字面同步中之提醒（2026-08-31，lead 裁決；覺得「本檔與 spec 對不上」時請先看這段）**：
 *    `AC-X6` 現行字面仍寫著「**前端不需為本 delta 改動任何程式**」、`AC-X16` ⑩ 仍寫「必須觸及之
 *    既有程式路徑**恰兩處**」。**該兩處字面已由 lead 裁定作廢、正由 spec-writer 同步收斂中**
 *    （連同 `AC-X8`／`AC-X16` ⑦ 共四處）。
 *    🔴 **裁決（權威，優先於現行 AC 字面）＝採 architecture §13.3 (ii)：抽出 `orderedLinks()`，
 *    觸及之既有程式路徑為三處。** 依據：`AC-X6` 之散文與 `AC-X6` **自己的可測形狀**（「前端
 *    `orderedLinks` 與後端 `orderLinksForExport()` 逐案輸出相等」）互相矛盾，而既有
 *    `DocumentListPage.linkCell.test.tsx:317` 斷言的是**渲染後之 pill 順序與 tooltip 文字**、
 *    不是函式輸出，**無法**與後端函式做逐案比對 ⇒ 不抽取則該 AC 之斷言標的不存在。
 *    同 delta 內之先例：prototype 即把 13 項篩選抽為 `filteredRows()` 供渲染與匯出共用，
 *    使不變式**構造上成立**而非兩份實作碰巧一致——本處為同一手法。
 */

/** 🔴 與後端 `ojt-status-label.spec.ts` 之同名常數逐字相同（值域恰 3 個且封閉 ⇒ 完整列舉）。 */
const CROSS_RUNTIME_VECTOR: readonly [OjtDocumentStatus, string][] = [
  ['all', '已全部完成'],
  ['partial', '部分完成'],
  ['none', '尚未開始'],
];

type OrderedLinksFn = (links: readonly DocumentLinkView[], filterLink: string) => DocumentLinkView[];
const orderedLinks = (): OrderedLinksFn | undefined =>
  (documentListPage as unknown as { orderedLinks?: OrderedLinksFn }).orderedLinks;

const link = (n: number, targetId: string, targetNumber: string | null): DocumentLinkView => ({
  linkId: `l${n}`,
  targetDocumentId: targetId,
  targetNumber,
  targetName: `目標-${n}`,
  targetStatus: 'active',
});

/** 🔴 與後端 `export-link-order.spec.ts` 之同名常數逐字相同。 */
const SIX_LINKS: readonly DocumentLinkView[] = [
  link(1, 'd2', 'ICSOP-SRC-101-2-00'),
  link(2, 'd5', 'ICSOP-SRC-102-1-01'),
  link(3, 'd4', 'ICSOP-SRC-101-1-06'),
  link(4, 'd6', 'ICSOP-PPC-101-2-02'),
  link(5, 'd7', 'ICSOP-PPC-101-1-03'),
  link(6, 'd8', 'ICSOP-CIPS-104-1-01'),
];
const HIT_TARGET_ID = 'd8';
const EXPECTED_ORDER_ON_HIT = [
  'ICSOP-CIPS-104-1-01',
  'ICSOP-SRC-101-2-00',
  'ICSOP-SRC-102-1-01',
  'ICSOP-SRC-101-1-06',
  'ICSOP-PPC-101-2-02',
  'ICSOP-PPC-101-1-03',
];

const numbersOf = (rows: readonly DocumentLinkView[]): (string | null)[] =>
  rows.map((l) => l.targetNumber);

describe('F017 AC-X4：OJT 三值中文標籤（前端側之跨執行環境向量）', () => {
  it.each(CROSS_RUNTIME_VECTOR)(
    'AC-X4 `%s` → `ojtStatusView().text` 逐字為 `%s`（與後端 OJT_STATUS_LABEL 同一組向量）',
    (status, text) => {
      expect(ojtStatusView(status).text).toBe(text);
    },
  );

  it('AC-X4 缺鍵（undefined）視同 `none` → `尚未開始`（與後端之缺鍵規則同一條）', () => {
    expect(ojtStatusView(undefined).text).toBe('尚未開始');
  });

  it('🔒 自證：本向量恰 3 列、期望值兩兩相異（防退化為恆真斷言）', () => {
    expect(CROSS_RUNTIME_VECTOR).toHaveLength(3);
    expect(new Set(CROSS_RUNTIME_VECTOR.map(([, t]) => t)).size).toBe(3);
  });
});

describe('F017 AC-X6：`orderedLinks` 純函式（前端側之跨執行環境向量）', () => {
  it('AC-X6（架構 §13.3 (ii)）`orderedLinks` 由 `DocumentListPage.tsx` 匯出為純函式', () => {
    expect(typeof orderedLinks()).toBe('function');
  });

  it('🔴 AC-X6 命中時：命中者排第一顆、其餘維持原相對順序（與後端 orderLinksForExport 同一向量、同一期望）', () => {
    const fn = orderedLinks();
    expect(typeof fn).toBe('function');
    expect(numbersOf((fn as OrderedLinksFn)(SIX_LINKS, HIT_TARGET_ID))).toEqual(EXPECTED_ORDER_ON_HIT);
  });

  it('AC-X6 未套用篩選（空字串）→ 原樣回傳', () => {
    const fn = orderedLinks();
    expect(typeof fn).toBe('function');
    expect(numbersOf((fn as OrderedLinksFn)(SIX_LINKS, ''))).toEqual(numbersOf(SIX_LINKS));
  });

  it('AC-X6 篩選值於本列無命中 → 原樣回傳（不重排、不丟棄任何一筆）', () => {
    const fn = orderedLinks();
    expect(typeof fn).toBe('function');
    const out = (fn as OrderedLinksFn)(SIX_LINKS, 'd-not-in-this-row');
    expect(numbersOf(out)).toEqual(numbersOf(SIX_LINKS));
    expect(out).toHaveLength(SIX_LINKS.length);
  });

  it('🔴 AC-X6 穩定排序：兩顆同時命中 → 兩者皆前置且彼此維持原相對順序（與後端同一案）', () => {
    const fn = orderedLinks();
    expect(typeof fn).toBe('function');
    const rows: DocumentLinkView[] = [
      link(1, 'dA', 'N-A'),
      link(2, 'dHIT', 'N-HIT-1'),
      link(3, 'dB', 'N-B'),
      link(4, 'dC', 'N-C'),
      link(5, 'dHIT', 'N-HIT-2'),
    ];
    expect(numbersOf((fn as OrderedLinksFn)(rows, 'dHIT'))).toEqual([
      'N-HIT-1', 'N-HIT-2', 'N-A', 'N-B', 'N-C',
    ]);
  });

  it('AC-X6 空陣列 → 空陣列（不拋錯）', () => {
    const fn = orderedLinks();
    expect(typeof fn).toBe('function');
    expect((fn as OrderedLinksFn)([], HIT_TARGET_ID)).toEqual([]);
  });

  it('🔒 自證：本向量之「原序」與「命中後之序」相異（否則上述斷言對「完全沒有重排」之實作恆真）', () => {
    expect(EXPECTED_ORDER_ON_HIT).not.toEqual(numbersOf(SIX_LINKS));
    expect(EXPECTED_ORDER_ON_HIT).toHaveLength(SIX_LINKS.length);
  });
});
