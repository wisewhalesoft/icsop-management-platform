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

/**
 * 於 PDF 文件嵌入浮水印／樹狀圖字型。
 *  - `fontBytes` 提供（CJK TTF）→ registerFontkit + 子集化嵌入，回 `{ cjk: true }`；
 *  - `fontBytes` 為 `null`/`undefined` → 退化 `StandardFonts.Helvetica`，回 `{ cjk: false }`。
 *
 * 子集化（`subset: true`）：僅嵌入實際使用之字符，輸出 PDF 不含整份 7MB 字型（燒錄後檔案仍小）。
 */
export async function embedWatermarkFont(
  pdf: PDFDocument,
  fontBytes: Buffer | null | undefined,
): Promise<EmbeddedWatermarkFont> {
  if (fontBytes && fontBytes.length > 0) {
    pdf.registerFontkit(fontkit);
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
