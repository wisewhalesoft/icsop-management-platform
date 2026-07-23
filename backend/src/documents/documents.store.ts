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

/** F017 清單排序鍵。 */
export type DocumentSortBy = 'documentNumber' | 'announcedDate';
export type SortDir = 'asc' | 'desc';

/** F017 清單篩選/排序/分頁。 */
export interface DocumentListFilters {
  lifecycleId?: string;
  /** 狀態：接受原始儲存值（active/inactive/void）或衍生顯示值（已公告/進度中/失效/作廢）。 */
  status?: string;
  /** 模糊搜尋（既有）：編號/書名之 LIKE 部分比對。 */
  keyword?: string;
  /** 精確篩選（F017 下拉）。 */
  documentNumber?: string;
  documentName?: string;
  draftingCompanyId?: string;
  draftingDeptId?: string;
  draftingSectionId?: string;
  primaryChiefId?: string;
  /** 連結點程序書篩選（F015 依賴：擁有指向此目標之連結者）。 */
  linkTargetId?: string;
  sortBy?: DocumentSortBy;
  sortDir?: SortDir;
  /** 1-based 頁碼（預設 1）。 */
  page?: number;
  /** 每頁筆數（預設 50，比照 F024）。 */
  pageSize?: number;
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
  /** F017 名稱解析（org-foundation NameResolutionService；查無→null，前端顯示「—」）。 */
  draftingCompanyName: string | null;
  draftingDeptName: string | null;
  draftingSectionName: string | null;
  primaryChiefId: string | null;
  /** F017 當責室長姓名（resolvePersonName；查無→null，前端 fallback 顯示員編）。 */
  primaryChiefName: string | null;
  edition: string | null;
  announcedDate: string | null;
  contentSummary: string | null;
}

/** F017 分頁結果（real pagination，取代既有 take(2000)）。 */
export interface DocumentListPage {
  items: DocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface DocumentStore {
  /** 取具指定編號之現存文件（id/編號/狀態），供 F013 唯一性判定（查詢範圍小）。 */
  findNumberHolders(documentNumber: string): Promise<NumberHolder[]>;
  create(input: CreateDocumentInput): Promise<DocumentView>;
  list(filters: DocumentListFilters): Promise<DocumentListPage>;
  findById(id: string): Promise<DocumentView | null>;
  updateStatus(id: string, status: DocumentStatus): Promise<void>;
  /** F011 編輯：以 patch 覆寫（不留歷史、UUID 不變）；回傳覆寫後之完整檢視。 */
  update(id: string, patch: DocumentPatch): Promise<DocumentView>;
}
