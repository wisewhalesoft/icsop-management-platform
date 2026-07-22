import type { DocumentListItem, DocumentStatus } from '../api/types';

/**
 * 前端衍生顯示狀態（F012/F017）。mirror 後端 display-status.ts。
 * 有效＋公告日期≤今日→已公告、>今日或未填→進度中；失效/作廢照原樣。
 */
export type DisplayStatus = 'announced' | 'in_progress' | 'inactive' | 'void';

export const DISPLAY_LABEL: Record<DisplayStatus, string> = {
  announced: '已公告',
  in_progress: '進度中',
  inactive: '失效',
  void: '作廢',
};

export function deriveDisplayStatus(
  status: DocumentStatus,
  announcedDate: string | null,
  today: Date,
): DisplayStatus {
  if (status === 'inactive') return 'inactive';
  if (status === 'void') return 'void';
  if (!announcedDate) return 'in_progress';
  return new Date(announcedDate).getTime() <= today.getTime() ? 'announced' : 'in_progress';
}

export function statusCounts(
  docs: DocumentListItem[],
  today: Date,
): { total: number; announced: number; inProgress: number } {
  let announced = 0;
  let inProgress = 0;
  for (const d of docs) {
    const s = deriveDisplayStatus(d.status, d.announcedDate, today);
    if (s === 'announced') announced++;
    else if (s === 'in_progress') inProgress++;
  }
  return { total: docs.length, announced, inProgress };
}
