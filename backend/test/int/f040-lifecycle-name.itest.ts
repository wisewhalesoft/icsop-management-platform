import { bootIntApp, shutdownIntApp, IntCtx, MARK } from './harness';

/**
 * [int] F040 循環子分類 — 後端三處 `lifecycleName` 組裝路徑 vs 真 SOP DB。
 *
 * 閉合 risks-and-gaps **G-F040-12**：前端元件測試無法證明後端有以 `lifecycleDisplayName`
 * 組合 `lifecycleName`——因為 fixture 之 `lifecycleName` 由測試自行餵入，等於把答案交給受測者。
 * 唯一能真正釘住的形式即為本檔：**從真庫建立同名不同子分類之兩個循環，經 HTTP 端點取回，
 * 斷言回應中的 `lifecycleName` 相異且逐字等於 `名稱（子分類）`。**
 *
 * 覆蓋標的：
 *  - F019 AC-S1：前台公開**清單**（`GET /public/documents`）
 *  - F019 AC-S2：前台公開**詳情**（`GET /public/documents/:id`）
 *  - F017 AC-S2：後台文件**清單**（`GET /admin/documents`）
 *
 * 權威：docs/specs/features/F040-lifecycle-subcategory.md AC-04／AC-05／AC-30；
 *       F019 AC-S1／AC-S2；F017 AC-S1／AC-S2；ui-ux-design-overview §6.19(a)。
 *
 * ⚠ 不隨單元套件執行（檔名 `*.itest.ts`，`npm run test:int`，需 host 能連 SOP）。
 * marker：循環名 `ZZINT_LC_`、文件編號 `ZZINT-`、帳號 `zzint-`；
 *         harness `cleanupMarkers` 之 FK 順序（documents → lifecycle → account）已涵蓋本檔，
 *         **不需額外 cleanup**（INV-2 要求同名之列全為有子分類或恰一筆無子分類，
 *         故本檔用兩個相異名稱：`..SUB_` 兩子分類、`..PLAIN_` 一筆無子分類）。
 */
const TS = Date.now();
/** 同一名稱底下兩個子分類（皆非 null → 滿足 INV-2）。 */
const NAME_SUB = `${MARK.lc}SUB_${TS}`;
/** 另一名稱，恰一筆無子分類（滿足 INV-2）。 */
const NAME_PLAIN = `${MARK.lc}PLAIN_${TS}`;
const NUM = (n: string): string => `${MARK.doc}F040-${n}`;
const BIG_PAGE = 5000; // 真庫既有文件可能眾多 → 一次取回，確保 marker 文件必在結果內

interface ListItem {
  id: string;
  documentNumber: string;
  lifecycleId: string;
  lifecycleName: string | null;
}

