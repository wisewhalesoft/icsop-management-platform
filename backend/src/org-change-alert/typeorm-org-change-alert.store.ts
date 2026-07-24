import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import {
  ActiveAccountRef,
  AlertCreateCommand,
  AlertResolvePatch,
  AlertRow,
  AlertStatus,
  DocumentAlertRef,
  MonthlyAccountStats,
  OrgChangeAlertStore,
} from './org-change-alert.types';
import { OrgChangeAlert } from '../database/entities/org-change-alert.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { DocSecondaryChief } from '../database/entities/doc-secondary-chief.entity';
import { DocUsingDept } from '../database/entities/doc-using-dept.entity';
import { Account } from '../database/entities/account.entity';
import { FieldKey } from '../rbac/field-matrix';

/**
 * ORG_CHANGE_ALERT 之 TypeORM 實作（延遲初始化 DataSource，比照既有 store 慣例）。
 *
 * ⚠ 結構上僅提供 insert 與「pending → resolved」之狀態轉移；不暴露 delete/save/upsert
 *   （提示為可追溯之處理紀錄，處理者/時間不得被整列覆寫或抹除）。
 * ⚠ 文件索引與在職帳號皆採 load-all（文件 ~600、AS 帳號 ~2771）：刻意不接受鍵清單，
 *   避免 `IN (…)` 觸發 MSSQL 2100 參數上限（F004 實跑教訓）。
 */
