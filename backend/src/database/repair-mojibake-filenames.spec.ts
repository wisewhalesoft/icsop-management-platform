import { repairMojibake } from './repair-mojibake-filenames';

/** 模擬 multer 以 latin1 誤解 UTF-8 檔名（與遠端環境實際落地之亂碼同一機制）。 */
const garble = (s: string): string => Buffer.from(s, 'utf8').toString('latin1');

/**
 * 亂碼判定純函式單測：真亂碼要還原、正常字串一律不動（誤傷成本高於漏修）。
 */
describe('repairMojibake', () => {
  it.each([
    '4. 台灣企業永續資訊管理作業程序.pdf',
    '各資料袋文件ISO清單.pdf',
    "ICSOP-GCA-100-1-00 _ICSOP管理作業程序書(26'01).pdf",
  ])('latin1 誤解之「%s」→ 還原為原字串', (original) => {
    const garbled = garble(original);
    expect(garbled).not.toBe(original); // 前提：樣本確實被誤解過
    expect(repairMojibake(garbled)).toBe(original);
  });

  it('已正確之中文檔名 → null（不動；本腳本重跑冪等）', () => {
    expect(repairMojibake('各資料袋文件ISO清單.pdf')).toBeNull();
    expect(repairMojibake("ICSOP-GCA-122-1-00 永續報告書編製作業程序書(26'01).pdf")).toBeNull();
  });

  it('純 ASCII／空字串 → null', () => {
    expect(repairMojibake('zzint-sop.pdf')).toBeNull();
    expect(repairMojibake('')).toBeNull();
  });

  it('latin1 可表示但不是有效 UTF-8 位元組序列 → null（不硬解）', () => {
    expect(repairMojibake('Café ½ résumé.pdf')).toBeNull();
  });

  it('修補結果再跑一次 → null（不會二次解碼壞掉）', () => {
    const once = repairMojibake(garble('潤餅企業永續報告書.pdf'));
    expect(once).toBe('潤餅企業永續報告書.pdf');
    expect(repairMojibake(once!)).toBeNull();
  });
});
