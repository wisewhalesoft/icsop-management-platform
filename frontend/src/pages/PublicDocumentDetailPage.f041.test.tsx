/**
 * F041 §F2 AC-46／F019 AC-U8 — 前台文件詳情之 404 拒絕畫面。
 *
 * 權威：prototypes/04-public-document-detail.html:149-178（`#rejectOverlay`，不透明覆蓋）。
 * 三種成因（①文件確實不存在 ②文件存在但非已公告 ③業務子分類使用者之使用部門不相符，見
 * F041 AC-20／AC-21）在後端一律回同一組 404 `DOCUMENT_NOT_FOUND`（AC-21 已規定訊息文案逐字
 * 相同）；本檔驗證的是**前端**：同一個元件、同一段文案、DOM 不得殘留任何文件欄位值。
 *
 * ⚠ 本條會變更一個既有畫面之文案：現行實作之說明句為「文件可能尚未公告或已下架。」、圖示為
 * `inbox`、且無錯誤碼列——三者皆與 prototype 不符，依「prototype 為版面與文案之權威」原則以
 * prototype 為準（見 F041 spec AC-46 備註）。既有「返回文件瀏覽」按鈕不在 prototype 拒絕面板
 * 之定義範圍內，維持現狀、不得因本條而移除。
 *
 * ⚠ 本檔刻意不 mock `react-router-dom` 之 `useNavigate`（有別於同目錄之
 * `PublicDocumentDetailPage.test.tsx`）：AC-46 要求涵蓋「先渲染部分內容、再以覆蓋層遮蔽」之
 * 實作方式（prototype 檔頭明示拒絕面板為不透明覆蓋，即為此故）。此風險唯有透過**真實**路由切換
 * 才能重現——同一個 `<Route path="/public/documents/:id">` 元素在 id 參數改變時，React Router
 * 預設不會整個 remount，若元件未正確清空前一份文件之 state，殘留內容可能被扣在拒絕覆蓋層之下。
 * 若 mock 掉 `useNavigate`（如另一檔的 `navigateMock` no-op），路由完全不會真的切換，測不到此風險。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
    id: 'doc-a',
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
    contentSummary: '規範車輛分期案件之進件收件、資格初審與建檔流程。',
    attachments: [],
    usageForms: [],
    links: [
      { targetDocumentId: 'doc-b', targetNumber: 'ICSOP-SRC-102-1-01', targetName: '消金審核作業', targetStatus: 'active' },
    ],
    ...over,
  };
}

function renderAt(id: string) {
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

const LEAKED_FIELDS = [
  'ICSOP-SRC-101-1-01',
  '車輛分期進件作業',
  '企劃部',
  '營運管理部審查室',
  '規範車輛分期案件之進件收件、資格初審與建檔流程。',
];

function expectNoLeakedFields() {
  for (const text of LEAKED_FIELDS) {
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  vi.mocked(api.getOrgUnits).mockResolvedValue([]);
  vi.mocked(api.documentDownloadUrl).mockImplementation((id: string) => `/public/documents/${id}/download`);
  vi.mocked(api.documentPrintUrl).mockImplementation((id: string) => `/public/documents/${id}/print`);
  vi.mocked(api.getDocumentAppendices).mockResolvedValue([]);
});

describe('PublicDocumentDetailPage — F041 AC-46（404 拒絕畫面逐字文案＋單一成因不可辨＋不殘留文件欄位）', () => {
  it('逐字呈現 file-x 圖示、標題「查無此文件」、說明「查無此文件，或該文件尚未公告。」、錯誤碼列「DOCUMENT_NOT_FOUND · 404」', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockRejectedValue(new ApiError(404, 'DOCUMENT_NOT_FOUND'));
    const { container } = renderAt('doc-missing');

    expect(await screen.findByText('查無此文件')).toBeInTheDocument();
    expect(screen.getByText('查無此文件，或該文件尚未公告。')).toBeInTheDocument();
    expect(screen.getByText('DOCUMENT_NOT_FOUND · 404')).toBeInTheDocument();
    expect(container.querySelector('.lucide-file-x')).not.toBeNull();
  });

  it('拒絕畫面之 DOM 不得殘留任何文件欄位值', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockRejectedValue(new ApiError(404, 'DOCUMENT_NOT_FOUND'));
    renderAt('doc-missing');
    await screen.findByText('查無此文件');
    expectNoLeakedFields();
  });

  it('殘留內容回歸鎖：先完整載入文件 A，經同頁跨連結導向文件 B（B 觸發 404）→ A 之欄位值不得殘留於拒絕畫面之下', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockImplementation((id: string) =>
      id === 'doc-a'
        ? Promise.resolve(detailOf())
        : Promise.reject(new ApiError(404, 'DOCUMENT_NOT_FOUND')),
    );
    renderAt('doc-a');
    await screen.findByRole('heading', { name: '車輛分期進件作業' });

    const links = within(screen.getByTestId('link-list'));
    await userEvent.click(links.getByText('消金審核作業'));

    await screen.findByText('查無此文件');
    expectNoLeakedFields();
  });

  it('既有「返回文件瀏覽」按鈕維持不動（prototype 拒絕面板未定義此按鈕，範圍界線見 AC-46 備註）', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockRejectedValue(new ApiError(404, 'DOCUMENT_NOT_FOUND'));
    renderAt('doc-missing');
    await screen.findByText('查無此文件');
    expect(screen.getByRole('button', { name: /返回文件瀏覽/ })).toBeInTheDocument();
  });
});
