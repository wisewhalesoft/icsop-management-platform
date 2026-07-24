import { PDFDocument } from 'pdf-lib';
import { PdfLibBurner } from '../../src/public/pdf-burner';
import {
  __resetCjkFontCache,
  loadCjkFontBytes,
} from '../../src/public/fonts/cjk-font';
import { WATERMARK_CONFIDENTIALITY } from '../../src/public/watermark';

/**
 * [int] F020 浮水印燒錄 <3 秒計時驗證。對應 hardening-test-design.md §1（TS-HD-WM-001／002），
 * 具體化取代 F020-test.md 之 TS-F020-028（原「頁數/大小依 OQ-E04-06 待定上限」佔位）。
 *
 * ⚠ 純驗證性測試——不改動任何燒錄程式碼（pdf-burner.ts／fonts/cjk-font.ts 不變）。
 *
 * NFR 依據（nfr.md#performance）：「PDF 下載額外處理（含浮水印燒錄）< 3 秒」，量測方法明文即
 * 「端到端計時」（非 k6/JMeter P95）。本檔即該量測方法之直接對應驗證，較 audit-query TS-017 之
 * P95 情境更貼近 NFR 原始定義。
 *
 * ⚠ 定位（比照 audit-query-test-design.md TS-017 之聲明手法）：
 *  - 本斷言門檻 `< 8000ms` **刻意寬於** NFR 目標值 `< 3000ms`（約 2.7 倍餘裕），作為迴歸警戒線
 *    （regression tripwire），非產品 SLA。理由：開發機／CI runner 非正式部署硬體，ts-jest transform／
 *    Node 啟動／主機潛在其他負載皆可能引入延遲雜訊；`8000ms` 對「正常燒錄」有充裕餘裕、對「量級退化」
 *    （如不慎移除子集化、逐字元重載 7MB 字型、引入 O(n²) 邏輯）仍具攔截力。
 *  - 本測試**仍只是單次、無併發之樣本**，不涵蓋效能表同列「並發使用者 ≥500」情境下之資源競爭，
 *    亦非正式 SLA／負載合規證明；「多位使用者同時下載仍 <3 秒」之保證需另行負載測試（k6/JMeter）。
 *  - `8000ms` 不代表產品可接受 8 秒燒錄——實際產品 SLA 仍為 nfr.md 之 `<3 秒`；若人類落地後實測穩定
 *    遠低於門檻，可依實測收斂門檻（如降至 3000ms 直接對齊 NFR）。
 *
 * 歸類 .itest.ts（不隨單元套件執行）之理由：計時類斷言具 flakiness 風險，宜與大量 unit 測試隔離，
 * 於序列化（maxWorkers:1）之 int 執行層獨立運行，避免並行 worker 搶 CPU 而假紅。
 */

const REGRESSION_TRIPWIRE_MS = 8000; // 迴歸警戒線（NFR 目標 3000ms 之 ~2.7 倍餘裕，非 SLA）
const REPRESENTATIVE_PAGES = 10; // 多頁代表性程序書（保守代表值；頁數僅影響 drawText 迴圈次數）

/** 沿用 pdf-burner.spec.ts 之真實中文格式浮水印快照（走真實 CJK 字型嵌入路徑，cjk===true）。 */
const CJK_SNAPSHOT = `和潤企業股份有限公司-債權管理部/法催一室-王小明(A12345)-2026-07-23 10:00:00-${WATERMARK_CONFIDENTIALITY}`;

/** 以 pdf-lib 動態產生 N 頁 A4 空白 PDF（不檢入二進位 fixture；確定性同輸入同結構）。 */
async function makeMultiPagePdf(pages: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([595, 842]); // A4
  return Buffer.from(await pdf.save());
}

/** 量測單次 burnPdf() 呼叫耗時（毫秒），以 hrtime.bigint 排除系統時鐘校正影響。 */
async function timeBurn(
  burner: PdfLibBurner,
  input: Buffer,
): Promise<{ out: Buffer; ms: number }> {
  const t0 = process.hrtime.bigint();
  const out = await burner.burnPdf(input, CJK_SNAPSHOT);
  const t1 = process.hrtime.bigint();
  return { out, ms: Number(t1 - t0) / 1e6 };
}

/** 有效性 smoke（非取代 TS-F020-027 之完整內容抽取驗證）：magic bytes + 可重解析 + 有內容 + 已子集化。 */
async function assertValidBurnedPdf(out: Buffer, input: Buffer): Promise<void> {
  expect(out.subarray(0, 5).toString()).toBe('%PDF-'); // 有效 PDF magic bytes
  await expect(PDFDocument.load(out)).resolves.toBeDefined(); // 可被 pdf-lib 重新解析（不拋）
  expect(out.length).toBeGreaterThan(input.length); // 確有內容寫入（非靜默無操作）
  expect(out.length).toBeLessThan(5 * 1024 * 1024); // 子集化：不內嵌整份 7MB 字型
}

describe('[int] F020 浮水印燒錄計時（真實 pdf-lib + Noto Sans TC CJK）', () => {
  beforeAll(() => {
    // 部署完整性前置：字型資產須存在，否則走 ASCII 退化路徑（耗時特性不同、非本 NFR 關心路徑）。
    expect(loadCjkFontBytes()).not.toBeNull();
  });

  it('TS-HD-WM-001 暖機後之 10 頁 CJK 燒錄 → 有效 PDF 且耗時低於迴歸警戒線', async () => {
    const fixture = await makeMultiPagePdf(REPRESENTATIVE_PAGES);
    const burner = new PdfLibBurner(); // 預設 loadCjkFontBytes()（不注入假體）

    // 暖機一次（不計時）：強制字型模組快取就緒，量測穩態（貼近使用者實際下載體驗）。
    await burner.burnPdf(fixture, CJK_SNAPSHOT);

    // 量測第二次（暖機後）。
    const { out, ms } = await timeBurn(burner, fixture);

    await assertValidBurnedPdf(out, fixture);
    // eslint-disable-next-line no-console
    console.log(`[TS-HD-WM-001] 暖機後 ${REPRESENTATIVE_PAGES} 頁 CJK 燒錄耗時：${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(REGRESSION_TRIPWIRE_MS);
  });

  it('TS-HD-WM-002 冷啟動（字型快取重置）之首次燒錄 → 仍有效且低於同一警戒線', async () => {
    __resetCjkFontCache(); // 模擬伺服器重啟後第一位使用者（字型快取冷）
    const fixture = await makeMultiPagePdf(REPRESENTATIVE_PAGES);
    const burner = new PdfLibBurner(); // 構造時即冷讀 7MB 字型檔案

    const { out, ms } = await timeBurn(burner, fixture);

    await assertValidBurnedPdf(out, fixture);
    // eslint-disable-next-line no-console
    console.log(`[TS-HD-WM-002] 冷啟動 ${REPRESENTATIVE_PAGES} 頁 CJK 燒錄耗時：${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(REGRESSION_TRIPWIRE_MS);
  });
});
