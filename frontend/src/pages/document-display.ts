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

/**
 * 統計卡計數（F017 `AC-SC2`，2026-10-06）：有效＝儲存狀態 active 之列數（≡ 已公告＋進度中）、
 * 作廢＝void 之列數；🔴 失效（inactive）不計入任何一張卡。
 * 📝 OLD> 回傳 `{ total, announced, inProgress }`，`total` 為列數（含失效與作廢）。
 */
export function statusCounts(
  docs: DocumentListItem[],
  today: Date,
): { active: number; announced: number; inProgress: number; void: number } {
  let announced = 0;
  let inProgress = 0;
  let voided = 0;
  for (const d of docs) {
    const s = deriveDisplayStatus(d.status, d.announcedDate, today);
    if (s === 'announced') announced++;
    else if (s === 'in_progress') inProgress++;
    else if (s === 'void') voided++;
  }
  return { active: announced + inProgress, announced, inProgress, void: voided };
}
