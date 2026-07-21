import { Logger } from '@nestjs/common';
import { ScheduledOrgSyncService } from './scheduled-org-sync.service';
import { OrgSyncService, SyncInProgressError } from './org-sync.service';
import { SyncResult } from './org-sync.types';

/**
 * 每日排程同步（OQ-E02-02）。不測 @Cron decorator 之時間觸發（難以確定性驗證），
 * 改直接測 runScheduled()：
 *  1. 以 ('scheduled', null) 呼叫 OrgSyncService.run。
 *  2. svc.run 拋錯（含互斥 SYNC_IN_PROGRESS、hasRunningSyncRun 之 DB 例外）時，
 *     例外被吞掉、不外拋（排程失敗只記 log，不中斷程序）。
 */

const okResult: SyncResult = {
  runId: 'run-sch-1',
  triggerType: 'scheduled',
  status: 'success',
  changeCount: 2,
  stats: {
    departmentsRead: 1,
    orgCreated: 0,
    orgUpdated: 0,
    accountsRead: 2,
    accountsCreated: 0,
    accountsUpdated: 2,
    accountsDisabled: 0,
    orphanWarnings: 0,
    dirtyRows: 0,
    disappearedCount: 0,
    disappearedRatio: 0,
  },
  warnings: [],
};

describe('ScheduledOrgSyncService.runScheduled', () => {
  beforeEach(() => {
    // 靜音 log，避免測試輸出被排程 log 汙染（不驗 log 內容）。
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('以 (scheduled, null) 呼叫 OrgSyncService.run', async () => {
    const run = jest.fn().mockResolvedValue(okResult);
    const svc = { run } as unknown as OrgSyncService;
    const scheduled = new ScheduledOrgSyncService(svc);

    await scheduled.runScheduled();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('scheduled', null);
  });

  it('svc.run 拋一般例外 → 被吞掉、runScheduled 不外拋', async () => {
    const run = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = { run } as unknown as OrgSyncService;
    const scheduled = new ScheduledOrgSyncService(svc);

    await expect(scheduled.runScheduled()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledWith('scheduled', null);
  });

  it('svc.run 拋 SYNC_IN_PROGRESS（互斥）→ 被吞掉、不外拋', async () => {
    const run = jest.fn().mockRejectedValue(new SyncInProgressError());
    const svc = { run } as unknown as OrgSyncService;
    const scheduled = new ScheduledOrgSyncService(svc);

    await expect(scheduled.runScheduled()).resolves.toBeUndefined();
  });
});
