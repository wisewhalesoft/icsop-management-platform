import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  AlertCreateCommand,
  AlertRow,
  AlertStatus,
  MonthlySummary,
  OrgChangeAlertStore,
  OrgUnitSnapshot,
  ORG_CHANGE_ALERT_STORE,
  ResolutionKind,
} from './org-change-alert.types';
import { generateDocumentFieldAlerts, docFieldKey } from './alert-generation';
import { detectClosedDeptAlerts } from './closed-dept-detection';
import { taipeiMonthRange } from './monthly-range';
import {
  OrgChangeAlertGenerator,
  SyncAlertInput,
} from '../org-sync/org-sync.types';
import { NormalizedOrgUnit } from '../org-sync/normalization';
import { AuditWriter, OrgChangeAlertAuditEvent } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';

/** 提示處理者身分（Route B＝呼叫端 SessionUser；Route A＝原始文件編輯事件之操作者）。 */
export interface AlertActor {
  accountId?: string | null;
  name?: string | null;
  employeeNo?: string | null;
  roleCode?: string | null;
  company?: string | null;
  department?: string | null;
  section?: string | null;
}

/** Route A 自動解除之輸入（由 document-change-subscriber 自變更事件轉譯）。 */
export interface AutoResolveInput {
  documentId: string;
  /** 本次實際變更之欄位所對映之 FieldKey（已由訂閱者過濾）。 */
  affectedFields: string[];
  actor: AlertActor;
  occurredAt: Date;
}

/**
 * F006 組織異動待確認提示服務。
 *
 *  - `generateFromSyncPlan`：同步成功收尾後產生提示（DOCUMENT_FIELD ＋ CLOSED_DEPT_PERSON）。
 *    ⚠ 全程**不寫入任何文件欄位、不停用任何帳號**（AC3／AC9）——store 介面結構上僅提供
 *      ORG_CHANGE_ALERT 之寫入與唯讀查詢，無帳號/文件寫入方法。
 *  - `resolve`（Route B）／`autoResolveFromDocumentChange`（Route A）：狀態轉 resolved 並記稽核。
 *  - `monthlySummary`：後台總覽 4 張 KPI 卡。
 */
@Injectable()
export class OrgChangeAlertService implements OrgChangeAlertGenerator {
  private readonly logger = new Logger(OrgChangeAlertService.name);

