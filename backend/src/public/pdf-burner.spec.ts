import { PDFDocument, rgb } from 'pdf-lib';
import { PdfLibBurner, toDisplayLines, WATERMARK_RGB, WATERMARK_OPACITY } from './pdf-burner';
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

  /**
   * 🔴 AC-N68（D9 delta，2026-08-20）：三層式呈現契約之新載體——`toDisplayLines(snapshot)`
   * 對同一輸入之回傳**恰為 3 行**（①身分資料列 ②固定機密聲明另起一行 ③時間戳）。
   * 權威：docs/specs/features/F020-watermark.md#d9-watermark-delta `AC-N68`。
   *
   * ⚠ 本檔（backend）僅能驗證「恰 3 行」與「逐行內容正確切分」這半條——AC-N68 另要求
   * 「逐行與前端 `watermarkLines(snapshot)` 之對應行字串相同」，該跨前後端相等性須由
   * frontend 線之 `watermark-lines.test.ts` 補上對稱斷言（本檔不越界驗證前端檔案）。
   */
  it('AC-N68 toDisplayLines：三層式結構固定回傳恰 3 行（①身分資料列 ②機密聲明 ③時間戳，各自獨立一行）', () => {
    const snapshot = `E001-王小明-和潤企業股份有限公司-營運管理部-審查室-${WATERMARK_CONFIDENTIALITY}-2026-07-23 10:00:00 (UTC+8)`;
    const lines = toDisplayLines(snapshot);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('E001-王小明-和潤企業股份有限公司-營運管理部-審查室');
    expect(lines[1]).toBe(WATERMARK_CONFIDENTIALITY);
    expect(lines[2]).toBe('2026-07-23 10:00:00 (UTC+8)');
  });

  it('AC-N68 收合後（處/室留空）之快照亦回恰 3 行，身分資料列本身之內部收合不受影響', () => {
    const snapshot = `E001-王小明-和潤企業股份有限公司-營運管理部-${WATERMARK_CONFIDENTIALITY}-2026-07-23 10:00:00 (UTC+8)`;
    const lines = toDisplayLines(snapshot);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('E001-王小明-和潤企業股份有限公司-營運管理部');
  });
});

/**
 * 🔴 D9 delta（2026-08-20，OQ-D9-01／OQ-D9-31）：浮水印色值加深＋不透明度調整之量化驗收。
 * 權威：docs/specs/features/F020-watermark.md#d9-watermark-delta `AC-N1`／`AC-N2`／`AC-N3`。
 *
 * 🔴 **AC-N3 可測性前提之落點決定（test-generator 之命名決定，非規格明文指名——規格僅稱
 * 「具名匯出常數」，未指名符號）**：本檔（`pdf-burner.ts`）為 AC-N2 表列第 4 列（PDF 燒錄内容層，
 * ＝檢視器所見位元組之唯一來源）之載體檔案，故將色值／不透明度常數落於本檔、以
 * `WATERMARK_RGB`（`pdf-lib` 之 `RGB` 型別，經 `rgb(0.4863, 0.4863, 0.4863)` 建構——逐字取自
 * `AC-N2` 表列後端欄之字面值）與 `WATERMARK_OPACITY`（`number`）兩個具名匯出常數承載。
 * 若 tdd-implementation 認為此符號名或落點不合適，請走 mailbox 向 test-generator 申訴。
 *
 * 📌 對比度計算之合成公式與 WCAG 相對亮度公式逐字取自 `AC-N1` 本文（供測試逐字實作，
 * 避免各自臆造）：`effective = 255 − alpha × (255 − channel)`；
 * `L = 0.2126·R' + 0.7152·G' + 0.0722·B'`；對比度 `= 1.05 / (L + 0.05)`。
 */
