import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OrgSyncPage } from './OrgSyncPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type {
  SessionUser,
  SyncRunSummary,
  SyncResult,
  OrgChangeAlertView,
  OrgSyncMonthlySummary,
} from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const RUNS: SyncRunSummary[] = [
  { id: 'r1', triggerType: 'scheduled', status: 'success', startedAt: '2026-07-15T22:00:00.000Z', endedAt: '2026-07-15T22:00:12.000Z', changeCount: 12, errorCode: null, errorMessage: null },
  { id: 'r0', triggerType: 'manual', status: 'failed', startedAt: '2026-07-14T06:22:03.000Z', endedAt: '2026-07-14T06:22:03.000Z', changeCount: 0, errorCode: 'SYNC_SOURCE_UNAVAILABLE', errorMessage: '組織來源 View 連線逾時' },
];

const OK_RESULT: SyncResult = {
  runId: 'r2', triggerType: 'manual', status: 'success', changeCount: 7,
  stats: { departmentsRead: 303, orgCreated: 0, orgUpdated: 0, accountsRead: 1114, accountsCreated: 0, accountsUpdated: 7, accountsDisabled: 0, orphanWarnings: 0, dirtyRows: 0, disappearedCount: 0, disappearedRatio: 0 },
  warnings: [],
};

const SUMMARY: OrgSyncMonthlySummary = {
  month: '2026-07',
  newPersonCount: 18,
  updatedCount: 31,
  departedDisabledCount: 4,
  pendingChiefAlertCount: 3,
};

function docAlert(over: Partial<OrgChangeAlertView> = {}): OrgChangeAlertView {
  return {
    id: 'a1',
    alertKind: 'DOCUMENT_FIELD',
    documentId: 'doc-123',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    affectedField: '當責室長-主要',
    beforeValue: '陳彥廷（企劃部 車輛行銷室 室長）',
    afterValue: '（已轉調 作業服務部 客服室）',
    personEmployeeNo: null,
    personName: null,
    deptOrgCode: null,
    deptName: null,
    deptCloseDate: null,
    status: 'pending',
    resolutionKind: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: '2026-07-20T00:00:00.000Z',
    sourceSyncRunId: 'r1',
    ...over,
  };
}

function personAlert(over: Partial<OrgChangeAlertView> = {}): OrgChangeAlertView {
  return {
    ...docAlert(),
    id: 'a3',
    alertKind: 'CLOSED_DEPT_PERSON',
    documentId: null,
    documentNumber: null,
    documentName: null,
    affectedField: null,
    beforeValue: null,
    afterValue: null,
    personEmployeeNo: 'E777',
    personName: '林小美',
    deptOrgCode: 'JAD00',
    deptName: '已裁撤室',
    deptCloseDate: '2026-03-31T00:00:00.000Z',
    ...over,
  };
}

const THREE_ALERTS = [
  docAlert(),
  docAlert({ id: 'a2', documentId: 'doc-456', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '消金審核作業', affectedField: '制定室別', beforeValue: '信用審查部 企金室', afterValue: '信用審查部 企業金融室' }),
  personAlert(),
];

const renderPage = () => render(<MemoryRouter><OrgSyncPage /></MemoryRouter>);

/** 切至指定頁籤（頁籤列為 prototype 之三分頁結構）。 */
async function switchTab(name: RegExp | string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name }));
}

describe('OrgSyncPage — 同步狀態/歷史（US-011 回歸，移入頁籤後）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigateMock.mockReset();
    vi.mocked(endpoints.getOrgSyncRuns).mockResolvedValue(RUNS);
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue([]);
    vi.mocked(endpoints.getOrgSyncMonthlySummary).mockResolvedValue(SUMMARY);
  });

  it('TS-F006-062 切至「同步歷史」頁籤 → 顯示既有歷史表（結果/異動筆數），其他頁籤內容隱藏', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '同步歷史' })).toBeInTheDocument());

    await switchTab('同步歷史');

    // 狀態卡亦顯示「結果：成功」（prototype 同），故歷史表之斷言限縮於表格內。
    const table = within(screen.getByRole('table'));
    expect(table.getByText('成功')).toBeInTheDocument();
    expect(table.getByText('失敗')).toBeInTheDocument();
    expect(table.getByText('12')).toBeInTheDocument();
    // 既有欄位維持不變
    for (const col of ['開始時間', '結束時間', '觸發方式', '結果', '異動筆數']) {
      expect(screen.getByText(col)).toBeInTheDocument();
    }
    // 總覽 KPI 與待確認清單不可見
    expect(screen.queryByText('新增人員')).not.toBeInTheDocument();
    expect(screen.queryByText('目前無待確認組織異動')).not.toBeInTheDocument();
  });

  it('SysAdmin 顯示「立即同步」按鈕', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /立即同步/ })).toBeInTheDocument(),
    );
  });

  it('ICSOPAdmin 為唯讀：無觸發按鈕、顯示唯讀說明', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText(/唯讀模式/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /立即同步/ })).not.toBeInTheDocument();
  });

  it('點「立即同步」→ 呼叫 triggerOrgSync 並重新載入清單', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.triggerOrgSync).mockResolvedValue(OK_RESULT);
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /立即同步/ })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /立即同步/ }));

    await waitFor(() => expect(endpoints.triggerOrgSync).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(vi.mocked(endpoints.getOrgSyncRuns).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  it('觸發時後端 409 SYNC_IN_PROGRESS → 顯示提示', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.triggerOrgSync).mockRejectedValue(new ApiError(409, 'SYNC_IN_PROGRESS'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /立即同步/ })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /立即同步/ }));

    await waitFor(() => expect(screen.getByText(/進行中/)).toBeInTheDocument());
  });

  it('TS-F006-064 同步狀態卡位於頁籤列之外：切換頁籤後仍持續可見', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText(/最近同步：/)).toBeInTheDocument());
    // prototype 狀態卡：最近同步時間 + 觸發方式/結果/異動筆數
    expect(screen.getByText(/觸發方式：/)).toBeInTheDocument();

    await switchTab('待確認異動');
    expect(screen.getByText(/最近同步：/)).toBeInTheDocument();
    await switchTab('同步歷史');
    expect(screen.getByText(/最近同步：/)).toBeInTheDocument();
  });
});

