import type { DocumentLinkView } from './document-link.store';

/**
 * F017 `AC-X6` —— 匯出 CSV 第 12 欄「連結點程序書」之**欄內順序**純函式（後端側）。
 *
 * 權威：
 *  - `docs/specs/features/F017-backend-document-list.md` `AC-X6`
 *    （順序＝畫面該儲存格**展開後**所見之順序；未套用 `連結點程序書` 篩選時＝ `links[]` 既有順序；
 *      已套用時＝**命中者排第一顆**、其餘順序不變（穩定排序，兩段內部各自維持原相對順序））
 *  - `docs/specs/architecture-spec.md` §13.3 (ii)
 *    （後端新增純函式 `orderLinksForExport(links, linkTargetId?)`；未提供命中值或無命中 → **原樣回傳**；
 *      落點＝`backend/src/documents/` 之獨立純函式檔）
 *  - `AC-X6` 可測形狀：「對同一組 `(links, 命中之目標文件 id)` 輸入，前端 `LinkCell` 之 `orderedLinks`
 *    與後端 `orderLinksForExport()` **逐案輸出相等**」
 *
 * 🔴 **跨執行環境向量（§13.5 盲區 #5）**：本檔之 `SIX_LINKS` 與 `HIT_TARGET_ID` **必須**與
 *    前端 `frontend/src/pages/DocumentListPage.exportVectors.test.ts` 之同名常數逐字相同——
 *    `AC-X6` 明訂「後端向量須使用與既有測試相同之 `links` 形狀，否則兩份各測各的、對不上就等於沒綁」。
 *    本向量取自既有綠測 `frontend/src/pages/DocumentListPage.linkCell.test.tsx`
 *    （`SIX` ＝ 實測 591 筆中連結最多者之 6 個連結；`AC-E6` 案以第 6 顆為命中）。
 *
 * 📌 **本環所訂之契約（規格只定「落於 `backend/src/documents/` 之獨立純函式檔」、未定檔名）**：
 *    檔名＝`backend/src/documents/export-link-order.ts`、匯出名＝`orderLinksForExport`。
 *    ⚠ 若實作採不同檔名／匯出名，請走 mailbox 申訴，**不得自行改本檔**。
 *
 * ⚠ **對實作全盲**：該檔於本環撰寫時**尚不存在**。以 `require` 之 try/catch 取用，使紅燈落在
 *    **逐條斷言**上並印出「模組尚未存在」，而非整檔 TS2307 編譯紅。
 *
 * 🔵 **spec 字面同步中之提醒（2026-08-31，lead 裁決）**：`AC-X6` 現行字面仍寫著「**前端不需為本
 *    delta 改動任何程式**」，該句已由 lead 裁定作廢、正由 spec-writer 收斂中。**裁決＝採
 *    architecture §13.3 (ii)**：前端須把 `LinkCell` 之 inline `useMemo` 就地抽為同檔匯出之純函式
 *    `orderedLinks()`，本檔之向量方能與其配對（前端側落點＝
 *    `frontend/src/pages/DocumentListPage.exportVectors.test.ts`，理由詳見該檔檔頭）。
 */

type OrderFn = (links: readonly DocumentLinkView[], linkTargetId?: string) => DocumentLinkView[];

function loadOrderLinksForExport(): OrderFn | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('./export-link-order') as { orderLinksForExport?: OrderFn };
    return mod.orderLinksForExport;
  } catch {
    return undefined;
  }
}

const link = (n: number, targetId: string, targetNumber: string | null): DocumentLinkView => ({
  linkId: `l${n}`,
  targetDocumentId: targetId,
  targetNumber,
  targetName: `目標-${n}`,
  targetStatus: 'active',
});

