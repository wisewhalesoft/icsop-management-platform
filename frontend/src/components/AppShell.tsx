import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { visibleMenu, accessLabelFor } from '../domain/menu';
import { Icon } from './Icon';
import { RoleBadge } from './RoleBadge';
import { TopbarSlotsContext } from './PageHeader';

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700">
      {/* ===== 側欄 ===== */}
      <aside
        className="fixed left-0 top-0 bottom-0 z-50 bg-white border-r border-slate-200 flex flex-col transition-[width] duration-200"
        style={{ width: sidebarW }}
      >
        <div className="h-14 flex items-center gap-2 px-3 border-b border-slate-200 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shrink-0">
            <Icon name="file-text" className="w-5 h-5" />
          </div>
          {!collapsed && (
            <span className="font-bold text-slate-900 text-sm truncate">ICSOP 後台</span>
          )}
        </div>

        <nav
          aria-label="功能選單"
          className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5"
        >
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
          <Link
            to="/public"
            title="瀏覽文件網頁"
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-50 ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <Icon name="external-link" className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">瀏覽文件網頁</span>}
          </Link>
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
              <span className="hidden sm:flex items-center gap-1.5 text-sm text-slate-500 pl-2 border-l border-slate-200">
                <Icon name="user-circle" className="w-4 h-4" />
                <span className="mono">{user?.loginId}</span>
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