describe('[int] F040 後端 lifecycleName 組裝（G-F040-12 閉合）vs SOP', () => {
  let ctx: IntCtx;
  const lc: Record<'consumer' | 'corporate' | 'plain', string> = {
    consumer: '',
    corporate: '',
    plain: '',
  };
  const docIds: Record<string, string> = {};

  async function createLifecycle(name: string, subcategory?: string): Promise<string> {
    const res = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send(subcategory === undefined ? { name } : { name, subcategory });
    expect([200, 201]).toContain(res.status);
    expect(res.body.id).toBeTruthy();
    return res.body.id as string;
  }

  async function createDoc(n: string, lifecycleId: string): Promise<string> {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const res = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({
        lifecycleId,
        status: 'active',
        documentNumber: NUM(n),
        documentName: `ZZINT F040 循環顯示名稱測試文件 ${n}`,
        announcedDate: yesterday, // 已公告 → 前台清單可見
      });
    expect([200, 201]).toContain(res.status);
    return res.body.id as string;
  }

  /** 取回本測試之 marker 文件（前台清單）。 */
  async function publicList(): Promise<ListItem[]> {
    const res = await ctx
      .http()
      .get(`/public/documents?pageSize=${BIG_PAGE}`)
      .set('Cookie', ctx.adminCookie);
    expect(res.status).toBe(200);
    return (res.body.items as ListItem[]).filter((i) =>
      i.documentNumber.startsWith(`${MARK.doc}F040-`),
    );
  }

  /** 取回本測試之 marker 文件（後台清單）。 */
  async function adminList(): Promise<ListItem[]> {
    const res = await ctx
      .http()
      .get(`/admin/documents?pageSize=${BIG_PAGE}`)
      .set('Cookie', ctx.adminCookie);
    expect(res.status).toBe(200);
    return (res.body.items as ListItem[]).filter((i) =>
      i.documentNumber.startsWith(`${MARK.doc}F040-`),
    );
  }

  async function publicDetail(id: string): Promise<ListItem> {
    const res = await ctx.http().get(`/public/documents/${id}`).set('Cookie', ctx.adminCookie);
    expect(res.status).toBe(200);
    return res.body as ListItem;
  }

  const nameOf = (items: ListItem[], n: string): string | null =>
    items.find((i) => i.documentNumber === NUM(n))!.lifecycleName;

  beforeAll(async () => {
    ctx = await bootIntApp();

    lc.consumer = await createLifecycle(NAME_SUB, '消金');
    lc.corporate = await createLifecycle(NAME_SUB, '企金');
    lc.plain = await createLifecycle(NAME_PLAIN);

    docIds['001'] = await createDoc('001', lc.consumer);
    docIds['002'] = await createDoc('002', lc.corporate);
    docIds['003'] = await createDoc('003', lc.plain);
  }, 120000);

  afterAll(() => shutdownIntApp(ctx));

  describe('前置：同名不同子分類之兩個循環確實建立成功（INV-1／INV-2）', () => {
    it('同名不同子分類為兩個獨立循環，id 相異', () => {
      expect(lc.consumer).toBeTruthy();
      expect(lc.corporate).toBeTruthy();
      expect(lc.consumer).not.toBe(lc.corporate);
    });
  });

  describe('F019 AC-S1 前台公開清單之 lifecycleName', () => {
    it('**核心**：同名兩子分類之 lifecycleName 必須相異（後端未組合會相同 → 紅）', async () => {
      const items = await publicList();
      const a = nameOf(items, '001');
      const b = nameOf(items, '002');
      expect(a).not.toBe(b);
    });

    it('逐字等於 `名稱（子分類）`（全形括號、前後無空白）', async () => {
      const items = await publicList();
      expect(nameOf(items, '001')).toBe(`${NAME_SUB}（消金）`);
      expect(nameOf(items, '002')).toBe(`${NAME_SUB}（企金）`);
    });

    it('AC-05／AC-33 無子分類之循環 → 恰為名稱，不含括號（向後相容）', async () => {
      const items = await publicList();
      const plain = nameOf(items, '003');
      expect(plain).toBe(NAME_PLAIN);
      expect(plain).not.toContain('（');
      expect(plain).not.toContain('）');
    });

    it('不得回傳裸 name（同名兩筆若皆為裸 name 即為漏網）', async () => {
      const items = await publicList();
      expect(nameOf(items, '001')).not.toBe(NAME_SUB);
      expect(nameOf(items, '002')).not.toBe(NAME_SUB);
    });
  });

  describe('F019 AC-S2 前台公開詳情之 lifecycleName', () => {
    it('**核心**：同名兩子分類之詳情 lifecycleName 必須相異', async () => {
      const a = await publicDetail(docIds['001']);
      const b = await publicDetail(docIds['002']);
      expect(a.lifecycleName).not.toBe(b.lifecycleName);
    });

    it('逐字等於 `名稱（子分類）`，且與清單完全一致（前後台同一字串）', async () => {
      const detail = await publicDetail(docIds['001']);
      expect(detail.lifecycleName).toBe(`${NAME_SUB}（消金）`);
      const items = await publicList();
      expect(detail.lifecycleName).toBe(nameOf(items, '001'));
    });

    it('AC-33 無子分類 → 恰為名稱、不含括號', async () => {
      const detail = await publicDetail(docIds['003']);
      expect(detail.lifecycleName).toBe(NAME_PLAIN);
      expect(detail.lifecycleName).not.toContain('（');
    });
  });

  describe('F017 AC-S2 後台文件清單之 lifecycleName', () => {
    it('**核心**：同名兩子分類之 lifecycleName 必須相異', async () => {
      const items = await adminList();
      expect(nameOf(items, '001')).not.toBe(nameOf(items, '002'));
    });

    it('逐字等於 `名稱（子分類）`', async () => {
      const items = await adminList();
      expect(nameOf(items, '001')).toBe(`${NAME_SUB}（消金）`);
      expect(nameOf(items, '002')).toBe(`${NAME_SUB}（企金）`);
    });

    it('AC-30 前台與後台之顯示字串完全一致（單一來源）', async () => {
      const pub = await publicList();
      const adm = await adminList();
      for (const n of ['001', '002', '003']) {
        expect(nameOf(adm, n)).toBe(nameOf(pub, n));
      }
    });
  });
});
