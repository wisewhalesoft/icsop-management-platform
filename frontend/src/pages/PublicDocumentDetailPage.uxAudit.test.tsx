import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicDocumentDetailPage } from './PublicDocumentDetailPage';
import { ToastProvider } from '../components/useToast';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicDocumentDetail, DocumentAppendixRecord } from '../api/types';

/**
 * 前台詳情之 UX 稽核回歸測試（docs/specs/ux-audit-frontstage.md · A-2）。
 *
 * 受控下載每次核發皆由後端寫入一筆調閱稽核，故「請求期間可重複點擊」不僅是體感問題，
 * 而會產生重複稽核紀錄。本檔鎖定該防護：進行中鎖定按鈕、拒絕併發核發、完成後解鎖。
 */
vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const DOC_ID = 'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f';

function mockAuth(): void {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode: 'JAC00', name: '王小明' },
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function detailOf(over: Partial<PublicDocumentDetail> = {}): PublicDocumentDetail {
  return {
    id: DOC_ID,
    status: 'active',
    displayStatus: 'announced',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    lifecycleId: 'lc1',
    lifecycleName: '銷售及收款循環',
    nodeId: 'n1',
    nodeName: '進件作業',
    draftingCompanyId: 'C',
    draftingCompanyName: '和潤企業股份有限公司',
    draftingDeptId: 'D',
    draftingDeptName: '企劃部',
    draftingSectionId: 'S',
    draftingSectionName: '車輛行銷室',
    primaryChiefId: 'e1',
    primaryChiefName: '陳彥廷（企劃部 車輛行銷室 室長）',
    secondaryChiefIds: [],
    secondaryChiefNames: [],
    usingDeptIds: ['JAC00'],
    usingDeptNames: ['營運管理部審查室'],
    edition: "26'01",
    announcedDate: '2026-01-01T00:00:00.000Z',
    contentSummary: '規範車輛分期案件之進件收件流程。',
    attachments: [
      { type: 'ICSOP_PDF', fileName: '車輛分期進件作業_v1.3.pdf', blobPath: 'blob/icsop.pdf' },
      { type: 'OJT_SIGNIN', fileName: '車輛分期進件作業_OJT簽到表.pdf', blobPath: 'blob/ojt.pdf' },
    ],
    usageForms: [{ id: 'f1', name: '進件申請書.xlsx', format: 'xlsx' }],
    links: [],
    ...over,
  };
}

const APPENDIX: DocumentAppendixRecord[] = [
  { id: 'ap1', documentId: DOC_ID, name: '附錄一 · 徵信檢核表.xlsx', format: 'xlsx', blobPath: 'blob/ap1.xlsx', sortOrder: 1 },
];

function renderDetail() {
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

/** 建立一個可由測試自行決定完成時機的下載核發 promise。 */
function deferredGrant(): {
  promise: Promise<{ url: string; expiresInSeconds: number }>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<{ url: string; expiresInSeconds: number }>((res) => {
    resolve = () => res({ url: 'https://x/file', expiresInSeconds: 60 });
  });
  return { promise, resolve };
}

describe('前台詳情 · UX 稽核回歸（A-2 下載併發鎖）', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPENDIX);
    vi.mocked(api.documentDownloadUrl).mockImplementation((id) => `/public/documents/${id}/download`);
    vi.mocked(api.documentPrintUrl).mockImplementation((id) => `/public/documents/${id}/print`);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('附件下載進行中鎖定該按鈕（disabled + aria-busy），完成後解鎖', async () => {
    const user = userEvent.setup();
    const grant = deferredGrant();
    vi.mocked(api.downloadAttachment).mockReturnValue(grant.promise);

    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const atts = within(screen.getByTestId('attachment-list'));
    const btn = atts.getByRole('button', { name: '下載 車輛分期進件作業_v1.3.pdf' });

    await user.click(btn);
    await waitFor(() => {
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');
    });

    grant.resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(btn).toHaveAttribute('aria-busy', 'false');
  });

  it('進行中重複點擊不會二次核發（避免重複調閱稽核）', async () => {
    const user = userEvent.setup();
    const grant = deferredGrant();
    vi.mocked(api.downloadAttachment).mockReturnValue(grant.promise);

    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const atts = within(screen.getByTestId('attachment-list'));
    const btn = atts.getByRole('button', { name: '下載 車輛分期進件作業_v1.3.pdf' });

    await user.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());

    await user.click(btn);
    await user.click(btn);

    expect(api.downloadAttachment).toHaveBeenCalledTimes(1);

    grant.resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(api.downloadAttachment).toHaveBeenCalledTimes(1);
  });

  it('某列下載進行中時，其他列之下載亦不受理（單一併發鎖）', async () => {
    const user = userEvent.setup();
    const grant = deferredGrant();
    vi.mocked(api.downloadAttachment).mockReturnValue(grant.promise);
    vi.mocked(api.downloadUsageForm).mockResolvedValue({ url: 'https://x/form', expiresInSeconds: 60 });

    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const attBtn = within(screen.getByTestId('attachment-list')).getByRole('button', {
      name: '下載 車輛分期進件作業_v1.3.pdf',
    });
    const formBtn = within(screen.getByTestId('usage-form-list')).getByRole('button', {
      name: '下載 進件申請書.xlsx',
    });

    await user.click(attBtn);
    await waitFor(() => expect(attBtn).toBeDisabled());

    // 其他列按鈕本身未 disable（僅進行中那列顯示忙碌），但核發被鎖拒絕
    await user.click(formBtn);
    expect(api.downloadUsageForm).not.toHaveBeenCalled();

    grant.resolve();
    await waitFor(() => expect(attBtn).not.toBeDisabled());

    // 解鎖後可正常核發
    await user.click(formBtn);
    await waitFor(() => expect(api.downloadUsageForm).toHaveBeenCalledTimes(1));
  });

  it('附錄下載同樣受併發鎖保護', async () => {
    const user = userEvent.setup();
    const grant = deferredGrant();
    vi.mocked(api.downloadDocumentAppendix).mockReturnValue(grant.promise);

    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const btn = within(screen.getByTestId('appendix-list')).getByRole('button', {
      name: '下載 附錄一 · 徵信檢核表.xlsx',
    });

    await user.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    await user.click(btn);
    expect(api.downloadDocumentAppendix).toHaveBeenCalledTimes(1);

    grant.resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});
