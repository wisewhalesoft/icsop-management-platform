import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isSessionLost, notifySessionLost, setSessionLostHandler } from './session-lost';
import { apiFetch } from './client';
import { downloadViaBlob, openPdfViaBlob } from './download-blob';

/**
 * 2026-08-26 缺陷修復（F001「逾時 → 導回登入頁」之前端側）：掛載後才發生的 401 從前**無人接手**
 * ——`useAuth` 只在掛載時打一次 `/auth/me`，其後任何 401 都被各頁 `catch` 成「載入失敗」，畫面就
 * 停在逾時前的樣子（真人回報）。本檔鎖住通報接縫本身與「哪些 401 才算 session 失效」的分界。
 */
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('isSessionLost — 只有 SessionGuard 擲出的兩種 401 算 session 失效', () => {
  it.each(['AUTH_SESSION_EXPIRED', 'AUTH_ACCOUNT_DISABLED'])('401 %s → true', (code) => {
    expect(isSessionLost({ status: 401, code })).toBe(true);
  });

  /**
   * 🔴 負向防護：登入流程本身的 401 **不得**被當成逾時——否則使用者第一次打錯密碼，登入頁就會
   * 彈出「工作階段已逾時」模態（且 `wasAuthed` 旗標被誤耗）。
   */
  it.each(['AUTH_INVALID_CREDENTIALS', 'AUTH_SELECTION_TICKET_INVALID'])(
    '401 %s（登入流程之正常拒絕）→ false',
    (code) => {
      expect(isSessionLost({ status: 401, code })).toBe(false);
    },
  );

  it('403 PERMISSION_DENIED（權限不足，session 仍有效）→ false', () => {
    expect(isSessionLost({ status: 403, code: 'PERMISSION_DENIED' })).toBe(false);
  });

  it('404／500 等非 401 一律 false', () => {
    expect(isSessionLost({ status: 404, code: 'DOCUMENT_NOT_FOUND' })).toBe(false);
    expect(isSessionLost({ status: 500, code: 'AUTH_SESSION_EXPIRED' })).toBe(false);
  });
});

describe('notifySessionLost — 處理器註冊與觸發', () => {
  afterEach(() => setSessionLostHandler(null));

  it('未註冊處理器時呼叫不擲例外（低層不得因無人監聽而壞掉）', () => {
    setSessionLostHandler(null);
    expect(() => notifySessionLost({ status: 401, code: 'AUTH_SESSION_EXPIRED' })).not.toThrow();
  });

  it('已註冊 → 僅於 session 失效時觸發', () => {
    const handler = vi.fn();
    setSessionLostHandler(handler);
    notifySessionLost({ status: 403, code: 'PERMISSION_DENIED' });
    notifySessionLost({ status: 401, code: 'AUTH_INVALID_CREDENTIALS' });
    expect(vi.mocked(handler)).not.toHaveBeenCalled();
    notifySessionLost({ status: 401, code: 'AUTH_SESSION_EXPIRED' });
    expect(vi.mocked(handler)).toHaveBeenCalledTimes(1);
  });

  it('取消註冊後不再觸發', () => {
    const handler = vi.fn();
    setSessionLostHandler(handler);
    setSessionLostHandler(null);
    notifySessionLost({ status: 401, code: 'AUTH_SESSION_EXPIRED' });
    expect(vi.mocked(handler)).not.toHaveBeenCalled();
  });
});

/**
 * 🔴 三條低層路徑必須**全部**接上通報，缺一就留下一個「逾時後畫面不動／整頁 JSON」的洞：
 * 一般 API（`apiFetch`）、檔案下載（`downloadViaBlob`）、列印開新分頁（`openPdfViaBlob`）。
 */
describe('低層 fetch 包裝 → 通報 session 失效（三條路徑逐一）', () => {
  let handler: () => void;

  beforeEach(() => {
    handler = vi.fn();
    setSessionLostHandler(handler);
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    setSessionLostHandler(null);
    vi.unstubAllGlobals();
  });

  it('apiFetch 收到 401 AUTH_SESSION_EXPIRED → 通報且仍擲出（呼叫端契約不變）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'AUTH_SESSION_EXPIRED' }, 401));
    await expect(apiFetch('/admin/documents')).rejects.toMatchObject({ status: 401 });
    expect(vi.mocked(handler)).toHaveBeenCalledTimes(1);
  });

  it('apiFetch 收到 403 → 不通報（權限不足不是 session 失效）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'PERMISSION_DENIED' }, 403));
    await expect(apiFetch('/admin/documents')).rejects.toMatchObject({ status: 403 });
    expect(vi.mocked(handler)).not.toHaveBeenCalled();
  });

  it('downloadViaBlob 收到 401 AUTH_ACCOUNT_DISABLED → 通報', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'AUTH_ACCOUNT_DISABLED' }, 401));
    await expect(downloadViaBlob('/public/documents/d1/download', 'x.pdf')).rejects.toMatchObject({
      status: 401,
    });
    expect(vi.mocked(handler)).toHaveBeenCalledTimes(1);
  });

  it('openPdfViaBlob 收到 401 → 通報，並關閉先前開好的空白分頁（不留 about:blank）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'AUTH_SESSION_EXPIRED' }, 401));
    const win = { close: vi.fn(), location: { href: '' } } as unknown as Window;
    await expect(openPdfViaBlob('/public/documents/d1/print', win)).rejects.toMatchObject({
      status: 401,
    });
    expect(vi.mocked(handler)).toHaveBeenCalledTimes(1);
    expect(win.close).toHaveBeenCalledTimes(1);
  });
});
