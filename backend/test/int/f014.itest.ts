import { bootIntApp, shutdownIntApp, MARK, ADMIN_PASSWORD, IntCtx } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { hashPassword } from '../../src/accounts/password';

/**
 * F014 制定組織與當責室長（create-side）vs 真 SOP DB。
 * 建立含 制定公司/部門/室別 + 當責室長-主要 + 次要(多) + 使用部門(多)
 * → GET /:id 回傳全部 → 直接查 DOC_SECONDARY_CHIEF / DOC_USING_DEPT 確認落地。
 * 另驗 F026 欄位面：非 ICSOPAdmin 寫多值 → 403 FIELD_WRITE_FORBIDDEN。
 * 註：制定組織以 ORG_UNIT.orgCode（業務鍵）承載；本表無 FK 至 ORG_UNIT/ACCOUNT，值不必存在於名冊。
 */
describe('[int] F014 制定組織/當責室長/使用部門 create-side vs SOP', () => {
  let ctx: IntCtx;
  let lifecycleId: string;
  const num = `${MARK.doc}F014-${Date.now()}`;
  const sysLogin = `${MARK.acct}sys`;

  beforeAll(async () => {
    ctx = await bootIntApp();
    // 供 F026 forbidden 情境：SysAdmin marker 帳號（guard 以 DB 現行 roleCode 為準）。
    await AppDataSource.getRepository(Account).save(
      AppDataSource.getRepository(Account).create({
        companyCode: 'AS',
        loginId: sysLogin,
        roleCode: 'SysAdmin',
        status: 'active',
        source: 'manual',
        name: 'ZZINT 系統管理員',
        email: `${sysLogin}@zzint.local`,
        passwordHash: hashPassword(ADMIN_PASSWORD),
      }),
    );
    const r = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: `${MARK.lc}F014_${Date.now()}` });
    expect([200, 201]).toContain(r.status);
    lifecycleId = r.body.id;
    expect(lifecycleId).toBeTruthy();
  }, 60000);
  afterAll(() => shutdownIntApp(ctx));

  it('ICSOPAdmin 建立含制定三級＋主要室長＋2 次要＋2 使用部門 → GET 回傳且真表落地', async () => {
    const payload = {
      lifecycleId,
      status: 'active',
      documentNumber: num,
      documentName: 'ZZINT F014 制定組織',
      draftingCompanyId: '00000',
      draftingDeptId: 'A2000',
      draftingSectionId: 'A2100',
      primaryChiefId: '20050',
      secondaryChiefIds: ['20053', '20541'],
      usingDeptIds: ['A2000', 'B0000'],
    };
    const c = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send(payload);
    expect([200, 201]).toContain(c.status);
    const id = c.body.id;
    expect(id).toBeTruthy();

    // GET /:id 回傳制定組織 + 多值集合。
    const g = await ctx.http().get(`/admin/documents/${id}`).set('Cookie', ctx.adminCookie);
    expect(g.status).toBe(200);
    expect(g.body.draftingCompanyId).toBe('00000');
    expect(g.body.draftingDeptId).toBe('A2000');
    expect(g.body.draftingSectionId).toBe('A2100');
    expect(g.body.primaryChiefId).toBe('20050');
    expect([...g.body.secondaryChiefIds].sort()).toEqual(['20053', '20541']);
    expect([...g.body.usingDeptIds].sort()).toEqual(['A2000', 'B0000']);

    // 真表落地（DOC_SECONDARY_CHIEF / DOC_USING_DEPT）。
    const chiefs = await AppDataSource.query(
      `SELECT [employeeNo] FROM [DOC_SECONDARY_CHIEF] WHERE [documentId]=@0 ORDER BY [employeeNo]`,
      [id],
    );
    expect(chiefs.map((r: { employeeNo: string }) => r.employeeNo)).toEqual(['20053', '20541']);
    const depts = await AppDataSource.query(
      `SELECT [orgCode] FROM [DOC_USING_DEPT] WHERE [documentId]=@0 ORDER BY [orgCode]`,
      [id],
    );
    expect(depts.map((r: { orgCode: string }) => r.orgCode)).toEqual(['A2000', 'B0000']);
  });

  it('未提供多值 → GET 回空集合（次要室長/使用部門允許為空）', async () => {
    const c = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({
        lifecycleId,
        status: 'active',
        documentNumber: `${num}-empty`,
        documentName: 'ZZINT F014 空多值',
        draftingCompanyId: '00000',
      });
    expect([200, 201]).toContain(c.status);
    const g = await ctx.http().get(`/admin/documents/${c.body.id}`).set('Cookie', ctx.adminCookie);
    expect(g.status).toBe(200);
    expect(g.body.secondaryChiefIds).toEqual([]);
    expect(g.body.usingDeptIds).toEqual([]);
    expect(g.body.draftingCompanyId).toBe('00000');
  });

  it('非 ICSOPAdmin（SysAdmin）建立文件 → 403（功能面 PERMISSION_DENIED 先於欄位面把關）、未落地', async () => {
    // 註：create 路由的功能面 guard（ICSOP文件管理 write＝僅 ICSOPAdmin）先擋下 SysAdmin，
    // 故 HTTP 層回 PERMISSION_DENIED；F026 欄位面 FIELD_WRITE_FORBIDDEN 之單元防線於 service 另測。
    const sysCookie = ctx.cookieFor(sysLogin, 'AS', 'SysAdmin');
    const dupNum = `${num}-forbidden`;
    const r = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', sysCookie)
      .send({
        lifecycleId,
        status: 'active',
        documentNumber: dupNum,
        documentName: 'ZZINT F014 禁寫',
        secondaryChiefIds: ['20053'],
      });
    expect(r.status).toBe(403);
    // 未建立任何文件。
    const rows = await AppDataSource.query(
      `SELECT [id] FROM [ICSOP_DOCUMENT] WHERE [documentNumber]=@0`,
      [dupNum],
    );
    expect(rows).toHaveLength(0);
  });
});
