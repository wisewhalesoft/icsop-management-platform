import { bootIntApp, shutdownIntApp, IntCtx, MARK, ADMIN_PASSWORD } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { DocUsingDept } from '../../src/database/entities/doc-using-dept.entity';
import { hashPassword } from '../../src/accounts/password';

/**
 * [int] F019 前台清單之真實 `DOC_USING_DEPT` 讀取路徑 vs 真 SOP DB。
 *
 * 驗證 unit 層 Fake/Mock 無法涵蓋之部分：
 *  - 分離查詢（ICSOP_DOCUMENT 全量 + DOC_USING_DEPT `In(...)`）於真庫不因 1:N 使文件筆數重複；
 *  - 0 筆使用部門列之文件仍出現於清單（LEFT JOIN 語意，非 INNER JOIN 誤刪）；
 *  - 置頂/部門篩選端到端經真實 session（ACCOUNT.orgCode 每請求由 SessionGuard 自 DB 填入）；
 *  - 排序（置頂區整體在前、區內編號降冪）於真實 collation 下與純函式層一致。
 *
 * ⚠ 不隨單元套件執行；由 orchestrator 於合併後序列跑（`npm run test:int`，需 host 能連 SOP）。
 * marker：文件編號 `ZZINT-`、循環名 `ZZINT_LC_`、帳號 `zzint-`（harness cleanupMarkers 已涵蓋
 * DOC_USING_DEPT → ICSOP_DOCUMENT → LIFECYCLE → ACCOUNT 之 FK 順序清除，本檔不需額外 cleanup）。
 * 組織代碼採合成前綴 `Z9`（DOC_USING_DEPT/ACCOUNT.orgCode 無 FK 至 ORG_UNIT，不需真實組織列）。
 */
const CHILD_LOGIN = `${MARK.acct}pubchild`; // orgCode=Z9AB0（處室層）
const NODEPT_LOGIN = `${MARK.acct}pubnodept`; // orgCode=null（無部門使用者）
const NUM = (n: string): string => `${MARK.doc}PUB-${n}`;
const BIG_PAGE = 5000; // 真庫既有文件可能眾多 → 一次取回，確保 marker 文件必在結果內

/**
 * 🔴 2026-08-16 delta（F019 `AC-D9`／`AC-D12`）：`usingDeptIds`／`usingDeptNames` 已自對外
 * DTO 移除（unit 層以 `public-list-dto.spec.ts` TS-F019-D12-001 之 `hasOwnProperty === false` 鎖定）。
 * 內部型別仍保留該欄供置頂與 F041 可見性判定——本檔改為只驗**其外顯效果**（`pinned`／是否出現於
 * 清單／1:N 不膨脹），不再讀取已不存在的欄位。
 */
interface ListItem {
  id: string;
  documentNumber: string;
  pinned: boolean;
}

