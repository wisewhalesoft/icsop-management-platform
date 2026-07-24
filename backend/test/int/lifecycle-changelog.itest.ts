import { PDFDocument } from 'pdf-lib';
import { bootIntApp, shutdownIntApp, MARK, IntCtx } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { AuditWriterService } from '../../src/audit/audit-writer.service';

/**
 * F038 循環樹狀圖變更歷程 · 新舊快照重建 ＋ 雙頁下載 vs 真 SOP DB（TS-LCC-E-001~010）。
 *
 * 交易一致性（§5.9）之 happy-path 佐證：每次結構操作 → LIFECYCLE_NODE/EDGE、LIFECYCLE_CHANGE_LOG、
 * LIFECYCLE_SNAPSHOT 三表 1:1:1 一致（rollback 語意之單元驗證見 dag-snapshot-transaction.spec）。
 *
 * 清理（§E.1）：於**本檔自身 afterAll**、於刪 LIFECYCLE_CHANGE_LOG 之前先刪 LIFECYCLE_SNAPSHOT
 * （子表先於父表；兩表皆無 marker 欄可前綴比對，僅能靠 lifecycleId）。**不改共用 harness.cleanupMarkers**
 * （比照既有 LIFECYCLE_CHANGE_LOG itest-local 清理先例）。
 */
