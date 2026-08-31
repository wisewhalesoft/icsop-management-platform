import { describe, it, expect } from 'vitest';
import {
  trigLabel,
  resultLabel,
  resultTone,
  latestRun,
  hasRunningRun,
  formatDateTime,
  formatDateOnly,
  KPI_CARDS,
} from './org-sync-view';
import type { SyncRunSummary } from '../api/types';

const run = (over: Partial<SyncRunSummary>): SyncRunSummary => ({
  id: 'r',
  compid: 'AS',
  triggerType: 'scheduled',
  status: 'success',
  startedAt: '2026-07-15T22:00:00.000Z',
  endedAt: '2026-07-15T22:00:12.000Z',
  changeCount: 12,
  errorCode: null,
  errorMessage: null,
  roleDerivationSkipped: false,
  roleChangeCount: null,
  roleDerivationBase: null,
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

  it('formatDateOnly：ISO → UTC+8 之 YYYY-MM-DD；null→空字串（部門關閉日期顯示用）', () => {
    expect(formatDateOnly('2026-03-31T00:00:00.000Z')).toBe('2026-03-31');
    expect(formatDateOnly(null)).toBe('');
  });

  it('KPI_CARDS：逐項對齊 prototype 09 之四張卡（順序/文案/圖示）', () => {
    expect(KPI_CARDS.map((c) => [c.label, c.icon])).toEqual([
      ['新增人員', 'user-plus'],
      ['更新（部門/職級）', 'user-cog'],
      ['離職停用', 'user-x'],
      ['當責待確認', 'alert-triangle'],
    ]);
    // 每張卡皆有 prototype 指定之圖示色與底色
    for (const c of KPI_CARDS) {
      expect(c.color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.bg).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('KPI_CARDS.value：自 monthly-summary 取對應數字', () => {
    const summary = {
      month: '2026-07',
      newPersonCount: 18,
      updatedCount: 31,
      departedDisabledCount: 4,
      pendingChiefAlertCount: 3,
    };
    expect(KPI_CARDS.map((c) => c.value(summary))).toEqual([18, 31, 4, 3]);
  });
});
