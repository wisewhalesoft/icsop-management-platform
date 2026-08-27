import { describe, it, expect } from 'vitest';
import {
  WATERMARK_FONT_SIZE,
  WATERMARK_LINE_HEIGHT,
  watermarkOverlayGeometry,
} from './watermark-style';
import { watermarkPresentation } from './watermark-lines';

/**
 * 🔴 2026-08-27 使用者裁決（UX ②）：**樹狀圖之浮水印疊加層必須滿版**。
 *
 * 使用者回報：「樹狀圖寬度較寬於螢幕解析度時，浮水印只集中在中間」。
 *
 * 🔴 **這不是密度不足，是幾何上蓋不到**——舊寫法 `inset: -40%` 讓疊加層為畫板之 `1.8W × 1.8H`
 * （兩邊**各自**等比放大），再整層 `rotate(-45deg)`。但旋轉後之矩形要蓋住原矩形，**兩軸半徑都
 * 必須 ≥ `(W + H)/2 × cos45°`**（把畫板四角逆旋轉 45° 後之極值）。長寬比一拉開，`1.8H` 遠小於
 * 該值 ⇒ 疊加層退化成一條斜向細帶。
 *
 * 📌 本檔以**幾何覆蓋**為斷言標的（四角是否落在旋轉後之疊加層內），而非「tile 枚數 > 某個數」——
 * 後者正是舊實作綠著卻壞掉的形狀：`wmCount` 一直有值，只是那些 tile 全落在畫板外。
 */

const CONF = '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現';
const WM = `E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-${CONF}-2026-08-27 10:00:00 (UTC+8)`;
/** 🔴 第三輪起 tile 只鋪兩行（機密聲明改為中央出現一次），幾何以 tiled 為輸入。 */
const LINES = watermarkPresentation(WM).tiled;
/** 與 `LifecycleTreePreviewPage` 之 `WM_TILE_PAD` 同值（2026-08-27 第二輪：隨字級 16→32 同倍放大）。 */
const PAD = { x: 60, y: 140 };

/** 疊加層之 `transform: rotate(-45deg)` 以自身中心為原點；判定改為把畫板角**逆旋轉**回疊加層座標系。 */
function insideRotatedOverlay(
  corner: { x: number; y: number },
  g: { size: number; offsetX: number; offsetY: number },
): boolean {
  const cx = g.offsetX + g.size / 2;
  const cy = g.offsetY + g.size / 2;
  const dx = corner.x - cx;
  const dy = corner.y - cy;
  // 逆旋轉 +45°（疊加層本身轉 −45°）。
  const c = Math.SQRT1_2;
  const lx = dx * c - dy * c;
  const ly = dx * c + dy * c;
  const half = g.size / 2;
  return Math.abs(lx) <= half + 1e-6 && Math.abs(ly) <= half + 1e-6;
}

function corners(w: number, h: number): { x: number; y: number }[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: 0, y: h },
    { x: w, y: h },
  ];
}

/** 每行皆以「全形」計寬之 tile 寬上界（真實瀏覽器之等寬字型必不寬於此）。 */
function worstCaseTileWidth(lines: string[], fontSize: number, padX: number): number {
  const widest = lines.reduce((m, l) => Math.max(m, Array.from(l).length * fontSize), 0);
  return widest + padX * 2;
}

describe('watermarkOverlayGeometry — UX ② 疊加層滿版', () => {
  const BOARDS: [string, number, number][] = [
    ['正方形小圖', 600, 600],
    ['一般圖', 1200, 800],
    ['🔴 極寬圖（使用者回報之形狀）', 4000, 600],
    ['🔴 更寬更淺', 8000, 420],
    ['窄而高（直向長鏈）', 500, 4000],
  ];

  it.each(BOARDS)('%s（%i×%i）：旋轉後之疊加層涵蓋畫板四角', (_label, w, h) => {
    const g = watermarkOverlayGeometry(w, h, LINES, PAD);
    for (const c of corners(w, h)) {
      expect(insideRotatedOverlay(c, g), `角 (${c.x}, ${c.y}) 落在疊加層外`).toBe(true);
    }
  });

  /**
   * 🔴 負向對照：把已作廢之 `inset: -40%` 幾何餵進同一套覆蓋判定，極寬圖**必須**失敗。
   * 這條讓「舊寫法哪裡壞掉」成為可執行之證據，而不是只留在註解裡。
   */
  it('🔴 已作廢之 inset:-40% 幾何在極寬圖上蓋不到四角（本次缺陷之形狀）', () => {
    const [w, h] = [4000, 600];
    const legacy = { size: 0, offsetX: 0, offsetY: 0 };
    // inset:-40% ⇒ 寬 1.8W、高 1.8H、左上角 (−0.4W, −0.4H)。非正方形，故兩軸各自判定。
    const lw = w * 1.8;
    const lh = h * 1.8;
    const cx = w / 2;
    const cy = h / 2;
    const c = Math.SQRT1_2;
    const anyOutside = corners(w, h).some((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      return Math.abs(dx * c - dy * c) > lw / 2 || Math.abs(dx * c + dy * c) > lh / 2;
    });
    expect(anyOutside, 'inset:-40% 竟然蓋得到——則本次修正之前提有誤').toBe(true);
    expect(legacy.size).toBe(0); // 佔位：舊寫法根本沒有「邊長」這個量
  });

  it.each(BOARDS)('%s（%i×%i）：cols × rows 足以鋪滿疊加層（即使每字都以全形計寬）', (_label, w, h) => {
    const g = watermarkOverlayGeometry(w, h, LINES, PAD);
    const tileW = worstCaseTileWidth(LINES, WATERMARK_FONT_SIZE, PAD.x);
    const tileH = LINES.length * WATERMARK_FONT_SIZE * WATERMARK_LINE_HEIGHT + PAD.y * 2;
    expect(g.cols * tileW).toBeGreaterThanOrEqual(g.size);
    expect(g.rows * tileH).toBeGreaterThanOrEqual(g.size);
  });

  it('疊加層為正方形且以畫板中心為中心（旋轉原點即中心）', () => {
    const g = watermarkOverlayGeometry(1200, 800, LINES, PAD);
    // 位移取整 ⇒ 中心最多偏 0.5px（無關痛癢，但斷言得寫得下這個容差，否則整數化一改就脆裂）。
    expect(Math.abs(g.offsetX + g.size / 2 - 1200 / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(g.offsetY + g.size / 2 - 800 / 2)).toBeLessThanOrEqual(0.5);
    expect(g.size).toBeGreaterThanOrEqual((1200 + 800) * Math.SQRT1_2);
  });

  it('空拆行（尚無浮水印字串）不得除以零或產生非有限值', () => {
    const g = watermarkOverlayGeometry(600, 400, [], PAD);
    for (const v of [g.size, g.offsetX, g.offsetY, g.cols, g.rows]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(g.cols).toBeGreaterThanOrEqual(1);
    expect(g.rows).toBeGreaterThanOrEqual(1);
  });

  it('tile 總數有上限（極端巨圖不得炸出無上限之 DOM 節點）', () => {
    const g = watermarkOverlayGeometry(60000, 40000, LINES, PAD);
    expect(g.cols * g.rows).toBeLessThanOrEqual(2000);
  });
});
