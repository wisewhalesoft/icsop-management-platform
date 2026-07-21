import { describe, it, expect } from 'vitest';
import {
  trigLabel,
  resultLabel,
  resultTone,
  latestRun,
  hasRunningRun,
  formatDateTime,
} from './org-sync-view';
import type { SyncRunSummary } from '../api/types';

const run = (over: Partial<SyncRunSummary>): SyncRunSummary => ({
  id: 'r',
  triggerType: 'scheduled',
  status: 'success',
  startedAt: '2026-07-15T22:00:00.000Z',
  endedAt: '2026-07-15T22:00:12.000Z',
  changeCount: 12,
  errorCode: null,
  errorMessage: null,
  ...over,
});

describe('org-sync-view — 純檢視邏輯', () => {
  it('trigLabel：manual→手動、scheduled→排程', () => {
    expect(trigLabel('manual')).toBe('手動');
    expect(trigLabel('scheduled')).toBe('排程');
  });

  it('resultLabel / resultTone 對映三態', () => {
    expect(resultLabel('success')).toBe('成功');
    expect(resultLabel('failed')).toBe('失敗');
    expect(resultLabel('running')).toBe('執行中');
    expect(resultTone('success')).toBe('success');
    expect(resultTone('failed')).toBe('danger');
    expect(resultTone('running')).toBe('info');
  });

  it('latestRun：清單為新到舊，取第一筆；空清單→null', () => {
    expect(latestRun([])).toBeNull();
    const runs = [run({ id: 'newest' }), run({ id: 'older' })];
    expect(latestRun(runs)?.id).toBe('newest');
  });

  it('hasRunningRun：任一筆 running → true', () => {
    expect(hasRunningRun([run({ status: 'success' })])).toBe(false);
    expect(hasRunningRun([run({ status: 'running', endedAt: null })])).toBe(true);
  });

  it('formatDateTime：ISO(UTC) → UTC+8 之 YYYY-MM-DD HH:mm:ss；null→空字串', () => {
    // 2026-07-15T22:00:12Z ＝ 台北 2026-07-16 06:00:12
    expect(formatDateTime('2026-07-15T22:00:12.000Z')).toBe('2026-07-16 06:00:12');
    expect(formatDateTime(null)).toBe('');
  });
});
