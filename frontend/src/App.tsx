/**
 * ⚠️ Scaffold 佔位頁。
 * 實際畫面一律依 `prototypes/` 之設計系統（Tailwind＋設計 tokens，見 prototypes/00-design-system.html）
 * 移植，**不自創樣式**。此處僅以最小 inline 樣式提供可讀入口，待 /tdd 逐頁替換。
 */
const BACKEND =
  (import.meta.env.VITE_BACKEND_ORIGIN as string | undefined) ??
  'http://localhost:3000';

export function App(): JSX.Element {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: '48px auto',
        fontFamily: "system-ui,'Noto Sans TC',sans-serif",
        color: '#0f172a',
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 22 }}>ICSOP 文件管理平台</h1>
      <p style={{ color: '#64748b' }}>
        前端 scaffold（React + TypeScript + Vite）。實際畫面將依{' '}
        <code>prototypes/</code> 之設計系統移植，不另創樣式。
      </p>
      <p>
        <a href={`${BACKEND}/auth/login`}>以公司帳號登入（Azure AD）→</a>
      </p>
    </main>
  );
}
