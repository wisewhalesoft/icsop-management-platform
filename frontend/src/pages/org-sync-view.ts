import type {
  SyncRunSummary,
  SyncRunStatus,
  TriggerType,
} from '../api/types';

/** 觸發方式標籤。 */
export function trigLabel(t: TriggerType): '手動' | '排程' {
  return t === 'manual' ? '手動' : '排程';
}

/** 結果標籤。 */
export function resultLabel(s: SyncRunStatus): '成功' | '失敗' | '執行中' {
  if (s === 'success') return '成功';
  if (s === 'failed') return '失敗';
  return '執行中';
}

export type Tone = 'success' | 'danger' | 'info';

/** 結果色調（對映設計系統徽章色）。 */
export function resultTone(s: SyncRunStatus): Tone {
  if (s === 'success') return 'success';
  if (s === 'failed') return 'danger';
  return 'info';
}

/** 最近一次同步（清單為新到舊）。 */
export function latestRun(runs: SyncRunSummary[]): SyncRunSummary | null {
  return runs[0] ?? null;
}

/** 是否有進行中同步（決定是否持續輪詢）。 */
export function hasRunningRun(runs: SyncRunSummary[]): boolean {
  return runs.some((r) => r.status === 'running');
}

const TAIPEI_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * ISO（UTC）→ UTC+8 之 'YYYY-MM-DD HH:mm:ss'。null → 空字串。
 * 固定以 Asia/Taipei 呈現（與浮水印/稽核時間之時區一致），不隨機器時區飄移。
 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const parts = TAIPEI_FMT.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
