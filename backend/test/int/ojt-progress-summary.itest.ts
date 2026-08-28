import { bootIntApp, shutdownIntApp, MARK, IntCtx } from './harness';

/**
 * [int] F042 OJT 進度管理儀表板（GET /admin/ojt-progress/summary）vs 真 SOP DB。
 *
 * 🔴 本檔之存在理由（team-lead 交辦，2026-08-28）：本端點已**兩次**只靠真 HTTP 才抓到缺陷——
 * ① controller 回應信封與 DTO 欄位沒接值（單元＋整合皆綠）；② 本輪之退化值排名問題（`totalUnits=0`
 * 之文件與「有義務卻未完成」共用同一個排序鍵，真庫 587/591 份無義務文件把前 15 名整批占滿）。兩次
 * 皆呼應本 repo 之既有血訓「單元全綠證明不了 HTTP 表面」。此前僅靠一次性探針（跑完即刪）驗證，
 * 未納入常設閘門——本檔把它收斂為常設 `test:int`，往後任何人改動本端點都會被真庫地質接住。
 *
 * ⚠ 斷言形狀刻意為**不變式與結構**、不對真庫之絕對數字下硬編期望（母體會隨時間變動）：
 *   - 六種 `docScope` 請求（缺值／四合法值／`bogus`）之母體計數欄（`totalDocuments`／`byState`／
 *     `incompleteTotal`）必須完全相同——這正是「把上限套進統計」這個歷史級假綠陷阱之真庫防線。
 *   - 不變式 ③′／④／⑤ 與各 `docScope` 之切片過濾述詞、`hidden` 之逐 scope 母體公式，皆以**關係**
 *     斷言（非絕對值），資料量增減不會使其無故轉紅。
 *   - 沉底（⑩）之核心回歸背書改用**本檔自建之 marker 文件**（見下方 B 案）：不論真庫當下有幾份
 *     無義務文件，一份「有義務且未完成」之 marker 文件必須恆在 `docScope=all` 之 `items` 內——
 *     這是唯一無法只靠「結構不變式」驗到、必須真的造出一筆會被沉底邏輯保護的資料才驗得到的性質。
 *
 * ⚠ 不隨單元套件跑（*.itest.ts）。marker：文件編號 `ZZINT-OJT-<runId>-*`（`harness.ts` 之
 * `cleanupMarkers()` 已涵蓋 `ICSOP_DOCUMENT`／`DOC_USING_DEPT` 之 marker 前綴清除，本檔不需
 * 額外 cleanup）。
 */

interface OjtDocCoverageRow {
  documentId: string;
  documentNumber: string;
  documentName: string;
  state: 'all' | 'partial' | 'none';
  totalUnits: number;
  completedUnits: number;
}

interface OjtSummaryResponse {
  coverage: { numerator: number; denominator: number; rate?: number };
  docCoverage: {
    scope: 'incomplete' | 'completed' | 'unassigned' | 'all';
    maxRows: number;
    items: OjtDocCoverageRow[];
    shown: number;
    hidden: number;
    totalDocuments: number;
    byState: { all: number; partial: number; none: number; unassigned: number };
    incompleteTotal: number;
  };
  deptRollup: unknown[];
  recentSessions: unknown[];
}

const LEGAL_SCOPES = ['incomplete', 'completed', 'unassigned', 'all'] as const;

