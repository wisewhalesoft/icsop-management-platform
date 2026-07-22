import { createContext, Fragment, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/**
 * Admin shell topbar 之 per-page 注入點（見 prototypes：頁面 breadcrumb+title 在 topbar 左、
 * 頁面動作按鈕在 topbar 右）。AppShell 提供 titleEl/actionsEl 兩個掛載節點，PageHeader 以 portal
 * 注入。未包在 AppShell 內時（單元測試）退回 inline 呈現，確保可測。
 */
export interface TopbarSlots {
  titleEl: HTMLElement | null;
  actionsEl: HTMLElement | null;
}
export const TopbarSlotsContext = createContext<TopbarSlots | null>(null);

export function PageHeader({
  breadcrumb,
  title,
  children,
}: {
  breadcrumb: string[];
  title: string;
  children?: ReactNode;
}): JSX.Element {
  const slots = useContext(TopbarSlotsContext);

  const titleNode = (
    <div className="leading-tight min-w-0">
      <div className="text-xs text-slate-400 flex items-center gap-1">
        {breadcrumb.map((b, i) => (
          <Fragment key={i}>
            {i > 0 && <Icon name="chevron-right" className="w-3 h-3" />}
            <span>{b}</span>
          </Fragment>
        ))}
      </div>
      <div className="font-semibold text-slate-900 text-sm truncate">{title}</div>
    </div>
  );

  if (!slots?.titleEl) {
    // 無 shell context（測試）→ inline
    return (
      <div className="flex items-center justify-between gap-3 mb-4">
        {titleNode}
        {children ? <div className="flex items-center gap-2">{children}</div> : null}
      </div>
    );
  }

  return (
    <>
      {createPortal(titleNode, slots.titleEl)}
      {slots.actionsEl && children ? createPortal(children, slots.actionsEl) : null}
    </>
  );
}
