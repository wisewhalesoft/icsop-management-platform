import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleLanding } from './RoleLanding';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const renderLanding = () =>
  render(<MemoryRouter><RoleLanding /></MemoryRouter>);

describe('RoleLanding — 登入後角色分流（F002）', () => {
  beforeEach(() => vi.resetAllMocks());

  it('管理類角色顯示「前台瀏覽 / 管理後台」兩張選擇卡', () => {
    mockAuth('ICSOPAdmin');
    renderLanding();
    expect(screen.getByRole('link', { name: /管理後台/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /前台瀏覽/ })).toBeInTheDocument();
  });

  it('顯示登入者角色徽章', () => {
    mockAuth('SysAdmin');
    renderLanding();
    expect(screen.getByText('系統管理員')).toBeInTheDocument();
  });

  it('一般使用者不顯示管理後台卡，僅顯示前往前台瀏覽', () => {
    mockAuth('User');
    renderLanding();
    expect(screen.queryByRole('link', { name: /管理後台/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /前往前台瀏覽/ })).toBeInTheDocument();
  });
});
