import { deriveDisplayStatus, DISPLAY_LABEL } from './display-status';

const today = new Date('2026-07-22T10:00:00Z');

describe('deriveDisplayStatus（F012/F017 衍生顯示）', () => {
  it('失效/作廢 → 照原樣', () => {
    expect(deriveDisplayStatus('inactive', null, today)).toBe('inactive');
    expect(deriveDisplayStatus('void', null, today)).toBe('void');
  });

  it('有效＋公告日期已過（≤今日）→ 已公告', () => {
    expect(deriveDisplayStatus('active', new Date('2026-07-01T00:00:00Z'), today)).toBe('announced');
  });

  it('有效＋公告日期當日 → 已公告（採 ≤ 今日）', () => {
    expect(deriveDisplayStatus('active', new Date('2026-07-22T00:00:00Z'), today)).toBe('announced');
  });

  it('有效＋公告日期未到（>今日）→ 進度中', () => {
    expect(deriveDisplayStatus('active', new Date('2026-08-01T00:00:00Z'), today)).toBe('in_progress');
  });

  it('有效＋未填公告日期 → 進度中', () => {
    expect(deriveDisplayStatus('active', null, today)).toBe('in_progress');
  });

  it('DISPLAY_LABEL 中文標籤', () => {
    expect(DISPLAY_LABEL.announced).toBe('已公告');
    expect(DISPLAY_LABEL.in_progress).toBe('進度中');
    expect(DISPLAY_LABEL.inactive).toBe('失效');
    expect(DISPLAY_LABEL.void).toBe('作廢');
  });
});
