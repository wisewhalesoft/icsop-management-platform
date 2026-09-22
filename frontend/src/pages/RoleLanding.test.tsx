import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoleLanding } from './RoleLanding';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';
import { UX16_ADMIN_ACCESS_ROLES, EXPECTED_HAS_ADMIN_ACCESS } from '../test-support/ux16-admin-access-vector';

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

  /**
   * UX16 delta `AC-UX5` ②：本案為既有絕對值鎖之就地改寫（預期轉紅，非回歸）——原以
   * `/管理後台/`／`/前台瀏覽/` 正規表示式比對，UX16 之 `AC-UX1`／`AC-UX2` 已改掉卡片逐字文案
   * （分別改為「ICSOP 文件」／「管理平台」），且 `AC-UX5` ① 要求以精確 `aria-label` 比對（本頁
   * header 之既有可見文字「ICSOP 文件管理平台」同時含 `ICSOP 文件` 與 `管理平台` 兩個子字串，
   * 正規表示式／子字串比對在本頁結構上已失去鑑別力）。
   * 📝 已作廢（⚠ 不得復原）：`OLD>` 斷言 `getByRole('link', { name: /管理後台/ })` 與
   * `getByRole('link', { name: /前台瀏覽/ })`。
   */
  it('管理類角色顯示「ICSOP 文件 / 管理平台」兩張選擇卡（精確名稱比對，AC-UX5②）', () => {
    mockAuth('ICSOPAdmin');
    renderLanding();
    expect(screen.getByRole('link', { name: '管理平台' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ICSOP 文件' })).toBeInTheDocument();
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

/**
 * UX16 delta — 2026-09-22 使用者體驗優化（項 1／2／3／6；`AC-UX1`～`AC-UX7`）。
 *
 * 權威：docs/specs/features/F002-role-based-routing.md#ux16-delta。
 * 🔴 本輪之約束環為簡化版（只有 backend jest／frontend vitest）⇒ AC 是唯一防線。
 */
describe('RoleLanding — UX16 delta（AC-UX1～AC-UX7）', () => {
  beforeEach(() => vi.resetAllMocks());

  const ADMIN_ROLES = ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact'];

  describe('AC-UX1 — 前台卡片逐字文案（項 1）', () => {
    it.each(ADMIN_ROLES)('%s：前台卡片標題逐字「ICSOP 文件」、說明逐字「作業程序書瀏覽、搜尋、下載、列印」（無句號）', (role) => {
      mockAuth(role);
      renderLanding();
      expect(screen.getByText('ICSOP 文件')).toBeInTheDocument();
      expect(screen.getByText('作業程序書瀏覽、搜尋、下載、列印')).toBeInTheDocument();
    });

    it('🔒 舊文案不得復活（負向，成對）：說明末尾不得有句號、「以您的身分與部門瀏覽…」零命中', () => {
      mockAuth('ICSOPAdmin');
      renderLanding();
      expect(screen.queryByText(/以您的身分與部門瀏覽/)).not.toBeInTheDocument();
      expect(screen.queryByText('作業程序書瀏覽、搜尋、下載、列印。')).not.toBeInTheDocument();
    });
  });

  describe('AC-UX2 — 後台卡片逐字文案（取消依角色差異化，項 2）', () => {
    const OLD_ADMIN_DESC = [
      '帳號/角色管理、組織同步、系統參數、調閱歷程（依權限顯示）。',
      '維護循環 DAG、ICSOP 文件、使用表單、調閱歷程（依權限顯示）。',
      '循環／ICSOP 文件全公司唯讀（無使用表單管理與調閱歷程）。',
      'ICSOP 文件唯讀檢視。',
    ];

    it.each(ADMIN_ROLES)('%s：後台卡片標題逐字「管理平台」、說明逐字「儀表板、OJT進度、相關維護作業(依權限顯示)」', (role) => {
      mockAuth(role);
      renderLanding();
      expect(screen.getByText('管理平台')).toBeInTheDocument();
      expect(screen.getByText('儀表板、OJT進度、相關維護作業(依權限顯示)')).toBeInTheDocument();
    });

    it('🔴 正向：四種角色所見之說明文字完全相同（集合大小為 1，不得退化為「某一角色是對的」）', () => {
      const seen = new Set<string>();
      for (const role of ADMIN_ROLES) {
        mockAuth(role);
        const { unmount } = renderLanding();
        seen.add(screen.getByText('儀表板、OJT進度、相關維護作業(依權限顯示)').textContent ?? '');
        unmount();
      }
      expect(seen.size).toBe(1);
    });

    it.each(OLD_ADMIN_DESC)('🔴 負向：舊四段依角色差異化說明「%s」於四種角色之渲染結果中零命中', (oldText) => {
      for (const role of ADMIN_ROLES) {
        mockAuth(role);
        const { unmount } = renderLanding();
        expect(screen.queryByText(oldText)).not.toBeInTheDocument();
        unmount();
      }
    });
  });

  describe('AC-UX3 — 「管理平台」與「ICSOP 管理後台」並存（後台首頁麵包屑之成對斷言另見 DashboardHome.ux16.test.tsx）', () => {
    it('本頁卡片標題為「管理平台」（麵包屑首段之成對斷言見 DashboardHome.ux16.test.tsx，避免本檔重複 mock 後台首頁端點）', () => {
      mockAuth('ICSOPAdmin');
      renderLanding();
      expect(screen.getByRole('link', { name: '管理平台' })).toBeInTheDocument();
    });
  });

  describe('AC-UX4 — 兩張卡片左右對調（DOM 順序，管理平台在前）', () => {
    it('🔴 grid 容器內之 role="link" 元素依 DOM 順序恰為 [管理平台, ICSOP 文件]（有序陣列，非兩句存在性斷言）', () => {
      mockAuth('ICSOPAdmin');
      renderLanding();
      const adminLink = screen.getByRole('link', { name: '管理平台' });
      const publicLink = screen.getByRole('link', { name: 'ICSOP 文件' });
      // DOCUMENT_POSITION_FOLLOWING（4）：adminLink 在 publicLink 之前，即 DOM 順序管理平台在前。
      // eslint-disable-next-line no-bitwise
      expect(adminLink.compareDocumentPosition(publicLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // 亦以完整清單斷言「恰兩個」候選連結——避免多冒出第三張卡也命中同名而蒙混過關。
      expect(screen.getAllByRole('link', { name: '管理平台' })).toHaveLength(1);
      expect(screen.getAllByRole('link', { name: 'ICSOP 文件' })).toHaveLength(1);
    });
  });

  describe('AC-UX5 — DOM 契約（aria-label 逐字等於標題）', () => {
    it('① 兩張卡片之 aria-label 逐字等於該卡標題（管理平台／ICSOP 文件）', () => {
      mockAuth('ICSOPAdmin');
      renderLanding();
      expect(screen.getByRole('link', { name: '管理平台' }).getAttribute('aria-label')).toBe('管理平台');
      expect(screen.getByRole('link', { name: 'ICSOP 文件' }).getAttribute('aria-label')).toBe('ICSOP 文件');
    });

    it('③ 卡內行動文字「前往前台」／「進入後台」一字不改（既有文案，零漣漪）', () => {
      mockAuth('ICSOPAdmin');
      renderLanding();
      expect(screen.getByText('前往前台')).toBeInTheDocument();
      expect(screen.getByText('進入後台')).toBeInTheDocument();
    });
  });

  describe('AC-UX7 — hasAdminAccess 三處共用之其一：分流頁是否顯示選擇畫面', () => {
    it('🔴 五種角色之選擇畫面顯示與否，恰為 [true,true,true,true,false]（與 hasAdminAccess 之共用向量一致）', () => {
      const shown = UX16_ADMIN_ACCESS_ROLES.map((role) => {
        mockAuth(role);
        const { unmount } = renderWithRoutes();
        const isShown = screen.queryByText('登入成功，歡迎回來') !== null;
        unmount();
        return isShown;
      });
      expect(shown).toEqual(EXPECTED_HAS_ADMIN_ACCESS);
    });
  });
});
