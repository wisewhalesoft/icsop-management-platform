import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import {
  DOCUMENT_CHANGE_LOG_STORE,
  DocumentChangeLogRow,
  DocumentChangeLogStore,
} from './document-change-log.store';
import {
  DocumentChangeFilters,
  filterDocumentChanges,
} from './document-change-query';

/** 檢視稽核所需之操作者身分快照（與浮水印/稽核同一來源；由 controller 自 SessionUser 帶入）。 */
export interface ChangeHistoryActor {
  accountId: string;
  name?: string | null;
  employeeNo?: string | null;
  company?: string | null;
  department?: string | null;
  section?: string | null;
  roleCode?: string | null;
}

/**
 * F037 程序書變更歷程查詢服務。
 *  - queryChanges：載入全部 → 純函式篩選/排序（時間新到舊）。清單為篩選操作，不寫稽核。
 *  - viewDocument：取單一文件之變更列 ＋ 記一筆 CHANGE_LOG_VIEW 稽核（targetId=documentId，AC）。
 *    稽核經 AuditWriter Outbox 非阻斷；寫入失敗不阻斷檢視（比照 F023/F036）。
 * AuditWriter 選填，避免破壞既有純建構單測。
 */
@Injectable()
export class DocumentChangeHistoryService {
  constructor(
    @Inject(DOCUMENT_CHANGE_LOG_STORE)
    private readonly store: DocumentChangeLogStore,
    @Optional() private readonly audit?: AuditWriterService,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {}

  async queryChanges(
    filters: DocumentChangeFilters,
  ): Promise<{ items: DocumentChangeLogRow[]; total: number }> {
    const all = await this.store.listAll();
    const items = filterDocumentChanges(all, filters);
    return { items, total: items.length };
  }

  /** 展開某文件之欄位層 before/after ＋ 記 CHANGE_LOG_VIEW 稽核。 */
  async viewDocument(
    documentId: string,
    actor?: ChangeHistoryActor,
  ): Promise<{ items: DocumentChangeLogRow[] }> {
    const rows = await this.store.listByDocument(documentId);
    const items = rows
      .slice()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    if (this.audit && actor) {
      const latest = items[0];
      await this.audit.recordAccess({
        targetType: 'DOCUMENT_CHANGE_LOG',
        actionType: 'CHANGE_LOG_VIEW',
        actorId: actor.accountId,
        actorName: actor.name ?? null,
        employeeNo: actor.employeeNo ?? null,
        company: actor.company ?? null,
        department: actor.department ?? null,
        section: actor.section ?? null,
        roleCode: actor.roleCode ?? null,
        targetId: documentId,
        targetNumber: latest?.documentNumber ?? null,
        occurredAt: this.clock(),
      });
    }
    return { items };
  }
}
