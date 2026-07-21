import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountManagementPage } from './AccountManagementPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, AccountView } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const ROWS: AccountView[] = [
  { id: 'a1', loginId: '20233', employeeNo: null, name: '李慧玲', email: null, orgCode: null, roleCode: 'ICSOPAdmin', status: 'active', source: 'manual', disableReason: null },
  { id: 'a2', loginId: '22345', employeeNo: null, name: '王小明', email: null, orgCode: null, roleCode: 'User', status: 'active', source: 'upstream', disableReason: null },
];

describe('AccountManagementPage — F003 帳號與角色管理', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getAccounts).mockResolvedValue(ROWS);
  });

  it('載入後渲染帳號列（姓名/帳號/角色/來源）', async () => {
    mockAuth('SysAdmin');
    render(<AccountManagementPage />);
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    expect(screen.getByText('王小明')).toBeInTheDocument();
    expect(screen.getByText('22345')).toBeInTheDocument();
  });

  it('SysAdmin 顯示「建立帳號」與列操作', async () => {
    mockAuth('SysAdmin');
    render(<AccountManagementPage />);
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /建立帳號/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /指派角色/ }).length).toBeGreaterThan(0);
  });

  it('ICSOPAdmin 唯讀：無建立按鈕、無列操作、顯示唯讀說明', async () => {
    mockAuth('ICSOPAdmin');
    render(<AccountManagementPage />);
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /建立帳號/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /指派角色/ })).not.toBeInTheDocument();
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
  });

  it('建立帳號：填表送出 → 呼叫 createAccount 並重新載入', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.createAccount).mockResolvedValue(ROWS[0]);
    render(<AccountManagementPage />);
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /建立帳號/ }));
    const dialog = screen.getByRole('dialog', { name: /建立手動帳號/ });
    await userEvent.type(within(dialog).getByLabelText(/帳號/), '20500');
    await userEvent.type(within(dialog).getByLabelText(/初始密碼/), 'Init@2026');
    await userEvent.click(within(dialog).getByRole('button', { name: '建立' }));

    await waitFor(() =>
      expect(endpoints.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ loginId: '20500', password: 'Init@2026' }),
      ),
    );
  });

  it('指派角色：選新角色送出 → 呼叫 assignAccountRole', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.assignAccountRole).mockResolvedValue(ROWS[1]);
    render(<AccountManagementPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    // 王小明（a2, User）列的指派角色
    const row = screen.getByText('王小明').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /指派角色/ }));
    const dialog = screen.getByRole('dialog', { name: /指派角色/ });
    await userEvent.click(within(dialog).getByRole('radio', { name: /主管/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(endpoints.assignAccountRole).toHaveBeenCalledWith('a2', 'Supervisor'),
    );
  });

  it('停用帳號：確認後 → 呼叫 setAccountStatus(disabled)', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.setAccountStatus).mockResolvedValue({ ...ROWS[1], status: 'disabled' });
    render(<AccountManagementPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    const row = screen.getByText('王小明').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '停用' }));
    const dialog = screen.getByRole('dialog', { name: /停用帳號/ });
    await userEvent.click(within(dialog).getByRole('button', { name: /確認/ }));

    await waitFor(() =>
      expect(endpoints.setAccountStatus).toHaveBeenCalledWith('a2', 'disabled'),
    );
  });
});
