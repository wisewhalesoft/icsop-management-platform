import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage, OrgUnitRecord } from '../api/types';

/**
 * 前台清單之 UX 稽核回歸測試（docs/specs/ux-audit-frontstage.md）。
 * 涵蓋 A-4（面板焦點管理）、A-5（命中不只靠顏色）、B-1（查詢狀態入 URL）、
 * B-2（關鍵字 debounce）、B-3（骨架佔位）。版面/文案之權威測試仍在 PublicListPage.test.tsx。
 */
vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

function mockAuth(orgCode: string | null = 'JAC00'): void {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode, name: '王小明' },
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function docItem(over: Partial<PublicListItem> = {}): PublicListItem {
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
  return {
    items,
    total: over.total ?? items.length,
    page: over.page ?? 1,
    pageSize: 50,
    hasNext: over.hasNext ?? false,
    hiddenCount: over.hiddenCount,
  };
}

const ORG_UNITS: OrgUnitRecord[] = [
  { companyCode: 'AS', orgCode: 'J0000', codePrefix: 'J', parentCode: '00000', tier: 'DIVISION', name: '營業二本部', descFull: '營業二本部', managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JA000', codePrefix: 'JA', parentCode: 'J0000', tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部', managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JAC00', codePrefix: 'JAC', parentCode: 'JA000', tier: 'SECTION', name: '審查室', descFull: '營運管理部審查室', managerEmpNo: null, isActive: true },
];

/** 觀測 URL query 之探針（B-1 之可觀察斷言點）。 */
function LocationProbe(): JSX.Element {
  const loc = useLocation();
  return <div data-testid="loc-search">{loc.search}</div>;
}

function renderPage(entry = '/public') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PublicListPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('前台清單 · UX 稽核回歸', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem()]));
  });

  describe('B-1 查詢狀態以 URL query 為單一真相（UX-5）', () => {
    it('自網址還原關鍵字/部門/循環/頁碼並據以查詢（可分享、重整不歸零）', async () => {
      renderPage('/public?q=%E8%BB%8A%E8%BC%9B&dept=JA000&cycle=lc1&page=2');
      await waitFor(() =>
        expect(api.getPublicDocuments).toHaveBeenCalledWith({
          keyword: '車輛',
          deptCode: 'JA000',
          lifecycleId: 'lc1',
          page: 2,
        }),
      );
      // 關鍵字亦回填至搜尋框
      expect(screen.getByLabelText('搜尋文件編號或名稱')).toHaveValue('車輛');
    });

    it('變更部門篩選寫回網址並重設頁碼', async () => {
      const user = userEvent.setup();
      renderPage('/public?page=3');
      await screen.findByText('車輛分期進件作業');

      await user.selectOptions(screen.getByLabelText('使用部門篩選'), 'JA000');

      await waitFor(() => {
        const search = screen.getByTestId('loc-search').textContent ?? '';
        expect(search).toContain('dept=JA000');
        expect(search).not.toContain('page=3'); // 篩選變更回到第 1 頁
      });
    });

    it('換頁寫回網址（page=2），第 1 頁不留參數', async () => {
      const user = userEvent.setup();
      vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem()], { hasNext: true }));
      renderPage();
      await screen.findByText('車輛分期進件作業');

      await user.click(screen.getByRole('button', { name: '下一頁' }));
      await waitFor(() =>
        expect(screen.getByTestId('loc-search').textContent).toContain('page=2'),
      );

      await user.click(screen.getByRole('button', { name: '上一頁' }));
      await waitFor(() =>
        expect(screen.getByTestId('loc-search').textContent).not.toContain('page'),
      );
    });

    it('清除篩選同時清空網址參數', async () => {
      const user = userEvent.setup();
      renderPage('/public?dept=JA000&cycle=lc1');
      await screen.findByText('車輛分期進件作業');

      await user.click(screen.getByRole('button', { name: '清除篩選' }));
      await waitFor(() => expect(screen.getByTestId('loc-search').textContent).toBe(''));
    });
  });

  describe('B-2 關鍵字 debounce（UX-89）', () => {
    it('連續輸入多字僅觸發一次額外查詢', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('車輛分期進件作業');
      const before = vi.mocked(api.getPublicDocuments).mock.calls.length;

      await user.type(screen.getByLabelText('搜尋文件編號或名稱'), '車輛分期');

      await waitFor(
        () =>
          expect(vi.mocked(api.getPublicDocuments).mock.calls.length).toBe(before + 1),
        { timeout: 2000 },
      );
      // 最末次查詢帶完整關鍵字（而非逐字之中間狀態）
      const last = vi.mocked(api.getPublicDocuments).mock.calls.at(-1)?.[0];
      expect(last).toMatchObject({ keyword: '車輛分期' });
    });
  });

  describe('A-4 手機篩選面板之焦點管理（UX-41）', () => {
    it('關閉時整個面板以 inert 退出焦點序列，開啟時解除', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('車輛分期進件作業');

      expect(screen.getByTestId('filter-sheet')).toHaveAttribute('inert');

      await user.click(screen.getByTestId('mobile-filter-trigger'));
      await waitFor(() =>
        expect(screen.getByTestId('filter-sheet')).not.toHaveAttribute('inert'),
      );
    });

    it('關閉後焦點還原至觸發鈕；Esc 亦可關閉', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('車輛分期進件作業');
      const trigger = screen.getByTestId('mobile-filter-trigger');

      await user.click(trigger);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: '關閉篩選' })).toHaveFocus(),
      );

      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.getByTestId('filter-sheet')).toHaveAttribute('inert');
        expect(trigger).toHaveFocus();
      });
    });
  });

  describe('A-5 使用部門命中不只以顏色表達（UX-37）', () => {
    it('命中使用者組織路徑之部門補上輔助技術可讀之說明', async () => {
      vi.mocked(api.getPublicDocuments).mockResolvedValue(
        pageOf([
          docItem({
            usingDeptIds: ['JAC00', 'JBB00'],
            usingDeptNames: ['審查室', '信用審查部'],
          }),
        ]),
      );
      renderPage();
      await screen.findByText('車輛分期進件作業');

      // 命中者（JAC00＝使用者所屬）帶說明；未命中者不帶
      const hit = screen.getByText('審查室', { selector: 'span.text-primary-700' });
      expect(within(hit).getByText('（您所屬部門）')).toBeInTheDocument();
      expect(screen.queryByText('信用審查部')).not.toHaveClass('text-primary-700');
    });
  });

  describe('B-3 載入骨架佔位（UX-19）', () => {
    it('載入中以三張與卡片同版面之骨架佔位，並具 status 語意', async () => {
      vi.mocked(api.getPublicDocuments).mockReturnValue(new Promise(() => {}));
      renderPage();

      const skeleton = await screen.findByTestId('list-skeleton');
      expect(skeleton).toHaveAttribute('role', 'status');
      expect(skeleton.children).toHaveLength(3);
    });
  });
});
