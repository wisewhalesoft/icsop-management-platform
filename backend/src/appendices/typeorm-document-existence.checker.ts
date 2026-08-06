import { DataSource } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { DocumentExistenceChecker } from './appendices.store';

/**
 * documentId 存在性檢查之 TypeORM 實作（唯讀 join DocumentModule 擁有之 ICSOP_DOCUMENT）。
 *
 * ⚠ architecture-spec §3.6 決策二「⚠ 發現」：F039 明列 `DOCUMENT_NOT_FOUND`，故關聯／解除／
 * 詳情端點須主動驗證，**不可**沿用 F018 之「信任外鍵、不主動驗證」模式。
 * 反循環：不匯入 DocumentsModule，自建窄 adapter 直接讀實體（唯讀 join 不構成循環依賴，§3.1）。
 */
export class TypeOrmDocumentExistenceChecker implements DocumentExistenceChecker {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async exists(documentId: string): Promise<boolean> {
    const ds = await this.init();
    const count = await ds
      .getRepository(IcsopDocument)
      .count({ where: { id: documentId } });
    return count > 0;
  }
}
