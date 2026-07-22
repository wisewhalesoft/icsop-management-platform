/**
 * ICSOP 文件狀態（F012）。內部以英文碼儲存，UI 顯示中文標籤（有效/失效/作廢）。
 * 清單另有衍生顯示（有效＋公告日期已過→已公告、未到→進度中），不另存值。
 */
export type DocumentStatus = 'active' | 'inactive' | 'void';

export const DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  'active',
  'inactive',
  'void',
];

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  active: '有效',
  inactive: '失效',
  void: '作廢',
};

export function isValidStatus(s: string): s is DocumentStatus {
  return (DOCUMENT_STATUSES as readonly string[]).includes(s);
}

/**
 * 該狀態是否「佔用」文件編號（F013／OQ-E04-01b）：
 * 有效＋作廢佔用；失效視為已釋出、不參與唯一性比對。
 */
export function statusOccupiesNumber(s: DocumentStatus): boolean {
  return s === 'active' || s === 'void';
}
