import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError } from './client';

/**
 * API client 單測：以 mock fetch 驗證 credentials、JSON 解析與後端錯誤碼對映。
 * 後端 Nest 例外形狀：{ statusCode, message, error }，其中 message 常為穩定錯誤碼
 * （AUTH_SESSION_EXPIRED / PERMISSION_DENIED / SYNC_IN_PROGRESS）。
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('成功時回傳解析後的 JSON，並帶 credentials:include 與 Accept 標頭', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse({ loginId: 'AS22455' }));

    const data = await apiFetch<{ loginId: string }>('/auth/me');

    expect(data).toEqual({ loginId: 'AS22455' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('accept')).toBe('application/json');
  });

  it('401 → 拋 ApiError（status 401、code 取自 message）', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ statusCode: 401, message: 'AUTH_SESSION_EXPIRED' }, 401),
    );
    const err = (await apiFetch('/auth/me').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('AUTH_SESSION_EXPIRED');
  });

  it('409 SYNC_IN_PROGRESS 錯誤碼可辨識', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ statusCode: 409, message: 'SYNC_IN_PROGRESS' }, 409),
    );
    const err = (await apiFetch('/admin/org-sync/run', { method: 'POST' }).catch((e) => e)) as ApiError;
    expect(err.status).toBe(409);
    expect(err.code).toBe('SYNC_IN_PROGRESS');
  });

  it('網路失敗 → ApiError（status 0、NETWORK_ERROR）', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const err = (await apiFetch('/auth/me').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe('NETWORK_ERROR');
  });
});
