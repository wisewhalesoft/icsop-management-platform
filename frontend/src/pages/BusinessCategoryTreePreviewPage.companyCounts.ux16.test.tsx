/**
 * F043 UX16 delta — `AC-UX33`／`AC-UX34`／`AC-UX35`／`AC-UX36`（樹狀圖節點之制定公司統計，
 * 項 12；人類裁決 D）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md#ux16-delta。
 *
 * ⚠ 對實作全盲：沿用既有 `BusinessCategoryTreePreviewPage.test.tsx` 之型別 cast 手法，本檔另以
 * 本地介面擴充 `companyCounts`（additive，既有 `PreviewNode` 之 `mountedDocCount` 一格不動）。
 *
 * 🔴 三種鑑別力分置三個節點（`AC-UX34` 2026-09-22 第三輪就地改寫；prototype 29／30 共用同一份
 * 示範語料，湊單節點三家公司會破壞兩支 prototype 之推導一致性）：
 *   p1＝昇冪鑑別點（含 AS 與字母序在前之公司，AS 須排最後——AS 恰是登錄順序之首、昇冪之末）
 *   p2＝sentinel 殿後（含 companyCode 未指定之掛載）
 *   p3＝0 不顯示（全部掛載來自單一公司）
 * 🔴 本檔不驗證 `docCountsByNodeAndCompany()` 之 SQL join／GROUP BY 是否正確（architecture-spec
 * §16.12 #1 明文列為盲區），只驗證「給定分類後之列表如何呈現」。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BusinessCategoryTreePreviewPage } from './BusinessCategoryTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

interface NodeCompanyCount { companyCode: string; count: number }
interface PreviewNodeUx16 {
  id: string; businessCategoryId: string; name: string;
  positionX: number; positionY: number; mountedDocCount: number;
  companyCounts?: NodeCompanyCount[];
}
interface PreviewEdge { id: string; sourceNodeId: string; targetNodeId: string }
interface BcTreePreviewUx16 {
  businessCategory: { id: string; name: string; subcategory: string | null };
  graph: { nodes: PreviewNodeUx16[]; edges: PreviewEdge[] };
  watermark: string;
}
interface BcTreeEndpointsUx16 {
  getBusinessCategoryTreePreview: (id: string) => Promise<BcTreePreviewUx16>;
}
const bcApi = endpoints as unknown as BcTreeEndpointsUx16;

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const PREVIEW: BcTreePreviewUx16 = {
  businessCategory: { id: 'bc1', name: '授信', subcategory: '消金' },
  graph: {
    nodes: [
      // p1：昇冪鑑別點——含 AS（登錄順序之首）與 AD（昇冪之首），AS 須排最後。
      { id: 'p1', businessCategoryId: 'bc1', name: '進件收件作業', positionX: 0, positionY: 0, mountedDocCount: 4, companyCounts: [{ companyCode: 'AD', count: 1 }, { companyCode: 'AS', count: 3 }] },
      // p2：sentinel 殿後——含一筆 companyCode 未指定之掛載。
      { id: 'p2', businessCategoryId: 'bc1', name: '徵審作業', positionX: 0, positionY: 0, mountedDocCount: 3, companyCounts: [{ companyCode: 'AJ', count: 2 }, { companyCode: '__unspecified__', count: 1 }] },
      // p3：0 不顯示——全部掛載來自單一公司（AD），其餘三家不得逐列列出。
      { id: 'p3', businessCategoryId: 'bc1', name: '核准作業', positionX: 0, positionY: 0, mountedDocCount: 5, companyCounts: [{ companyCode: 'AD', count: 5 }] },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'p1', targetNodeId: 'p2' },
      { id: 'e2', sourceNodeId: 'p2', targetNodeId: 'p3' },
    ],
  },
  watermark: 'ICSOP INTERNAL',
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin/business-categories/bc1/preview']}>
      <BusinessCategoryTreePreviewPage />
    </MemoryRouter>,
  );

describe('BusinessCategoryTreePreviewPage — UX16 delta AC-UX33／AC-UX34／AC-UX35（節點制定公司統計）', () => {
  it('AC-UX33 DOM 契約：容器 role=list data-testid=node-company-counts，每列 role=listitem 帶 data-company-code／data-company-doc-count，文字為「{公司簡稱} {n}」', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategoryTreePreview).mockResolvedValue(PREVIEW);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());

    const container = within(screen.getByTestId('tree-node-p1')).getByTestId('node-company-counts');
    expect(container.getAttribute('role')).toBe('list');
    const items = within(container).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    const asItem = items.find((el) => el.getAttribute('data-company-code') === 'AS')!;
    expect(asItem).toBeDefined();
    expect(asItem.getAttribute('data-company-doc-count')).toBe('3');
    expect(asItem.textContent?.trim()).toBe('和潤企業 3');
  });

  it('🔴 AC-UX34 ①：昇冪順序——p1 之 AD/AS 兩列，AS（登錄順序之首）須排在昇冪之末（AD 在前）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategoryTreePreview).mockResolvedValue(PREVIEW);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());

    const container = within(screen.getByTestId('tree-node-p1')).getByTestId('node-company-counts');
    const codes = within(container).getAllByRole('listitem').map((el) => el.getAttribute('data-company-code'));
    expect(codes).toEqual(['AD', 'AS']); // 🔴 不是登錄順序（AS,AD,AE,AJ）之 AS 排第一
  });

  it('🔴 AC-UX35：sentinel 殿後——p2 之 __unspecified__ 恆排最後，可見文字逐字「未指定 1」', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategoryTreePreview).mockResolvedValue(PREVIEW);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tree-node-p2')).toBeInTheDocument());

    const container = within(screen.getByTestId('tree-node-p2')).getByTestId('node-company-counts');
    const items = within(container).getAllByRole('listitem');
    expect(items[items.length - 1].getAttribute('data-company-code')).toBe('__unspecified__');
    expect(items[items.length - 1].textContent?.trim()).toBe('未指定 1');
  });

  it('AC-UX34 ②：0 不顯示——p3 全部掛載來自 AD，其餘三家（AE／AJ／AS）不得逐列出現（成對：AD 確實存在且值正確）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategoryTreePreview).mockResolvedValue(PREVIEW);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tree-node-p3')).toBeInTheDocument());

    const container = within(screen.getByTestId('tree-node-p3')).getByTestId('node-company-counts');
    const items = within(container).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0].getAttribute('data-company-code')).toBe('AD');
    expect(items[0].getAttribute('data-company-doc-count')).toBe('5');
    expect(within(container).queryByText(/^和潤電能/)).toBeNull(); // AE 不顯示
    expect(within(container).queryByText(/^和勁企業/)).toBeNull(); // AJ 不顯示
    expect(within(container).queryByText(/^和潤企業/)).toBeNull(); // AS 不顯示
  });

  it('🔒 既有 AC-32 徽章一字不改（掛載 N 份程序書／data-mounted-doc-count）——本 delta 只在其下方新增', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategoryTreePreview).mockResolvedValue(PREVIEW);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    expect(screen.getByText('掛載 4 份程序書')).toBeInTheDocument();
    const badge = screen.getByTestId('tree-node-p1').querySelector('[data-mounted-doc-count]');
    expect(badge?.getAttribute('data-mounted-doc-count')).toBe('4');
  });
});

describe('BusinessCategoryTreePreviewPage — UX16 delta AC-UX36（不套用於前台，成對之後台正向半句）', () => {
  it('後台確實有 node-company-counts 容器（本項之成對正向半句；前台負向半句見 PublicCategoryTreePage.ux16.test.tsx）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategoryTreePreview).mockResolvedValue(PREVIEW);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    expect(within(screen.getByTestId('tree-node-p1')).getByTestId('node-company-counts')).toBeInTheDocument();
  });
});
