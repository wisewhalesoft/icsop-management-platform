import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OjtProgressPage } from './OjtProgressPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type { SessionUser } from '../api/types';
import { POPUP_BLOCKED_TEXT } from '../domain/print-error';
import { WM_BURN_TEXT, WM_UNSUPPORTED_TEXT } from '../domain/watermark-note';
import {
  VIEW_BTN_TEXT,
  VIEW_FAILED_TEXT,
  VIEW_TITLE_TEXT,
  viewSessionAria,
  viewPendingAria,
  downloadPendingAria,
} from './ojt-progress-view';

/**
 * F042 簽到表線上檢視 delta（`AC-OV1`／`AC-OV2`／`AC-OV6`／`AC-OV7`）——頁面層。
 * 權威：docs/specs/features/F042-ojt-progress-management.md §簽到表線上檢視 delta；prototype 25。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <OjtProgressPage />
      </MemoryRouter>
    </ToastProvider>,
  );

const row = {
  documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  companyCode: 'AS', orgCode: 'JAC00', orgName: '審查室', sessionCount: 3, completed: true,
  inactive: false, orphaned: false, currentEditionSessionCount: 3, trainingEdition: null,
  documentEdition: null, announcedDate: null,
};

const session = (id: string, fileName: string) => ({
  id, trainingDate: '2026-08-20', fileName, uploadedByName: '王志明', uploadedAt: '2026-08-20T10:00:00.000Z',
});

const SESSIONS = [session('sp', '簽到表.pdf'), session('sj', '照片.JPG'), session('sd', '舊檔.doc')];

const pending = (id: string, fileName: string) => ({
  id, documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  fileName, trainingDate: null, uploadedAt: '2025-11-14T01:32:00.000Z',
});

function setupMocks(pendingItems = [] as ReturnType<typeof pending>[]) {
  vi.mocked(endpoints.getOjtProgressSummary).mockRejectedValue(new Error('n/a'));
  vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({ items: [row], total: 1 });
  vi.mocked(endpoints.getOjtProgressRowSessions).mockResolvedValue({ sessions: SESSIONS });
  vi.mocked(endpoints.getOjtProgressPending).mockResolvedValue({ items: pendingItems });
  vi.mocked(endpoints.downloadOjtSession).mockResolvedValue(undefined);
  vi.mocked(endpoints.viewOjtSession).mockResolvedValue(undefined);
}

async function expandRow() {
  const user = userEvent.setup();
  await waitFor(() => expect(document.querySelector('[data-progress-expand="d1__JAC00"]')).not.toBeNull());
  await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
  await waitFor(() => expect(document.querySelector('[data-session-row="sp"]')).not.toBeNull());
  return user;
}

function hooksIn(el: Element, selectors: string[]): string[] {
  return [...el.querySelectorAll(selectors.join(','))].map(
    (e) => selectors.find((s) => e.matches(s)) ?? '?',
  );
}

let openSpy: ReturnType<typeof vi.fn>;
let fakeWin: Window;

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth('ICSOPAdmin');
  fakeWin = { location: { href: '' }, close: vi.fn() } as unknown as Window;
  openSpy = vi.fn(() => fakeWin);
  vi.stubGlobal('open', openSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe('AC-OV1 場次列之「檢視」鈕', () => {
  it.each(['ICSOPAdmin', 'SysAdmin', 'Supervisor', 'DeptContact'])('%s：看得到檢視鈕', async (role) => {
    mockAuth(role);
    setupMocks();
    renderPage();
    await expandRow();
    expect(document.querySelectorAll('[data-session-view]').length).toBeGreaterThan(0);
  });

  it('🔴 逐字文案與 DOM 順序：wm-note → 檢視 → 下載 → 刪除', async () => {
    setupMocks();
    renderPage();
    await expandRow();
    const r = document.querySelector('[data-session-row="sp"]')!;
    expect(
      hooksIn(r, ['[data-wm-note]', '[data-session-view]', '[data-session-download]', '[data-session-delete]']),
    ).toEqual(['[data-wm-note]', '[data-session-view]', '[data-session-download]', '[data-session-delete]']);
    const btn = r.querySelector('[data-session-view]') as HTMLElement;
    expect(btn.textContent?.trim()).toBe(VIEW_BTN_TEXT);
    expect(btn.getAttribute('aria-label')).toBe(viewSessionAria('2026-08-20', '簽到表.pdf'));
    expect(btn.getAttribute('title')).toBe(VIEW_TITLE_TEXT);
  });

  it('🔴 白名單外副檔名：無檢視鈕、仍有下載鈕（對偶鎖）；大寫副檔名視同允許', async () => {
    setupMocks();
    renderPage();
    await expandRow();
    const doc = document.querySelector('[data-session-row="sd"]')!;
    expect(doc.querySelectorAll('[data-session-view]')).toHaveLength(0);
    expect(doc.querySelectorAll('[data-session-download]')).toHaveLength(1);
    expect(document.querySelector('[data-session-row="sj"] [data-session-view]')).not.toBeNull();
  });
});

describe('AC-OV6 浮水印註記', () => {
  it('PDF 顯示 WM_BURN_TEXT，其他顯示 WM_UNSUPPORTED_TEXT', async () => {
    setupMocks();
    renderPage();
    await expandRow();
    expect(document.querySelector('[data-session-row="sp"] [data-wm-note]')?.textContent).toBe(WM_BURN_TEXT);
    expect(document.querySelector('[data-session-row="sj"] [data-wm-note]')?.textContent).toBe(WM_UNSUPPORTED_TEXT);
  });
});

describe('AC-OV2 點擊檢視', () => {
  it('點擊當下同步開新分頁，並以該分頁呼叫 viewOjtSession', async () => {
    setupMocks();
    renderPage();
    const user = await expandRow();
    await user.click(document.querySelector('[data-session-view="sp"]') as HTMLElement);
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(endpoints.viewOjtSession).toHaveBeenCalledWith('sp', fakeWin));
  });

  it('🔴 分頁被封鎖 → 提示 POPUP_BLOCKED_TEXT，且不發請求（避免寫下沒人看見的 VIEW 稽核）', async () => {
    setupMocks();
    openSpy.mockReturnValue(null);
    renderPage();
    const user = await expandRow();
    await user.click(document.querySelector('[data-session-view="sp"]') as HTMLElement);
    expect(await screen.findByText(POPUP_BLOCKED_TEXT)).toBeInTheDocument();
    expect(endpoints.viewOjtSession).not.toHaveBeenCalled();
  });

  it('失敗 → toast「檢視失敗，請稍後再試。」', async () => {
    setupMocks();
    vi.mocked(endpoints.viewOjtSession).mockRejectedValue(new ApiError(404, 'OJT_SESSION_NOT_FOUND'));
    renderPage();
    const user = await expandRow();
    await user.click(document.querySelector('[data-session-view="sp"]') as HTMLElement);
    expect(await screen.findByText(VIEW_FAILED_TEXT)).toBeInTheDocument();
  });
});

describe('AC-OV7 待歸位區之檢視與下載', () => {
  it('🔴 每列依序 wm-note → 檢視 → 下載 → 指派；逐字 aria-label', async () => {
    setupMocks([pending('lg1', '舊簽到表.pdf')]);
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-pending-row="lg1"]')).not.toBeNull());
    const r = document.querySelector('[data-pending-row="lg1"]')!;
    expect(
      hooksIn(r, ['[data-wm-note]', '[data-pending-view]', '[data-pending-download]', '[data-assign-org]']),
    ).toEqual(['[data-wm-note]', '[data-pending-view]', '[data-pending-download]', '[data-assign-org]']);
    expect(r.querySelector('[data-pending-view]')?.getAttribute('aria-label')).toBe(viewPendingAria('舊簽到表.pdf'));
    expect(r.querySelector('[data-pending-download]')?.getAttribute('aria-label')).toBe(downloadPendingAria('舊簽到表.pdf'));
  });

  it('SysAdmin 看得到檢視與下載、看不到指派', async () => {
    mockAuth('SysAdmin');
    setupMocks([pending('lg1', '舊簽到表.pdf')]);
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-pending-row="lg1"]')).not.toBeNull());
    const r = document.querySelector('[data-pending-row="lg1"]')!;
    expect(r.querySelector('[data-pending-view]')).not.toBeNull();
    expect(r.querySelector('[data-pending-download]')).not.toBeNull();
    expect(r.querySelector('[data-assign-org]')).toBeNull();
  });

  it('白名單外副檔名：無檢視鈕、有下載鈕', async () => {
    setupMocks([pending('lg3', '舊檔.doc')]);
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-pending-row="lg3"]')).not.toBeNull());
    const r = document.querySelector('[data-pending-row="lg3"]')!;
    expect(r.querySelector('[data-pending-view]')).toBeNull();
    expect(r.querySelector('[data-pending-download]')).not.toBeNull();
  });

  it('點擊待歸位之檢視／下載 → 呼叫同一組端點', async () => {
    setupMocks([pending('lg1', '舊簽到表.pdf')]);
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('[data-pending-view="lg1"]')).not.toBeNull());
    await user.click(document.querySelector('[data-pending-view="lg1"]') as HTMLElement);
    await waitFor(() => expect(endpoints.viewOjtSession).toHaveBeenCalledWith('lg1', fakeWin));
    await user.click(document.querySelector('[data-pending-download="lg1"]') as HTMLElement);
    await waitFor(() => expect(endpoints.downloadOjtSession).toHaveBeenCalledWith('lg1', '舊簽到表.pdf'));
  });
});
