import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './useAuth';
import { ApiError } from '../api/client';
import * as endpoints from '../api/endpoints';

vi.mock('../api/endpoints');

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('useAuth — 掛載時解析 session（GET /auth/me）', () => {
  beforeEach(() => vi.resetAllMocks());

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
