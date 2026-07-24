import { randomUUID } from 'crypto';
import { bootIntApp, shutdownIntApp, MARK, IntCtx } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { BLOB_STORE, BlobStore } from '../../src/storage/blob-store';

/**
 * [int] A 節：附件列表端點 `GET /admin/documents/:documentId/attachments` vs 真 SOP DB（＋dev Blob）。
 *
 * ⚠ 不隨單元套件執行；由 orchestrator 於合併後序列跑（`npm run test:int`）。
 * 上傳走真實 multipart（supertest .attach）→ 真 Blob put → DOCUMENT_ATTACHMENT 落地；
 * 附件列以 harness.cleanupMarkers()（已含 DOCUMENT_ATTACHMENT）於 before/afterAll 精準清除。
 */
describe('[int] attachments 列表端點 vs SOP', () => {
  let ctx: IntCtx;
  let lifecycleId: string;
  let docId: string;
  let emptyDocId: string;
  const num = `${MARK.doc}ATT-${Date.now()}`;
  const pdfBuffer = Buffer.from('%PDF-1.4 zzint marker\n', 'utf8');
  /** 本測試上傳之真實 blob key（afterAll 冪等回收，避免 dev 容器殘留）。 */
  const uploadedBlobs: string[] = [];

  beforeAll(async () => {
    ctx = await bootIntApp();
    const lc = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: `${MARK.lc}ATT_${Date.now()}` });
    expect([200, 201]).toContain(lc.status);
    lifecycleId = lc.body.id;

    const mk = async (suffix: string): Promise<string> => {
      const r = await ctx
        .http()
        .post('/admin/documents')
        .set('Cookie', ctx.adminCookie)
        .send({
          lifecycleId,
          status: 'active',
          documentNumber: `${num}${suffix}`,
          documentName: `ZZINT 附件${suffix || '-主'}`,
        });
      expect([200, 201]).toContain(r.status);
      return r.body.id;
    };
    docId = await mk('');
    emptyDocId = await mk('-empty');
  }, 60000);
  afterAll(async () => {
    const blob = ctx?.app?.get<BlobStore>(BLOB_STORE);
    for (const key of uploadedBlobs) await blob?.delete(key).catch(() => undefined);
    await shutdownIntApp(ctx);
  });

  it('TS-E-A-001 上傳 ICSOP PDF＋OJT → GET 列表回兩筆，與 DOCUMENT_ATTACHMENT 落地一致', async () => {
    const up1 = await ctx
      .http()
      .post(`/admin/documents/${docId}/attachments/icsop-pdf`)
      .set('Cookie', ctx.adminCookie)
      .attach('file', pdfBuffer, { filename: 'zzint-sop.pdf', contentType: 'application/pdf' });
    expect([200, 201]).toContain(up1.status);
    uploadedBlobs.push(up1.body.blobPath);

    const up2 = await ctx
      .http()
      .post(`/admin/documents/${docId}/attachments/ojt`)
      .set('Cookie', ctx.adminCookie)
      .attach('file', pdfBuffer, { filename: 'zzint-ojt.pdf', contentType: 'application/pdf' });
    expect([200, 201]).toContain(up2.status);
    uploadedBlobs.push(up2.body.blobPath);

    const g = await ctx
      .http()
      .get(`/admin/documents/${docId}/attachments`)
      .set('Cookie', ctx.adminCookie);
    expect(g.status).toBe(200);
    expect(Array.isArray(g.body)).toBe(true);
    expect(g.body).toHaveLength(2);
    expect(g.body.map((a: { type: string }) => a.type)).toEqual(['ICSOP_PDF', 'OJT_SIGNIN']);
    expect(g.body[0].fileName).toBe('zzint-sop.pdf');
    expect(g.body[1].fileName).toBe('zzint-ojt.pdf');

    // 直查真表：兩列存在且 blobPath 與回應一致。
    const rows = await AppDataSource.query(
      `SELECT [type],[blobPath] FROM [DOCUMENT_ATTACHMENT] WHERE [documentId]=@0 ORDER BY [type]`,
      [docId],
    );
    expect(rows).toHaveLength(2);
    const byType = new Map(
      (rows as { type: string; blobPath: string }[]).map((r) => [r.type, r.blobPath]),
    );
    expect(byType.get('ICSOP_PDF')).toBe(g.body[0].blobPath);
    expect(byType.get('OJT_SIGNIN')).toBe(g.body[1].blobPath);
  });

  it('TS-E-A-002 文件存在但未上傳任何附件 → 200 空陣列', async () => {
    const g = await ctx
      .http()
      .get(`/admin/documents/${emptyDocId}/attachments`)
      .set('Cookie', ctx.adminCookie);
    expect(g.status).toBe(200);
    expect(g.body).toEqual([]);
  });

  it('TS-E-A-003 非存在文件 → 404 DOCUMENT_NOT_FOUND', async () => {
    const g = await ctx
      .http()
      .get(`/admin/documents/${randomUUID()}/attachments`)
      .set('Cookie', ctx.adminCookie);
    expect(g.status).toBe(404);
  });

  it('TS-E-A-004 未登入 → 401', async () => {
    const g = await ctx.http().get(`/admin/documents/${docId}/attachments`);
    expect(g.status).toBe(401);
  });
});
