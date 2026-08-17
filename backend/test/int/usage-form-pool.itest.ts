import { randomUUID } from 'crypto';
import { bootIntApp, shutdownIntApp, IntCtx, MARK } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { UsageFormPool } from '../../src/database/entities/usage-form-pool.entity';
import { DocUsageForm } from '../../src/database/entities/doc-usage-form.entity';
import { IcsopDocument } from '../../src/database/entities/icsop-document.entity';
import { Lifecycle } from '../../src/database/entities/lifecycle.entity';
import { BLOB_STORE, BlobStore } from '../../src/storage/blob-store';

/**
 * [int] 使用表單池總覽 GET /admin/usage-forms/overview（F018 → 管理頁 prototype 19）。
 *
 * 驗證真實 TypeORM join：USAGE_FORM_POOL ⋈ DOC_USAGE_FORM ⋈ ICSOP_DOCUMENT 組出每筆表單之
 * `docCount` 與 `documents`（含真實 documentNumber/documentName）。unit 層以 FakeStore 覆蓋邏輯，
 * 真實 join 之欄位對映與筆數僅能對真庫驗證。
 *
 * ⚠ 不隨單元套件執行；由 orchestrator 於合併後序列跑（`npm run test:int`，需 host 能連 SOP）。
 * marker：表單名前綴 `ZZINT_UF_`、文件編號沿用 harness `ZZINT-`（cleanupMarkers 清 ICSOP_DOCUMENT）。
 */
const UF_MARK = 'ZZINT_UF_';

/** uf1 之真實位元組（代理串流須逐位元組回傳同一份內容）。 */
const UF1_BYTES = Buffer.from('ZZINT usage-form payload', 'utf8');

