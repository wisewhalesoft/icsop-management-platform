import { PublicDocItem } from './public-list';
import { DocumentStatus } from '../documents/document-status';
import { UsingDeptRef } from '../rbac/viewer-scope';

/**
 * F019 前台文件讀取邊界（唯讀組合 DocumentModule 資料，不改 documents.service）。
 *
 * 生產實作 join `ICSOP_DOCUMENT` × `DOC_USING_DEPT`（取 usingDeptIds）；規模小 → load-all + 記憶體
 * 純函式套用強制基底條件/篩選/排序（比照 org-directory 慣例）。真實 SQL 下推（含 index-seek、
 * OFFSET/FETCH 分頁）屬 [integration]（F019-test TS-033~036），本輪 defer。
 */
export const PUBLIC_DOCUMENT_STORE = Symbol('PUBLIC_DOCUMENT_STORE');

/** G-PUB-020 前台文件詳情之附件（唯讀；供下載走既有受控端點）。 */
export interface PublicDetailAttachment {
  type: string;
  fileName: string;
  blobPath: string;
}

/** G-PUB-020 前台文件詳情之使用表單（精簡）。 */
export interface PublicDetailUsageForm {
  id: string;
  name: string;
  format: string;
}

/** G-PUB-020 前台文件詳情之連結點（單向 source→target；附目標編號/書名/目前狀態）。 */
export interface PublicDetailLink {
  targetDocumentId: string;
  targetNumber: string | null;
  targetName: string | null;
  targetStatus: DocumentStatus | null;
}

/**
 * G-PUB-020 前台文件詳情原始組合（store 已 join 之欄位：循環名/節點名/附件/表單/連結）。
 * 組織/人員名稱解析由服務層另補（NameResolutionService）。
 */
export interface PublicDocDetail {
  id: string;
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  nodeId: string | null;
  nodeName: string | null;
  draftingCompanyId: string | null;
  draftingDeptId: string | null;
  draftingSectionId: string | null;
  primaryChiefId: string | null;
  secondaryChiefIds: string[];
  /** 🔴 B 階段（多公司）：帶公司別之使用部門參照（可見性判定所需，見 `UsingDeptRef`）。 */
  usingDepts: UsingDeptRef[];
  /** 🔴 B 階段（多公司）：文件所屬公司（← ICSOP_DOCUMENT.companyCode）。 */
  companyCode: string;
  edition: string | null;
  announcedDate: string | null;
  contentSummary: string | null;
  attachments: PublicDetailAttachment[];
  usageForms: PublicDetailUsageForm[];
  links: PublicDetailLink[];
}

export interface PublicDocumentStore {
  /**
   * 取得全部候選文件（含使用部門集合）。**不預先過濾狀態**——強制基底條件於服務層純函式套用，
   * 使「呼叫端夾帶 status 企圖繞過」之防線（AC9/TS-021）落在單一權威處。
   */
  listCandidates(): Promise<PublicDocItem[]>;

  /**
   * G-PUB-020 單筆詳情（含循環名/節點名/附件/表單/連結之組合）。查無 → null。
   * 強制基底條件（僅「已公告」可見）於服務層套用——store 不預過濾狀態（同 listCandidates 之防線）。
   */
  findDetailById(documentId: string): Promise<PublicDocDetail | null>;
}
