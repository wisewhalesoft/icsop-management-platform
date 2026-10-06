import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicDocumentDetailPage } from './PublicDocumentDetailPage';
import { ToastProvider } from '../components/useToast';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { DocumentAppendixRecord, PublicDocumentDetail } from '../api/types';

/**
 * 🔵 2026-10-06 F018／F039 `AC-FV1`～`AC-FV2`：前台文件詳情（prototype 04）之使用表單／附錄 PDF 列
 * 「檢視」鈕。🔒 附件區之 ICSOP PDF 列**不加**（頁首已有開啟檢視器之「檢視」，使用者裁決）。
 */
vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

const DOC_ID = 'doc-1';
const DETAIL = {
  id: DOC_ID,
  status: 'active',
  displayStatus: 'announced',
  documentNumber: 'ICSOP-SRC-101-1-01',
  documentName: '車輛分期進件作業',
  lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環',
  nodeId: 'n1',
  nodeName: '進件作業',
  draftingCompanyName: '和潤企業股份有限公司',
  draftingDeptId: 'D',
  draftingDeptName: '企劃部',
  draftingSectionId: 'S',
  draftingSectionName: '車輛行銷室',
  primaryChiefId: 'e1',
  primaryChiefName: '陳彥廷',
  edition: "26'01",
  announcedDate: '2026-01-01T00:00:00.000Z',
  contentSummary: '摘要',
  attachments: [{ type: 'ICSOP_PDF', fileName: '車輛分期進件作業_v1.3.pdf', blobPath: 'blob/icsop.pdf' }],
  usageForms: [
    { id: 'f1', name: '進件申請書.xlsx', format: 'xlsx', watermarkSupported: false },
    { id: 'f3', name: '對保通知書.pdf', format: 'pdf', watermarkSupported: true },
  ],
  links: [],
  ojtCompletedUnits: [],
  ojtUsingUnitCount: 0,
} as unknown as PublicDocumentDetail;
const APPX = [
  { id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx', sortOrder: 1, watermarkSupported: false },
  { id: 'ax2', name: '名詞定義說明.pdf', format: 'pdf', sortOrder: 2, watermarkSupported: true },
] as unknown as DocumentAppendixRecord[];

const openMock = vi.fn();

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/public/documents/${DOC_ID}`]}>
        <Routes>
          <Route path="/public/documents/:id" element={<PublicDocumentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}
const row = (name: string) =>
  screen.getByText(name).closest('[data-usage-form-item],[data-appendix-item]') as HTMLElement;

describe('前台使用表單／附錄之 PDF 檢視（AC-FV1／AC-FV2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockReset();
    vi.stubGlobal('open', openMock);
    vi.mocked(authHook.useAuth).mockReturnValue({
      status: 'authenticated',
      user: { loginId: 'X', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode: 'JAC00', name: '王小明' },
      error: null,
      refresh: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(DETAIL);
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPX);
    vi.mocked(api.viewUsageFormFront).mockResolvedValue(undefined);
    vi.mocked(api.viewDocumentAppendixFront).mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('AC-FV1 恰 PDF 使用表單與 PDF 附錄兩列有檢視鈕；xlsx 列與附件區 ICSOP PDF 列皆無；檢視在下載之前', async () => {
    renderPage();
    await screen.findByText('名詞定義說明.pdf');
    const btns = Array.from(document.querySelectorAll('[data-attachment-view]'));
    expect(btns.map((b) => b.getAttribute('aria-label'))).toEqual(['檢視「對保通知書.pdf」', '檢視「名詞定義說明.pdf」']);
    expect(within(screen.getByTestId('attachment-list')).queryByRole('button', { name: /^檢視/ })).toBeNull();
    for (const n of ['進件申請書.xlsx', '作業流程對照表.xlsx']) {
      expect(row(n)).not.toBeNull();
      expect(within(row(n)).queryByRole('button', { name: /^檢視/ })).toBeNull();
      expect(within(row(n)).getByRole('button', { name: /^下載/ })).toBeInTheDocument();
    }
    for (const n of ['對保通知書.pdf', '名詞定義說明.pdf']) {
      expect(within(row(n)).getAllByRole('button').map((b) => b.textContent)).toEqual(['檢視', '下載']);
    }
  });

  it('AC-FV2 點擊檢視：click 內同步開分頁，再以該分頁呼叫前台檢視端點（documentId, id, win）', async () => {
    const win = { close: vi.fn() };
    openMock.mockReturnValue(win);
    renderPage();
    await screen.findByText('名詞定義說明.pdf');

    await userEvent.click(screen.getByRole('button', { name: '檢視「對保通知書.pdf」' }));
    await waitFor(() => expect(api.viewUsageFormFront).toHaveBeenCalledWith(DOC_ID, 'f3', win));
    await userEvent.click(screen.getByRole('button', { name: '檢視「名詞定義說明.pdf」' }));
    await waitFor(() => expect(api.viewDocumentAppendixFront).toHaveBeenCalledWith(DOC_ID, 'ax2', win));

    expect(openMock).toHaveBeenCalledTimes(2);
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    // 檢視不得順手觸發下載
    expect(api.downloadUsageFormFront).not.toHaveBeenCalled();
    expect(api.downloadDocumentAppendixFront).not.toHaveBeenCalled();
    expect(await screen.findByText('已於新分頁開啟「名詞定義說明.pdf」，本次調閱已記錄。')).toBeInTheDocument();
  });

  it('🔴 分頁被封鎖 ⇒ 不發請求（否則寫下使用者沒看到的 VIEW 稽核），並提示', async () => {
    openMock.mockReturnValue(null);
    renderPage();
    await screen.findByText('名詞定義說明.pdf');
    await userEvent.click(screen.getByRole('button', { name: '檢視「名詞定義說明.pdf」' }));
    expect(api.viewDocumentAppendixFront).not.toHaveBeenCalled();
    expect(await screen.findByText(/新視窗被瀏覽器封鎖/)).toBeInTheDocument();
  });

  it('檢視失敗 ⇒ 顯示「檢視失敗，請稍後再試。」', async () => {
    openMock.mockReturnValue({ close: vi.fn() });
    vi.mocked(api.viewUsageFormFront).mockRejectedValue(new Error('x'));
    renderPage();
    await screen.findByText('對保通知書.pdf');
    await userEvent.click(screen.getByRole('button', { name: '檢視「對保通知書.pdf」' }));
    expect(await screen.findByText('檢視失敗，請稍後再試。')).toBeInTheDocument();
  });
});
