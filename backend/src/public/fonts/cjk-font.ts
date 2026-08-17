import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/**
 * CJK 浮水印／樹狀圖字型載入（F036）。
 *
 * 資產：`backend/assets/fonts/NotoSansTC-Regular.ttf`（Noto Sans TC，SIL Open Font License 1.1，
 * 見同目錄 `LICENSE.md`）。pdf-lib 內建 `StandardFonts.Helvetica` 為 WinAnsi 編碼，無法編碼 CJK，
 * 真實中文會拋 `WinAnsi cannot encode` → 需以 fontkit 嵌入 CJK TTF 方能正確燒錄／渲染中文。
 *
 * 缺檔（未部署字型資產）時回 `null`，呼叫端退化 `StandardFonts.Helvetica` + asciiSafe（'?' 佔位、
 * 不崩潰）。載入結果快取（含「缺檔」結果），避免每次燒錄重讀 7MB 檔案。
 */

/** 字型檔候選路徑（src 執行 via ts-jest 與 dist 執行皆解析至 `backend/assets/fonts`）。 */
export function fontCandidatePaths(): string[] {
  const rel = join('assets', 'fonts', 'NotoSansTC-Regular.ttf');
  return [
    // __dirname＝.../src/public/fonts 或 .../dist/public/fonts → 上溯三層至 backend 根
    join(__dirname, '..', '..', '..', rel),
    // 以行程工作目錄為 backend 根時
    join(process.cwd(), rel),
  ];
}

let cached: { bytes: Buffer | null } | undefined;

/**
 * 讀取 CJK 字型位元組（快取）。找不到資產時回 `null`（呼叫端退化，不拋例外）。
 */
export function loadCjkFontBytes(): Buffer | null {
  if (cached) return cached.bytes;
  for (const p of fontCandidatePaths()) {
    try {
      if (existsSync(p)) {
        cached = { bytes: readFileSync(p) };
        return cached.bytes;
      }
    } catch {
      // 讀取失敗（權限等）→ 續試下一候選 / 退化
    }
  }
  cached = { bytes: null };
  return null;
}

/** 測試用：清除快取（讓「缺檔退化」與「有檔嵌入」兩路徑可各自驗證）。 */
export function __resetCjkFontCache(): void {
  cached = undefined;
}

export interface EmbeddedWatermarkFont {
  font: PDFFont;
  /** 是否為可編碼 CJK 之嵌入字型（true＝可直接繪中文；false＝退化 Helvetica，需 asciiSafe）。 */
  cjk: boolean;
}

/** 由 pdf-lib 公開 API 反推之 fontkit 契約型別（避免相依其內部 d.ts 路徑）。 */
type Fontkit = Parameters<PDFDocument['registerFontkit']>[0];
type FontkitSubset = ReturnType<ReturnType<Fontkit['create']>['createSubset']>;

/** `@pdf-lib/fontkit` 1.1.1 `TTFSubset` 之私有形狀（僅取本繞行所需欄位）。 */
interface TtfSubsetInternals {
  loca?: { version?: number | null };
  _addGlyph?(gid: number): number;
}

/**
 * 繞行 `@pdf-lib/fontkit` 1.1.1 之 TrueType 子集化掉字 bug：**短 loca 位移截斷**。
 *
 * 成因（實測佐證）：Noto Sans TC 為長 loca 格式（`indexToLocFormat=1`），故其 glyf 記錄長度**可為奇數**
 * （實測：薪 365、循 277、書 139、車 95 …）。fontkit `TTFSubset._addGlyph()` 逐字原樣複製 glyf 位元組並以
 * `offset += buffer.length` 累加位移，因此子集位移常為奇數；而 `loca.preEncode()` 只要末位移 ≤ 0xffff
 * （小子集必然成立）就改用**短 loca**，並執行 `offsets[i] >>>= 1` —— 奇數位移被無聲截掉 1 byte，
 * 自第一個奇長度字之後所有字形邊界全部錯位，讀取端拿到殘缺輪廓 ⇒ 渲染成空白／破字。
 *
 * 繞行：於子集開始收字時把 `loca.version` 釘為 1（長格式）。`preEncode()` 見 version 已設即提早返回、
 * 位移保持原始位元組值並以 uint32 寫出，`head.indexToLocFormat` 亦由 fontkit 依 `loca.version` 同步為 1。
 * 代價僅 loca 表由 2 bytes/字 變 4 bytes/字（數十字的子集約 +100 bytes），**不放棄子集化**。
 *
 * 僅套用於具 `_addGlyph`（＝TTFSubset）之子集；CFF/OTF 子集不走 glyf/loca，維持原行為。
 */
function withLongLocaOffsets(subset: FontkitSubset): FontkitSubset {
  const internals = subset as FontkitSubset & TtfSubsetInternals;
  const addGlyph = internals._addGlyph;
  if (typeof addGlyph !== 'function') return subset;
  internals._addGlyph = function pinLongLoca(this: TtfSubsetInternals, gid: number): number {
    if (this.loca && this.loca.version == null) this.loca.version = 1;
    return addGlyph.call(this, gid);
  };
  return subset;
}

/** 包裝 fontkit：其產出之每個字型子集皆改用長 loca 位移（見 `withLongLocaOffsets`）。 */
export function glyfSafeFontkit(base: Fontkit): Fontkit {
  return {
    create(buffer, postscriptName) {
      const font = base.create(buffer, postscriptName);
      const createSubset = font.createSubset.bind(font);
      font.createSubset = (): FontkitSubset => withLongLocaOffsets(createSubset());
      return font;
    },
  };
}

/**
 * 於 PDF 文件嵌入浮水印／樹狀圖字型。
 *  - `fontBytes` 提供（CJK TTF）→ registerFontkit + 子集化嵌入，回 `{ cjk: true }`；
 *  - `fontBytes` 為 `null`/`undefined` → 退化 `StandardFonts.Helvetica`，回 `{ cjk: false }`。
 *
 * 子集化（`subset: true`）：僅嵌入實際使用之字符，輸出 PDF 不含整份 7MB 字型（燒錄後檔案仍小）。
 * 子集化必須經 `glyfSafeFontkit()` 包裝，否則 fontkit 1.1.1 之短 loca 截斷會讓 CJK 大量掉字。
 */
export async function embedWatermarkFont(
  pdf: PDFDocument,
  fontBytes: Buffer | null | undefined,
): Promise<EmbeddedWatermarkFont> {
  if (fontBytes && fontBytes.length > 0) {
    pdf.registerFontkit(glyfSafeFontkit(fontkit));
    const font = await pdf.embedFont(fontBytes, { subset: true });
    return { font, cjk: true };
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  return { font, cjk: false };
}

/**
 * 退化為 WinAnsi 可編碼字元（無 CJK 字型時避免 `StandardFonts.Helvetica` 編碼崩潰）。
 * 以 `'?'` 取代所有非可列印 ASCII 字元——`'?'` 屬 WinAnsi 可編碼；
 * ⚠ `'□'`（U+25A1）本身即 WinAnsi 不可編碼，若用作佔位反而會拋例外（既有 bug），故不採用。
 */
export function asciiSafe(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x20-\x7E]/g, '?');
}
