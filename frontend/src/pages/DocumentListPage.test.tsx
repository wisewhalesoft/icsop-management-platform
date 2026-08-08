import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage } from './DocumentListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser, DocumentListItem, DocumentListPage as DocPage,
  DocumentLinkView, DocumentAttachmentRecord,
} from '../api/types';

const navigateMock = vi.fn();
const openMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const doc = (over: Partial<DocumentListItem>): DocumentListItem => ({
  id: 'd', status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc',
  lifecycleName: '銷售及收款循環', nodeId: 'node1',
  draftingCompanyId: '00000', draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  draftingCompanyName: '和潤企業股份有限公司', draftingDeptName: '企劃部', draftingSectionName: '車輛行銷室',
  primaryChiefId: '20050', primaryChiefName: '陳彥廷',
  edition: "26'01", announcedDate: '2020-01-01T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...over,
});

const page = (items: DocumentListItem[]): DocPage => ({
  items, total: items.length, page: 1, pageSize: 2000, hasNext: false,
});

const LINK_TO_D2: DocumentLinkView = {
  linkId: 'l1', targetDocumentId: 'd2', targetNumber: 'ICSOP-PPC-101-2-02',
  targetName: '消費分期產品政策及規範作業', targetStatus: 'active',
};

const DOCS: DocumentListItem[] = [
  doc({
    id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
    lifecycleName: '銷售及收款循環', status: 'active', announcedDate: '2020-01-01T00:00:00.000Z',
    icsopPdfBlobPath: 'documents/d1/icsop_pdf/abc.pdf', icsopPdfFileName: '車輛分期進件作業_v1.3.pdf',
    links: [LINK_TO_D2],
  }),
  doc({
    // F040 AC-31：循環別下拉之選項值與篩選鍵為 lifecycleId，故不同 lifecycleName 必須配不同
    // lifecycleId——後端之 lifecycleName 係由 lifecycleId 解析而來，同 id 異名為不可達狀態。
    id: 'd2', lifecycleId: 'lc2', documentNumber: 'ICSOP-PPC-101-2-02', documentName: '消費分期產品政策及規範作業',
    lifecycleName: '產品企劃循環', draftingDeptName: '消費分期營業部', draftingSectionName: null,
    primaryChiefName: '黃雅琪', status: 'active', announcedDate: '2099-01-01T00:00:00.000Z', nodeId: null,
  }),
];

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;
const attachment = (over: Partial<DocumentAttachmentRecord>): DocumentAttachmentRecord => ({
  id: 'a1', documentId: 'd2', type: 'ICSOP_PDF', fileName: '消費分期產品政策及規範作業_v1.0.pdf',
  blobPath: 'documents/d2/icsop_pdf/zzz.pdf', contentType: 'application/pdf', size: 1024,
  uploadedBy: 'admin', uploadedAt: '2026-06-01T00:00:00.000Z', ...over,
});

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentListPage />
      </MemoryRouter>
    </ToastProvider>,
  );

