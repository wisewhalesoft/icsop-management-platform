import { DataSource, In } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { DocUsingDept } from '../database/entities/doc-using-dept.entity';
import { DocumentStatus } from '../documents/document-status';
import { PublicDocItem } from './public-list';
import { PublicDocumentStore } from './public-documents.store';

/** DOC_USING_DEPT 之最小讀取形狀（分組純函式不依賴 entity 全欄）。 */
export interface UsingDeptRow {
  documentId: string;
  orgCode: string;
}

/**
 * `DOC_USING_DEPT` 列 → `Map<documentId, orgCode[]>`（純函式，無 IO，unit 可測）。
 *
 * 刻意**不去重**：`UQ_DOC_USING_DEPT_doc_org` 唯一索引已是唯一性防線，純函式再做防禦性去重
 * 只會掩蓋資料異常。輸入順序即輸出順序（穩定，供快照/斷言可預期）。
 */
export function groupUsingDeptIds(rows: readonly UsingDeptRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.documentId);
    if (list) list.push(r.orgCode);
    else map.set(r.documentId, [r.orgCode]);
  }
  return map;
}

/**
 * F019 前台文件 store 之 TypeORM 實作（AppDataSource 單例、延遲初始化）。
 *
 * 使用部門（`DOC_USING_DEPT`，F014 已建表並於文件建立/編輯路徑寫入）採**分離查詢 + JS 端分組**，
 * 而非 SQL 1:N JOIN——JOIN 會使 `ICSOP_DOCUMENT` 列因一對多而重複展開（需 DISTINCT/GROUP_CONCAT
 * 才能避免文件筆數膨脹）；分離查詢天然不重複，且與同檔既有 `lifecycleName` 解析手法一致
 * （去重 id → 單次 `In()` 查詢 → Map）。查無使用部門列之文件仍保留於清單（`usingDeptIds: []`），
 * 語意等同 LEFT JOIN，不得因無列而消失。
 */
export class TypeOrmPublicDocumentStore implements PublicDocumentStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async listCandidates(): Promise<PublicDocItem[]> {
    const ds = await this.init();
    // 不預先過濾狀態：強制基底條件於服務層純函式套用（AC9 單一權威處）。
    const docs = await ds
      .getRepository(IcsopDocument)
      .createQueryBuilder('d')
      .orderBy('d.documentNumber', 'DESC')
      .take(5000)
      .getMany();

    const lcIds = [...new Set(docs.map((d) => d.lifecycleId))];
    const lcs = lcIds.length
      ? await ds
          .getRepository(Lifecycle)
          .find({ where: { id: In(lcIds) }, select: { id: true, name: true } })
      : [];
    const nameMap = new Map(lcs.map((l) => [l.id, l.name]));

    const docIds = docs.map((d) => d.id);
    const deptRows = docIds.length
      ? await ds.getRepository(DocUsingDept).find({
          where: { documentId: In(docIds) },
          select: { documentId: true, orgCode: true },
        })
      : [];
    const deptMap = groupUsingDeptIds(deptRows);

    return docs.map((d) => ({
      id: d.id,
      status: d.status as DocumentStatus,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      lifecycleId: d.lifecycleId,
      lifecycleName: nameMap.get(d.lifecycleId) ?? null,
      usingDeptIds: deptMap.get(d.id) ?? [],
      draftingDeptId: d.draftingDeptId,
      announcedDate: d.announcedDate ? d.announcedDate.toISOString() : null,
      contentSummary: d.contentSummary,
    }));
  }
}
