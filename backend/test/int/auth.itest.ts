import { bootIntApp, shutdownIntApp, ADMIN_LOGIN, ADMIN_PASSWORD, IntCtx, MARK } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { hashPassword } from '../../src/accounts/password';

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

/**
 * F001 跨公司帳密登入解析 delta（AC-C1～AC-C3；2026-08-14，F003 AC-P5「公司可跨公司選擇」之漣漪）。
 * 規格權威：docs/specs/features/F001-auth-login-session.md「跨公司手動帳號之帳密登入解析 delta」。
 * ⚠ 若不修訂，於 AS 以外公司建立之手動帳號將永遠無法登入（F003 AC-P25 標記為本裁決最嚴重之漣漪，
 * 即本檔案頭所載、已閉合過一次之「建立→登入死鏈」重演）。
 *
 * AC-C1③「命中多筆 → 401」之測試建構：SELECTABLE_COMPANIES 現況僅 AS／AE 兩碼（F003 AC-P15），
 * 而第①段已排除 AS，故單靠 AS／AE 兩碼於第②段殘餘搜尋空間最多僅 1 筆候選，數學上無法構造「多筆」。
 * 比照 AC-P10a／AC-P24 已建立之慣例（既有／歷史資料不受本 delta 之集合限制回溯），直接經
 * repository 種入一筆 companyCode='AD'（真實存在於組織主檔、但被 F003 AC-P15 排除於
 * SELECTABLE_COMPANIES 之公司，代表歷史／上游資料）＋一筆 'AE'，模擬合法之歷史多筆情境。
 */
describe('[int] F001 跨公司帳密登入解析 delta（AC-C1～AC-C3）vs SOP', () => {
  let ctx: IntCtx;
  beforeAll(async () => {
    ctx = await bootIntApp();
  }, 60000);
  afterAll(() => shutdownIntApp(ctx));

  async function seedAccount(loginId: string, companyCode: string, password: string) {
    const repo = AppDataSource.getRepository(Account);
    return repo.save(
      repo.create({
        companyCode,
        loginId,
        roleCode: 'User',
        status: 'active',
        source: 'manual',
        name: `ZZINT ${loginId}`,
        passwordHash: hashPassword(password),
      }),
    );
  }

  it('AC-C1① 既有路徑不變：AS 帳號以 (DEFAULT_COMPANY_CODE, loginId) 精確命中（回歸護欄，AC-P27）', async () => {
    const res = await ctx
      .http()
      .post('/auth/login')
      .send({ loginId: ADMIN_LOGIN, password: ADMIN_PASSWORD });
    expect([200, 201, 204]).toContain(res.status);
  });

  it('AC-C1② 跨公司 fallback：AE 帳號（AS 無同 loginId）於第①段未命中後，第②段跨公司恰命中一筆 → 登入成功，SessionUser.companyCode=AE', async () => {
    const loginId = `${MARK.acct}c1ae`;
    await seedAccount(loginId, 'AE', 'Zz@2026Pw');
    const login = await ctx.http().post('/auth/login').send({ loginId, password: 'Zz@2026Pw' });
    expect([200, 201, 204]).toContain(login.status);
    const cookie = login.headers['set-cookie'];
    expect(cookie).toBeTruthy();
    const me = await ctx.http().get('/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.companyCode).toBe('AE');
  });

  it('AC-C1（body 明確帶 companyCode=AE）→ 僅以該公司精確查詢，即使 loginId 於 AS 亦存在', async () => {
    const loginId = `${MARK.acct}c1exp`;
    await seedAccount(loginId, 'AS', 'PwAS@2026');
    await seedAccount(loginId, 'AE', 'PwAE@2026');
    const res = await ctx
      .http()
      .post('/auth/login')
      .send({ loginId, password: 'PwAE@2026', companyCode: 'AE' });
    expect([200, 201, 204]).toContain(res.status);
  });

  /**
   * ⚠ 已知混淆源（比照 account-profile.itest.ts 之 AC-P24 案例）：AC-C1②（跨公司 fallback）落地
   * 前，現行程式碼僅檢查 `(DEFAULT_COMPANY_CODE ?? 'AS', loginId)`——本測試之 loginId 只存在於
   * AD／AE，AS 本無此列，故現行程式碼「查無帳號」本就回 401，與此測試預期之 401 **巧合相同**，
   * 尚未真正證明「跨公司命中多筆時不任選一筆」之新邏輯存在。待 AC-C1②落地後，本測試才轉為對
   * 「多筆時拒絕」之真實診斷——屆時若實作偷懶「找到第一筆就用」而非真正偵測多筆，401 會變成
   * 200（因為某一組帳密會登入成功），本測試才會真正發揮鑑別力。
   */
  it('AC-C1③ 第②段命中多筆（歷史資料異常：AD＋AE 皆有同 loginId，AS 無）→ 401，不任選一筆', async () => {
    const loginId = `${MARK.acct}c1dup`;
    await seedAccount(loginId, 'AD', 'PwAD@2026');
    await seedAccount(loginId, 'AE', 'PwAE@2026');
    const res1 = await ctx.http().post('/auth/login').send({ loginId, password: 'PwAD@2026' });
    expect(res1.status).toBe(401);
    const res2 = await ctx.http().post('/auth/login').send({ loginId, password: 'PwAE@2026' });
    expect(res2.status).toBe(401);
  });

  /**
   * ⚠ 同上一測試之混淆源：AE-only 之 loginId 於 AC-C1② 落地前，現行程式碼在 stage①（僅查 AS）
   * 即查無此帳號，故「密碼錯誤」與「帳號不存在」現況本就都回 401（尚未進入真正跨公司查詢）。
   * 待 AC-C1② 落地、stage②真正跨公司查到此 AE 帳號後，本測試才開始驗證「密碼錯誤」與「查無
   * 此帳號」在**新邏輯下**是否仍統一回應——現況綠燈不可視為 AC-C3 已被驗證。
   */
  it('AC-C3 節流／訊息揭露不變：跨公司帳號密碼錯誤與「查無此帳號」回應狀態碼相同（不洩漏區分資訊）', async () => {
    const loginId = `${MARK.acct}c3ae`;
    await seedAccount(loginId, 'AE', 'Right@2026');
    const wrongPw = await ctx.http().post('/auth/login').send({ loginId, password: 'wrong' });
    expect(wrongPw.status).toBe(401);
    const nonexistent = await ctx
      .http()
      .post('/auth/login')
      .send({ loginId: `${MARK.acct}c3none`, password: 'whatever' });
    expect(nonexistent.status).toBe(401);
  });
});