describe('[int] lifecycle-changelog F038 新舊對照 vs SOP', () => {
  let ctx: IntCtx;
  let lifecycleId: string;
  let nodeAId: string;
  let nodeBId: string;
  let firstChangeLogId: string;
  let renameChangeLogId: string;
  let documentId: string;
  const docNum = `${MARK.doc}${Date.now()}-LCC`;

  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
    AppDataSource.query(sql, params);

  beforeAll(async () => {
    ctx = await bootIntApp();
    // TS-LCC-E-006 §C.4 需以「已驗證但無權」之 Supervisor 打出 403（非 401）。
    // SessionGuard 每請求對 ACCOUNT 重驗，僅鑄 cookie 而無對應帳號列 → 401（測不到 RBAC 層）。
    // 故插入 marker Supervisor 帳號（loginId zzint-sup，cleanupMarkers 以 zzint- 前綴清除）。
    await AppDataSource.getRepository(Account).save(
      AppDataSource.getRepository(Account).create({
        companyCode: 'AS',
        loginId: `${MARK.acct}sup`,
        roleCode: 'Supervisor',
        status: 'active',
        source: 'manual',
        name: 'ZZINT 主管',
        email: `${MARK.acct}sup@zzint.local`,
      } as Partial<Account>),
    );
    const r = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: `${MARK.lc}${Date.now()}` });
    expect([200, 201]).toContain(r.status);
    lifecycleId = r.body.id;
  }, 60000);

  afterAll(async () => {
    if (lifecycleId) {
      // 順序：LIFECYCLE_SNAPSHOT（子，changeLogId 回指）→ LIFECYCLE_CHANGE_LOG（父）。
      await q(
        `DELETE FROM [LIFECYCLE_SNAPSHOT] WHERE [changeLogId] IN
           (SELECT [id] FROM [LIFECYCLE_CHANGE_LOG] WHERE [lifecycleId] = @0)`,
        [lifecycleId],
      ).catch(() => undefined);
      await q(`DELETE FROM [LIFECYCLE_CHANGE_LOG] WHERE [lifecycleId] = @0`, [lifecycleId]).catch(
        () => undefined,
      );
    }
    // shutdownIntApp 內 cleanupMarkers 再清 ICSOP_DOCUMENT(ZZINT-)、LIFECYCLE(ZZINT_LC_，級聯 NODE/EDGE)。
    await shutdownIntApp(ctx);
  }, 60000);

  it('TS-LCC-E-001/E-002/E-010 建立 2 節點→1 連線→改名 → 三表 1:1:1（4 筆）、snapshotId 雙向交叉引用', async () => {
    const addNode = async (name: string): Promise<string> => {
      const n = await ctx
        .http()
        .post(`/admin/lifecycles/${lifecycleId}/nodes`)
        .set('Cookie', ctx.adminCookie)
        .send({ name });
      expect([200, 201]).toContain(n.status);
      return n.body.id as string;
    };
    nodeAId = await addNode('ZZINT 進件作業');
    nodeBId = await addNode('ZZINT 簽約對保作業');

    const e = await ctx
      .http()
      .post(`/admin/lifecycles/${lifecycleId}/edges`)
      .set('Cookie', ctx.adminCookie)
      .send({ source: nodeAId, target: nodeBId });
    expect([200, 201]).toContain(e.status);

    const rn = await ctx
      .http()
      .patch(`/admin/lifecycles/${lifecycleId}/nodes/${nodeAId}`)
      .set('Cookie', ctx.adminCookie)
      .send({ name: 'ZZINT 進件收件作業' });
    expect([200, 204]).toContain(rn.status);

    // 三表列數一致（逐動作 1:1:1，不聚合）。
    const [logs, snaps] = await Promise.all([
      q<{ id: string; changeType: string; snapshotId: string | null; occurredAt: Date }>(
        `SELECT [id],[changeType],[snapshotId],[occurredAt] FROM [LIFECYCLE_CHANGE_LOG]
           WHERE [lifecycleId] = @0 ORDER BY [occurredAt] ASC, [id] ASC`,
        [lifecycleId],
      ),
      q<{ id: string; changeLogId: string; nodesJson: string; edgesJson: string }>(
        `SELECT [id],[changeLogId],[nodesJson],[edgesJson] FROM [LIFECYCLE_SNAPSHOT]
           WHERE [lifecycleId] = @0`,
        [lifecycleId],
      ),
    ]);
    expect(logs).toHaveLength(4);
    expect(snaps).toHaveLength(4);

    // 每筆 snapshotId 非 null 且雙向交叉引用正確。
    const snapById = new Map(snaps.map((s) => [s.id, s]));
    for (const log of logs) {
      expect(log.snapshotId).toBeTruthy();
      const snap = snapById.get(log.snapshotId as string);
      expect(snap).toBeTruthy();
      expect(snap!.changeLogId).toBe(log.id); // 反向回指
      expect(() => JSON.parse(snap!.nodesJson)).not.toThrow();
      expect(() => JSON.parse(snap!.edgesJson)).not.toThrow();
    }

    firstChangeLogId = logs[0].id; // 第一筆（新增 nodeA）
    renameChangeLogId = logs[logs.length - 1].id; // 最後一筆（改名）

    // E-010：節點/邊實際列數 vs 日誌/快照列數（同批操作後恆一致：2 節點 + 1 邊 = 3 結構列，4 次操作 = 4 日誌/快照）。
    const [[nc], [ec]] = await Promise.all([
      q<{ n: number }>(`SELECT COUNT(*) AS n FROM [LIFECYCLE_NODE] WHERE [lifecycleId] = @0`, [lifecycleId]),
      q<{ n: number }>(`SELECT COUNT(*) AS n FROM [LIFECYCLE_EDGE] WHERE [lifecycleId] = @0`, [lifecycleId]),
    ]);
    expect(Number(nc.n)).toBe(2);
    expect(Number(ec.n)).toBe(1);
  });

  it('TS-LCC-E-003 GET tree-diff（改名事件）→ before 含舊名、after 含新名、diff.amberNodes 含該節點', async () => {
    const r = await ctx
      .http()
      .get(
        `/admin/change-history/lifecycles/${lifecycleId}/changes/${renameChangeLogId}/tree-diff`,
      )
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    const beforeNode = r.body.before.nodes.find((n: { id: string }) => n.id === nodeAId);
    const afterNode = r.body.after.nodes.find((n: { id: string }) => n.id === nodeAId);
    expect(beforeNode.name).toBe('ZZINT 進件作業');
    expect(afterNode.name).toBe('ZZINT 進件收件作業');
    expect(r.body.diff.amberNodes).toContain(nodeAId);
  });

  it('TS-LCC-E-004 GET tree-diff（循環第一筆事件）→ before 為空圖', async () => {
    const r = await ctx
      .http()
      .get(
        `/admin/change-history/lifecycles/${lifecycleId}/changes/${firstChangeLogId}/tree-diff`,
      )
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.before.nodes).toHaveLength(0);
    expect(r.body.before.edges).toHaveLength(0);
    expect(r.body.after.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('TS-LCC-E-005 GET tree-diff/download → 200 application/pdf、%PDF、pdf-lib 反解頁數＝2', async () => {
    // supertest 二進位收集器（PDF 非 JSON，需自訂 parser 累積為 Buffer）。
    const collectBuffer = (
      res: NodeJS.ReadableStream,
      cb: (err: Error | null, body: Buffer) => void,
    ): void => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    };
    const r = await ctx
      .http()
      .get(
        `/admin/change-history/lifecycles/${lifecycleId}/changes/${renameChangeLogId}/tree-diff/download`,
      )
      .set('Cookie', ctx.adminCookie)
      .buffer(true)
      .parse(collectBuffer as never);
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toContain('application/pdf');
    const pdf = r.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
  });

  it('TS-LCC-E-006 §C.4 不對稱：Supervisor 對 tree-diff/download → 403；對 F036 tree-preview/download → 200', async () => {
    const supCookie = ctx.cookieFor(`${MARK.acct}sup`, 'AS', 'Supervisor');
    const denied = await ctx
      .http()
      .get(
        `/admin/change-history/lifecycles/${lifecycleId}/changes/${renameChangeLogId}/tree-diff/download`,
      )
      .set('Cookie', supCookie);
    expect(denied.status).toBe(403);

    const allowed = await ctx
      .http()
      .get(`/admin/lifecycles/${lifecycleId}/tree-preview/download`)
      .set('Cookie', supCookie);
    expect(allowed.status).toBe(200);
  });

  it('TS-LCC-E-007 下載後 processOutboxRetry → AUDIT_LOG 有 LIFECYCLE_CHANGELOG_DOWNLOAD', async () => {
    await ctx.app.get(AuditWriterService).processOutboxRetry();
    const rows = await q<{ n: number }>(
      `SELECT COUNT(*) AS n FROM [AUDIT_LOG]
         WHERE [lifecycleId] = @0 AND [actionType] = 'LIFECYCLE_CHANGELOG_DOWNLOAD'`,
      [lifecycleId],
    );
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(1);
  });

  it('TS-LCC-E-008 掛載文件（F009 mount）→ LIFECYCLE_SNAPSHOT.nodesJson 該節點 docs 含 id+documentNumber', async () => {
    const c = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({ lifecycleId, status: 'active', documentNumber: docNum, documentName: 'ZZINT 掛載文件' });
    expect([200, 201]).toContain(c.status);
    documentId = c.body.id;

    const m = await ctx
      .http()
      .post(`/admin/lifecycles/${lifecycleId}/nodes/${nodeBId}/documents`)
      .set('Cookie', ctx.adminCookie)
      .send({ documentId, confirm: false });
    expect([200, 201, 204]).toContain(m.status);

    // 最新一筆快照（掛載事件）之 nodeB docs 含該文件。
    const [snap] = await q<{ nodesJson: string }>(
      `SELECT TOP 1 s.[nodesJson] FROM [LIFECYCLE_SNAPSHOT] s
         JOIN [LIFECYCLE_CHANGE_LOG] l ON l.[id] = s.[changeLogId]
         WHERE s.[lifecycleId] = @0 AND l.[changeType] = 'DOCUMENT_MOUNTED'
         ORDER BY l.[occurredAt] DESC`,
      [lifecycleId],
    );
    expect(snap).toBeTruthy();
    const nodes = JSON.parse(snap.nodesJson) as Array<{
      id: string;
      docs: Array<{ id: string; documentNumber: string }>;
    }>;
    const nB = nodes.find((n) => n.id === nodeBId);
    expect(nB).toBeTruthy();
    expect(nB!.docs.some((d) => d.id === documentId && d.documentNumber === docNum)).toBe(true);
  });

  it('TS-LCC-E-009 不存在之 changeLogId → GET tree-diff 回 404 LIFECYCLE_CHANGE_LOG_NOT_FOUND', async () => {
    const bogus = '00000000-0000-0000-0000-000000000000';
    const r = await ctx
      .http()
      .get(`/admin/change-history/lifecycles/${lifecycleId}/changes/${bogus}/tree-diff`)
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(404);
    expect(String(r.body.message ?? r.body.error ?? '')).toContain('LIFECYCLE_CHANGE_LOG_NOT_FOUND');
  });
});
