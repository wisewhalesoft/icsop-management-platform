import { randomUUID } from 'crypto';
import { bootIntApp, shutdownIntApp, IntCtx, MARK, ADMIN_PASSWORD } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { SyncRun } from '../../src/database/entities/sync-run.entity';
import { hashPassword } from '../../src/accounts/password';
import { TypeOrmOrgChangeAlertStore } from '../../src/org-change-alert/typeorm-org-change-alert.store';
import { OrgChangeAlertService } from '../../src/org-change-alert/org-change-alert.service';
import { SyncAlertInput } from '../../src/org-sync/org-sync.types';
import { ExistingAccount } from '../../src/org-sync/change-classification';

/**
 * [int] F005 剩餘告警縫隙（orgsync-alerts）vs 真 SOP DB。
 *
 * 涵蓋：migration 建欄與兩個 filtered unique 生效（TS-001~005）、DATA_INCONSISTENCY／
 * ACCOUNT_DISAPPEARED 之真實 round-trip（TS-070/072，帳號仍 active）、跨兩次同步去重（TS-071，
 * 服務層＋DB 唯一索引雙層）、resolve 之真實稽核 targetName 正確（TS-073，驗證 D6 修正在真實堆疊生效）、
 * RBAC 403（TS-074）。
 *
 * ⚠ 不隨單元套件執行；由 orchestrator 於合併後序列跑（`npm run test:int`，需 host 能連 SOP）。
 * ⚠ 獨立於既有 org-change-alert.itest.ts（比照 doc-seams 慣例：新縫隙用新 itest 檔，降低合併衝突）。
 *
 * 自帶清理（不改共用 harness.ts）：既有 cleanupMarkers 之 ORG_CHANGE_ALERT 清理僅涵蓋
 * personEmployeeNo LIKE 'ZZINTE%'，未涵蓋本檔之 accountLoginId／新兩類。DATA_INCONSISTENCY 之全量掃描
 * 亦可能對非 marker 之真實在職帳號產生列 → 一併以「兩個新 alertKind」為條件清除（此二 alertKind 為
 * F005 全新、尚未上線，任何此類列皆為測試產物，安全）。marker 帳號沿用 zzint- 前綴（harness 清）。
 */
async function cleanupOrgSyncAlertMarkers(): Promise<void> {
  const q = (sql: string, params?: unknown[]): Promise<unknown> =>
    AppDataSource.query(sql, params);
  await q(
    `DELETE FROM [ORG_CHANGE_ALERT]
       WHERE [accountLoginId] LIKE '${MARK.acct}%'
          OR [alertKind] IN ('DATA_INCONSISTENCY', 'ACCOUNT_DISAPPEARED')`,
  ).catch(() => undefined);
}

