import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { UsageFormEditPage } from './UsageFormEditPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, UsageFormPoolItem } from '../api/types';

/**
 * 🔴 2026-08-20 D9 delta（缺失／變更 delta 第 7 項）—— 使用表單編輯改為獨立整頁，範圍限縮為
 * 「表單編號」＋「制定部門」兩項 metadata；檔案本身不可於本頁更換、名稱不可編輯。
 *
 * 權威：`docs/specs/features/F018-usage-form-management.md#usage-form-page-delta`
 *  （`AC-N41`／`AC-N45`／`AC-N48`／`AC-N49`／`AC-N79`）＋
 *  `docs/specs/architecture-spec.md` §11.10（建議路由 `/admin/usage-forms/:formId/edit`、
 *  建議元件檔名 `UsageFormEditPage.tsx`——最終形狀由 system-architect／tdd-implementation
 *  決定，本檔之 import 路徑與路由字面若與實作不同，屬可申訴之推定，非規格鎖定）。
 *
 * 🔴 本檔取代原 `UsageFormManagementPage.formNumber.test.tsx` 內「編輯表單編號」modal 之
 *  `TS-D18-066`～`077`（標題／說明句／欄位帶入現值／取消不呼叫端點／儲存往返／409／400
 *  錯誤呈現），行為語意逐字沿用（`AC-N48` 明訂），僅觸發方式由「開 modal」改為「開新頁」。
 *
 * ⚠ **本頁資料來源與 PATCH 端點函式名稱為本檔之推定，非規格鎖定**——`AC-N48`／架構 §11.10(b)
 *  僅鎖定可觀測契約（欄位範圍、id、驗證訊息），未鎖定前端如何取得單筆表單資料或呼叫函式之
 *  確切名稱。本檔沿用既有 `getUsageFormOverview()`（見既有 `UsageFormManagementPage.test.tsx`）
 *  取池、以路由 `:formId` 篩選；PATCH 呼叫推定為 `updateUsageForm(formId, { formNumber,
 *  draftingDeptCodes })`。若 tdd-implementation 之實作採其他形狀，屬合理申訴，由本檔作者
 *  （test-generator）調整。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function mockAuth(roleCode = 'ICSOPAdmin') {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const FORM: UsageFormPoolItem & { draftingDeptCodes?: string[] } = {
  id: 'uf1', name: '進件申請書.xlsx', formNumber: 'FM-001', format: 'xlsx', size: 49152,
  uploadedBy: 'acct-uuid-1', uploadedByName: '李慧玲', uploadedByDept: '債權管理部 / 法催一室',
  uploadedAt: '2026-06-10T00:00:00Z', docCount: 2,
  documents: [
    { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' },
  ],
  draftingDeptCodes: ['A2000', 'KB000'],
};

const renderPage = (formId = 'uf1') =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/admin/usage-forms/${formId}/edit`]}>
        <Routes>
          <Route path="/admin/usage-forms/:formId/edit" element={<UsageFormEditPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

describe('UsageFormEditPage — F018 D9 delta（AC-N41、AC-N48、AC-N49、AC-N79）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue([FORM]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('AC-N41 獨立整頁：非彈窗（無 role="dialog"）', async () => {
    const { container } = renderPage();
    await screen.findByLabelText(/表單編號/);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('AC-N42① 標題逐字為「編輯使用表單」', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: '編輯使用表單' })).toBeInTheDocument();
  });

  it('AC-N48 容器 id editNumberModal 自此不存在，不得以它定位編輯介面', async () => {
    renderPage();
    await screen.findByLabelText(/表單編號/);
    expect(document.querySelector('#editNumberModal')).toBeNull();
  });

  it('AC-N48 欄位層 DOM id 逐字保留：enNumber／enNumberErr／enFormName', async () => {
    const { container } = renderPage();
    await screen.findByLabelText(/表單編號/);
    expect(container.querySelector('#enNumber')).not.toBeNull();
    expect(container.querySelector('#enFormName')).not.toBeNull();
  });

  it('AC-N48 表單編號輸入框帶入現值（FM-001）、maxlength=100、placeholder 逐字沿用', async () => {
    const { container } = renderPage();
    await screen.findByLabelText(/表單編號/);
    const input = container.querySelector('#enNumber') as HTMLInputElement;
    expect(input.value).toBe('FM-001');
    expect(input).toHaveAttribute('maxlength', '100');
    expect(input).toHaveAttribute('placeholder', '例：FM-001（不填則留空）');
  });

  it('AC-N48 enFormName 之文字恰為該表單之 name（無前綴後綴）', async () => {
    const { container } = renderPage();
    await screen.findByLabelText(/表單編號/);
    expect(container.querySelector('#enFormName')?.textContent).toBe('進件申請書.xlsx');
  });

  it('AC-N48 說明句就地改寫為「僅更新表單資訊，不會變更表單檔案。」（因本頁範圍已含制定部門）', async () => {
    renderPage();
    expect(
      await screen.findByText('僅更新表單資訊，不會變更表單檔案。'),
    ).toBeInTheDocument();
    // 📝 被取代之原句逐字保留供追溯：OLD> 僅更新編號，不會變更表單檔案。
    expect(screen.queryByText('僅更新編號，不會變更表單檔案。')).toBeNull();
  });

  it('AC-N48 檔案不可於本頁更換：無檔案選擇輸入框', async () => {
    renderPage();
    await screen.findByLabelText(/表單編號/);
    expect(screen.queryByLabelText('選擇檔案')).toBeNull();
    expect(screen.queryByLabelText('覆蓋檔案')).toBeNull();
  });

  it('AC-N48 名稱不可編輯：無「表單名稱」輸入框', async () => {
    renderPage();
    await screen.findByLabelText(/表單編號/);
    expect(screen.queryByLabelText(/表單名稱/)).toBeNull();
  });

  it('AC-N79① 檔案區顯示 data-file-readonly 徽章，逐字為「唯讀」', async () => {
    const { container } = renderPage();
    await screen.findByLabelText(/表單編號/);
    const badge = container.querySelector('[data-file-readonly]');
    expect(badge, '找不到 data-file-readonly').not.toBeNull();
    expect(badge!.textContent).toBe('唯讀');
  });

  it('AC-N79② 換檔引導句含「需要換檔請回」「使用該列之「更新／覆蓋上傳」」與「USAGE_FORM_OVERWRITE_SHARED」', async () => {
    renderPage();
    await screen.findByLabelText(/表單編號/);
    expect(screen.getByText(/需要換檔請回/)).toBeInTheDocument();
    expect(screen.getByText(/使用該列之「更新／覆蓋上傳」/)).toBeInTheDocument();
    expect(screen.getByText(/USAGE_FORM_OVERWRITE_SHARED/)).toBeInTheDocument();
  });

  it('AC-N79③ 🔴 負向鎖定：原型專用之記錄切換器不得出現於實作（[data-prototype-demo]／#demoForm 皆為 null）', async () => {
    const { container } = renderPage();
    await screen.findByLabelText(/表單編號/);
    expect(container.querySelector('[data-prototype-demo]')).toBeNull();
    expect(container.querySelector('#demoForm')).toBeNull();
  });

  it('AC-N45 已選之制定部門以 chip 渲染（data-drafting-dept-chip），依 orgCode 昇冪回填', async () => {
    const { container } = renderPage();
    await screen.findByLabelText(/表單編號/);
    const chips = Array.from(container.querySelectorAll('[data-drafting-dept-chip]'));
    expect(chips.length, '找不到任何 data-drafting-dept-chip').toBe(2);
  });

  it('AC-N44 儲存時之編號驗證沿用既有機制：409 → 逐字沿用「表單編號已存在（比對前 trim、不分大小寫）。」', async () => {
    const { container } = renderPage();
    await screen.findByLabelText(/表單編號/);
    const input = container.querySelector('#enNumber') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, 'FM-777');
    vi.mocked(endpoints.updateUsageForm).mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: 'USAGE_FORM_NUMBER_DUPLICATE' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(
      await screen.findByText('表單編號已存在（比對前 trim、不分大小寫）。'),
    ).toBeInTheDocument();
    expect(container.querySelector('#enNumber')).not.toBeNull(); // 錯誤時介面不關閉
  });

  it('AC-N48 點「取消」→ 導回 /admin/usage-forms，不呼叫更新端點', async () => {
    renderPage();
    await screen.findByLabelText(/表單編號/);
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(navigateMock).toHaveBeenCalledWith('/admin/usage-forms');
    expect(endpoints.updateUsageForm).not.toHaveBeenCalled();
  });

  /**
   * ⚠ 不得與 `AC-N79②` 混淆：該條要求本頁**恆常顯示**含 `USAGE_FORM_OVERWRITE_SHARED` 字樣之
   * 換檔引導句（靜態說明文字）。本案驗證的是**動態行為**——儲存 metadata 不得另外彈出
   * 二次確認 dialog（`role="dialog"` name「操作確認」，即既有覆蓋上傳流程之既有 UI）。
   */
  it('AC-N49 🔒 儲存 metadata 不觸發覆蓋確認 dialog（本頁不涉檔案覆蓋，僅更新 metadata）', async () => {
    renderPage();
    await screen.findByLabelText(/表單編號/);
    vi.mocked(endpoints.updateUsageForm).mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(endpoints.updateUsageForm).toHaveBeenCalled());
    expect(screen.queryByRole('dialog', { name: '操作確認' })).toBeNull();
  });
});
