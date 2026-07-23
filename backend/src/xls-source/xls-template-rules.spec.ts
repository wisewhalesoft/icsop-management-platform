import {
  STANDARD_SHEET_NAMES,
  validateXlsTemplate,
  assertXlsTemplateValid,
  XlsTemplateSummary,
} from './xls-template-rules';

/** 供測試建立「全部合格」摘要（5 標準表齊全 + 全部標準格式旗標）。 */
const validSummary = (over: Partial<XlsTemplateSummary> = {}): XlsTemplateSummary => ({
  sheetNames: [...STANDARD_SHEET_NAMES],
  hasStandardFlag: Object.fromEntries(STANDARD_SHEET_NAMES.map((n) => [n, true])),
  ...over,
});

describe('xls-template-rules（F027 模板結構驗證，純規則）', () => {
  it('標準五表定義（icsop-template-analysis §2，含前導點 .流程圖）', () => {
    expect(STANDARD_SHEET_NAMES).toEqual([
      '封面',
      '目錄&目的',
      '.流程圖',
      '作業流程',
      '變更履歷',
    ]);
  });

  it('五表齊全 + 全部旗標 → valid', () => {
    expect(validateXlsTemplate(validSummary()).valid).toBe(true);
  });

  it('缺「變更履歷」（僅 4 表）→ invalid（名稱集合不符）', () => {
    const summary = validSummary({
      sheetNames: ['封面', '目錄&目的', '.流程圖', '作業流程'],
    });
    expect(validateXlsTemplate(summary).valid).toBe(false);
  });

  it('五表齊全但「封面」缺標準格式旗標 → invalid（推論規則：名稱∧旗標皆必要）', () => {
    const summary = validSummary({
      hasStandardFlag: {
        ...Object.fromEntries(STANDARD_SHEET_NAMES.map((n) => [n, true])),
        封面: false,
      },
    });
    expect(validateXlsTemplate(summary).valid).toBe(false);
  });

  it('含額外工作表但五標準表齊全 + 旗標齊 → valid（保守寬鬆：允許額外表，不硬擋）', () => {
    const summary = validSummary({
      sheetNames: [...STANDARD_SHEET_NAMES, '附錄'],
    });
    expect(validateXlsTemplate(summary).valid).toBe(true);
  });

  it('assertXlsTemplateValid：不合格 → 拋 XLS_TEMPLATE_INVALID（附原因）', () => {
    const summary = validSummary({ sheetNames: ['封面'] });
    expect(() => assertXlsTemplateValid(summary)).toThrow('XLS_TEMPLATE_INVALID');
  });

  it('assertXlsTemplateValid：合格 → 不拋', () => {
    expect(() => assertXlsTemplateValid(validSummary())).not.toThrow();
  });
});
