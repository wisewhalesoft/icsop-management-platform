import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { OjtProgressPage } from './OjtProgressPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

/**
 * F042 節流修正（`OQ-E11-21`，2026-08-28）—— `AC-28`⑰ 版面契約：SysAdmin 唯讀 bar 與 TAB 分頁列
 * 之 full-bleed 插槽位置。權威：docs/specs/features/F042-ojt-progress-management.md `AC-28`⑰／
 * F042-test.md §三-2 乙「AC-28⑰ 版面契約」列。
 *
 * 🔴 本檔獨立於 `AppShell.test.tsx`（不共用該檔），避免 `vi.mock('../api/endpoints')`（本檔新增）
 * 之全檔自動 mock 波及 `AppShell.test.tsx` 既有、與本次修正無關之測試（比照本 repo 已記取之
 * 「shared beforeEach／mock 波及半徑」教訓——新 mock 範圍應盡量隔離，不擴大既有檔案之風險面）。
 *
 * 🔴 仲裁修正（test-generator 仲裁 2026-08-28，ti-fe-ojt 申訴屬實）：原 harness 把 `<AppShell />`
 * 裸渲染在 `MemoryRouter` 內，外層沒有任何 `<Routes>/<Route>`。經查證 `App.tsx:104`
 * （`<Route path="/admin" element={<AppShell />}>` 之下 `:123 <Route path="ojt-progress"
 * element={<OjtProgressPage />} />`）與 `AppShell.tsx:224`（`<Outlet />`）：`AppShell` 是版面
 * 元件、靠 `<Outlet />` 取子路由，並非自帶路由表——裸渲染下 `<Outlet />` 找不到任何已匹配之子
 * `Route`，恆渲染 `null`，與路由是否接上無關。改為巢狀 `<Routes>` 與正式環境掛載方式同構
 * （`AppShell` 當 layout、`OjtProgressPage` 當 outlet）。斷言本身逐字未動。
 *
 * ⚠ 對實作全盲：本檔斷言 AppShell 掛載 `/admin/ojt-progress` 後，SysAdmin 唯讀橫幅與 TAB 分頁列
 * 之 DOM 位置——**只驗可觀察之最終位置關係**（相對於 `<header>`／`<main>` 之次序），不臆造
 * portal 插槽之實作機制（Context／hook／具名元件皆可能，機制屬實作裁量，非本檔鎖定範圍）。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'peter@hfcfinance.com.tw', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

function mockOjtEndpointsMinimal() {
  vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue({
    coverage: { numerator: 0, denominator: 0, excludedInactive: 0, excludedOrphaned: 0 },
    docCoverage: { scope: 'incomplete', maxRows: 15, items: [], shown: 0, hidden: 0, totalDocuments: 0, byState: { all: 0, partial: 0, none: 0 }, incompleteTotal: 0 },
    deptRollup: [],
    recentSessions: [],
  });
  vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(endpoints.getOjtProgressPending).mockResolvedValue({ items: [] });
}

function renderShellAtOjtProgress() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/admin/ojt-progress']}>
        <Routes>
          <Route path="/admin" element={<AppShell />}>
            <Route path="ojt-progress" element={<OjtProgressPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('AC-28⑰ 版面契約：SysAdmin 唯讀 bar 與 TAB 分頁列之 full-bleed 插槽位置', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockOjtEndpointsMinimal();
  });

  it('SysAdmin 唯讀橫幅位於 <header> 內側（TopbarBanner 插槽）', async () => {
    mockAuth('SysAdmin');
    renderShellAtOjtProgress();
    await waitFor(() => {
      const text = Array.from(document.querySelectorAll('*')).find((el) =>
        (el.textContent ?? '').includes('唯讀模式 · 系統管理員可檢視儀表板與 OJT 資料清單之全部內容'),
      );
      expect(text, '找不到 SysAdmin 唯讀橫幅文字節點').toBeTruthy();
    });
    const header = document.querySelector('header');
    expect(header, '找不到 <header>').not.toBeNull();
    const bannerHost = Array.from(document.querySelectorAll('header *')).find((el) =>
      (el.textContent ?? '').includes('唯讀模式 · 系統管理員可檢視儀表板與 OJT 資料清單之全部內容'),
    );
    expect(bannerHost, 'SysAdmin 唯讀橫幅不在 <header> 內').toBeTruthy();
  });

  it('TAB 分頁列（[data-ojt-tab="dashboard"]）位於 </header> 之後、<main> 之前（BelowTopbar 插槽），非 <main> 內部', async () => {
    mockAuth('SysAdmin');
    renderShellAtOjtProgress();
    await waitFor(() => expect(document.querySelector('[data-ojt-tab="dashboard"]')).not.toBeNull());
    const tab = document.querySelector('[data-ojt-tab="dashboard"]') as HTMLElement;
    const header = document.querySelector('header');
    const main = document.querySelector('main');
    expect(header, '找不到 <header>').not.toBeNull();
    expect(main, '找不到 <main>').not.toBeNull();
    // 分頁列不得是 <main> 之子孫（AC-28⑰ 之核心：不被 main 之左右內距與上方留白吃掉）。
    expect(main!.contains(tab)).toBe(false);
    // 分頁列亦不在 <header> 內部（它是 header 之後、main 之前的獨立插槽，非 header 本身之延伸）。
    expect(header!.contains(tab)).toBe(false);
    // DOM 順序：header 在前、分頁列次之、main 在後。
    expect(header!.compareDocumentPosition(tab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tab.compareDocumentPosition(main!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