describe('OrgSyncPage — 頁籤列與總覽 KPI（F006）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigateMock.mockReset();
    vi.mocked(endpoints.getOrgSyncRuns).mockResolvedValue(RUNS);
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue(THREE_ALERTS);
    vi.mocked(endpoints.getOrgSyncMonthlySummary).mockResolvedValue(SUMMARY);
  });

  it('TS-F006-059 三個頁籤且預設 active 為「總覽」（border-primary-600 text-primary-700）', async () => {
    mockAuth('SysAdmin');
    renderPage();

    const overview = await screen.findByRole('button', { name: '總覽' });
    expect(screen.getByRole('button', { name: '同步歷史' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /待確認異動/ })).toBeInTheDocument();

    expect(overview.className).toContain('border-primary-600');
    expect(overview.className).toContain('text-primary-700');
    expect(screen.getByRole('button', { name: '同步歷史' }).className).toContain(
      'border-transparent',
    );
  });

  it('TS-F006-060 「待確認異動」頁籤旁 amber 徽章＝pending 總數', async () => {
    mockAuth('SysAdmin');
    renderPage();

    const tab = await screen.findByRole('button', { name: /待確認異動/ });
    const badge = await within(tab).findByText('3');
    expect(badge.className).toContain('bg-amber-100');
    expect(badge.className).toContain('text-amber-700');
  });

  it('TS-F006-061 pending 為 0 → 徽章不可見', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue([]);
    renderPage();

    const tab = await screen.findByRole('button', { name: /待確認異動/ });
    await waitFor(() => expect(endpoints.getOrgChangeAlerts).toHaveBeenCalled());
    expect(tab.textContent?.trim()).toBe('待確認異動');
  });

  it('TS-F006-063 總覽渲染 4 張 KPI 卡與 prototype 逐字文案', async () => {
    mockAuth('SysAdmin');
    renderPage();

    await waitFor(() => expect(screen.getByText('新增人員')).toBeInTheDocument());
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('更新（部門/職級）')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText('離職停用')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('當責待確認')).toBeInTheDocument();
    expect(
      screen.getByText('本月（2026-07）累計異動分類統計。離職類異動已連動自動停用對應帳號（F005）。'),
    ).toBeInTheDocument();
  });

  it('TS-F006-075 KPI 查詢失敗（500）→ 總覽降級提示、其他頁籤不受影響', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getOrgSyncMonthlySummary).mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR'),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText(/統計資料暫時無法載入/)).toBeInTheDocument());
    // 不外露技術性錯誤碼
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();

    await switchTab('同步歷史');
    expect(within(screen.getByRole('table')).getByText('成功')).toBeInTheDocument();
    await switchTab(/待確認異動/);
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
  });
});

