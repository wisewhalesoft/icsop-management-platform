/**
 * F019 UX16 delta — `AC-UX18`／`AC-UX19`（詳情頁「所屬節點」→「業務/功能類別」，概念置換，項 9）。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#ux16-delta `AC-UX18`／`AC-UX19`。
 *
 * ⚠ 對實作全盲：`PublicDocumentDetail` 尚無 `businessCategories` 欄位，畫面仍顯示既有「所屬節點」
 * ——以 cast 承載新欄位，紅燈落在個別斷言而非整檔編譯崩潰。
 *
 * 🔴 語料鑑別力核心（`AC-UX18` 明訂）：文件須同時有 `nodeId`（循環節點，既有 `nodeName`＝
 * `進件作業`）與 ≥1 個業務/功能類別掛載，且**兩者名稱不同**——否則「概念置換」與「只改標籤」
 * 在畫面上輸出相同，斷言恆真。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicDocumentDetailPage } from './PublicDocumentDetailPage';
import { ToastProvider } from '../components/useToast';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { SessionUser, PublicDocumentDetail } from '../api/types';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

function mockAuth(): void {
  const user: SessionUser = { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode: 'JAC00', name: '王小明' };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null, refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

interface BusinessCategoryOption { id: string; displayName: string }

function detailOf(over: Partial<PublicDocumentDetail> & { businessCategories?: BusinessCategoryOption[] } = {}): PublicDocumentDetail {
  return {
    id: 'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f', status: 'active', displayStatus: 'announced',
    documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
    lifecycleId: 'lc1', lifecycleName: '銷售及收款循環', nodeId: 'n1', nodeName: '進件作業',
    draftingCompanyName: '和潤企業股份有限公司', draftingDeptId: 'D', draftingDeptName: '企劃部',
    draftingSectionId: 'S', draftingSectionName: '車輛行銷室',
    primaryChiefId: 'e1', primaryChiefName: '陳彥廷（企劃部 車輛行銷室 室長）',
    edition: "26'01", announcedDate: '2026-01-01T00:00:00.000Z',
    contentSummary: '規範車輛分期案件之進件收件、資格初審與建檔流程。',
    attachments: [], usageForms: [], links: [],
    ojtCompletedUnits: [] as string[], ojtUsingUnitCount: 0,
    ...over,
  } as unknown as PublicDocumentDetail;
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

describe('PublicDocumentDetailPage — UX16 delta AC-UX18（業務/功能類別欄，概念置換）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.getDocumentAppendices).mockResolvedValue([]);
  });

  it('① 標籤「所屬節點」不存在（queryByText 恆為 null，載體須自 DOM 移除）', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(
      detailOf({ businessCategories: [{ id: 'bc1', displayName: '授信（消金）' }] }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    expect(screen.queryByText('所屬節點')).toBeNull();
  });

  it('② 新增標籤「業務/功能類別」，內容為類別集合（非循環節點名「進件作業」）', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(
      detailOf({ businessCategories: [{ id: 'bc1', displayName: '授信（消金）' }] }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    expect(screen.getByText('業務/功能類別')).toBeInTheDocument();
    const container = screen.getByTestId('field-list');
    // ⓑ 有鑑別力之正向斷言：業務/功能類別項目之文字集合，恰等於該文件之類別顯示名集合。
    const items = Array.from(container.querySelectorAll('[data-business-category-item]')).map((el) => el.textContent);
    expect(items).toEqual(['授信（消金）']);
    // 🔴 明文禁止之恆真掃描：不使用「循環節點名於整頁零命中」（'進件作業' 為 documentName 之子字串，恆真）；
    // 改為限定容器內之集合相等（上方 ⓑ）。
    expect(within(container).queryByText('進件作業')).toBeNull();
  });

  it('③ data-business-category-count 屬性為 N 之字串（N=0 亦不得省略）；0 筆時可見文字為「—」', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf({ businessCategories: [] }));
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const container = screen.getByTestId('field-list');
    const wrapper = container.querySelector('[data-business-categories]');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.getAttribute('data-business-category-count')).toBe('0');
    expect(wrapper!.textContent?.trim()).toBe('—');
  });

  it('N ≥ 2 筆 → 逐筆全部列出（AC-UX19③，不摺疊、無 +N 徽章）', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(
      detailOf({
        businessCategories: [
          { id: 'bc-a', displayName: '授信（消金）' },
          { id: 'bc-b', displayName: '風險管理' },
          { id: 'bc-c', displayName: '帳務處理' },
        ],
      }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const container = screen.getByTestId('field-list');
    const items = container.querySelectorAll('[data-business-category-item]');
    expect(items).toHaveLength(3);
    expect(container.querySelector('[data-business-categories]')?.getAttribute('data-business-category-count')).toBe('3');
    expect(within(container).queryByText('+2')).toBeNull();
  });
});
