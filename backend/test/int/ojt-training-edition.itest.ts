import { AppDataSource } from '../../src/database/data-source';
import { bootIntApp, shutdownIntApp, MARK, IntCtx } from './harness';

/**
 * [int] 2026-09-29 `OJT_TRAINING_EDITION`（每一個要求訓練之版次之紀錄）之寫入路徑 vs 真 SOP DB。
 *
 * 🔴 本檔之存在理由：寫入點在 `TypeOrmDocumentStore` 之交易內，單元測試全以記憶體假 store 驗證，
 *   證明不了「真的寫進去了」——本 repo 已多次踩到「白名單／寫入路徑漏接 ⇒ 值人間蒸發」。
 * ⚠ 前置條件：migration `1725840000000-ojt-training-edition-history` 已對目標庫實跑。
 * 🔒 marker 文件刪除時 FK CASCADE 連帶清除本表之列，不需額外 cleanup。
 */
describe('[int] OJT_TRAINING_EDITION 寫入路徑 vs SOP', () => {
  let ctx: IntCtx;
  let lifecycleId: string;
  const num = `${MARK.doc}OJT-ED-${Date.now()}`;

  const editionsOf = async (documentId: string): Promise<{ edition: string | null; source: string }[]> =>
    (await AppDataSource.query(
      `SELECT [edition], [source] FROM [OJT_TRAINING_EDITION] WHERE [documentId] = @0 ORDER BY [requiredAt], [edition]`,
      [documentId],
    )) as { edition: string | null; source: string }[];

  beforeAll(async () => {
    ctx = await bootIntApp();
    const r = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: `${MARK.lc}OJTED_${Date.now()}` });
    expect([200, 201]).toContain(r.status);
    lifecycleId = r.body.id;
  }, 120_000);
  afterAll(() => shutdownIntApp(ctx), 60_000);

  it('建立記一列 CREATE；改版不要求重訓不記；改版要求重訓記一列 RETRAIN', async () => {
    const c = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({ lifecycleId, status: 'active', documentNumber: num, documentName: 'ZZINT 版次紀錄', edition: "26'01" });
    expect([200, 201]).toContain(c.status);
    const id = c.body.id as string;
    expect(await editionsOf(id)).toEqual([{ edition: "26'01", source: 'CREATE' }]);

    // 改版、不要求重訓 ⇒ 基準不動 ⇒ 不記錄
    const p1 = await ctx
      .http()
      .patch(`/admin/documents/${id}`)
      .set('Cookie', ctx.adminCookie)
      .send({ edition: "26'02" });
    expect([200, 204]).toContain(p1.status);
    expect(await editionsOf(id)).toHaveLength(1);

    // 改版、要求重訓 ⇒ 基準推進 ⇒ 同交易記一列
    const p2 = await ctx
      .http()
      .patch(`/admin/documents/${id}`)
      .set('Cookie', ctx.adminCookie)
      .send({ edition: "26'03", ojtRetrainRequired: true });
    expect([200, 204]).toContain(p2.status);
    expect(await editionsOf(id)).toEqual([
      { edition: "26'01", source: 'CREATE' },
      { edition: "26'03", source: 'RETRAIN' },
    ]);
  }, 60_000);

  it('無版次之文件記一列 edition = NULL', async () => {
    const c = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({ lifecycleId, status: 'active', documentNumber: `${num}-N`, documentName: 'ZZINT 無版次' });
    expect([200, 201]).toContain(c.status);
    expect(await editionsOf(c.body.id as string)).toEqual([{ edition: null, source: 'CREATE' }]);
  }, 60_000);

  it('ontime-summary 端點於新表存在時回 200', async () => {
    const r = await ctx.http().get('/admin/ojt-progress/ontime-summary').set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    expect(typeof r.body.denominator).toBe('number');
  }, 60_000);
});
