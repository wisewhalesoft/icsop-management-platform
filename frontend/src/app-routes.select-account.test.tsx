/**
 * F001 帳號選擇 delta — 前端路由 `/login/select-account` 之掛載（`[ASSUMPTION]`，
 * `docs/specs/features/F001-auth-login-session.md#multi-account-picker`）。
 *
 * 現況（2026-08-24 建環時查證，非猜測）：`AppRoutes`（`frontend/src/App.tsx`）於
 * `status === 'unauthenticated'` 分支僅有 `<Route path="*" element={<LoginPage />} />`——
 * 任何路徑一律渲染 `LoginPage`，尚未區分 `/login/select-account`。本檔鎖住「該路徑必須渲染
 * 帳號選擇頁而非一般登入頁」，迫使實作端於 `AppRoutes` 之未登入分支新增此路由。
 *
 * 沿用既有 `app-routes.test.tsx` 之 `mockAuth`／`renderAt` 慣例（同一檔案不重複，另立新檔以避免
 * 竄改既有測試檔）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App';
import { ToastProvider } from './components/useToast';
import * as authHook from './auth/useAuth';
import * as endpoints from './api/endpoints';

vi.mock('./auth/useAuth');
vi.mock('./api/endpoints');

function mockUnauthenticated(): void {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'unauthenticated',
    user: null,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
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

describe('AppRoutes — /login/select-account 渲染帳號選擇頁（未登入分支）', () => {
  beforeEach(() => vi.resetAllMocks());

  it('未登入 + 路徑 /login/select-account → 渲染帳號選擇頁，而非一般登入頁', () => {
    mockUnauthenticated();
    // 讓候選查詢保持 pending，只需驗證「渲染了哪個元件」，不涉及資料載入完成後的細節。
    vi.mocked(endpoints.getSelectAccountCandidates).mockReturnValue(new Promise(() => {}));
    renderAt('/login/select-account');

    // SelectAccountPage 專屬標記：不得出現一般登入頁之「使用公司帳號登入」按鈕。
    expect(screen.queryByRole('button', { name: /使用公司帳號登入/ })).not.toBeInTheDocument();
  });

  it('未登入 + 其他路徑（如 /）→ 行為不變，仍渲染一般登入頁（回歸鎖）', () => {
    mockUnauthenticated();
    renderAt('/');
    expect(screen.getByRole('button', { name: /使用公司帳號登入/ })).toBeInTheDocument();
  });
});
