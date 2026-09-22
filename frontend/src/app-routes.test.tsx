import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App';
import { ToastProvider } from './components/useToast';
import * as authHook from './auth/useAuth';
import type { AuthStatus } from './auth/useAuth';
import type { SessionUser } from './api/types';

vi.mock('./auth/useAuth');

function mockAuth(status: AuthStatus, roleCode?: string) {
  const user: SessionUser | null = roleCode
    ? { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode }
    : null;
  vi.mocked(authHook.useAuth).mockReturnValue({
    status, user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const renderAt = (path: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </ToastProvider>,
  );

describe('AppRoutes — auth gating 與角色分流（F001/F002）', () => {
  beforeEach(() => vi.resetAllMocks());

  it('loading → 顯示載入中', () => {
    mockAuth('loading');
    renderAt('/');
    expect(screen.getByRole('status')).toHaveTextContent('載入');
  });

  it('unauthenticated → 顯示登入頁（公司帳號登入）', () => {
    mockAuth('unauthenticated');
    renderAt('/');
    expect(screen.getByRole('button', { name: /公司帳號登入/ })).toBeInTheDocument();
  });

  /**
   * UX16 delta `AC-UX5` ②：既有絕對值鎖之就地改寫（預期轉紅，非回歸）——卡片標題已由
   * 「管理後台」改為「管理平台」（`AC-UX2`），且 `AC-UX5` ① 要求精確 aria-label 比對。
   * 📝 已作廢（⚠ 不得復原）：`OLD>` `getByRole('link', { name: /管理後台/ })`。
   */
  it('已登入管理角色於 / → 角色分流頁（顯示管理平台卡，AC-UX5②）', () => {
    mockAuth('authenticated', 'ICSOPAdmin');
    renderAt('/');
    expect(screen.getByRole('link', { name: '管理平台' })).toBeInTheDocument();
  });

  it('已登入於 /admin → 後台外殼（功能選單）', () => {
    mockAuth('authenticated', 'SysAdmin');
    renderAt('/admin');
    expect(screen.getByRole('navigation', { name: '功能選單' })).toBeInTheDocument();
  });
});
