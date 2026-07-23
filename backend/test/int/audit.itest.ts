import { bootIntApp, shutdownIntApp, IntCtx } from './harness';
import { AppDataSource } from '../../src/database/data-source';

/** F024 查詢 ＋ F023 不可竄改：真 AUDIT_LOG（REVOKE 行為以整合實況報告）。 */
describe('[int] audit 查詢/不可竄改 (F023/F024) vs SOP', () => {
  let ctx: IntCtx;
  beforeAll(async () => {
    ctx = await bootIntApp();
  }, 60000);
  afterAll(() => shutdownIntApp(ctx));

  it('GET /admin/access-history → 200（空條件套 30 天預設，非阻擋）', async () => {
    const r = await ctx.http().get('/admin/access-history').set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
  });

  // F023 append-only 強制：INSTEAD OF UPDATE,DELETE 觸發器（migration 1722470400000）對所有主體
  // （含 owner/sysadmin）阻擋 → UPDATE/DELETE 皆 THROW AUDIT_IMMUTABLE。（DENY 曾被 owner 繞過，改觸發器。）
  it('AUDIT_LOG UPDATE 被 DB 觸發器阻擋（append-only／AUDIT_IMMUTABLE）', async () => {
    await expect(
      AppDataSource.query(`UPDATE [AUDIT_LOG] SET [id] = [id] WHERE 1 = 0`),
    ).rejects.toThrow(/AUDIT_IMMUTABLE|append-only/i);
  });

  it('AUDIT_LOG DELETE 亦被阻擋（append-only）', async () => {
    await expect(
      AppDataSource.query(`DELETE FROM [AUDIT_LOG] WHERE 1 = 0`),
    ).rejects.toThrow(/AUDIT_IMMUTABLE|append-only/i);
  });
});
