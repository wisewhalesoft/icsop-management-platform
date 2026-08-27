import { randomUUID } from 'crypto';
import { bootIntApp, shutdownIntApp, IntCtx, MARK, ADMIN_PASSWORD } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { Lifecycle } from '../../src/database/entities/lifecycle.entity';
import { IcsopDocument } from '../../src/database/entities/icsop-document.entity';
import { SyncRun } from '../../src/database/entities/sync-run.entity';
import { hashPassword } from '../../src/accounts/password';
import { TypeOrmOrgChangeAlertStore } from '../../src/org-change-alert/typeorm-org-change-alert.store';
import { OrgChangeAlertService } from '../../src/org-change-alert/org-change-alert.service';
import { SyncAlertInput } from '../../src/org-sync/org-sync.types';
import { NormalizedOrgUnit } from '../../src/org-sync/normalization';
import { FieldKey } from '../../src/rbac/field-matrix';

/**
 * [int] F006 組織異動待確認提示 vs 真 SOP DB（§3.12）。
 *
 * 涵蓋：migration 建表與 filtered unique 生效（TS-001~004）、提示生命週期 round-trip（TS-076）、
 * 跨兩次同步之去重（TS-077，服務層與 DB 唯一索引雙層一致）、RBAC 403（TS-078）、
 * KPI 加總（TS-079）、pending 期間文件欄位不被覆寫（TS-033）。
 *
 * ⚠ 不隨單元套件執行；由 orchestrator 於合併後序列跑（`npm run test:int`，需 host 能連 SOP）。
 * marker：文件編號 `ZZINT-`、循環 `ZZINT_LC_`、帳號 `zzint-`、提示員編 `ZZINTE`（見 harness.MARK）、
 *         SYNC_RUN 以 triggeredBy=`zzint-...` 標記；全部由 harness.cleanupMarkers 精準清除。
 */
