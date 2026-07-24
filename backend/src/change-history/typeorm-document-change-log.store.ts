import { DataSource } from 'typeorm';
import { DocumentChangeLog } from '../database/entities/document-change-log.entity';
import {
  DocumentChangeLogRow,
  DocumentChangeLogStore,
} from './document-change-log.store';

/**
 * DOCUMENT_CHANGE_LOG 之 TypeORM 實作（append-only）。
 * ⚠ 結構性不可竄改：僅 append/listAll/listByDocument，不暴露 update/delete/save；
 *   DB 層 REVOKE 為第二層（migration，[integration]）。
 */
export class TypeOrmDocumentChangeLogStore implements DocumentChangeLogStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRow(e: DocumentChangeLog): DocumentChangeLogRow {
    return {
      id: e.id,
      documentId: e.documentId,
      documentNumber: e.documentNumber,
      changeType: e.changeType,
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      actorId: e.actorId,
      actorName: e.actorName,
      actorEmployeeNo: e.actorEmployeeNo,
      reason: e.reason,
      occurredAt: e.occurredAt,
    };
  }

  async append(rows: DocumentChangeLogRow[]): Promise<void> {
    if (rows.length === 0) return;
    const ds = await this.init();
    // insert（非 save）：純新增，無更新語意（append-only）。
    await ds.getRepository(DocumentChangeLog).insert(rows.map((r) => ({ ...r })));
  }

  async listAll(): Promise<DocumentChangeLogRow[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(DocumentChangeLog)
      .find({ order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmDocumentChangeLogStore.toRow);
  }

  async listByDocument(documentId: string): Promise<DocumentChangeLogRow[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(DocumentChangeLog)
      .find({ where: { documentId }, order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmDocumentChangeLogStore.toRow);
  }
}
