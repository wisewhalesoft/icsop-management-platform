import { roleMeta } from '../domain/roles';
import { Icon } from './Icon';

/**
 * 角色徽章（色＋圖示＋標籤）。樣式與尺寸權威來源：
 * prototypes/07-admin-shell.html（sm）與 02-role-landing.html（md）。
 */
export function RoleBadge({
  roleCode,
  size = 'sm',
}: {
  roleCode: string | undefined;
  size?: 'sm' | 'md';
}): JSX.Element | null {
  const meta = roleMeta(roleCode);
  if (!meta) return null;
  const cls =
    size === 'md'
      ? 'gap-2 px-3 py-1 text-sm'
      : 'gap-1 px-2 py-0.5 text-xs';
  const iconCls = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium text-white ${cls}`}
      style={{ background: meta.color }}
    >
      <Icon name={meta.icon} className={iconCls} />
      {meta.label}
    </span>
  );
}
