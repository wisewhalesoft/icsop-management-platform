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
