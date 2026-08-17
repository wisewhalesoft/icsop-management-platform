import { inflateSync } from 'zlib';
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import { PdfLibBurner } from './pdf-burner';
import { loadCjkFontBytes } from './fonts/cjk-font';
import { WATERMARK_CONFIDENTIALITY } from './watermark';
import { PdfLibTreeRenderer } from '../lifecycle/lifecycle-tree-pdf';
import { PdfLibChangeHistoryTreeRenderer } from '../lifecycle/lifecycle-change-history-pdf';
import { buildTreeLayout } from '../lifecycle/lifecycle-tree-layout';

/**
 * 🔴 伺服器端 PDF 產物之【字形輪廓完整性】約束
 * 權威：docs/test-specs/risks-and-gaps.md#pdf-glyph-integrity（缺陷經過、實證數據、涵蓋邊界）
 *
 * ── 這條約束為什麼存在 ────────────────────────────────────────────────
 * 2026-08-16 delta 有一個缺陷【穿過了整個約束環】，由使用者肉眼在最終驗收時發現：
 * 伺服器端產生／燒錄之 PDF 中文大量缺字（「薪工循環 - 循環樹狀圖」→「環 -　環樹」），
 * 浮水印與文件本文皆然。根因為 `@pdf-lib/fontkit@1.1.1` TTFSubset 之短 loca 截斷
 * （長 loca 字型之奇數位移被 `>>>= 1` 無聲截掉 1 byte，自第一個奇長度字形起邊界全錯位）。
 *
 * 環當時全綠，因為【所有】相關測試斷言的都只有兩件事：
 *   ① `burnPdf` 有沒有被呼叫（次數／參數）  ② 快照字串內容逐字對不對
 * 缺陷發生時這兩件事【全部成立】——字型有嵌入、無 Helvetica 退回、ToUnicode 完全正確。
 * 錯的是那串正確字元被畫成什麼形狀。**「服務被呼叫了」與「產物真的可讀」是兩件事。**
 *
 * ── 🔴 為什麼不能用 pdftotext 驗（別再走回頭路）────────────────────────
 * 舊有之驗收步驟為 `pdftotext f - | grep 僅供內部使用`。**已實證無效，兩個方向都是死路**：
 *   · 照原文寫（無 `-enc UTF-8`）：破損＝0、**正常也＝0** ⇒ 恆紅、永不可滿足
 *   · 加上 `-enc UTF-8`（任何人都會這樣「修好」它）：破損＝1、正常＝1 ⇒ 🔴 **假綠**
 * ⚠ **修那條檢查的動作本身，就會製造出假綠。**
 * 結構性理由：`ToUnicode` CMap 與 `FontFile2` 字形程式是 PDF 中【兩個獨立 indirect object】，
 * 摧毀 `loca`／`glyf` 完全不會動到文字層。⇒ 任何以文字抽取為基礎之檢查，
 * **原理上**都看不到這一類缺陷。故本檔改為直接重新解析【嵌入子集之輪廓】。
 *
 * ── 🔒 主斷言為「不得拋錯」，而非「每個字形非空」────────────────────────
 * **空輪廓是合法的**：空白字元（U+0020）之字形本來就沒有輪廓。實測本檔浮水印 fixture
 * 之參考字型即回報 1 個合法空輪廓（見「校準守衛」案）。天真地寫成「每個字形都必須非空」
 * 會對【正確】產物報紅——那正是「紅得不是原因」，比沒有約束更糟。
 * 故：主斷言＝**零拋錯**（缺陷下 11/37 拋錯，訊號最乾淨）；
 *     輔助斷言＝**非空輪廓數 ≥ 由原始字型導出之參考值**（攔截「空輪廓」變體），
 *     且該參考值一律**由程式導出，不得手打數字**。
 *
 * ── ⚠ 涵蓋邊界（不得誤認：縮小盲區 ≠ 消除盲區）─────────────────────────
 * 本檔只驗【嵌入子集之輪廓層】。它**看不到**：
 *   · `cmap`／`CIDToGIDMap` 對映錯誤（字形完好但對到錯的字）
 *   · 文字落在頁面外、白字白底、被裁切
 *   · 版面／字級／位置是否符合 prototype
 * ⇒ **risks-and-gaps.md#pdf-glyph-integrity D 節之「渲染後逐字比對」仍為驗收必要步驟，
 *    不得因本檔全綠而略過。**
 *
 * ── 為什麼是行為層守衛，而不是「檢查 lockfile 版本／patch 有沒有套上」────────
 * 本 repo `backend/package.json` **無 `patches/`、無 `postinstall`、無 `overrides`**
 * ⇒ 修法不在 node_modules。且 `@pdf-lib/fontkit` 宣告為 caret `^1.1.1`，
 * 未來 `1.x` 升版若改動 TTFSubset，版本比對式守衛會照樣綠而缺陷復發。
 * 行為層守衛（實際產一份 PDF、實際解析輪廓）對版本漂移免疫。**請勿改成版本／檔案比對。**
 */

