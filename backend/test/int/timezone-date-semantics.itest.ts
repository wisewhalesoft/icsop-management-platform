import * as sql from 'mssql';
import { bootIntApp, shutdownIntApp, IntCtx, MARK } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { SyncRun } from '../../src/database/entities/sync-run.entity';
import { hashPassword } from '../../src/accounts/password';

/**
 * Bug 2（時區語意）之 ring：真容器煙霧測試發現「最後登入」顯示超前 8 小時。
 * team-lead 唯讀根因調查（可信任其結論，斷言由本檔自行設計）：TypeORM 之
 * `SqlServerDriver` 把 tedious 的 `useUTC` 硬蓋為 `false`（tedious 自身預設 `true`），
 * `backend/src/database/data-source.ts` 未覆寫回 `true`——語意變成「datetime 欄位存的是
 * 寫入行程之本地牆鐘、不帶時區；讀出時以讀取行程之本地時區還原」。
 *
 * ⚠ 關鍵性質＝讀寫對稱：同一 tedious 連線設定寫進去再讀出來，數值不變（此即後端容器一路
 * 正確之原因——容器行程 TZ 未設定即 UTC，全程用同一組 useUTC:false 語意，對稱抵銷）。只有
 * 「寫入方 tedious 設定 ≠ 讀取方 tedious 設定」時才會現形，一現形就是整數小時（本例＝行程
 * 時區偏移量）之落差。本檔刻意在單一 Node 行程內，同時開兩條連線各自對應 bug 的兩端：
 *   ① `AppDataSource`（TypeORM，`data-source.ts` 之設定＝本 bug 所在）
 *   ② 一條比照 `backend/src/org-sync/mssql-upstream-reader.ts:41-58` 之寫法、直接以 `mssql`
 *      套件建立、**不覆寫 `useUTC`**（沿用 tedious 自身預設 `true`）之獨立連線
 * 兩者讀同一列的同一欄，pre-fix 應不等（差值＝行程 TZ 偏移），post-fix 應相等。
 *
 * ⚠ 測試本身之行程時區敏感性處置：此鑑別力**只在行程 TZ ≠ UTC 時才存在**（team-lead 已實測：
 * 後端容器 TZ=UTC 時兩端讀寫對稱、完全測不出來）。本檔於 `beforeAll` 顯式將 `process.env.TZ`
 * 釘死為 `'Asia/Taipei'`（UTC+8，台灣無日光節約時間，全年固定偏移，無 DST 邊界疑慮），使斷言
 * 結果與執行機器之環境時區設定完全無關（CI／開發機不論原生 TZ 為何，結果皆確定性一致）；
 * `afterAll` 還原原始值——`test/jest-int.json` 之 `maxWorkers:1` 使全部 *.itest.ts 依序共用
 * 同一 Node 行程，若不還原會外洩污染同批次跑在後面的其他 itest 檔案之 Date 行為。
 */
describe('[int] Bug 2 時區語意 — TypeORM(useUTC) 與 tedious 標準預設之跨連線讀取須一致（UTC+8 主機上具鑑別力）', () => {
  let ctx: IntCtx;
  let pool: sql.ConnectionPool;
  const ORIGINAL_TZ = process.env.TZ;

  beforeAll(async () => {
    process.env.TZ = 'Asia/Taipei';
    ctx = await bootIntApp();

    const trust = /^(true|1|yes)$/i.test(process.env.APP_MSSQL_TRUST_SERVER_CERT ?? 'true');
    pool = await new sql.ConnectionPool({
      server: process.env.APP_MSSQL_HOST ?? 'localhost',
      port: Number(process.env.APP_MSSQL_PORT ?? 1433),
      user: process.env.APP_MSSQL_USER,
      password: process.env.APP_MSSQL_PASSWORD,
      database: process.env.APP_MSSQL_DATABASE ?? 'icsop',
      options: { trustServerCertificate: trust, encrypt: true },
      // 刻意不設 useUTC——沿用 tedious 套件自身預設值 true，作為「正確語意」之對照端。
    } as sql.config).connect();
  }, 60000);

  afterAll(async () => {
    await pool?.close().catch(() => undefined);
    await shutdownIntApp(ctx);
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it('Account.lastLoginAt（真容器煙霧測試回報之症狀欄位）：TypeORM 讀回值須與 tedious 標準預設連線讀回值一致', async () => {
    const knownInstant = new Date('2026-08-14T03:00:00.000Z'); // 任意固定 UTC 瞬間，非整點/非午夜，避免巧合掩蓋
    const repo = AppDataSource.getRepository(Account);
    const saved = await repo.save(
      repo.create({
        companyCode: 'AS',
        loginId: `${MARK.acct}tzacct`,
        roleCode: 'User',
        status: 'active',
        source: 'manual',
        name: 'ZZINT 時區測試',
        passwordHash: hashPassword('x'),
        lastLoginAt: knownInstant,
      }),
    );

    const viaTypeorm = await repo.findOneByOrFail({ id: saved.id });
    const viaRawMssql = await pool
      .request()
      .input('id', sql.UniqueIdentifier, saved.id)
      .query<{ lastLoginAt: Date }>('SELECT lastLoginAt FROM ACCOUNT WHERE id = @id');
    const rawValue = viaRawMssql.recordset[0]?.lastLoginAt;

    expect(viaTypeorm.lastLoginAt).not.toBeNull();
    expect(rawValue).toBeDefined();
    // 核心斷言：同一實體列的同一欄，經兩條 tedious 設定不同之連線讀出，必須代表同一瞬間。
    expect(viaTypeorm.lastLoginAt!.getTime()).toBe(rawValue!.getTime());
  });

  /**
   * SYNC_RUN.watermark（team-lead 明確指出之唯一「影響正確性而非顯示」項）：增量同步之下次
   * 取回下限，若寫入/讀取分屬不同 tedious 語意，會使 `formatSqlDate`（upstream-queries.ts，
   * 已核實其本身以 getUTC* 組字、對行程時區不敏感——見同批新增之
   * upstream-queries.spec.ts 對應測試）組出的 OPENQUERY 字面值圍繞著一個**錯誤的瞬間**，
   * 使下次增量同步整整漏抓或重抓 8 小時的上游異動（非顯示問題，是資料正確性問題）。
   */
  it('SyncRun.watermark（增量同步水位，唯一影響資料正確性而非顯示之項目）：TypeORM 讀回值須與 tedious 標準預設連線讀回值一致', async () => {
    const knownInstant = new Date('2026-08-01T21:15:30.000Z');
    const repo = AppDataSource.getRepository(SyncRun);
    const saved = await repo.save(
      repo.create({
        triggerType: 'manual',
        status: 'success',
        startedAt: new Date('2026-08-01T21:00:00.000Z'),
        watermark: knownInstant,
        triggeredBy: `${MARK.acct}tzwm`, // marker 前綴，供 harness.cleanupMarkers() 依 triggeredBy 回收
      }),
    );

    const viaTypeorm = await repo.findOneByOrFail({ id: saved.id });
    const viaRawMssql = await pool
      .request()
      .input('id', sql.UniqueIdentifier, saved.id)
      .query<{ watermark: Date }>('SELECT watermark FROM SYNC_RUN WHERE id = @id');
    const rawValue = viaRawMssql.recordset[0]?.watermark;

    expect(viaTypeorm.watermark).not.toBeNull();
    expect(rawValue).toBeDefined();
    expect(viaTypeorm.watermark!.getTime()).toBe(rawValue!.getTime());
  });
});
