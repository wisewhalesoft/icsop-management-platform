import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentCreatePage } from './DocumentCreatePage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type { SessionUser, LifecycleView, DocumentListItem } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
];

function doc(over: Partial<DocumentListItem>): DocumentListItem {
  return {
    id: 'd0', status: 'active', documentNumber: '', documentName: '',
    lifecycleId: 'lc1', lifecycleName: '銷售及收款循環', nodeId: null,
    draftingCompanyId: null, draftingDeptId: null, draftingSectionId: null,
    primaryChiefId: null, edition: null, announcedDate: null, contentSummary: null,
    ...over,
  };
}

const renderPage = () => render(<MemoryRouter><DocumentCreatePage /></MemoryRouter>);

describe('DocumentCreatePage — F010 建立文件（移植 prototype 14）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
    vi.mocked(endpoints.getDocuments).mockResolvedValue([]);
  });

  it('ICSOPAdmin 渲染分步表單並載入循環下拉', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    expect(screen.getByLabelText(/ICSOP 文件編號/)).toBeInTheDocument();
    expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument();
    expect(screen.getByText(/循環與節點歸屬/)).toBeInTheDocument();
    expect(screen.getByText(/建立時為「未指派」/)).toBeInTheDocument();
  });

  it('非 ICSOPAdmin（Supervisor）→ 403', () => {
    mockAuth('Supervisor');
    renderPage();
    expect(screen.getByText(/無建立文件權限/)).toBeInTheDocument();
  });

  it('未選循環顯示 gate 提示；選定後消失', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    expect(screen.getByText(/請先選擇「所屬循環」/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    expect(screen.queryByText(/請先選擇「所屬循環」/)).not.toBeInTheDocument();
  });

  it('編號前綴依循環自動帶入；只填後段序號並組出完整編號送出', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createDocument).mockResolvedValue({} as never);
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    expect(screen.getByText('ICSOP-SRC-')).toBeInTheDocument(); // 前綴
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '車輛分期進件作業');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() =>
      expect(endpoints.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleId: 'lc1', status: 'active', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' }),
      ),
    );
  });

  it("版次 YY 與 NN 組出 26'01 隨送出", async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createDocument).mockResolvedValue({} as never);
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-02');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    await userEvent.type(screen.getByLabelText('版次年度'), '26');
    await userEvent.type(screen.getByLabelText('版次序號'), '1');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() =>
      expect(endpoints.createDocument).toHaveBeenCalledWith(expect.objectContaining({ edition: "26'01" })),
    );
  });

  it('缺必填 → 前端擋下、不呼叫 createDocument', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    expect(endpoints.createDocument).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/必填/);
  });

  it('即時唯一性：編號命中佔用（有效）文件 → 顯示 DUPLICATE 並擋下送出', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getDocuments).mockResolvedValue([
      doc({ id: 'x', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', status: 'active' }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    expect(screen.getByText(/DOCUMENT_NUMBER_DUPLICATE/)).toBeInTheDocument(); // 即時內嵌提示
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    expect(endpoints.createDocument).not.toHaveBeenCalled();
  });

  it('編號重複（後端 409）→ 顯示提示', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createDocument).mockRejectedValue(new ApiError(409, 'DOCUMENT_NUMBER_DUPLICATE'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '999-9-99');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(screen.getByText(/編號已存在/)).toBeInTheDocument());
  });
});
