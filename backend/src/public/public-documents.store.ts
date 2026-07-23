import { PublicDocItem } from './public-list';

/**
 * F019 前台文件讀取邊界（唯讀組合 DocumentModule 資料，不改 documents.service）。
 *
 * 生產實作 join `ICSOP_DOCUMENT` × `DOC_USING_DEPT`（取 usingDeptIds）；規模小 → load-all + 記憶體
 * 純函式套用強制基底條件/篩選/排序（比照 org-directory 慣例）。真實 SQL 下推（含 index-seek、
 * OFFSET/FETCH 分頁）屬 [integration]（F019-test TS-033~036），本輪 defer。
 */
export const PUBLIC_DOCUMENT_STORE = Symbol('PUBLIC_DOCUMENT_STORE');

export interface PublicDocumentStore {
  /**
   * 取得全部候選文件（含使用部門集合）。**不預先過濾狀態**——強制基底條件於服務層純函式套用，
   * 使「呼叫端夾帶 status 企圖繞過」之防線（AC9/TS-021）落在單一權威處。
   */
  listCandidates(): Promise<PublicDocItem[]>;
}
