import { Icon } from './Icon';
import type { FmtClass } from '../domain/usage-form-format';

/**
 * 使用表單格式徽章（excel 綠／pdf 紅）——清單頁／新增頁／編輯頁共用。
 * 色票逐字沿用 prototype 19／19a／19b 之 `fmtBadge()`（三檔同一份）。
 *
 * 📝 **搬遷來源逐字保留供追溯**：OLD> `UsageFormManagementPage.tsx` 之 `FormatBadge`。
 */
export function FormatBadge({ fmt }: { fmt: FmtClass }): JSX.Element {
  return fmt === 'excel' ? (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: '#047857', background: '#D1FAE5' }}
    >
      <Icon name="file-spreadsheet" className="w-3 h-3" />
      excel
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: '#B91C1C', background: '#FEE2E2' }}
    >
      <Icon name="file-text" className="w-3 h-3" />
      pdf
    </span>
  );
}
