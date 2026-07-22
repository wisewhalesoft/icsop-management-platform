import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentCreatePage } from './DocumentCreatePage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type { SessionUser, LifecycleView } from '../api/types';

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

const renderPage = () => render(<MemoryRouter><DocumentCreatePage /></MemoryRouter>);

describe('DocumentCreatePage — F010 建立文件', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  });

  it('ICSOPAdmin 渲染表單並載入循環下拉', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    expect(screen.getByLabelText(/程序書編號/)).toBeInTheDocument();
    expect(screen.getByLabelText(/程序書書名/)).toBeInTheDocument();
  });

  it('非 ICSOPAdmin（Supervisor）→ 403', () => {
    mockAuth('Supervisor');
    renderPage();
    expect(screen.getByText(/無建立文件權限/)).toBeInTheDocument();
  });

  it('填妥 4 必填送出 → createDocument', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createDocument).mockResolvedValue({} as never);
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/程序書編號/), 'ICSOP-SRC-101-1-01');
    await userEvent.type(screen.getByLabelText(/程序書書名/), '車輛分期進件作業');
    await userEvent.click(screen.getByRole('button', { name: '建立文件' }));

    await waitFor(() =>
      expect(endpoints.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleId: 'lc1', status: 'active', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' }),
      ),
    );
  });

  it('缺必填 → 前端擋下、不呼叫 createDocument', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '建立文件' }));
    expect(endpoints.createDocument).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/必填/);
  });

  it('編號重複（後端 409）→ 顯示提示', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createDocument).mockRejectedValue(new ApiError(409, 'DOCUMENT_NUMBER_DUPLICATE'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/程序書編號/), 'DUP');
    await userEvent.type(screen.getByLabelText(/程序書書名/), '名');
    await userEvent.click(screen.getByRole('button', { name: '建立文件' }));

    await waitFor(() => expect(screen.getByText(/編號已存在/)).toBeInTheDocument());
  });
});
