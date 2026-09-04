import { bootIntApp, shutdownIntApp, IntCtx } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { lifecycleDisplayName } from '../../src/lifecycle/lifecycle-subcategory';

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

/**
 * F043 §丙 delta（2026-09-04，同日第四個真實需求延伸）—— `candidateLifecycles` 分組／
 * `userSelectedLifecycleId` 篩選之 **SQL 層**驗證（真 SOP DB）。
 *
 * 🔴 **為何需要獨立 int-test（impl-cyclefilter 誠實提報之缺口）**：本 delta 之落地非簡單查詢，
 * 而是**五段 CTE（`base`／`filtered`／`stats`／`paged`／`groups`）＋一次 `UNION ALL`＋`rowKind`
 * 判別欄**之單一往返——`base`（keyword／exclude 已套用、使用者篩選未套用）產出 `candidateLifecycles`
 * 下拉選項，`filtered`（`base` 再套 `userSelectedLifecycleId`）產出 `candidateTotal`／
 * `candidateLifecycleCount` 統計，兩者刻意取自**不同 CTE**。單元測試（`business-category-docs-
 * candidates.service.spec.ts`）以 FakeStore 證明服務層之委派與型別正確，但 FakeStore 回傳的永遠是
 * 測試自己塞的資料，無法證明 `UNION ALL` 的欄位對齊、`TRY_CONVERT` 之轉型防禦、`OFFSET/FETCH` 與
 * `COUNT(DISTINCT ...)` 在 MSSQL 上的實際互動是否正確——這些只有真 SQL 執行才會暴露。
 *
 * ⚠ 對實作全盲：本檔斷言之期望值一律**動態查真庫**（`GROUP BY`／`COUNT`），不臆造或硬編循環
 * id／筆數；SQL 之 CTE 結構、`TRY_CONVERT` 防禦等實作細節僅供理解「為何需要 int-test」，本檔
 * 斷言與該 SQL 文字本身無關，換一種正確實作寫法仍應通過。
 *
 * 🔒 上方既有 `AC-20` 三條 int-test **逐字未動**——新增的是另一個維度（使用者主動篩選），
 * 兩者並存，見該 describe 區塊頭之既有分界說明。
 */
