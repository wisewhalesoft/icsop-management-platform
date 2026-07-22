import { DocumentStatus } from './document-status';

/**
 * 清單/統計卡之衍生顯示狀態（F012/F017）。僅顯示層計算，不另存欄位、不改變儲存之狀態值。
 *  - 有效＋公告日期 ≤ 今日 → 已公告（announced）
 *  - 有效＋公告日期 > 今日 或未填 → 進度中（in_progress）
 *  - 失效/作廢 → 照原樣
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
  announcedDate: Date | string | null,
  today: Date,
): DisplayStatus {
  if (status === 'inactive') return 'inactive';
  if (status === 'void') return 'void';
  // active
  if (!announcedDate) return 'in_progress';
  const d = announcedDate instanceof Date ? announcedDate : new Date(announcedDate);
  return d.getTime() <= today.getTime() ? 'announced' : 'in_progress';
}
