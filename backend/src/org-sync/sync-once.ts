import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import { MssqlUpstreamOrgReader } from './mssql-upstream-reader';
import { TypeOrmOrgSyncStore } from './typeorm-org-sync.store';
import { OrgSyncService } from './org-sync.service';
import { loadUpstreamConfig, SYNC_COMPID } from './org-sync.config';

/**
 * 可實跑之驗證指令：`npm run sync:once`
 * 對真實 dev 上游（UPSTREAM_*）＋ 應用 MSSQL（APP_MSSQL_*）執行一次同步，並印出：
 *   讀取筆數、推導後各 tier 分布、新增/更新/停用筆數、SYNC_RUN 結果。
 * ⚠ 需真實連線；請由人工執行驗證（agent 不自動跑）。dev 上游個資已遮罩，僅驗結構與筆數合理性。
 */
async function main(): Promise<void> {
  const reader = new MssqlUpstreamOrgReader(loadUpstreamConfig());
  const store = new TypeOrmOrgSyncStore(AppDataSource);
  const service = new OrgSyncService(reader, store, { compid: SYNC_COMPID });

  // eslint-disable-next-line no-console
  const log = console.log;
  log(`\n=== ICSOP 組織同步（COMPID=${SYNC_COMPID}）===`);

  try {
    const res = await service.run('manual', 'cli');

    log(`\n[SYNC_RUN] runId=${res.runId} status=${res.status} changeCount=${res.changeCount}`);
    if (res.errorCode) log(`  errorCode=${res.errorCode}  ${res.errorMessage ?? ''}`);

    log('\n[讀取筆數]');
    log(`  部門（VW_DEPT_SQL 全量）：${res.stats.departmentsRead}`);
    log(`  帳號（VW_HPMUSER 增量）：${res.stats.accountsRead}`);
    log(`  消失（在職）：${res.stats.disappearedCount}（比例 ${(res.stats.disappearedRatio * 100).toFixed(2)}%）`);

    log('\n[異動筆數]');
    log(`  組織：新增 ${res.stats.orgCreated} / 更新 ${res.stats.orgUpdated}`);
    log(`  帳號：新增 ${res.stats.accountsCreated} / 更新 ${res.stats.accountsUpdated} / 停用 ${res.stats.accountsDisabled}`);
    log(`  孤兒（保留、警告）：${res.stats.orphanWarnings}  髒資料（略過）：${res.stats.dirtyRows}`);

    // 推導後之 tier 分布（自本地 ORG_UNIT）
    const rows: Array<{ tier: string; cnt: number }> = await AppDataSource.query(
      `SELECT tier, COUNT(*) AS cnt FROM [ORG_UNIT] WHERE companyCode = @0 GROUP BY tier`,
      [SYNC_COMPID],
    );
    log('\n[推導後各 tier 分布]');
    for (const r of rows) log(`  ${r.tier.padEnd(11)} ${r.cnt}`);

    if (res.warnings.length > 0) {
      log(`\n[警告 ${res.warnings.length} 則（前 10）]`);
      for (const w of res.warnings.slice(0, 10)) log(`  - ${w}`);
    }
    log('');
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
