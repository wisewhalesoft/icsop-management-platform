import type {
  SyncRunSummary,
  SyncRunStatus,
  TriggerType,
  OrgSyncMonthlySummary,
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

/** 僅日期（YYYY-MM-DD，UTC+8）。供「部門關閉日期」顯示（F006 AC8）。 */
export function formatDateOnly(iso: string | null): string {
  return formatDateTime(iso).slice(0, 10);
}

/**
 * 總覽 KPI 四張卡（逐項對齊 prototype 09 之 `KPI` 常數：文案／lucide 圖示／圖示色／底色）。
 * 以純資料保存，使版面與 prototype 之對齊可被單元測試把關。
 */
export interface KpiCard {
  label: string;
  icon: string;
  color: string;
  bg: string;
  value: (s: OrgSyncMonthlySummary) => number;
}

export const KPI_CARDS: readonly KpiCard[] = [
  { label: '新增人員', icon: 'user-plus', color: '#047857', bg: '#D1FAE5', value: (s) => s.newPersonCount },
  { label: '更新（部門/職級）', icon: 'user-cog', color: '#365C97', bg: '#EAF1FA', value: (s) => s.updatedCount },
  { label: '離職停用', icon: 'user-x', color: '#B91C1C', bg: '#FEE2E2', value: (s) => s.departedDisabledCount },
  { label: '當責待確認', icon: 'alert-triangle', color: '#B45309', bg: '#FEF3C7', value: (s) => s.pendingChiefAlertCount },
];
