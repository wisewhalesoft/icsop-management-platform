import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { visibleMenu } from '../domain/menu';
import { RoleBadge } from '../components/RoleBadge';
import { Icon } from '../components/Icon';
import type { RoleCode } from '../domain/function-matrix';

/**
 * 登入後角色分流頁（F002）。版面與文案權威來源：prototypes/02-role-landing.html。
 * 管理類角色顯示「前台瀏覽 / 管理後台」選擇。
 *
 * 🔴 **無任何後台功能權限者（一般使用者，含 F041 業務子分類）不經本頁**——F002 `AC1` 逐字要求
 * 「直接導向前台瀏覽頁，**不顯示選擇畫面**」。
 * 📝 已作廢（⚠ 不得復原）：OLD> 對 `roleCode === 'User'` 渲染一張「前往前台瀏覽」單卡
 * （移植自 prototype 02 之 `#userDirect` 區塊）。那張卡是唯一選項的「選擇畫面」，逼使用者多按
 * 一次；連該頁自己的副標都寫著「一般使用者將直接進入前台」卻沒有直接進去（2026-08-26 真人回報）。
 * 判定採 `visibleMenu(role).length === 0` 而非比對 `roleCode`，與 `AdminGuard` 之守門條件**同一式**
 * ——兩邊若各寫一套，日後調整角色權限矩陣就會出現「分流頁放行、後台守衛擋掉」的死鏈。
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
  const adminDesc = (role && ADMIN_DESC[role as RoleCode]) || '';

  // F002 AC1：無後台功能權限 → 不顯示選擇畫面，直接進前台（replace：不留一筆無用的瀏覽歷程）。
  if (visibleMenu(role).length === 0) return <Navigate to="/public" replace />;

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
              您具備後台權限，請選擇要前往的介面。
            </p>
          </div>

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
        </div>
      </main>
    </div>
  );
}
