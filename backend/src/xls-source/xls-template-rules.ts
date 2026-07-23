import { BadRequestException } from '@nestjs/common';

/**
 * F027 .xls 模板結構驗證（純規則層；二進位解析出摘要物件屬 [integration]）。
 *
 * 定案（F027 template validation v1，OQ-F027-01 於此收斂為保守寬鬆版）：
 *   - 五標準工作表（icsop-template-analysis §2）須全部存在（子集要求）。
 *   - 每一標準表須帶「標準格式」旗標（per-sheet），名稱∧旗標皆為必要條件。
 *   - 額外工作表允許存在（不硬擋，corpus 變體率 OQ-E09-04 仍開放，寬鬆 + 記錄）。
 *   - 名稱以精確字串相等比對（含前導點 .流程圖）。
 * 不符 → XLS_TEMPLATE_INVALID（400，僅阻擋該次 .xls 上傳，既有 .xls/PDF 不受影響）。
 */
export const STANDARD_SHEET_NAMES = [
  '封面',
  '目錄&目的',
  '.流程圖',
  '作業流程',
  '變更履歷',
] as const;

export interface XlsTemplateSummary {
  /** 解析出之工作表名稱清單。 */
  sheetNames: string[];
  /** 各工作表是否帶「標準格式」旗標（O/P/Q 欄一帶）。 */
  hasStandardFlag: Record<string, boolean>;
}

export interface XlsTemplateResult {
  valid: boolean;
  reason?: string;
}

export function validateXlsTemplate(
  summary: XlsTemplateSummary,
): XlsTemplateResult {
  const present = new Set(summary.sheetNames);
  const missing = STANDARD_SHEET_NAMES.filter((n) => !present.has(n));
  if (missing.length > 0) {
    return { valid: false, reason: `缺少標準工作表：${missing.join('、')}` };
  }
  const noFlag = STANDARD_SHEET_NAMES.filter(
    (n) => summary.hasStandardFlag[n] !== true,
  );
  if (noFlag.length > 0) {
    return { valid: false, reason: `工作表缺少標準格式旗標：${noFlag.join('、')}` };
  }
  return { valid: true };
}

export function assertXlsTemplateValid(summary: XlsTemplateSummary): void {
  const result = validateXlsTemplate(summary);
  if (!result.valid) {
    throw new BadRequestException(`XLS_TEMPLATE_INVALID: ${result.reason}`);
  }
}
