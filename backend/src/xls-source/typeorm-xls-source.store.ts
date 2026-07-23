import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { DocSourceXls } from '../database/entities/doc-source-xls.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import {
  DocumentEditionReader,
  UpsertXlsSourceInput,
  XlsSourceRecord,
  XlsSourceStore,
} from './xls-source.store';

/** DOC_SOURCE_XLS 之 TypeORM 實作（AppDataSource 單例、延遲初始化）。 */
export class TypeOrmXlsSourceStore implements XlsSourceStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRecord(d: DocSourceXls): XlsSourceRecord {
    return {
      id: d.id,
      documentId: d.documentId,
      blobPath: d.blobPath,
      fileName: d.fileName,
      contentType: d.contentType,
      size: Number(d.size),
      edition: d.edition,
      uploadedBy: d.uploadedBy,
      uploadedAt: d.uploadedAt,
    };
  }

  async findByDocument(documentId: string): Promise<XlsSourceRecord | null> {
    const ds = await this.init();
    const d = await ds
      .getRepository(DocSourceXls)
      .findOne({ where: { documentId } });
    return d ? TypeOrmXlsSourceStore.toRecord(d) : null;
  }

  async upsert(input: UpsertXlsSourceInput): Promise<XlsSourceRecord> {
    const ds = await this.init();
    const repo = ds.getRepository(DocSourceXls);
    const existing = await repo.findOne({
      where: { documentId: input.documentId },
    });
    if (existing) {
      await repo.update(
        { id: existing.id },
        {
          blobPath: input.blobPath,
          fileName: input.fileName,
          contentType: input.contentType,
          size: String(input.size),
          edition: input.edition,
          uploadedBy: input.uploadedBy,
          uploadedAt: input.uploadedAt,
        },
      );
      const updated = await repo.findOneByOrFail({ id: existing.id });
      return TypeOrmXlsSourceStore.toRecord(updated);
    }
    const saved = await repo.save(
      repo.create({
        id: randomUUID(),
        documentId: input.documentId,
        blobPath: input.blobPath,
        fileName: input.fileName,
        contentType: input.contentType,
        size: String(input.size),
        edition: input.edition,
        uploadedBy: input.uploadedBy,
        uploadedAt: input.uploadedAt,
      }),
    );
    return TypeOrmXlsSourceStore.toRecord(saved);
  }
}

/** 文件版次讀取（快照 ICSOP_DOCUMENT.edition）。 */
export class TypeOrmDocumentEditionReader implements DocumentEditionReader {
  constructor(private readonly ds: DataSource) {}
  async getEdition(documentId: string): Promise<string | null> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    const d = await this.ds
      .getRepository(IcsopDocument)
      .findOne({ where: { id: documentId }, select: { id: true, edition: true } });
    return d?.edition ?? null;
  }
}
