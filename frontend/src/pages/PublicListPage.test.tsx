import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage, OrgUnitRecord } from '../api/types';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

function mockAuth(orgCode: string | null = 'JAC00') {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode, name: '王小明' },
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function docItem(over: Partial<PublicListItem>): PublicListItem {
  return {
    id: over.id ?? 'd1',
    documentNumber: over.documentNumber ?? 'ICSOP-SRC-101-1-01',
    documentName: over.documentName ?? '車輛分期進件作業',
    lifecycleId: over.lifecycleId ?? 'lc1',
    lifecycleName: over.lifecycleName ?? '銷售及收款循環',
    draftingDeptId: over.draftingDeptId ?? 'JA000',
    draftingDeptName: over.draftingDeptName ?? '營運管理部',
    usingDeptIds: over.usingDeptIds ?? ['JAC00'],
    usingDeptNames: over.usingDeptNames ?? ['審查室'],
    status: over.status ?? 'active',
    displayStatus: over.displayStatus ?? 'announced',
    announcedDate: over.announcedDate ?? '2026-01-01T00:00:00.000Z',
    contentSummary: over.contentSummary ?? '進件收件與資格初審流程。',
    pinned: over.pinned ?? false,
  };
}

function pageOf(items: PublicListItem[], over: Partial<PublicPage> = {}): PublicPage {
  return { items, total: over.total ?? items.length, page: over.page ?? 1, pageSize: 50, hasNext: over.hasNext ?? false };
}

const ORG_UNITS: OrgUnitRecord[] = [
  { companyCode: 'AS', orgCode: 'J0000', codePrefix: 'J', parentCode: '00000', tier: 'DIVISION', name: '營業二本部', descFull: null, managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JA000', codePrefix: 'JA', parentCode: 'J0000', tier: 'DEPARTMENT', name: '營運管理部', descFull: null, managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JAC00', codePrefix: 'JAC', parentCode: 'JA000', tier: 'SECTION', name: '審查室', descFull: null, managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JCHA0', codePrefix: 'JCHA', parentCode: 'JCH00', tier: 'SUBSECTION', name: '醫療一課', descFull: null, managerEmpNo: null, isActive: true },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/public']}>
      <PublicListPage />
    </MemoryRouter>,
  );
}

describe('PublicListPage（F019 前台清單）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})]));
  });

  it('TS-F019-029/030 卡片顯示編號/名稱/制定部門/使用部門/狀態/公告日期（名稱解析、非 undefined）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const card = within(screen.getByTestId('rest-list')); // 卡片內查詢（排除下拉選項同名字串）
    expect(card.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(card.getByText('營運管理部')).toBeInTheDocument(); // 制定部門（解析名稱）
    expect(card.getByText('審查室')).toBeInTheDocument(); // 使用部門（解析名稱）
    expect(card.getByText('2026-01-01')).toBeInTheDocument(); // 公告日期
    expect(card.getByText('已公告')).toBeInTheDocument(); // 顯示狀態
  });

  it('置頂區與其餘區依 pinned 旗標分區呈現', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(
      pageOf([
        docItem({ id: 'p', documentName: '置頂文件', pinned: true }),
        docItem({ id: 'r', documentName: '其他文件', pinned: false }),
      ]),
    );
    renderPage();
    await screen.findByText('置頂文件');
    expect(within(screen.getByTestId('pinned-list')).getByText('置頂文件')).toBeInTheDocument();
    expect(within(screen.getByTestId('rest-list')).getByText('其他文件')).toBeInTheDocument();
  });

  it('TS-F019-019 查無符合 → 空狀態（非錯誤畫面）', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([], { total: 0 }));
    renderPage();
    expect(await screen.findByText('查無符合結果')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('TS-F019-031 部門篩選下拉呈現組織樹各層級（含課層葉節點以外之上層）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const deptSelect = screen.getByLabelText('使用部門篩選');
    const opts = within(deptSelect).getAllByRole('option').map((o) => o.textContent?.trim());
    expect(opts).toContain('營業二本部'); // 本部層
    expect(opts).toContain('營運管理部'); // 部層
    expect(opts).toContain('審查室'); // 處室層
  });

  it('TS-F019-028 清除篩選 → 重置關鍵字並重新查詢完整清單', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const search = screen.getByLabelText('搜尋文件編號或名稱');
    await userEvent.type(search, '消費');
    await waitFor(() => expect(api.getPublicDocuments).toHaveBeenCalledWith(expect.objectContaining({ keyword: '消費' })));
    await userEvent.click(screen.getByText('清除篩選'));
    expect((search as HTMLInputElement).value).toBe('');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: undefined })),
    );
  });

  it('TS-F019-032 點擊文件卡片 → 導向詳情/檢視器路由', async () => {
    renderPage();
    const title = await screen.findByText('車輛分期進件作業');
    await userEvent.click(title);
    expect(navigateMock).toHaveBeenCalledWith('/public/documents/d1');
  });

  it('搜尋以後端為權威：關鍵字經 API 傳遞（非前端過濾）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.type(screen.getByLabelText('搜尋文件編號或名稱'), '2026');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenCalledWith(expect.objectContaining({ keyword: '2026' })),
    );
  });
});

describe('PublicListPage RWD（F021 · unit 可驗證範圍）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})]));
  });

  it('TS-F021-001/002 斷點切換（resize）時搜尋關鍵字與篩選狀態不遺失', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const search = screen.getByLabelText('搜尋文件編號或名稱') as HTMLInputElement;
    await userEvent.type(search, '審查');
    // 模擬平板橫/直向切換（resize 事件）
    window.dispatchEvent(new Event('resize'));
    expect(search.value).toBe('審查'); // 狀態保留（React state 不因 resize 卸載）
  });

  it('TS-F021-008 篩選列具響應式版面 class（弱代理，防改版誤刪 responsive utility）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const bar = screen.getByTestId('filter-bar');
    // flex-col（手機直排）→ sm:flex-row（桌機橫排）之響應式切換
    expect(bar.className).toMatch(/flex-col/);
    expect(bar.className).toMatch(/sm:flex-row/);
  });

  it('TS-F021-003 斷點切換時分頁頁碼不遺失（防禦性延伸）', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})], { total: 60, hasNext: true }));
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.click(screen.getByLabelText('下一頁'));
    await waitFor(() => expect(api.getPublicDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    window.dispatchEvent(new Event('resize'));
    expect(screen.getByText('第 2 頁')).toBeInTheDocument(); // 頁碼狀態不因 resize 重置
  });
});
