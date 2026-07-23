import { bootIntApp, shutdownIntApp, ADMIN_LOGIN, ADMIN_PASSWORD, IntCtx } from './harness';

/** F001 途徑B ＋ F003 閉環：手動帳號 build→login→/auth/me 真 DB 往返（DoD-mandatory）。 */
describe('[int] 帳密登入 round-trip (F001 途徑B / F003) vs SOP', () => {
  let ctx: IntCtx;
  beforeAll(async () => {
    ctx = await bootIntApp();
  }, 60000);
  afterAll(() => shutdownIntApp(ctx));

  it('POST /auth/login (loginId+password) → 核發 session；GET /auth/me → 回身分', async () => {
    const login = await ctx
      .http()
      .post('/auth/login')
      .send({ loginId: ADMIN_LOGIN, password: ADMIN_PASSWORD });
    expect([200, 201, 204]).toContain(login.status);
    const cookie = login.headers['set-cookie'];
    expect(cookie).toBeTruthy();

    const me = await ctx.http().get('/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.loginId).toBe(ADMIN_LOGIN);
  });

  it('錯誤密碼 → 401（統一 AUTH_INVALID_CREDENTIALS，不洩漏帳號是否存在）', async () => {
    const bad = await ctx
      .http()
      .post('/auth/login')
      .send({ loginId: ADMIN_LOGIN, password: 'definitely-wrong' });
    expect(bad.status).toBe(401);

    const nope = await ctx
      .http()
      .post('/auth/login')
      .send({ loginId: 'zzint-nonexistent', password: 'whatever' });
    expect(nope.status).toBe(401);
  });
});
