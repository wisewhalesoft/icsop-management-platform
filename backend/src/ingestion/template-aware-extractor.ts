import {
  validateXlsTemplate,
  XlsTemplateSummary,
} from '../xls-source/xls-template-rules';
import {
  CleanedSection,
  ExtractionResult,
  HeaderFields,
  MergedOrPlainCell,
  ParsedXlsWorkbook,
  RawSectionBlock,
  SignOffBlock,
} from './extraction.types';

/**
 * F028 模板感知內文抽取器（純規則層；不含二進位解析）。
 *
 * 分工邊界（OQ-F028-01）：本抽取器**重用** F027 之 `validateXlsTemplate`（粗粒度：工作表名稱
 * 集合＋標準格式旗標）作為第一道閘門，避免規則重複定義；其上再疊「內容區塊結構」細粒度閘門
 * （作業流程須有可辨識之章/節與必要標籤欄位）。兩者失敗皆歸 `EXTRACTION_FAILED`（不產出殘缺內容）。
 *
 * 章節缺欄位之失敗粒度（OQ-F028-04，未定案 → 本輪採保守決策並於 impl log flag）：
 * 單一節缺必要標籤欄位（executor/timeLimit 空白）→ **整份文件抽取失敗**（保守、簡單，對齊 AC4
 * 「不產生殘缺內容進入索引」；不採「跳過壞節、索引好節」以免部分性殘留）。
 */

/** 固定頁尾機密字樣（清洗時一律移除；破折號全形/半形皆涵蓋）。 */
const CONFIDENTIAL_PHRASES = [
  '企業內部文件－僅供內部使用',
  '企業內部文件-僅供內部使用',
];

/** 章節正規化：有節→章號＋節號；無節（章層級整段）→ 僅章號（不產出 "第X章第null節"）。 */
export function normalizeChapterSection(
  chapterNo: string,
  sectionNo: string | null,
): string {
  const chapter = chapterNo.trim();
  const section = sectionNo?.trim();
  return section ? `${chapter}${section}` : chapter;
}

/**
 * 合併儲存格接合（AC3）：
 * - 合併錨點（isMergeAnchor && mergeSpan>1）：其 value 即整段內容，接合為一段落；跳過後續 span-1 個 null 延續列。
 * - 一般儲存格（mergeSpan===1）：各自為一段落。
 * - 空白（value=null／空字串）之段落一律濾除（不產生空白段落，AC2/TS-007）。
 * 段落間以換行分隔，個別合併區塊互不竄接（TS-011）；段落內原始編號/換行保留（TS-012，不強制去除）。
 */
export function rejoinCells(cells: MergedOrPlainCell[]): string {
  const segments: string[] = [];
  let i = 0;
  while (i < cells.length) {
    const cell = cells[i];
    if (cell.mergeSpan > 1 && cell.isMergeAnchor) {
      segments.push(cell.value ?? '');
      i += cell.mergeSpan; // 跳過合併範圍內之 null 延續列
      continue;
    }
    if (cell.mergeSpan > 1 && !cell.isMergeAnchor) {
      // 落單之延續列（理論上已被錨點跳過）；防呆略過。
      i += 1;
      continue;
    }
    // 一般儲存格
    if (cell.value != null) segments.push(cell.value);
    i += 1;
  }
  return segments.map((s) => s.trimEnd()).filter((s) => s.trim().length > 0).join('\n');
}

/** 由頁首欄位＋簽核姓名＋固定頁尾字樣組出雜訊清單。 */
function buildNoise(
  header: HeaderFields | undefined,
  signOff: SignOffBlock | undefined,
): { lineNoise: string[]; inlineNoise: string[] } {
  const lineNoise: string[] = [];
  if (header) {
    lineNoise.push(
      header.documentNumber,
      header.edition,
      header.draftingDept,
      header.pageOf,
      header.draftedDate,
    );
  }
  const inlineNoise = [...CONFIDENTIAL_PHRASES];
  if (signOff) {
    if (signOff.chiefName) inlineNoise.push(signOff.chiefName);
    if (signOff.deptManagerName) inlineNoise.push(signOff.deptManagerName);
  }
  return {
    lineNoise: lineNoise.filter((s) => s && s.trim().length > 0),
    inlineNoise: inlineNoise.filter((s) => s && s.trim().length > 0),
  };
}

