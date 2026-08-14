import { bootIntApp, shutdownIntApp, MARK, IntCtx } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { BLOB_STORE, BlobStore } from '../../src/storage/blob-store';

/**
 * [int] F039 附錄管理之 HTTP 契約 vs 真 SOP DB（＋dev Blob）。
 *
 * 兩條線都來自遠端測試環境 2026-08-14 的實際災情，單元測試皆看不見：
 *  ① 中文檔名必須以 UTF-8 落地 APPENDIX_POOL.name（multer 預設 latin1 解 part header）。
 *  ② 回 void 的路由必須是 204：若是「200 + 空 body」，前端 apiFetch 會把**已成功的刪除**
 *     當成失敗而不刷新清單，使用者再按一次才收到 APPENDIX_NOT_FOUND（誤判為「刪不掉」）。
 *
 * 清理：DOC_APPENDIX 由 harness.cleanupMarkers 依 marker 文件清除；APPENDIX_POOL 不綁 marker
 * 文件，故本檔以建立時取得之 id 於 afterAll 自行回收（含 blob）。
 */
describe('[int] 附錄管理 HTTP 契約 vs SOP', () => {
  let ctx: IntCtx;
  let docId: string;
  const createdAppendixIds: string[] = [];
  const uploadedBlobs: string[] = [];
  const pdf = Buffer.from('%PDF-1.4 zzint appendix\n', 'utf8');
  // 刻意含中文（含「潤」等非 latin1 字元）：亂碼一旦復發，DB 落地即與此不符。
  const names = [`${MARK.doc}和潤企業永續報告書.pdf`, `${MARK.doc}管審會議紀錄.pdf`];

  beforeAll(async () => {
    ctx = await bootIntApp();
    const lc = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: `${MARK.lc}APX_${Date.now()}` });
    expect([200, 201]).toContain(lc.status);
    const doc = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({
        lifecycleId: lc.body.id,
        status: 'active',
        documentNumber: `${MARK.doc}APX-${Date.now()}`,
        documentName: 'ZZINT 附錄關聯測試文件',
      });
    expect([200, 201]).toContain(doc.status);
    docId = doc.body.id;
  }, 60000);

  afterAll(async () => {
    const blob = ctx?.app?.get<BlobStore>(BLOB_STORE);
    if (createdAppendixIds.length) {
      const ids = createdAppendixIds.map((id) => `'${id}'`).join(',');
      await AppDataSource.query(`DELETE FROM [DOC_APPENDIX] WHERE [appendixId] IN (${ids})`).catch(
        () => undefined,
      );
      await AppDataSource.query(`DELETE FROM [APPENDIX_POOL] WHERE [id] IN (${ids})`).catch(
        () => undefined,
      );
    }
    for (const key of uploadedBlobs) await blob?.delete(key).catch(() => undefined);
    await shutdownIntApp(ctx);
  });

  it('多檔上傳中文檔名 → APPENDIX_POOL.name 以 UTF-8 落地（非 latin1 亂碼）', async () => {
    const res = await ctx
      .http()
      .post('/admin/appendices')
      .set('Cookie', ctx.adminCookie)
      .attach('files', pdf, { filename: names[0], contentType: 'application/pdf' })
      .attach('files', pdf, { filename: names[1], contentType: 'application/pdf' });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveLength(2);
    for (const a of res.body as Array<{ id: string; blobPath: string }>) {
      createdAppendixIds.push(a.id);
      uploadedBlobs.push(a.blobPath);
    }

    const rows = (await AppDataSource.query(
      `SELECT [name] FROM [APPENDIX_POOL] WHERE [id] IN (@0,@1) ORDER BY [uploadedAt]`,
      createdAppendixIds,
    )) as Array<{ name: string }>;
    expect(rows.map((r) => r.name)).toEqual(names);
  });

  it('PUT 整組覆寫關聯 → 204 空 body，且 sortOrder 依序 1..N', async () => {
    const put = await ctx
      .http()
      .put(`/admin/documents/${docId}/appendices`)
      .set('Cookie', ctx.adminCookie)
      .send({ appendixIds: createdAppendixIds });
    expect(put.status).toBe(204);
    expect(put.text).toBe('');

    const list = await ctx
      .http()
      .get(`/documents/${docId}/appendices`)
      .set('Cookie', ctx.adminCookie);
    expect(list.status).toBe(200);
    expect(
      (list.body as Array<{ id: string; sortOrder: number; name: string }>).map((a) => [
        a.name,
        a.sortOrder,
      ]),
    ).toEqual([
      [names[0], 1],
      [names[1], 2],
    ]);
  });

  it('DELETE 解除單一關聯 → 204 空 body，剩餘重編為 1', async () => {
    const del = await ctx
      .http()
      .delete(`/admin/documents/${docId}/appendices/${createdAppendixIds[0]}`)
      .set('Cookie', ctx.adminCookie);
    expect(del.status).toBe(204);
    expect(del.text).toBe('');

    const list = await ctx
      .http()
      .get(`/documents/${docId}/appendices`)
      .set('Cookie', ctx.adminCookie);
    expect(
      (list.body as Array<{ id: string; sortOrder: number }>).map((a) => [a.id, a.sortOrder]),
    ).toEqual([[createdAppendixIds[1], 1]]);
  });

  it('自附錄池移除（仍被引用 → 需 confirmed）→ 第一次即 204，重送才是 404', async () => {
    const id = createdAppendixIds[1];
    const blocked = await ctx
      .http()
      .delete(`/admin/appendices/${id}`)
      .set('Cookie', ctx.adminCookie);
    expect(blocked.status).toBe(409); // APPENDIX_IN_USE（仍關聯本測試文件）

    const ok = await ctx
      .http()
      .delete(`/admin/appendices/${id}?confirmed=true`)
      .set('Cookie', ctx.adminCookie);
    expect(ok.status).toBe(204);
    expect(ok.text).toBe('');

    const rows = await AppDataSource.query(`SELECT [id] FROM [APPENDIX_POOL] WHERE [id] = @0`, [id]);
    expect(rows).toHaveLength(0);

    // 使用者實際踩到的續集：畫面沒刷新時再送一次才會是 404（而非第一次就 404）。
    const again = await ctx
      .http()
      .delete(`/admin/appendices/${id}?confirmed=true`)
      .set('Cookie', ctx.adminCookie);
    expect(again.status).toBe(404);
    expect(again.body.message).toBe('APPENDIX_NOT_FOUND');
  });
});
