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

  // 已知 gap（整合實測 2026-07-23）：migration 之 best-effort `REVOKE UPDATE,DELETE ON AUDIT_LOG`
  // 對「經 role 授權」之 app 登入無效 → AUDIT_LOG 目前**非 append-only 強制**（UPDATE 可成功）。
  // 修法：改 `DENY UPDATE, DELETE`（或觸發器/唯讀 role）。加上後本測會轉為真綠 → 屆時移除 `.failing`。
  it.failing('AUDIT_LOG UPDATE 應被 DB 阻擋（append-only；目前未強制，此為已知 gap）', async () => {
    await expect(
      AppDataSource.query(`UPDATE [AUDIT_LOG] SET [id] = [id] WHERE 1 = 0`),
    ).rejects.toBeTruthy();
  });
});
