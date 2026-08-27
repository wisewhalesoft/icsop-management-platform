import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardHome } from './DashboardHome';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { DashboardActivityItem, DashboardSummary, SessionUser } from '../api/types';

/**
 * GAP-07-1 儀表板 KPI 卡（prototype 07 之 TODOS 列，角色過濾）。
 * 真實計數來自 GET /admin/dashboard/summary；本頁不再省略 KPI 列（原刻意省略以避免虛構資料，
 * 現已接真實端點）。
 * GAP-07-2 歡迎詞用姓名、GAP-07-4 最近活動區塊（GET /admin/dashboard/activity）亦於此守門。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardHome />
    </MemoryRouter>,
  );

function mockAuth(roleCode: string, over: Partial<SessionUser> = {}) {
  const user: SessionUser = {
    loginId: 'AS22455',
    email: 'x@y',
    companyCode: 'AS',
    roleCode,
    name: '游博丞',
    ...over,
  };
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

const ACTIVITY: DashboardActivityItem[] = [
  {
    id: 'doc:1',
    kind: 'DOCUMENT_CREATED',
    text: 'ICSOP-SRC-101-1-01 車輛分期進件作業 已建立',
    occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'sync:1',
    kind: 'ORG_SYNC_COMPLETED',
    text: '每日組織同步完成，異動 12 筆',
    occurredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
];

describe('DashboardHome — KPI 卡（GAP-07-1）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDashboardSummary).mockResolvedValue(SUMMARY);
    vi.mocked(endpoints.getDashboardActivity).mockResolvedValue(ACTIVITY);
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

describe('DashboardHome — 歡迎詞（GAP-07-2）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDashboardSummary).mockResolvedValue(SUMMARY);
    vi.mocked(endpoints.getDashboardActivity).mockResolvedValue(ACTIVITY);
  });

  it('顯示姓名而非帳號（prototype「歡迎回來，李慧玲」）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    expect(await screen.findByRole('heading', { name: '歡迎回來，游博丞' })).toBeInTheDocument();
    expect(screen.queryByText('AS22455')).not.toBeInTheDocument();
  });

  it('姓名缺漏（手動帳號未填）→ 退回顯示帳號，不出現空白歡迎詞', async () => {
    mockAuth('ICSOPAdmin', { name: null });
    renderPage();
    expect(await screen.findByRole('heading', { name: '歡迎回來，AS22455' })).toBeInTheDocument();
  });
});

describe('DashboardHome — 最近活動（GAP-07-4）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDashboardSummary).mockResolvedValue(SUMMARY);
    vi.mocked(endpoints.getDashboardActivity).mockResolvedValue(ACTIVITY);
  });

  it('渲染伺服端回傳之活動列（文字＋相對時間）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const list = await screen.findByRole('list', { name: '最近活動' });
    expect(within(list).getByText('ICSOP-SRC-101-1-01 車輛分期進件作業 已建立')).toBeInTheDocument();
    expect(within(list).getByText('每日組織同步完成，異動 12 筆')).toBeInTheDocument();
    expect(within(list).getByText('2 小時前')).toBeInTheDocument();
    expect(within(list).getByText('30 分鐘前')).toBeInTheDocument();
  });

  it('伺服端回空（該角色無可見來源）→ 空狀態，不隱藏整個區塊', async () => {
    vi.mocked(endpoints.getDashboardActivity).mockResolvedValue([]);
    mockAuth('DeptContact');
    renderPage();
    expect(await screen.findByText('目前無最近活動')).toBeInTheDocument();
  });

  it('端點失敗 → 空狀態且不阻斷儀表板（快速進入卡片仍在）', async () => {
    vi.mocked(endpoints.getDashboardActivity).mockRejectedValue(new Error('boom'));
    mockAuth('ICSOPAdmin');
    renderPage();
    expect(await screen.findByText('目前無最近活動')).toBeInTheDocument();
    expect(screen.getByText('快速進入功能區')).toBeInTheDocument();
  });
});
