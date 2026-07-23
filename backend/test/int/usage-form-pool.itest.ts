import { randomUUID } from 'crypto';
import { bootIntApp, shutdownIntApp, IntCtx, MARK } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { UsageFormPool } from '../../src/database/entities/usage-form-pool.entity';
import { DocUsageForm } from '../../src/database/entities/doc-usage-form.entity';
import { IcsopDocument } from '../../src/database/entities/icsop-document.entity';
import { Lifecycle } from '../../src/database/entities/lifecycle.entity';

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

describe('[int] usage-form pool overview — join vs SOP', () => {
  let ctx: IntCtx;
  const formIds: string[] = [];

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

    const linkRepo = AppDataSource.getRepository(DocUsageForm);
    await linkRepo.save(linkRepo.create({ documentId: doc.id, formId: uf1.id }));
  }, 60000);

  afterAll(async () => {
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

  it('GET /admin/usage-forms/:formId/download → 核發下載 URL（read gate）', async () => {
    const res = await ctx
      .http()
      .get(`/admin/usage-forms/${formIds[0]}/download`)
      .set('Cookie', ctx.adminCookie);
    expect(res.status).toBe(200);
    expect(typeof (res.body as { url: string }).url).toBe('string');
    expect((res.body as { expiresInSeconds: number }).expiresInSeconds).toBeGreaterThan(0);
  });
});
