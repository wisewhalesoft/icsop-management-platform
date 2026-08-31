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
import {
  ExistingOrgUnit,
  ExistingAccount,
  ExistingJobTitle,
  ExistingJobPosition,
} from './change-classification';
import { OrgUnit } from '../database/entities/org-unit.entity';
import { Account } from '../database/entities/account.entity';
import { JobTitle } from '../database/entities/job-title.entity';
import { JobPosition } from '../database/entities/job-position.entity';
import { SyncRun } from '../database/entities/sync-run.entity';
import { jobTitleKey } from '../org-directory/job-title-directory';
import { jobPositionKey } from '../org-directory/job-position-directory';
import type { DerivationAccount, RoleDerivationPlan } from './role-derivation';

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

  async hasRunningSyncRun(compid: string): Promise<boolean> {
    const ds = await this.ensureInit();
    const n = await ds.getRepository(SyncRun).countBy({ compid, status: 'running' });
    return n > 0;
  }

  async createSyncRun(input: {
    compid: string;
    triggerType: TriggerType;
    triggeredBy?: string | null;
    startedAt: Date;
  }): Promise<string> {
    const ds = await this.ensureInit();
    const id = randomUUID();
    await ds.getRepository(SyncRun).insert({
      id,
      compid: input.compid,
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
      // F006 KPI 細分（D7）；未帶（失敗收尾）→ 落 0，使 KPI 加總不必處理 NULL 語意分歧。
      accountsCreated: patch.accountsCreated ?? 0,
      accountsUpdated: patch.accountsUpdated ?? 0,
      accountsDisabled: patch.accountsDisabled ?? 0,
      // 2026-08-31 delta：跳過旗標未帶（失敗收尾）→ false；兩個數字未帶 → null
      //   （與 KPI 三欄之「未帶落 0」刻意不同：那三欄之 0 是真實語意「本次沒有」，
      //    而「本次推導動了 0 筆」與「本次根本沒跑到推導」是兩件事，不可混為 0）。
      roleDerivationSkipped: patch.roleDerivationSkipped ?? false,
      roleChangeCount: patch.roleChangeCount ?? null,
      roleDerivationBase: patch.roleDerivationBase ?? null,
    };
    if (patch.watermark !== undefined) update.watermark = patch.watermark;
    await ds.getRepository(SyncRun).update({ id }, update);
  }

  async getAccountWatermark(compid: string): Promise<Date | null> {
    const ds = await this.ensureInit();
    const last = await ds.getRepository(SyncRun).findOne({
      where: { compid, status: 'success' },
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
        descFull: o.descFull,
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
        // 必須帶出：classifyAccount 已納入 jobTitleCode 比對，缺此欄會使既有列（NULL）
        // 每次同步都被判為 update（無謂寫入放大），且加欄後之回填無從驗證。
        jobTitleCode: a.jobTitleCode,
        // 同上（jobPositionCode 亦已納入 classifyAccount 比對）。
        jobPositionCode: a.jobPositionCode,
      });
    }
    return m;
  }

  async findJobTitles(): Promise<Map<string, ExistingJobTitle>> {
    const ds = await this.ensureInit();
    // 全公司範圍（跨公司 fallback 需要）；實測 109 列。
    const rows = await ds.getRepository(JobTitle).find();
    const m = new Map<string, ExistingJobTitle>();
    for (const t of rows) {
      m.set(jobTitleKey(t.companyCode, t.code), {
        companyCode: t.companyCode,
        code: t.code,
        name: t.name,
      });
    }
    return m;
  }

  async findJobPositions(): Promise<Map<string, ExistingJobPosition>> {
    const ds = await this.ensureInit();
    // 全公司範圍（帳號清單跨公司可見，逐列以該列 companyCode 解析）；實測 73 列。
    const rows = await ds.getRepository(JobPosition).find();
    const m = new Map<string, ExistingJobPosition>();
    for (const p of rows) {
      m.set(jobPositionKey(p.companyCode, p.code), {
        companyCode: p.companyCode,
        code: p.code,
        name: p.name,
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
      compid: r.compid,
      triggerType: r.triggerType as SyncRunSummary['triggerType'],
      status: r.status as SyncRunSummary['status'],
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      changeCount: r.changeCount,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      // 2026-08-31 delta：bit 於 mssql driver 回 boolean；歷史列（migration 之前）之
      // DEFAULT 0 已由 migration 回填，故 ?? false 僅為型別收斂，非掩蓋 null。
      roleDerivationSkipped: r.roleDerivationSkipped ?? false,
      roleChangeCount: r.roleChangeCount ?? null,
      roleDerivationBase: r.roleDerivationBase ?? null,
    }));
  }

  /**
   * 🔴 角色推導之來源投影（2026-08-25 delta）。
   *
   * ⚠ **以 `roleSource='derived'` 過濾於 SQL**，非載回後才篩：
   *    閾值之分母必須是「本次納入推導者」——若把 `'manual'` 也算進分母，
   *    鎖定的帳號愈多、保護反而愈鬆（同樣的變更筆數會被稀釋成較小的比例）。
   *
   * ⚠ 不限 `source`：上游帳號與手動帳號皆可能為 `'derived'`
   *    （手動帳號於 migration 已回填為 `'manual'`，故實務上只會取到上游列；
   *    此處刻意不再以 `source` 二次過濾——旗標才是權威，不是來源）。
   */
  async findAccountsForDerivation(compid: string): Promise<DerivationAccount[]> {
    const ds = await this.ensureInit();
    const rows = await ds.getRepository(Account).find({
      where: { companyCode: compid, roleSource: 'derived' },
    });
    return rows.map((a) => ({
      id: a.id,
      companyCode: a.companyCode,
      loginId: a.loginId,
      employeeNo: a.employeeNo,
      jobTitleCode: a.jobTitleCode,
      roleCode: a.roleCode,
      userSubtype: a.userSubtype,
      roleSource: a.roleSource,
    }));
  }

  /**
   * 🔴 套用推導結果（2026-08-25 delta）。單一交易——部分套用會使角色與子分類處於
   * 互相矛盾的中間狀態，且下次同步不會自動修復（推導只看現值差異）。
   *
   * ⚠ **`roleDowngradeAlerts` 一律不寫**（裁定 Q1.3）：降級須人工確認。
   *    本方法刻意連讀都不讀該欄位，避免日後有人「順手」把它接上。
   *
   * ⚠ **不動 `roleSource`**：推導寫入的列仍維持 `'derived'`，下次同步可再覆寫。
   *    只有人工指派（`assignRole`）才會翻成 `'manual'`。
   */
  async applyRoleDerivation(compid: string, plan: RoleDerivationPlan): Promise<void> {
    const ds = await this.ensureInit();
    await ds.transaction(async (manager) => {
      for (const c of plan.roleUpgrades) {
        // 條件帶 roleSource='derived'：即使計畫產生後、套用前該列剛被人工指派，
        // 這道 WHERE 也會讓本次更新落空（0 列受影響）而不是覆蓋人的決定。
        await manager.update(
          Account,
          { id: c.accountId, roleSource: 'derived' },
          { roleCode: c.to },
        );
      }
      for (const c of plan.subtypeChanges) {
        await manager.update(
          Account,
          { id: c.accountId, roleSource: 'derived' },
          { userSubtype: c.to },
        );
      }
    });
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
        descFull: o.descFull,
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
            descFull: o.descFull,
            managerEmpNo: o.managerEmpNo,
            isActive: o.isActive,
          },
        );
      }
      // 職稱對照主檔（先於帳號寫入，使同批新帳號之 jobTitleCode 立即可解析）。
      // 僅約 109 列，但仍走 chunkByParamBudget 以維持一致性。
      const titleRows = (plan.jobTitleCreates ?? []).map((t) => ({
        id: randomUUID(),
        companyCode: t.companyCode,
        code: t.code,
        name: t.name,
      }));
      if (titleRows.length > 0) {
        const titleFields = Object.keys(titleRows[0]).length;
        for (const batch of chunkByParamBudget(titleRows, titleFields)) {
          await manager.insert(JobTitle, batch);
        }
      }
      for (const t of plan.jobTitleUpdates ?? []) {
        await manager.update(
          JobTitle,
          { companyCode: t.companyCode, code: t.code },
          { name: t.name },
        );
      }

      // 職位對照主檔（同樣先於帳號寫入，使同批新帳號之 jobPositionCode 立即可解析）。
      const positionRows = (plan.jobPositionCreates ?? []).map((p) => ({
        id: randomUUID(),
        companyCode: p.companyCode,
        code: p.code,
        name: p.name,
      }));
      if (positionRows.length > 0) {
        const positionFields = Object.keys(positionRows[0]).length;
        for (const batch of chunkByParamBudget(positionRows, positionFields)) {
          await manager.insert(JobPosition, batch);
        }
      }
      for (const p of plan.jobPositionUpdates ?? []) {
        await manager.update(
          JobPosition,
          { companyCode: p.companyCode, code: p.code },
          { name: p.name },
        );
      }

      // ACCOUNT insert 為 15 欄；AS 首次同步可達 ~2771 列 → 必須切批（否則 39k 參數超限）。
      const accRows = plan.accountCreates.map((a) => ({
        id: randomUUID(),
        companyCode: a.companyCode,
        loginId: a.loginId,
        employeeNo: a.employeeNo,
        name: a.name,
        email: a.email,
        orgCode: a.orgCode,
        managerEmpNo: a.managerEmpNo,
        jobTitleCode: a.jobTitleCode,
        jobPositionCode: a.jobPositionCode,
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
            jobTitleCode: a.jobTitleCode,
            jobPositionCode: a.jobPositionCode,
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
