import { PDFDocument } from 'pdf-lib';
import { PdfLibBurner, toDisplayLines } from './pdf-burner';
import { asciiSafe, loadCjkFontBytes } from './fonts/cjk-font';
import { WATERMARK_CONFIDENTIALITY } from './watermark';

/**
 * F020/F036 CJK 浮水印燒錄 smoke（pdf-lib + @pdf-lib/fontkit + Noto Sans TC）。
 *
 * 核心迴歸：真實中文浮水印字串「燒錄不拋例外」。既有 bug＝退化路徑以 '□'（U+25A1）佔位，
 * 而 '□' 本身 WinAnsi 不可編碼 → 退化時反而拋 `WinAnsi cannot encode` — 本 spec 兩路徑（CJK 嵌入 /
 * ASCII 退化）皆斷言不拋。真實中文位元組層視覺／效能驗證仍屬 [integration]（不在此）。
 */
async function makeBlankPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]); // A4
  return Buffer.from(await pdf.save());
}

const CJK_SNAPSHOT = `和潤企業股份有限公司-債權管理部/法催一室-王小明(A12345)-2026-07-23 10:00:00-${WATERMARK_CONFIDENTIALITY}`;

describe('PdfLibBurner（F020 CJK 浮水印燒錄）', () => {
  it('CJK 字型嵌入路徑：真實中文浮水印燒錄 → 不拋、產出有效 PDF', async () => {
    const original = await makeBlankPdf();
    const burner = new PdfLibBurner(); // 預設 loadCjkFontBytes()（資產存在→CJK 嵌入）
    const out = await burner.burnPdf(original, CJK_SNAPSHOT);
    expect(out.length).toBeGreaterThan(0);
    expect(out.subarray(0, 5).toString()).toBe('%PDF-');
    // 燒錄後檔案不應內嵌整份 7MB 字型（子集化）——遠小於原始字型大小。
    expect(out.length).toBeLessThan(2 * 1024 * 1024);
  });

  it('ASCII 退化路徑（無 CJK 字型）：中文浮水印仍燒錄不拋（U+25A1 佔位 bug 迴歸守門）', async () => {
    const original = await makeBlankPdf();
    const burner = new PdfLibBurner(null); // 強制退化 Helvetica + asciiSafe
    const out = await burner.burnPdf(original, CJK_SNAPSHOT);
    expect(out.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('資產可載入（部署完整性）：loadCjkFontBytes 回傳非空 Buffer', () => {
    const bytes = loadCjkFontBytes();
    expect(bytes).not.toBeNull();
    expect((bytes as Buffer).length).toBeGreaterThan(1024 * 1024); // 真實 CJK 字型為數 MB
  });

  it('asciiSafe：非可列印 ASCII → 問號（WinAnsi 可編碼，不含 U+25A1）', () => {
    expect(asciiSafe('和潤 A-1')).toBe('?? A-1');
    expect(asciiSafe('和潤')).not.toContain('□');
  });

  it('toDisplayLines：機密聲明獨立一行', () => {
    const lines = toDisplayLines(`身分快照-${WATERMARK_CONFIDENTIALITY}`);
    expect(lines).toContain(WATERMARK_CONFIDENTIALITY);
  });
});
