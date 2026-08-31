import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import { MssqlUpstreamOrgReader } from './mssql-upstream-reader';
import { TypeOrmOrgSyncStore } from './typeorm-org-sync.store';
import { OrgSyncService } from './org-sync.service';
import {
  loadUpstreamConfig,
  SYNC_COMPIDS,
  loadDisappearedThresholdOverride,
  loadRoleChangeThresholdOverride,
} from './org-sync.config';

/**
 * 可實跑之驗證指令：
 *   `npm run sync:once`                          全部設定公司（依序），增量（依各自 MTDT 水位）
 *   `SYNC_FULL_RESYNC=1 npm run sync:once`       全部設定公司，全量重同步（忽略水位）
 *   `SYNC_ONLY_COMPID=AD npm run sync:once`      只跑指定一家（逐家上線驗證用，B 階段新增）
 *
 * 對真實 dev 上游（UPSTREAM_*）＋ 應用 MSSQL（APP_MSSQL_*）依序對每家公司執行一次同步，並印出：
 *   讀取筆數、推導後各 tier 分布、新增/更新/停用筆數、職稱對照覆蓋、SYNC_RUN 結果。
 * ⚠ 需真實連線；請由人工執行驗證（agent 不自動跑）。dev 上游個資已遮罩，僅驗結構與筆數合理性。
 *
 * **新增上游帳號欄位後必須跑一次全量**：增量只取 `MTDT > watermark` 之帳號，既有帳號不會被
 * 取回，新欄位的回填不會自然發生（見 `OrgSyncService.run` 之 fullResync 說明）。
 * ⚠ 旗標以**環境變數**為主：`npm run sync:once -- --full` 之 argv 會被 ts-node／dotenvx
 *   包裝層吃掉（實測 2026-08-12 收不到），env var 不受包裝層影響，容器與 CI 亦適用。
 */
async function runOneCompany(
  reader: MssqlUpstreamOrgReader,
  store: TypeOrmOrgSyncStore,
  compid: string,
  fullResync: boolean,
  thresholdOverride: number | undefined,
  roleThresholdOverride: number | undefined,
  log: (msg: string) => void,
): Promise<void> {
  const service = new OrgSyncService(reader, store, {
    compid,
    disappearedThreshold: thresholdOverride,
    roleChangeThreshold: roleThresholdOverride,
  });

  log(
    `\n=== ICSOP 組織同步（COMPID=${compid}，` +
      `${fullResync ? '全量重同步' : '增量'}）===`,
  );

  const res = await service.run('manual', 'cli', { fullResync });

  log(`\n[SYNC_RUN] runId=${res.runId} status=${res.status} changeCount=${res.changeCount}`);
  if (res.errorCode) log(`  errorCode=${res.errorCode}  ${res.errorMessage ?? ''}`);

  log('\n[讀取筆數]');
  log(`  部門（VW_DEPT_SQL 全量）：${res.stats.departmentsRead}`);
  log(`  帳號（VW_PERSONNEL_SQL 增量）：${res.stats.accountsRead}`);
  log(`  消失（在職）：${res.stats.disappearedCount}（比例 ${(res.stats.disappearedRatio * 100).toFixed(2)}%）`);

  log('\n[異動筆數]');
  log(`  組織：新增 ${res.stats.orgCreated} / 更新 ${res.stats.orgUpdated}`);
  log(`  帳號：新增 ${res.stats.accountsCreated} / 更新 ${res.stats.accountsUpdated} / 停用 ${res.stats.accountsDisabled}`);
  log(`  孤兒（保留、警告）：${res.stats.orphanWarnings}  髒資料（略過）：${res.stats.dirtyRows}`);

  // 推導後之 tier 分布（自本地 ORG_UNIT）
  const rows: Array<{ tier: string; cnt: number }> = await AppDataSource.query(
    `SELECT tier, COUNT(*) AS cnt FROM [ORG_UNIT] WHERE companyCode = @0 GROUP BY tier`,
    [compid],
  );
  log('\n[推導後各 tier 分布]');
  for (const r of rows) log(`  ${r.tier.padEnd(11)} ${r.cnt}`);

  // 職稱（G-ADM-001「資位」欄）：對照主檔筆數 + 帳號側之解析覆蓋率。
  // 覆蓋率以 JOB_TITLE 之「本公司優先、跨公司 fallback」兩段式比對計算，與讀取端規則一致。
  log('\n[職稱對照（JOB_TITLE）]');
  log(`  本次寫入對照列：${res.stats.jobTitlesUpserted ?? 0}`);
  const titleStats: Array<{ total: number; withCode: number; resolvable: number }> =
    await AppDataSource.query(
      // ⚠ 不可寫成 SUM(CASE WHEN EXISTS(子查詢) ...)：MSSQL 不允許彙總函式作用於含子查詢之
      //   運算式（2026-08-12 實跑報 "Cannot perform an aggregate function on an expression
      //   containing an aggregate or a subquery"）。改以 LEFT JOIN 去重後之對照代碼集合。
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN a.jobTitleCode IS NOT NULL THEN 1 ELSE 0 END) AS withCode,
         SUM(CASE WHEN t.code IS NULL THEN 0 ELSE 1 END) AS resolvable
       FROM [ACCOUNT] a
       LEFT JOIN (SELECT DISTINCT code FROM [JOB_TITLE]) t ON t.code = a.jobTitleCode
       WHERE a.companyCode = @0 AND a.source = 'upstream' AND a.status = 'active'`,
      [compid],
    );
  const ts = titleStats[0];
  if (ts) {
    const pct = ts.total > 0 ? ((ts.resolvable / ts.total) * 100).toFixed(2) : '0.00';
    log(`  在職上游帳號 ${ts.total}／有代碼 ${ts.withCode}／可解析出名稱 ${ts.resolvable}（${pct}%）`);
  }

  // 職位（G-ADM-001「職位」欄）：對照主檔筆數 + 帳號側之解析覆蓋率。
  // 🔴 覆蓋率必須以 **(companyCode, code) 複合鍵** join——職位不做跨公司 fallback，
  //    若比照上方職稱僅以 code join，跨公司同碼（如 C04：AS 處長／AD 部長）會虛報成命中。
  log('\n[職位對照（JOB_POSITION）]');
  log(`  本次寫入對照列：${res.stats.jobPositionsUpserted ?? 0}`);
  const positionStats: Array<{ total: number; withCode: number; resolvable: number }> =
    await AppDataSource.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN a.jobPositionCode IS NOT NULL THEN 1 ELSE 0 END) AS withCode,
         SUM(CASE WHEN p.code IS NULL THEN 0 ELSE 1 END) AS resolvable
       FROM [ACCOUNT] a
       LEFT JOIN [JOB_POSITION] p
         ON p.code = a.jobPositionCode AND p.companyCode = a.companyCode
       WHERE a.companyCode = @0 AND a.source = 'upstream' AND a.status = 'active'`,
      [compid],
    );
  const ps = positionStats[0];
  if (ps) {
    const pct = ps.total > 0 ? ((ps.resolvable / ps.total) * 100).toFixed(2) : '0.00';
    log(`  在職上游帳號 ${ps.total}／有代碼 ${ps.withCode}／可解析出名稱 ${ps.resolvable}（${pct}%）`);
    if (ps.total > 0 && ps.withCode === 0) {
      log('  ⚠ 有代碼者為 0：加欄後之回填不會自然發生，請執行 SYNC_FULL_RESYNC=1 npm run sync:once');
    }
  }

  if (res.warnings.length > 0) {
    log(`\n[警告 ${res.warnings.length} 則（前 10）]`);
    for (const w of res.warnings.slice(0, 10)) log(`  - ${w}`);
  }
  log('');
}