describe('[int] F043 §丙 delta：candidateLifecycles／userSelectedLifecycleId 之 SQL 層（真 SOP DB）', () => {
  let ctx: IntCtx;
  let businessCategoryId: string;
  let nodeId: string;
  const BC_MARK_PREFIX = 'ZZINT_BC_LCFILTER_';
  const categoryName = `${BC_MARK_PREFIX}${Date.now()}`;

  beforeAll(async () => {
    ctx = await bootIntApp();

    const bcRes = await ctx
      .http()
      .post('/admin/business-categories')
      .set('Cookie', ctx.adminCookie)
      .send({ name: categoryName, subcategory: null, description: 'ZZINT F043 循環篩選 delta' });
    expect([200, 201]).toContain(bcRes.status);
    businessCategoryId = bcRes.body.id;
    expect(businessCategoryId).toBeTruthy();

    const nodeRes = await ctx
      .http()
      .post(`/admin/business-categories/${businessCategoryId}/nodes`)
      .set('Cookie', ctx.adminCookie)
      .send({ name: 'ZZINT 循環篩選測試節點' });
    expect([200, 201]).toContain(nodeRes.status);
    nodeId = nodeRes.body.id;
    expect(nodeId).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    // BUSINESS_CATEGORY* 為本功能自有新表，非 harness.ts 之 cleanupMarkers() 涵蓋範圍（同上方
    // 既有 describe 之慣例）；本區塊之⑤會掛載真實文件，須額外回收 BUSINESS_CATEGORY_DOC。
    if (nodeId) {
      await AppDataSource.query(
        `DELETE FROM [BUSINESS_CATEGORY_DOC] WHERE [nodeId] = '${nodeId}'`,
      ).catch(() => undefined);
    }
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

  it('① candidateLifecycles 之分組正確性：逐格相符真庫 GROUP BY，Σ group.count = COUNT(*)，displayName 比對既有共用 lifecycleDisplayName（獨立 oracle，非本 delta 新造邏輯）', async () => {
    const groundTruth: Array<{ lifecycleId: string; c: number }> = await AppDataSource.query(`
      SELECT [lifecycleId], COUNT(*) AS c
        FROM [ICSOP_DOCUMENT]
       WHERE [lifecycleId] IS NOT NULL
       GROUP BY [lifecycleId]
    `);
    // 🔴 自證：語料鑑別力前提——真庫須至少有 2 個相異循環各有 ≥1 份文件，否則「分組是否正確」
    // 在單一循環下無從辨別（1 組必然等於全部）。
    expect(groundTruth.length).toBeGreaterThanOrEqual(2);

    const r = await ctx
      .http()
      .get(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/candidates`)
      .query({ page: 1, pageSize: 1 }) // 僅需 candidateLifecycles，不需搬回候選全頁。
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    const groups: Array<{ lifecycleId: string; displayName: string; count: number }> =
      r.body.candidateLifecycles;

    const gtMap = new Map(groundTruth.map((g) => [g.lifecycleId, Number(g.c)]));
    const respMap = new Map(groups.map((g) => [g.lifecycleId, g.count]));
    // 回應之相異循環組數應與真庫 GROUP BY 之組數相同。
    expect(respMap.size).toBe(gtMap.size);
    for (const [id, expectedCount] of gtMap) {
      // 每個循環之候選數應與真庫 GROUP BY 相符。
      expect(respMap.get(id)).toBe(expectedCount);
    }

    const sumOfCounts = groups.reduce((s, g) => s + g.count, 0);
    const [{ total: expectedTotal }] = await AppDataSource.query(
      `SELECT COUNT(*) AS total FROM [ICSOP_DOCUMENT] WHERE [lifecycleId] IS NOT NULL`,
    );
    // Σ group.count 應等於 ICSOP_DOCUMENT 之全部筆數（無遺漏、無重複計數）。
    expect(sumOfCounts).toBe(Number(expectedTotal));

    // displayName：以既有共用工具 lifecycleDisplayName 為獨立 oracle（F040 既有、非本 delta 新造），
    // 直接查 LIFECYCLE 表算出期望值，逐格比對回應。
    const lifecycleRows: Array<{ id: string; name: string; subcategory: string | null }> =
      await AppDataSource.query(`SELECT [id], [name], [subcategory] FROM [LIFECYCLE]`);
    const lifecycleById = new Map(lifecycleRows.map((l) => [l.id, l]));
    for (const g of groups) {
      const lc = lifecycleById.get(g.lifecycleId);
      expect(g.displayName).toBe(
        lifecycleDisplayName(lc ? { name: lc.name, subcategory: lc.subcategory } : null),
      );
    }
  });

  it('② 兩個基準刻意不同（本 delta 鑑別力核心）：套用 userSelectedLifecycleId 後 candidateTotal／candidateLifecycleCount 收斂為該循環之值，但 candidateLifecycles 仍列出全部相異循環（下拉選項不因目前篩選而萎縮）', async () => {
    const groundTruth: Array<{ lifecycleId: string; c: number }> = await AppDataSource.query(`
      SELECT [lifecycleId], COUNT(*) AS c
        FROM [ICSOP_DOCUMENT]
       WHERE [lifecycleId] IS NOT NULL
       GROUP BY [lifecycleId]
       ORDER BY c ASC
    `);
    expect(groundTruth.length).toBeGreaterThanOrEqual(2);
    const smallest = groundTruth[0];
    const [{ total: grandTotal }] = await AppDataSource.query(
      `SELECT COUNT(*) AS total FROM [ICSOP_DOCUMENT] WHERE [lifecycleId] IS NOT NULL`,
    );
    // 🔴 自證：挑選之循環候選數須明顯小於總數，否則「收斂後」與「未收斂」在輸出上難以分辨
    // （語料鑑別力要求，比照 team-lead 之明文提醒）。
    expect(Number(smallest.c)).toBeLessThan(Number(grandTotal));

    const r = await ctx
      .http()
      .get(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/candidates`)
      .query({ page: 1, pageSize: 1, userSelectedLifecycleId: smallest.lifecycleId })
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    // 基準①：套用篩選後之統計（畫面上「候選＝...共 N 份，分屬 M 個相異循環」）收斂為該循環之值。
    // candidateTotal 應收斂為所選循環之候選數。
    expect(r.body.candidateTotal).toBe(Number(smallest.c));
    // 選定單一循環後 candidateLifecycleCount 應為 1。
    expect(r.body.candidateLifecycleCount).toBe(1);
    // 基準②：candidateLifecycles（下拉選項）不受影響，仍是完整之全集分組——證明其計算基準
    // 是 `base`（未套使用者篩選）而非 `filtered`（已套），這正是兩段 CTE 刻意分開的理由。
    // candidateLifecycles 之組數不因目前已選單一循環而萎縮。
    const groups: Array<{ lifecycleId: string; count: number }> = r.body.candidateLifecycles;
    expect(groups).toHaveLength(groundTruth.length);
    expect(groups.map((g) => g.lifecycleId).sort()).toEqual(
      groundTruth.map((g) => g.lifecycleId).sort(),
    );
  });

  it('③ 空頁不謊報：page 超出末頁時 candidates=0 筆，但 candidateTotal／candidateLifecycleCount／candidateLifecycles 依然正確（統計獨立於分頁切片，非 COUNT(*) OVER()）', async () => {
    const [{ total: grandTotal }] = await AppDataSource.query(
      `SELECT COUNT(*) AS total FROM [ICSOP_DOCUMENT] WHERE [lifecycleId] IS NOT NULL`,
    );
    const [{ c: lifecycleCount }] = await AppDataSource.query(
      `SELECT COUNT(DISTINCT [lifecycleId]) AS c FROM [ICSOP_DOCUMENT] WHERE [lifecycleId] IS NOT NULL`,
    );

    const r = await ctx
      .http()
      .get(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/candidates`)
      .query({ page: 99999, pageSize: 20 })
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    // 超出末頁之當前頁應為空陣列。
    expect(r.body.candidates).toEqual([]);
    // 超出末頁時 candidateTotal／candidateLifecycleCount／candidateLifecycles 之分組數皆不得跟著歸零。
    expect(r.body.candidateTotal).toBe(Number(grandTotal));
    expect(r.body.candidateLifecycleCount).toBe(Number(lifecycleCount));
    expect((r.body.candidateLifecycles as unknown[]).length).toBe(Number(lifecycleCount));
  });

  it('④ 非 GUID 之 userSelectedLifecycleId 不炸 500（TRY_CONVERT 防禦；本 repo 既有前例：非 GUID 傳進 uniqueidentifier 比較曾是只有 int-test 才抓得到的真缺陷）：回 200 且候選 0 筆，candidateLifecycles 不受影響仍完整', async () => {
    const [{ c: lifecycleCount }] = await AppDataSource.query(
      `SELECT COUNT(DISTINCT [lifecycleId]) AS c FROM [ICSOP_DOCUMENT] WHERE [lifecycleId] IS NOT NULL`,
    );

    const r = await ctx
      .http()
      .get(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/candidates`)
      .query({ page: 1, pageSize: 20, userSelectedLifecycleId: 'not-a-real-guid' })
      .set('Cookie', ctx.adminCookie);
    // 非 GUID 篩選值不得使端點回 500。
    expect(r.status).toBe(200);
    expect(r.body.candidates).toEqual([]);
    expect(r.body.candidateTotal).toBe(0);
    expect(r.body.candidateLifecycleCount).toBe(0);
    // 下拉選項不受一個「篩不到東西」之無效篩選值影響，使用者仍可從中選回一個真實循環。
    expect((r.body.candidateLifecycles as unknown[]).length).toBe(Number(lifecycleCount));
  });

  it('⑤ 與 excludeDocumentIds（本節點已掛載排除）併用：掛載 2 筆真實文件後，candidateTotal 少 2、其所屬循環之 candidateLifecycles 分組 count 同步遞減，未受影響之循環維持不變', async () => {
    const docsToMount: Array<{ id: string; lifecycleId: string }> = await AppDataSource.query(`
      SELECT TOP 2 [id], [lifecycleId] FROM [ICSOP_DOCUMENT] WHERE [lifecycleId] IS NOT NULL ORDER BY [id]
    `);
    // 需要至少 2 份真實文件供掛載，語料前提。
    expect(docsToMount.length).toBe(2);

    const before = await ctx
      .http()
      .get(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/candidates`)
      .query({ page: 1, pageSize: 1 })
      .set('Cookie', ctx.adminCookie);
    expect(before.status).toBe(200);
    const beforeTotal: number = before.body.candidateTotal;
    const beforeGroups = new Map<string, number>(
      (before.body.candidateLifecycles as Array<{ lifecycleId: string; count: number }>).map((g) => [
        g.lifecycleId,
        g.count,
      ]),
    );

    for (const d of docsToMount) {
      const mountRes = await ctx
        .http()
        .post(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/documents`)
        .set('Cookie', ctx.adminCookie)
        .send({ documentId: d.id });
      // 掛載應成功（204）。
      expect(mountRes.status).toBe(204);
    }

    const after = await ctx
      .http()
      .get(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/candidates`)
      .query({ page: 1, pageSize: 1 })
      .set('Cookie', ctx.adminCookie);
    expect(after.status).toBe(200);
    // candidateTotal 應減少掛載之 2 筆。
    expect(after.body.candidateTotal).toBe(beforeTotal - 2);

    // 每份被掛載文件所屬循環之分組數各減 1（若兩份恰同循環，該循環減 2）；未受影響之循環維持不變
    // （成對佐證，非只驗證有變化的那幾格——比照本 repo「成對斷言」慣例）。
    const perLifecycleDecrement = new Map<string, number>();
    for (const d of docsToMount) {
      perLifecycleDecrement.set(d.lifecycleId, (perLifecycleDecrement.get(d.lifecycleId) ?? 0) + 1);
    }
    const afterGroups = new Map<string, number>(
      (after.body.candidateLifecycles as Array<{ lifecycleId: string; count: number }>).map((g) => [
        g.lifecycleId,
        g.count,
      ]),
    );
    for (const [lc, dec] of perLifecycleDecrement) {
      // 被掛載排除之循環，其 candidateLifecycles.count 應減少對應掛載筆數。
      expect(afterGroups.get(lc)).toBe((beforeGroups.get(lc) ?? 0) - dec);
    }
    for (const [lc, cnt] of beforeGroups) {
      if (!perLifecycleDecrement.has(lc)) {
        // 未被掛載排除之循環，其分組數不得變動（成對佐證）。
        expect(afterGroups.get(lc)).toBe(cnt);
      }
    }
  });
});

/**
 * F043 delta（2026-09-04，同日第四個真實需求）—— **決 A**（team-lead mailbox 裁決）之 SQL 層
 * 驗證：`candidateLifecycles` 恆含使用者已選之循環（`count` 可為 0），即使 `keyword` 把該循環之
 * 候選全數濾掉。
 *
 * 🔴 **為何必須是 int-test（唯一能兌現本保證之處）**：單元測試（`business-category-docs-
 * candidates.service.spec.ts`）以 FakeStore 證明「服務層之透傳不會把該保證濾掉」——但 FakeStore
 * 是本檔（test-generator）自行維護之測試替身，其內建之保證邏輯**不是產品程式碼**；真正應補上
 * 這個保證的地方是 `typeorm-business-category-docs.store.ts` 之 `groups` CTE（目前僅對 `base`
 * 分組，沒有「使用者已選之循環若不在分組內就補一筆 count=0」之步驟）。本檔驅動真實 HTTP 端點
 * （真 DB、真 SQL），是本保證唯一能兌現「未實作時必紅、實作後轉綠」之處。
 *
 * ⚠ 對實作全盲：期望值一律動態查真庫，不臆造或硬編循環 id；斷言與 SQL 之 CTE/UNION 實作細節
 * 無關，換一種正確寫法（如改用 LEFT JOIN 或子查詢）仍應通過。
 */
describe('[int] F043 delta：決 A — candidateLifecycles 恆含使用者已選之循環（真 SOP DB）', () => {
  let ctx: IntCtx;
  let businessCategoryId: string;
  let nodeId: string;
  const BC_MARK_PREFIX = 'ZZINT_BC_DECISIONA_';
  const categoryName = `${BC_MARK_PREFIX}${Date.now()}`;

  beforeAll(async () => {
    ctx = await bootIntApp();

    const bcRes = await ctx
      .http()
      .post('/admin/business-categories')
      .set('Cookie', ctx.adminCookie)
      .send({ name: categoryName, subcategory: null, description: 'ZZINT F043 決 A' });
    expect([200, 201]).toContain(bcRes.status);
    businessCategoryId = bcRes.body.id;
    expect(businessCategoryId).toBeTruthy();

    const nodeRes = await ctx
      .http()
      .post(`/admin/business-categories/${businessCategoryId}/nodes`)
      .set('Cookie', ctx.adminCookie)
      .send({ name: 'ZZINT 決 A 測試節點' });
    expect([200, 201]).toContain(nodeRes.status);
    nodeId = nodeRes.body.id;
    expect(nodeId).toBeTruthy();
  }, 60000);

  afterAll(async () => {
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

  it('🔴 已選循環 X ＋ 全庫皆無命中之 keyword → candidateLifecycles 仍含 X（count 為 0），candidates=0、candidateTotal=0', async () => {
    // 動態於真庫找一個確實存在候選文件之循環（任一 lifecycleId 皆可，只需「存在」）。
    const [picked]: Array<{ lifecycleId: string }> = await AppDataSource.query(`
      SELECT TOP 1 [lifecycleId] FROM [ICSOP_DOCUMENT] WHERE [lifecycleId] IS NOT NULL
    `);
    expect(picked).toBeTruthy();
    const [{ name: expectedName, subcategory: expectedSubcategory }] = await AppDataSource.query(
      `SELECT [name], [subcategory] FROM [LIFECYCLE] WHERE [id] = '${picked.lifecycleId}'`,
    );

    // 保證全庫無命中之關鍵字（帶隨機尾碼，避免真庫恰好存在同名文件）。
    const noMatchKeyword = `ZZINT_NOMATCH_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const r = await ctx
      .http()
      .get(`/admin/business-categories/${businessCategoryId}/nodes/${nodeId}/candidates`)
      .query({ page: 1, pageSize: 20, keyword: noMatchKeyword, userSelectedLifecycleId: picked.lifecycleId })
      .set('Cookie', ctx.adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.candidates).toEqual([]);
    expect(r.body.candidateTotal).toBe(0);

    const groups: Array<{ lifecycleId: string; displayName: string; count: number }> = r.body.candidateLifecycles;
    const picked_ = groups.find((g) => g.lifecycleId === picked.lifecycleId);
    // 🔴 決 A 核心：即使 keyword 把候選全數濾掉，已選循環仍須出現於下拉選項來源（count=0）。
    expect(picked_).toBeDefined();
    expect(picked_!.count).toBe(0);
    expect(picked_!.displayName).toBe(lifecycleDisplayName({ name: expectedName, subcategory: expectedSubcategory }));
  });
});
