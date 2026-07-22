import { NumberHolder } from './document-rules';
import { DocumentStatus } from './document-status';

/** 文件資料存取邊界（可注入 mock/TypeORM）。E04-1 僅需建立與編號唯一性查詢。 */
export const DOCUMENT_STORE = Symbol('DOCUMENT_STORE');

/** 建立酬載（欄位面清洗後之可寫欄位；核心 4 必填＋選填）。 */
export interface CreateDocumentInput {
  lifecycleId: string;
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  draftingCompanyId?: string | null;
  draftingDeptId?: string | null;
  draftingSectionId?: string | null;
  primaryChiefId?: string | null;
  edition?: string | null;
  announcedDate?: Date | null;
  contentSummary?: string | null;
}

export interface DocumentView extends CreateDocumentInput {
  id: string;
  nodeId: string | null;
}

export interface DocumentStore {
  /** 取具指定編號之現存文件（id/編號/狀態），供 F013 唯一性判定（查詢範圍小）。 */
  findNumberHolders(documentNumber: string): Promise<NumberHolder[]>;
  create(input: CreateDocumentInput): Promise<DocumentView>;
}
