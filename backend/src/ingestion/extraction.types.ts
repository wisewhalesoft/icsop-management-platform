/**
 * F028 .xls 模板感知內文抽取之型別契約。
 *
 * 測試策略（F028-test.md）：單元測試一律以「已完成二進位解析」之結構化物件 `ParsedXlsWorkbook`
 * 為輸入（模擬 F027 沿用之 xls 解析函式庫輸出）；真實 .xls 二進位解析為 [integration]（TS-F028-024）。
 * 本檔僅定義純資料契約，不含任何二進位解析。
 */

/** 頁首欄位（重複頁首雜訊來源；抽取副產物，metadata 權威來源為 ICSOP_DOCUMENT DB，見 OQ-F028-05）。 */
export interface HeaderFields {
  documentNumber: string;
  edition: string;
  draftingDept: string;
  pageOf: string;
  draftedDate: string;
}

/** 簽核區（含人員姓名；清洗時一律移除，回歸「不含人員姓名進入索引」，範本分析 §3.2）。 */
export interface SignOffBlock {
  chiefName?: string;
  deptManagerName?: string;
  signatureFields: string[];
}

/** 目錄&目的表之章節大綱項（本 feature 不逐項抽取內容，僅供結構參考）。 */
export interface ChapterOutlineEntry {
  chapterNo: string;
  title: string;
}

/** 變更履歷列（版次/生效日期/變更項次/變更內容簡述）。 */
export interface ChangeLogRow {
  edition: string;
  effectiveDate: string;
  changeItem: string;
  changeSummary: string;
}

/**
 * 「作業內容」欄位之原始儲存格（沿用主流 xls 解析函式庫慣例：合併值僅存在錨點儲存格，
 * 合併範圍內其餘儲存格 value=null）。
 */
export interface MergedOrPlainCell {
  value: string | null;
  isMergeAnchor: boolean;
  /** 1 = 非合併儲存格；>1 = 合併跨列數。 */
  mergeSpan: number;
}

/** 逐節作業流程原始區塊。 */
export interface RawSectionBlock {
  chapterNo: string; // 如 "第2章"
  sectionNo: string | null; // 如 "第3節"；章層級無節細分時為 null
  executor: string;
  timeLimit: string;
  contentCells: MergedOrPlainCell[];
  pageNumber: number;
}

export interface CoverSheet {
  headerBlock: HeaderFields;
  signOffBlock: SignOffBlock;
}

export interface TocPurposeSheet {
  purpose: string;
  scope: string;
  linkedDocs: string[];
  chapterOutline: ChapterOutlineEntry[];
}

/** 本 feature 不讀取流程圖表內容（OQ-E09-05：不抽取流程圖影像/繪製格）。 */
export type FlowchartSheet = Record<string, never>;

export interface WorkflowSheet {
  sections: RawSectionBlock[];
}

export interface ChangeLogSheet {
  rows: ChangeLogRow[];
}

/** 已解析工作表集合（各標準表；缺表情境以 Partial 表達）。 */
export interface ParsedXlsWorkbookSheets {
  封面: CoverSheet;
  '目錄&目的': TocPurposeSheet;
  '.流程圖': FlowchartSheet;
  作業流程: WorkflowSheet;
  變更履歷: ChangeLogSheet;
}

/** F027 二進位解析輸出（沿用 XlsTemplateSummary 之 sheetNames/hasStandardFlag 形狀）。 */
export interface ParsedXlsWorkbook {
  sheetNames: string[];
  hasStandardFlag: Record<string, boolean>;
  sheets: Partial<ParsedXlsWorkbookSheets>;
}

/** 清洗完成之單節結果（交付 F029 之 1:1 chunk 來源）。 */
export interface CleanedSection {
  /** 正規化章節識別，如 "第2章第3節"（無節時僅章號 "第3章"）。 */
  chapterSection: string;
  executor: string;
  timeLimit: string;
  /** 已接合、清洗完成之完整段落（純文字）。 */
  content: string;
  pageNumber: number;
}

/** 抽取器輸出（交付 F029 之中繼結果）。 */
export interface ExtractionResult {
  documentId: string;
  status: 'success' | 'failed';
  /** 目的（AC1；清洗後）。 */
  purpose: string;
  /** 適用範圍（AC1；清洗後）。 */
  scope: string;
  /** 逐節作業流程（僅 status='success' 有值）。 */
  sections: CleanedSection[];
  /** 變更履歷各列接合文字（供 RAG 檢索引用，非 F037 權威來源）。 */
  changeLog: string[];
  /** 僅 status='failed'。 */
  failureReason?: string;
}
