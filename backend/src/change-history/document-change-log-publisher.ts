import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  DocumentChangePublisher,
  DocumentChangedEvent,
} from '../documents/document-change-event';
import {
  DOCUMENT_CHANGE_LOG_STORE,
  DocumentChangeLogRow,
  DocumentChangeLogStore,
} from './document-change-log.store';

/**
 * 文件變更事件 → append-only 落地列之純轉換（F037）。
 *  - 逐 `changes` delta 各產生一列（單次儲存多欄位＝多列，比照 prototype「一次儲存可改多欄」）。
 *  - changes 空/未提供 → 回空陣列（開啟編輯未實際變更即儲存 → 不產生任何日誌，AC）。
 *  - 操作者/文件編號快照缺漏 → 落 null（不擋落地）。
 * 純函式、不做 IO。
 */
export function buildDocumentChangeLogRows(
  event: DocumentChangedEvent,
): DocumentChangeLogRow[] {
  const deltas = event.changes ?? [];
  return deltas.map((d) => ({
    id: randomUUID(),
    documentId: event.documentId,
    documentNumber: event.documentNumber ?? null,
    changeType: event.changeType,
    field: d.field,
    oldValue: d.oldValue ?? null,
    newValue: d.newValue ?? null,
    actorId: event.actorId ?? null,
    actorName: event.actorName ?? null,
    actorEmployeeNo: event.actorEmployeeNo ?? null,
    occurredAt: event.occurredAt,
  }));
}

/**
 * F037 真實變更事件消費者（決策 B）。documents.module 併回後以此覆寫 DOCUMENT_CHANGE_PUBLISHER 綁定。
 * 將 DocumentsService update/setStatus 發出之事件持久化為 DOCUMENT_CHANGE_LOG（欄位層 before/after）。
 * append-only：僅寫入、無更新/刪除路徑。
 */
@Injectable()
export class DocumentChangeLogPublisher implements DocumentChangePublisher {
  constructor(
    @Inject(DOCUMENT_CHANGE_LOG_STORE)
    private readonly store: DocumentChangeLogStore,
  ) {}

  async publish(event: DocumentChangedEvent): Promise<void> {
    const rows = buildDocumentChangeLogRows(event);
    if (rows.length === 0) return;
    await this.store.append(rows);
  }
}
