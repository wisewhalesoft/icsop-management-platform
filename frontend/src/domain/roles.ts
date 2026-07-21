import type { RoleCode } from './function-matrix';

/**
 * 角色顯示 meta（徽章色、圖示、標籤）。
 * 權威值來源：prototypes/02-role-landing.html 與 07-admin-shell.html 之 ROLE_META。
 * icon 沿用 prototype 之 Lucide 名稱（kebab-case），由 UI 層解析為 lucide-react 元件。
 */
export interface RoleMeta {
  label: string;
  /** 徽章底色（HEX，逐值照 prototype）。 */
  color: string;
  /** Lucide 圖示名稱（kebab-case）。 */
  icon: string;
}

export const ROLE_META: Record<RoleCode, RoleMeta> = {
  SysAdmin: { label: '系統管理員', color: '#4338CA', icon: 'shield-check' },
  ICSOPAdmin: { label: 'ICSOP 管理員', color: '#7C3AED', icon: 'file-cog' },
  Supervisor: { label: '主管', color: '#0891B2', icon: 'user-cog' },
  DeptContact: { label: '部門窗口', color: '#475569', icon: 'contact' },
  User: { label: '一般使用者', color: '#64748B', icon: 'user' },
};

/** 安全查找：未知/未提供角色回 undefined（呼叫端 fail-safe 顯示）。 */
export function roleMeta(roleCode: string | undefined): RoleMeta | undefined {
  if (roleCode === undefined) return undefined;
  return ROLE_META[roleCode as RoleCode];
}
