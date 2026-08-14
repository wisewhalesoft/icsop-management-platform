import { bootIntApp, shutdownIntApp, IntCtx, MARK } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { hashPassword } from '../../src/accounts/password';

/**
 * F003 手動帳號基本資料 delta（姓名／公司／部門／職位；2026-08-14 使用者直接裁定，
 * 同日第二次裁決＝公司別可跨公司選擇）vs SOP。
 * 規格權威：docs/specs/features/F003-account-role-management.md#manual-account-profile（AC-P1～AC-P27）
 * 錯誤碼：docs/specs/error-handling.md#account-profile
 *
 * 補強 backend/src/accounts/account-profile.spec.ts（FakeStore 單元層）之四個侷限：
 *  ① AC-P14／AC-P15 GET /job-titles／GET /companies 為本 delta 新增之 2 個端點，實作位置由
 *     architect 決定（spec 原文），故無法在單元層預先猜測 controller 類別名稱——只能經真實路由驗證。
 *  ② AC-P20 權限（RolePermissionGuard × F025「帳號管理」矩陣）需要真實守門鏈，FakeStore
 *     測試完全繞過 Guard。
 *  ③ AC-P1「passwordHash 不出現於回應」與 AC-P21「AuditWriter 完全未被呼叫」在 FakeStore
 *     （直接回傳 seed 物件、無 AuditWriter 依賴）測會是重言式斷言，需真實序列化/真實稽核管線。
 *  ④ AC-P24（loginId 全域唯一）與 AC-P23a～c（清單跨公司可見＋逐列解析）：現行
 *     `AccountStore.existsLoginId(companyCode, loginId)` 以 companyCode 為範圍，「全域」之新
 *     實作可能改變呼叫慣例，於 FakeStore 猜測介面形狀風險高於待驗證之業務規則本身；AC-P23 需要
 *     「兩間公司各有帳號」之真實情境，真 DB 較不易誤判。
 *
 * HTTP 層錯誤內文一律只驗 res.status（比照本目錄既有 itest 慣例，如 org-change-alert.itest.ts／
 * f014.itest.ts），不斷言 res.body.message／code 之封裝形狀——錯誤碼之精確內容已於
 * account-profile.spec.ts（單元層 `.rejects.toThrow('ACCOUNT_ORG_CODE_INVALID')` 等）驗證。
 *
 * ⚠ 範圍邊界（刻意不含）：AC-P25／F001 AC-C1～AC-C3（帳密登入頁跨公司解析）屬 F001 登入流程，
 * 非本 F003 帳號管理 CRUD 契約——建議另開 F001 專屬測試任務，見收工報告 risks-and-gaps。
 *
 * 執行：`npm run test:int`（需 host 能連 SOP）。已知真實資料事實（診斷用查詢確認，見開發者
 * 對話紀錄，非讀production碼得知）：ORG_UNIT 目前僅同步 companyCode='AS'（AC-P26 之前提）；
 * JOB_TITLE 另含 AD/AE/AJ 等公司列。
 */
