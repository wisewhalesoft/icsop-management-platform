import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getMe,
  getOrgSyncRuns,
  triggerOrgSync,
  getUsageFormOverview,
  uploadUsageForms,
  overwriteUsageForm,
  deleteUsageForm,
  downloadPoolForm,
  linkUsageForms,
  getOrgChangeAlerts,
  resolveOrgChangeAlert,
  getOrgSyncMonthlySummary,
} from './endpoints';

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

  // ===== F018 使用表單管理 =====

  it('getUsageFormOverview → GET /admin/usage-forms/overview', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await getUsageFormOverview();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/usage-forms/overview');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('uploadUsageForms → POST /admin/usage-forms（multipart FormData，欄位 files，無 Content-Type）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));
    const file = new File(['x'], 'a.xlsx');
    await uploadUsageForms([file]);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/usage-forms');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).getAll('files')).toHaveLength(1);
    // FormData 不可夾帶 Content-Type（瀏覽器自帶 boundary）
    expect((init?.headers as Record<string, string> | undefined)?.['Content-Type']).toBeUndefined();
  });

  it('TS-PS-F018-FE-005 uploadUsageForms 單檔帶 name → multipart 附 name 欄位（trim 後）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));
    await uploadUsageForms([new File(['x'], 'a.xlsx')], '  貸款覆核申請表  ');
    const body = vi.mocked(fetch).mock.calls[0][1]?.body as FormData;
    expect(body.get('name')).toBe('貸款覆核申請表');
  });

  it('TS-PS-F018-FE-006 uploadUsageForms 未帶 / 純空白 name → 不附 name（後端 fallback 檔名）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));
    await uploadUsageForms([new File(['x'], 'a.xlsx')]);
    expect((vi.mocked(fetch).mock.calls[0][1]?.body as FormData).get('name')).toBeNull();

    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({})); // 新 Response（Body 僅能讀一次）
    await uploadUsageForms([new File(['x'], 'a.xlsx')], '   ');
    expect((vi.mocked(fetch).mock.calls[0][1]?.body as FormData).get('name')).toBeNull();
  });

  it('TS-PS-F018-FE-007 uploadUsageForms 多檔 → 不附 name（批次各檔沿用檔名）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));
    await uploadUsageForms([new File(['x'], 'a.xlsx'), new File(['y'], 'b.pdf')], '不應被採用');
    const body = vi.mocked(fetch).mock.calls[0][1]?.body as FormData;
    expect(body.getAll('files')).toHaveLength(2);
    expect(body.get('name')).toBeNull();
  });

  it('overwriteUsageForm(confirmed) → PUT /admin/usage-forms/:id?confirmed=true（欄位 file）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));
    const file = new File(['x'], 'v2.pdf');
    await overwriteUsageForm('uf1', file, true);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/usage-forms/uf1?confirmed=true');
    expect(init?.method).toBe('PUT');
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('overwriteUsageForm() 未確認 → 不帶 confirmed query', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));
    await overwriteUsageForm('uf1', new File(['x'], 'v2.pdf'));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/admin/usage-forms/uf1');
  });

  it('deleteUsageForm(confirmed) → DELETE /admin/usage-forms/:id?confirmed=true', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    await deleteUsageForm('uf1', true);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/usage-forms/uf1?confirmed=true');
    expect(init?.method).toBe('DELETE');
  });

  it('downloadPoolForm → GET /admin/usage-forms/:id/download', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ url: 'blob:z', expiresInSeconds: 300 }));
    const g = await downloadPoolForm('uf1');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/admin/usage-forms/uf1/download');
    expect(g.url).toBe('blob:z');
  });

  it('linkUsageForms → POST /admin/documents/:docId/usage-forms（JSON formIds）', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    await linkUsageForms('doc-1', ['uf1', 'uf2']);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/documents/doc-1/usage-forms');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ formIds: ['uf1', 'uf2'] });
  });

  // ===== F006 組織異動待確認提示 =====

  it('getOrgChangeAlerts() → GET /admin/org-change-alerts?status=pending（預設）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await getOrgChangeAlerts();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/admin/org-change-alerts?status=pending');
  });

  it("getOrgChangeAlerts('resolved') → GET ?status=resolved", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await getOrgChangeAlerts('resolved');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/admin/org-change-alerts?status=resolved');
  });

  it('resolveOrgChangeAlert → PATCH /admin/org-change-alerts/:id/resolve（預設無 body 內容）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'a1', status: 'resolved' }));
    await resolveOrgChangeAlert('a1');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/org-change-alerts/a1/resolve');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({});
  });

  it('resolveOrgChangeAlert(id, FIELD_UPDATED) → body 帶 resolutionKind', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'a1', status: 'resolved' }));
    await resolveOrgChangeAlert('a1', 'FIELD_UPDATED');
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ resolutionKind: 'FIELD_UPDATED' });
  });

  it('getOrgSyncMonthlySummary → GET /admin/org-sync/monthly-summary', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        month: '2026-07',
        newPersonCount: 18,
        updatedCount: 31,
        departedDisabledCount: 4,
        pendingChiefAlertCount: 3,
      }),
    );
    const s = await getOrgSyncMonthlySummary();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/admin/org-sync/monthly-summary');
    expect(s.newPersonCount).toBe(18);
  });
});