describe('[int] F006 組織異動待確認提示 vs SOP', () => {
  let ctx: IntCtx;
  let documentId: string;
  let documentNumber: string;
  let syncRunId: string;
  const deptContactLogin = `${MARK.acct}f006dc`;
  const upstreamLogin = `${MARK.acct}f006up`;
  const EMP = `${MARK.emp}777`; // ACCOUNT.employeeNo 為 varchar(10)
  const CLOSED_ORG = 'ZZ999';
  const q = (sql: string, params?: unknown[]): Promise<unknown> =>
    AppDataSource.query(sql, params);

  function alertService(): OrgChangeAlertService {
    return new OrgChangeAlertService(
      new TypeOrmOrgChangeAlertStore(AppDataSource),
      undefined,
      () => new Date(),
    );
  }

  function closedUnit(): NormalizedOrgUnit {
    return {
      companyCode: 'AS',
      orgCode: CLOSED_ORG,
      codePrefix: 'ZZ9',
      tier: 'SECTION',
      parentCode: 'ZZ000',
      name: 'ZZINT 已裁撤室',
      descFull: null,
      managerEmpNo: null,
      isActive: false,
      closeDate: new Date('2026-03-31T00:00:00.000Z'),
    };
  }

  function syncInput(): SyncAlertInput {
    return {
      runId: syncRunId,
      companyCode: 'AS',
      orgUpdates: [],
      orgBefore: new Map(),
      orgUnits: [closedUnit()],
      accountUpdates: [],
      existingAcc: new Map(),
      disappearedLoginIds: [],
    };
  }

  beforeAll(async () => {
    ctx = await bootIntApp();

    // 部門窗口 marker 帳號（guard 以 DB 現行 roleCode 為準）→ RBAC 403 場景。
    const accRepo = AppDataSource.getRepository(Account);
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
    // 上游 marker 帳號：掛於已關閉之 marker 部門（§7.3 全量掃描對象）。
    await accRepo.save(
      accRepo.create({
        companyCode: 'AS',
        loginId: upstreamLogin,
        employeeNo: EMP,
        roleCode: 'User',
        status: 'active',
        source: 'upstream',
        name: 'ZZINT 掛已關閉部門者',
        orgCode: CLOSED_ORG,
      }),
    );

    // marker 循環＋文件（DOCUMENT_FIELD 提示之 FK 對象）。
    const lcRepo = AppDataSource.getRepository(Lifecycle);
    const lc = await lcRepo.save(
      lcRepo.create({ name: `${MARK.lc}F006`, status: 'active' } as Partial<Lifecycle>),
    );
    documentNumber = `${MARK.doc}F006-${Date.now()}`;
    const docRepo = AppDataSource.getRepository(IcsopDocument);
    const doc = await docRepo.save(
      docRepo.create({
        // 🔴 B 階段（多公司）：`ICSOP_DOCUMENT.companyCode` 為 NOT NULL，直塞 entity 之 fixture 須自帶。
        companyCode: 'AS',
        status: 'active',
        documentNumber,
        documentName: 'ZZINT F006 提示測試文件',
        lifecycleId: lc.id,
        primaryChiefId: 'E001',
        announcedDate: null,
        contentSummary: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Partial<IcsopDocument>),
    );
    documentId = doc.id;

    // marker SYNC_RUN（sourceSyncRunId FK 對象＋KPI 加總來源）。
    const runRepo = AppDataSource.getRepository(SyncRun);
    const run = await runRepo.save(
      runRepo.create({
        id: randomUUID(),
        // 🔴 B 階段（多公司）：`SYNC_RUN.compid` 為 NOT NULL（同步互斥鎖與水位改 per-company）。
        compid: 'AS',
        triggerType: 'manual',
        status: 'success',
        changeCount: 3,
        startedAt: new Date(),
        endedAt: new Date(),
        triggeredBy: `${MARK.acct}f006`,
        accountsCreated: 7,
        accountsUpdated: 2,
        accountsDisabled: 1,
      } as Partial<SyncRun>),
    );
    syncRunId = run.id;
  }, 120000);

  afterAll(() => shutdownIntApp(ctx));

  it('TS-F006-001 migration 建表：ORG_CHANGE_ALERT 全欄位＋SYNC_RUN 三新欄存在', async () => {
    const cols = (await q(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ORG_CHANGE_ALERT'`,
    )) as Array<{ COLUMN_NAME: string }>;
    const names = cols.map((c) => c.COLUMN_NAME);
    for (const c of [
      'id',
      'alertKind',
      'documentId',
      'documentNumber',
      'documentName',
      'affectedField',
      'beforeValue',
      'afterValue',
      'personEmployeeNo',
      'personName',
      'deptOrgCode',
      'deptName',
      'deptCloseDate',
      'status',
      'resolutionKind',
      'resolvedBy',
      'resolvedAt',
      'createdAt',
      'sourceSyncRunId',
    ]) {
      expect(names).toContain(c);
    }

    const runCols = (await q(
      `SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME='SYNC_RUN' AND COLUMN_NAME LIKE 'accounts%'`,
    )) as Array<{ COLUMN_NAME: string; IS_NULLABLE: string }>;
    expect(runCols.map((c) => c.COLUMN_NAME).sort()).toEqual([
      'accountsCreated',
      'accountsDisabled',
      'accountsUpdated',
    ]);
    // 歷史列以 NULL 誠實表達「未知」；KPI 以 COALESCE 視為 0。
    expect(runCols.every((c) => c.IS_NULLABLE === 'YES')).toBe(true);
  });

  it('TS-F006-002 filtered unique 阻擋重複 pending（DOCUMENT_FIELD）', async () => {
    const ins = (): Promise<unknown> =>
      q(
        `INSERT INTO [ORG_CHANGE_ALERT]
           ([alertKind],[documentId],[documentNumber],[affectedField],[status],[createdAt])
         VALUES ('DOCUMENT_FIELD', @0, @1, @2, 'pending', SYSUTCDATETIME())`,
        [documentId, documentNumber, FieldKey.CHIEF_PRIMARY],
      );
    await ins();
    await expect(ins()).rejects.toThrow(/duplicate key|UQ_ORG_CHANGE_ALERT_doc_field/i);
  });

  it('TS-F006-003 同鍵但既有列為 resolved → 允許新增 pending（歷史多筆）', async () => {
    await q(
      `UPDATE [ORG_CHANGE_ALERT] SET [status]='resolved', [resolutionKind]='NO_CHANGE_NEEDED',
         [resolvedAt]=SYSUTCDATETIME() WHERE [documentId]=@0 AND [status]='pending'`,
      [documentId],
    );
    await q(
      `INSERT INTO [ORG_CHANGE_ALERT]
         ([alertKind],[documentId],[documentNumber],[affectedField],[status],[createdAt])
       VALUES ('DOCUMENT_FIELD', @0, @1, @2, 'pending', SYSUTCDATETIME())`,
      [documentId, documentNumber, FieldKey.CHIEF_PRIMARY],
    );
    const rows = (await q(
      `SELECT [status] FROM [ORG_CHANGE_ALERT] WHERE [documentId]=@0`,
      [documentId],
    )) as Array<{ status: string }>;
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'resolved').length).toBeGreaterThanOrEqual(1);
  });

  it('TS-F006-033／AC3 提示 pending 期間，文件之當責室長欄位未被自動覆寫', async () => {
    const res = await ctx
      .http()
      .get(`/admin/documents/${documentId}`)
      .set('Cookie', ctx.adminCookie);
    expect(res.status).toBe(200);
    expect((res.body as { primaryChiefId: string }).primaryChiefId).toBe('E001');
  });

  it('TS-F006-076 生命週期 round-trip：pending 查詢 → resolve → resolved 查詢', async () => {
    const pendingRes = await ctx
      .http()
      .get('/admin/org-change-alerts?status=pending')
      .set('Cookie', ctx.adminCookie);
    expect(pendingRes.status).toBe(200);
    const mine = (pendingRes.body as Array<Record<string, unknown>>).filter(
      (r) => r.documentId === documentId,
    );
    expect(mine).toHaveLength(1);
    const alertId = mine[0].id as string;

    // ICSOPAdmin（唯讀）→ 403；改以 SysAdmin marker 帳號處理。
    const roRes = await ctx
      .http()
      .patch(`/admin/org-change-alerts/${alertId}/resolve`)
      .set('Cookie', ctx.adminCookie)
      .send({});
    expect(roRes.status).toBe(403);

    const sysLogin = `${MARK.acct}f006sys`;
    const accRepo = AppDataSource.getRepository(Account);
    await accRepo.save(
      accRepo.create({
        companyCode: 'AS',
        loginId: sysLogin,
        roleCode: 'SysAdmin',
        status: 'active',
        source: 'manual',
        name: 'ZZINT F006 系統管理員',
        email: `${sysLogin}@zzint.local`,
        passwordHash: hashPassword(ADMIN_PASSWORD),
      }),
    );
    const sysCookie = ctx.cookieFor(sysLogin, 'AS', 'SysAdmin');

    const ok = await ctx
      .http()
      .patch(`/admin/org-change-alerts/${alertId}/resolve`)
      .set('Cookie', sysCookie)
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      status: 'resolved',
      resolutionKind: 'NO_CHANGE_NEEDED',
    });
    expect((ok.body as { resolvedBy: string }).resolvedBy).toBeTruthy();

    // 再次處理 → 409（不覆寫原處理者/時間）。
    const again = await ctx
      .http()
      .patch(`/admin/org-change-alerts/${alertId}/resolve`)
      .set('Cookie', sysCookie)
      .send({});
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('ALERT_ALREADY_RESOLVED');

    // 已自 pending 清單移除、出現於 resolved 清單。
    const after = await ctx
      .http()
      .get('/admin/org-change-alerts?status=pending')
      .set('Cookie', ctx.adminCookie);
    expect(
      (after.body as Array<Record<string, unknown>>).some((r) => r.id === alertId),
    ).toBe(false);
    const resolved = await ctx
      .http()
      .get('/admin/org-change-alerts?status=resolved')
      .set('Cookie', ctx.adminCookie);
    const found = (resolved.body as Array<Record<string, unknown>>).find(
      (r) => r.id === alertId,
    );
    expect(found).toBeTruthy();
    expect(found?.resolvedAt).toBeTruthy();

    // 不存在之 id → 404。
    const missing = await ctx
      .http()
      .patch(`/admin/org-change-alerts/${randomUUID()}/resolve`)
      .set('Cookie', sysCookie)
      .send({});
    expect(missing.status).toBe(404);
  });

  it('TS-F006-077 跨兩次同步之去重：真實 store 僅留 1 筆 pending（服務層先擋，未觸發 DB 唯一索引違例）', async () => {
    const svc = alertService();

    await svc.generateFromSyncPlan(syncInput());
    // 第二次情境完全相同——若服務層去重失效，DB 唯一索引會使本呼叫拋錯。
    await expect(svc.generateFromSyncPlan(syncInput())).resolves.toBeUndefined();

    const rows = (await q(
      `SELECT [id],[status],[deptOrgCode],[deptName],[deptCloseDate],[sourceSyncRunId]
       FROM [ORG_CHANGE_ALERT] WHERE [personEmployeeNo]=@0 AND [status]='pending'`,
      [EMP],
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    // AC8：含部門代碼/名稱/關閉日期。
    expect(rows[0].deptOrgCode).toBe(CLOSED_ORG);
    expect(rows[0].deptName).toBe('ZZINT 已裁撤室');
    expect(rows[0].deptCloseDate).toBeTruthy();
    expect(rows[0].sourceSyncRunId).toBe(syncRunId);

    // AC9：帳號維持啟用（提示不停用帳號）。
    const acc = (await q(`SELECT [status] FROM [ACCOUNT] WHERE [loginId]=@0`, [
      upstreamLogin,
    ])) as Array<{ status: string }>;
    expect(acc[0].status).toBe('active');
  });

  it('TS-F006-004 sourceSyncRunId FK：來源 SYNC_RUN 被刪除 → 提示保留、參照轉 null', async () => {
    await q(`DELETE FROM [SYNC_RUN] WHERE [id]=@0`, [syncRunId]);
    const rows = (await q(
      `SELECT [sourceSyncRunId] FROM [ORG_CHANGE_ALERT] WHERE [personEmployeeNo]=@0`,
      [EMP],
    )) as Array<{ sourceSyncRunId: string | null }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.sourceSyncRunId === null)).toBe(true);
  });

  it('TS-F006-078 RBAC：部門窗口呼叫 resolve → 403 PERMISSION_DENIED（真實 guard chain）', async () => {
    const cookie = ctx.cookieFor(deptContactLogin, 'AS', 'DeptContact');
    const res = await ctx
      .http()
      .patch(`/admin/org-change-alerts/${randomUUID()}/resolve`)
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('PERMISSION_DENIED');

    // 清單亦不可讀。
    const list = await ctx
      .http()
      .get('/admin/org-change-alerts')
      .set('Cookie', cookie);
    expect(list.status).toBe(403);
  });

  it('未登入 → 401（SessionGuard 先於 RolePermissionGuard）', async () => {
    const res = await ctx.http().get('/admin/org-change-alerts');
    expect(res.status).toBe(401);
  });

  it('TS-F006-079 monthly-summary：新增 marker SYNC_RUN 後之加總差額＝該筆細分值', async () => {
    const read = async (): Promise<Record<string, number>> => {
      const r = await ctx
        .http()
        .get('/admin/org-sync/monthly-summary')
        .set('Cookie', ctx.adminCookie);
      expect(r.status).toBe(200);
      return r.body as Record<string, number>;
    };

    const before = await read();
    expect(typeof before.month).toBe('string');

    const runRepo = AppDataSource.getRepository(SyncRun);
    await runRepo.save(
      runRepo.create({
        id: randomUUID(),
        // 🔴 B 階段（多公司）：`SYNC_RUN.compid` 為 NOT NULL（同步互斥鎖與水位改 per-company）。
        compid: 'AS',
        triggerType: 'manual',
        status: 'success',
        changeCount: 5,
        startedAt: new Date(),
        endedAt: new Date(),
        triggeredBy: `${MARK.acct}f006kpi`,
        accountsCreated: 5,
        accountsUpdated: 3,
        accountsDisabled: 2,
      } as Partial<SyncRun>),
    );

    const after = await read();
    expect(after.newPersonCount - before.newPersonCount).toBe(5);
    expect(after.updatedCount - before.updatedCount).toBe(3);
    expect(after.departedDisabledCount - before.departedDisabledCount).toBe(2);
    // 當責待確認＝pending 之當責室長類（窄口徑，D7）。
    expect(typeof after.pendingChiefAlertCount).toBe('number');
  });
});
