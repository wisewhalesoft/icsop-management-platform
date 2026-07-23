import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type { SessionUser } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const refresh = vi.fn();
const login = vi.fn();

function mockAuth(): void {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'unauthenticated',
    user: null,
    error: null,
    refresh,
    login,
    logout: vi.fn(),
  });
}

const USER: SessionUser = {
  loginId: 'mgr01',
  email: '',
  companyCode: 'AS',
  roleCode: 'ICSOPAdmin',
};

describe('LoginPage — 途徑 B 帳密登入（F001）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
  });

  it('保留途徑 A：顯示公司帳號登入按鈕，點擊呼叫 SSO login', async () => {
    render(<LoginPage />);
    const ssoBtn = screen.getByRole('button', { name: /使用公司帳號登入/ });
    await userEvent.click(ssoBtn);
    expect(login).toHaveBeenCalled();
  });

  it('展開管理員帳密表單 → 填帳號密碼送出 → 呼叫 passwordLogin 並刷新 session', async () => {
    vi.mocked(endpoints.passwordLogin).mockResolvedValue(USER);
    render(<LoginPage />);

    await userEvent.click(screen.getByRole('button', { name: /使用管理員帳號登入/ }));
    await userEvent.type(screen.getByLabelText(/帳號/), 'mgr01');
    await userEvent.type(screen.getByLabelText(/密碼/), 'S3cret!');
    await userEvent.click(screen.getByRole('button', { name: /以管理員帳號登入/ }));

    await waitFor(() =>
      expect(endpoints.passwordLogin).toHaveBeenCalledWith({
        loginId: 'mgr01',
        password: 'S3cret!',
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('帳密錯誤（401 AUTH_INVALID_CREDENTIALS）→ 顯示統一錯誤訊息，不刷新 session', async () => {
    vi.mocked(endpoints.passwordLogin).mockRejectedValue(
      new ApiError(401, 'AUTH_INVALID_CREDENTIALS'),
    );
    render(<LoginPage />);

    await userEvent.click(screen.getByRole('button', { name: /使用管理員帳號登入/ }));
    await userEvent.type(screen.getByLabelText(/帳號/), 'mgr01');
    await userEvent.type(screen.getByLabelText(/密碼/), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /以管理員帳號登入/ }));

    await waitFor(() =>
      expect(screen.getByText(/帳號或密碼錯誤/)).toBeInTheDocument(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('帳號或密碼未填 → 送出鈕停用（不呼叫後端）', async () => {
    render(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: /使用管理員帳號登入/ }));
    const submit = screen.getByRole('button', { name: /以管理員帳號登入/ });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/帳號/), 'mgr01');
    expect(submit).toBeDisabled(); // 只填帳號仍停用
  });
});