describe('[int] F003 手動帳號基本資料 delta（AC-P14／AC-P20／AC-P21 + 契約回歸）vs SOP', () => {
  let ctx: IntCtx;

  const SYSADMIN_LOGIN = `${MARK.acct}p3sys`;
  const SUPERVISOR_LOGIN = `${MARK.acct}p3sup`;
  const DEPTCONTACT_LOGIN = `${MARK.acct}p3dc`;
  const USER_LOGIN = `${MARK.acct}p3usr`;
  const MANUAL_TARGET_LOGIN = `${MARK.acct}p3tgt`;

  let sysadminCookie: string;
  let supervisorCookie: string;
  let deptCookie: string;
  let userCookie: string;
  let manualTargetId: string;

  beforeAll(async () => {
    ctx = await bootIntApp();
    const repo = AppDataSource.getRepository(Account);
    await repo.save([
      repo.create({
        companyCode: 'AS',
        loginId: SYSADMIN_LOGIN,
        roleCode: 'SysAdmin',
        status: 'active',
        source: 'manual',
        name: 'ZZINT SysAdmin',
        passwordHash: hashPassword('x'),
      }),
      repo.create({
        companyCode: 'AS',
        loginId: SUPERVISOR_LOGIN,
        roleCode: 'Supervisor',
        status: 'active',
        source: 'manual',
        name: 'ZZINT Supervisor',
        passwordHash: hashPassword('x'),
      }),
      repo.create({
        companyCode: 'AS',
        loginId: DEPTCONTACT_LOGIN,
        roleCode: 'DeptContact',
        status: 'active',
        source: 'manual',
        name: 'ZZINT DeptContact',
        passwordHash: hashPassword('x'),
      }),
      repo.create({
        companyCode: 'AS',
        loginId: USER_LOGIN,
        roleCode: 'User',
        status: 'active',
        source: 'manual',
        name: 'ZZINT User',
        passwordHash: hashPassword('x'),
      }),
    ]);
    const target = await repo.save(
      repo.create({
        companyCode: 'AS',
        loginId: MANUAL_TARGET_LOGIN,
        roleCode: 'User',
        status: 'active',
        source: 'manual',
        name: 'ZZINT PATCH 目標',
        passwordHash: hashPassword('x'),
      }),
    );
    manualTargetId = target.id;

    sysadminCookie = ctx.cookieFor(SYSADMIN_LOGIN, 'AS', 'SysAdmin');
    supervisorCookie = ctx.cookieFor(SUPERVISOR_LOGIN, 'AS', 'Supervisor');
    deptCookie = ctx.cookieFor(DEPTCONTACT_LOGIN, 'AS', 'DeptContact');
    userCookie = ctx.cookieFor(USER_LOGIN, 'AS', 'User');
  }, 60000);

  afterAll(() => shutdownIntApp(ctx));

  describe('AC-P14 GET /job-titles（本 delta 第一個新增之端點）', () => {
    it('SysAdmin 可讀：回應為 { companyCode, code, name }[]，依 code 昇冪，且僅 companyCode=AS 之列', async () => {
      const res = await ctx.http().get('/job-titles?companyCode=AS').set('Cookie', sysadminCookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      const body = res.body as { companyCode: string; code: string; name: string }[];
      for (const row of body) {
        expect(row.companyCode).toBe('AS');
        expect(typeof row.code).toBe('string');
        expect(typeof row.name).toBe('string');
      }
      const codes = body.map((r) => r.code);
      expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b)));
    });

    it('未帶 companyCode → 預設為操作者 session 之 companyCode（AS）', async () => {
      const res = await ctx.http().get('/job-titles').set('Cookie', sysadminCookie);
      expect(res.status).toBe(200);
      const body = res.body as { companyCode: string }[];
      expect(body.length).toBeGreaterThan(0);
      for (const row of body) expect(row.companyCode).toBe('AS');
    });

    it('companyCode 精確過濾：帶 companyCode=AD 之結果不含 AS 之列（不做跨公司 fallback）', async () => {
      const res = await ctx.http().get('/job-titles?companyCode=AD').set('Cookie', sysadminCookie);
      expect(res.status).toBe(200);
      const body = res.body as { companyCode: string }[];
      for (const row of body) expect(row.companyCode).toBe('AD');
    });

    it('ICSOPAdmin 可讀（唯讀角色，read 權限仍在）', async () => {
      const res = await ctx.http().get('/job-titles?companyCode=AS').set('Cookie', ctx.adminCookie);
      expect(res.status).toBe(200);
    });

    it.each([
      ['主管', () => supervisorCookie],
      ['部門窗口', () => deptCookie],
      ['一般使用者', () => userCookie],
    ])('%s 呼叫 → 403', async (_label, cookieFn) => {
      const res = await ctx.http().get('/job-titles?companyCode=AS').set('Cookie', cookieFn());
      expect(res.status).toBe(403);
    });

    it('未登入 → 401', async () => {
      const res = await ctx.http().get('/job-titles?companyCode=AS');
      expect(res.status).toBe(401);
    });
  });

  describe('AC-P15 GET /companies（本 delta 第二個、也是最後一個新增之端點）', () => {
    it('SysAdmin 可讀：回應為 { companyCode, companyName }[]，依 companyCode 昇冪，含 AS 與 AE，不含 AC（已結束）', async () => {
      const res = await ctx.http().get('/companies').set('Cookie', sysadminCookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const body = res.body as { companyCode: string; companyName: string }[];
      const codes = body.map((r) => r.companyCode);
      expect(codes).toContain('AS');
      expect(codes).toContain('AE');
      expect(codes).not.toContain('AC'); // INV-C1 之排除項：測試資料且已結束
      expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b)));
      for (const row of body) expect(typeof row.companyName).toBe('string');
    });

    it('ICSOPAdmin 可讀（唯讀角色，read 權限仍在）', async () => {
      const res = await ctx.http().get('/companies').set('Cookie', ctx.adminCookie);
      expect(res.status).toBe(200);
    });

    it.each([
      ['主管', () => supervisorCookie],
      ['部門窗口', () => deptCookie],
      ['一般使用者', () => userCookie],
    ])('%s 呼叫 → 403', async (_label, cookieFn) => {
      const res = await ctx.http().get('/companies').set('Cookie', cookieFn());
      expect(res.status).toBe(403);
    });

    it('未登入 → 401', async () => {
      const res = await ctx.http().get('/companies');
      expect(res.status).toBe(401);
    });
  });

  describe('AC-P20 建立／編輯手動帳號之權限（write＝SysAdmin，唯讀／無皆 403）', () => {
    it('SysAdmin 可建立', async () => {
      const res = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({ loginId: `${MARK.acct}p20a`, password: 'Zz@2026Pw', roleCode: 'User', name: 'ZZINT P20A' });
      expect(res.status).toBe(201);
    });

    it('ICSOPAdmin（唯讀）建立 → 403', async () => {
      const res = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', ctx.adminCookie)
        .send({ loginId: `${MARK.acct}p20b`, password: 'x', roleCode: 'User', name: 'X' });
      expect(res.status).toBe(403);
    });

    it.each([
      ['主管', () => supervisorCookie],
      ['部門窗口', () => deptCookie],
      ['一般使用者', () => userCookie],
    ])('%s 建立 → 403', async (_label, cookieFn) => {
      const res = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', cookieFn())
        .send({ loginId: `${MARK.acct}p20c`, password: 'x', roleCode: 'User', name: 'X' });
      expect(res.status).toBe(403);
    });

    it('未登入建立 → 401', async () => {
      const res = await ctx
        .http()
        .post('/admin/accounts')
        .send({ loginId: `${MARK.acct}p20d`, password: 'x', roleCode: 'User', name: 'X' });
      expect(res.status).toBe(401);
    });

    it('SysAdmin 可編輯（PATCH）', async () => {
      const res = await ctx
        .http()
        .patch(`/admin/accounts/${manualTargetId}`)
        .set('Cookie', sysadminCookie)
        .send({ name: 'ZZINT PATCH 目標改' });
      expect([200, 204]).toContain(res.status);
    });

    it('ICSOPAdmin（唯讀）編輯 → 403', async () => {
      const res = await ctx
        .http()
        .patch(`/admin/accounts/${manualTargetId}`)
        .set('Cookie', ctx.adminCookie)
        .send({ name: '改' });
      expect(res.status).toBe(403);
    });

    it.each([
      ['主管', () => supervisorCookie],
      ['部門窗口', () => deptCookie],
      ['一般使用者', () => userCookie],
    ])('%s 編輯 → 403', async (_label, cookieFn) => {
      const res = await ctx
        .http()
        .patch(`/admin/accounts/${manualTargetId}`)
        .set('Cookie', cookieFn())
        .send({ name: '改' });
      expect(res.status).toBe(403);
    });

    it('未登入編輯 → 401', async () => {
      const res = await ctx.http().patch(`/admin/accounts/${manualTargetId}`).send({ name: '改' });
      expect(res.status).toBe(401);
    });
  });

  describe('AC-P21 稽核：建立／編輯手動帳號完全不寫入 AUDIT_LOG', () => {
    it('建立成功後 AUDIT_LOG 總筆數不變', async () => {
      const before = await AppDataSource.query('SELECT COUNT(*) AS c FROM [AUDIT_LOG]');
      const res = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({ loginId: `${MARK.acct}p21a`, password: 'x', roleCode: 'User', name: 'ZZINT P21A' });
      expect(res.status).toBe(201);
      const after = await AppDataSource.query('SELECT COUNT(*) AS c FROM [AUDIT_LOG]');
      expect(Number(after[0].c)).toBe(Number(before[0].c));
    });

    it('編輯成功後 AUDIT_LOG 總筆數不變', async () => {
      const before = await AppDataSource.query('SELECT COUNT(*) AS c FROM [AUDIT_LOG]');
      const res = await ctx
        .http()
        .patch(`/admin/accounts/${manualTargetId}`)
        .set('Cookie', sysadminCookie)
        .send({ name: 'ZZINT PATCH 稽核靜默' });
      expect([200, 204]).toContain(res.status);
      const after = await AppDataSource.query('SELECT COUNT(*) AS c FROM [AUDIT_LOG]');
      expect(Number(after[0].c)).toBe(Number(before[0].c));
    });
  });

  describe('契約回歸（AC-P1／AC-P11 端到端確認，補強單元層 FakeStore 之侷限）', () => {
    it('AC-P1 建立成功之回應不含 passwordHash（亦不洩漏雜湊格式痕跡）', async () => {
      const res = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({ loginId: `${MARK.acct}p1e`, password: 'x', roleCode: 'User', name: 'ZZINT P1E' });
      expect(res.status).toBe(201);
      expect(res.body.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/scrypt|\$2[aby]\$/);
    });

    it('AC-P11 上游帳號經 HTTP PATCH 嘗試改姓名 → 403（後端為權威，非僅前端 disabled）', async () => {
      const repo = AppDataSource.getRepository(Account);
      const upstream = await repo.save(
        repo.create({
          companyCode: 'AS',
          loginId: `${MARK.acct}p11up`,
          roleCode: 'User',
          status: 'active',
          source: 'upstream',
          name: 'ZZINT 上游',
        }),
      );
      const res = await ctx
        .http()
        .patch(`/admin/accounts/${upstream.id}`)
        .set('Cookie', sysadminCookie)
        .send({ name: '嘗試竄改' });
      expect(res.status).toBe(403);
    });
  });

  describe('AC-P24 loginId 全域唯一（既有「同公司重複」之嚴格超集，不影響既有行為）', () => {
    /**
     * ⚠ 已知混淆源（撰寫當下以 diag 探測確認）：AC-P5 實作前，POST /admin/accounts 完全不處理
     * payload 之 companyCode（回應 DTO 甚至未含此鍵），兩筆建立實際上都落在操作者 SysAdmin
     * 自身之 companyCode（AS）——本測試此刻回 409 是「同公司重複」之既有行為巧合命中，
     * 尚未證明「全域」唯一性邏輯本身存在。待 AC-P5（公司欄寫入）落地後，此測試才會轉為
     * 對 AC-P24 之真實診斷（兩筆將真正落在不同公司，409 才代表全域唯一性邏輯生效）。
     * 不可據此測試現在為綠燈就回報 AC-P24 已滿足——回報時須明列此耦合。
     */
    it('AS 已有之 loginId 於 AE 建立同名帳號 → 409 ACCOUNT_USERNAME_EXISTS（跨公司亦視為衝突）', async () => {
      const loginId = `${MARK.acct}p24`;
      const first = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({ loginId, password: 'x', roleCode: 'User', name: 'ZZINT P24 第一筆', companyCode: 'AS' });
      expect(first.status).toBe(201);

      const second = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({ loginId, password: 'x', roleCode: 'User', name: 'ZZINT P24 第二筆', companyCode: 'AE' });
      expect(second.status).toBe(409);
    });
  });

  describe('AC-P23a／AC-P23b 帳號清單改為跨公司可見 ＋ 公司篩選', () => {
    /**
     * ⚠ 與 AC-P24 同一混淆源：AC-P5 落地前 companyCode 完全不落地（回應甚至不含此鍵，
     * diag 探測已確認），故本組刻意要求 row.companyCode 嚴格等於 'AE'（非寬鬆之 `if defined`）
     * ——這使兩測試在 AC-P5／回應新增 companyCode 鍵落地前維持真紅，避免「帳號其實仍落在
     * AS、只是剛好被找到」之假綠掩蓋 AC-P23a 本身（移除清單之操作者公司過濾）尚未成立的事實。
     */
    it('AC-P23a 清單不再以操作者 companyCode 過濾：AE 之手動帳號仍出現於 SysAdmin（AS）之清單，且 companyCode 確為 AE', async () => {
      const loginId = `${MARK.acct}p23a`;
      const created = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({ loginId, password: 'x', roleCode: 'User', name: 'ZZINT P23A', companyCode: 'AE' });
      expect(created.status).toBe(201);

      const list = await ctx.http().get('/admin/accounts').set('Cookie', sysadminCookie);
      expect(list.status).toBe(200);
      const rows = (list.body.items ?? list.body) as { loginId: string; companyCode?: string }[];
      const row = rows.find((r) => r.loginId === loginId);
      expect(row).toBeDefined();
      expect(row!.companyCode).toBe('AE');
    });

    it('AC-P23b companyCode 篩選參數：帶 companyCode=AE 之結果僅含 AE 帳號（逐列嚴格核對，非寬鬆略過）', async () => {
      const loginId = `${MARK.acct}p23b`;
      await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({ loginId, password: 'x', roleCode: 'User', name: 'ZZINT P23B', companyCode: 'AE' });

      const list = await ctx.http().get('/admin/accounts?companyCode=AE').set('Cookie', sysadminCookie);
      expect(list.status).toBe(200);
      const rows = (list.body.items ?? list.body) as { loginId: string; companyCode?: string }[];
      expect(rows.some((r) => r.loginId === loginId)).toBe(true);
      for (const row of rows) {
        expect(row.companyCode).toBe('AE');
      }
    });

    it('AC-P23c 公司名稱逐列解析：AE 帳號之 company 欄＝該列自身公司之全稱，非操作者（AS）之全稱', async () => {
      const loginId = `${MARK.acct}p23c`;
      await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({ loginId, password: 'x', roleCode: 'User', name: 'ZZINT P23C', companyCode: 'AE' });

      const list = await ctx.http().get('/admin/accounts').set('Cookie', sysadminCookie);
      expect(list.status).toBe(200);
      const rows = (list.body.items ?? list.body) as { loginId: string; company?: string | null }[];
      const row = rows.find((r) => r.loginId === loginId);
      expect(row).toBeDefined();
      // AC-P15「本輪內容」：AE → 和潤電能；操作者(SysAdmin)所屬 AS → 和潤企業股份有限公司。
      // 現行實作若對全列套用操作者公司之單一值，此列會誤顯示「和潤企業股份有限公司」。
      expect(row!.company).toBe('和潤電能');
      expect(row!.company).not.toBe('和潤企業股份有限公司');
    });
  });

  describe('AC-P26 部門候選為空之呈現（AE 尚無 ORG_UNIT 同步資料，屬資料現實非錯誤）', () => {
    it('GET /org-units?companyCode=AE（既有端點，不受本 delta 影響）→ 200 空陣列', async () => {
      const res = await ctx.http().get('/org-units?companyCode=AE').set('Cookie', sysadminCookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('AC-P26 於 AE 公司（部門候選為空）仍可建立成功，orgCode=null', async () => {
      const res = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({
          loginId: `${MARK.acct}p26`,
          password: 'x',
          roleCode: 'User',
          name: 'ZZINT P26',
          companyCode: 'AE',
          orgCode: null,
        });
      expect(res.status).toBe(201);
      expect(res.body.orgCode).toBeNull();
    });
  });

  /**
   * AC-P23d（部門名稱以 (companyCode, orgCode) 複合鍵解析）。真實 SOP DB 的 AE 目前零 ORG_UNIT
   * （AC-P26 前提），故不可能有「AS／AE 皆有相同 orgCode 但不同單位」之真實資料組合；改用
   * AC-P10a 已建立之「直接經 repository 種入既有資料」慣例——刻意種一筆 companyCode='AE'
   * 但 orgCode 取值為**真實存在之 AS 部門代碼**（JAC00＝營運管理部/審查室，本檔既有 diag
   * 已確認）的髒資料列（現實成因：AC-P10b 落地前之歷史資料、或上游同步之資料異常）。
   * 正確（以該列自身之 AE 公司做複合鍵查詢）應解析為 null（AE 無此 ORG_UNIT）；
   * 錯誤（僅以 orgCode 比對、忽略公司）會誤解析出 AS 的「審查室」。兩者肉眼可辨、斷言可辨。
   */
  describe('AC-P23d 部門名稱逐列解析（複合鍵 (companyCode, orgCode)，不得僅以 orgCode 比對）', () => {
    it('AE 帳號之 orgCode 恰為一個真實 AS 部門代碼（JAC00）時，department 須為 null（AE 無此 ORG_UNIT），不得誤解析出 AS 之「審查室」', async () => {
      const repo = AppDataSource.getRepository(Account);
      const dirty = await repo.save(
        repo.create({
          companyCode: 'AE',
          loginId: `${MARK.acct}p23d`,
          roleCode: 'User',
          status: 'active',
          source: 'manual',
          name: 'ZZINT P23D 髒資料',
          orgCode: 'JAC00', // 真實存在，但僅屬於 AS，非 AE
        }),
      );
      const list = await ctx.http().get('/admin/accounts').set('Cookie', sysadminCookie);
      expect(list.status).toBe(200);
      const rows = (list.body.items ?? list.body) as {
        id: string;
        department?: string | null;
      }[];
      const row = rows.find((r) => r.id === dirty.id);
      expect(row).toBeDefined();
      // 2026-08-14 dispute 裁決：刪除原本的 `expect(row!.department).not.toMatch(/審查室/)`。
      // Jest 的 toMatch／.not.toMatch 皆要求接收值為字串，非字串一律丟 matcher error（.not 救不了
      // 型別檢查本身）——而本斷言唯一能通過的前提正是 department 為 null（見上一行），故該行在
      // 任何實作下都不可能綠，屬純粹的 matcher 誤用，非業務斷言。department===null 本身已是
      // 「不含審查室」之嚴格更強命題（null 沒有子字串可言），刪除不減損鑑別力（保留下一行的
      // 正向情境測試用 toMatch 驗證確有污染，兩者互補）。
      expect(row!.department).toBeNull();
    });
  });

  /**
   * AC-P15 INV-C1（不變式，可機器驗證）：SELECTABLE_COMPANIES ≡ Object.keys(COMPANY_FULL_NAMES)。
   * 不讀取 production 常數，改以「GET /companies 回傳之每個 companyCode，POST /admin/accounts
   * 皆能接受」＋「一個不在該清單中的代碼必被拒絕」之雙向 HTTP 行為，間接證明兩個常數之鍵集合恆等
   * ——若兩者不同步，這裡必有一側對不上。
   */
  describe('AC-P15 INV-C1（SELECTABLE_COMPANIES ≡ GET /companies 回傳之鍵集合，機器可驗證）', () => {
    it('GET /companies 回傳之每個 companyCode，皆可用於 POST /admin/accounts 之 companyCode 而不觸發 ACCOUNT_COMPANY_CODE_INVALID', async () => {
      const companiesRes = await ctx.http().get('/companies').set('Cookie', sysadminCookie);
      expect(companiesRes.status).toBe(200);
      const codes = (companiesRes.body as { companyCode: string }[]).map((c) => c.companyCode);
      expect(codes.length).toBeGreaterThan(0);
      for (const code of codes) {
        const res = await ctx
          .http()
          .post('/admin/accounts')
          .set('Cookie', sysadminCookie)
          .send({
            loginId: `${MARK.acct}invc1${code.toLowerCase()}`,
            password: 'x',
            roleCode: 'User',
            name: `ZZINT INV-C1 ${code}`,
            companyCode: code,
          });
        expect(res.status).toBe(201);
      }
    });

    it('一個確定不在 GET /companies 清單中的代碼（ZZ）→ ACCOUNT_COMPANY_CODE_INVALID（400），驗證清單非過度寬鬆', async () => {
      const companiesRes = await ctx.http().get('/companies').set('Cookie', sysadminCookie);
      const codes = (companiesRes.body as { companyCode: string }[]).map((c) => c.companyCode);
      expect(codes).not.toContain('ZZ');
      const res = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({ loginId: `${MARK.acct}invc1zz`, password: 'x', roleCode: 'User', name: 'X', companyCode: 'ZZ' });
      expect(res.status).toBe(400);
    });
  });

  /**
   * AC-P27（回歸護欄）：既有 AS 路徑之帳號建立/清單解析結果，不得因本 delta（公司可跨選）而改變。
   * 沒有「delta 前」快照可比對，故以「AS 帳號之建立與清單解析結果，逐項符合 delta 前既已確立的
   * 慣例」作為代理驗證——與 accounts.service.spec.ts／account-profile.spec.ts 既有之 AS-only
   * 單元測試（company/department/title 解析）同一組期望值，於真實 HTTP＋真實 DB 路徑上重新核對。
   */
  describe('AC-P27 既有 AS 路徑回歸護欄', () => {
    it('AS 手動帳號建立＋清單解析：company/department/title 逐項與 delta 前之既有慣例相同', async () => {
      const res = await ctx
        .http()
        .post('/admin/accounts')
        .set('Cookie', sysadminCookie)
        .send({
          loginId: `${MARK.acct}p27`,
          password: 'x',
          roleCode: 'User',
          name: 'ZZINT P27',
          companyCode: 'AS',
          orgCode: 'JAC00',
          jobTitleCode: 'D01',
        });
      expect(res.status).toBe(201);

      const list = await ctx.http().get('/admin/accounts').set('Cookie', sysadminCookie);
      const rows = (list.body.items ?? list.body) as {
        loginId: string;
        company?: string | null;
        department?: string | null;
        title?: string | null;
      }[];
      const row = rows.find((r) => r.loginId === `${MARK.acct}p27`);
      expect(row).toBeDefined();
      expect(row!.company).toBe('和潤企業股份有限公司');
      // department 之精確字串格式（是否套用 buildOrgPath 式二段組字）由既有實作決定、非本 delta
      // 改動範圍；只驗證「AS 路徑仍正確解析、非 null／未壞掉」，避免押注既有格式慣例。
      expect(row!.department).toBeTruthy();
      expect(row!.department).toMatch(/審查室/);
      expect(row!.title).toBe('經理');
    });
  });
});