export class TypeOrmOrgChangeAlertStore implements OrgChangeAlertStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRow(e: OrgChangeAlert): AlertRow {
    return {
      id: e.id,
      alertKind: e.alertKind as AlertRow['alertKind'],
      documentId: e.documentId,
      documentNumber: e.documentNumber,
      documentName: e.documentName,
      affectedField: e.affectedField,
      beforeValue: e.beforeValue,
      afterValue: e.afterValue,
      personEmployeeNo: e.personEmployeeNo,
      personName: e.personName,
      deptOrgCode: e.deptOrgCode,
      deptName: e.deptName,
      deptCloseDate: e.deptCloseDate,
      status: e.status as AlertStatus,
      resolutionKind: e.resolutionKind as AlertRow['resolutionKind'],
      resolvedBy: e.resolvedBy,
      resolvedAt: e.resolvedAt,
      createdAt: e.createdAt,
      sourceSyncRunId: e.sourceSyncRunId,
    };
  }

  async listByStatus(status: AlertStatus): Promise<AlertRow[]> {
    const ds = await this.init();
    const rows = await ds.getRepository(OrgChangeAlert).find({
      where: { status },
      order: { createdAt: 'ASC' },
    });
    return rows.map(TypeOrmOrgChangeAlertStore.toRow);
  }

  async findById(id: string): Promise<AlertRow | null> {
    const ds = await this.init();
    const e = await ds.getRepository(OrgChangeAlert).findOne({ where: { id } });
    return e ? TypeOrmOrgChangeAlertStore.toRow(e) : null;
  }

  async findPendingByDocument(documentId: string): Promise<AlertRow[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(OrgChangeAlert)
      .find({ where: { documentId, status: 'pending' }, order: { createdAt: 'ASC' } });
    return rows.map(TypeOrmOrgChangeAlertStore.toRow);
  }

  async insertMany(commands: AlertCreateCommand[]): Promise<void> {
    if (commands.length === 0) return;
    const ds = await this.init();
    const repo = ds.getRepository(OrgChangeAlert);
    // 逐筆插入：DB 層 filtered unique index 為併發第二道防線，單筆違例不應使整批失敗。
    for (const c of commands) {
      await repo.insert({
        id: randomUUID(),
        alertKind: c.alertKind,
        documentId: c.documentId,
        documentNumber: c.documentNumber,
        documentName: c.documentName,
        affectedField: c.affectedField,
        beforeValue: c.beforeValue,
        afterValue: c.afterValue,
        personEmployeeNo: c.personEmployeeNo,
        personName: c.personName,
        deptOrgCode: c.deptOrgCode,
        deptName: c.deptName,
        deptCloseDate: c.deptCloseDate,
        status: 'pending',
        resolutionKind: null,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: c.createdAt,
        sourceSyncRunId: c.sourceSyncRunId,
      });
    }
  }

  /** pending → resolved 之狀態轉移（唯一允許之更新路徑；且僅在仍為 pending 時生效）。 */
  async resolve(id: string, patch: AlertResolvePatch): Promise<void> {
    const ds = await this.init();
    await ds.getRepository(OrgChangeAlert).update(
      { id, status: 'pending' },
      {
        status: 'resolved',
        resolutionKind: patch.resolutionKind,
        resolvedBy: patch.resolvedBy,
        resolvedAt: patch.resolvedAt,
      },
    );
  }

  async monthlyAccountStats(from: Date, to: Date): Promise<MonthlyAccountStats> {
    const ds = await this.init();
    // COALESCE：本 migration 之前之歷史列三欄為 NULL → 視為 0（優雅降級，不使整筆加總變 NULL）。
    const rows = (await ds.query(
      `SELECT
         COALESCE(SUM(COALESCE([accountsCreated], 0)), 0) AS created,
         COALESCE(SUM(COALESCE([accountsUpdated], 0)), 0) AS updated,
         COALESCE(SUM(COALESCE([accountsDisabled], 0)), 0) AS disabled
       FROM [SYNC_RUN]
       WHERE [startedAt] >= @0 AND [startedAt] < @1`,
      [from, to],
    )) as Array<Record<string, unknown>> | undefined;
    const r = rows?.[0];
    return {
      created: num(r?.created),
      updated: num(r?.updated),
      disabled: num(r?.disabled),
    };
  }

  async pendingChiefAlertCount(): Promise<number> {
    const ds = await this.init();
    // 窄口徑（D7）：僅「當責室長-主要/次要」；與頁籤 badge（全部 pending）刻意不同。
    return ds.getRepository(OrgChangeAlert).count({
      where: {
        status: 'pending',
        affectedField: In([FieldKey.CHIEF_PRIMARY, FieldKey.CHIEF_SECONDARY]),
      },
    });
  }

  async listActiveAccounts(companyCode: string): Promise<ActiveAccountRef[]> {
    const ds = await this.init();
    // 白名單欄位（絕不 SELECT *）：§7.3 掃描僅需員編/姓名/部門/狀態。
    const rows = await ds.getRepository(Account).find({
      where: { companyCode, source: 'upstream', status: 'active' },
      select: { employeeNo: true, name: true, orgCode: true, status: true },
    });
    return rows.map((a) => ({
      employeeNo: a.employeeNo,
      name: a.name,
      orgCode: a.orgCode,
      status: a.status === 'disabled' ? 'disabled' : 'active',
    }));
  }

  async listDocumentRefs(): Promise<DocumentAlertRef[]> {
    const ds = await this.init();
    const docs = await ds.getRepository(IcsopDocument).find({
      select: {
        id: true,
        documentNumber: true,
        documentName: true,
        draftingCompanyId: true,
        draftingDeptId: true,
        draftingSectionId: true,
        primaryChiefId: true,
      },
    });
    const chiefs = await ds.getRepository(DocSecondaryChief).find();
    const depts = await ds.getRepository(DocUsingDept).find();
    const chiefByDoc = new Map<string, string[]>();
    for (const c of chiefs) {
      const arr = chiefByDoc.get(c.documentId);
      if (arr) arr.push(c.employeeNo);
      else chiefByDoc.set(c.documentId, [c.employeeNo]);
    }
    const deptByDoc = new Map<string, string[]>();
    for (const d of depts) {
      const arr = deptByDoc.get(d.documentId);
      if (arr) arr.push(d.orgCode);
      else deptByDoc.set(d.documentId, [d.orgCode]);
    }
    return docs.map((d) => ({
      documentId: d.id,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      draftingCompanyId: d.draftingCompanyId,
      draftingDeptId: d.draftingDeptId,
      draftingSectionId: d.draftingSectionId,
      primaryChiefId: d.primaryChiefId,
      secondaryChiefIds: chiefByDoc.get(d.id) ?? [],
      usingDeptIds: deptByDoc.get(d.id) ?? [],
    }));
  }
}

/** 驅動程式可能以字串回傳彙總值；null/undefined/NaN 一律視為 0。 */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
