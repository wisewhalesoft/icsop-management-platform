import { bootIntApp, shutdownIntApp, MARK, IntCtx } from './harness';
import { BLOB_STORE, BlobStore } from '../../src/storage/blob-store';

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

  /** C 節：清單富化（檔案 icsopPdfBlobPath ＋ 連結點 links）於真 MSSQL join 之正確性。 */
  describe('清單富化：檔案＋連結點（C）', () => {
    let idA: string;
    let idB: string;
    let idC: string;
    let pdfBlobPath: string;
    const numA = `${num}-CA`;
    const numB = `${num}-CB`;
    const numC = `${num}-CC`;
    const pdfBuffer = Buffer.from('%PDF-1.4 zzint list marker\n', 'utf8');
    /** 本區塊上傳之真實 blob key（afterAll 冪等回收，避免 dev 容器殘留）。 */
    const uploadedBlobs: string[] = [];

    afterAll(async () => {
      const blob = ctx?.app?.get<BlobStore>(BLOB_STORE);
      for (const key of uploadedBlobs) await blob?.delete(key).catch(() => undefined);
    });

    const create = async (documentNumber: string, documentName: string): Promise<string> => {
      const r = await ctx
        .http()
        .post('/admin/documents')
        .set('Cookie', ctx.adminCookie)
        .send({ lifecycleId, status: 'active', documentNumber, documentName });
      expect([200, 201]).toContain(r.status);
      return r.body.id as string;
    };
    const itemsOf = async (query: string) => {
      const l = await ctx.http().get(`/admin/documents${query}`).set('Cookie', ctx.adminCookie);
      expect(l.status).toBe(200);
      return l.body.items as {
        id: string;
        icsopPdfBlobPath: string | null;
        links: { targetDocumentId: string; targetNumber: string | null }[];
      }[];
    };

    beforeAll(async () => {
      idA = await create(numA, 'ZZINT 富化 A（有 PDF）');
      idB = await create(numB, 'ZZINT 富化 B（連結 A）');
      idC = await create(numC, 'ZZINT 富化 C（皆無）');
      const up = await ctx
        .http()
        .post(`/admin/documents/${idA}/attachments/icsop-pdf`)
        .set('Cookie', ctx.adminCookie)
        .attach('file', pdfBuffer, { filename: 'zzint-list.pdf', contentType: 'application/pdf' });
      expect([200, 201]).toContain(up.status);
      pdfBlobPath = up.body.blobPath;
      uploadedBlobs.push(pdfBlobPath);
      const p = await ctx
        .http()
        .patch(`/admin/documents/${idB}`)
        .set('Cookie', ctx.adminCookie)
        .send({ links: [idA] });
      expect([200, 204]).toContain(p.status);
    }, 60000);

    it('TS-E-C-001 清單回應含真實 join 之 icsopPdfBlobPath 與 links 摘要', async () => {
      const items = await itemsOf('?keyword=' + encodeURIComponent(num));
      const a = items.find((i) => i.id === idA)!;
      const b = items.find((i) => i.id === idB)!;
      const c = items.find((i) => i.id === idC)!;

      expect(a.icsopPdfBlobPath).toBe(pdfBlobPath);
      expect(a.links).toEqual([]);
      expect(b.icsopPdfBlobPath).toBeNull();
      expect(b.links).toHaveLength(1);
      expect(b.links[0].targetDocumentId).toBe(idA);
      expect(b.links[0].targetNumber).toBe(numA);
      expect(c.icsopPdfBlobPath).toBeNull();
      expect(c.links).toEqual([]);
    });

    it('TS-E-C-002 分頁情境下富化資料仍逐列正確對應（不跨列錯置）', async () => {
      const kw = encodeURIComponent(num);
      const p1 = await itemsOf(`?keyword=${kw}&sortBy=documentNumber&sortDir=asc&pageSize=2&page=1`);
      const p2 = await itemsOf(`?keyword=${kw}&sortBy=documentNumber&sortDir=asc&pageSize=2&page=2`);
      const seen = [...p1, ...p2].filter((i) => [idA, idB, idC].includes(i.id));
      expect(seen.length).toBeGreaterThanOrEqual(3);
      for (const it of seen) {
        if (it.id === idA) {
          expect(it.icsopPdfBlobPath).toBe(pdfBlobPath);
          expect(it.links).toEqual([]);
        } else if (it.id === idB) {
          expect(it.icsopPdfBlobPath).toBeNull();
          expect(it.links.map((l) => l.targetDocumentId)).toEqual([idA]);
        } else {
          expect(it.icsopPdfBlobPath).toBeNull();
          expect(it.links).toEqual([]);
        }
      }
    });
  });
});
