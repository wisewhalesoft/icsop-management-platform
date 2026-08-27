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
    // 🔴 2026-08-27 裁定：制定公司即 companyCode（`draftingCompanyId` 已自 DB 與 API 移除）。
    expect(g.body.companyCode).toBe('AS');
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
      `SELECT [orgCode], [companyCode] FROM [DOC_USING_DEPT] WHERE [documentId]=@0 ORDER BY [orgCode]`,
      [id],
    );
    expect(depts.map((r: { orgCode: string }) => r.orgCode)).toEqual(['A2000', 'B0000']);

    // 🔴 B 階段（多公司）：`ICSOP_DOCUMENT.companyCode` 與 `DOC_USING_DEPT.companyCode`
    // 皆為 NOT NULL；酬載未帶「制定公司」時歸屬操作者所屬公司，且使用部門逐列恆等同其文件。
    // （此二欄之寫入路徑曾整段未接線：建立文件必 500，設了使用部門則連編輯也 500。）
    const [doc] = await AppDataSource.query(
      `SELECT [companyCode] FROM [ICSOP_DOCUMENT] WHERE [id]=@0`,
      [id],
    );
    expect(doc.companyCode).toBeTruthy();
    expect(depts.map((r: { companyCode: string }) => r.companyCode)).toEqual([
      doc.companyCode,
      doc.companyCode,
    ]);
  });

  it('酬載指定 companyCode → 文件與使用部門逐列落地該公司（非操作者所屬公司）', async () => {
    const c = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({
        lifecycleId,
        status: 'active',
        documentNumber: `${num}-co`,
        documentName: 'ZZINT F014 指定公司',
        companyCode: 'AD',
        usingDeptIds: ['A2000'],
      });
    expect([200, 201]).toContain(c.status);
    const id = c.body.id as string;

    const [doc] = await AppDataSource.query(
      `SELECT [companyCode] FROM [ICSOP_DOCUMENT] WHERE [id]=@0`,
      [id],
    );
    expect(doc.companyCode).toBe('AD');
    const depts = await AppDataSource.query(
      `SELECT [companyCode] FROM [DOC_USING_DEPT] WHERE [documentId]=@0`,
      [id],
    );
    expect(depts.map((r: { companyCode: string }) => r.companyCode)).toEqual(['AD']);
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
        });
    expect([200, 201]).toContain(c.status);
    const g = await ctx.http().get(`/admin/documents/${c.body.id}`).set('Cookie', ctx.adminCookie);
    expect(g.status).toBe(200);
    expect(g.body.secondaryChiefIds).toEqual([]);
    expect(g.body.usingDeptIds).toEqual([]);
    // 🔴 2026-08-27 裁定：制定公司即 companyCode（`draftingCompanyId` 已自 DB 與 API 移除）。
    expect(g.body.companyCode).toBe('AS');
  });

  /**
   * B 節：編輯側多值持久化（replace-set）之真表驗證。
   * 每案獨立建立 marker 文件，避免案例間互相污染多值集合。
   */
  describe('編輯側多值 replace-set（B）', () => {
    let seq = 0;
    const create = async (body: Record<string, unknown>): Promise<string> => {
      seq += 1;
      const r = await ctx
        .http()
        .post('/admin/documents')
        .set('Cookie', ctx.adminCookie)
        .send({
          lifecycleId,
          status: 'active',
          documentNumber: `${num}-edit-${seq}`,
          documentName: `ZZINT F014 編輯側 ${seq}`,
          ...body,
        });
      expect([200, 201]).toContain(r.status);
      return r.body.id as string;
    };
    const chiefsOf = (id: string) =>
      AppDataSource.query(
        `SELECT [employeeNo] FROM [DOC_SECONDARY_CHIEF] WHERE [documentId]=@0 ORDER BY [employeeNo]`,
        [id],
      );
    const deptsOf = (id: string) =>
      AppDataSource.query(
        `SELECT [orgCode] FROM [DOC_USING_DEPT] WHERE [documentId]=@0 ORDER BY [orgCode]`,
        [id],
      );

    it('TS-E-B-001 PATCH 次要室長 → 真表被「取代」而非疊加', async () => {
      const id = await create({ secondaryChiefIds: ['20053', '20541'] });
      const p = await ctx
        .http()
        .patch(`/admin/documents/${id}`)
        .set('Cookie', ctx.adminCookie)
        .send({ secondaryChiefIds: ['10001'] });
      expect([200, 204]).toContain(p.status);

      const g = await ctx.http().get(`/admin/documents/${id}`).set('Cookie', ctx.adminCookie);
      expect(g.body.secondaryChiefIds).toEqual(['10001']);
      const rows = await chiefsOf(id);
      expect(rows.map((r: { employeeNo: string }) => r.employeeNo)).toEqual(['10001']);
    });

    it('TS-E-B-002 PATCH 使用部門為空陣列 → 真表列全數刪除', async () => {
      const id = await create({ usingDeptIds: ['A2000', 'B0000'] });
      const p = await ctx
        .http()
        .patch(`/admin/documents/${id}`)
        .set('Cookie', ctx.adminCookie)
        .send({ usingDeptIds: [] });
      expect([200, 204]).toContain(p.status);

      const g = await ctx.http().get(`/admin/documents/${id}`).set('Cookie', ctx.adminCookie);
      expect(g.body.usingDeptIds).toEqual([]);
      expect(await deptsOf(id)).toHaveLength(0);
    });

    it('PATCH 使用部門（replace-set）→ 新列之 companyCode 沿用該文件之公司（NOT NULL）', async () => {
      const id = await create({ companyCode: 'AD', usingDeptIds: ['A2000'] });
      const p = await ctx
        .http()
        .patch(`/admin/documents/${id}`)
        .set('Cookie', ctx.adminCookie)
        .send({ usingDeptIds: ['B0000', 'C0000'] });
      expect([200, 204]).toContain(p.status);

      const rows = await AppDataSource.query(
        `SELECT [orgCode], [companyCode] FROM [DOC_USING_DEPT] WHERE [documentId]=@0 ORDER BY [orgCode]`,
        [id],
      );
      expect(rows.map((r: { orgCode: string }) => r.orgCode)).toEqual(['B0000', 'C0000']);
      expect(rows.map((r: { companyCode: string }) => r.companyCode)).toEqual(['AD', 'AD']);
    });

    it('TS-E-B-003 PATCH 未帶多值鍵 → 真表列不受影響', async () => {
      const id = await create({ secondaryChiefIds: ['20053'], usingDeptIds: ['A2000'] });
      const p = await ctx
        .http()
        .patch(`/admin/documents/${id}`)
        .set('Cookie', ctx.adminCookie)
        .send({ documentName: 'ZZINT F014 改名' });
      expect([200, 204]).toContain(p.status);

      const g = await ctx.http().get(`/admin/documents/${id}`).set('Cookie', ctx.adminCookie);
      expect(g.body.documentName).toBe('ZZINT F014 改名');
      expect(g.body.secondaryChiefIds).toEqual(['20053']);
      expect(g.body.usingDeptIds).toEqual(['A2000']);
      expect(await chiefsOf(id)).toHaveLength(1);
      expect(await deptsOf(id)).toHaveLength(1);
    });

    it('TS-E-B-004 非 ICSOPAdmin（SysAdmin）PATCH 多值 → 403、真表不受影響', async () => {
      const id = await create({ secondaryChiefIds: ['20053'] });
      const sysCookie = ctx.cookieFor(sysLogin, 'AS', 'SysAdmin');
      const p = await ctx
        .http()
        .patch(`/admin/documents/${id}`)
        .set('Cookie', sysCookie)
        .send({ secondaryChiefIds: ['99999'] });
      expect(p.status).toBe(403);
      const rows = await chiefsOf(id);
      expect(rows.map((r: { employeeNo: string }) => r.employeeNo)).toEqual(['20053']);
    });
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
