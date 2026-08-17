import { createContext, Fragment, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

/**
 * 麵包屑之一段（F002 AC-D6）。`to` 缺省 ⇒ 該段為不可點之純文字（分類標籤之正確行為）。
 *
 * 🔴 刻意**不提供** `string[]` 相容路徑：union 型別 `(string | BreadcrumbSegment)[]`
 * 會讓 `tsc` 恆為 0，直接消滅 `AC-D7`「呼叫端整批遷移」的可驗證載體
 * （architecture-spec §10.8 決策 A8）。
 */
export interface BreadcrumbSegment {
  label: string;
  to?: string;
}

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

/**
 * Topbar 動作區之**獨立**注入點——供「動作鈕由子元件擁有、而 `PageHeader` 由父層渲染」之頁面。
 *
 * 🔴 為何需要它：admin shell 之版面契約是「頁面動作鈕一律在 topbar」，但 `PageHeader` 只能由
 * 持有 breadcrumb/title 的父層渲染。像變更歷程這種「每個 tab 各自擁有自己的匯出鈕與其 handler」
 * 的頁面，若要把鈕交給父層就得把整組 handler 與查詢條件上提——那是為了擺位而做的結構性重構。
 * 本元件讓子元件就地把鈕投遞到同一個 topbar 插槽，父子各自保有自己的職責。
 *
 * 🔴 **只掛載中的子元件會投遞** ⇒ 「切換 tab 時僅顯示當前 tab 之動作鈕」是自然結果，
 * 不需要 `hidden` class 手動切換（prototype 23 以 `hidden` 表達的正是同一意圖）。
 *
 * 無 shell context（單元測試直接渲染頁面）→ 與 `PageHeader` 相同退回 inline 呈現，確保可測。
 */
export function TopbarActions({ children }: { children: ReactNode }): JSX.Element {
  const slots = useContext(TopbarSlotsContext);
  if (!slots?.actionsEl) return <div className="flex items-center gap-2">{children}</div>;
  return <>{createPortal(children, slots.actionsEl)}</>;
}

export function PageHeader({
  breadcrumb,
  title,
  titleAttrs,
  children,
}: {
  breadcrumb: BreadcrumbSegment[];
  title: string;
  /**
   * 額外掛到**標題節點**之 data-* 屬性。
   * F040：DAG 畫布以 `data-lifecycle-title` 標記「此標題含循環顯示名稱」（prototype 11 行 65）；
   * 刻意採選用參數而非全頁一律加上——該掛鉤只對確實呈現循環名稱之頁面有意義。
   */
  titleAttrs?: Record<string, string>;
  children?: ReactNode;
}): JSX.Element {
  const slots = useContext(TopbarSlotsContext);

  const titleNode = (
    <div className="leading-tight min-w-0">
      <div className="text-xs text-slate-400 flex items-center gap-1">
        {breadcrumb.map((b, i) => (
          <Fragment key={i}>
            {i > 0 && <Icon name="chevron-right" className="w-3 h-3" />}
            {/*
              AC-D6 ①：最末段一律不可點（縱使提供 to 亦忽略）。此規則寫在元件內部而非 15 個
              呼叫端——放呼叫端等於要求每處各自「記得不要給末段 to」，一次疏忽就破功。
            */}
            {b.to && i < breadcrumb.length - 1 ? (
              <Link to={b.to} className="hover:text-slate-600 hover:underline">
                {b.label}
              </Link>
            ) : (
              <span>{b.label}</span>
            )}
          </Fragment>
        ))}
      </div>
      <div className="font-semibold text-slate-900 text-sm truncate" {...titleAttrs}>{title}</div>
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
