import { randomUUID } from 'crypto';

/**
 * INDEX_RUN（data-model §indexrun-entity）：單一文件之抽取／切 chunk／向量化執行紀錄。
 * 供 F028（stage=extract）、F029（success/chunkCount）、F030（reindex）、F031（三態＋失敗階段）共用。
 */
export type IndexRunStatus = 'running' | 'success' | 'failed';
export type IndexRunStage = 'extract' | 'chunk' | 'embed';
export type IndexRunTrigger =
  | 'manual'
  | 'document_edit'
  | 'xls_update'
  | 'status_change'
  | 'batch';

export interface IndexRun {
  id: string;
  documentId: string;
  triggerType: IndexRunTrigger;
  status: IndexRunStatus;
  /** 最後到達／失敗階段。 */
  stage: IndexRunStage;
  chunkCount: number | null;
  errorStage: IndexRunStage | null;
  errorMessage: string | null;
  /** G-ADM-030/031 失敗錯誤碼（XLS_TEMPLATE_INVALID/CHUNKING_FAILED/EMBEDDING_FAILED…）；非失敗恆 null。 */
  errorCode: string | null;
  startedAt: Date;
  endedAt: Date | null;
  triggeredBy: string | null;
}

export interface CreateIndexRunInput {
  documentId: string;
  triggerType: IndexRunTrigger;
  /** 初始階段（extract=一般管線；chunk=狀態切換輕量分支）。 */
  stage: IndexRunStage;
  triggeredBy?: string | null;
}

export interface IndexRunFailure {
  stage: IndexRunStage;
  errorStage: IndexRunStage;
  errorMessage: string;
  /** G-ADM-030/031 錯誤碼（選填；呼叫端於失敗時提供，如 EXTRACTION_FAILED/EMBEDDING_FAILED）。 */
  errorCode?: string;
}

export interface IndexRunStore {
  create(input: CreateIndexRunInput): Promise<IndexRun>;
  markStage(id: string, stage: IndexRunStage): Promise<void>;
  markSuccess(id: string, chunkCount: number): Promise<void>;
  markFailed(id: string, failure: IndexRunFailure): Promise<void>;
  findById(id: string): Promise<IndexRun | null>;
  getLatestByDocument(documentId: string): Promise<IndexRun | null>;
  listAll(): Promise<IndexRun[]>;
}

export const INDEX_RUN_STORE = Symbol('INDEX_RUN_STORE');

/** 記憶體實作（unit 用；生產以 TypeOrmIndexRunStore 取代，migration 已撰寫未執行）。 */
export class FakeIndexRunStore implements IndexRunStore {
  private readonly rows: IndexRun[] = [];
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  create(input: CreateIndexRunInput): Promise<IndexRun> {
    const run: IndexRun = {
      id: randomUUID(),
      documentId: input.documentId,
      triggerType: input.triggerType,
      status: 'running',
      stage: input.stage,
      chunkCount: null,
      errorStage: null,
      errorMessage: null,
      errorCode: null,
      startedAt: this.now(),
      endedAt: null,
      triggeredBy: input.triggeredBy ?? null,
    };
    // 保留建立序，供 getLatestByDocument。
    (run as IndexRun & { _seq: number })._seq = this.seq++;
    this.rows.push(run);
    return Promise.resolve({ ...run });
  }

  private mutate(id: string, patch: Partial<IndexRun>): void {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`INDEX_RUN not found: ${id}`);
    this.rows[idx] = { ...this.rows[idx], ...patch };
  }

  markStage(id: string, stage: IndexRunStage): Promise<void> {
    this.mutate(id, { stage });
    return Promise.resolve();
  }

  markSuccess(id: string, chunkCount: number): Promise<void> {
    this.mutate(id, {
      status: 'success',
      chunkCount,
      endedAt: this.now(),
      errorStage: null,
      errorMessage: null,
    });
    return Promise.resolve();
  }

  markFailed(id: string, failure: IndexRunFailure): Promise<void> {
    this.mutate(id, {
      status: 'failed',
      stage: failure.stage,
      errorStage: failure.errorStage,
      errorMessage: failure.errorMessage,
      errorCode: failure.errorCode ?? null,
      endedAt: this.now(),
    });
    return Promise.resolve();
  }

  findById(id: string): Promise<IndexRun | null> {
    const r = this.rows.find((x) => x.id === id);
    return Promise.resolve(r ? { ...r } : null);
  }

  getLatestByDocument(documentId: string): Promise<IndexRun | null> {
    const rows = this.rows
      .filter((r) => r.documentId === documentId)
      .sort(
        (a, b) =>
          (b as IndexRun & { _seq: number })._seq -
          (a as IndexRun & { _seq: number })._seq,
      );
    return Promise.resolve(rows[0] ? { ...rows[0] } : null);
  }

  listAll(): Promise<IndexRun[]> {
    return Promise.resolve(this.rows.map((r) => ({ ...r })));
  }
}
