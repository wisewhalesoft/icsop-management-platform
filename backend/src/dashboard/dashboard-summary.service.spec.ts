import {
  DashboardSummaryService,
  DashboardCountProviders,
} from './dashboard-summary.service';

function providers(
  over: Partial<Record<keyof DashboardCountProviders, () => Promise<number>>> = {},
): DashboardCountProviders {
  const n = (v: number) => () => Promise.resolve(v);
  return {
    pendingOrgChanges: n(3),
    unassignedDocs: n(1),
    disabledAccounts: n(1),
    accessLast7Days: n(48),
    pendingPublish: n(2),
    ...over,
  };
}

describe('DashboardSummaryService (GAP-07-1 儀表板 KPI)', () => {
  it('彙總 5 項真實計數為 summary', async () => {
    const svc = new DashboardSummaryService(providers());
    expect(await svc.getSummary()).toEqual({
      pendingOrgChanges: 3,
      unassignedDocs: 1,
      disabledAccounts: 1,
      accessLast7Days: 48,
      pendingPublish: 2,
    });
  });

  it('單一 provider 拋錯 → 該計數降為 0，其餘不受影響（不使儀表板崩潰）', async () => {
    const svc = new DashboardSummaryService(
      providers({ accessLast7Days: () => Promise.reject(new Error('AUDIT_IO')) }),
    );
    const s = await svc.getSummary();
    expect(s.accessLast7Days).toBe(0);
    expect(s.pendingOrgChanges).toBe(3);
    expect(s.pendingPublish).toBe(2);
  });

  it('負數/NaN provider → 0（防禦）', async () => {
    const svc = new DashboardSummaryService(
      providers({
        unassignedDocs: () => Promise.resolve(-5),
        disabledAccounts: () => Promise.resolve(NaN),
      }),
    );
    const s = await svc.getSummary();
    expect(s.unassignedDocs).toBe(0);
    expect(s.disabledAccounts).toBe(0);
  });
});
