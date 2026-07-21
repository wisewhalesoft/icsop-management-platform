import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { chunkByParamBudget } from './param-batching';
import {
  OrgSyncStore,
  SyncPlan,
  FinishSyncRunPatch,
  TriggerType,
  SyncRunSummary,
} from './org-sync.types';
import { ExistingOrgUnit, ExistingAccount } from './change-classification';
import { OrgUnit } from '../database/entities/org-unit.entity';
import { Account } from '../database/entities/account.entity';
import { SyncRun } from '../database/entities/sync-run.entity';

/**
 * 本地寫入端（實際 IO，TypeORM/MSSQL）。
 * 互斥鎖＝「是否已有 running 之 SYNC_RUN」；applySync 於單一交易套用全部異動（AC3 回滾一致性）。
 * DataSource 延遲初始化（不於 app 啟動即連線），每個方法前確保 isInitialized。
 */
export class TypeOrmOrgSyncStore implements OrgSyncStore {
  constructor(private readonly ds: DataSource) {}

  private async ensureInit(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async hasRunningSyncRun(): Promise<boolean> {
    const ds = await this.ensureInit();
    const n = await ds.getRepository(SyncRun).countBy({ status: 'running' });
    return n > 0;
  }

  async createSyncRun(input: {
    triggerType: TriggerType;
    triggeredBy?: string | null;
    startedAt: Date;
  }): Promise<string> {
    const ds = await this.ensureInit();
    const id = randomUUID();
    await ds.getRepository(SyncRun).insert({
      id,
      triggerType: input.triggerType,
      triggeredBy: input.triggeredBy ?? null,
      startedAt: input.startedAt,
      status: 'running',
      changeCount: 0,
    });
    return id;
  }

  async finishSyncRun(id: string, patch: FinishSyncRunPatch): Promise<void> {
    const ds = await this.ensureInit();
    const update: Record<string, unknown> = {
      status: patch.status,
      changeCount: patch.changeCount,
      endedAt: patch.endedAt,
      errorCode: patch.errorCode ?? null,
      errorMessage: patch.errorMessage ?? null,
    };
    if (patch.watermark !== undefined) update.watermark = patch.watermark;
    await ds.getRepository(SyncRun).update({ id }, update);
  }

  async getAccountWatermark(_compid: string): Promise<Date | null> {
    const ds = await this.ensureInit();
    const last = await ds.getRepository(SyncRun).findOne({
      where: { status: 'success' },
      order: { endedAt: 'DESC' },
    });
    return last?.watermark ?? null;
  }

  async listActiveAccountLoginIds(compid: string): Promise<string[]> {
    const ds = await this.ensureInit();
    const rows = await ds.getRepository(Account).find({
      where: { companyCode: compid, source: 'upstream', status: 'active' },
      select: { loginId: true },
    });
    return rows.map((r) => r.loginId);
  }

  async findOrgUnits(compid: string): Promise<Map<string, ExistingOrgUnit>> {
    const ds = await this.ensureInit();
    const rows = await ds.getRepository(OrgUnit).find({ where: { companyCode: compid } });
    const m = new Map<string, ExistingOrgUnit>();
    for (const o of rows) {
      m.set(o.orgCode, {
        orgCode: o.orgCode,
        codePrefix: o.codePrefix,
        tier: o.tier,
        parentCode: o.parentCode,
        name: o.name,
        managerEmpNo: o.managerEmpNo,
        isActive: o.isActive,
      });
    }
    return m;
  }

  async findExistingAccounts(compid: string): Promise<Map<string, ExistingAccount>> {
    const m = new Map<string, ExistingAccount>();
    const ds = await this.ensureInit();
    // 一次載入該公司全部 upstream 帳號（AS ~2771 筆，單一 WHERE companyCode=@0）。
    // 刻意不用 loginId IN(…全部來源鍵…)：會產生數千參數，超過 MSSQL 2100 上限。
    const rows = await ds.getRepository(Account).find({
      where: { companyCode: compid, source: 'upstream' },
    });
    for (const a of rows) {
      m.set(a.loginId, {
        companyCode: a.companyCode,
        loginId: a.loginId,
        employeeNo: a.employeeNo,
        name: a.name,
        email: a.email,
        orgCode: a.orgCode,
        status: a.status === 'disabled' ? 'disabled' : 'active',
        resignDate: a.resignDate,
        hireDate: a.hireDate,
        managerEmpNo: a.managerEmpNo,
      });
    }
    return m;
  }

  async listRecentRuns(limit: number): Promise<SyncRunSummary[]> {
    const ds = await this.ensureInit();
    const rows = await ds.getRepository(SyncRun).find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      triggerType: r.triggerType as SyncRunSummary['triggerType'],
      status: r.status as SyncRunSummary['status'],
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      changeCount: r.changeCount,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
    }));
  }

  async applySync(compid: string, plan: SyncPlan): Promise<void> {
    const ds = await this.ensureInit();
    await ds.transaction(async (manager) => {
      // 批次 INSERT 依 MSSQL 2100 參數上限切批（列數×欄位數）。ORG_UNIT insert 為 9 欄。
      const orgRows = plan.orgCreates.map((o) => ({
        id: randomUUID(),
        companyCode: o.companyCode,
        orgCode: o.orgCode,
        codePrefix: o.codePrefix,
        parentCode: o.parentCode,
        tier: o.tier,
        name: o.name,
        managerEmpNo: o.managerEmpNo,
        isActive: o.isActive,
      }));
      // fieldsPerRow 由實際 insert 物件之 key 數推導（自我修正，避免硬編欄位數與實際欄位漂移
      // 而再次踩到 MSSQL 2100 參數上限——此為 2026-07-21 實跑抓到之 bug 根因）。
      if (orgRows.length > 0) {
        const orgFields = Object.keys(orgRows[0]).length;
        for (const batch of chunkByParamBudget(orgRows, orgFields)) {
          await manager.insert(OrgUnit, batch);
        }
      }
      for (const o of plan.orgUpdates) {
        await manager.update(
          OrgUnit,
          { companyCode: o.companyCode, orgCode: o.orgCode },
          {
            codePrefix: o.codePrefix,
            parentCode: o.parentCode,
            tier: o.tier,
            name: o.name,
            managerEmpNo: o.managerEmpNo,
            isActive: o.isActive,
          },
        );
      }
      // ACCOUNT insert 為 13 欄；AS 首次同步可達 ~2771 列 → 必須切批（否則 36k 參數超限）。
      const accRows = plan.accountCreates.map((a) => ({
        id: randomUUID(),
        companyCode: a.companyCode,
        loginId: a.loginId,
        employeeNo: a.employeeNo,
        name: a.name,
        email: a.email,
        orgCode: a.orgCode,
        managerEmpNo: a.managerEmpNo,
        resignDate: a.resignDate,
        hireDate: a.hireDate,
        upstreamModifiedAt: a.upstreamModifiedAt,
        roleCode: 'User', // 上游新建帳號預設最低角色；角色調升由 F003 手動處理
        status: 'active',
        source: 'upstream',
      }));
      if (accRows.length > 0) {
        const accFields = Object.keys(accRows[0]).length;
        for (const batch of chunkByParamBudget(accRows, accFields)) {
          await manager.insert(Account, batch);
        }
      }
      for (const a of plan.accountUpdates) {
        await manager.update(
          Account,
          { companyCode: a.companyCode, loginId: a.loginId },
          {
            employeeNo: a.employeeNo,
            name: a.name,
            email: a.email,
            orgCode: a.orgCode,
            managerEmpNo: a.managerEmpNo,
            resignDate: a.resignDate,
            hireDate: a.hireDate,
            upstreamModifiedAt: a.upstreamModifiedAt,
            status: 'active', // 誤判恢復時一併清除停用軌跡
            disableReason: null,
            disabledAt: null,
          },
        );
      }
      for (const d of plan.accountDisables) {
        await manager.update(
          Account,
          { companyCode: d.companyCode, loginId: d.loginId },
          { status: 'disabled', disableReason: d.reason, disabledAt: d.disabledAt },
        );
      }
    });
  }
}
