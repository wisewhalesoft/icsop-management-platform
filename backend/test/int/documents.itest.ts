import { bootIntApp, shutdownIntApp, MARK, IntCtx } from './harness';

/** F010/F011/F013/F017：建立→取單→編輯→清單→重複編號 409，全走真 SOP DB。 */
describe('[int] documents 建立/編輯/清單/唯一性 vs SOP', () => {
  let ctx: IntCtx;
  let lifecycleId: string;
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
    expect(lifecycleId).toBeTruthy();
  }, 60000);
  afterAll(() => shutdownIntApp(ctx));

  it('建立→GET/:id→PATCH 編輯→清單含之→重複編號 409', async () => {
    // 建立（F010）
    const c = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({ lifecycleId, status: 'active', documentNumber: num, documentName: 'ZZINT 建立' });
    expect([200, 201]).toContain(c.status);
    const id = c.body.id;
    expect(id).toBeTruthy();

    // 取單（F011 GET /:id）
    const g = await ctx.http().get(`/admin/documents/${id}`).set('Cookie', ctx.adminCookie);
    expect(g.status).toBe(200);
    expect(g.body.documentNumber).toBe(num);

    // 編輯（F011 PATCH /:id）
    const p = await ctx
      .http()
      .patch(`/admin/documents/${id}`)
      .set('Cookie', ctx.adminCookie)
      .send({ documentName: 'ZZINT 編輯後' });
    expect([200, 204]).toContain(p.status);
    const g2 = await ctx.http().get(`/admin/documents/${id}`).set('Cookie', ctx.adminCookie);
    expect(g2.body.documentName).toBe('ZZINT 編輯後');

    // 清單含之（F017，回傳分頁 {items}）
    const l = await ctx.http().get('/admin/documents').set('Cookie', ctx.adminCookie);
    expect(l.status).toBe(200);
    const items = l.body.items ?? l.body;
    expect(Array.isArray(items)).toBe(true);
    expect(items.some((d: { id: string }) => d.id === id)).toBe(true);

    // 重複編號（F013 唯一性，真 filtered unique index）→ 409
    const dup = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({ lifecycleId, status: 'active', documentNumber: num, documentName: 'ZZINT 重複' });
    expect(dup.status).toBe(409);
  });
});
