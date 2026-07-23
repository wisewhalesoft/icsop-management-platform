import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/useAuth';
import { visibleMenu } from './domain/menu';
import { Icon } from './components/Icon';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RoleLanding } from './pages/RoleLanding';
import { DashboardHome } from './pages/DashboardHome';
import { OrgSyncPage } from './pages/OrgSyncPage';
import { AccountManagementPage } from './pages/AccountManagementPage';
import { LifecycleListPage } from './pages/LifecycleListPage';
import { DagCanvasPage } from './pages/DagCanvasPage';
import { DocumentListPage } from './pages/DocumentListPage';
import { DocumentCreatePage } from './pages/DocumentCreatePage';
import { PermissionMatrixPage } from './pages/PermissionMatrixPage';
import { AccessHistoryPage } from './pages/AccessHistoryPage';
import { ChangeHistoryPage } from './pages/ChangeHistoryPage';
import { DocIndexPage } from './pages/DocIndexPage';
import { ModulePlaceholder } from './pages/ModulePlaceholder';
import { PublicListPage } from './pages/PublicListPage';
import { PublicViewerPage } from './pages/PublicViewerPage';
import { LifecycleTreePreviewPage } from './pages/LifecycleTreePreviewPage';

/** 全頁載入狀態（等待 /auth/me）。 */
function FullPageLoading(): JSX.Element {
  return (
    <div
      role="status"
      className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white text-slate-500"
    >
      <Icon name="loader-2" className="w-8 h-8 text-primary-600 animate-spin" />
      <p className="text-sm">載入中…</p>
    </div>
  );
}

/** 全頁錯誤（非 401，如網路）。 */
function FullPageError({ message, onRetry }: { message: string | null; onRetry: () => void }): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white text-slate-600 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
        <Icon name="alert-circle" className="w-6 h-6 text-red-600" />
      </div>
      <p className="text-sm font-medium text-slate-900">無法連線至伺服器</p>
      {message && <p className="text-xs mono text-slate-400">{message}</p>}
      <button
        onClick={onRetry}
        className="mt-2 px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700"
      >
        重試
      </button>
    </div>
  );
}

/** 後台守衛：無任何後台功能權限（如一般使用者）→ 導回角色分流頁。 */
function AdminGuard(): JSX.Element {
  const { user } = useAuth();
  if (visibleMenu(user?.roleCode).length === 0) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

/**
 * 路由與 auth gating（F001/F002）。與 App 分離以便單測（注入 MemoryRouter）。
 */
export function AppRoutes(): JSX.Element {
  const { status, error, refresh } = useAuth();

  if (status === 'loading') return <FullPageLoading />;
  if (status === 'error') return <FullPageError message={error} onRetry={() => void refresh()} />;
  if (status === 'unauthenticated') {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  // authenticated
  return (
    <Routes>
      <Route path="/" element={<RoleLanding />} />
      <Route path="/public" element={<PublicListPage />} />
      <Route path="/public/documents/:id" element={<PublicViewerPage />} />
      {/* F036 循環樹狀圖預覽（viewer 風格，不套後台側選單；:id＝循環 UUID）。雙入口皆導向此路由。 */}
      <Route path="/lifecycles/:id/tree" element={<LifecycleTreePreviewPage />} />
      <Route element={<AdminGuard />}>
        <Route path="/admin" element={<AppShell />}>
          <Route index element={<DashboardHome />} />
          <Route path="accounts" element={<AccountManagementPage />} />
          <Route path="lifecycles" element={<LifecycleListPage />} />
          <Route path="lifecycles/:lifecycleId/canvas" element={<DagCanvasPage />} />
          <Route path="documents" element={<DocumentListPage />} />
          <Route path="documents/new" element={<DocumentCreatePage />} />
          <Route path="org-sync" element={<OrgSyncPage />} />
          <Route path="access-history" element={<AccessHistoryPage />} />
          <Route path="change-history" element={<ChangeHistoryPage />} />
          <Route path="doc-index" element={<DocIndexPage />} />
          <Route path="settings" element={<PermissionMatrixPage />} />
          {/* 後續功能增量將以實頁取代下列佔位 */}
          <Route path="*" element={<ModulePlaceholder />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
