import { useAuth } from '../auth/useAuth';
import { Icon } from '../components/Icon';

/**
 * 登入頁。版面與品牌面板權威來源：prototypes/01-login.html。
 * 僅保留途徑 A（公司帳號 Azure AD 單一登入，真實 /auth/login）；
 * 途徑 B（管理員帳密）後端尚未實作、原型 demo helper 為模擬，故略去。
 */
export function LoginPage(): JSX.Element {
  const { login } = useAuth();

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
          </div>
        </div>
      </div>
    </div>
  );
}
