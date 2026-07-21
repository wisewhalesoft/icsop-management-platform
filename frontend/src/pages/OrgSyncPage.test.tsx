import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrgSyncPage } from './OrgSyncPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type { SessionUser, SyncRunSummary, SyncResult } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

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

describe('OrgSyncPage — 組織同步（US-011，接真實端點）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getOrgSyncRuns).mockResolvedValue(RUNS);
  });

  it('載入後渲染同步歷史（結果與異動筆數）', async () => {
    mockAuth('SysAdmin');
    render(<OrgSyncPage />);
    await waitFor(() => expect(screen.getByText('成功')).toBeInTheDocument());
    expect(screen.getByText('失敗')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('SysAdmin 顯示「立即同步」按鈕', async () => {
    mockAuth('SysAdmin');
    render(<OrgSyncPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /立即同步/ })).toBeInTheDocument(),
    );
  });

  it('ICSOPAdmin 為唯讀：無觸發按鈕、顯示唯讀說明', async () => {
    mockAuth('ICSOPAdmin');
    render(<OrgSyncPage />);
    await waitFor(() => expect(screen.getByText('成功')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /立即同步/ })).not.toBeInTheDocument();
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
  });

  it('點「立即同步」→ 呼叫 triggerOrgSync 並重新載入清單', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.triggerOrgSync).mockResolvedValue(OK_RESULT);
    render(<OrgSyncPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /立即同步/ })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /立即同步/ }));

    await waitFor(() => expect(endpoints.triggerOrgSync).toHaveBeenCalledOnce());
    // 觸發後重新載入（初次 + 觸發後至少各一次）
    await waitFor(() =>
      expect(vi.mocked(endpoints.getOrgSyncRuns).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  it('觸發時後端 409 SYNC_IN_PROGRESS → 顯示提示', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.triggerOrgSync).mockRejectedValue(new ApiError(409, 'SYNC_IN_PROGRESS'));
    render(<OrgSyncPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /立即同步/ })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /立即同步/ }));

    await waitFor(() => expect(screen.getByText(/進行中/)).toBeInTheDocument());
  });
});
