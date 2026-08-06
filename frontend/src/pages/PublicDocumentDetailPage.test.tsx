import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicDocumentDetailPage } from './PublicDocumentDetailPage';
import { ToastProvider } from '../components/useToast';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import type { PublicDocumentDetail } from '../api/types';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

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
    id: 'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f',
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
    secondaryChiefIds: ['e2'],
    secondaryChiefNames: ['林建宏（信用審查部 企金室 室長）'],
    usingDeptIds: ['JAC00', 'JBB00'],
    usingDeptNames: ['營運管理部審查室', '信用審查部'],
    edition: "26'01",
    announcedDate: '2026-01-01T00:00:00.000Z',
    contentSummary: '規範車輛分期案件之進件收件、資格初審與建檔流程。',
    attachments: [
      { type: 'ICSOP_PDF', fileName: '車輛分期進件作業_v1.3.pdf', blobPath: 'blob/icsop.pdf' },
      { type: 'OJT_SIGNIN', fileName: '車輛分期進件作業_OJT簽到表.pdf', blobPath: 'blob/ojt.pdf' },
    ],
    usageForms: [
      { id: 'f1', name: '進件申請書.xlsx', format: 'xlsx' },
      { id: 'f2', name: '支票託收登記表.xlsx', format: 'xlsx' },
    ],
    links: [
      { targetDocumentId: 't1', targetNumber: 'ICSOP-SRC-101-2-00', targetName: '消金審核作業', targetStatus: 'active' },
      { targetDocumentId: 't2', targetNumber: 'ICSOP-SRC-102-1-01', targetName: '車輛分期對保作業（舊）', targetStatus: 'void' },
    ],
    ...over,
  };
}

