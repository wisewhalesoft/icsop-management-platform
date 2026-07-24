import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import {
  DOCUMENT_CHANGE_LOG_STORE,
  DocumentChangeLogRow,
  DocumentChangeLogStore,
} from './document-change-log.store';
import {
  DOCUMENT_NAME_LOOKUP,
  DocumentNameLookup,
} from './document-name-lookup';
import {
  DocumentChangeFilters,
  filterDocumentChanges,
} from './document-change-query';

/**
 * G-LC-023 程序書變更列 + 現行書名（documentName，自 ICSOP_DOCUMENT 併入）。
 * DocumentChangeLogRow 之超集，故既有期望 row 之呼叫端不受影響。
 */
export interface DocumentChangeView extends DocumentChangeLogRow {
  documentName: string | null;
}

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
    // G-LC-023 現行書名併入。選填以免破壞既有 new DocumentChangeHistoryService(store[, audit]) 單測（無→書名 null）。
    @Optional()
    @Inject(DOCUMENT_NAME_LOOKUP)
    private readonly docNames?: DocumentNameLookup,
  ) {}

  async queryChanges(
    filters: DocumentChangeFilters,
  ): Promise<{ items: DocumentChangeView[]; total: number }> {
    const all = await this.store.listAll();
    const filtered = filterDocumentChanges(all, filters);
    const items = await this.enrichNames(filtered);
    return { items, total: items.length };
  }

  /**
   * G-LC-023：以現行 ICSOP_DOCUMENT.documentName 併入變更列（去重批次；無 lookup→書名 null）。
   * documentName 為**現行值**（非快照）——程序書 cell 顯示「書名」行需即時書名。
   */
  private async enrichNames(
    rows: DocumentChangeLogRow[],
  ): Promise<DocumentChangeView[]> {
    if (!this.docNames || rows.length === 0) {
      return rows.map((r) => ({ ...r, documentName: null }));
    }
    const ids = [...new Set(rows.map((r) => r.documentId).filter(Boolean))];
    const nameMap = await this.docNames.findNamesByIds(ids);
    return rows.map((r) => ({ ...r, documentName: nameMap.get(r.documentId) ?? null }));
  }

  /** 展開某文件之欄位層 before/after ＋ 記 CHANGE_LOG_VIEW 稽核。 */
  async viewDocument(
    documentId: string,
    actor?: ChangeHistoryActor,
  ): Promise<{ items: DocumentChangeView[] }> {
    const rows = await this.store.listByDocument(documentId);
    const sorted = rows
      .slice()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const items = await this.enrichNames(sorted);

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
        // OQ-AQ-04：填入 targetName（F024「對象名稱」欄，變更-kind 稽核列先前恆顯示「—」）。
        // 變更日誌列僅有文件編號快照（無 documentName），故以編號作為描述性文字（比照 F036 lc.name 之 number=name 慣例）。
        targetName: latest?.documentNumber ?? null,
        occurredAt: this.clock(),
      });
    }
    return { items };
  }
}
