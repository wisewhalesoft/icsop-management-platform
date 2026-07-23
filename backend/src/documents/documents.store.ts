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

/** F011 編輯：可覆寫之業務欄位子集（部分更新；nodeId 不在此，節點寫入僅經 F009 抽屜）。 */
export type DocumentPatch = Partial<Omit<CreateDocumentInput, never>>;

/** F011 版本對照：單一欄位之新舊值快照，供編輯頁確認 diff。 */
export interface DocumentFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** F011 update() 回傳：覆寫後之文件 + 本次異動之新舊值對照。 */
export interface DocumentUpdateResult {
  document: DocumentView;
  changes: DocumentFieldChange[];
}

/** F017 清單篩選。 */
export interface DocumentListFilters {
  lifecycleId?: string;
  status?: string;
  keyword?: string;
}

/** 清單項（含循環名稱、公告日期以 ISO 字串傳出，供前端衍生已公告/進度中）。 */
export interface DocumentListItem {
  id: string;
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  nodeId: string | null;
  draftingCompanyId: string | null;
  draftingDeptId: string | null;
  draftingSectionId: string | null;
  primaryChiefId: string | null;
  edition: string | null;
  announcedDate: string | null;
  contentSummary: string | null;
}

export interface DocumentStore {
  /** 取具指定編號之現存文件（id/編號/狀態），供 F013 唯一性判定（查詢範圍小）。 */
  findNumberHolders(documentNumber: string): Promise<NumberHolder[]>;
  create(input: CreateDocumentInput): Promise<DocumentView>;
  list(filters: DocumentListFilters): Promise<DocumentListItem[]>;
  findById(id: string): Promise<DocumentView | null>;
  updateStatus(id: string, status: DocumentStatus): Promise<void>;
  /** F011 編輯：以 patch 覆寫（不留歷史、UUID 不變）；回傳覆寫後之完整檢視。 */
  update(id: string, patch: DocumentPatch): Promise<DocumentView>;
}