  constructor(
    @Inject(ORG_CHANGE_ALERT_STORE) private readonly store: OrgChangeAlertStore,
    // 選填：無稽核時（純單元測試）解除流程仍完整運作。
    @Optional() private readonly audit?: AuditWriter | AuditWriterService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async generateFromSyncPlan(input: SyncAlertInput): Promise<void> {
    const pending = await this.store.listByStatus('pending');
    const existingPendingKeys = new Set<string>();
    const existingPendingEmployeeNos = new Set<string>();
    for (const p of pending) {
      if (p.alertKind === 'DOCUMENT_FIELD' && p.documentId && p.affectedField) {
        existingPendingKeys.add(docFieldKey(p.documentId, p.affectedField));
      } else if (p.alertKind === 'CLOSED_DEPT_PERSON' && p.personEmployeeNo) {
        existingPendingEmployeeNos.add(p.personEmployeeNo);
      }
    }

    const createdAt = this.now();
    const orgAfter = toSnapshotMap(input.orgUnits);
    const documents = await this.store.listDocumentRefs();

    const docAlerts = generateDocumentFieldAlerts({
      orgUpdates: input.orgUpdates,
      orgBefore: input.orgBefore,
      orgAfter,
      accountUpdates: input.accountUpdates,
      existingAcc: input.existingAcc,
      documents,
      existingPendingKeys,
      createdAt,
      sourceSyncRunId: input.runId,
    });

    const activeAccounts = await this.store.listActiveAccounts(input.companyCode);
    const personAlerts = detectClosedDeptAlerts({
      activeAccounts,
      orgUnits: orgAfter,
      existingPendingEmployeeNos,
      createdAt,
      sourceSyncRunId: input.runId,
    });

    const all: AlertCreateCommand[] = [...docAlerts, ...personAlerts];
    if (all.length > 0) await this.store.insertMany(all);
  }

  /** 待確認/已處理清單（依 createdAt；查詢端點）。 */
  listByStatus(status: AlertStatus): Promise<AlertRow[]> {
    return this.store.listByStatus(status);
  }

  /**
   * Route B：管理員手動處理（預設「已確認無需變更」；亦可顯式標記 FIELD_UPDATED 作為人工補登）。
   * 已處理者再次呼叫 → 409（不覆寫既有處理者/時間）。
   */
  async resolve(
    id: string,
    actor: AlertActor,
    resolutionKind: ResolutionKind = 'NO_CHANGE_NEEDED',
  ): Promise<AlertRow> {
    const row = await this.store.findById(id);
    if (!row) throw new NotFoundException('ALERT_NOT_FOUND');
    if (row.status === 'resolved') throw new ConflictException('ALERT_ALREADY_RESOLVED');

    const resolvedAt = this.now();
    const patch = { resolvedBy: actor.accountId ?? null, resolvedAt, resolutionKind };
    await this.store.resolve(id, patch);
    await this.writeAudit(row, actor, resolvedAt);
    return { ...row, status: 'resolved', ...patch };
  }

  /**
   * Route A：文件欄位實際更新 → 自動解除同文件、同欄位之 pending 提示（AC4「管理員更新欄位」路徑）。
   * 不經 resolve 端點、不檢查 ORG_SYNC_MANAGEMENT 權限（授權來自該次合法之文件寫入，D8）。
   */
  async autoResolveFromDocumentChange(input: AutoResolveInput): Promise<void> {
    if (input.affectedFields.length === 0) return;
    const fields = new Set(input.affectedFields);
    const pending = await this.store.findPendingByDocument(input.documentId);
    for (const row of pending) {
      if (row.status !== 'pending') continue;
      if (!row.affectedField || !fields.has(row.affectedField)) continue;
      await this.store.resolve(row.id, {
        resolvedBy: input.actor.accountId ?? null,
        resolvedAt: input.occurredAt,
        resolutionKind: 'FIELD_UPDATED',
      });
      await this.writeAudit(row, input.actor, input.occurredAt);
    }
  }

  /** 後台總覽 KPI（本月＝Asia/Taipei 當月）。 */
  async monthlySummary(): Promise<MonthlySummary> {
    const { month, from, to } = taipeiMonthRange(this.now());
    const stats = await this.store.monthlyAccountStats(from, to);
    const pendingChiefAlertCount = await this.store.pendingChiefAlertCount();
    return {
      month,
      newPersonCount: stats.created,
      updatedCount: stats.updated,
      departedDisabledCount: stats.disabled,
      pendingChiefAlertCount,
    };
  }

  /** 稽核寫入（非阻斷：失敗僅記 log，比照 AuditWriter 既有吞例外慣例）。 */
  private async writeAudit(
    row: AlertRow,
    actor: AlertActor,
    occurredAt: Date,
  ): Promise<void> {
    if (!this.audit || !actor.accountId) return;
    const event: OrgChangeAlertAuditEvent = {
      targetType: 'ORG_CHANGE_ALERT',
      actionType: 'ALERT_RESOLVED',
      targetId: row.id,
      targetNumber:
        row.alertKind === 'DOCUMENT_FIELD' ? row.documentNumber : row.personEmployeeNo,
      targetName:
        row.alertKind === 'DOCUMENT_FIELD' ? row.affectedField : '掛於已關閉部門',
      actorId: actor.accountId,
      actorName: actor.name ?? null,
      employeeNo: actor.employeeNo ?? null,
      roleCode: actor.roleCode ?? null,
      company: actor.company ?? null,
      department: actor.department ?? null,
      section: actor.section ?? null,
      occurredAt,
    };
    try {
      await this.audit.recordAccess(event);
    } catch (e) {
      this.logger.error(
        `提示處理稽核記錄失敗（已吞，不阻斷）alert=${row.id}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}

/** 同步後之全量組織單位 → 以 orgCode 為鍵之快照（供名稱解析與 §7.3 關閉日期）。 */
export function toSnapshotMap(units: NormalizedOrgUnit[]): Map<string, OrgUnitSnapshot> {
  const m = new Map<string, OrgUnitSnapshot>();
  for (const u of units) {
    m.set(u.orgCode, {
      orgCode: u.orgCode,
      name: u.name,
      descFull: u.descFull,
      isActive: u.isActive,
      managerEmpNo: u.managerEmpNo,
      closeDate: u.closeDate ?? null,
    });
  }
  return m;
}