describe('[int] F019 前台清單 × DOC_USING_DEPT 真實 join vs SOP', () => {
  let ctx: IntCtx;
  let childCookie: string;
  let nodeptCookie: string;
  const docIds: Record<string, string> = {};

  /** 取回本測試之 marker 文件（依回傳順序保留，供排序斷言）。 */
  async function listMarkers(cookie: string, query = ''): Promise<ListItem[]> {
    const res = await ctx
      .http()
      .get(`/public/documents?pageSize=${BIG_PAGE}${query}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    return (res.body.items as ListItem[]).filter((i) =>
      i.documentNumber.startsWith(`${MARK.doc}PUB-`),
    );
  }

  async function createDoc(
    n: string,
    usingDeptIds: string[],
    lifecycleId: string,
  ): Promise<string> {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const res = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({
        lifecycleId,
        status: 'active',
        documentNumber: NUM(n),
        documentName: `ZZINT 前台清單測試文件 ${n}`,
        announcedDate: yesterday, // 已公告（公告日期 ≤ 今日）
        usingDeptIds,
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body.id).toBeTruthy();
    return res.body.id as string;
  }

  beforeAll(async () => {
    ctx = await bootIntApp();

    // 兩個 marker 一般使用者帳號（roleCode 以 DB 現行值為準；orgCode 每請求由 SessionGuard 填入）。
    const acctRepo = AppDataSource.getRepository(Account);
    for (const [loginId, orgCode] of [
      [CHILD_LOGIN, 'Z9AB0'],
      [NODEPT_LOGIN, null],
    ] as [string, string | null][]) {
      await acctRepo.save(
        acctRepo.create({
          companyCode: 'AS',
          loginId,
          roleCode: 'User',
          status: 'active',
          source: 'manual',
          name: `ZZINT 前台使用者 ${loginId}`,
          email: `${loginId}@zzint.local`,
          orgCode,
          passwordHash: hashPassword(ADMIN_PASSWORD),
        }),
      );
    }
    childCookie = ctx.cookieFor(CHILD_LOGIN, 'AS', 'User');
    nodeptCookie = ctx.cookieFor(NODEPT_LOGIN, 'AS', 'User');

    const lc = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: `${MARK.lc}PUB_${Date.now()}` });
    expect([200, 201]).toContain(lc.status);
    const lifecycleId = lc.body.id as string;

    // Z9A00（部層，pubchild 之上層）／Z9AB0（自身）／Z9AC0（同層兄弟）／無列／Z9X00（無關分支）
    docIds['001'] = await createDoc('001', ['Z9A00'], lifecycleId);
    docIds['002'] = await createDoc('002', ['Z9AB0'], lifecycleId);
    docIds['003'] = await createDoc('003', ['Z9AC0'], lifecycleId);
    docIds['004'] = await createDoc('004', [], lifecycleId);
    docIds['005'] = await createDoc('005', ['Z9X00'], lifecycleId);
  }, 120000);

  afterAll(() => shutdownIntApp(ctx));

  it('TS-PS-INT-001 置頂：文件使用部門為使用者部門之上層（Z9A00 ⊃ Z9AB0）→ pinned', async () => {
    const items = await listMarkers(childCookie);
    const d1 = items.find((i) => i.documentNumber === NUM('001'))!;
    expect(d1).toBeDefined();
    expect(d1.pinned).toBe(true); // 使用部門 Z9A00 為使用者 Z9AB0 之上層 ⇒ 置頂（AC-D11 之外顯效果）
  });

  it('TS-PS-INT-002 置頂：文件使用部門與使用者自身代碼完全相同 → pinned', async () => {
    const items = await listMarkers(childCookie);
    expect(items.find((i) => i.documentNumber === NUM('002'))!.pinned).toBe(true);
  });

  it('TS-PS-INT-003 同層兄弟單位（Z9AC0）→ 不置頂，但仍出現於清單', async () => {
    const items = await listMarkers(childCookie);
    const d3 = items.find((i) => i.documentNumber === NUM('003'))!;
    expect(d3).toBeDefined(); // 未消失
    expect(d3.pinned).toBe(false);
  });

  it('TS-PS-INT-004 無使用部門列之文件 → 不置頂、不從清單消失（LEFT JOIN 語意）', async () => {
    const items = await listMarkers(childCookie);
    const d4 = items.find((i) => i.documentNumber === NUM('004'))!;
    expect(d4).toBeDefined(); // 0 筆 DOC_USING_DEPT 仍出現（非 INNER JOIN 誤刪）
    expect(d4.pinned).toBe(false);
  });

  it('TS-PS-INT-005 使用者無部門（ACCOUNT.orgCode=null）→ 全部不置頂，清單內容不被過濾', async () => {
    const res = await ctx
      .http()
      .get(`/public/documents?pageSize=${BIG_PAGE}`)
      .set('Cookie', nodeptCookie);
    expect(res.status).toBe(200);
    const all = res.body.items as ListItem[];
    const markers = all.filter((i) => i.documentNumber.startsWith(`${MARK.doc}PUB-`));
    expect(markers).toHaveLength(5); // 筆數與有部門者相同，僅 pinned 旗標不同
    expect(markers.every((i) => i.pinned === false)).toBe(true);

    const childRes = await ctx
      .http()
      .get(`/public/documents?pageSize=${BIG_PAGE}`)
      .set('Cookie', childCookie);
    expect(res.body.total).toBe(childRes.body.total);
  });

  /**
   * 🔴 原 TS-PS-INT-006／007 驗的是「使用部門篩選」之子樹涵蓋語意。該篩選已於 2026-08-16
   * delta（F019 `AC-D1`／架構 A9 §10.9）**整個移除**——且刻意連 controller 的 query 解析一起移除，
   * 理由逐字為「只自 UI 移除而 controller 仍解析，客戶端仍可送 `?deptCode=` 而後端仍據以過濾」。
   * 這兩案因此無標的可驗；合併改寫為該裁定之**回歸鎖**：殘留參數必須完全無效。
   */
  it('AC-D1 使用部門篩選已移除：殘留之 ?deptCode= 對結果毫無影響（不得仍在後端過濾）', async () => {
    const base = await listMarkers(childCookie);
    for (const code of ['Z9A00', 'Z9AC0', 'Z9X00']) {
      const filtered = await listMarkers(childCookie, `&deptCode=${code}`);
      expect(filtered.map((i) => i.documentNumber)).toEqual(
        base.map((i) => i.documentNumber),
      );
    }
  });

  it('TS-PS-INT-009 排序：置頂區整體在前、其餘在後，區內皆依文件編號降冪', async () => {
    const items = await listMarkers(childCookie);
    // 置頂＝001(Z9A00 祖先)/002(自身)；其餘＝003/004/005。編號刻意使其餘者較大，驗證置頂優先於編號。
    expect(items.map((i) => i.documentNumber)).toEqual([
      NUM('002'),
      NUM('001'),
      NUM('005'),
      NUM('004'),
      NUM('003'),
    ]);
  });

  it('TS-PS-INT-008 一份文件多筆 DOC_USING_DEPT → 清單不重複回傳同一文件（1:N 不膨脹）', async () => {
    // 為 PUB-001 補第二筆使用部門，使其同時掛 Z9A00 + Z9AB0。
    const repo = AppDataSource.getRepository(DocUsingDept);
    // 🔴 B 階段（多公司）：`DOC_USING_DEPT.companyCode` 為 NOT NULL 且恆等同其文件。
    await repo.save(
      repo.create({ documentId: docIds['001'], companyCode: 'AS', orgCode: 'Z9AB0' }),
    );

    const items = await listMarkers(childCookie);
    const d1 = items.filter((i) => i.documentNumber === NUM('001'));
    expect(d1).toHaveLength(1); // id 僅出現一次（1:N 未使文件筆數膨脹）
    expect(d1[0].pinned).toBe(true);
    expect(items).toHaveLength(5); // 總筆數不因多值而膨脹
  });
});
