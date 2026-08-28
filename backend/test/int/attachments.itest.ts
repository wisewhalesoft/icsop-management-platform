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

  /**
   * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，申訴 8）：原案另上傳一筆
   * `POST .../attachments/ojt` 並斷言列表回 `['ICSOP_PDF','OJT_SIGNIN']`——該端點已依
   * [F016](../../docs/specs/features/F016-pdf-ojt-attachment.md#ojt-progress-supersede-delta)
   * `AC-J2`（`OQ-E11-11`→A）整支移除、回 404（非 403、非 410），`OJT_SIGNIN` 亦已依
   * [data-model.md](../../docs/specs/data-model.md#attachment-entity) v1.10 自 `DOCUMENT_ATTACHMENT.type`
   * 列舉值完全移除（非「保留供 legacy」）。該半案之標的已無法經由此端點建構，處置手法同
   * `backend/src/attachments/attachments.service.spec.ts` 之 TS-002～TS-004／TS-006／TS-010、
   * `backend/src/documents/documents.service.spec.ts` 之 TS-C-003：去 OJT 半案，縮為單一
   * `ICSOP_PDF` 案，`DOCUMENT_ATTACHMENT` 落地一致性之驗證價值不變（僅剩一筆時仍逐欄核對）。
   * 📝 OLD> it('TS-E-A-001 上傳 ICSOP PDF＋OJT → GET 列表回兩筆，與 DOCUMENT_ATTACHMENT 落地一致', ...)
   * （逐字見本檔 git 歷史）
   */
  it('TS-E-A-001 上傳 ICSOP PDF → GET 列表回一筆，與 DOCUMENT_ATTACHMENT 落地一致', async () => {
    const up1 = await ctx
      .http()
      .post(`/admin/documents/${docId}/attachments/icsop-pdf`)
      .set('Cookie', ctx.adminCookie)
      .attach('file', pdfBuffer, { filename: 'zzint-sop.pdf', contentType: 'application/pdf' });
    expect([200, 201]).toContain(up1.status);
    uploadedBlobs.push(up1.body.blobPath);

    const g = await ctx
      .http()
      .get(`/admin/documents/${docId}/attachments`)
      .set('Cookie', ctx.adminCookie);
    expect(g.status).toBe(200);
    expect(Array.isArray(g.body)).toBe(true);
    expect(g.body).toHaveLength(1);
    expect(g.body.map((a: { type: string }) => a.type)).toEqual(['ICSOP_PDF']);
    expect(g.body[0].fileName).toBe('zzint-sop.pdf');

    // 直查真表：該列存在且 blobPath 與回應一致。
    const rows = await AppDataSource.query(
      `SELECT [type],[blobPath] FROM [DOCUMENT_ATTACHMENT] WHERE [documentId]=@0 ORDER BY [type]`,
      [docId],
    );
    expect(rows).toHaveLength(1);
    const byType = new Map(
      (rows as { type: string; blobPath: string }[]).map((r) => [r.type, r.blobPath]),
    );
    expect(byType.get('ICSOP_PDF')).toBe(g.body[0].blobPath);
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