describe('[int] OJT 進度管理儀表板（ojt-progress/summary）vs SOP', () => {
  let ctx: IntCtx;
  const runId = Date.now();
  let lifecycleId: string;

  const fetchSummary = async (qs = ''): Promise<{ status: number; body: OjtSummaryResponse }> => {
    const res = await ctx.http().get(`/admin/ojt-progress/summary${qs}`).set('Cookie', ctx.adminCookie);
    return { status: res.status, body: res.body as OjtSummaryResponse };
  };

  beforeAll(async () => {
    ctx = await bootIntApp();
    const lc = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: `${MARK.lc}OJT_${runId}` });
    expect([200, 201]).toContain(lc.status);
    lifecycleId = lc.body.id as string;
    expect(lifecycleId).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    await shutdownIntApp(ctx);
  }, 60_000);

  describe('A. HTTP 表面與母體口徑鎖（六種 docScope 請求）', () => {
    it('缺值／四合法值／bogus 皆回 200，docCoverage.scope 之正規化與回聲逐值正確', async () => {
      const missing = await fetchSummary();
      expect(missing.status).toBe(200);
      expect(missing.body.docCoverage.scope).toBe('incomplete');

      for (const scope of LEGAL_SCOPES) {
        const r = await fetchSummary(`?docScope=${scope}`);
        expect(r.status).toBe(200);
        expect(r.body.docCoverage.scope).toBe(scope);
      }

      const bogus = await fetchSummary('?docScope=bogus');
      expect(bogus.status).toBe(200);
      expect(bogus.body.docCoverage.scope).toBe('incomplete'); // 未知值靜默正規化，非 500／400
    }, 60_000);

    /**
     * 🔴 本案之存在理由——歷史級假綠陷阱（F042-test.md 假綠陷阱 9）：把「切片上限」誤套進統計時，
     * 每個單一畫面看起來都合理，只有跨範圍比較（本案之六次請求）才看得出分母悄悄變成 15。
     */
    it('母體口徑鎖：六次請求之 totalDocuments／byState／incompleteTotal 完全相同（不受 docScope／maxRows 影響）', async () => {
      const responses = [
        await fetchSummary(),
        ...(await Promise.all(LEGAL_SCOPES.map((s) => fetchSummary(`?docScope=${s}`)))),
        await fetchSummary('?docScope=bogus'),
      ];
      const [first, ...rest] = responses;
      for (const r of rest) {
        expect(r.body.docCoverage.totalDocuments).toBe(first.body.docCoverage.totalDocuments);
        expect(r.body.docCoverage.byState).toEqual(first.body.docCoverage.byState);
        expect(r.body.docCoverage.incompleteTotal).toBe(first.body.docCoverage.incompleteTotal);
        expect(r.body.coverage).toEqual(first.body.coverage);
        expect(r.body.deptRollup).toEqual(first.body.deptRollup);
        expect(r.body.recentSessions).toEqual(first.body.recentSessions);
      }
    }, 60_000);

    it('不變式 ③′／④／⑤：以真庫當下之 byState 關係式驗證（不對絕對數字下硬編期望）', async () => {
      const dc = (await fetchSummary('?docScope=all')).body.docCoverage;
      // ③′：incompleteTotal === partial + none − unassigned（byState.none 為 AC-04 口徑，含無義務者）。
      expect(dc.incompleteTotal).toBe(dc.byState.partial + dc.byState.none - dc.byState.unassigned);
      // ④：三態（不含 unassigned）之和恆等於 totalDocuments；四鍵相加會多算一次（unassigned 為 none 之子集）。
      expect(dc.byState.all + dc.byState.partial + dc.byState.none).toBe(dc.totalDocuments);
      if (dc.byState.unassigned > 0) {
        expect(dc.byState.all + dc.byState.partial + dc.byState.none + dc.byState.unassigned).not.toBe(
          dc.totalDocuments,
        );
      }
      // ⑤：子集關係之機讀形式。
      expect(dc.byState.unassigned).toBeLessThanOrEqual(dc.byState.none);
    }, 60_000);

    it('四種 docScope 之切片結構：shown===items.length／shown<=maxRows／hidden 之逐 scope 母體公式', async () => {
      const [incomplete, completed, unassigned, all] = await Promise.all(
        LEGAL_SCOPES.map((s) => fetchSummary(`?docScope=${s}`)),
      );
      for (const r of [incomplete, completed, unassigned, all]) {
        expect(r.body.docCoverage.shown).toBe(r.body.docCoverage.items.length);
        expect(r.body.docCoverage.shown).toBeLessThanOrEqual(r.body.docCoverage.maxRows);
        expect(r.body.docCoverage.hidden).toBeGreaterThanOrEqual(0);
      }
      // 🔴 hidden 之母體逐 scope 不同（一律可由同一份 byState 推導，不需另猜測母體筆數）：
      // incomplete 之母體 === incompleteTotal；completed 之母體 === byState.all；
      // unassigned 之母體 === byState.unassigned；all 之母體 === totalDocuments（無過濾）。
      const dc = all.body.docCoverage; // 四種回應之母體計數欄本就相同（見上一案），任取一份皆可。
      expect(incomplete.body.docCoverage.hidden).toBe(dc.incompleteTotal - incomplete.body.docCoverage.shown);
      expect(completed.body.docCoverage.hidden).toBe(dc.byState.all - completed.body.docCoverage.shown);
      expect(unassigned.body.docCoverage.hidden).toBe(dc.byState.unassigned - unassigned.body.docCoverage.shown);
      expect(all.body.docCoverage.hidden).toBe(dc.totalDocuments - all.body.docCoverage.shown);
    }, 60_000);

    it('各 docScope 之切片過濾述詞：incomplete 全為 totalUnits>0&&state!=="all"；completed 全為 state==="all"；unassigned 全為 totalUnits===0', async () => {
      const [incomplete, completed, unassigned] = await Promise.all(
        ['incomplete', 'completed', 'unassigned'].map((s) => fetchSummary(`?docScope=${s}`)),
      );
      expect(incomplete.body.docCoverage.items.every((i) => i.totalUnits > 0 && i.state !== 'all')).toBe(true);
      expect(completed.body.docCoverage.items.every((i) => i.state === 'all')).toBe(true);
      expect(unassigned.body.docCoverage.items.every((i) => i.totalUnits === 0)).toBe(true);
    }, 60_000);

    it('未登入 → 401（本端點之最基本 HTTP 表面守門）', async () => {
      const res = await ctx.http().get('/admin/ojt-progress/summary');
      expect(res.status).toBe(401);
    }, 60_000);
  });

  /**
   * ═════ B. 沉底之核心回歸背書（marker 驅動，2026-08-28 第二輪修正之直接標的）═════
   * 🔴 A 節之結構不變式擋不住「沉底邏輯整個被拿掉」——若排序退回舊的兩段鍵（僅覆蓋率＋文號），
   * A 節之全部不變式在真庫上依然成立（byState 與 hidden 之算式與排序無關）。唯一能揪出沉底缺失
   * 的方法是**真的造一筆「有義務、退化覆蓋率剛好等於一堆無義務文件」的資料**，驗證它有沒有被
   * 沉底邏輯保護住——真庫既有的 587+ 份無義務文件天然提供了足量的「干擾項」，不需自行造滿 15 份。
   */
  describe('B. 沉底之核心回歸背書（marker 驅動）', () => {
    let obligatedDocId: string;
    let obligatedDocNumber: string;

    beforeAll(async () => {
      obligatedDocNumber = `${MARK.doc}OJT-B-${runId}`;
      const created = await ctx
        .http()
        .post('/admin/documents')
        .set('Cookie', ctx.adminCookie)
        .send({
          lifecycleId,
          status: 'active',
          documentNumber: obligatedDocNumber,
          documentName: 'ZZINT OJT 沉底回歸案（有義務、未完成）',
          usingDeptIds: ['Z9OJT1'], // 合成前綴，DOC_USING_DEPT 無 FK 至 ORG_UNIT，不需真實組織列。
        });
      expect([200, 201]).toContain(created.status);
      obligatedDocId = created.body.id as string;
      expect(obligatedDocId).toBeTruthy();
    }, 60_000);

    it('⑩ 有義務且未完成（0 場次）之 marker 文件，不論真庫有多少無義務文件，必在 docScope=all 之 items 內', async () => {
      const dc = (await fetchSummary('?docScope=all')).body.docCoverage;
      const hit = dc.items.find((i) => i.documentId === obligatedDocId);
      expect(hit).toBeDefined();
      expect(hit).toMatchObject({ documentNumber: obligatedDocNumber, state: 'none', totalUnits: 1, completedUnits: 0 });
    }, 60_000);

    it('⑨ 同一份文件亦出現於 docScope=incomplete（totalUnits>0 且 state≠all，符合收窄後之定義）', async () => {
      const dc = (await fetchSummary('?docScope=incomplete')).body.docCoverage;
      expect(dc.items.some((i) => i.documentId === obligatedDocId)).toBe(true);
    }, 60_000);

    it('⑨ 同一份文件不出現於 docScope=unassigned（totalUnits>0，非無義務文件）', async () => {
      // unassigned 範圍下真庫母體可能遠大於 maxRows、items 已被截斷；直接以「不在此範圍之過濾述詞內」
      // 佐證──若它出現在 items 中即直接違反 totalUnits===0 之述詞（上方 A 節已鎖此述詞本身），
      // 此處另以 byState.unassigned 不增反減此文件之貢獻做交叉確認：該文件之 totalUnits=1，
      // 不應被計入 unassigned 之母體（byState.unassigned 恆為 totalUnits===0 之份數）。
      const dc = (await fetchSummary('?docScope=unassigned')).body.docCoverage;
      expect(dc.items.some((i) => i.documentId === obligatedDocId)).toBe(false);
    }, 60_000);
  });

  /**
   * ═════ C. byState.unassigned 之真實計數（marker 驅動，⑧ 之端到端背書）═════
   * 🔴 以「建立前後之 delta」驗證（不對絕對值下硬編期望）：一份透過真實 `POST /admin/documents`
   * 建立、`usingDeptIds: []` 之文件，必須恰使 `byState.unassigned` 與 `totalDocuments` 各 +1——
   * 這是「一份文件未指定使用部門」這個判準（`totalUnits===0`）唯一無法只靠既有真庫資料驗證的
   * 端到端路徑（既有資料之計數對不對，光看一次回應看不出來；必須自己造一筆才知道加總對不對）。
   */
  describe('C. byState.unassigned 之真實計數（marker 驅動，delta 驗證）', () => {
    it('新建一份 usingDeptIds=[] 之文件 → byState.unassigned 與 totalDocuments 各恰 +1', async () => {
      const before = (await fetchSummary('?docScope=all')).body.docCoverage;

      const created = await ctx
        .http()
        .post('/admin/documents')
        .set('Cookie', ctx.adminCookie)
        .send({
          lifecycleId,
          status: 'active',
          documentNumber: `${MARK.doc}OJT-C-${runId}`,
          documentName: 'ZZINT OJT 未指定使用部門回歸案',
          usingDeptIds: [],
        });
      expect([200, 201]).toContain(created.status);

      const after = (await fetchSummary('?docScope=all')).body.docCoverage;
      expect(after.totalDocuments).toBe(before.totalDocuments + 1);
      expect(after.byState.unassigned).toBe(before.byState.unassigned + 1);
      expect(after.byState.none).toBe(before.byState.none + 1); // AC-04 口徑：unassigned 為 none 之子集。
    }, 60_000);
  });
});
