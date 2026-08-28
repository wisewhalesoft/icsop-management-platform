import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getOjtProgressSummary,
  getOjtProgressRows,
  getOjtProgressRowSessions,
  addOjtSession,
  downloadOjtSession,
  deleteOjtSession,
  getOjtProgressPending,
  assignOjtPendingSession,
} from './endpoints';

/**
 * F042 OJT 進度管理 — 前端端點契約對映（AC-05／AC-09／AC-10／AC-11／AC-12／AC-13／AC-19／AC-26）。
 * 權威：docs/specs/features/F042-ojt-progress-management.md §架構設計 一、API 端點契約
 * （system-architect 棒 3 已定案之路徑/方法/請求形狀）。
 *
 * ⚠ 對實作全盲：`./endpoints` 尚不含本檔匯入之 8 個函式——import 失敗（找不到具名匯出）即本環
 * 之預期紅燈。函式名稱／簽章為 test-generator 依架構端點表設計之契約，非既有程式碼。
 *
 * 比照既有 `endpoints.test.ts` 之慣例：`vi.stubGlobal('fetch', vi.fn())`，斷言實際送出之
 * URL／method／body 形狀，不 mock `apiFetch` 本身（讓真正的 fetch 包裝邏輯一併受測）。
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('endpoints — F042 OJT 進度管理端點契約', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('getOjtProgressSummary → GET /admin/ojt-progress/summary（AC-14／AC-15／AC-16）', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ coverage: { numerator: 0, denominator: 0 }, deptRollup: [], recentSessions: [] }),
    );
    await getOjtProgressSummary();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/ojt-progress/summary');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  /**
   * AC-13：TAB2 篩選恰兩項（單位搜尋＋完成狀態）。`completionStatus` 比對「列自身」，
   * 值域為 `'completed'|'pending'`（恰二態，`AC-03`）——省略即「所有完成狀態」，不施加限制。
   */
  it('getOjtProgressRows(filters) → GET /admin/ojt-progress/rows?orgQuery=..&completionStatus=..', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], total: 0 }));
    await getOjtProgressRows({ orgQuery: '審查室', completionStatus: 'completed' });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/ojt-progress/rows?orgQuery=%E5%AF%A9%E6%9F%A5%E5%AE%A4&completionStatus=completed');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('getOjtProgressRows() 無參數 → 不帶 query（AC-13：完成狀態省略即不施加限制）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], total: 0 }));
    await getOjtProgressRows({});
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/admin/ojt-progress/rows');
  });

  it('getOjtProgressRowSessions(documentId, orgCode) → GET /admin/ojt-progress/rows/:documentId/:orgCode/sessions（AC-12）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ sessions: [] }));
    await getOjtProgressRowSessions('d1', 'JAC00');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/ojt-progress/rows/d1/JAC00/sessions');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  /**
   * AC-02／AC-09／AC-10：multipart 上傳，欄位名恰為 `file`（單檔——**不得**用 `files`，
   * 那會誤導為多檔上傳，與 AC-09③「單檔，一次登記恰對應一個簽到表檔案」直接矛盾）；
   * `trainingDate` 隨 FormData 一併送出。
   */
  it('addOjtSession → POST /admin/ojt-progress/rows/:documentId/:orgCode/sessions（multipart，欄位 file＋trainingDate，無 Content-Type）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 's1' }, 201));
    const file = new File(['x'], 'ojt.pdf');
    await addOjtSession('d1', 'JAC00', { trainingDate: '2026-08-28', file });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/ojt-progress/rows/d1/JAC00/sessions');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init?.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('trainingDate')).toBe('2026-08-28');
    // FormData 不可夾帶 Content-Type（瀏覽器自帶 boundary，比照既有 uploadUsageForms 之既定慣例）。
    expect((init?.headers as Record<string, string> | undefined)?.['Content-Type']).toBeUndefined();
  });

  it('downloadOjtSession(sessionId, fallbackName) → GET /admin/ojt-progress/sessions/:sessionId/download（代理串流，AC-12）', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(['x']), {
        status: 200,
        headers: { 'content-disposition': 'attachment; filename="ojt.pdf"' },
      }),
    );
    await expect(downloadOjtSession('s1', 'fallback.pdf')).resolves.toBeUndefined();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/ojt-progress/sessions/s1/download');
  });

  /**
   * AC-19：僅 ICSOPAdmin 可刪除；前端函式本身不做角色判斷（該把關在端點層），
   * 本測試只驗證前端 HTTP 契約——DELETE 路徑與方法。
   */
  it('deleteOjtSession(sessionId) → DELETE /admin/ojt-progress/sessions/:sessionId（AC-19）', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    await deleteOjtSession('s1');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/ojt-progress/sessions/s1');
    expect(init?.method).toBe('DELETE');
  });

  it('getOjtProgressPending → GET /admin/ojt-progress/pending（AC-26 待歸位工作台）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [] }));
    await getOjtProgressPending();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/ojt-progress/pending');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('assignOjtPendingSession(sessionId, {orgCode, trainingDate}) → POST /admin/ojt-progress/pending/:sessionId/assign（AC-26）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'lg1', orgCode: 'JAC00' }));
    await assignOjtPendingSession('lg1', { orgCode: 'JAC00', trainingDate: '2026-08-20' });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/ojt-progress/pending/lg1/assign');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ orgCode: 'JAC00', trainingDate: '2026-08-20' });
  });
});