// ── 掃描器 ────────────────────────────────────────────────────────────
interface SubsetReport {
  numGlyphs: number;
  nonEmpty: number;
  empty: number;
  threw: number[];
}

/** 自產出之 PDF 取出所有嵌入之 TrueType 字型程式（FontDescriptor → FontFile2）。 */
function extractEmbeddedFontPrograms(doc: PDFDocument): Buffer[] {
  const programs: Buffer[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const maybeStreamDict = (obj as unknown as { dict?: unknown }).dict;
    const dict: PDFDict | null =
      maybeStreamDict instanceof PDFDict ? maybeStreamDict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;
    const fontFile = dict.get(PDFName.of('FontFile2'));
    if (!fontFile) continue;
    const stream = doc.context.lookup(fontFile) as PDFRawStream;
    let raw = Buffer.from(stream.contents);
    const filter = stream.dict.get(PDFName.of('Filter'));
    if (filter && String(filter).includes('Flate')) raw = inflateSync(raw);
    programs.push(raw);
  }
  return programs;
}

/** 重新解析子集之每一個字形輪廓；拋錯者記下 gid。 */
function scanOutlines(program: Buffer): SubsetReport {
  const font = (fontkit as unknown as { create(b: Buffer): any }).create(program);
  const report: SubsetReport = { numGlyphs: font.numGlyphs, nonEmpty: 0, empty: 0, threw: [] };
  for (let gid = 0; gid < font.numGlyphs; gid++) {
    try {
      const commands = font.getGlyph(gid).path.commands;
      if (!commands || commands.length === 0) report.empty++;
      else report.nonEmpty++;
    } catch {
      report.threw.push(gid);
    }
  }
  return report;
}

let cachedOriginal: any;
function originalFont(): any {
  if (!cachedOriginal) {
    const bytes = loadCjkFontBytes();
    if (!bytes) throw new Error('CJK 字型資產不存在——本約束無法執行（非本檔之缺陷，見 cjk-font-deployment.spec.ts）');
    cachedOriginal = (fontkit as unknown as { create(b: Buffer): any }).create(bytes);
  }
  return cachedOriginal;
}

/**
 * 由【原始未子集化字型】導出參考值：這些文字所需之相異字形中，有多少個帶有非空輪廓。
 * 🔒 一律導出、不得手打——手打的數字會在 fixture 或字型換版時變成假綠／假紅。
 */
function referenceOutlineCounts(texts: string[]): { distinct: number; nonEmpty: number; empty: number } {
  const font = originalFont();
  const distinct = new Set<number>();
  texts.forEach((text) => font.layout(text).glyphs.forEach((g: { id: number }) => distinct.add(g.id)));
  let nonEmpty = 0;
  let empty = 0;
  distinct.forEach((gid) => {
    const commands = font.getGlyph(gid).path.commands;
    if (commands && commands.length) nonEmpty++;
    else empty++;
  });
  return { distinct: distinct.size, nonEmpty, empty };
}