describe('[int] F005 離職者相關警示（orgsync-alerts）vs SOP', () => {
  let ctx: IntCtx;
  let syncRunId: string;

  const sysLogin = `${MARK.acct}oasys`;
  const deptContactLogin = `${MARK.acct}oadc`;
  const diLogin = `${MARK.acct}orgsyncdi`; // DATA_INCONSISTENCY marker（在職＋過去 RESIGNDT）
  const vanLogin = `${MARK.acct}orgsyncvan`; // ACCOUNT_DISAPPEARED marker（本地在職、來源查無）
  const RAW_KEY = `${MARK.acct}x1`; // TS-002~005 raw insert 用之獨立鍵
  const PAST = new Date('2024-01-01T00:00:00.000Z');

  const q = (sql: string, params?: unknown[]): Promise<unknown> =>
    AppDataSource.query(sql, params);

  function alertService(): OrgChangeAlertService {
    return new OrgChangeAlertService(
      new TypeOrmOrgChangeAlertStore(AppDataSource),
      undefined,
      () => new Date(),
    );
  }

  /** DATA_INCONSISTENCY 情境：orgUnits 空、無消失；全量掃描真實在職帳號（含 di marker）。 */
  function inconInput(): SyncAlertInput {
    return {
      runId: syncRunId,
      companyCode: 'AS',
      orgUpdates: [],
      orgBefore: new Map(),
      orgUnits: [],
      accountUpdates: [],
      existingAcc: new Map(),
      disappearedLoginIds: [],
    };
  }

  /** ACCOUNT_DISAPPEARED 情境：由 disappearedLoginIds 驅動，existingAcc 提供消失前快照。 */
  function vanishInput(): SyncAlertInput {
    const acc: ExistingAccount = {
      companyCode: 'AS',
      loginId: vanLogin,
      employeeNo: `${MARK.emp}VAN`,
      name: 'ZZINT 消失者',
      email: null,
      orgCode: 'ZZ998',
      status: 'active',
      resignDate: null,
      hireDate: null,
      managerEmpNo: null,
    };
    return {
      runId: syncRunId,
      companyCode: 'AS',
      orgUpdates: [],
      orgBefore: new Map(),
      orgUnits: [],
      accountUpdates: [],
      existingAcc: new Map([[vanLogin, acc]]),
      disappearedLoginIds: [vanLogin],
    };
  }

  beforeAll(async () => {
    ctx = await bootIntApp();
    await cleanupOrgSyncAlertMarkers();

    const accRepo = AppDataSource.getRepository(Account);
    // SysAdmin marker（可處理提示）。
    await accRepo.save(
      accRepo.create({
        companyCode: 'AS',
        loginId: sysLogin,
        roleCode: 'SysAdmin',
        status: 'active',
        source: 'manual',
        name: 'ZZINT F005 系統管理員',
        email: `${sysLogin}@zzint.local`,
        passwordHash: hashPassword(ADMIN_PASSWORD),
      }),
    );
    // DeptContact marker（RBAC 403）。
    await accRepo.save(
      accRepo.create({
        companyCode: 'AS',
        loginId: deptContactLogin,
        roleCode: 'DeptContact',
        status: 'active',
        source: 'manual',
        name: 'ZZINT 部門窗口',
        email: `${deptContactLogin}@zzint.local`,
        passwordHash: hashPassword(ADMIN_PASSWORD),
      }),
    );
    // DATA_INCONSISTENCY marker：在職上游帳號，但 resignDate 為過去日（上游資料矛盾）。
    await accRepo.save(
      accRepo.create({
        companyCode: 'AS',
        loginId: diLogin,
        employeeNo: `${MARK.emp}DI`,
        roleCode: 'User',
        status: 'active',
        source: 'upstream',
        name: 'ZZINT 資料矛盾者',
        orgCode: 'ZZ998',
        resignDate: PAST,
      }),
    );
    // ACCOUNT_DISAPPEARED marker：本地在職上游帳號（其來源列本次查無，由 disappearedLoginIds 驅動）。
    await accRepo.save(
      accRepo.create({
        companyCode: 'AS',
        loginId: vanLogin,
        employeeNo: `${MARK.emp}VAN`,
        roleCode: 'User',
        status: 'active',
        source: 'upstream',
        name: 'ZZINT 消失者',
        orgCode: 'ZZ998',
      }),
    );

    // marker SYNC_RUN（sourceSyncRunId FK 對象）。
    const runRepo = AppDataSource.getRepository(SyncRun);
    const run = await runRepo.save(
      runRepo.create({
        id: randomUUID(),
        // 🔴 B 階段（多公司）：`SYNC_RUN.compid` 為 NOT NULL（同步互斥鎖與水位改 per-company）。
        compid: 'AS',
        triggerType: 'manual',
        status: 'success',
        changeCount: 0,
        startedAt: new Date(),
        endedAt: new Date(),
        triggeredBy: `${MARK.acct}oa`,
      } as Partial<SyncRun>),
    );
    syncRunId = run.id;
  }, 120000);

  afterAll(async () => {
    await cleanupOrgSyncAlertMarkers();
    await shutdownIntApp(ctx);
  });

  it('TS-ORGALERT-001 migration：accountLoginId 欄位（varchar(20), nullable）＋兩 filtered unique index 存在', async () => {
    const cols = (await q(
      `SELECT [DATA_TYPE], [CHARACTER_MAXIMUM_LENGTH], [IS_NULLABLE]
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME='ORG_CHANGE_ALERT' AND COLUMN_NAME='accountLoginId'`,
    )) as Array<{ DATA_TYPE: string; CHARACTER_MAXIMUM_LENGTH: number; IS_NULLABLE: string }>;
    expect(cols).toHaveLength(1);
    expect(cols[0].DATA_TYPE).toBe('varchar');
    expect(cols[0].CHARACTER_MAXIMUM_LENGTH).toBe(20);
    expect(cols[0].IS_NULLABLE).toBe('YES');

    const idx = (await q(
      `SELECT [name] FROM sys.indexes
       WHERE object_id = OBJECT_ID('ORG_CHANGE_ALERT') AND [name] LIKE 'UQ_ORG_CHANGE_ALERT_login_%'`,
    )) as Array<{ name: string }>;
    // 🔴 改為 arrayContaining（原為精確集合比對）：2026-08-25 角色自動化之
    // `1724630400000-alert-role-downgrade` 新增了第三個同前綴索引
    // `UQ_ORG_CHANGE_ALERT_login_role_downgrade`。本案之標的是 **F005 這兩個索引存在**，
    // 精確集合比對會讓「日後新增任何 alertKind」都必然弄紅這一案，屬誤報而非防護。
    expect(idx.map((r) => r.name).sort()).toEqual(
      expect.arrayContaining([
        'UQ_ORG_CHANGE_ALERT_login_disappeared',
        'UQ_ORG_CHANGE_ALERT_login_inconsistency',
      ]),
    );
  });

  it('TS-ORGALERT-002 filtered unique 阻擋重複 pending（DATA_INCONSISTENCY）', async () => {
    const ins = (): Promise<unknown> =>
      q(
        `INSERT INTO [ORG_CHANGE_ALERT] ([alertKind],[accountLoginId],[status],[createdAt])
         VALUES ('DATA_INCONSISTENCY', @0, 'pending', SYSUTCDATETIME())`,
        [RAW_KEY],
      );
    await ins();
    await expect(ins()).rejects.toThrow(/duplicate key|UQ_ORG_CHANGE_ALERT_login_inconsistency/i);
  });

  it('TS-ORGALERT-003 filtered unique 阻擋重複 pending（ACCOUNT_DISAPPEARED）', async () => {
    const ins = (): Promise<unknown> =>
      q(
        `INSERT INTO [ORG_CHANGE_ALERT] ([alertKind],[accountLoginId],[status],[createdAt])
         VALUES ('ACCOUNT_DISAPPEARED', @0, 'pending', SYSUTCDATETIME())`,
        [RAW_KEY],
      );
    await ins();
    await expect(ins()).rejects.toThrow(/duplicate key|UQ_ORG_CHANGE_ALERT_login_disappeared/i);
  });

  it('TS-ORGALERT-004 相同 accountLoginId、不同 alertKind 同時 pending → 兩者皆允許（索引各自獨立）', async () => {
    // TS-002/003 已各插入一筆 pending（DATA_INCONSISTENCY 與 ACCOUNT_DISAPPEARED），同鍵 RAW_KEY。
    const rows = (await q(
      `SELECT [alertKind] FROM [ORG_CHANGE_ALERT]
       WHERE [accountLoginId]=@0 AND [status]='pending'`,
      [RAW_KEY],
    )) as Array<{ alertKind: string }>;
    expect(rows.map((r) => r.alertKind).sort()).toEqual([
      'ACCOUNT_DISAPPEARED',
      'DATA_INCONSISTENCY',
    ]);
  });

  it('TS-ORGALERT-005 同鍵但既有列為 resolved → 允許新增 pending（歷史多筆）', async () => {
    await q(
      `UPDATE [ORG_CHANGE_ALERT] SET [status]='resolved', [resolutionKind]='NO_CHANGE_NEEDED',
         [resolvedAt]=SYSUTCDATETIME()
       WHERE [accountLoginId]=@0 AND [alertKind]='DATA_INCONSISTENCY' AND [status]='pending'`,
      [RAW_KEY],
    );
    await q(
      `INSERT INTO [ORG_CHANGE_ALERT] ([alertKind],[accountLoginId],[status],[createdAt])
       VALUES ('DATA_INCONSISTENCY', @0, 'pending', SYSUTCDATETIME())`,
      [RAW_KEY],
    );
    const rows = (await q(
      `SELECT [status] FROM [ORG_CHANGE_ALERT]
       WHERE [accountLoginId]=@0 AND [alertKind]='DATA_INCONSISTENCY'`,
      [RAW_KEY],
    )) as Array<{ status: string }>;
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'resolved').length).toBeGreaterThanOrEqual(1);
  });

  it('TS-ORGALERT-070 DATA_INCONSISTENCY round-trip：真實全量掃描 → pending 含該筆、帳號仍 active', async () => {
    await alertService().generateFromSyncPlan(inconInput());

    const pending = (await q(
      `SELECT [id],[accountLoginId],[beforeValue],[afterValue],[sourceSyncRunId]
       FROM [ORG_CHANGE_ALERT]
       WHERE [accountLoginId]=@0 AND [alertKind]='DATA_INCONSISTENCY' AND [status]='pending'`,
      [diLogin],
    )) as Array<Record<string, unknown>>;
    expect(pending).toHaveLength(1);
    expect(pending[0].sourceSyncRunId).toBe(syncRunId);
    expect(String(pending[0].afterValue)).toContain('2024-01-01');

    // 帳號維持啟用（EMPSTS='A' 權威，不因矛盾停用）。
    const acc = (await q(`SELECT [status] FROM [ACCOUNT] WHERE [loginId]=@0`, [
      diLogin,
    ])) as Array<{ status: string }>;
    expect(acc[0].status).toBe('active');
  });

  it('TS-ORGALERT-071 跨兩次呼叫（情境不變）→ 僅 1 筆 pending（服務層去重＋DB 唯一索引雙層）', async () => {
    // 第二次情境完全相同——若服務層去重失效，DB 唯一索引會使本呼叫拋錯而非靜默略過。
    await expect(alertService().generateFromSyncPlan(inconInput())).resolves.toBeUndefined();

    const rows = (await q(
      `SELECT [id] FROM [ORG_CHANGE_ALERT]
       WHERE [accountLoginId]=@0 AND [alertKind]='DATA_INCONSISTENCY' AND [status]='pending'`,
      [diLogin],
    )) as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
  });

  it('TS-ORGALERT-072 ACCOUNT_DISAPPEARED round-trip：pending 含該筆、帳號仍 active', async () => {
    await alertService().generateFromSyncPlan(vanishInput());

    const pending = (await q(
      `SELECT [id],[accountLoginId],[deptOrgCode],[beforeValue],[afterValue]
       FROM [ORG_CHANGE_ALERT]
       WHERE [accountLoginId]=@0 AND [alertKind]='ACCOUNT_DISAPPEARED' AND [status]='pending'`,
      [vanLogin],
    )) as Array<Record<string, unknown>>;
    expect(pending).toHaveLength(1);
    expect(pending[0].deptOrgCode).toBe('ZZ998');
    expect(String(pending[0].beforeValue)).toContain('在職');

    const acc = (await q(`SELECT [status] FROM [ACCOUNT] WHERE [loginId]=@0`, [
      vanLogin,
    ])) as Array<{ status: string }>;
    expect(acc[0].status).toBe('active');
  });

  it('TS-ORGALERT-073 Resolve round-trip → 真實稽核 targetName 正確（驗證 D6 修正在真實堆疊生效）', async () => {
    // 取得 TS-070/071 建立之 DATA_INCONSISTENCY pending 提示 id。
    const pending = (await q(
      `SELECT [id] FROM [ORG_CHANGE_ALERT]
       WHERE [accountLoginId]=@0 AND [alertKind]='DATA_INCONSISTENCY' AND [status]='pending'`,
      [diLogin],
    )) as Array<{ id: string }>;
    expect(pending).toHaveLength(1);
    const alertId = pending[0].id;

    // ICSOPAdmin（adminCookie，唯讀）→ 403。
    const ro = await ctx
      .http()
      .patch(`/admin/org-change-alerts/${alertId}/resolve`)
      .set('Cookie', ctx.adminCookie)
      .send({});
    expect(ro.status).toBe(403);

    // SysAdmin marker → 200 resolved。
    const sysCookie = ctx.cookieFor(sysLogin, 'AS', 'SysAdmin');
    const ok = await ctx
      .http()
      .patch(`/admin/org-change-alerts/${alertId}/resolve`)
      .set('Cookie', sysCookie)
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'resolved', resolutionKind: 'NO_CHANGE_NEEDED' });

    // 稽核經 Outbox 入列（recordAccess → AUDIT_LOG_OUTBOX，payload=AuditRow JSON）。
    // ⚠ AUDIT_LOG 對 targetType='ORG_CHANGE_ALERT' 無 targetNumber 落地欄（buildAuditRow 無對應
    //    case，documentNumber 亦保持 null，比照 F006 既有先例）；targetNumber=accountLoginId 之行為
    //    於單元 TS-ORGALERT-042 驗證。此處驗證真實堆疊之 targetName 依 alertKind 正確分流（D6 修正）。
    const outbox = (await q(
      `SELECT [payload] FROM [AUDIT_LOG_OUTBOX]`,
    )) as Array<{ payload: string }>;
    const mine = outbox
      .map((r) => JSON.parse(r.payload) as { targetType: string; actionType: string; targetName: string | null; accountId: string })
      // 🔴 標籤已於 `0d75800`（換上游人員主來源）由上游欄名改為中文：
      //    `資料不一致（EMPSTS/RESIGNDT）` → `資料不一致（在職狀態／離職日）`
      //    （權威＝`org-change-alert.service.ts` 之 `DATA_INCONSISTENCY` case；
      //     亦符合 error-handling.md#export「代碼欄一律輸出畫面所見之中文標籤」之通則）。
      // ⚠ 本案讀的是 **Outbox pending**，而 `ScheduledAuditRetryService` 每 5 分鐘會把
      //    pending 搬進 AUDIT_LOG 並清掉——排程若正好在 resolve 與本查詢之間觸發，本案會偽紅。
      //    ORG_CHANGE_ALERT 於 AUDIT_LOG 無對象 id 落地欄（見上方註記），改查 AUDIT_LOG 就無法
      //    鎖定是哪一筆，故維持讀 Outbox；偽紅時重跑即可。
      .filter((p) => p.targetType === 'ORG_CHANGE_ALERT' && p.actionType === 'ALERT_RESOLVED' && p.targetName === '資料不一致（在職狀態／離職日）');
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine[0].targetName).not.toBe('掛於已關閉部門');
  });

  it('TS-ORGALERT-074 RBAC：部門窗口呼叫 resolve → 403 PERMISSION_DENIED（真實 guard chain）', async () => {
    const cookie = ctx.cookieFor(deptContactLogin, 'AS', 'DeptContact');
    const res = await ctx
      .http()
      .patch(`/admin/org-change-alerts/${randomUUID()}/resolve`)
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('PERMISSION_DENIED');
  });
});