describe('OrgSyncPage — 待確認異動清單（F006）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigateMock.mockReset();
    vi.mocked(endpoints.getOrgSyncRuns).mockResolvedValue(RUNS);
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue(THREE_ALERTS);
    vi.mocked(endpoints.getOrgSyncMonthlySummary).mockResolvedValue(SUMMARY);
  });

  it('TS-F006-065 DOCUMENT_FIELD 卡片：文件編號/名稱/待確認 pill/受影響欄位/before→after', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await switchTab(/待確認異動/);

    expect(await screen.findByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
    expect(screen.getAllByText('待確認').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('當責室長-主要')).toBeInTheDocument();
    const before = screen.getByText('陳彥廷（企劃部 車輛行銷室 室長）');
    expect(before.className).toContain('line-through');
    const after = screen.getByText('（已轉調 作業服務部 客服室）');
    expect(after.className).toContain('border-amber-200');
    // prototype 卡片註記（非強制提示）
    expect(
      screen.getAllByText('提示為非強制，文件狀態與當責設定在人工處理前維持不變。').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('TS-F006-066 CLOSED_DEPT_PERSON 卡片：人員/部門/關閉日期，且無 before-after 差異區塊', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue([personAlert()]);
    renderPage();
    await switchTab(/待確認異動/);

    expect(await screen.findByText('E777')).toBeInTheDocument();
    expect(screen.getByText(/林小美/)).toBeInTheDocument();
    expect(screen.getByText(/已裁撤室/)).toBeInTheDocument();
    expect(screen.getByText(/JAD00/)).toBeInTheDocument();
    expect(screen.getByText(/2026-03-31/)).toBeInTheDocument();
    expect(screen.getByText('掛於已關閉部門')).toBeInTheDocument();
  });

  it('TS-F006-070 CLOSED_DEPT_PERSON 卡片不提供「前往當責設定」（無關聯文件）', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue([personAlert()]);
    renderPage();
    await switchTab(/待確認異動/);

    expect(await screen.findByRole('button', { name: /標記無需變更/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /前往當責設定/ })).not.toBeInTheDocument();
  });

  it('TS-F006-069 點「前往當責設定」→ 導向 /admin/documents/:id/edit', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue([docAlert()]);
    renderPage();
    await switchTab(/待確認異動/);

    await userEvent.click(await screen.findByRole('button', { name: /前往當責設定/ }));

    expect(navigateMock).toHaveBeenCalledWith('/admin/documents/doc-123/edit');
  });

  it('TS-F006-067／068 ICSOPAdmin（唯讀）→ 兩顆寫入按鈕皆不存在於 DOM', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await switchTab(/待確認異動/);

    expect(await screen.findByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /前往當責設定/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /標記無需變更/ })).not.toBeInTheDocument();
  });

  it('TS-F006-071 點「標記無需變更」→ 呼叫 resolve API、卡片自清單移除、顯示成功提示', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue([docAlert()]);
    vi.mocked(endpoints.resolveOrgChangeAlert).mockResolvedValue({
      ...docAlert(),
      status: 'resolved',
      resolutionKind: 'NO_CHANGE_NEEDED',
    });
    renderPage();
    await switchTab(/待確認異動/);

    await userEvent.click(await screen.findByRole('button', { name: /標記無需變更/ }));

    await waitFor(() => expect(endpoints.resolveOrgChangeAlert).toHaveBeenCalledWith('a1'));
    await waitFor(() =>
      expect(screen.queryByText('ICSOP-SRC-101-1-01')).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/已標記處理完成/)).toBeInTheDocument();
    // 移除後恢復空狀態
    expect(screen.getByText('目前無待確認組織異動')).toBeInTheDocument();
  });

  it('resolve 失敗（409 已處理）→ 顯示錯誤提示且卡片保留', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue([docAlert()]);
    vi.mocked(endpoints.resolveOrgChangeAlert).mockRejectedValue(
      new ApiError(409, 'ALERT_ALREADY_RESOLVED'),
    );
    renderPage();
    await switchTab(/待確認異動/);

    await userEvent.click(await screen.findByRole('button', { name: /標記無需變更/ }));

    await waitFor(() => expect(screen.getByText(/ALERT_ALREADY_RESOLVED/)).toBeInTheDocument());
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
  });

  it('TS-F006-072 無 pending → 空狀態文案（逐字比對 prototype）', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue([]);
    renderPage();
    await switchTab(/待確認異動/);

    expect(await screen.findByText('目前無待確認組織異動')).toBeInTheDocument();
  });
});

describe('OrgSyncPage — RBAC 前端守門（F006）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigateMock.mockReset();
    vi.mocked(endpoints.getOrgSyncRuns).mockResolvedValue(RUNS);
    vi.mocked(endpoints.getOrgChangeAlerts).mockResolvedValue(THREE_ALERTS);
    vi.mocked(endpoints.getOrgSyncMonthlySummary).mockResolvedValue(SUMMARY);
  });

  it('TS-F006-073 ICSOPAdmin 唯讀橫幅（prototype 逐字文案）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();

    expect(
      await screen.findByText(
        /唯讀模式 · ICSOP 管理員可查看同步狀態與待確認異動，但無法觸發「立即同步」。/,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ['Supervisor', '主管對「組織人員異動管理」為「無」。'],
    ['DeptContact', '部門窗口對「組織人員異動管理」為「無」。'],
    ['User', '一般使用者無後台存取權。'],
  ])(
    'TS-F006-074 %s → 無權限畫面（prototype blockMsg 逐字），且不發出任何 F006 查詢',
    async (role, message) => {
      mockAuth(role);
      renderPage();

      expect(await screen.findByText('無組織同步管理權限')).toBeInTheDocument();
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.getByText(/PERMISSION_DENIED · 403/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '總覽' })).not.toBeInTheDocument();
      expect(endpoints.getOrgChangeAlerts).not.toHaveBeenCalled();
      expect(endpoints.getOrgSyncMonthlySummary).not.toHaveBeenCalled();
      expect(endpoints.getOrgSyncRuns).not.toHaveBeenCalled();
    },
  );
});