/** 取出產物中唯一之嵌入子集並掃描；同時擋掉「掃描器抓不到東西卻報綠」。 */
async function analyseSole(pdf: Buffer, label: string): Promise<SubsetReport> {
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  const doc = await PDFDocument.load(pdf);
  const programs = extractEmbeddedFontPrograms(doc);
  // 🔒 反假綠：抽不到嵌入字型時，後續所有迴圈都會「零案例通過」。
  expect(
    programs.length,
  ).toBeGreaterThan(0);
  if (programs.length === 0) throw new Error(`[${label}] 未抽到任何 FontFile2`);
  return scanOutlines(programs[0]);
}

// ── fixtures（皆為使用者實際回報缺字之字串）──────────────────────────────
const WATERMARK_SNAPSHOT =
  `和潤企業股份有限公司-債權管理部/法催一室-王小明(A12345)-2026-07-23 10:00:00-${WATERMARK_CONFIDENTIALITY}`;
const TREE_TEXTS = ['薪工循環', '案件起始／尚未掛載程序書', '商品進件作業', '機車IPAD對保作業'];
const HISTORY_TEXTS = ['薪工循環', '商品進件作業', '機車IPAD對保作業'];

async function blankPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  return Buffer.from(await pdf.save());
}

function treeLayout() {
  return buildTreeLayout(
    [
      { id: 'a1', name: '案件起始／尚未掛載程序書', docCount: 4 },
      { id: 'a2', name: '商品進件作業', docCount: 2 },
      { id: 'a3', name: '機車IPAD對保作業', docCount: 1 },
    ],
    [
      { sourceNodeId: 'a1', targetNodeId: 'a2' },
      { sourceNodeId: 'a2', targetNodeId: 'a3' },
    ],
  );
}