/**
 * 清洗（AC2）：
 * - inlineNoise（機密字樣、簽核姓名）：於任意位置移除（不得殘留進索引）。
 * - lineNoise（頁首欄位值）：整列相等時整列刪除（重複頁首列）。
 * - 濾除空白/純空白列，避免空段落。
 */
export function cleanText(
  raw: string,
  noise: { lineNoise: string[]; inlineNoise: string[] },
): string {
  let text = raw;
  for (const token of noise.inlineNoise) text = text.split(token).join('');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !noise.lineNoise.some((n) => l === n));
  return lines.join('\n');
}

/** 標準五表名稱之細粒度內容閘門後之抽取失敗結果建構。 */
function failed(documentId: string, reason: string): ExtractionResult {
  return {
    documentId,
    status: 'failed',
    purpose: '',
    scope: '',
    sections: [],
    changeLog: [],
    failureReason: reason,
  };
}

/**
 * 抽取主流程。簽章僅接受 (documentId, workbook)：**不接受任何附件參照**
 * （使用表單 excel / OJT 圖片本輪不納入抽取，TS-F028-014/015、OQ-E09-05）。
 * 對觸發來源（F027 首上傳 / F030 改版重抽）保持無感知（TS-F028-022/023）。
 */
export function extract(
  documentId: string,
  workbook: ParsedXlsWorkbook,
): ExtractionResult {
  // 第一道閘門：重用 F027 粗粒度模板規則（名稱集合＋標準格式旗標）。
  const summary: XlsTemplateSummary = {
    sheetNames: workbook.sheetNames,
    hasStandardFlag: workbook.hasStandardFlag,
  };
  const coarse = validateXlsTemplate(summary);
  if (!coarse.valid) {
    return failed(documentId, `EXTRACTION_FAILED: ${coarse.reason}`);
  }

  const cover = workbook.sheets['封面'];
  const toc = workbook.sheets['目錄&目的'];
  const workflow = workbook.sheets['作業流程'];
  const changeLogSheet = workbook.sheets['變更履歷'];
  const noise = buildNoise(cover?.headerBlock, cover?.signOffBlock);

  // 第二道閘門（細粒度）：作業流程須有可辨識章/節結構。
  const rawSections = workflow?.sections ?? [];
  if (rawSections.length === 0) {
    return failed(
      documentId,
      'EXTRACTION_FAILED: 「作業流程」內容區塊無可辨識之章/節結構',
    );
  }

  const sections: CleanedSection[] = [];
  for (const raw of rawSections) {
    // 必要標籤欄位保守檢核（OQ-F028-04：缺欄位 → 整份文件失敗）。
    if (!raw.executor?.trim() || !raw.timeLimit?.trim()) {
      return failed(
        documentId,
        `EXTRACTION_FAILED: 章節 ${normalizeChapterSection(raw.chapterNo, raw.sectionNo)} 缺少必要標籤欄位（執行者／時限）`,
      );
    }
    const content = cleanText(rejoinCells(raw.contentCells), noise);
    sections.push(buildSection(raw, content, noise));
  }

  const purpose = cleanText(toc?.purpose ?? '', noise);
  const scope = cleanText(toc?.scope ?? '', noise);
  const changeLog = (changeLogSheet?.rows ?? []).map((r) =>
    cleanText(
      [r.edition, r.effectiveDate, r.changeItem, r.changeSummary]
        .filter((s) => s && s.trim().length > 0)
        .join(' '),
      noise,
    ),
  );

  return {
    documentId,
    status: 'success',
    purpose,
    scope,
    sections,
    changeLog,
  };
}

function buildSection(
  raw: RawSectionBlock,
  content: string,
  noise: { lineNoise: string[]; inlineNoise: string[] },
): CleanedSection {
  return {
    chapterSection: normalizeChapterSection(raw.chapterNo, raw.sectionNo),
    executor: cleanText(raw.executor, noise),
    timeLimit: cleanText(raw.timeLimit, noise),
    content,
    pageNumber: raw.pageNumber,
  };
}
