import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentCreatePage } from './DocumentCreatePage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, LifecycleView, UsageFormRecord, DocumentListPage } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

/**
 * 2026-08-26 使用者回報（UX ②）：新增文件之「使用表單」搜尋與顯示看不到、也搜不到**表單編號**。
 *
 * 🔴 斷言標的是**顯示字串本身**（`{編號} {名稱}`），不是「有沒有呼叫 usageFormOptionLabel」——
 * 後者只會證明 wiring，卻對「同名不同編號在下拉裡分不出來」這件事完全不設防。
 */
const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
];

const form = (o: Partial<UsageFormRecord>): UsageFormRecord => ({
  id: 'f0', name: '', formNumber: null, blobPath: 'p', format: 'xlsx', size: 1,
  uploadedBy: 'admin', uploadedAt: '2026-06-01T00:00:00.000Z', ...o,
});
/** 兩份**同名**表單只差編號 → 只給名稱時在下拉中完全無法區分（本缺陷之最小重現）。 */
const POOL: UsageFormRecord[] = [
  form({ id: 'f1', name: '車輛分期申請書', formNumber: 'FM-SRC-001' }),
  form({ id: 'f2', name: '車輛分期申請書', formNumber: 'FM-SRC-002' }),
  form({ id: 'f3', name: '無編號表單' }),
];

const emptyPage: DocumentListPage = { items: [], total: 0, page: 1, pageSize: 50, hasNext: false };

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
        <DocumentCreatePage />
      </MemoryRouter>
    </ToastProvider>,
  );

/** STEP4（使用表單）於選定循環後才開放。 */
async function openStep4(): Promise<void> {
  await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
  const sel = screen.getByLabelText(/所屬循環/) as HTMLSelectElement;
  const values = Array.from(sel.options).map((o) => o.value);
  await userEvent.selectOptions(sel, values.includes('lc1') ? 'lc1' : '銷售及收款循環');
}

const formInput = (): HTMLElement => screen.getByLabelText(/使用表單（自「使用表單管理」選取/);

describe('DocumentCreatePage — 使用表單之編號顯示與搜尋（2026-08-26 UX ②）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
    vi.mocked(endpoints.getDocuments).mockResolvedValue(emptyPage);
    vi.mocked(endpoints.getOrgUnits).mockResolvedValue([]);
    vi.mocked(endpoints.getCompanies).mockResolvedValue([{ companyCode: 'AS', companyName: '和潤企業股份有限公司' }]);
    vi.mocked(endpoints.searchPersons).mockResolvedValue([]);
    vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
    vi.mocked(endpoints.getUsageFormPool).mockResolvedValue(POOL);
    mockAuth('ICSOPAdmin');
  });

  it('下拉選項顯示「{編號} {名稱}」；無編號者僅名稱（不得有前導空格或 null）', async () => {
    renderPage();
    await openStep4();
    await userEvent.click(formInput());

    expect(await screen.findByRole('option', { name: 'FM-SRC-001 車輛分期申請書' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'FM-SRC-002 車輛分期申請書' })).toBeInTheDocument();
    const plain = screen.getByRole('option', { name: '無編號表單' });
    expect(plain.textContent).toBe('無編號表單');
  });

  it('可用**編號**搜尋（過濾以 label 為準）：輸入 FM-SRC-002 只留下該份', async () => {
    renderPage();
    await openStep4();
    await userEvent.click(formInput());
    await userEvent.type(formInput(), 'FM-SRC-002');

    // 🔴 以 listbox 限定範圍：頁面上的 <select>（循環／狀態）其 <option> 同樣是 option 角色，
    // 不限定會把它們一起撈進來，斷言就再也證明不了「下拉只剩這一份」。
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'FM-SRC-002 車輛分期申請書',
    ]);
  });

  it('選取後之 chip 亦帶編號（與下拉同一組字，不會上下兩處各顯示一種）', async () => {
    renderPage();
    await openStep4();
    await userEvent.click(formInput());
    await userEvent.click(await screen.findByRole('option', { name: 'FM-SRC-001 車輛分期申請書' }));

    const chips = screen.getByTestId('dForms-chips');
    expect(chips.textContent).toContain('FM-SRC-001 車輛分期申請書');
  });
});
