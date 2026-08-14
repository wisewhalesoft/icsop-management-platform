import { bootIntApp, shutdownIntApp, IntCtx, MARK } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { AuditWriterService } from '../../src/audit/audit-writer.service';

/**
 * [int] F040／F038 — **兩表之循環名稱語意刻意相反**，本檔同時釘住兩個方向。
 *
 * 2026-08-08 使用者裁決 5（修規格、不修 schema）之後：
 *  - **`AUDIT_LOG.lifecycleName`**：確有此欄，**快照語意**。循環改名／改子分類後，
 *    既有紀錄之值**維持不變**（AC-35 規範寫入值、**AC-36** 規範事後不變）。
 *  - **`LIFECYCLE_CHANGE_LOG`**：**不存**循環名稱（本表無 `lifecycleName` 欄，
 *    且明確不新增欄位／不新增 migration）。其「循環別」顯示為查詢時以 `lifecycleId`
 *    join `LIFECYCLE` 取**當前值**（AC-34），故改名後既有事件之顯示**會一併改變**。
 *
 * ⚠ **為何這支測試必須存在**：以上是**刻意設計的不一致**，且是使用者明確接受的取捨
 * （代價見 F040 AC-34 與 open-questions OQ-E07-11）。正因為刻意，日後任何人看到
 * 「同樣是歷史事件，一邊凍結、一邊跟著變」都極可能當成 bug「順手修正」——
 * 而純函式測不到跨時間之持久化行為。**兩個方向都必須斷言**：只驗 AUDIT_LOG 凍結，
 * 日後有人把 `LIFECYCLE_CHANGE_LOG` 也改成快照時本檔仍會綠，等於白寫。
 *
 * marker：循環名 `ZZINT_LC_`、帳號 `zzint-`（harness `cleanupMarkers` 已涵蓋）。
 * 本檔不建立文件，稽核噪音壓到最小（僅一次 tree-preview 檢視）。
 * `AUDIT_LOG` 有 append-only 觸發器（INSTEAD OF UPDATE,DELETE）→ 該列無法刪除，屬已知可接受噪音。
 */
const TS = Date.now();
const NAME_SNAP = `${MARK.lc}SNAP_${TS}`;
const SUB_BEFORE = '消金';
const SUB_AFTER = `企金改${TS}`; // 與池中任何組合皆不同 → 不撞 (name, subcategory) 唯一索引

interface ChangeItem {
  id: string;
  lifecycleId: string;
  changeType: string;
}

