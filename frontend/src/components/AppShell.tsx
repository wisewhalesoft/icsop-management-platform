import { useCallback, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { visibleMenu, accessLabelFor } from '../domain/menu';
import { Icon } from './Icon';
import { RoleBadge } from './RoleBadge';
import { TopbarSlotsContext } from './PageHeader';
import { POPUP_BLOCKED_TEXT } from '../domain/print-error';

/**
 * 後台外殼（sidebar＋topbar＋Outlet）。版面、收合行為、側欄結構權威來源：
 * prototypes/07-admin-shell.html。側欄僅顯示該角色有權限之功能（F002 步驟 4）；
 * 頂欄之角色選擇器為原型模擬，本實作改以真實登入者角色徽章呈現。
 */
export function AppShell(): JSX.Element {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  // topbar 之 per-page 掛載節點（breadcrumb+title / 動作按鈕）；PageHeader 以 portal 注入。
  const [titleEl, setTitleEl] = useState<HTMLElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);
  const role = user?.roleCode;
  const items = visibleMenu(role);
  const sidebarW = collapsed ? 60 : 240;
  // F002 AC-D4：已位於 /admin 時，回首頁手段一律 replace，不重複推入瀏覽歷程。
  const atHome = useLocation().pathname === '/admin';
  /**
   * F022：瀏覽文件網頁以「新視窗/分頁」開啟（後台分頁維持原狀）；被封鎖 → 顯示替代提示。
   *
   * 🔴 **`window.open` 之第三引數不得帶 `noopener`／`noreferrer`**：HTML 規格明定 `noopener`
   * 為真時 `window.open()` **一律回 `null`**（與是否被封鎖無關）⇒ 下一行的 `win === null` 恆成立，
   * 分頁明明開了卻永遠顯示「新視窗被瀏覽器封鎖」（2026-08-26 真人回報）。
   * 同源第一方無 reverse tabnabbing 暴露面——與 `DocumentListPage` 之樹狀圖預覽入口同一裁決。
   * ⚠ 單元測試抓不到此類 bug：測試把 `window.open` 整個 spy 掉，回傳值由測試決定。
   */
  const [popupBlocked, setPopupBlocked] = useState(false);
  const openPublic = useCallback(() => {
    // 相對路徑（同源 cookie 自動攜帶，不夾帶 token 於網址，NFR-002）。
    const win = window.open('/public', '_blank');
    setPopupBlocked(win === null); // 多數瀏覽器封鎖時回傳 null（非拋例外）
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700">
      {/* ===== 側欄 ===== */}
      <aside
        className="fixed left-0 top-0 bottom-0 z-50 bg-white border-r border-slate-200 flex flex-col transition-[width] duration-200"
        style={{ width: sidebarW }}
      >
        {/* F002 AC-D2：logo 區為可鍵盤聚焦之連結（prototype 07 行 33 之 <a aria-label="回到後台首頁">）。 */}
        <NavLink
          to="/admin"
          replace={atHome}
          aria-label="回到後台首頁"
          title="回到後台首頁"
          className="h-14 flex items-center gap-2 px-3 border-b border-slate-200 shrink-0 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-600"
        >
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shrink-0">
            <Icon name="file-text" className="w-5 h-5" />
          </div>
          {!collapsed && (
            <span className="font-bold text-slate-900 text-sm truncate">ICSOP 後台</span>
          )}
        </NavLink>

        <nav
          aria-label="功能選單"
          className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5"
        >
          {/*
            F002 AC-D1：側欄第一項「首頁」。刻意**不**進 MENU／FUNCTION_MATRIX——它不是受控
            功能（AC-D5），凡能進後台者皆可回首頁，故不經 visibleMenu() 之 canPerform 過濾。
          */}
          <NavLink
            to="/admin"
            end
            replace={atHome}
            title="首頁"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm ${
                collapsed ? 'justify-center px-0' : ''
              } ${
                isActive
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  name="layout-dashboard"
                  className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary-600' : 'text-slate-400'}`}
                />
                {!collapsed && <span className="flex-1 truncate">首頁</span>}
              </>
            )}
          </NavLink>
          {items.length === 0 && !collapsed && (
            <div className="px-2.5 py-3 text-xs text-slate-400">
              此角色無後台功能權限
            </div>
          )}
          {items.map((m) => {
            const acc = accessLabelFor(role, m.functionKey);
            const readOnly = acc === '唯讀';
            return (
              <NavLink
                key={m.id}
                to={m.route}
                title={m.label}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm ${
                    collapsed ? 'justify-center px-0' : ''
                  } ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      name={m.icon}
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-primary-600' : 'text-slate-400'
                      }`}
                    />
                    {!collapsed && (
                      <span className="flex-1 truncate">{m.label}</span>
                    )}
                    {!collapsed && readOnly && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">
                        唯讀
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-2 shrink-0">
          <button
            type="button"
            onClick={openPublic}
            title="瀏覽文件網頁（新視窗開啟）"
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-50 ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <Icon name="external-link" className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">瀏覽文件網頁</span>}
          </button>
          {popupBlocked && !collapsed && (
            <div role="alert" className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-2">
              {POPUP_BLOCKED_TEXT}
            </div>
          )}
        </div>
      </aside>

      {/* ===== 內容區（含頂欄） ===== */}
      <div style={{ paddingLeft: sidebarW }} className="transition-[padding] duration-200">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="h-14 px-4 flex items-center gap-3">
            <button
              onClick={() => setCollapsed((c) => !c)}
              aria-label="收合或展開選單"
              className="text-slate-400 hover:text-slate-600"
            >
              <Icon name="panel-left" className="w-5 h-5" />
            </button>
            {/* per-page breadcrumb + title（PageHeader portal 注入） */}
            <div ref={setTitleEl} className="min-w-0" />
            <div className="ml-auto flex items-center gap-3">
              {/* per-page 動作按鈕（PageHeader portal 注入） */}
              <div ref={setActionsEl} className="flex items-center gap-2" />
              {/* G-PUB-040：頂欄顯示登入者姓名（非 loginId）；xl 斷點與 prototype 07 一致。 */}
              <span className="hidden xl:flex items-center gap-1.5 text-sm text-slate-500 pl-2 border-l border-slate-200">
                <Icon name="user-circle" className="w-4 h-4" />
                <span>{user?.name ?? user?.loginId}</span>
              </span>
              <RoleBadge roleCode={role} />
              <button
                onClick={logout}
                aria-label="登出"
                title="登出"
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <Icon name="log-out" className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6">
          <TopbarSlotsContext.Provider value={{ titleEl, actionsEl }}>
            <Outlet />
          </TopbarSlotsContext.Provider>
        </main>
      </div>
    </div>
  );
}
