import { OrgSyncCoordinator } from './org-sync-coordinator';
import { OrgSyncService, SyncInProgressError } from './org-sync.service';
import { OrgSyncStore, SyncResult, SyncRunSummary } from './org-sync.types';

/**
 * 多公司同步協調層（B 階段）。
 *  - 依序呼叫每個 OrgSyncService 實例；順序與建構時清單順序一致。
 *  - 單一公司失敗（含互斥 SyncInProgressError）→ 該筆為合成 failed 結果，不中斷其餘公司。
 *  - recentRuns 純委派 store（跨全部公司）。
 */

function fakeService(compid: string, result: SyncResult | Error): OrgSyncService {
  const run = jest.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  return { run, getCompid: () => compid } as unknown as OrgSyncService;
}

function okResult(compid: string): SyncResult {
  return {
    runId: `run-${compid}`,
    compid,
    triggerType: 'manual',
    status: 'success',
    changeCount: 1,
    stats: {
      departmentsRead: 1,
      orgCreated: 0,
      orgUpdated: 0,
      accountsRead: 1,
      accountsCreated: 0,
      accountsUpdated: 1,
      accountsDisabled: 0,
      orphanWarnings: 0,
      dirtyRows: 0,
      disappearedCount: 0,
      disappearedRatio: 0,
    },
    warnings: [],
  };
}

describe('OrgSyncCoordinator.runAll', () => {
  it('依序呼叫每家公司之 run()，回傳順序與建構清單一致', async () => {
    const asR = okResult('AS');
    const adR = okResult('AD');
    const svcAS = fakeService('AS', asR);
    const svcAD = fakeService('AD', adR);
    const coordinator = new OrgSyncCoordinator([svcAS, svcAD], {} as OrgSyncStore);

    const results = await coordinator.runAll('manual', 'admin1');

    expect(results).toEqual([asR, adR]);
    expect(svcAS.run).toHaveBeenCalledWith('manual', 'admin1', {});
    expect(svcAD.run).toHaveBeenCalledWith('manual', 'admin1', {});
  });

  it('🔴 A 公司互斥中（SyncInProgressError）→ 該筆合成 SYNC_IN_PROGRESS 失敗，B 公司照常執行', async () => {
    const svcAS = fakeService('AS', new SyncInProgressError());
    const bdResult = okResult('AD');
    const svcAD = fakeService('AD', bdResult);
    const coordinator = new OrgSyncCoordinator([svcAS, svcAD], {} as OrgSyncStore);

    const results = await coordinator.runAll('scheduled', null);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ compid: 'AS', status: 'failed', errorCode: 'SYNC_IN_PROGRESS' });
    expect(results[1]).toEqual(bdResult); // B 公司未受影響，正常回傳
    expect(svcAD.run).toHaveBeenCalledTimes(1); // 確實有被呼叫，非跳過
  });

  it('未預期例外（非 SyncInProgressError）→ errorCode 為 COORDINATOR_UNEXPECTED_ERROR', async () => {
    const svc = fakeService('AJ', new Error('ECONNREFUSED'));
    const coordinator = new OrgSyncCoordinator([svc], {} as OrgSyncStore);

    const results = await coordinator.runAll('manual', 'admin1');

    expect(results[0]).toMatchObject({
      compid: 'AJ',
      status: 'failed',
      errorCode: 'COORDINATOR_UNEXPECTED_ERROR',
      errorMessage: 'ECONNREFUSED',
    });
  });

  it('fullResync 選項逐一透傳給每個公司之 run()', async () => {
    const svcAS = fakeService('AS', okResult('AS'));
    const coordinator = new OrgSyncCoordinator([svcAS], {} as OrgSyncStore);

    await coordinator.runAll('manual', 'admin1', { fullResync: true });

    expect(svcAS.run).toHaveBeenCalledWith('manual', 'admin1', { fullResync: true });
  });

  /**
   * 🔵 2026-08-31 delta：`onlyCompid` 使畫面之「本次仍要套用」只重跑被跳過的那一家。
   * 不限縮的話，無上限的放行值會一併套到其餘公司——它們早已套用過，沒有理由陪著暴露。
   */
  describe('onlyCompid（一次性放行之公司限縮）', () => {
    it('只跑指定公司，其餘公司之 run() 完全未被呼叫', async () => {
      const svcAS = fakeService('AS', okResult('AS'));
      const svcAD = fakeService('AD', okResult('AD'));
      const coordinator = new OrgSyncCoordinator([svcAS, svcAD], {} as OrgSyncStore);

      const results = await coordinator.runAll('manual', 'admin1', {
        applyRoleDerivation: true,
        onlyCompid: 'AD',
      });

      expect(svcAS.run).not.toHaveBeenCalled();
      expect(svcAD.run).toHaveBeenCalledWith('manual', 'admin1', {
        applyRoleDerivation: true,
      });
      expect(results.map((r) => r.compid)).toEqual(['AD']);
    });

    it('🔴 onlyCompid 不得洩漏進 run() 之選項（那是協調層的事，不是引擎的事）', async () => {
      const svcAS = fakeService('AS', okResult('AS'));
      const coordinator = new OrgSyncCoordinator([svcAS], {} as OrgSyncStore);

      await coordinator.runAll('manual', 'admin1', { onlyCompid: 'AS' });

      expect(svcAS.run).toHaveBeenCalledWith('manual', 'admin1', {});
    });

    it('指定不存在之公司 → 回空陣列（呼叫端據以回 400，不誤跑全部）', async () => {
      const svcAS = fakeService('AS', okResult('AS'));
      const coordinator = new OrgSyncCoordinator([svcAS], {} as OrgSyncStore);

      await expect(
        coordinator.runAll('manual', 'admin1', { onlyCompid: 'ZZ' }),
      ).resolves.toEqual([]);
      expect(svcAS.run).not.toHaveBeenCalled();
    });
  });

  it('空公司清單 → 回傳空陣列（不拋錯）', async () => {
    const coordinator = new OrgSyncCoordinator([], {} as OrgSyncStore);
    await expect(coordinator.runAll('manual', null)).resolves.toEqual([]);
  });
});

describe('OrgSyncCoordinator.recentRuns', () => {
  it('純委派 store.listRecentRuns（跨全部公司），limit 經 clampRunsLimit 正規化', async () => {
    const sample: SyncRunSummary[] = [
      {
        id: 'r1',
        compid: 'AS',
        triggerType: 'scheduled',
        status: 'success',
        startedAt: new Date('2026-08-24T02:00:00Z'),
        endedAt: new Date('2026-08-24T02:01:00Z'),
        changeCount: 3,
        errorCode: null,
        errorMessage: null,
        roleDerivationSkipped: false,
        roleChangeCount: null,
        roleDerivationBase: null,
      },
    ];
    const listRecentRuns = jest.fn().mockResolvedValue(sample);
    const store = { listRecentRuns } as unknown as OrgSyncStore;
    const coordinator = new OrgSyncCoordinator([], store);

    const res = await coordinator.recentRuns(50);

    expect(listRecentRuns).toHaveBeenCalledWith(50);
    expect(res).toBe(sample);
  });

  it('未帶 limit → 以預設值下推（與 OrgSyncService.recentRuns 之 clampRunsLimit 邏輯一致）', async () => {
    const listRecentRuns = jest.fn().mockResolvedValue([]);
    const store = { listRecentRuns } as unknown as OrgSyncStore;
    const coordinator = new OrgSyncCoordinator([], store);

    await coordinator.recentRuns(undefined);

    expect(listRecentRuns).toHaveBeenCalledWith(20); // clampRunsLimit 預設值
  });
});
