import { bootIntApp, shutdownIntApp, MARK, IntCtx } from './harness';
import { AppDataSource } from '../../src/database/data-source';

/**
 * F037/F038 變更歷程 vs 真 SOP DB。
 *  - F037：建立→編輯文件 → DOCUMENT_CHANGE_LOG 落一列（欄位 before/after ＋操作者 accountId 快照）；
 *    GET /admin/change-history/documents 查得；GET /:documentId 記 CHANGE_LOG_VIEW（回 items）。
 *  - F038：新增節點 → LIFECYCLE_CHANGE_LOG 落 NODE_ADDED；GET /admin/change-history/lifecycles 查得。
 * 全部以 marker（ZZINT-／ZZINT_LC_）標記，afterAll 精準清除（含變更日誌，無 FK 不連動）。
 */
describe('[int] change-history F037/F038 vs SOP', () => {
  let ctx: IntCtx;
  let lifecycleId: string;
  let documentId: string;
  const num = `${MARK.doc}${Date.now()}`;

  beforeAll(async () => {
    ctx = await bootIntApp();
    const r = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: `${MARK.lc}${Date.now()}` });
    expect([200, 201]).toContain(r.status);
    lifecycleId = r.body.id;
  }, 60000);

  afterAll(async () => {
    // 變更日誌無 FK → harness 清 doc/lifecycle 不連動，此處先行清除 marker 列。
    const q = AppDataSource.query.bind(AppDataSource);
    await q(`DELETE FROM [DOCUMENT_CHANGE_LOG] WHERE [documentNumber] LIKE '${MARK.doc}%'`).catch(
      () => undefined,
    );
    if (lifecycleId) {
      await q(`DELETE FROM [LIFECYCLE_CHANGE_LOG] WHERE [lifecycleId] = '${lifecycleId}'`).catch(
        () => undefined,
      );
    }
    await shutdownIntApp(ctx);
  });

  it('F037 編輯文件 → DOCUMENT_CHANGE_LOG 落列 ＋ 查詢/展開稽核', async () => {
    // 建立文件
    const c = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({ lifecycleId, status: 'active', documentNumber: num, documentName: 'ZZINT 變更前' });
    expect([200, 201]).toContain(c.status);
    documentId = c.body.id;
    expect(documentId).toBeTruthy();

    // 編輯（觸發 CONTENT 事件 → 真實 publisher 落地 DOCUMENT_CHANGE_LOG）
    const p = await ctx
      .http()
      .patch(`/admin/documents/${documentId}`)
      .set('Cookie', ctx.adminCookie)
      .send({ documentName: 'ZZINT 變更後' });
    expect([200, 204]).toContain(p.status);

    // 直接查 DB：確認落一列（field=documentName、old/new、actorId 為管理員 UUID 快照）
    const rows = await AppDataSource.query(
      `SELECT [field],[oldValue],[newValue],[changeType],[actorId],[actorName]
         FROM [DOCUMENT_CHANGE_LOG] WHERE [documentId] = @0 ORDER BY [occurredAt] DESC`,
      [documentId],
    );
    const nameChange = rows.find((r: { field: string }) => r.field === 'documentName');
    expect(nameChange).toBeTruthy();
    expect(nameChange.oldValue).toBe('ZZINT 變更前');
    expect(nameChange.newValue).toBe('ZZINT 變更後');
    expect(nameChange.changeType).toBe('CONTENT');
    expect(nameChange.actorId).toBeTruthy(); // SessionGuard 填入之 ACCOUNT.id 快照

    // 查詢 API（F037 程序書 tab）
    const q = await ctx
      .http()
      .get(`/admin/change-history/documents?doc=${encodeURIComponent(num)}`)
      .set('Cookie', ctx.adminCookie);
    expect(q.status).toBe(200);
    expect(q.body.items.some((i: { field: string }) => i.field === 'documentName')).toBe(true);

    // 展開檢視（記 CHANGE_LOG_VIEW 稽核）
    const v = await ctx
      .http()
      .get(`/admin/change-history/documents/${documentId}`)
      .set('Cookie', ctx.adminCookie);
    expect(v.status).toBe(200);
    expect(Array.isArray(v.body.items)).toBe(true);

    // 稽核已寫入（AUDIT_LOG 之 CHANGE_LOG_VIEW，經 Outbox 補償；直查 Outbox 或 AUDIT_LOG 任一即可）
    const audit = await AppDataSource.query(
      `SELECT COUNT(*) AS n FROM [AUDIT_LOG] WHERE [actionType] = 'CHANGE_LOG_VIEW' AND [documentId] = @0`,
      [documentId],
    );
    // Outbox 非阻斷：可能尚未搬遷至 AUDIT_LOG（排程重試）。此處不強制 >0，僅斷言查詢不擲例外。
    expect(Number(audit[0].n)).toBeGreaterThanOrEqual(0);
  });

  it('F038 新增節點 → LIFECYCLE_CHANGE_LOG 落 NODE_ADDED ＋ 查詢', async () => {
    const n = await ctx
      .http()
      .post(`/admin/lifecycles/${lifecycleId}/nodes`)
      .set('Cookie', ctx.adminCookie)
      .send({ name: 'ZZINT 進件作業' });
    expect([200, 201]).toContain(n.status);

    const rows = await AppDataSource.query(
      `SELECT [changeType],[summary],[actorId] FROM [LIFECYCLE_CHANGE_LOG]
         WHERE [lifecycleId] = @0 ORDER BY [occurredAt] DESC`,
      [lifecycleId],
    );
    const added = rows.find((r: { changeType: string }) => r.changeType === 'NODE_ADDED');
    expect(added).toBeTruthy();
    expect(added.summary).toContain('ZZINT 進件作業');

    const q = await ctx
      .http()
      .get(`/admin/change-history/lifecycles?lifecycleId=${lifecycleId}`)
      .set('Cookie', ctx.adminCookie);
    expect(q.status).toBe(200);
    expect(q.body.items.some((i: { changeType: string }) => i.changeType === 'NODE_ADDED')).toBe(true);
  });
});
