import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { RoleBadge } from '../components/RoleBadge';
import { Icon } from '../components/Icon';
import type { RoleCode } from '../domain/function-matrix';

/**
 * 登入後角色分流頁（F002）。版面與文案權威來源：prototypes/02-role-landing.html。
 * 管理類角色顯示「前台瀏覽 / 管理後台」選擇；一般使用者僅顯示前往前台瀏覽。
 */
const ADMIN_DESC: Record<RoleCode, string> = {
  SysAdmin: '帳號/角色管理、組織同步、系統參數、調閱歷程（依權限顯示）。',
  ICSOPAdmin: '維護循環 DAG、ICSOP 文件、使用表單、調閱歷程（依權限顯示）。',
  Supervisor: '循環／ICSOP 文件全公司唯讀（無使用表單管理與調閱歷程）。',
  DeptContact: 'ICSOP 文件唯讀檢視。',
  User: '',
};

export function RoleLanding(): JSX.Element {
  const { user, logout } = useAuth();
  const role = user?.roleCode;
  const isUser = role === 'User';
  const adminDesc = (role && ADMIN_DESC[role as RoleCode]) || '';

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-700">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shrink-0">
            <Icon name="file-text" className="w-5 h-5" />
          </div>
          <span className="font-bold text-slate-900 truncate">
            ICSOP 文件管理平台
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="mono text-sm text-slate-500">{user?.loginId}</span>
            {/* G-PUB-010：登入分流頁頂欄提供登出（prototype 02 頂欄右側）。 */}
            <button
              onClick={logout}
              aria-label="登出"
              title="登出"
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
            >
              <Icon name="log-out" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="mb-4 flex justify-center">
              <RoleBadge roleCode={role} size="md" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              登入成功，歡迎回來
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isUser
                ? '一般使用者將直接進入前台。'
                : '您具備後台權限，請選擇要前往的介面。'}
            </p>
          </div>

          {isUser ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-4">
                <Icon name="panels-top-left" className="w-7 h-7 text-primary-600" />
              </div>
              <h2 className="font-bold text-slate-900 text-lg">前往前台瀏覽</h2>
              <Link
                to="/public"
                className="inline-flex items-center justify-center gap-1.5 mt-5 w-full sm:w-auto px-6 py-2.5 rounded-md bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition"
              >
                <Icon name="arrow-right" className="w-4 h-4" />
                前往前台瀏覽
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <Link
                to="/public"
                className="group block bg-white border border-slate-200 rounded-2xl p-6 hover:border-primary-300 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-4 group-hover:bg-primary-100 transition">
                  <Icon name="panels-top-left" className="w-6 h-6 text-primary-600" />
                </div>
                <h2 className="font-bold text-slate-900 text-lg">前台瀏覽</h2>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  以您的身分與部門瀏覽、搜尋、下載、列印 ICSOP 文件（含浮水印）。
                </p>
                <span className="inline-flex items-center gap-1 text-sm text-primary-600 font-medium mt-4">
                  前往前台
                  <Icon name="arrow-right" className="w-4 h-4" />
                </span>
              </Link>

              <Link
                to="/admin"
                className="group block bg-white border border-slate-200 rounded-2xl p-6 hover:border-primary-300 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-4 group-hover:bg-primary-100 transition">
                  <Icon name="layout-dashboard" className="w-6 h-6 text-primary-600" />
                </div>
                <h2 className="font-bold text-slate-900 text-lg">管理後台</h2>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  {adminDesc}
                </p>
                <span className="inline-flex items-center gap-1 text-sm text-primary-600 font-medium mt-4">
                  進入後台
                  <Icon name="arrow-right" className="w-4 h-4" />
                </span>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
