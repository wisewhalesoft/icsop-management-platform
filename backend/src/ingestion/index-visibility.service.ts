import { DocumentChunk } from './chunking.types';
import { ChunkStore } from './chunk-store';
import { IndexRun, IndexRunStage, IndexRunStore, IndexRunTrigger } from './index-run';

/**
 * F031 管理端提取結果預覽與重新索引狀態（US-094）之查詢/呈現邏輯（純服務層）。
 * 資料來源＝DOCUMENT_CHUNK（當前版本）與 INDEX_RUN；RBAC 於 controller 層以 @RequirePermission 把關。
 */

/** chunk 預覽項（content 片段 + 8 項 metadata + chunk id + 循環名）。 */
export interface ChunkPreviewItem {
  /** G-ADM-034 chunk 唯一 id（預覽 chip）。 */
  chunkId: string;
  chunkSeq: number;
  content: string;
  documentNumber: string;
  lifecycleId: string;
  /** G-ADM-034 循環名（lifecycleId→LIFECYCLE.name；無 resolver→null）。 */
  lifecycleName: string | null;
  chapterSection: string;
  usingDeptIds: string[];
  status: string;
  announcedDate: string | null;
  edition: string;
  pageNumber: number;
}

export type IndexStatusState = 'running' | 'success' | 'failed' | 'not_built';

/** 失敗階段 → 中文呈現字樣（Main Flow 步驟 4，精確對應，非籠統「處理失敗」）。 */
export const STAGE_LABEL: Record<IndexRunStage, string> = {
  extract: '抽取失敗',
  chunk: '切 chunk 失敗',
  embed: '向量化失敗',
};

export interface IndexStatusView {
  state: IndexStatusState;
  triggerType: IndexRunTrigger | null;
  /** 成功時之最後索引時間（endedAt）。 */
  lastIndexedAt: string | null;
  /** 失敗詳情。 */
  errorStage: IndexRunStage | null;
  stageLabel: string | null;
  errorMessage: string | null;
  /** G-ADM-031 失敗錯誤碼（失敗詳情 modal「錯誤碼」列）；非失敗恆 null。 */
  errorCode: string | null;
}

export interface IndexOverviewRow {
  documentId: string;
  state: IndexStatusState;
  triggerType: IndexRunTrigger | null;
  chunkCount: number | null;
  lastIndexedAt: string | null;
  errorStage: IndexRunStage | null;
  errorMessage: string | null;
  /** G-ADM-030 失敗錯誤碼（清單失敗列顯示錯誤碼而非階段標籤）；非失敗恆 null。 */
  errorCode: string | null;
}

export interface IndexOverviewResult {
  successCount: number;
  failedCount: number;
  runningCount: number;
  /** G-ADM-028「尚未建立」計數（有 ICSOP_DOCUMENT 但無任何 INDEX_RUN）；無 documentIds 來源→0。 */
  notBuiltCount: number;
  items: IndexOverviewRow[];
  page: number;
  pageSize: number;
  total: number;
}

export type OverviewStateFilter = 'success' | 'failed' | 'running' | 'not_built';

export interface OverviewQuery {
  state?: OverviewStateFilter;
  page?: number;
}

/** 手動重新索引觸發（對接 F030 onContentRevised(documentId, 'manual')）。 */
export interface ManualReindexTrigger {
  trigger(documentId: string): Promise<void>;
}
export const MANUAL_REINDEX_TRIGGER = Symbol('MANUAL_REINDEX_TRIGGER');

const DEFAULT_PAGE_SIZE = 50;

function toView(run: IndexRun | null): IndexStatusView {
  if (run === null) {
    return {
      state: 'not_built',
      triggerType: null,
      lastIndexedAt: null,
      errorStage: null,
      stageLabel: null,
      errorMessage: null,
      errorCode: null,
    };
  }
  return {
    state: run.status,
    triggerType: run.triggerType,
    lastIndexedAt: run.status === 'success' ? run.endedAt?.toISOString() ?? null : null,
    errorStage: run.status === 'failed' ? run.errorStage : null,
    stageLabel:
      run.status === 'failed' && run.errorStage ? STAGE_LABEL[run.errorStage] : null,
    errorMessage: run.status === 'failed' ? run.errorMessage : null,
    errorCode: run.status === 'failed' ? run.errorCode : null,
  };
}

function previewOf(chunk: DocumentChunk, lifecycleName: string | null): ChunkPreviewItem {
  return {
    chunkId: chunk.id,
    chunkSeq: chunk.chunkSeq,
    content: chunk.content,
    documentNumber: chunk.documentNumber,
    lifecycleId: chunk.lifecycleId,
    lifecycleName,
    chapterSection: chunk.chapterSection,
    usingDeptIds: [...chunk.usingDeptIds],
    status: chunk.status,
    announcedDate: chunk.announcedDate,
    edition: chunk.edition,
    pageNumber: chunk.pageNumber,
  };
}

