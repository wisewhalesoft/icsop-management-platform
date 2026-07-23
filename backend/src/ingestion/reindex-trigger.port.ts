import { DocumentStatus } from '../documents/document-status';
import { IndexRunStage } from './index-run';

/**
 * F030 改版重抽觸發之埠（Port）契約。
 *
 * ── 對外事件契約（doc-edit / F011/F012/F027 端「發送」的形狀，rag worktree 實作「接收」側）──
 * 由 launching agent 定案為鬆耦合 seam；實際接線（誰呼叫、直接呼叫或事件匯流排）於 merge 時調和
 * （OQ-F030-01 `[BLOCKING]`）。本 worktree 不 import documents.service，僅實作接收端 + 以 fake caller 單測。
 */
export interface DocumentChangedEvent {
  documentId: string;
  changeType: 'CONTENT' | 'STATUS' | 'META';
  /** 變更欄位（STATUS/META 診斷用；本輪 STATUS 之新值由授權狀態讀取端解析，見 ReindexService）。 */
  changedFields?: string[];
  occurredAt: Date;
}

export interface ReindexTriggerPort {
  onDocumentChanged(e: DocumentChangedEvent): Promise<void>;
}

export const REINDEX_TRIGGER_PORT = Symbol('REINDEX_TRIGGER_PORT');

/**
 * 內容改版之觸發來源（triggerType）：
 *  - xls_update：換 .xls（F027 覆蓋上傳，沿用 ExtractionTrigger seam）
 *  - document_edit：內容編輯（F011，尚未存在）
 *  - manual：管理端手動重新索引（F031）
 */
export type ReindexSource = 'xls_update' | 'document_edit' | 'manual';

export interface RebuildResult {
  status: 'success' | 'failed';
  /** 新版 chunk 之 indexRunId（成功時供 swap）。 */
  newIndexRunId: string;
  chunkCount?: number;
  /** 失敗階段（extract/chunk/embed）。 */
  errorStage?: IndexRunStage;
}

/** F028+F029 完整重跑之黑箱（包裝抽取→切 chunk→索引；本 worktree 以 FakeIndexBuilder 單測）。 */
export interface IndexBuilder {
  rebuild(documentId: string): Promise<RebuildResult>;
}
export const INDEX_BUILDER = Symbol('INDEX_BUILDER');

/** 文件存在性防呆（避免建立孤兒 INDEX_RUN，TS-F030-016）。 */
export interface DocumentExistsPort {
  exists(documentId: string): Promise<boolean>;
}
export const DOCUMENT_EXISTS_PORT = Symbol('DOCUMENT_EXISTS_PORT');

/** 授權狀態讀取端（onDocumentChanged STATUS 事件解析當前權威狀態；事件本身不攜帶新值）。 */
export interface DocumentStatusReader {
  getStatus(documentId: string): Promise<DocumentStatus | null>;
}
export const DOCUMENT_STATUS_READER = Symbol('DOCUMENT_STATUS_READER');
