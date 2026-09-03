import { bootIntApp, shutdownIntApp, IntCtx } from './harness';
import { AppDataSource } from '../../src/database/data-source';

/**
 * F043 業務/功能類別管理 — AC-20 之 **SQL 層**驗證（真 SOP DB）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-20
 *      （🔴 候選＝全部 ICSOP 文件，不施加任何循環條件；語料鑑別力要求＝至少 2 個相異循環各有
 *      ≥1 份文件，否則「有沒有過濾」在輸出上完全看不出來）。
 *
 * 🔴 **為何 int-test 而非僅靠 `business-category-docs.service.spec.ts` 之 FakeStore 單元測試**：
 * 單元測試以 FakeStore 證明「服務層未偷渡 lifecycleId 過濾鍵」（型別層 + 委派層），但無法證明
 * `TypeOrmBusinessCategoryDocsStore` 產出之**實際 SQL** 沒有 `WHERE lifecycleId = ...`——FakeStore
 * 回傳的永遠是測試自己塞的資料，SQL 本身完全沒有被執行到。本檔驅動真實 HTTP 端點（真 DB、真
 * TypeORM query builder），是本 AC 唯一能兌現「SQL 層未過濾」之處。
 *
 * 🔴 語料設計（本檔核心）：**不預先假設**真庫哪些文件屬於哪個循環（會隨真實資料飄移），改為
 * 於 `beforeAll` **動態查詢**真庫，尋找兩份分屬相異 `lifecycleId` 之真實文件；找不到則本測試之
 * 語料鑑別力前提不成立，測試本身應清楚失敗（而非靜默略過），避免「環境沒資料」偽裝成「AC 通過」。
 *
 * ⚠ 只**讀取**既有 `ICSOP_DOCUMENT`／`LIFECYCLE`（共用真庫參照資料，不寫入、不修改）；僅
 * `BUSINESS_CATEGORY`／`BUSINESS_CATEGORY_NODE` 兩張本功能自有之新表由本檔寫入與清理
 * （比照 harness.ts 對「非 marker 涵蓋之表由建立者自行以 id 回收」之既有慣例）。
 *
 * ⚠ 對實作全盲：本檔之期望值（候選必須涵蓋兩個相異循環之文件）取自 AC-20 spec 文字，非取自
 * 讀取 `typeorm-business-category-docs.store.ts` 之實作內容——後者僅由 impl-be 於申訴中揭露其
 * SQL 形狀以說明「為何需要 int-test」，本檔之斷言與該 SQL 文字無關，換一種正確實作寫法本檔仍應通過。
 *
 * 🔴 2026-09-02 首版撰寫時無法於本 sandbox 對真 SOP DB 實跑驗證（連線逾時），已如實揭露該限制。
 * 🟢 2026-09-03 lead 已恢復連線並實跑，回應形狀猜錯（原猜 `{items,total}`，實際為 lead 查證
 * `business-category-docs.controller.ts:80-83`＋前端消費端 `frontend/src/api/endpoints.ts`
 * 兩處一致確認之 `{node, mounted, candidates, candidateTotal}`——同一端點回應合併「已掛載」
 * 與「候選」以避免兩支端點之間可被寫入穿插的時間窗口，AC-29 抽屜清單亦共用同一回應）；三條
 * 斷言已就地改為 `r.body.candidates`／`r.body.candidateTotal`，鑑別力（結構性比對真庫 COUNT、
 * 兩份相異循環文件各自可搜到）未削弱，僅欄位存取路徑修正。
 */
