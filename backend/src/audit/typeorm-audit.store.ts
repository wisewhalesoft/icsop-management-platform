import { DataSource } from 'typeorm';
import { AuditLog } from '../database/entities/audit-log.entity';
import { AuditQueryScope, AuditRow, AuditStore, AuditSource } from './audit.types';

/**
 * AUDIT_LOG 之 TypeORM 實作（append-only）。
 * ⚠ 結構性不可竄改（decision E，AC5 App 層第一層）：本類別**刻意只提供** append/findById/listAll，
 *   不暴露任何 update/delete/remove/save 路徑；DB 層 REVOKE 為第二層（migration，[integration]）。
 * append 以 id 冪等（先查後插；供 Outbox 重試重疊，§5.6）。
 */
export class TypeOrmAuditStore implements AuditStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRow(e: AuditLog): AuditRow {
    return {
      id: e.id,
      accountId: e.accountId,
      employeeNo: e.employeeNo,
      name: e.name,
      company: e.company,
      department: e.department,
      section: e.section,
      roleCode: e.roleCode,
      targetType: e.targetType as AuditRow['targetType'],
      actionType: e.actionType as AuditRow['actionType'],
      documentId: e.documentId,
      documentNumber: e.documentNumber,
      lifecycleId: e.lifecycleId,
      lifecycleName: e.lifecycleName,
      formId: e.formId,
      targetName: e.targetName,
      watermarkSnapshot: e.watermarkSnapshot,
      occurredAt: e.occurredAt,
      source: e.source as AuditSource,
    };
  }

  async append(row: AuditRow): Promise<void> {
    const ds = await this.init();
    const repo = ds.getRepository(AuditLog);
    const existing = await repo.findOne({ where: { id: row.id }, select: { id: true } });
    if (existing) return; // 冪等：重複 id 不重寫（append-only，無 UPDATE）
    // insert（非 save）：純新增，無更新語意。
    await repo.insert({
      id: row.id,
      accountId: row.accountId,
      employeeNo: row.employeeNo,
      name: row.name,
      company: row.company,
      department: row.department,
      section: row.section,
      roleCode: row.roleCode,
      targetType: row.targetType,
      actionType: row.actionType,
      documentId: row.documentId,
      documentNumber: row.documentNumber,
      lifecycleId: row.lifecycleId,
      lifecycleName: row.lifecycleName,
      formId: row.formId,
      targetName: row.targetName,
      watermarkSnapshot: row.watermarkSnapshot,
      occurredAt: row.occurredAt,
      source: row.source,
    });
  }

  async findById(id: string): Promise<AuditRow | null> {
    const ds = await this.init();
    const e = await ds.getRepository(AuditLog).findOne({ where: { id } });
    return e ? TypeOrmAuditStore.toRow(e) : null;
  }

  async listAll(_scope: AuditQueryScope): Promise<AuditRow[]> {
    const ds = await this.init();
    // 篩選/排序/分頁於服務層純函式完成（access-history-filter）；此處忠實載回。
    // ⚠ 全量載回為 [integration] 效能關注點（NFR-001）——正式版應下推 WHERE/ORDER/OFFSET，
    //   於索引 (documentId,occurredAt)/(accountId,occurredAt) 上查詢，見 TS-F024-017（deferred）。
    const rows = await ds.getRepository(AuditLog).find({ order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmAuditStore.toRow);
  }
}
