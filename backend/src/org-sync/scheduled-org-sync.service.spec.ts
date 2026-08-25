import { Logger } from '@nestjs/common';
import { ScheduledOrgSyncService } from './scheduled-org-sync.service';
import { OrgSyncCoordinator } from './org-sync-coordinator';
import { SyncResult } from './org-sync.types';

/**
 * 每日排程同步（OQ-E02-02）。不測 @Cron decorator 之時間觸發（難以確定性驗證），
 * 改直接測 runScheduled()：
 *  1. 以 ('scheduled', null) 呼叫 OrgSyncCoordinator.runAll（B 階段：多公司協調層）。
 *  2. 逐筆結果記 log（不驗 log 內容，僅驗不外拋）。
 *  3. coordinator.runAll 本身拋出**未預期**例外（單一公司之互斥／已知失敗已由協調層內部
 *     吞掉並轉為陣列中一筆 failed 結果，見 org-sync-coordinator.spec.ts）時，仍須被本層
 *     外層 try/catch 攔下，不讓例外自 cron 回呼外拋而中斷程序（縱深防禦）。
 */

const okResult: SyncResult = {
  runId: 'run-sch-1',
  compid: 'AS',
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

  it('以 (scheduled, null) 呼叫 OrgSyncCoordinator.runAll', async () => {
    const runAll = jest.fn().mockResolvedValue([okResult]);
    const coordinator = { runAll } as unknown as OrgSyncCoordinator;
    const scheduled = new ScheduledOrgSyncService(coordinator);

    await scheduled.runScheduled();

    expect(runAll).toHaveBeenCalledTimes(1);
    expect(runAll).toHaveBeenCalledWith('scheduled', null);
  });

  it('多公司結果逐筆記 log，不因其中一筆非 success 而中斷其餘筆記錄', async () => {
    const failed: SyncResult = { ...okResult, compid: 'AD', status: 'failed', errorCode: 'SYNC_IN_PROGRESS' };
    const runAll = jest.fn().mockResolvedValue([okResult, failed]);
    const coordinator = { runAll } as unknown as OrgSyncCoordinator;
    const scheduled = new ScheduledOrgSyncService(coordinator);
    const logSpy = jest.spyOn(Logger.prototype, 'log');

    await scheduled.runScheduled();

    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  it('coordinator.runAll 拋一般例外（縱深防禦，非per-company 已知失敗）→ 被吞掉、不外拋', async () => {
    const runAll = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const coordinator = { runAll } as unknown as OrgSyncCoordinator;
    const scheduled = new ScheduledOrgSyncService(coordinator);

    await expect(scheduled.runScheduled()).resolves.toBeUndefined();
    expect(runAll).toHaveBeenCalledWith('scheduled', null);
  });
});
