import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth, consumeSessionExpired } from './useAuth';
import { ApiError } from '../api/client';
import * as endpoints from '../api/endpoints';

vi.mock('../api/endpoints');

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('useAuth — 掛載時解析 session（GET /auth/me）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
  });

  it('初始為 loading', () => {
    vi.mocked(endpoints.getMe).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.status).toBe('loading');
  });

  it('取得使用者 → authenticated，帶 user', async () => {
    vi.mocked(endpoints.getMe).mockResolvedValue({
      loginId: 'AS22455',
      email: 'peter@hfcfinance.com.tw',
      companyCode: 'AS',
      roleCode: 'ICSOPAdmin',
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user?.roleCode).toBe('ICSOPAdmin');
  });

  it('401 AUTH_SESSION_EXPIRED → unauthenticated（非錯誤）', async () => {
    vi.mocked(endpoints.getMe).mockRejectedValue(
      new ApiError(401, 'AUTH_SESSION_EXPIRED'),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeNull();
  });

  it('非 401 失敗 → error（可提示重試）', async () => {
    vi.mocked(endpoints.getMe).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});

describe('useAuth — 工作階段逾時偵測（G-PUB-006）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
  });

  it('從未登入即 401 → 不標記逾時（consumeSessionExpired 為 false）', async () => {
    vi.mocked(endpoints.getMe).mockRejectedValue(new ApiError(401, 'AUTH_SESSION_EXPIRED'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(consumeSessionExpired()).toBe(false);
  });

  it('曾登入（authenticated）後再遇 401 → 標記逾時，consumeSessionExpired 讀取後清除', async () => {
    // 首次成功登入 → 標記 wasAuthed。
    vi.mocked(endpoints.getMe).mockResolvedValueOnce({
      loginId: 'AS22455',
      email: 'a@b.c',
      companyCode: 'AS',
      roleCode: 'ICSOPAdmin',
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // 其後 refresh 遇 401（session 逾時）。
    vi.mocked(endpoints.getMe).mockRejectedValue(new ApiError(401, 'AUTH_SESSION_EXPIRED'));
    await result.current.refresh();
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    expect(consumeSessionExpired()).toBe(true); // 首次讀取 → true
    expect(consumeSessionExpired()).toBe(false); // 已清除 → 不重複觸發
  });
});

/**
 * 登出（bug 修復契約 AC-5／AC-6，見任務交接）：
 *  - AC-5：主動登出（logout()）不得留下逾時旗標，避免登出後導回登入頁誤顯「工作階段逾時」模態。
 *  - AC-6：logout() 仍須以整頁導覽（window.location.href）觸發後端 /auth/logout，
 *          不可退化為純前端清狀態——httpOnly 的 icsop_session cookie 只能由後端清除。
 * 這兩項現況（useAuth.tsx clearAuthMarkers()／window.location.href）已正確，本節為鎖住行為的
 * 迴歸測試（預期綠燈），非本次 bug 本身（bug 在後端 GET /auth/logout 回 HTML 而非轉址，見
 * auth.controller.logout.spec.ts）。
 */
describe('useAuth — 登出', () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    originalLocation = window.location;
    // jsdom 不支援真實整頁導覽；以可觀察的 stub 取代，僅用於斷言 href 被設定成什麼值（測試基礎設施，非產品邏輯）。
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('AC-6 logout() 以整頁導覽觸發後端登出端點（window.location.href = "/auth/logout"）', async () => {
    vi.mocked(endpoints.getMe).mockResolvedValue({
      loginId: 'AS22455',
      email: 'peter@hfcfinance.com.tw',
      companyCode: 'AS',
      roleCode: 'ICSOPAdmin',
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    result.current.logout();

    expect(window.location.href).toBe('/auth/logout');
  });

  it('AC-5 主動登出後，殘留請求即使回 401 也不得被誤判為逾時（wasAuthed 旗標已隨登出清除）', async () => {
    vi.mocked(endpoints.getMe).mockResolvedValue({
      loginId: 'AS22455',
      email: 'peter@hfcfinance.com.tw',
      companyCode: 'AS',
      roleCode: 'ICSOPAdmin',
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    result.current.logout(); // 應清除 wasAuthed 旗標，避免下一次 401 被誤標為「逾時」

    vi.mocked(endpoints.getMe).mockRejectedValue(new ApiError(401, 'AUTH_SESSION_EXPIRED'));
    await result.current.refresh();
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    // 若 logout() 未清除 wasAuthed，這裡會被誤標為 true（登入頁將誤顯逾時模態）。
    expect(consumeSessionExpired()).toBe(false);
  });
});
