import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionMatrixPage } from './PermissionMatrixPage';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

describe('PermissionMatrixPage — RBAC 矩陣唯讀顯示（F025/F026）', () => {
  beforeEach(() => vi.resetAllMocks());

  it('SysAdmin 預設顯示角色×功能矩陣（5 角色欄＋功能列＋CRUD 格）', () => {
    mockAuth('SysAdmin');
    render(<PermissionMatrixPage />);
    // 5 角色欄標題
    for (const label of ['系統管理員', 'ICSOP 管理員', '主管', '部門窗口', '一般使用者']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('帳號管理')).toBeInTheDocument();
    expect(screen.getAllByText('CRUD').length).toBeGreaterThan(0);
  });

  it('切換至角色×欄位（F026）→ 顯示欄位列與可寫/系統產生', async () => {
    mockAuth('SysAdmin');
    render(<PermissionMatrixPage />);
    await userEvent.click(screen.getByRole('button', { name: /角色 × 欄位/ }));
    expect(screen.getByText('文件狀態')).toBeInTheDocument();
    expect(screen.getAllByText('可寫').length).toBeGreaterThan(0);
    expect(screen.getAllByText('系統產生').length).toBe(5); // UUID 列 5 角色皆 IGNORE
  });

  it('非系統管理員（無系統參數設定權限）→ 403 阻擋', () => {
    mockAuth('ICSOPAdmin');
    render(<PermissionMatrixPage />);
    expect(screen.getByText(/無系統參數設定權限/)).toBeInTheDocument();
    expect(screen.queryByText('帳號管理')).not.toBeInTheDocument();
  });
});
