import { resolveCompanyName, COMPANY_FULL_NAMES } from './company-name';

/**
 * 公司全稱解析（org-foundation）。對應 ORG-COMPANY-sync-test.md 之消費端 TS-COMPANY-009/010。
 *
 * ⚠ 定案（覆寫 test-spec 之 VW_HRCOMF 同步假設）：上游全專案無公司全稱來源（portalapp-sp 佐證），
 *   採靜態 COMPID→全稱 對映（AS＝和潤企業股份有限公司，與 prototype 14 COMPANY_NAME 一致）。
 *   多公司時再改為設定表／上游。故不建 COMPANY 實體、不做 VW_HRCOMF 同步。
 */
describe('resolveCompanyName（靜態 COMPID→全稱）', () => {
  it('TS-COMPANY-009 AS → 和潤企業股份有限公司', () => {
    expect(resolveCompanyName('AS')).toBe('和潤企業股份有限公司');
  });

  it('前後空白容忍', () => {
    expect(resolveCompanyName('  AS  ')).toBe('和潤企業股份有限公司');
  });

  it('TS-COMPANY-010 查無公司代碼 → null（不拋錯）', () => {
    expect(resolveCompanyName('ZZ')).toBeNull();
  });

  it('null / undefined / 空字串 → null', () => {
    expect(resolveCompanyName(null)).toBeNull();
    expect(resolveCompanyName(undefined)).toBeNull();
    expect(resolveCompanyName('')).toBeNull();
  });

  it('對映表含 AS（供 F020 浮水印公司欄）', () => {
    expect(COMPANY_FULL_NAMES.AS).toBe('和潤企業股份有限公司');
  });
});