describe('[int] F043 AC-20 候選文件不以 lifecycleId 過濾 (SQL 層 vs SOP DB)', () => {
  let ctx: IntCtx;
  let businessCategoryId: string;
  let nodeId: string;
  let docA: { documentNumber: string; lifecycleId: string };
  let docB: { documentNumber: string; lifecycleId: string };
  const BC_MARK_PREFIX = 'ZZINT_BC_';
  const categoryName = `${BC_MARK_PREFIX}${Date.now()}`;

  beforeAll(async () => {
    ctx = await bootIntApp();

    // 🔴 語料鑑別力：動態於真庫尋找兩份分屬相異 lifecycleId 之文件（各所屬循環皆至少 1 份文件，
    // 定義上必然成立——查詢本身即以「該循環下第 1 份文件」為準）。
    const pairs: Array<{ documentNumber: string; lifecycleId: string }> = await AppDataSource.query(`
      SELECT TOP 2 d.[documentNumber], d.[lifecycleId]
      FROM [ICSOP_DOCUMENT] d
      INNER JOIN (
        SELECT MIN([id]) AS [firstId], [lifecycleId]
        FROM [ICSOP_DOCUMENT]
        WHERE [lifecycleId] IS NOT NULL
        GROUP BY [lifecycleId]
      ) firstPerLifecycle ON firstPerLifecycle.[firstId] = d.[id]
      ORDER BY d.[lifecycleId]
    `);
    // 🔴 自證：若真庫不滿足「至少 2 個相異循環各有 ≥1 份文件」之語料前提，本測試之鑑別力
    // 不成立——寧可在此明確失敗，也不要在資料不足時繼續跑出一個看似通過、實則無鑑別力的斷言。
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    expect(pairs[0].lifecycleId).not.toBe(pairs[1].lifecycleId);
    [docA, docB] = pairs;

    const bcRes = await ctx
      .http()
      .post('/admin/business-categories')
      .set('Cookie', ctx.adminCookie)
      .send({ name: categoryName, subcategory: null, description: 'ZZINT F043 AC-20' });
    expect([200, 201]).toContain(bcRes.status);
    businessCategoryId = bcRes.body.id;
    expect(businessCategoryId).toBeTruthy();

    const nodeRes = await ctx
      .http()
      .post(`/admin/business-categories/${businessCategoryId}/nodes`)
      .set('Cookie', ctx.adminCookie)
      .send({ name: 'ZZINT 候選測試節點' });
    expect([200, 201]).toContain(nodeRes.status);
    nodeId = nodeRes.body.id;
    expect(nodeId).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    // BUSINESS_CATEGORY* 為本功能自有新表，非 harness.ts 之 cleanupMarkers() 涵蓋範圍
    // （比照該檔既有慣例：附錄池本體亦由建立它的測試自行以 id 回收，不擴大共用清理函式之職責）。
    if (businessCategoryId) {
      await AppDataSource.query(
        `DELETE FROM [BUSINESS_CATEGORY_NODE] WHERE [businessCategoryId] = '${businessCategoryId}'`,
      ).catch(() => undefined);
      await AppDataSource.query(
        `DELETE FROM [BUSINESS_CATEGORY] WHERE [id] = '${businessCategoryId}'`,
      ).catch(() => undefined);
    }
    await shutdownIntApp(ctx);
  }, 60000);

  it('AC-20 🔴 候選查詢以 docA 之精確編號搜尋 → 命中（其 lifecycleId 與 docB 不同）', async () => {
    const r = await ctx
      .http()
      .get(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/candidates`)
      .query({ keyword: docA.documentNumber, page: 1, pageSize: 20 })
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    const numbers: string[] = r.body.candidates.map((d: { documentNumber: string }) => d.documentNumber);
    expect(numbers).toContain(docA.documentNumber);
  });

  it('AC-20 🔴 候選查詢以 docB 之精確編號搜尋 → 同樣命中（不同循環之文件未被排除，證明候選未以 lifecycleId 過濾）', async () => {
    const r = await ctx
      .http()
      .get(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/candidates`)
      .query({ keyword: docB.documentNumber, page: 1, pageSize: 20 })
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    const numbers: string[] = r.body.candidates.map((d: { documentNumber: string }) => d.documentNumber);
    expect(numbers).toContain(docB.documentNumber);
  });

  it('AC-20 §可測形狀②：候選總數（無關鍵字）等於真庫 ICSOP_DOCUMENT 之全部筆數（結構性比對，非硬編數字——證明未施加任何過濾條件，含 lifecycleId）', async () => {
    const [{ c: expectedTotal }] = await AppDataSource.query(
      `SELECT COUNT(*) AS c FROM [ICSOP_DOCUMENT]`,
    );
    const r = await ctx
      .http()
      .get(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/candidates`)
      .query({ page: 1, pageSize: 1 }) // 僅取第 1 頁 1 筆，只需 candidateTotal 欄位、不需搬回全表。
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.candidateTotal).toBe(Number(expectedTotal));
  });
});
