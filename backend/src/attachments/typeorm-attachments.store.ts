import { DataSource, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { chunkByParamBudget } from '../org-sync/param-batching';
import { DocumentAttachment } from '../database/entities/document-attachment.entity';
import {
  AttachmentStore,
  DocumentAttachmentRecord,
  SingleAttachmentType,
  UpsertAttachmentInput,
} from './attachments.store';

/** DOCUMENT_ATTACHMENT 之 TypeORM 實作（AppDataSource 單例、延遲初始化）。 */
export class TypeOrmAttachmentStore implements AttachmentStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRecord(d: DocumentAttachment): DocumentAttachmentRecord {
    return {
      id: d.id,
      documentId: d.documentId,
      type: d.type as SingleAttachmentType,
      fileName: d.fileName,
      blobPath: d.blobPath,
      contentType: d.contentType,
      size: Number(d.size), // bigint → number（≤50MB，安全於 Number 範圍）
      uploadedBy: d.uploadedBy,
      uploadedAt: d.uploadedAt,
    };
  }

  async findSingle(
    documentId: string,
    type: SingleAttachmentType,
  ): Promise<DocumentAttachmentRecord | null> {
    const ds = await this.init();
    const d = await ds
      .getRepository(DocumentAttachment)
      .findOne({ where: { documentId, type } });
    return d ? TypeOrmAttachmentStore.toRecord(d) : null;
  }

  /** ⚠ MSSQL 2100 參數上限：單欄 IN 以 chunkByParamBudget 切批（每批 ≤1000）。 */
  async findManyByType(
    documentIds: string[],
    type: SingleAttachmentType,
  ): Promise<DocumentAttachmentRecord[]> {
    const keys = [...new Set(documentIds.filter(Boolean))];
    if (keys.length === 0) return [];
    const ds = await this.init();
    const repo = ds.getRepository(DocumentAttachment);
    const out: DocumentAttachmentRecord[] = [];
    for (const batch of chunkByParamBudget(keys, 1, 1000)) {
      const rows = await repo.find({ where: { documentId: In(batch), type } });
      out.push(...rows.map(TypeOrmAttachmentStore.toRecord));
    }
    return out;
  }

  async upsertSingle(
    input: UpsertAttachmentInput,
  ): Promise<DocumentAttachmentRecord> {
    const ds = await this.init();
    const repo = ds.getRepository(DocumentAttachment);
    const existing = await repo.findOne({
      where: { documentId: input.documentId, type: input.type },
    });
    if (existing) {
      await repo.update(
        { id: existing.id },
        {
          fileName: input.fileName,
          blobPath: input.blobPath,
          contentType: input.contentType,
          size: String(input.size),
          uploadedBy: input.uploadedBy,
          uploadedAt: input.uploadedAt,
        },
      );
      const updated = await repo.findOneByOrFail({ id: existing.id });
      return TypeOrmAttachmentStore.toRecord(updated);
    }
    const saved = await repo.save(
      repo.create({
        id: randomUUID(),
        documentId: input.documentId,
        type: input.type,
        fileName: input.fileName,
        blobPath: input.blobPath,
        contentType: input.contentType,
        size: String(input.size),
        uploadedBy: input.uploadedBy,
        uploadedAt: input.uploadedAt,
      }),
    );
    return TypeOrmAttachmentStore.toRecord(saved);
  }

  async findByBlobPath(
    blobPath: string,
  ): Promise<DocumentAttachmentRecord | null> {
    const ds = await this.init();
    const d = await ds
      .getRepository(DocumentAttachment)
      .findOne({ where: { blobPath } });
    return d ? TypeOrmAttachmentStore.toRecord(d) : null;
  }
}
