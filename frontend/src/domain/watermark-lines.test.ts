import { describe, it, expect } from 'vitest';
import { WATERMARK_CONFIDENTIALITY, watermarkLines } from './watermark-lines';

/**
 * F020 #7／F038 #17 三層式浮水印 —— **前端側**共用模組（Lane L2）。
 *
 * 權威：
 *  - `prototypes/05-public-viewer-watermark.html:106-110`
 *    （`WM_DATA` / `WM_NOTICE` / `WM_TIME` 三層；`<span>${WM_DATA}<br>${WM_NOTICE}<br>${WM_TIME}</span>`）
 *  - F020 Description（機密聲明另起一行）；F038 檔頭加註（#17＝`BUG-IMPL`，不新增 AC）
 *  - architecture-spec §10.14（落點＝`frontend/src/domain/watermark-lines.ts`，自
 *    `LifecycleTreePreviewPage.tsx:33-41` **原地搬移**，實作一字不改；三個消費者＝
 *    `LifecycleTreePreviewPage` / `PublicViewerPage` / `ChangeHistoryPage` 之 `DiffBoard`）
 *
 * ⚠ 對實作全盲：`./watermark-lines` 於本環撰寫時**尚不存在** —— import 失敗即為預期紅燈。
 *
 * 🔴 **本檔之向量與 `backend/src/public/watermark.three-layer.spec.ts` 逐字相同**。§10.14：
 *    「兩份實作刻意各留一份，以同一組固定測試向量綁定 —— 任一邊漂移即紅燈。這是**唯一**可行的
 *     一致性保證；『兩邊程式碼看起來一樣』不是保證。」改任一邊之期望值時必須同時改另一邊。
 */

const TIME = '2026-08-16 10:00:00 (UTC+8)';

/** §10.14 之三個代表性快照（與後端 spec 逐字相同）。 */
const VECTORS: { label: string; snapshot: string; lines: string[] }[] = [
  {
    label: '① 完整五欄（員工編號-姓名-公司全稱-部門-處/室）',
    snapshot: `E001-王小明-和潤企業股份有限公司-營運管理部-審查室-${WATERMARK_CONFIDENTIALITY}-${TIME}`,
    lines: ['E001-王小明-和潤企業股份有限公司-營運管理部-審查室', WATERMARK_CONFIDENTIALITY, TIME],
  },
  {
    label: '② 缺「處/室」（掛部層者，契約 §8.4 收合）',
    snapshot: `E001-王小明-和潤企業股份有限公司-營運管理部-${WATERMARK_CONFIDENTIALITY}-${TIME}`,
    lines: ['E001-王小明-和潤企業股份有限公司-營運管理部', WATERMARK_CONFIDENTIALITY, TIME],
  },
  {
    label: '③ 缺「處/室」與「部門」（孤兒帳號）',
    snapshot: `E001-王小明-和潤企業股份有限公司-${WATERMARK_CONFIDENTIALITY}-${TIME}`,
    lines: ['E001-王小明-和潤企業股份有限公司', WATERMARK_CONFIDENTIALITY, TIME],
  },
];

describe('watermarkLines（F020 #7／F038 #17 — 前端共用模組）', () => {
  it('WATERMARK_CONFIDENTIALITY 為 NFR-007 之逐字固定機密聲明', () => {
    expect(WATERMARK_CONFIDENTIALITY).toBe(
      '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現',
    );
  });

  it.each(VECTORS)('$label → 恰三行且逐字相同', ({ snapshot, lines }) => {
    expect(watermarkLines(snapshot)).toEqual(lines);
  });

  it('機密聲明恆為獨立一行（第 2 行），不與身分列或時間戳同行', () => {
    for (const v of VECTORS) {
      const out = watermarkLines(v.snapshot);
      expect(out).toHaveLength(3);
      expect(out[1]).toBe(WATERMARK_CONFIDENTIALITY);
      expect(out[0]).not.toContain(WATERMARK_CONFIDENTIALITY);
      expect(out[2]).not.toContain(WATERMARK_CONFIDENTIALITY);
    }
  });

  it('各行首尾不得殘留分隔符 `-`，且不得產生空行', () => {
    for (const v of VECTORS) {
      for (const line of watermarkLines(v.snapshot)) {
        expect(line.startsWith('-')).toBe(false);
        expect(line.endsWith('-')).toBe(false);
        expect(line.trim()).not.toBe('');
      }
    }
  });

  it('🔒 純顯示層轉換：三行以 `-` 接回即為原線性快照（後端稽核快照順序不變）', () => {
    for (const v of VECTORS) {
      expect(watermarkLines(v.snapshot).join('-')).toBe(v.snapshot);
    }
  });

  it('找不到機密聲明錨點（非本系統快照）→ 原字串單獨一行（優雅降級，不拋例外）', () => {
    expect(watermarkLines('無錨點之字串')).toEqual(['無錨點之字串']);
  });
});
