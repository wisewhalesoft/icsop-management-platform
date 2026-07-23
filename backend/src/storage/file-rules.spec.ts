import {
  MAX_FILE_SIZE_BYTES,
  assertFormatAllowed,
  assertSizeWithinLimit,
  ALLOWED_FORMATS,
} from './file-rules';

/**
 * F016/F018/F027 共用之純檔案規則層（格式白名單 + 大小上限）。
 * 不需真實位元組，以 { fileName, contentType, size } 中繼資料驅動（OQ-E04-06/OQ-E05-02 定案值）。
 */
describe('file-rules（格式白名單 + 大小上限，純規則）', () => {
  describe('assertSizeWithinLimit（≤50MB，含邊界）', () => {
    it('恰為 50MB → 通過', () => {
      expect(() => assertSizeWithinLimit(MAX_FILE_SIZE_BYTES)).not.toThrow();
    });
    it('50MB + 1 byte → FILE_SIZE_EXCEEDED', () => {
      expect(() => assertSizeWithinLimit(MAX_FILE_SIZE_BYTES + 1)).toThrow(
        'FILE_SIZE_EXCEEDED',
      );
    });
    it('MAX 常數＝50*1024*1024', () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(50 * 1024 * 1024);
    });
  });

  describe('assertFormatAllowed — ICSOP_PDF（僅 pdf）', () => {
    it('pdf → 通過', () => {
      expect(() =>
        assertFormatAllowed('ICSOP_PDF', {
          fileName: 'a.pdf',
          contentType: 'application/pdf',
        }),
      ).not.toThrow();
    });
    it('jpg（ICSOP PDF 不接受圖片）→ FILE_FORMAT_NOT_ALLOWED', () => {
      expect(() =>
        assertFormatAllowed('ICSOP_PDF', {
          fileName: 'a.jpg',
          contentType: 'image/jpeg',
        }),
      ).toThrow('FILE_FORMAT_NOT_ALLOWED');
    });
    it('exe → FILE_FORMAT_NOT_ALLOWED', () => {
      expect(() =>
        assertFormatAllowed('ICSOP_PDF', {
          fileName: 'malware.exe',
          contentType: 'application/x-msdownload',
        }),
      ).toThrow('FILE_FORMAT_NOT_ALLOWED');
    });
  });

  describe('assertFormatAllowed — OJT_SIGNIN（pdf/jpg/png）', () => {
    it.each(['a.pdf', 'a.jpg', 'a.jpeg', 'a.png', 'A.PNG'])(
      '%s → 通過',
      (fileName) => {
        expect(() =>
          assertFormatAllowed('OJT_SIGNIN', { fileName, contentType: 'x' }),
        ).not.toThrow();
      },
    );
    it('docx → FILE_FORMAT_NOT_ALLOWED', () => {
      expect(() =>
        assertFormatAllowed('OJT_SIGNIN', {
          fileName: 'a.docx',
          contentType: 'x',
        }),
      ).toThrow('FILE_FORMAT_NOT_ALLOWED');
    });
  });

  describe('assertFormatAllowed — USAGE_FORM（xlsx/xls/pdf）', () => {
    it.each(['a.xlsx', 'a.xls', 'a.pdf'])('%s → 通過', (fileName) => {
      expect(() =>
        assertFormatAllowed('USAGE_FORM', { fileName, contentType: 'x' }),
      ).not.toThrow();
    });
    it('docx → FILE_FORMAT_NOT_ALLOWED', () => {
      expect(() =>
        assertFormatAllowed('USAGE_FORM', {
          fileName: 'a.docx',
          contentType: 'x',
        }),
      ).toThrow('FILE_FORMAT_NOT_ALLOWED');
    });
  });

  describe('assertFormatAllowed — XLS_SOURCE（僅 .xls，排除 .xlsx）', () => {
    it('xls → 通過', () => {
      expect(() =>
        assertFormatAllowed('XLS_SOURCE', {
          fileName: 'a.xls',
          contentType: 'application/vnd.ms-excel',
        }),
      ).not.toThrow();
    });
    it('xlsx（即便內容五表相符）→ FILE_FORMAT_NOT_ALLOWED（非 XLS_TEMPLATE_INVALID）', () => {
      expect(() =>
        assertFormatAllowed('XLS_SOURCE', {
          fileName: 'a.xlsx',
          contentType: 'x',
        }),
      ).toThrow('FILE_FORMAT_NOT_ALLOWED');
    });
    it.each(['a.csv', 'a.docx'])('%s → FILE_FORMAT_NOT_ALLOWED', (fileName) => {
      expect(() =>
        assertFormatAllowed('XLS_SOURCE', { fileName, contentType: 'x' }),
      ).toThrow('FILE_FORMAT_NOT_ALLOWED');
    });
  });

  it('ALLOWED_FORMATS 曝露各類別允許副檔名清單（供錯誤訊息附帶）', () => {
    expect(ALLOWED_FORMATS.ICSOP_PDF).toEqual(['pdf']);
    expect(ALLOWED_FORMATS.OJT_SIGNIN).toEqual(['pdf', 'jpg', 'jpeg', 'png']);
    expect(ALLOWED_FORMATS.USAGE_FORM).toEqual(['xlsx', 'xls', 'pdf']);
    expect(ALLOWED_FORMATS.XLS_SOURCE).toEqual(['xls']);
  });
});
