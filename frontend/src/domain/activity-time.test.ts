import { describe, it, expect } from 'vitest';
import { activityTimeLabel } from './activity-time';

/** 以本地時間建構後轉 ISO：測試不因執行機時區而異。 */
const at = (h: number, m: number, day = 27): string =>
  new Date(2026, 7, day, h, m, 0).toISOString();

const NOW = new Date(2026, 7, 27, 14, 30, 0);
const label = (iso: string): string => activityTimeLabel(iso, NOW);

describe('activityTimeLabel（prototype 07 ACTIVITY 時間欄）', () => {
  it('未滿 1 分鐘 → 剛剛；未來時間（時鐘偏差）同樣收斂為剛剛', () => {
    expect(label(at(14, 30))).toBe('剛剛');
    expect(label(at(15, 0))).toBe('剛剛');
  });

  it('未滿 1 小時 → N 分鐘前', () => {
    expect(label(at(14, 5))).toBe('25 分鐘前');
  });

  it('同日且未滿 6 小時 → N 小時前（prototype「2 小時前」）', () => {
    expect(label(at(12, 30))).toBe('2 小時前');
  });

  it('同日但已逾 6 小時 → 今日 HH:mm（prototype「今日 06:00」）', () => {
    expect(label(at(6, 0))).toBe('今日 06:00');
  });

  it('前一日 → 昨日 HH:mm（prototype「昨日 22:14」）', () => {
    expect(label(at(22, 14, 26))).toBe('昨日 22:14');
  });

  it('更早 → YYYY-MM-DD HH:mm', () => {
    expect(label(at(9, 5, 20))).toBe('2026-08-20 09:05');
  });

  it('無效時間戳 → —（不輸出 Invalid Date）', () => {
    expect(label('')).toBe('—');
    expect(label('not-a-date')).toBe('—');
  });
});