describe('PDF 產物之字形輪廓完整性（risks-and-gaps#pdf-glyph-integrity）', () => {
  jest.setTimeout(60000);

  describe('F020 浮水印燒錄（PdfLibBurner.burnPdf）', () => {
    let report: SubsetReport;
    beforeAll(async () => {
      const out = await new PdfLibBurner().burnPdf(await blankPdf(), WATERMARK_SNAPSHOT);
      report = await analyseSole(out, 'burn');
    });

    it('🔴 主斷言：嵌入子集之【每一個】字形輪廓皆可解析（零拋錯）', () => {
      expect({ threwGids: report.threw, numGlyphs: report.numGlyphs }).toEqual({
        threwGids: [],
        numGlyphs: report.numGlyphs,
      });
    });

    it('非空輪廓數 ≥ 由原始字型導出之參考值（攔截「空輪廓」變體）', () => {
      const ref = referenceOutlineCounts([WATERMARK_SNAPSHOT]);
      expect(report.nonEmpty).toBeGreaterThanOrEqual(ref.nonEmpty);
    });
  });

  describe('F036 循環樹狀圖 PDF（PdfLibTreeRenderer.render）', () => {
    let report: SubsetReport;
    beforeAll(async () => {
      const pdf = await new PdfLibTreeRenderer().render({ lifecycleName: '薪工循環', layout: treeLayout() });
      report = await analyseSole(pdf, 'tree');
    });

    it('🔴 主斷言：嵌入子集之【每一個】字形輪廓皆可解析（零拋錯）', () => {
      expect({ threwGids: report.threw, numGlyphs: report.numGlyphs }).toEqual({
        threwGids: [],
        numGlyphs: report.numGlyphs,
      });
    });

    it('非空輪廓數 ≥ 標題與節點名稱所需之參考值', () => {
      const ref = referenceOutlineCounts(TREE_TEXTS);
      expect(report.nonEmpty).toBeGreaterThanOrEqual(ref.nonEmpty);
    });
  });

  describe('F038 新舊對照樹狀圖 PDF（PdfLibChangeHistoryTreeRenderer.render）', () => {
    let report: SubsetReport;
    beforeAll(async () => {
      const before = buildTreeLayout([{ id: 'a1', name: '商品進件作業', docCount: 2 }], []);
      const after = buildTreeLayout(
        [
          { id: 'a1', name: '商品進件作業', docCount: 2 },
          { id: 'a2', name: '機車IPAD對保作業', docCount: 1 },
        ],
        [{ sourceNodeId: 'a1', targetNodeId: 'a2' }],
      );
      const pdf = await new PdfLibChangeHistoryTreeRenderer().render({
        lifecycleName: '薪工循環',
        beforeLayout: before,
        afterLayout: after,
        diff: { addNodes: ['a2'], rmNodes: [], amberNodes: [], addEdges: [['a1', 'a2']], rmEdges: [] },
      });
      report = await analyseSole(pdf, 'history');
    });

    it('🔴 主斷言：嵌入子集之【每一個】字形輪廓皆可解析（零拋錯）', () => {
      expect({ threwGids: report.threw, numGlyphs: report.numGlyphs }).toEqual({
        threwGids: [],
        numGlyphs: report.numGlyphs,
      });
    });

    it('非空輪廓數 ≥ 標題與節點名稱所需之參考值', () => {
      const ref = referenceOutlineCounts(HISTORY_TEXTS);
      expect(report.nonEmpty).toBeGreaterThanOrEqual(ref.nonEmpty);
    });
  });

  describe('🔒 掃描器自我檢查（反假綠：解析器一壞就回空集合而全部通過）', () => {
    it('三條路徑各恰有一份嵌入之 TrueType 子集，且字形數足以承載其 CJK 內容', async () => {
      const burn = await new PdfLibBurner().burnPdf(await blankPdf(), WATERMARK_SNAPSHOT);
      const tree = await new PdfLibTreeRenderer().render({
        lifecycleName: '薪工循環',
        layout: treeLayout(),
      });
      const found: Record<string, number> = {};
      for (const [label, pdf] of [
        ['burn', burn],
        ['tree', tree],
      ] as [string, Buffer][]) {
        const doc = await PDFDocument.load(pdf);
        found[label] = extractEmbeddedFontPrograms(doc).length;
      }
      // 恰一份：0 代表掃描器失效或字型未嵌入；>1 代表產物結構已改變，斷言標的須重新確認。
      expect(found).toEqual({ burn: 1, tree: 1 });

      const burnReport = await analyseSole(burn, 'burn');
      const burnRef = referenceOutlineCounts([WATERMARK_SNAPSHOT]);
      // 子集必須真的裝得下這串中文；若掃到的是 Helvetica 之類，字形數會遠低於此。
      expect(burnReport.numGlyphs).toBeGreaterThanOrEqual(burnRef.distinct);
    });

    it('參考值導出本身非平凡（否則「≥ 參考值」會恆真而假綠）', () => {
      const ref = referenceOutlineCounts([WATERMARK_SNAPSHOT]);
      expect(ref.nonEmpty).toBeGreaterThan(20);
      expect(ref.distinct).toBeGreaterThanOrEqual(ref.nonEmpty);
    });
  });

  describe('🔒 校準守衛：空輪廓是合法的（本檔主斷言為何不是「每個字形非空」）', () => {
    it('原始字型對浮水印 fixture 回報至少一個【合法】空輪廓（空白字元）', () => {
      const ref = referenceOutlineCounts([WATERMARK_SNAPSHOT]);
      // 若有人日後把主斷言改成「每個字形都必須非空」，這條會提醒他：
      // 正確產物本來就含空輪廓字形，那樣改會對正確產物報紅（紅得不是原因）。
      expect(ref.empty).toBeGreaterThanOrEqual(1);
      expect(WATERMARK_SNAPSHOT).toContain(' ');
    });
  });
});
