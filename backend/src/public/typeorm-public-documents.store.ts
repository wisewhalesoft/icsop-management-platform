import { DataSource, In } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { DocumentStatus } from '../documents/document-status';
import { PublicDocItem } from './public-list';
import { PublicDocumentStore } from './public-documents.store';

/**
 * F019 前台文件 store 之 TypeORM 實作（AppDataSource 單例、延遲初始化）。
 *
 * 🔴 已知落差（F019-test 依賴缺口 #3，flag 給 spec owner）：`DOC_USING_DEPT`（使用部門多值關聯）
 *    **尚未持久化**——`ICSOP_DOCUMENT` 僅有 `draftingDeptId/draftingSectionId`（制定，非使用），
 *    且「使用部門指派」之寫入端（F014/F015 範圍）尚未實作，全庫無使用部門資料來源。
 *    故本 store 暫回 `usingDeptIds: []`，使前台清單「已公告過濾／關鍵字／循環篩選／編號降冪排序」
 *    真實可用；「使用部門置頂」與「部門子樹篩選」在使用部門資料落地前恆為空集合（純邏輯已由
 *    FakeStore 全覆蓋）。待 DOC_USING_DEPT + 寫入端就緒後，於此補 join 即接上。
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

    return docs.map((d) => ({
      id: d.id,
      status: d.status as DocumentStatus,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      lifecycleId: d.lifecycleId,
      lifecycleName: nameMap.get(d.lifecycleId) ?? null,
      usingDeptIds: [], // TODO(DOC_USING_DEPT)：使用部門持久化就緒後補 join。
      draftingDeptId: d.draftingDeptId,
      announcedDate: d.announcedDate ? d.announcedDate.toISOString() : null,
      contentSummary: d.contentSummary,
    }));
  }
}
