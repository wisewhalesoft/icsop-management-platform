import { describe, it, expect } from 'vitest';
import { beginPan, panScroll, panExceeded, PAN_CLICK_THRESHOLD } from './tree-pan';

describe('tree-pan — 樹狀圖拖曳平移之位移算式', () => {
  const origin = beginPan(500, 300, 200, 100);

  it('指標往右移 ⇒ 捲動位置往左（抓住畫布拖，而非拖捲軸）', () => {
    expect(panScroll(origin, 560, 300)).toEqual({ scrollLeft: 140, scrollTop: 100 });
  });

  it('指標往左移 ⇒ 捲動位置往右', () => {
    expect(panScroll(origin, 440, 300)).toEqual({ scrollLeft: 260, scrollTop: 100 });
  });

  it('兩軸同時平移', () => {
    expect(panScroll(origin, 450, 250)).toEqual({ scrollLeft: 250, scrollTop: 150 });
  });

  it('往左拖到底不累積負債（夾回 0，放手後往回拖立刻有反應）', () => {
    expect(panScroll(origin, 5000, 5000)).toEqual({ scrollLeft: 0, scrollTop: 0 });
  });

  it('門檻內之微幅位移不算拖曳（點擊仍應生效）', () => {
    expect(panExceeded(origin, 500 + PAN_CLICK_THRESHOLD, 300)).toBe(false);
    expect(panExceeded(origin, 500, 300 - PAN_CLICK_THRESHOLD)).toBe(false);
  });

  it('任一軸超過門檻即算拖曳', () => {
    expect(panExceeded(origin, 500 + PAN_CLICK_THRESHOLD + 1, 300)).toBe(true);
    expect(panExceeded(origin, 500, 300 + PAN_CLICK_THRESHOLD + 1)).toBe(true);
  });
});
