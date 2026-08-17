import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { AppShell } from './AppShell';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

/**
 * L1 · F002 `AC-D1`／`AC-D2`／`AC-D4` — 後台返回首頁之兩種手段（缺失 delta 第 1 項）。
 *
 * 權威＝`docs/specs/features/F002-role-based-routing.md` `AC-D1`／`AC-D2`／`AC-D4`
 *      ＋ `prototypes/07-admin-shell.html`（側欄 logo `<a data-to="/admin" aria-label="回到後台首頁">`；
 *         `HOME_ITEM={id:'home',label:'首頁',icon:'layout-dashboard',route:'/admin'}` 為側欄第一項）。
 *
 * 🔴 手段為**兩種**（側欄「首頁」項＋側欄 logo），非三種——`AC-D3` 之就地改寫已查證
 *    「麵包屑首段可點回 /admin」於 14 個後台頁中僅 1 頁有載體，故該手段已被移除。
 * 🔴 「首頁」**不經 F025 過濾**：四種管理類角色一律顯示（本檔以 DeptContact 為最嚴格之對照
 *    ——它只有 1 個功能選單項，若被套用 canPerform 會直接消失）。
 */
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
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
    logout: vi.fn(),
  });
}

function Probe() {
  const loc = useLocation();
  const type = useNavigationType();
  return (
    <>
      <div data-testid="loc">{loc.pathname}</div>
      <div data-testid="nav-type">{type}</div>
    </>
  );
}

function renderShell(at = '/admin/documents') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <AppShell />
      <Probe />
    </MemoryRouter>,
  );
}

const ADMIN_ROLES = ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact'] as const;

describe('AppShell — F002 AC-D1 側欄「首頁」項', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(ADMIN_ROLES)('TS-D1-001 %s 側欄第一項為「首頁」，route /admin（不因 F025 過濾而隱藏）', (role) => {
    mockAuth(role);
    renderShell();
    const nav = screen.getByRole('navigation', { name: '功能選單' });
    const home = within(nav).getByRole('link', { name: '首頁' });
    expect(home).toHaveAttribute('href', '/admin');
    expect(within(nav).getAllByRole('link')[0]).toBe(home);
  });

  it('TS-D1-002 「首頁」位於既有「帳號管理」之上（DOM 順序）', () => {
    mockAuth('SysAdmin');
    renderShell();
    const nav = screen.getByRole('navigation', { name: '功能選單' });
    const home = within(nav).getByRole('link', { name: '首頁' });
    const account = within(nav).getByText('帳號管理');
    // eslint-disable-next-line no-bitwise
    expect(home.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('TS-D1-003 「首頁」之 icon 鍵為 layout-dashboard（prototype 07 HOME_ITEM）', () => {
    mockAuth('ICSOPAdmin');
    renderShell();
    const nav = screen.getByRole('navigation', { name: '功能選單' });
    const home = within(nav).getByRole('link', { name: '首頁' });
    expect(home.querySelector('.lucide-layout-dashboard')).not.toBeNull();
  });

  it('TS-D1-004 點「首頁」→ 導向 /admin', async () => {
    mockAuth('DeptContact');
    renderShell();
    const nav = screen.getByRole('navigation', { name: '功能選單' });
    await userEvent.click(within(nav).getByRole('link', { name: '首頁' }));
    expect(screen.getByTestId('loc').textContent).toBe('/admin');
  });
});

describe('AppShell — F002 AC-D2 側欄 logo 可點回首頁', () => {
  beforeEach(() => vi.resetAllMocks());

  it('TS-D1-005 logo 區為可鍵盤聚焦之互動元素（role=link，非純 div），無障礙名稱逐字為「回到後台首頁」', () => {
    mockAuth('ICSOPAdmin');
    renderShell();
    const logo = screen.getByRole('link', { name: '回到後台首頁' });
    expect(logo).toHaveAttribute('href', '/admin');
    expect(logo.tagName).not.toBe('DIV');
  });

  it('TS-D1-006 點 logo → 導向 /admin', async () => {
    mockAuth('Supervisor');
    renderShell('/admin/lifecycles');
    await userEvent.click(screen.getByRole('link', { name: '回到後台首頁' }));
    expect(screen.getByTestId('loc').textContent).toBe('/admin');
  });
});

describe('AppShell — F002 AC-D4 已位於 /admin 時重複導向不出錯、不推入瀏覽歷程', () => {
  beforeEach(() => vi.resetAllMocks());

  it('TS-D1-007 於 /admin 點「首頁」→ 維持 /admin、不顯示錯誤、navigation 非 PUSH', async () => {
    mockAuth('SysAdmin');
    renderShell('/admin');
    const nav = screen.getByRole('navigation', { name: '功能選單' });
    await userEvent.click(within(nav).getByRole('link', { name: '首頁' }));
    expect(screen.getByTestId('loc').textContent).toBe('/admin');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('nav-type').textContent).not.toBe('PUSH');
  });

  it('TS-D1-008 於 /admin 點 logo → 維持 /admin、不顯示錯誤、navigation 非 PUSH', async () => {
    mockAuth('SysAdmin');
    renderShell('/admin');
    await userEvent.click(screen.getByRole('link', { name: '回到後台首頁' }));
    expect(screen.getByTestId('loc').textContent).toBe('/admin');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('nav-type').textContent).not.toBe('PUSH');
  });
});
