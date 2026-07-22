import { DocumentStatus, statusOccupiesNumber } from './document-status';

/** F010 定案：建立時 4 核心必填。 */
export const REQUIRED_FIELDS = [
  'lifecycleId',
  'status',
  'documentNumber',
  'documentName',
] as const;

/** 回傳缺漏之必填欄名（空白/undefined 視為缺）。空陣列＝齊備。 */
export function missingRequired(payload: Record<string, unknown>): string[] {
  return REQUIRED_FIELDS.filter((f) => {
    const v = payload[f];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
}

/** 唯一性比對之最小資訊（現存文件之編號、狀態、id）。 */
export interface NumberHolder {
  id: string;
  documentNumber: string;
  status: DocumentStatus;
}

/**
 * F013：編號是否可用。比對範圍＝「佔用編號」之狀態（有效＋作廢）；失效釋出不參與。
 * 編輯時傳 selfId 排除自身（維持原值不視為衝突）。
 */
export function isNumberAvailable(
  documentNumber: string,
  holders: NumberHolder[],
  selfId?: string,
): boolean {
  return !holders.some(
    (h) =>
      h.documentNumber === documentNumber &&
      statusOccupiesNumber(h.status) &&
      h.id !== selfId,
  );
}