function renderDetail(id = 'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/public/documents/${id}`]}>
        <Routes>
          <Route path="/public/documents/:id" element={<PublicDocumentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('PublicDocumentDetailPage（G-PUB-020 前台文件詳情）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    vi.mocked(api.documentDownloadUrl).mockImplementation((id) => `/public/documents/${id}/download`);
    vi.mocked(api.documentPrintUrl).mockImplementation((id) => `/public/documents/${id}/print`);
    vi.mocked(api.getDocumentAppendices).mockResolvedValue([]); // F039：預設無關聯附錄，個別測試覆寫
  });

  it('以路由 id 呼叫 getPublicDocumentDetail 並顯示標題（編號＋書名＋狀態）', async () => {
    renderDetail('doc-42');
    await waitFor(() =>
      expect(api.getPublicDocumentDetail).toHaveBeenCalledWith('doc-42'),
    );
    expect(await screen.findByRole('heading', { name: '車輛分期進件作業' })).toBeInTheDocument();
    // 標題列狀態 pill（沿用前台派生模型：announced → 已公告）。
    expect(screen.getAllByText('已公告').length).toBeGreaterThan(0);
  });

  it('breadcrumb「文件瀏覽」連回前台清單 /public', async () => {
    renderDetail();
    const crumb = await screen.findByRole('link', { name: /文件瀏覽/ });
    expect(crumb).toHaveAttribute('href', '/public');
  });

  it('19 欄唯讀清單逐項呈現（系統 UUID、制定三級、當責室長、使用部門、版次、循環、節點、公告日期）', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const fields = within(screen.getByTestId('field-list'));
    expect(fields.getByText('系統 UUID')).toBeInTheDocument();
    expect(fields.getByText('a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f')).toBeInTheDocument();
    expect(fields.getByText('和潤企業股份有限公司')).toBeInTheDocument(); // 制定公司
    expect(fields.getByText('企劃部')).toBeInTheDocument(); // 制定部門
    expect(fields.getByText('車輛行銷室')).toBeInTheDocument(); // 制定室別
    expect(fields.getByText('陳彥廷（企劃部 車輛行銷室 室長）')).toBeInTheDocument(); // 當責室長-主要
    expect(fields.getByText('林建宏（信用審查部 企金室 室長）')).toBeInTheDocument(); // 次要 chip
    expect(fields.getByText('營運管理部審查室')).toBeInTheDocument(); // 使用部門 chip
    expect(fields.getByText("26'01")).toBeInTheDocument(); // 版次
    expect(fields.getByText('銷售及收款循環')).toBeInTheDocument(); // 循環別
    expect(fields.getByText('進件作業')).toBeInTheDocument(); // 所屬節點名（非 nodeId）
    expect(fields.getByText('2026-01-01')).toBeInTheDocument(); // 公告日期
  });

  it('「檢視」導向檢視器路由 /:id/view；下載/列印為受控端點連結', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf({ id: 'doc-9' }));
    renderDetail('doc-9');
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    expect(screen.getByRole('link', { name: /檢視/ })).toHaveAttribute(
      'href',
      '/public/documents/doc-9/view',
    );
    expect(screen.getByRole('link', { name: '下載文件' })).toHaveAttribute(
      'href',
      '/public/documents/doc-9/download',
    );
    expect(screen.getByRole('link', { name: '列印文件' })).toHaveAttribute(
      'href',
      '/public/documents/doc-9/print',
    );
  });

  it('附件區呈現 ICSOP PDF（燒錄浮水印註記）與 OJT；下載走受控端點＋toast', async () => {
    vi.mocked(api.downloadAttachment).mockResolvedValue({ url: 'https://x/icsop', expiresInSeconds: 60 });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const atts = within(screen.getByTestId('attachment-list'));
    expect(atts.getByText('ICSOP PDF · 檢視/下載將燒錄浮水印')).toBeInTheDocument();
    expect(atts.getByText('OJT 實體簽到表')).toBeInTheDocument();

    await userEvent.click(atts.getByRole('button', { name: '下載 車輛分期進件作業_v1.3.pdf' }));
    await waitFor(() => expect(api.downloadAttachment).toHaveBeenCalledWith('blob/icsop.pdf'));
    expect(openSpy).toHaveBeenCalled();
    expect(await screen.findByText(/已開始下載/)).toBeInTheDocument();
    openSpy.mockRestore();
  });

  it('使用表單區下載呼叫 downloadUsageForm(detailId, formId)', async () => {
    vi.mocked(api.downloadUsageForm).mockResolvedValue({ url: 'https://x/form', expiresInSeconds: 60 });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const forms = within(screen.getByTestId('usage-form-list'));
    await userEvent.click(forms.getByRole('button', { name: '下載 進件申請書.xlsx' }));
    await waitFor(() =>
      expect(api.downloadUsageForm).toHaveBeenCalledWith(
        'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f',
        'f1',
      ),
    );
    openSpy.mockRestore();
  });

  it('文件連結點：點擊跨連結導向該目標之詳情；作廢目標標記「僅供辨識」', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const links = within(screen.getByTestId('link-list'));
    expect(links.getByText('作廢')).toBeInTheDocument();
    expect(links.getByText('目標作廢，僅供辨識')).toBeInTheDocument();
    await userEvent.click(links.getByText('消金審核作業'));
    expect(navigateMock).toHaveBeenCalledWith('/public/documents/t1');
  });

  it('404（非已公告/不存在）→ 查無此文件（非錯誤畫面）', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockRejectedValue(
      new ApiError(404, 'DOCUMENT_NOT_FOUND'),
    );
    renderDetail();
    expect(await screen.findByText('查無此文件')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('非 404 錯誤 → 顯示錯誤橫幅', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR'),
    );
    renderDetail();
    expect(await screen.findByRole('alert')).toHaveTextContent('NETWORK_ERROR');
  });

  describe('F039 附錄依 sortOrder 遞增呈現（prototype 04；前後台順序一致，AC-25）', () => {
    const APPX = [
      { id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx' as const, sortOrder: 1 },
      { id: 'ax2', name: '名詞定義說明.pdf', format: 'pdf' as const, sortOrder: 2 },
      { id: 'ax8', name: '共用名詞附錄.xlsx', format: 'xlsx' as const, sortOrder: 3 },
    ];

    it('AC-25 三筆附錄依 sortOrder 遞增列出，各自提供下載', async () => {
      vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPX);
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      const names = screen
        .getAllByText(/^(作業流程對照表\.xlsx|名詞定義說明\.pdf|共用名詞附錄\.xlsx)$/)
        .map((e) => e.textContent);
      expect(names).toEqual(['作業流程對照表.xlsx', '名詞定義說明.pdf', '共用名詞附錄.xlsx']);
    });

    it('AC-27 前台下載附錄 → 呼叫 downloadDocumentAppendix(documentId, appendixId)（寫入稽核，與後台管理端下載不同）', async () => {
      vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPX);
      vi.mocked(api.downloadDocumentAppendix).mockResolvedValue({ url: 'https://x/appendix', expiresInSeconds: 60 });
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      await userEvent.click(screen.getByRole('button', { name: /下載.*作業流程對照表\.xlsx/ }));
      await waitFor(() =>
        expect(api.downloadDocumentAppendix).toHaveBeenCalledWith(
          'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f',
          'ax1',
        ),
      );
      expect(openSpy).toHaveBeenCalled();
      openSpy.mockRestore();
    });

    it('AC-26 無關聯附錄 → 顯示「無附錄」，非錯誤、非空白區塊', async () => {
      vi.mocked(api.getDocumentAppendices).mockResolvedValue([]);
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      expect(await screen.findByText('無附錄')).toBeInTheDocument();
    });

    it('AC-29 附錄下載內容為原始位元組，呈現層不含浮水印徽章（不同於 ICSOP PDF 附件）', async () => {
      vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPX);
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      const appendixSection = screen.getByText('作業流程對照表.xlsx').closest('div')!;
      expect(within(appendixSection).queryByText(/燒錄浮水印/)).toBeNull();
    });
  });
});