async function main(): Promise<void> {
  const fullResync =
    /^(1|true|yes)$/i.test(process.env.SYNC_FULL_RESYNC ?? '') ||
    process.argv.includes('--full');
  const onlyCompid = process.env.SYNC_ONLY_COMPID?.trim();
  const compids = onlyCompid ? [onlyCompid] : [...SYNC_COMPIDS];
  if (onlyCompid && !SYNC_COMPIDS.includes(onlyCompid)) {
    throw new Error(
      `SYNC_ONLY_COMPID='${onlyCompid}' 不在設定之同步範圍（${SYNC_COMPIDS.join('/')}）內`,
    );
  }

  const reader = new MssqlUpstreamOrgReader(loadUpstreamConfig());
  const store = new TypeOrmOrgSyncStore(AppDataSource);
  const thresholdOverride = loadDisappearedThresholdOverride();
  const roleThresholdOverride = loadRoleChangeThresholdOverride();

  // eslint-disable-next-line no-console
  const log = console.log;
  if (roleThresholdOverride !== undefined) {
    log(
      `⚠ 角色變更閾值已被 SYNC_ROLE_CHANGE_THRESHOLD 覆寫為 ` +
        `${(roleThresholdOverride * 100).toFixed(1)}%（僅供角色自動化首次全量套用之一次性作業；完成後請移除）。`,
    );
  }
  if (thresholdOverride !== undefined) {
    log(
      `⚠ 消失閾值已被 SYNC_DISAPPEARED_THRESHOLD 覆寫為 ` +
        `${(thresholdOverride * 100).toFixed(1)}%（僅供換來源／新公司切換之一次性作業；完成後請移除）。`,
    );
  }

  try {
    for (const compid of compids) {
      await runOneCompany(
        reader,
        store,
        compid,
        fullResync,
        thresholdOverride,
        roleThresholdOverride,
        log,
      );
    }
  } finally {
    await reader.close().catch(() => undefined);
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[sync:once] 失敗：', e instanceof Error ? e.stack ?? e.message : e);
    process.exit(1);
  });