describe('[int] usage-form pool overview — join vs SOP', () => {
  let ctx: IntCtx;
  const formIds: string[] = [];
  /** 供 afterAll 清除實際寫入之 marker blob（比照 storage.itest.ts）。 */
  const formBlobPaths: string[] = [];

  async function cleanupFormMarkers(): Promise<void> {
    const q = AppDataSource.query.bind(AppDataSource);
    const markerForms = `(SELECT [id] FROM [USAGE_FORM_POOL] WHERE [name] LIKE '${UF_MARK}%')`;
    await q(`DELETE FROM [DOC_USAGE_FORM] WHERE [formId] IN ${markerForms}`).catch(() => undefined);
    await q(`DELETE FROM [USAGE_FORM_POOL] WHERE [name] LIKE '${UF_MARK}%'`).catch(() => undefined);
  }

  beforeAll(async () => {
    ctx = await bootIntApp();
    await cleanupFormMarkers();

    // marker 循環（FK：ICSOP_DOCUMENT.lifecycleId → LIFECYCLE.id；cleanupMarkers 清 ZZINT_LC_）。
    const lcRepo = AppDataSource.getRepository(Lifecycle);
    const lc = await lcRepo.save(
      lcRepo.create({ name: `${MARK.lc}UF`, status: 'active' } as Partial<Lifecycle>),
    );

    // marker 文件（沿用 harness ZZINT- 前綴，afterAll 由 cleanupMarkers 清除）。
    const docRepo = AppDataSource.getRepository(IcsopDocument);
    const doc = await docRepo.save(
      docRepo.create({
        status: 'active',
        documentNumber: `${MARK.doc}UF-001`,
        documentName: 'ZZINT 使用表單關聯測試文件',
        lifecycleId: lc.id,
        announcedDate: null,
        contentSummary: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Partial<IcsopDocument>),
    );

    // 兩份 marker 表單：uf1 關聯 1 份文件、uf2 無關聯。
    const formRepo = AppDataSource.getRepository(UsageFormPool);
    const uf1 = await formRepo.save(
      formRepo.create({
        id: randomUUID(),
        name: `${UF_MARK}放款覆核表.xlsx`,
        blobPath: `zzint/${randomUUID()}.xlsx`,
        format: 'xlsx',
        size: '2048',
        uploadedBy: 'zzint',
        uploadedAt: new Date(),
      }),
    );
    const uf2 = await formRepo.save(
      formRepo.create({
        id: randomUUID(),
        name: `${UF_MARK}對保通知書.pdf`,
        blobPath: `zzint/${randomUUID()}.pdf`,
        format: 'pdf',
        size: '4096',
        uploadedBy: 'zzint',
        uploadedAt: new Date(),
      }),
    );
    formIds.push(uf1.id, uf2.id);
    formBlobPaths.push(uf1.blobPath, uf2.blobPath);

    /**
     * 🔴 2026-08-17：下載端點改為**代理串流**（F020 `AC-D3a` 後台側修訂）後，本 fixture
     * 必須讓 blob **真的存在**——原本只在 DB 插一列 `blobPath`，核發 SAS 不需要 blob 存在，
     * 故一直是「參照指向空氣」也照樣 200。代理串流會去讀位元組，讀不到就是 404。
     * 這正是本次改動把「DB 有列 ≠ 檔案存在」從**永遠測不到**變成**測得到**的地方。
     * marker key（`zzint/`）於 afterAll 清除，比照 `storage.itest.ts` 之既有慣例。
     */
    const blob = ctx.app.get<BlobStore>(BLOB_STORE);
    await blob.put(uf1.blobPath, UF1_BYTES, 'application/vnd.ms-excel');

    const linkRepo = AppDataSource.getRepository(DocUsageForm);
    await linkRepo.save(linkRepo.create({ documentId: doc.id, formId: uf1.id }));
  }, 60000);

  afterAll(async () => {
    const blob = ctx.app?.get<BlobStore>(BLOB_STORE);
    for (const p of formBlobPaths) await blob?.delete(p).catch(() => undefined);
    await cleanupFormMarkers().catch(() => undefined);
    await shutdownIntApp(ctx);
  });

  it('GET /admin/usage-forms/overview → 每筆附 docCount + 真實文件 join', async () => {
    const res = await ctx.http().get('/admin/usage-forms/overview').set('Cookie', ctx.adminCookie);
    expect(res.status).toBe(200);

    const marker = (res.body as Array<Record<string, unknown>>).filter((r) =>
      String(r.name).startsWith(UF_MARK),
    );
    const uf1 = marker.find((r) => String(r.name).includes('放款覆核表'))!;
    const uf2 = marker.find((r) => String(r.name).includes('對保通知書'))!;

    expect(uf1.docCount).toBe(1);
    expect((uf1.documents as Array<Record<string, unknown>>)[0].documentNumber).toBe(`${MARK.doc}UF-001`);
    expect((uf1.documents as Array<Record<string, unknown>>)[0].documentName).toBe('ZZINT 使用表單關聯測試文件');
    expect(uf2.docCount).toBe(0);
    expect(uf2.documents).toEqual([]);
  });

  it('未登入 → 401（session 缺）', async () => {
    const res = await ctx.http().get('/admin/usage-forms/overview');
    expect(res.status).toBe(401);
  });

  /**
   * 🔴 2026-08-17（缺失修正第 5／6 項；F020 `AC-D3a` 後台側修訂）：本端點由「回 `{ url }` SAS JSON」
   * 改為「代理串流」——`window.open(sasUrl)` 導覽至 `*.blob.core.windows.net` 會被 Chrome
   * Safe Browsing 以「偵測到危險網站」攔截。
   * 原斷言（供追溯）：
   *   OLD> `expect(typeof (res.body as { url: string }).url).toBe('string');`
   *   OLD> `expect((res.body as { expiresInSeconds: number }).expiresInSeconds).toBeGreaterThan(0);`
   *
   * 📌 **本案在 [int] 層才有意義**：unit 以 FakeBlobStore 驗語意，但「回應是否真的是位元組、
   * `Content-Disposition` 是否真的帶得回中文檔名（Node 之 setHeader 只收 ISO-8859-1）」
   * 只有跑過真實 HTTP ＋ 真實 Blob 才算數。
   */
  it('GET /admin/usage-forms/:formId/download → 代理串流回原始位元組（read gate）', async () => {
    const res = await ctx
      .http()
      .get(`/admin/usage-forms/${formIds[0]}/download`)
      // 🔴 `responseType('blob')` 必要：supertest 依 `Content-Type` 挑 parser，`application/vnd.ms-excel`
      // 落到預設 parser 後 `res.body` 是 `{}` 而非 Buffer——不設的話位元組斷言會以型別錯誤失敗，
      // 而那與伺服器回了什麼無關。
      .responseType('blob')
      .set('Cookie', ctx.adminCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    // RFC 5987 段落帶回原始（中文）檔名——前端 `filenameFromContentDisposition` 優先讀取此項。
    expect(res.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent(`${UF_MARK}放款覆核表.xlsx`)}`,
    );
    // body 即檔案位元組本身，逐位元組等於寫入 Blob 者（RAW，未經任何轉換）。
    expect(Buffer.from(res.body as Buffer).equals(UF1_BYTES)).toBe(true);
  });

  /**
   * 🔴 **本案在改為代理串流前不可能存在**：核發 SAS 不需要 blob 存在，故「DB 有列但檔案不在」
   * 一律回 200 ＋ 一個指向空氣的 URL，錯誤要等使用者點下去才在 Azure 端爆開（且訊息不是我們的）。
   * uf2 刻意**不** `put` 任何位元組，用以鎖住這條新的失敗路徑。
   */
  it('參照存在但 blob 不存在 → 404（不得回 200 或空檔）', async () => {
    const res = await ctx
      .http()
      .get(`/admin/usage-forms/${formIds[1]}/download`)
      .set('Cookie', ctx.adminCookie);
    expect(res.status).toBe(404);
  });
});