describe('[int] F040 循環名稱：AUDIT_LOG 快照 vs LIFECYCLE_CHANGE_LOG join（相反語意）', () => {
  let ctx: IntCtx;
  /** app 關閉後仍可用（store 綁 AppDataSource，非 Nest 生命週期管理）→ 供主動搬遷 outbox。 */
  let writer: AuditWriterService;
  let lifecycleId = '';
  /** 事件寫入當下之顯示名稱（＝快照應凍結之值）。 */
  const displayBefore = `${NAME_SNAP}（${SUB_BEFORE}）`;
  const displayAfter = `${NAME_SNAP}（${SUB_AFTER}）`;

  /**
   * 查本循環之稽核快照列。
   * ⚠ 以 **`lifecycleName` 前綴**（含本次執行之時戳，全庫唯一）過濾，**不以 `lifecycleId`**——
   * `AUDIT_LOG.lifecycleId` 落庫為大寫 GUID，與建立端點回傳之 id 形態不同，
   * 以 id 比對會查不到而造成假紅（實測踩過）。改名只動 subcategory，故前綴比對於
   * 「快照被錯誤改寫」之情形仍能命中，守衛效力不受影響。
   */
  async function auditRows(): Promise<{ lifecycleName: string }[]> {
    return AppDataSource.query(
      `SELECT [lifecycleName] FROM [AUDIT_LOG]
         WHERE [lifecycleName] LIKE @0 AND [targetType] = 'LIFECYCLE'`,
      [`${NAME_SNAP}%`],
    );
  }

  /**
   * 等待 outbox 將稽核列搬入 `AUDIT_LOG`（非阻斷寫入）。
   *
   * ⚠ 2026-08-14 查明「同一份程式碼一次紅一次綠」的真正原因，並改為**主動搬遷**：
   * 本測試自己的 app 已於 (3b) 關閉，其 `@Cron(EVERY_5_MINUTES)` 補償排程隨之停擺——
   * 先前能綠純粹是因為**本機 docker `icsop-backend` 容器**接同一個 SOP 庫，靠它的 5 分鐘
   * cron 剛好在 150 秒視窗內 tick（實測：測試放棄後約 30 秒該列即落庫，且期間本機無任何測試在跑）。
   * 命中與否是擲硬幣，與受測程式無關。故改為直接呼叫 `processOutboxRetry()`——**與排程呼叫的是
   * 同一個方法**，不繞過任何業務邏輯，只是不再等別的行程；輪詢保留為安全網（涵蓋容器搶先搬走
   * 或其他行程並行的情形）。
   */
  async function waitForAuditRow(): Promise<void> {
    await writer.processOutboxRetry();
    for (let i = 0; i < 300; i++) {
      if ((await auditRows()).length > 0) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
      'AUDIT_LOG 於 150 秒內未落入本循環之 LIFECYCLE_VIEW 列；' +
        '若非 outbox 延遲，即為 AC-35 稽核寫入路徑之真實缺陷，應回報而非放寬斷言。',
    );
  }

  beforeAll(async () => {
    ctx = await bootIntApp();
    writer = ctx.app.get(AuditWriterService);

    // (1) 建立有子分類之 marker 循環
    const lc = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: NAME_SNAP, subcategory: SUB_BEFORE });
    expect([200, 201]).toContain(lc.status);
    lifecycleId = lc.body.id as string;

    // (2) F036 樹狀圖預覽檢視 → 寫 AUDIT_LOG（含 lifecycleName 快照）
    const view = await ctx
      .http()
      .get(`/admin/lifecycles/${lifecycleId}/tree-preview`)
      .set('Cookie', ctx.adminCookie);
    expect(view.status).toBe(200);

    // (3) DAG 結構變更 → 寫 LIFECYCLE_CHANGE_LOG（NODE_ADDED）
    const node = await ctx
      .http()
      .post(`/admin/lifecycles/${lifecycleId}/nodes`)
      .set('Cookie', ctx.adminCookie)
      .send({ name: 'ZZINT 快照對照節點' });
    expect([200, 201]).toContain(node.status);

    // (3b) ⚠ 稽核寫入為**非阻斷之 outbox**：HTTP 回應 200 不代表 AUDIT_LOG 已落列，
    //      實測在 app 存活期間輪詢 60 秒仍查不到，**關閉 app 後才落庫**。
    //      故此處先關閉 Nest app（保留 AppDataSource 連線供後續 SQL 斷言），再輪詢等待落列。
    //      這一步是必要的，且順序不可調換：AC-36 之前提為「事件寫入**之後**才修改」，
    //      若在落列前改子分類，寫入當下取到的就已是新值，本測試將完全失去意義。
    await ctx.app.close();
    await waitForAuditRow();

    // (4) **事件寫入之後**才改子分類（以 SQL 直接更動，聚焦於快照／join 語意本身，
    //     不耦合於編輯端點之形狀；單筆同名列，改為池中不存在之組合，不撞唯一索引）
    await AppDataSource.query(`UPDATE [LIFECYCLE] SET [subcategory] = @0 WHERE [id] = @1`, [
      SUB_AFTER,
      lifecycleId,
    ]);
    const after = await AppDataSource.query(
      `SELECT [name],[subcategory] FROM [LIFECYCLE] WHERE [id] = @0`,
      [lifecycleId],
    );
    expect(after[0].subcategory).toBe(SUB_AFTER); // 前置條件：改名確實生效
    // timeout 需大於「boot ＋ outbox 等待預算（150s）」之總和，否則會以 beforeAll 逾時之形式假紅
  }, 300000);

  afterAll(() => shutdownIntApp(ctx));

  describe('AC-36 `AUDIT_LOG.lifecycleName` —— 快照語意，改子分類後**不得變動**', () => {
    it('既有稽核列之 lifecycleName 維持寫入當下之值', async () => {
      const rows = await auditRows();
      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const r of rows) {
        expect(r.lifecycleName).toBe(displayBefore);
      }
    });

    it('**反向**：不得被改寫為新值（若變成新值即為快照語意遭破壞）', async () => {
      for (const r of await auditRows()) {
        expect(r.lifecycleName).not.toBe(displayAfter);
        expect(r.lifecycleName).not.toContain(SUB_AFTER);
      }
    });

    it('快照值為 lifecycleDisplayName 之輸出（含子分類、全形括號無空白，AC-35）', async () => {
      const rows = await auditRows();
      expect(rows[0].lifecycleName).toBe(`${NAME_SNAP}（${SUB_BEFORE}）`);
      expect(rows[0].lifecycleName).not.toContain('(');
      expect(rows[0].lifecycleName).not.toContain(' ');
    });

  });

  describe('AC-34 `LIFECYCLE_CHANGE_LOG` —— 不存名稱，顯示為 join 當前值', () => {
    it('**結構守衛**：本表不得存在任何循環名稱欄位（新增欄位＝改採快照語意，須先走 OQ-E07-11）', async () => {
      const cols = await AppDataSource.query(
        `SELECT [COLUMN_NAME] FROM INFORMATION_SCHEMA.COLUMNS
           WHERE [TABLE_NAME] = 'LIFECYCLE_CHANGE_LOG'`,
      );
      const names = (cols as { COLUMN_NAME: string }[]).map((c) => c.COLUMN_NAME.toLowerCase());
      expect(names).toContain('lifecycleid');
      // 只禁「循環名稱」欄；`actorName`（操作者姓名）為既有且正當之欄位，不在此限。
      expect(names).not.toContain('lifecyclename');
      expect(names).not.toContain('cyclename');
      expect(names.filter((n) => n.includes('lifecycle'))).toEqual(['lifecycleid']);
    });

    it('事件列確實落地，且其欄位不含任何循環名稱（顯示必然取當前值）', async () => {
      const rows: ChangeItem[] = await AppDataSource.query(
        `SELECT [id],[lifecycleId],[changeType] FROM [LIFECYCLE_CHANGE_LOG]
           WHERE [lifecycleId] = @0 AND [changeType] = 'NODE_ADDED'`,
        [lifecycleId],
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0]).not.toHaveProperty('lifecycleName');
    });

    it('事件未凍結任何名稱 → 改子分類後仍以同一 lifecycleId 可查得（辨識靠 id 非名稱）', async () => {
      const rows = await AppDataSource.query(
        `SELECT COUNT(*) AS c FROM [LIFECYCLE_CHANGE_LOG] WHERE [lifecycleId] = @0`,
        [lifecycleId],
      );
      expect(Number(rows[0].c)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('兩表之對照（本檔存在的理由）', () => {
    it('同一循環、同一次改子分類：AUDIT_LOG 凍結舊值，而 CHANGE_LOG 無名稱可凍結', async () => {
      const audit = await auditRows();
      const cols = await AppDataSource.query(
        `SELECT [COLUMN_NAME] FROM INFORMATION_SCHEMA.COLUMNS
           WHERE [TABLE_NAME] = 'LIFECYCLE_CHANGE_LOG' AND [COLUMN_NAME] LIKE '%lifecycle%'`,
      );
      // 左：凍結於舊值；右：只有 lifecycleId、沒有任何循環名稱欄 → 顯示只能 join 當前值
      expect(audit[0].lifecycleName).toBe(displayBefore);
      expect((cols as { COLUMN_NAME: string }[]).map((c) => c.COLUMN_NAME)).toEqual([
        'lifecycleId',
      ]);
    });
  });
});