describe('DocumentListPage — F017 後台程序書清單（移植 prototype 13）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDocuments).mockResolvedValue(page(DOCS));
    vi.mocked(endpoints.downloadAttachment).mockResolvedValue({ url: 'https://blob/x', expiresInSeconds: 300 });
    vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([attachment({})]);
    vi.stubGlobal('open', openMock);
  });

  it('載入後渲染文件列（編號、書名、制定公司/室長名稱）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.getAllByText('和潤企業股份有限公司').length).toBeGreaterThan(0);
    expect(screen.getByText('陳彥廷')).toBeInTheDocument();
  });

  it('以 pageSize 大值一次載入完整工作集', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(endpoints.getDocuments).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 2000 })));
  });

  it('14 欄表頭齊全', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    for (const h of ['制定公司', '制定部門', '制定室別', '當責室長', '狀態', '檔案', '樹狀圖', '程序書編號', '程序書書名', '版次', '內容摘要', '連結點程序書', '公告日期', '循環別']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(h) })).toBeInTheDocument();
    }
  });

  it('統計卡顯示總數＝2', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('程序書數量（總數）')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('ICSOPAdmin 顯示建立程序書與每列編輯鈕', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /建立程序書/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /編輯 ICSOP-SRC-101-1-01/ })).toBeInTheDocument();
  });

  it('Supervisor 唯讀：無建立、無編輯鈕、顯示唯讀說明', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /建立程序書/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /編輯 ICSOP-SRC-101-1-01/ })).not.toBeInTheDocument();
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
  });

  it('User 無讀取權 → 403', () => {
    mockAuth('User');
    renderPage();
    expect(screen.getByText(/無程序書管理權限/)).toBeInTheDocument();
  });

  it('點書名導向檢視、點編輯導向編輯頁', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '車輛分期進件作業' }));
    expect(navigateMock).toHaveBeenCalledWith('/admin/documents/d1');
    await userEvent.click(screen.getByRole('button', { name: /編輯 ICSOP-SRC-101-1-01/ }));
    expect(navigateMock).toHaveBeenCalledWith('/admin/documents/d1/edit');
  });

  it('未指派節點顯示警示圖示', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('消費分期產品政策及規範作業')).toBeInTheDocument());
    const row = screen.getByText('消費分期產品政策及規範作業').closest('tr')!;
    expect(within(row).getByTitle('尚未指派節點')).toBeInTheDocument();
  });

  it('循環別篩選：選定後僅顯示該循環之文件', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('循環別'));
    await userEvent.click(await screen.findByRole('option', { name: '產品企劃循環' }));
    await waitFor(() => expect(screen.queryByText('車輛分期進件作業')).not.toBeInTheDocument());
    expect(screen.getByText('消費分期產品政策及規範作業')).toBeInTheDocument();
  });

  it('依公告日期排序可切換（表頭可點）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /依公告日期排序/ }));
    // 升冪：最早（2020）在前 → 車輛分期進件作業 於較前列
    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1];
    expect(within(firstDataRow).getByText('車輛分期進件作業')).toBeInTheDocument();
  });

  describe('「檔案」欄（prototype 13 fileBtn）', () => {
    it('TS-D-015 有 ICSOP PDF 之列顯示下載鈕，title＝下載 {檔名}', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const btn = within(rowOf('車輛分期進件作業')).getByTitle('下載 車輛分期進件作業_v1.3.pdf');
      expect(btn.tagName).toBe('BUTTON');
    });

    it('TS-D-016 無 ICSOP PDF 之列顯示「—」（非按鈕）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('消費分期產品政策及規範作業')).toBeInTheDocument());
      const row = rowOf('消費分期產品政策及規範作業');
      expect(within(row).queryByTitle(/^下載 /)).not.toBeInTheDocument();
      // 檔案欄（第 6 欄，index 5）為「—」
      expect(row.querySelectorAll('td')[5].textContent).toBe('—');
    });

    it('TS-D-017 點擊檔案下載鈕 → 以該 blobPath 呼叫既有受控下載端點並開新分頁', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      await userEvent.click(within(rowOf('車輛分期進件作業')).getByTitle('下載 車輛分期進件作業_v1.3.pdf'));
      await waitFor(() =>
        expect(endpoints.downloadAttachment).toHaveBeenCalledWith('documents/d1/icsop_pdf/abc.pdf'),
      );
      expect(openMock).toHaveBeenCalledWith('https://blob/x', '_blank', 'noopener,noreferrer');
    });
  });

  describe('「連結點程序書」欄（prototype 13 linkCell）', () => {
    it('TS-D-018 有連結之列顯示編號 pill，title 含完整「編號 書名」', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const pill = within(rowOf('車輛分期進件作業')).getByTitle(
        '下載連結點程序書：ICSOP-PPC-101-2-02 消費分期產品政策及規範作業',
      );
      expect(pill).toHaveTextContent('ICSOP-PPC-101-2-02');
      expect(pill).not.toHaveTextContent('消費分期產品政策及規範作業');
    });

    it('TS-D-019 無連結之列顯示「—」', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('消費分期產品政策及規範作業')).toBeInTheDocument());
      // 連結點程序書欄（第 12 欄，index 11）
      expect(rowOf('消費分期產品政策及規範作業').querySelectorAll('td')[11].textContent).toBe('—');
    });

    it('TS-D-020 一列多個連結 → 顯示多個 pill', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.getDocuments).mockResolvedValue(
        page([
          doc({
            id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
            links: [
              LINK_TO_D2,
              { linkId: 'l2', targetDocumentId: 'd5', targetNumber: 'ICSOP-SRC-102-1-01', targetName: '車輛分期對保作業', targetStatus: 'active' },
            ],
          }),
        ]),
      );
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const cell = rowOf('車輛分期進件作業').querySelectorAll('td')[11];
      expect(cell.querySelectorAll('button')).toHaveLength(2);
    });

    it('TS-D-021 點擊 pill → 以既有受控下載路徑下載「目標文件」之 ICSOP PDF（非導覽）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      await userEvent.click(
        within(rowOf('車輛分期進件作業')).getByTitle(
          '下載連結點程序書：ICSOP-PPC-101-2-02 消費分期產品政策及規範作業',
        ),
      );
      // 針對「目標文件」取其附件 → 走同一支受控下載端點（不新增第二條下載路由）
      await waitFor(() => expect(endpoints.getDocumentAttachments).toHaveBeenCalledWith('d2'));
      await waitFor(() =>
        expect(endpoints.downloadAttachment).toHaveBeenCalledWith('documents/d2/icsop_pdf/zzz.pdf'),
      );
      expect(openMock).toHaveBeenCalledWith('https://blob/x', '_blank', 'noopener,noreferrer');
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it('TS-D-021b 目標文件無 ICSOP PDF → 以既有錯誤提示呈現，不崩潰', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      await userEvent.click(
        within(rowOf('車輛分期進件作業')).getByTitle(
          '下載連結點程序書：ICSOP-PPC-101-2-02 消費分期產品政策及規範作業',
        ),
      );
      // SYS-1：下載失敗回饋改以 toast 呈現（不再是內嵌 role=alert）。
      expect(await screen.findByText(/無法下載/)).toBeInTheDocument();
      expect(endpoints.downloadAttachment).not.toHaveBeenCalled();
      expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
    });
  });

  describe('當責室長「+N」次要室長徽章（prototype 13 chiefCell）', () => {
    it('G-DOC-001 有次要室長之列顯示 +N 徽章，title＝次要姓名清單', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.getDocuments).mockResolvedValue(
        page([
          doc({
            id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
            primaryChiefName: '陳彥廷', secondaryChiefCount: 2, secondaryChiefNames: ['林建宏', '王志文'],
          }),
          doc({
            id: 'd2', documentNumber: 'ICSOP-PPC-101-2-02', documentName: '消費分期產品政策及規範作業',
            primaryChiefName: '黃雅琪', secondaryChiefCount: 0, secondaryChiefNames: [],
          }),
        ]),
      );
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const badge = within(rowOf('車輛分期進件作業')).getByTitle('次要：林建宏、王志文');
      expect(badge).toHaveTextContent('+2');
      // 無次要室長之列不顯示徽章。
      expect(within(rowOf('消費分期產品政策及規範作業')).queryByTitle(/^次要：/)).not.toBeInTheDocument();
    });
  });

  describe('篩選格緊湊密度（G-DOC-005 density=filter）', () => {
    it('篩選 label 採 text-[11px]（清單篩選密度，非表單密度）', async () => {
      mockAuth('ICSOPAdmin');
      const { container } = renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const label = container.querySelector('label[for="filter-cycle"]');
      expect(label?.className).toContain('text-[11px]');
    });
  });
});
