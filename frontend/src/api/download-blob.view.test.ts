import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openViaBlob, openPdfViaBlob } from './download-blob';
import { viewOjtSession, OJT_VIEWABLE_CONTENT_TYPES } from './endpoints';
import { ApiError } from './client';

/**
 * F042 簽到表線上檢視 delta（`AC-OV2`）——新分頁開檔之共用機制。
 *
 * 🔴 `openViaBlob` 是 `openPdfViaBlob` 之一般化（additive）：後者之既有行為（`Accept:
 * application/pdf`、不檢查回應型別）逐字不變，由本檔末段之回歸案鎖定。
 */

function fakeWin() {
  return { location: { href: '' }, close: vi.fn() } as unknown as Window & { close: ReturnType<typeof vi.fn> };
}

function res(status: number, contentType: string, body = 'x'): Response {
  return new Response(new Blob([body]), { status, headers: { 'content-type': contentType } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('viewOjtSession（AC-OV2）', () => {
  it('請求 /admin/ojt-progress/sessions/:id/view，Accept 不含 text/html，成功後導向 blob: URL', async () => {
    vi.mocked(fetch).mockResolvedValue(res(200, 'application/pdf'));
    const win = fakeWin();
    await viewOjtSession('s 1', win);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/admin/ojt-progress/sessions/s%201/view');
    const accept = (init.headers as Record<string, string>).Accept;
    expect(accept).not.toMatch(/text\/html/);
    expect(win.location.href).toBe('blob:mock');
    expect(win.close).not.toHaveBeenCalled();
  });

  it.each(['image/jpeg', 'image/png', 'application/pdf; charset=binary'])('允許之型別 %s 導向', async (ct) => {
    vi.mocked(fetch).mockResolvedValue(res(200, ct));
    const win = fakeWin();
    await viewOjtSession('s1', win);
    expect(win.location.href).toBe('blob:mock');
  });

  it('🔴 回應型別為 text/html（200）→ 不導向、關閉分頁、拋錯', async () => {
    vi.mocked(fetch).mockResolvedValue(res(200, 'text/html', '<script>x</script>'));
    const win = fakeWin();
    await expect(viewOjtSession('s1', win)).rejects.toBeInstanceOf(ApiError);
    expect(win.location.href).toBe('');
    expect(win.close).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('404 → 關閉分頁、拋出帶錯誤碼之 ApiError', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'OJT_SESSION_NOT_FOUND' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const win = fakeWin();
    await expect(viewOjtSession('s1', win)).rejects.toMatchObject({ code: 'OJT_SESSION_NOT_FOUND' });
    expect(win.close).toHaveBeenCalled();
  });

  it('可檢視型別恰為 pdf／jpeg／png', () => {
    expect([...OJT_VIEWABLE_CONTENT_TYPES].sort()).toEqual(['application/pdf', 'image/jpeg', 'image/png']);
  });
});

describe('openViaBlob／openPdfViaBlob 之零漣漪', () => {
  it('openPdfViaBlob：Accept 仍為 application/pdf、不檢查回應型別（既有列印路徑行為不變）', async () => {
    vi.mocked(fetch).mockResolvedValue(res(200, 'application/octet-stream'));
    const win = fakeWin();
    await openPdfViaBlob('/x/print', win);
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Accept).toBe('application/pdf');
    expect(win.location.href).toBe('blob:mock');
  });

  it('openViaBlob 未給 allowedTypes 時不檢查型別', async () => {
    vi.mocked(fetch).mockResolvedValue(res(200, 'text/plain'));
    const win = fakeWin();
    await openViaBlob('/x', win, { accept: 'application/pdf' });
    expect(win.location.href).toBe('blob:mock');
  });
});
