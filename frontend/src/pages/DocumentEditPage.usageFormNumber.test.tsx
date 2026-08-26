import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentEditPage } from './DocumentEditPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser, DocumentView, LifecycleView, UsageFormRecord, DocumentListPage as DocPage,
} from '../api/types';

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: 'd1' }) };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

/**
 * 2026-08-26 使用者回報（UX ②）之編輯頁對應斷言：下拉**與已關聯 chips** 皆須帶表單編號。
 * chips 走的是 `getDocumentForms`（另一條資料路徑），與下拉之 `getUsageFormPool` 分開——
 * 只驗下拉會漏掉「同一頁上下兩處對同一份表單顯示不同字串」這個形狀。
 */
const VIEW: DocumentView = {
  id: 'd1', companyCode: 'AS', status: 'active',
  documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  lifecycleId: 'lc1', nodeId: null, nodeName: null,
  draftingCompanyId: null, draftingDeptId: null, draftingSectionId: null,
  primaryChiefId: null, secondaryChiefIds: [], usingDeptIds: [],
  edition: null, announcedDate: null, contentSummary: null,
};
const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
];
const form = (o: Partial<UsageFormRecord>): UsageFormRecord => ({
  id: 'f0', name: '', formNumber: null, blobPath: 'p', format: 'xlsx', size: 1,
  uploadedBy: 'admin', uploadedAt: '2026-06-01T00:00:00.000Z', ...o,
});
const POOL: UsageFormRecord[] = [
  form({ id: 'f1', name: '車輛分期申請書', formNumber: 'FM-SRC-001' }),
  form({ id: 'f2', name: '車輛分期申請書', formNumber: 'FM-SRC-002' }),
  form({ id: 'f3', name: '無編號表單' }),
];
const emptyPage: DocPage = { items: [], total: 0, page: 1, pageSize: 2000, hasNext: false };

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
        <DocumentEditPage />
      </MemoryRouter>
    </ToastProvider>,
  );

describe('DocumentEditPage — 使用表單之編號顯示與搜尋（2026-08-26 UX ②）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDocument).mockResolvedValue(VIEW);
    vi.mocked(endpoints.getDocumentLinks).mockResolvedValue([]);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
    vi.mocked(endpoints.getOrgUnits).mockResolvedValue([]);
    vi.mocked(endpoints.getCompanies).mockResolvedValue([]);
    vi.mocked(endpoints.getDocuments).mockResolvedValue(emptyPage);
    vi.mocked(endpoints.searchPersons).mockResolvedValue([]);
    vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
    vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
    vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue([]);
    vi.mocked(endpoints.getUsageFormPool).mockResolvedValue(POOL);
    vi.mocked(endpoints.getDocumentForms).mockResolvedValue([POOL[1]]); // 已關聯 FM-SRC-002
    mockAuth('ICSOPAdmin');
  });

  const formInput = (): HTMLElement => screen.getByLabelText('使用表單');

  it('已關聯表單之 chip 帶編號（getDocumentForms 路徑）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId('edForms-chips').textContent).toContain('FM-SRC-002 車輛分期申請書'),
    );
  });

  it('下拉可用編號搜尋，且已關聯者不重複出現', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
    await userEvent.click(formInput());
    await userEvent.type(formInput(), 'FM-SRC');

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'FM-SRC-001 車輛分期申請書',
    ]);
  });

  it('無編號表單僅顯示名稱（無前導空格、不出現 null）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
    await userEvent.click(formInput());

    const listbox = await screen.findByRole('listbox');
    const plain = within(listbox).getByRole('option', { name: '無編號表單' });
    expect(plain.textContent).toBe('無編號表單');
  });
});
