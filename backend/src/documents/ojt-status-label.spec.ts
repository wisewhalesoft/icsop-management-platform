import * as ojtReaderModule from './ojt-completion.reader';
import { deriveOjtStatus, type OjtCompletionStatus } from './ojt-completion.reader';

/**
 * F017 `AC-X4` —— 匯出 CSV 第 1 欄「OJT」之三值中文標籤表（後端側）。
 *
 * 權威：
 *  - `docs/specs/features/F017-backend-document-list.md` `AC-X4`
 *    （三值逐字 `已全部完成`／`部分完成`／`尚未開始`；缺鍵 → `尚未開始`；🔒 值域恰 3 個且封閉）
 *  - `docs/specs/architecture-spec.md` §13.3 (i)
 *    （落點＝**本檔所測之 `ojt-completion.reader.ts`**，與 `OjtCompletionStatus` 型別及
 *      `deriveOjtStatus()` 同檔；綁定手法比照 §10.14 `watermarkLines()` 之「兩份逐字相同」）
 *  - `docs/specs/error-handling.md#export` 值層通則（列舉／代碼欄一律輸出畫面所見之中文標籤）
 *
 * 🔴 **跨執行環境向量（§13.5 盲區 #5）**：本 repo 前後端為兩個獨立 TS 專案、無共用 package ⇒
 *    「只有一份」在本輪架構上不可達。本輪之機器可驗約束為**兩份逐字相同**——本檔釘住後端側，
 *    `frontend/src/pages/DocumentListPage.exportVectors.test.ts` 釘住前端側 `ojtStatusView(s).text`，
 *    **兩檔使用同一組 3 列固定向量**（下方 `CROSS_RUNTIME_VECTOR`，值域封閉故該向量即完整列舉）。
 *    🔴 只在一側建向量的話，另一側漂移沒有任何機制會攔——兩檔缺一不可。
 *
 * ⚠ **對實作全盲**：`OJT_STATUS_LABEL` 於本環撰寫時**尚不存在**（全庫後端 grep 僅見於測試註解）。
 *    以命名空間 import ＋ cast 取用，使紅燈落在**逐條斷言**上（而非整檔 TS2305 編譯紅），
 *    診斷訊息才指得出「哪一條規則沒被滿足」。
 */

/** 🔴 兩端共用之固定向量（前端側同名常數必須逐字相同）。值域恰 3 個且封閉 ⇒ 此即完整列舉。 */
const CROSS_RUNTIME_VECTOR: readonly [OjtCompletionStatus, string][] = [
  ['all', '已全部完成'],
  ['partial', '部分完成'],
  ['none', '尚未開始'],
];

type LabelTable = Record<string, string> | undefined;

const labels = (): LabelTable =>
  (ojtReaderModule as unknown as { OJT_STATUS_LABEL?: Record<string, string> }).OJT_STATUS_LABEL;

describe('F017 AC-X4：OJT 欄三值中文標籤表（後端側，落點＝ojt-completion.reader.ts）', () => {
  it('AC-X4 ①（架構 §13.3 (i)）`OJT_STATUS_LABEL` 由 `ojt-completion.reader.ts` 匯出', () => {
    expect(labels()).toBeDefined();
    expect(typeof labels()).toBe('object');
  });

  it.each(CROSS_RUNTIME_VECTOR)(
    'AC-X4 ② `%s` → 逐字 `%s`（跨執行環境向量，與前端 ojtStatusView().text 同一組）',
    (status, text) => {
      expect(labels()?.[status]).toBe(text);
    },
  );

  it('AC-X4 🔒 值域恰 3 個且封閉——不得引入第四個鍵（OQ-E11-22 已明文鎖定同一組三值）', () => {
    const table = labels();
    expect(table).toBeDefined();
    expect(Object.keys(table ?? {}).sort()).toEqual(['all', 'none', 'partial']);
  });

  it('AC-X4 🔴 不得輸出列舉代碼——三個標籤值之中不得出現 all／partial／none 之字面', () => {
    const table = labels();
    expect(table).toBeDefined();
    for (const value of Object.values(table ?? {})) {
      expect(value).not.toMatch(/^(all|partial|none)$/);
    }
  });

  it('AC-X4 🔒 標籤表之鍵與 `deriveOjtStatus()` 之輸出值域為同一組三值（同檔判定點，不得分家）', () => {
    const table = labels();
    expect(table).toBeDefined();
    // deriveOjtStatus 之三種可達輸出（0/0 → none；1/2 → partial；2/2 → all）
    const derived = [
      deriveOjtStatus(0, 0),
      deriveOjtStatus(2, 1),
      deriveOjtStatus(2, 2),
    ];
    expect([...derived].sort()).toEqual(['all', 'none', 'partial']);
    for (const s of derived) expect(table?.[s]).toBeTruthy();
  });

  it('🔒 自證：本向量恰 3 列、期望值兩兩相異（防退化為「三條都比同一個字」之恆真斷言）', () => {
    expect(CROSS_RUNTIME_VECTOR).toHaveLength(3);
    expect(new Set(CROSS_RUNTIME_VECTOR.map(([, t]) => t)).size).toBe(3);
  });
});