/** 🔴 跨執行環境向量（前端同名常數必須逐字相同）——來源＝linkCell.test.tsx 之 `SIX`。 */
const SIX_LINKS: readonly DocumentLinkView[] = [
  link(1, 'd2', 'ICSOP-SRC-101-2-00'),
  link(2, 'd5', 'ICSOP-SRC-102-1-01'),
  link(3, 'd4', 'ICSOP-SRC-101-1-06'),
  link(4, 'd6', 'ICSOP-PPC-101-2-02'),
  link(5, 'd7', 'ICSOP-PPC-101-1-03'),
  link(6, 'd8', 'ICSOP-CIPS-104-1-01'),
];
/** `AC-E6` 既有綠測所用之命中目標（第 6 顆）。 */
const HIT_TARGET_ID = 'd8';
/** 命中後之期望編號序（＝既有綠測 tooltip「其餘 5 個」之順序，前置命中者）。 */
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

describe('F017 AC-X6：orderLinksForExport（連結點欄內順序純函式，後端側）', () => {
  it('AC-X6（架構 §13.3 (ii)）`orderLinksForExport` 由 `backend/src/documents/export-link-order.ts` 匯出', () => {
    const fn = loadOrderLinksForExport();
    expect(typeof fn).toBe('function');
  });

  it('AC-X6 🔴 命中時：命中者排第一顆，其餘維持原相對順序（跨執行環境向量）', () => {
    const fn = loadOrderLinksForExport();
    expect(typeof fn).toBe('function');
    expect(numbersOf((fn as OrderFn)(SIX_LINKS, HIT_TARGET_ID))).toEqual(EXPECTED_ORDER_ON_HIT);
  });

  it('AC-X6 未提供命中值（undefined）→ **原樣回傳**（順序與輸入逐字相同）', () => {
    const fn = loadOrderLinksForExport();
    expect(typeof fn).toBe('function');
    expect(numbersOf((fn as OrderFn)(SIX_LINKS))).toEqual(numbersOf(SIX_LINKS));
  });

  it('AC-X6 提供之命中值於本列無命中 → **原樣回傳**（不得因此重排或丟棄任何一筆）', () => {
    const fn = loadOrderLinksForExport();
    expect(typeof fn).toBe('function');
    const out = (fn as OrderFn)(SIX_LINKS, 'd-not-in-this-row');
    expect(numbersOf(out)).toEqual(numbersOf(SIX_LINKS));
    expect(out).toHaveLength(SIX_LINKS.length);
  });

  it('AC-X6 🔴 穩定排序：兩顆同時命中 → 兩者皆前置且**彼此維持原相對順序**（非任意交換）', () => {
    const fn = loadOrderLinksForExport();
    expect(typeof fn).toBe('function');
    // 以同一 targetDocumentId 之兩筆連結構造「兩顆命中」；第 2、5 顆命中。
    const rows: DocumentLinkView[] = [
      link(1, 'dA', 'N-A'),
      link(2, 'dHIT', 'N-HIT-1'),
      link(3, 'dB', 'N-B'),
      link(4, 'dC', 'N-C'),
      link(5, 'dHIT', 'N-HIT-2'),
    ];
    expect(numbersOf((fn as OrderFn)(rows, 'dHIT'))).toEqual([
      'N-HIT-1',
      'N-HIT-2',
      'N-A',
      'N-B',
      'N-C',
    ]);
  });

  it('AC-X6 空陣列 → 空陣列（不拋錯）', () => {
    const fn = loadOrderLinksForExport();
    expect(typeof fn).toBe('function');
    expect((fn as OrderFn)([], HIT_TARGET_ID)).toEqual([]);
  });

  it('🔒 純函式：不得就地改動傳入之陣列（呼叫端之 `item.links` 於匯出後仍為原序）', () => {
    const fn = loadOrderLinksForExport();
    expect(typeof fn).toBe('function');
    const input = [...SIX_LINKS];
    const before = numbersOf(input);
    (fn as OrderFn)(input, HIT_TARGET_ID);
    expect(numbersOf(input)).toEqual(before);
  });

  it('🔒 自證：本向量之「原序」與「命中後之序」相異（否則上兩案對「完全沒有重排」之實作恆真）', () => {
    expect(EXPECTED_ORDER_ON_HIT).not.toEqual(numbersOf(SIX_LINKS));
    expect(EXPECTED_ORDER_ON_HIT).toHaveLength(SIX_LINKS.length);
  });
});
