import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getMe, getOrgSyncRuns, triggerOrgSync } from './endpoints';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('endpoints — 端點契約對映', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('getMe → GET /auth/me', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ loginId: 'AS22455', roleCode: 'ICSOPAdmin' }));
    const me = await getMe();
    expect(me.roleCode).toBe('ICSOPAdmin');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/auth/me');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('getOrgSyncRuns(limit) → GET /admin/org-sync/runs?limit=N', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await getOrgSyncRuns(5);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/admin/org-sync/runs?limit=5');
  });

  it('getOrgSyncRuns() 無參數 → 不帶 limit query', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await getOrgSyncRuns();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/admin/org-sync/runs');
  });

  it('triggerOrgSync → POST /admin/org-sync/run', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ runId: 'r1', status: 'success' }));
    const r = await triggerOrgSync();
    expect(r.runId).toBe('r1');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/org-sync/run');
    expect(init?.method).toBe('POST');
  });
});
