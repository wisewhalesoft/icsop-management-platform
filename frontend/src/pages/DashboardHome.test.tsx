import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardHome } from './DashboardHome';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { DashboardSummary, SessionUser } from '../api/types';

/**
 * GAP-07-1 儀表板 KPI 卡（prototype 07 之 TODOS 列，角色過濾）。
 * 真實計數來自 GET /admin/dashboard/summary；本頁不再省略 KPI 列（原刻意省略以避免虛構資料，
 * 現已接真實端點）。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardHome />
    </MemoryRouter>,
  );

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const SUMMARY: DashboardSummary = {
  pendingOrgChanges: 3,
  unassignedDocs: 1,
  disabledAccounts: 4,
  accessLast7Days: 48,
  pendingPublish: 2,
};

describe('DashboardHome — KPI 卡（GAP-07-1）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDashboardSummary).mockResolvedValue(SUMMARY);
  });

  it('ICSOPAdmin → 其 4 張 KPI 卡與真實計數；停用帳號待覆核（SysAdmin 專屬）不顯示', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const row = await screen.findByRole('group', { name: '待辦提示' });
    expect(within(row).getByText('待確認組織異動')).toBeInTheDocument();
    expect(within(row).getByText('未指派節點文件')).toBeInTheDocument();
    expect(within(row).getByText('調閱紀錄（近7日）')).toBeInTheDocument();
    expect(within(row).getByText('待公布的文件')).toBeInTheDocument();
    expect(within(row).queryByText('停用帳號待覆核')).not.toBeInTheDocument();
    // 真實計數（3 待確認組織異動、48 調閱、2 待公布）
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText('48')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
  });

  it('SysAdmin → 顯示停用帳號待覆核；不顯示未指派節點文件/待公布（角色過濾）', async () => {
    mockAuth('SysAdmin');
    renderPage();
    const row = await screen.findByRole('group', { name: '待辦提示' });
    expect(within(row).getByText('停用帳號待覆核')).toBeInTheDocument();
    expect(within(row).getByText('待確認組織異動')).toBeInTheDocument();
    expect(within(row).queryByText('未指派節點文件')).not.toBeInTheDocument();
    expect(within(row).queryByText('待公布的文件')).not.toBeInTheDocument();
  });
});
