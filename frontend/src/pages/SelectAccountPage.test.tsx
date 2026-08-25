/**
 * F001 帳號選擇 delta — 選擇畫面（丙節，`AC-M12`〜`AC-M17`、`AC-M26`）。
 *
 * 🔴 本批**無對應 prototype**（`[OPEN-M5]`，`prototypes/01-login.html` 不含此畫面）——丙節之 AC
 *   為唯一 oracle。畫面文案（標題「選擇帳號」、確認鈕「確認登入」）為 test-generator 依據 AC 之
 *   最小揭露原則自行擬定之**合理預設**，非 AC 逐字規定；若日後補上 prototype 或人類另有裁決，
 *   這兩處文案可能需要調整，其餘斷言（欄位集合、fail-closed、揭露封閉集）不受影響。
 *
 * 待實作：`frontend/src/pages/SelectAccountPage.tsx`（新頁面元件，無 props，內部呼叫
 * `getSelectAccountCandidates()`／`selectAccount()`，並於成功後呼叫 `useAuth().refresh()`）。
 *
 * 權威：docs/specs/features/F001-auth-login-session.md#multi-account-picker `AC-M12`〜`AC-M17`／`AC-M26`。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SelectAccountPage } from './SelectAccountPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type { SelectAccountResponse } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const refresh = vi.fn();

function mockAuth(): void {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'unauthenticated',
    user: null,
    error: null,
    refresh,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/login/select-account']}>
        <Routes>
          <Route path="/login/select-account" element={<SelectAccountPage />} />
          <Route path="/login" element={<div>登入頁替身</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

const TWO_CANDIDATES: SelectAccountResponse = {
  email: 'a@hfcfinance.com.tw',
  name: '王小明',
  candidates: [
    {
      accountId: 'a1',
      companyCode: 'AS',
      companyName: '和潤企業',
      orgCode: 'JAC00',
      orgName: '資訊室',
      roleCode: 'User',
      roleName: '一般使用者',
      loginId: 'AS001',
    },
    {
      accountId: 'a2',
      companyCode: 'AE',
      companyName: '和潤電能',
      orgCode: null,
      orgName: '—',
      roleCode: 'DeptContact',
      roleName: '部門窗口',
      loginId: 'AE001',
    },
  ],
};

describe('AC-M12/M13 選擇畫面渲染候選（欄位集合＋姓名僅顯示一次）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
  });

  it('顯示每筆候選之公司／部門／角色／員工編號，姓名於頁面層僅出現一次', async () => {
    vi.mocked(endpoints.getSelectAccountCandidates).mockResolvedValue(TWO_CANDIDATES);
    renderPage();

    await screen.findByText('和潤企業');
    expect(screen.getByText('資訊室')).toBeInTheDocument();
    expect(screen.getByText('一般使用者')).toBeInTheDocument();
    expect(screen.getByText('AS001')).toBeInTheDocument();

    expect(screen.getByText('和潤電能')).toBeInTheDocument();
    expect(screen.getByText('部門窗口')).toBeInTheDocument();
    expect(screen.getByText('AE001')).toBeInTheDocument();

    // 姓名（全體一致）僅於頁面層顯示一次，不逐列重複。
    expect(screen.getAllByText('王小明')).toHaveLength(1);
  });

  it('AC-M14 orgCode 缺漏 → 顯示 —（em dash）', async () => {
    vi.mocked(endpoints.getSelectAccountCandidates).mockResolvedValue(TWO_CANDIDATES);
    renderPage();
    await screen.findByText('和潤電能');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('AC-M15 兩筆候選除員工編號外完全相同時，兩列仍各自顯示其員工編號（可辨識）', async () => {
    const dup: SelectAccountResponse = {
      email: 'a@hfcfinance.com.tw',
      name: '王小明',
      candidates: [
        { ...TWO_CANDIDATES.candidates[0], accountId: 'dup1', loginId: 'AS001' },
        { ...TWO_CANDIDATES.candidates[0], accountId: 'dup2', loginId: 'AS002' },
      ],
    };
    vi.mocked(endpoints.getSelectAccountCandidates).mockResolvedValue(dup);
    renderPage();
    await screen.findByText('AS001');
    expect(screen.getByText('AS002')).toBeInTheDocument();
  });
});

describe('AC-M16 不得自動選取、不得記憶偏好', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
  });

  it('進入畫面時無任何候選被預選；確認鈕於未選取前停用', async () => {
    vi.mocked(endpoints.getSelectAccountCandidates).mockResolvedValue(TWO_CANDIDATES);
    renderPage();
    await screen.findByText('AS001');

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
    expect(screen.getByRole('button', { name: '確認登入' })).toBeDisabled();
    expect(endpoints.selectAccount).not.toHaveBeenCalled();
  });

  it('選取候選後點擊確認 → 呼叫 selectAccount(該候選 accountId)，並於成功後刷新 auth 狀態', async () => {
    vi.mocked(endpoints.getSelectAccountCandidates).mockResolvedValue(TWO_CANDIDATES);
    vi.mocked(endpoints.selectAccount).mockResolvedValue({
      loginId: 'AE001',
      email: 'a@hfcfinance.com.tw',
      companyCode: 'AE',
      roleCode: 'DeptContact',
    });
    renderPage();
    await screen.findByText('AE001');

    await userEvent.click(screen.getByRole('radio', { name: 'AE001' }));
    await userEvent.click(screen.getByRole('button', { name: '確認登入' }));

    await waitFor(() => expect(endpoints.selectAccount).toHaveBeenCalledWith('a2'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('AC-M17 無票證而直接開啟選擇路由', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
  });

  it('GET 候選失敗（401 AUTH_SELECTION_TICKET_INVALID）→ 不顯示任何帳號資料，導回登入頁', async () => {
    vi.mocked(endpoints.getSelectAccountCandidates).mockRejectedValue(
      new ApiError(401, 'AUTH_SELECTION_TICKET_INVALID'),
    );
    renderPage();

    await screen.findByText('登入頁替身');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText('王小明')).not.toBeInTheDocument();
  });
});

describe('AC-M26 揭露封閉集——畫面不得顯示 accountId 原始值', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
  });

  it('渲染後之可見文字不含任何候選之 accountId', async () => {
    vi.mocked(endpoints.getSelectAccountCandidates).mockResolvedValue(TWO_CANDIDATES);
    renderPage();
    await screen.findByText('AS001');
    expect(screen.queryByText('a1')).not.toBeInTheDocument();
    expect(screen.queryByText('a2')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('"accountId"');
  });
});
