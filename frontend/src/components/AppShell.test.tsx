import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

vi.mock('../auth/useAuth');

function mockAuth(roleCode: string, logout = vi.fn()) {
  const user: SessionUser = {
    loginId: 'AS22455',
    email: 'peter@hfcfinance.com.tw',
    companyCode: 'AS',
    roleCode,
  };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout,
  });
  return { user, logout };
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AppShell />
    </MemoryRouter>,
  );
}

describe('AppShell — 後台外殼側欄角色過濾（F002）', () => {
  beforeEach(() => vi.resetAllMocks());

  it('SysAdmin 側欄顯示全部 9 項功能', () => {
    mockAuth('SysAdmin');
    renderShell();
    const nav = screen.getByRole('navigation', { name: '功能選單' });
    for (const label of [
      '帳號管理', '循環管理', 'ICSOP 文件管理', '使用表單管理', '文件索引管理',
      '文件調閱歷程', '文件變更歷程', '組織人員異動管理', '系統參數設定',
    ]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
  });

  it('Supervisor 側欄僅顯示循環管理與 ICSOP 文件管理', () => {
    mockAuth('Supervisor');
    renderShell();
    const nav = screen.getByRole('navigation', { name: '功能選單' });
    expect(within(nav).getByText('循環管理')).toBeInTheDocument();
    expect(within(nav).getByText('ICSOP 文件管理')).toBeInTheDocument();
    expect(within(nav).queryByText('帳號管理')).not.toBeInTheDocument();
    expect(within(nav).queryByText('組織人員異動管理')).not.toBeInTheDocument();
  });

  it('頂欄顯示登入者與角色徽章', () => {
    mockAuth('ICSOPAdmin');
    renderShell();
    expect(screen.getByText('AS22455')).toBeInTheDocument();
    expect(screen.getByText('ICSOP 管理員')).toBeInTheDocument();
  });

  it('點登出呼叫 logout', async () => {
    const { logout } = mockAuth('SysAdmin');
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(logout).toHaveBeenCalledOnce();
  });
});

describe('AppShell — 瀏覽文件網頁入口以新視窗開啟（F022）', () => {
  beforeEach(() => vi.resetAllMocks());

  it('TS-F022-001/003 點入口 → window.open("/public","_blank")，URL 不夾帶 token', async () => {
    mockAuth('SysAdmin');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: /瀏覽文件網頁/ }));
    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target] = openSpy.mock.calls[0];
    expect(url).toBe('/public');
    expect(target).toBe('_blank');
    expect(String(url)).not.toMatch(/token|session|\?/);
    openSpy.mockRestore();
  });

  it('TS-F022-002 入口為 button（非 <a href="/public">）→ 不觸發同分頁 SPA 導覽', () => {
    mockAuth('SysAdmin');
    renderShell();
    const entry = screen.getByRole('button', { name: /瀏覽文件網頁/ });
    expect(entry.tagName).toBe('BUTTON');
    expect(entry).not.toHaveAttribute('href');
  });

  it('TS-F022-004 window.open 回傳 null（被封鎖）→ 顯示替代提示', async () => {
    mockAuth('SysAdmin');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: /瀏覽文件網頁/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('請允許彈出視窗');
    openSpy.mockRestore();
  });
});
