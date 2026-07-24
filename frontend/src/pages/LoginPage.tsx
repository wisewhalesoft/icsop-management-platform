import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/useAuth';
import { Icon } from '../components/Icon';
import { passwordLogin } from '../api/endpoints';
import { ApiError } from '../api/client';

/**
 * 登入頁。版面與品牌面板權威來源：prototypes/01-login.html。
 *  - 途徑 A（公司帳號 Azure AD 單一登入）：主要路徑，整頁導向 /auth/login。
 *  - 途徑 B（管理員帳密）：備援／維運通道，SPA JSON（POST /auth/login），次於 SSO。
 *    成功後以 refresh() 重新解析 session（cookie 已由後端核發），交由 AppRoutes 導向角色分流頁。
 */

/** 後端穩定錯誤碼 → 使用者訊息（統一訊息不洩漏帳號是否存在）。 */
function loginErrorMessage(code: string): string {
  switch (code) {
    case 'AUTH_INVALID_CREDENTIALS':
      return '帳號或密碼錯誤';
    case 'AUTH_MISSING_FIELD':
      return '請輸入帳號與密碼';
    case 'AUTH_TOO_MANY_ATTEMPTS':
      // 帳密登入節流（brute-force 防護，429）；時窗過後自動恢復。
      return '登入嘗試次數過多，請稍後再試';
    default:
      return '登入失敗，請稍後再試';
  }
}

export function LoginPage(): JSX.Element {
  const { login, refresh } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = loginId.trim() !== '' && password !== '' && !submitting;

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await passwordLogin({ loginId: loginId.trim(), password });
      // cookie 已核發 → 重新解析 session；成功則 AppRoutes 轉入已登入路由。
      await refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN';
      setError(loginErrorMessage(code));
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-700">
      <div className="min-h-screen grid lg:grid-cols-2">
        {/* 品牌面板（行動裝置隱藏） */}
        <div
          className="hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden"
          style={{
            background:
              'linear-gradient(135deg,#2A4A7E 0%,#365C97 50%,#6E96D4 100%)',
          }}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
                <Icon name="file-text" className="w-6 h-6" />
              </div>
              <span className="font-bold text-xl">ICSOP 文件管理平台</span>
            </div>
          </div>
          <div className="relative z-10 space-y-4">
            <h1 className="text-3xl font-bold leading-snug">
              統一、可追溯的
              <br />
              ICSOP 文件治理
            </h1>
            <ul className="space-y-2.5 text-white/85 text-sm">
              <li className="flex items-center gap-2">
                <Icon name="search" className="w-4 h-4" />
                RWD 瀏覽 / 搜尋 / 下載 / 列印
              </li>
              <li className="flex items-center gap-2">
                <Icon name="shield-check" className="w-4 h-4" />
                身分浮水印與稽核追蹤
              </li>
              <li className="flex items-center gap-2">
                <Icon name="workflow" className="w-4 h-4" />
                循環 DAG 工作流程結構化管理
              </li>
            </ul>
          </div>
          <p className="relative z-10 text-white/60 text-xs">
            © 2026 和潤企業股份有限公司 · 內部系統
          </p>
          <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-white/5" />
          <div className="absolute right-24 top-24 w-40 h-40 rounded-full bg-white/5" />
        </div>

        {/* 登入面板 */}
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
                style={{
                  background:
                    'linear-gradient(135deg,#2A4A7E 0%,#365C97 50%,#6E96D4 100%)',
                }}
              >
                <Icon name="file-text" className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg text-slate-900">
                ICSOP 文件管理平台
              </span>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 mb-1">登入</h2>
            <p className="text-sm text-slate-500 mb-6">
              請使用公司帳號（Azure AD 單一登入）進入系統。
            </p>

            {/* 途徑 A：公司帳號單一登入（主要路徑） */}
            <button
              type="button"
              onClick={login}
              className="w-full py-3 rounded-md bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
            >
              <Icon name="building-2" className="w-4 h-4" />
              <span>使用公司帳號登入</span>
            </button>
            <p className="mt-3 text-xs text-slate-500 leading-relaxed flex items-start gap-1.5">
              <Icon name="info" className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
              <span>
                已登入公司帳號者將自動完成驗證（靜默 SSO），無需再次輸入帳號密碼。
              </span>
            </p>

            {/* 分隔線 */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400">或</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* 途徑 B：管理員帳密（備援／維運通道，版面次於 SSO） */}
            <button
              type="button"
              onClick={() => setShowAdmin((v) => !v)}
              aria-expanded={showAdmin}
              className="w-full py-2.5 rounded-md border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2"
            >
              <Icon name="key-round" className="w-4 h-4 text-slate-400" />
              <span>使用管理員帳號登入</span>
            </button>

            {showAdmin && (
              <div className="mt-4">
                <p className="text-xs text-slate-400 mb-3">
                  備援／維運通道：供系統管理員於公司帳號無法使用時登入。
                </p>

                {error && (
                  <div
                    role="alert"
                    className="mb-4 flex items-center gap-2 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600"
                  >
                    <Icon name="alert-circle" className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="admin-login-id"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      帳號 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="admin-login-id"
                      type="text"
                      autoComplete="username"
                      placeholder="管理員帳號"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="admin-password"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      密碼 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="admin-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="請輸入密碼"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full py-2.5 rounded-md bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? '登入中…' : '以管理員帳號登入'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