describe('D9 delta — 浮水印色值／不透明度（AC-N1／AC-N2／AC-N3，pdf-burner.ts 為 4 個有效載體之一）', () => {
  it('AC-N3 可測性前提：色值與不透明度必須取自具名匯出常數（可 import，非散落於 drawText 呼叫處）', () => {
    expect(WATERMARK_RGB).toBeDefined();
    expect(typeof WATERMARK_OPACITY).toBe('number');
  });

  /**
   * 🔴 2026-08-27 第二輪就地改寫（使用者裁決：比照 `reference/企金撥款作業調整.pdf`）。
   * 該文件之浮水印為全頁點陣疊圖，像素量測得墨跡色 `#7C7C7C`（中性灰）、SMask 峰值 `99/255` ＝ `0.388`。
   * 📝 已作廢（⚠ 不得用於斷言）：OLD> `rgb(0.2, 0.255, 0.3333)` @ 0.30（`#334155`）｜
   *    OLD> `rgb(0.2784, 0.3333, 0.4118)` @ 0.30（`#475569`）。
   */
  it('AC-N2 定稿值逐字為 rgb(0.4863, 0.4863, 0.4863)（＝#7C7C7C）＋ opacity 0.30（🔴 第三輪：再透明一點）', () => {
    expect(WATERMARK_RGB).toEqual(rgb(0.4863, 0.4863, 0.4863));
    expect(WATERMARK_OPACITY).toBe(0.3);
  });

  /** 🔴 負向回歸鎖：第二輪之 0.388 不得殘留（本輪裁決就是「再透明一點」）。 */
  it('🔴 負向回歸鎖：不透明度不得為已作廢之 0.388', () => {
    expect(WATERMARK_OPACITY).not.toBe(0.388);
  });

  /**
   * 🔴 中性灰之定義性斷言：R=G=B。前兩版皆為偏藍之 slate，本輪之裁決重點正是「色相改中性」——
   * 只鎖三個字面值的話，日後有人改成另一個偏色而三值仍「看起來像灰」時不會紅。
   */
  it('🔴 色值必須為中性灰（R === G === B）', () => {
    expect(WATERMARK_RGB.red).toBe(WATERMARK_RGB.green);
    expect(WATERMARK_RGB.green).toBe(WATERMARK_RGB.blue);
  });

  /** 🔴 負向回歸鎖：兩版已作廢之 slate 皆不得殘留。 */
  it('🔴 負向回歸鎖：色值不得為已作廢之 #334155（slate-700）或 #475569（slate-600）', () => {
    expect(WATERMARK_RGB).not.toEqual(rgb(0.2, 0.255, 0.3333));
    expect(WATERMARK_RGB).not.toEqual(rgb(0.2784, 0.3333, 0.4118));
  });

  /**
   * 📝 被推翻之原門檻逐字保留供追溯：OLD> ≥ 3.0（`OQ-D9-31` 前，對應不透明度 0.57）；
   *    OLD> ≥ 1.70（2026-08-20～2026-08-27，對應色值 `#334155` @ 0.30、實算 ≈1.716）。
   * 🔴 **2026-08-27 第三輪：門檻 `1.60` → `1.40`**（使用者裁決「再透明一點」）。
   *    新定稿值 `#7C7C7C` @ `0.30` 實算 ≈**1.429**。
   * ⚠ **這是本門檻的第三次下修**（`3.0` → `1.70` → `1.60` → `1.40`）。門檻的用途是保證浮水印
   *    **仍看得見**（防遮蔽／防抹除之最低可辨識度），每降一次就削弱一次該保證。**下一次再降之前，
   *    請先在真實列印品上確認人眼仍可辨識**——測試只能證明算術，證明不了看不看得見。
   * 🔴 門檻以不等式斷言（≥ 1.40），不得寫成小數點後兩位之相等比較（浮點/四捨五入差異會使等值斷言脆裂）。
   */
  it('AC-N1（🔴 第三輪就地改寫：門檻 1.60→1.40）合成於純白背景之對比度 ≥ 1.40', () => {
    const channels255 = [WATERMARK_RGB.red, WATERMARK_RGB.green, WATERMARK_RGB.blue].map(
      (c) => c * 255,
    );
    const alpha = WATERMARK_OPACITY;
    const effective = channels255.map((c) => 255 - alpha * (255 - c));
    const linearize = (c: number) => {
      const cs = c / 255;
      return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
    };
    const [rLin, gLin, bLin] = effective.map(linearize);
    const L = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
    const contrast = 1.05 / (L + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(1.4);
  });

  it('AC-N1 負向對照：被推翻之舊門檻（3.0）與舊定稿值（opacity 0.57）已不再是現行常數（回歸鎖定門檻不得倒退）', () => {
    // 現行常數之不透明度必須明確小於舊值（0.57），證明本輪確實改動而非殘留舊值。
    expect(WATERMARK_OPACITY).toBeLessThan(0.57);
    expect(WATERMARK_OPACITY).toBeGreaterThan(0); // 非零（仍可見）
  });
});
