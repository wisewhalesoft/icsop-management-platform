/**
 * F019 UX16 delta — `AC-UX20`／`AC-UX21`（前台「前往管理」（OLD> 前往後台）連結鈕，項 6）。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#ux16-delta `AC-UX20`／`AC-UX21`；
 * docs/specs/features/F002-role-based-routing.md#ux16-delta `AC-UX7`（`hasAdminAccess` 之
 * 共用述詞，本檔為其三處消費者之一）。
 *
 * ⚠ 對實作全盲：前台 header 尚無此鈕——`queryByLabelText('前往管理')` 恆為 null 即本環之
 * 預期紅燈（正向案例）。
 *
 * 🔴 本檔與 `frontend/src/pages/RoleLanding.test.tsx`／`frontend/src/domain/menu.ux16.test.ts`
 * 共用**同一份**角色向量（`../test-support/ux16-admin-access-vector`），確保「三處各寫一套判準」
 * 之風險（`AC-UX7` 明文警示）在其中一處先被抓到。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage } from '../api/types';
import { UX16_ADMIN_ACCESS_ROLES, EXPECTED_HAS_ADMIN_ACCESS } from '../test-support/ux16-admin-access-vector';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

function mockAuth(roleCode: string) {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode, orgCode: 'JAC00', name: '王小明' },
    error: null, refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

function stubEndpoints(): void {
  const mod = api as unknown as Record<string, unknown>;
  const pageOf = (items: PublicListItem[]): PublicPage => ({ items, total: items.length, page: 1, pageSize: 50, hasNext: false });
  const defaults: Record<string, unknown> = {
    getPublicDocuments: pageOf([]),
    getPublicFilterOptions: { draftingCompanies: [], draftingDivisions: [], draftingDepts: [], draftingSections: [], chiefs: [], lifecycles: [] },
    getOrgUnits: [], // 🔴 automock 陷阱：本頁 useEffect 直接呼叫 getOrgUnits().then(...)，缺此樁即整頁崩潰於錯的理由。
  };
  for (const [name, value] of Object.entries(defaults)) {
    const fn = mod[name] as { mockResolvedValue?: (v: unknown) => void } | undefined;
    if (fn && typeof fn.mockResolvedValue === 'function') fn.mockResolvedValue(value);
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/public?mode=list']}>
      <PublicListPage />
    </MemoryRouter>,
  );
}

describe('PublicListPage — UX16 delta AC-UX20（前往管理連結鈕，與 hasAdminAccess 共用向量）', () => {
  it('🔴 五種角色之連結存在與否，恰為 [true,true,true,true,false]（與 RoleLanding／hasAdminAccess 之共用向量一致）', async () => {
    const results: boolean[] = [];
    for (const role of UX16_ADMIN_ACCESS_ROLES) {
      vi.resetAllMocks();
      mockAuth(role);
      stubEndpoints();
      const { unmount } = renderPage();
      await waitFor(() => expect((api as unknown as { getPublicDocuments: ReturnType<typeof vi.fn> }).getPublicDocuments).toHaveBeenCalled());
      results.push(screen.queryByLabelText('前往管理') !== null);
      unmount();
    }
    expect(results).toEqual(EXPECTED_HAS_ADMIN_ACCESS);
  });

  it('具後台權限角色（ICSOPAdmin）：連結之 role=link、可見文字／aria-label 逐字「前往管理」（2026-09-24 人類裁決；OLD> 前往後台）', async () => {
    mockAuth('ICSOPAdmin');
    stubEndpoints();
    renderPage();
    await waitFor(() => expect((api as unknown as { getPublicDocuments: ReturnType<typeof vi.fn> }).getPublicDocuments).toHaveBeenCalled());
    const link = await screen.findByRole('link', { name: '前往管理' });
    expect(link.getAttribute('aria-label')).toBe('前往管理');
  });

  it('🔒 header 其餘既有元素零漣漪：使用者資訊區與登出鈕仍在（本鈕為新增，非取代）', async () => {
    mockAuth('ICSOPAdmin');
    stubEndpoints();
    renderPage();
    await waitFor(() => expect((api as unknown as { getPublicDocuments: ReturnType<typeof vi.fn> }).getPublicDocuments).toHaveBeenCalled());
    expect(screen.getByTestId('topbar-user')).toBeInTheDocument();
    expect(screen.getByLabelText('登出')).toBeInTheDocument();
  });
});
