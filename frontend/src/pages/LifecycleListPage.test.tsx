import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LifecycleListPage } from './LifecycleListPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type { SessionUser, LifecycleView } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 7, updatedAt: '2026-06-18T07:02:00.000Z' },
  { id: 'lc2', name: '採購及付款循環', description: null, status: 'inactive', nodeCount: 1, updatedAt: '2026-05-05T02:20:00.000Z' },
];

const renderPage = () =>
  render(<MemoryRouter><LifecycleListPage /></MemoryRouter>);

describe('LifecycleListPage — F007 循環池', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  });

  it('載入後渲染循環列（名稱、節點數）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    expect(screen.getByText('採購及付款循環')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('ICSOPAdmin 顯示新增與列操作', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /新增循環/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '編輯' }).length).toBeGreaterThan(0);
  });

  it('Supervisor 唯讀：無新增、無編輯、顯示唯讀說明', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /新增循環/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '編輯' })).not.toBeInTheDocument();
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
  });

  it('新增循環：填名稱送出 → createLifecycle', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createLifecycle).mockResolvedValue(LCS[0]);
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /新增循環/ }));
    const dialog = screen.getByRole('dialog', { name: /新增循環/ });
    await userEvent.type(within(dialog).getByLabelText(/循環名稱/), '融資循環');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(endpoints.createLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ name: '融資循環' }),
      ),
    );
  });

  it('名稱空白 → 前端擋下、不呼叫 createLifecycle', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /新增循環/ }));
    const dialog = screen.getByRole('dialog', { name: /新增循環/ });
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(endpoints.createLifecycle).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/名稱不可為空/)).toBeInTheDocument();
  });

  it('刪除仍有掛載 → 顯示 LIFECYCLE_HAS_DOCUMENTS 提示', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.deleteLifecycle).mockRejectedValue(new ApiError(409, 'LIFECYCLE_HAS_DOCUMENTS'));
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());

    const row = screen.getByText('銷售及收款循環').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '刪除' }));
    const dialog = screen.getByRole('dialog', { name: /刪除循環/ });
    await userEvent.click(within(dialog).getByRole('button', { name: /確認/ }));

    await waitFor(() => expect(screen.getByText(/需先解除全部/)).toBeInTheDocument());
  });

  it('停用切換 → setLifecycleStatus', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.setLifecycleStatus).mockResolvedValue({ ...LCS[0], status: 'inactive' });
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());

    const row = screen.getByText('銷售及收款循環').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '停用' }));
    await waitFor(() => expect(endpoints.setLifecycleStatus).toHaveBeenCalledWith('lc1', 'inactive'));
  });
});
