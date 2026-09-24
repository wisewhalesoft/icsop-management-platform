/**
 * F002 UX16 delta — `AC-UX3`：「管理平台」（分流頁卡片）與「ICSOP 管理」（後台首頁麵包屑；2026-09-24
 * 人類裁決由 OLD> `ICSOP 管理後台` 改名）兩個名字並存是刻意的，須成對斷言（只鎖其中一句時，改掉另一句不會翻紅）。
 *
 * 權威：docs/specs/features/F002-role-based-routing.md#ux16-delta `AC-UX3`。
 *
 * ⚠ 本檔之 `DashboardHome` 端點 mock 沿用既有 `DashboardHome.test.tsx` 之既有設定模式
 * （`vi.mock('../api/endpoints')` automock ＋ 顯式 `mockResolvedValue`），避免與該檔重複
 * 完整覆蓋——本檔只驗證麵包屑首段文字，非該頁其餘既有行為。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleLanding } from './RoleLanding';
import { DashboardHome } from './DashboardHome';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, DashboardSummary, DashboardActivityItem } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, name: '游博丞' };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const SUMMARY: DashboardSummary = {
  pendingOrgChanges: 0, unassignedDocs: 0, disabledAccounts: 0, accessLast7Days: 0, pendingPublish: 0,
};
const ACTIVITY: DashboardActivityItem[] = [];

/** 比照 DashboardHome.test.tsx 之 stubF044Endpoints：F044 三支尚未存在或已存在皆不炸掉本檔。 */
function stubOptionalEndpoints(): void {
  const mod = endpoints as unknown as Record<string, unknown>;
  const defaults: Record<string, unknown> = {
    getDashboardAnalytics: { today: '2026-09-22' },
    getCategoryDistribution: { today: '2026-09-22', items: [] },
    getOjtOnTimeSummary: {
      today: '2026-09-22', numerator: 0, denominator: 0,
      excludedInactive: 0, excludedOrphaned: 0, excludedNoAnnouncedDate: 0,
    },
  };
  for (const [name, value] of Object.entries(defaults)) {
    const fn = mod[name] as { mockResolvedValue?: (v: unknown) => void } | undefined;
    if (fn && typeof fn.mockResolvedValue === 'function') fn.mockResolvedValue(value);
  }
}

describe('AC-UX3 — 「管理平台」（分流頁）與「ICSOP 管理」（後台首頁麵包屑）並存，成對斷言', () => {
  it('分流頁卡片為「管理平台」且後台首頁麵包屑首段為「ICSOP 管理」——只改其一，另一句必須仍能被抓到', async () => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDashboardSummary).mockResolvedValue(SUMMARY);
    vi.mocked(endpoints.getDashboardActivity).mockResolvedValue(ACTIVITY);
    stubOptionalEndpoints();

    mockAuth('ICSOPAdmin');
    render(<MemoryRouter><RoleLanding /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '管理平台' })).toBeInTheDocument();

    render(<MemoryRouter><DashboardHome /></MemoryRouter>);
    expect(await screen.findByText('ICSOP 管理')).toBeInTheDocument();
  });
});
