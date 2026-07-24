import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { ToastProvider } from '../components/useToast';
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

/** 密碼輸入框查詢：以 selector 限縮，避免與眼睛切換鈕 aria-label「顯示密碼」衝突。 */
const passwordInput = () => screen.getByLabelText(/密碼/, { selector: 'input' });

/** 清 storage（jsdom 於此環境僅暴露 sessionStorage 為裸全域；localStorage 以 window 存取並防呆）。 */
function clearStorage(): void {
  try {
    window.localStorage?.clear();
  } catch {
    /* localStorage 不可用 → 忽略 */
  }
  try {
    window.sessionStorage?.clear();
  } catch {
    /* sessionStorage 不可用 → 忽略 */
  }
}

function renderLogin() {
  return render(
    <ToastProvider>
      <LoginPage />
    </ToastProvider>,
  );
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
    clearStorage();
    mockAuth();
  });

  it('保留途徑 A：顯示公司帳號登入按鈕，點擊呼叫 SSO login', async () => {
    renderLogin();
    const ssoBtn = screen.getByRole('button', { name: /使用公司帳號登入/ });
    await userEvent.click(ssoBtn);
    expect(login).toHaveBeenCalled();
  });

  it('展開管理員帳密表單 → 填帳號密碼送出 → 呼叫 passwordLogin 並刷新 session', async () => {
    vi.mocked(endpoints.passwordLogin).mockResolvedValue(USER);
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: /使用管理員帳號登入/ }));
    await userEvent.type(screen.getByLabelText(/帳號/), 'mgr01');
    await userEvent.type(passwordInput(), 'S3cret!');
    await userEvent.click(screen.getByRole('button', { name: /以管理員帳號登入/ }));

    await waitFor(() =>
      expect(endpoints.passwordLogin).toHaveBeenCalledWith({
        loginId: 'mgr01',
        password: 'S3cret!',
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('帳密錯誤（401 AUTH_INVALID_CREDENTIALS）→ 顯示統一錯誤訊息＋錯誤碼行，不刷新 session', async () => {
    vi.mocked(endpoints.passwordLogin).mockRejectedValue(
      new ApiError(401, 'AUTH_INVALID_CREDENTIALS'),
    );
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: /使用管理員帳號登入/ }));
    await userEvent.type(screen.getByLabelText(/帳號/), 'mgr01');
    await userEvent.type(passwordInput(), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /以管理員帳號登入/ }));

    await waitFor(() =>
      expect(screen.getByText(/帳號或密碼錯誤/)).toBeInTheDocument(),
    );
    // G-PUB-005：錯誤橫幅另呈現後端穩定錯誤碼（mono 行）。
    expect(screen.getByText('AUTH_INVALID_CREDENTIALS')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('登入嘗試過多（429 AUTH_TOO_MANY_ATTEMPTS）→ 顯示節流訊息，不刷新 session', async () => {
    vi.mocked(endpoints.passwordLogin).mockRejectedValue(
      new ApiError(429, 'AUTH_TOO_MANY_ATTEMPTS'),
    );
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: /使用管理員帳號登入/ }));
    await userEvent.type(screen.getByLabelText(/帳號/), 'mgr01');
    await userEvent.type(passwordInput(), 'S3cret!');
    await userEvent.click(screen.getByRole('button', { name: /以管理員帳號登入/ }));

    await waitFor(() =>
      expect(screen.getByText(/嘗試次數過多/)).toBeInTheDocument(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('帳號或密碼未填 → 送出鈕停用（不呼叫後端）', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /使用管理員帳號登入/ }));
    const submit = screen.getByRole('button', { name: /以管理員帳號登入/ });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/帳號/), 'mgr01');
    expect(submit).toBeDisabled(); // 只填帳號仍停用
  });

  it('G-PUB-001 密碼顯示/隱藏切換：預設 password，點眼睛鈕 → text，再點 → password', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /使用管理員帳號登入/ }));
    const pw = passwordInput() as HTMLInputElement;
    expect(pw.type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: '顯示密碼' }));
    expect(pw.type).toBe('text');
    await userEvent.click(screen.getByRole('button', { name: '隱藏密碼' }));
    expect(pw.type).toBe('password');
  });

  it('G-PUB-004 途徑 B 收合鈕具 aria-controls / aria-expanded（展開切換）', async () => {
    renderLogin();
    const toggle = screen.getByRole('button', { name: /使用管理員帳號登入/ });
    expect(toggle).toHaveAttribute('aria-controls', 'admin-panel');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('G-PUB-003 忘記密碼 → info toast 指引洽系統管理員（無死連結、無捏造路由）', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /使用管理員帳號登入/ }));
    await userEvent.click(screen.getByRole('link', { name: '忘記密碼？' }));
    expect(await screen.findByText(/請洽系統管理員/)).toBeInTheDocument();
  });
});

describe('LoginPage — 工作階段逾時模態（G-PUB-006）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearStorage();
    mockAuth();
  });

  it('無逾時旗標 → 不顯示逾時模態', () => {
    vi.mocked(authHook.consumeSessionExpired).mockReturnValue(false);
    renderLogin();
    expect(screen.queryByText('工作階段已逾時')).not.toBeInTheDocument();
  });

  it('逾時旗標為真 → 顯示逾時模態；點「重新登入」關閉', async () => {
    vi.mocked(authHook.consumeSessionExpired).mockReturnValue(true);
    renderLogin();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('工作階段已逾時')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新登入' }));
    expect(screen.queryByText('工作階段已逾時')).not.toBeInTheDocument();
  });
});