export class IndexVisibilityService {
  constructor(
    private readonly deps: {
      chunkStore: Pick<ChunkStore, 'listCurrentVersionByDocument'>;
      runStore: Pick<IndexRunStore, 'getLatestByDocument' | 'listAll'>;
      manualReindex: ManualReindexTrigger;
      /** G-ADM-028 全 ICSOP_DOCUMENT id（notBuilt 計數/列）。缺→notBuiltCount=0、無 not_built 列。 */
      documentIds?: () => Promise<string[]>;
      /** G-ADM-034 循環名解析（lifecycleId→name）。缺→lifecycleName null。 */
      lifecycleNames?: (lifecycleIds: string[]) => Promise<Map<string, string>>;
    },
  ) {}

  /** AC1：chunk 清單（依 chunkSeq 遞增排序）+ 8 項 metadata + chunk id + 循環名（G-ADM-034）。 */
  async previewChunks(documentId: string): Promise<ChunkPreviewItem[]> {
    const chunks = (await this.deps.chunkStore.listCurrentVersionByDocument(documentId))
      .slice()
      .sort((a, b) => a.chunkSeq - b.chunkSeq);
    const lcIds = [...new Set(chunks.map((c) => c.lifecycleId))];
    const lcNames =
      this.deps.lifecycleNames && lcIds.length > 0
        ? await this.deps.lifecycleNames(lcIds)
        : new Map<string, string>();
    return chunks.map((c) => previewOf(c, lcNames.get(c.lifecycleId) ?? null));
  }

  /** AC2/AC3/AC5：三態 + not_built（null INDEX_RUN） + 失敗階段/訊息。 */
  async getIndexStatus(documentId: string): Promise<IndexStatusView> {
    const run = await this.deps.runStore.getLatestByDocument(documentId);
    return toView(run);
  }

  /** AC4：跨文件總覽（彙總計數為全量、清單分頁；可依 state 篩選）。 */
  async getOverview(query: OverviewQuery = {}): Promise<IndexOverviewResult> {
    const runs = await this.deps.runStore.listAll();
    // 每文件取最新一筆（listAll 依建立序，後者較新 → last wins）。
    const latest = new Map<string, IndexRun>();
    for (const run of runs) latest.set(run.documentId, run);

    const builtRows: IndexOverviewRow[] = [...latest.values()].map((run) => ({
      documentId: run.documentId,
      state: run.status,
      triggerType: run.triggerType,
      chunkCount: run.status === 'success' ? run.chunkCount : null,
      lastIndexedAt: run.status === 'success' ? run.endedAt?.toISOString() ?? null : null,
      errorStage: run.status === 'failed' ? run.errorStage : null,
      errorMessage: run.status === 'failed' ? run.errorMessage : null,
      errorCode: run.status === 'failed' ? run.errorCode : null,
    }));

    // G-ADM-028「尚未建立」：有 ICSOP_DOCUMENT 但無任何 INDEX_RUN 之文件（合成 not_built 列）。
    const built = new Set(builtRows.map((r) => r.documentId));
    const allDocIds = this.deps.documentIds ? await this.deps.documentIds() : [];
    const notBuiltRows: IndexOverviewRow[] = allDocIds
      .filter((id) => !built.has(id))
      .map((id) => ({
        documentId: id,
        state: 'not_built' as IndexStatusState,
        triggerType: null,
        chunkCount: null,
        lastIndexedAt: null,
        errorStage: null,
        errorMessage: null,
        errorCode: null,
      }));
    const rows = [...builtRows, ...notBuiltRows];

    // 彙總計數為全量（非僅本頁）。
    const successCount = builtRows.filter((r) => r.state === 'success').length;
    const failedCount = builtRows.filter((r) => r.state === 'failed').length;
    const runningCount = builtRows.filter((r) => r.state === 'running').length;
    const notBuiltCount = notBuiltRows.length;

    const filtered = query.state ? rows.filter((r) => r.state === query.state) : rows;
    const page = query.page && query.page > 0 ? query.page : 1;
    const start = (page - 1) * DEFAULT_PAGE_SIZE;
    const items = filtered.slice(start, start + DEFAULT_PAGE_SIZE);

    return {
      successCount,
      failedCount,
      runningCount,
      notBuiltCount,
      items,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      total: filtered.length,
    };
  }

  /** Alternative Flow：手動重新索引（觸發 F030 manual）。 */
  async manualReindex(documentId: string): Promise<void> {
    await this.deps.manualReindex.trigger(documentId);
  }
}
