import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoleLanding } from './RoleLanding';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  const logout = vi.fn();
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout,
  });
  return { logout };
}

const renderLanding = () =>
  render(<MemoryRouter><RoleLanding /></MemoryRouter>);

/** 帶 `/public` 目的地之路由環境：導向類斷言需要一個可落地的替身頁。 */
const renderWithRoutes = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<RoleLanding />} />
        <Route path="/public" element={<div data-testid="public-stub" />} />
      </Routes>
    </MemoryRouter>,
  );

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

  /**
   * F002 `AC1`（2026-08-26 修復）：一般使用者**不經分流頁**，直接落在前台。
   *
   * 📝 已作廢（⚠ 不得復原）：OLD> `一般使用者不顯示管理後台卡，僅顯示前往前台瀏覽`——該測試把
   * 「只有一個選項的選擇畫面」釘成正確行為，與 F002 `AC1`「不顯示選擇畫面」直接牴觸；來源是
   * prototype 02 之 `#userDirect` 區塊被逐字移植。真人回報「很多餘」後改為導向。
   */
  it('一般使用者（含業務子分類）→ 直接導向 /public，不顯示任何選擇畫面', () => {
    mockAuth('User');
    renderWithRoutes();
    expect(screen.getByTestId('public-stub')).toBeInTheDocument();
    expect(screen.queryByText('登入成功，歡迎回來')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /前往前台瀏覽/ })).not.toBeInTheDocument();
  });

  it('管理類角色不被導向 /public，仍停在分流頁', () => {
    mockAuth('DeptContact');
    renderWithRoutes();
    expect(screen.queryByTestId('public-stub')).not.toBeInTheDocument();
    expect(screen.getByText('登入成功，歡迎回來')).toBeInTheDocument();
  });

  it('G-PUB-010 頂欄登出按鈕 → 呼叫 logout', async () => {
    const { logout } = mockAuth('ICSOPAdmin');
    renderLanding();
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(logout).toHaveBeenCalledOnce();
  });
});
