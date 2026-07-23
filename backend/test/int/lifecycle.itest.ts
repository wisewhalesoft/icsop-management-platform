import { bootIntApp, shutdownIntApp, MARK, IntCtx } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { AuditWriterService } from '../../src/audit/audit-writer.service';

/**
 * F036 循環樹狀圖預覽（唯讀＋浮水印＋稽核）＋ F007 建立，全走真 SOP DB。
 *  - 建立循環（F007）→ GET graph（F008 唯讀複用）→ GET tree-preview（F036）→ 驗 LIFECYCLE_VIEW 稽核落地。
 *  - 稽核經 Outbox 非阻斷入列，故先 processOutboxRetry() 搬遷至 AUDIT_LOG 再查驗（append-only，
 *    無法清除 → ZZINT_LC_ 前綴標記殘留 AUDIT_LOG，屬既知）。
 *  - ⚠ 不隨單元測試跑（*.itest.ts）；由 orchestrator 合併後以 `npm run test:int` 序列執行（共用 SOP DB）。
 */
describe('[int] lifecycle 樹狀圖預覽 (F036) + 建立 (F007) vs SOP', () => {
  let ctx: IntCtx;
  let lifecycleId: string;
  const lcName = `${MARK.lc}${Date.now()}`;

  beforeAll(async () => {
    ctx = await bootIntApp();
    const r = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: lcName, description: 'ZZINT F036 預覽' });
    expect([200, 201]).toContain(r.status);
    lifecycleId = r.body.id;
    expect(lifecycleId).toBeTruthy();
  }, 60000);
  afterAll(() => shutdownIntApp(ctx));

  it('GET /admin/lifecycles/:id/graph（F008 唯讀複用）→ 200 節點/邊結構', async () => {
    const g = await ctx
      .http()
      .get(`/admin/lifecycles/${lifecycleId}/graph`)
      .set('Cookie', ctx.adminCookie);
    expect(g.status).toBe(200);
    expect(Array.isArray(g.body.nodes)).toBe(true);
    expect(Array.isArray(g.body.edges)).toBe(true);
  });

  it('GET /admin/lifecycles/:id/tree-preview → 200 回循環+圖資+浮水印，並寫入 LIFECYCLE_VIEW 稽核', async () => {
    const r = await ctx
      .http()
      .get(`/admin/lifecycles/${lifecycleId}/tree-preview`)
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.lifecycle.id).toBe(lifecycleId);
    expect(r.body.lifecycle.name).toBe(lcName);
    expect(r.body.graph).toBeTruthy();
    expect(Array.isArray(r.body.graph.nodes)).toBe(true);
    expect(typeof r.body.watermark).toBe('string');
    expect(r.body.watermark.length).toBeGreaterThan(0);

    // 稽核經 Outbox 非阻斷入列 → 觸發補償搬遷至 AUDIT_LOG，再查驗（lifecycleId 為伺服器產生之 UUID）。
    await ctx.app.get(AuditWriterService).processOutboxRetry();
    const rows: Array<{ actionType: string; lifecycleName: string }> = await AppDataSource.query(
      `SELECT [actionType], [lifecycleName] FROM [AUDIT_LOG]
         WHERE [lifecycleId] = '${lifecycleId}' AND [actionType] = 'LIFECYCLE_VIEW'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].lifecycleName).toBe(lcName);
  });
});
