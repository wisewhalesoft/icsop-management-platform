import { DataSource } from 'typeorm';
import { AuditLog } from '../database/entities/audit-log.entity';
import {
  AuditQueryFilters,
  AuditQueryScope,
  AuditRow,
  AuditSource,
  AuditStore,
  Page,
} from './audit.types';
import {
  buildAuditPage,
  likeContains,
  localDayEndExclusive,
  localDayStart,
  resolveAuditQuerySpec,
} from './access-history-filter';

/**
 * AUDIT_LOG 之 TypeORM 實作（append-only）。
 * ⚠ 結構性不可竄改（decision E，AC5 App 層第一層）：本類別**刻意只提供** append/findById/listAll/queryPage，
 *   不暴露任何 update/delete/remove/save 路徑；DB 層 REVOKE 為第二層（migration，[integration]）。
 * append 以 id 冪等（先查後插；供 Outbox 重試重疊，§5.6）。
 * queryPage 為 F024 查詢路徑：WHERE/ORDER/OFFSET-FETCH 皆下推 SQL（OQ-AQ-01），僅回傳當頁列。
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
    // ⚠ 全量載回（無 WHERE）——非 F024 查詢路徑（見 queryPage）。保留僅供不可竄改結構性防禦之對照
    //   （decision E／TS-012）與相容；正式查詢一律走 queryPage 之 SQL 下推，避免全表掃描/OOM（OQ-AQ-01）。
    const rows = await ds.getRepository(AuditLog).find({ order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmAuditStore.toRow);
  }

  /**
   * F024 查詢（OQ-AQ-01 下推）：kind→targetType IN、occurredAt 範圍（本地日界，排他上界）、
   * person（name/employeeNo）＋ target（documentNumber/lifecycleName/targetName）之 LOWER(...) LIKE、
   * ORDER BY occurredAt DESC（id 為決定性次鍵，確保分頁穩定）、OFFSET/FETCH 分頁與 COUNT total
   * 皆於 SQL 完成——僅回傳當頁列，不將全表載回 Node 記憶體。
   *
   * 索引：targetType＋occurredAt 由 IX_AUDIT_LOG_targetType_occurredAt 支援（migration 1723075200000）。
   * person/target 為前置萬用字元之 LIKE（無法 index seek），僅對「已被 WHERE 縮小」之候選集合殘留評估。
   */
  async queryPage(
    _scope: AuditQueryScope,
    filters: AuditQueryFilters,
  ): Promise<Page<AuditRow>> {
    const spec = resolveAuditQuerySpec(filters);
    const ds = await this.init();
    const qb = ds.getRepository(AuditLog).createQueryBuilder('a');

    if (spec.targetTypes) {
      qb.andWhere('a.targetType IN (:...types)', { types: spec.targetTypes });
    }
    if (spec.from) {
      qb.andWhere('a.occurredAt >= :from', { from: localDayStart(spec.from) });
    }
    if (spec.to) {
      qb.andWhere('a.occurredAt < :toExcl', { toExcl: localDayEndExclusive(spec.to) });
    }
    if (spec.person) {
      qb.andWhere(
        "(LOWER(a.name) LIKE :person ESCAPE '\\' OR LOWER(a.employeeNo) LIKE :person ESCAPE '\\')",
        { person: likeContains(spec.person) },
      );
    }
    if (spec.target) {
      qb.andWhere(
        "(LOWER(a.documentNumber) LIKE :target ESCAPE '\\'" +
          " OR LOWER(a.lifecycleName) LIKE :target ESCAPE '\\'" +
          " OR LOWER(a.targetName) LIKE :target ESCAPE '\\')",
        { target: likeContains(spec.target) },
      );
    }

    qb.orderBy('a.occurredAt', 'DESC')
      .addOrderBy('a.id', 'ASC') // 決定性次鍵：occurredAt 相同者跨頁順序穩定，分頁不遺漏/重複
      .skip((spec.page - 1) * spec.pageSize) // → OFFSET n ROWS
      .take(spec.pageSize); // → FETCH NEXT m ROWS ONLY

    const [entities, total] = await qb.getManyAndCount();
    return buildAuditPage(entities.map(TypeOrmAuditStore.toRow), total, spec);
  }
}
