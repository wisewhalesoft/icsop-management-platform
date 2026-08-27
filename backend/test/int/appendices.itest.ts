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
/** CSV 行終止符（RFC 4180）。以字元碼組出，避免跳脫序列在編輯／複製過程中被還原成真換行。 */
const CRLF = String.fromCharCode(13, 10);

describe('[int] 附錄管理 HTTP 契約 vs SOP', () => {
  let ctx: IntCtx;
  let docId: string;
  const createdAppendixIds: string[] = [];
  const uploadedBlobs: string[] = [];
  const pdf = Buffer.from('%PDF-1.4 zzint appendix\n', 'utf8');
  // 刻意含中文（含「潤」等非 latin1 字元）：亂碼一旦復發，DB 落地即與此不符。
  const names = [`${MARK.doc}和潤企業永續報告書.pdf`, `${MARK.doc}管審會議紀錄.pdf`];
  /**
   * 🔵 `AC-X1`（2026-08-27）：批次上傳之附錄名稱＝**檔名去副檔名**。
   * 📝 被推翻之原行為保留供追溯：`APPENDIX_POOL.name` 原為含副檔名之完整檔名。
   * ⚠ 中文亂碼之鑑別力**未被削弱**——去掉的只有 `.pdf` 這段 ASCII，非 latin1 字元全數留在期望值裡。
   */
  const storedNames = names.map((n) => n.slice(0, -'.pdf'.length));

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
    expect(rows.map((r) => r.name)).toEqual(storedNames);
  });

  /**
   * 🔵 `AC-X2`（2026-08-27）：匯出 CSV 之末欄「關聯文件編號」。
   *
   * 📌 **本案只在 [int] 層才有意義**：`documents[].documentNumber` 是 `APPENDIX_POOL ⋈ DOC_APPENDIX
   * ⋈ ICSOP_DOCUMENT` 的真實 join 結果——unit 層以 FakeStore 直接餵好 `documents`，
   * 「欄位真的 join 得到嗎」在那一層恆真。本案於關聯建立**之後**再跑一次匯出（見下方第二案）。
   */
  it('GET /admin/appendices/export → 200 text/csv、UTF-8 BOM、七欄逐字表頭', async () => {
    const res = await ctx
      .http()
      .get('/admin/appendices/export')
      .responseType('blob')
      .set('Cookie', ctx.adminCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="appendices_\d{8}_\d{6}\.csv"/);
    const buf = Buffer.from(res.body as Buffer);
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = buf.subarray(3).toString('utf8').split(CRLF);
    expect(lines[0]).toBe('附錄名稱,格式,大小,上傳者,上傳時間,關聯文件數,關聯文件編號');
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
      [storedNames[0], 1],
      [storedNames[1], 2],
    ]);
  });

  /**
   * 🔵 `AC-X2`：關聯建立後再匯出——marker 附錄之末欄須為**真實 join 出來的文件編號**。
   * 🔴 這是「關聯文件數（幾份）」與「關聯文件編號（哪幾份）」之區分點：只驗筆數的斷言，
   *    在 join 取錯欄位（例如取到 `documentName` 或 `id`）時仍會全綠。
   */
  it('GET /admin/appendices/export → marker 列之「關聯文件編號」為真實 join 之文件編號', async () => {
    const res = await ctx
      .http()
      .get('/admin/appendices/export')
      .responseType('blob')
      .set('Cookie', ctx.adminCookie);
    expect(res.status).toBe(200);
    const lines = Buffer.from(res.body as Buffer).subarray(3).toString('utf8').split(CRLF);
    // 找不到時直接以「期望列 vs 全部 marker 列」呈現，避免只看到 `undefined` 而無從診斷。
    const row = lines.find((l) => l.startsWith(storedNames[0]));
    expect(row ?? lines.filter((l) => l.includes(MARK.doc)).join(' | ')).toContain(storedNames[0]);
    const cells = (row as string).split(',');
    expect(cells).toHaveLength(7);
    // 關聯文件數＝「這個**附錄**被幾份文件引用」＝1（本測試只有一份 marker 文件），
    // **不是**「這份文件有幾個附錄」（那才是 2）——兩者方向相反，別再看反。
    expect(cells[5]).toBe('1');
    const docNumber = (
      (await AppDataSource.query(`SELECT [documentNumber] FROM [ICSOP_DOCUMENT] WHERE [id] = @0`, [
        docId,
      ])) as Array<{ documentNumber: string }>
    )[0].documentNumber;
    expect(cells[6]).toBe(docNumber);
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
