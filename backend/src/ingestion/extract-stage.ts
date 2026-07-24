import { ExtractionResult, ParsedXlsWorkbook } from './extraction.types';
import { extract } from './template-aware-extractor';
import { IndexRunStore } from './index-run';

/**
 * 抽取階段編排（F028，於 ingestion 管線內執行）。
 * INDEX_RUN 已由外層建立（status=running）；本函式：
 *  - 成功：stage 記為 `extract`（最後到達階段，status 維持 running），呼叫 onExtracted 交付 F029。
 *  - 失敗：markFailed(stage=extract, errorStage=extract, errorMessage)，**不呼叫 onExtracted**
 *    （流程不進入切 chunk 階段，TS-F028-021）。
 * 抽取本身不直接寫 success（整體索引成功與否要等 F029 embed 階段，TS-F028-020）。
 */
export interface ExtractStageDeps {
  documentId: string;
  indexRunId: string;
  workbook: ParsedXlsWorkbook;
  runStore: IndexRunStore;
  /** F029 續接（僅 status='success' 時呼叫）。 */
  onExtracted: (result: ExtractionResult) => Promise<void>;
}

export async function runExtractStage(
  deps: ExtractStageDeps,
): Promise<ExtractionResult> {
  const result = extract(deps.documentId, deps.workbook);
  if (result.status === 'failed') {
    await deps.runStore.markFailed(deps.indexRunId, {
      stage: 'extract',
      errorStage: 'extract',
      errorMessage: result.failureReason ?? 'EXTRACTION_FAILED',
      errorCode: 'EXTRACTION_FAILED',
    });
    return result;
  }
  await deps.runStore.markStage(deps.indexRunId, 'extract');
  await deps.onExtracted(result);
  return result;
}
