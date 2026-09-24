import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { hasAdminAccess } from '../domain/menu';
import { RoleBadge } from '../components/RoleBadge';
import { Icon } from '../components/Icon';

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
/**
 * 🔵 2026-09-22 UX16 delta（項 1／2／3；`AC-UX1`～`AC-UX5`）——兩張卡片之逐字文案與順序。
 *
 * 🔒 **兩段文案各自只有一個定義點**（`AC-UX5` ③）：字面不得在本檔以外再出現第二份。
 * 🔴 **後台說明不再依角色差異化**（`AC-UX2`／`OQ-UX16-02`＝選項 A）：四種角色所見完全相同。
 *   ⚠ 已知並接受之代價——說明不再反映各角色實際可用之功能範圍，使用者原文之
 *   `(依權限顯示)` 即為此代價之承接方式。
 * 🔒 逐字細節（下游最可能「順手修正」之三處）：前台說明**末尾無句號**、後台說明之括號為
 *   **半形** `(` `)`、`OJT進度` 中間**無空白**。
 *
 * 📝 已作廢（⚠ 不得復原、不得用於斷言）：
 *   `OLD>` 前台卡標題 `前台瀏覽`、說明 `以您的身分與部門瀏覽、搜尋、下載、列印 ICSOP 文件（含浮水印）。`
 *   `OLD>` 後台卡標題 `管理後台`；`ADMIN_DESC: Record<RoleCode, string>` 四段依角色差異化之說明
 *          （`帳號/角色管理、組織同步、系統參數、調閱歷程（依權限顯示）。` 等四句）與其 `adminDesc` 查表。
 *
 * 🔴 `AC-UX3`：本卡之 `管理平台` 與後台麵包屑首段之 `ICSOP 管理` **刻意並存**——前者是
 *   「入口的名字」（我要去哪裡），後者是「導覽樹根節點的名字」（我現在在哪裡）。
 *
 * 🔵 2026-09-24 人類裁決文案調整：卡內行動文字 `進入管理`（OLD> `進入後台`）、`進入瀏覽文件`
 *   （OLD> `前往前台`）；麵包屑首段 `ICSOP 管理`（OLD> `ICSOP 管理後台`）。
 */
const PUBLIC_CARD_TITLE = 'ICSOP 文件';
const PUBLIC_CARD_DESC = '作業程序書瀏覽、搜尋、下載、列印';
const ADMIN_CARD_TITLE = '管理平台';
const ADMIN_CARD_DESC = '儀表板、OJT進度、相關維護作業(依權限顯示)';

export function RoleLanding(): JSX.Element {
  const { user, logout } = useAuth();
  const role = user?.roleCode;

  // F002 AC1：無後台功能權限 → 不顯示選擇畫面，直接進前台（replace：不留一筆無用的瀏覽歷程）。
  // 🔴 判準走 `hasAdminAccess()` 之單一述詞（`AC-UX7`），與 `AdminGuard`／前台「前往後台」鈕同一式。
  if (!hasAdminAccess(role)) return <Navigate to="/public" replace />;

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

          {/**
           * 🔴 `AC-UX4`：兩張卡片**左右對調**——`管理平台` 在前（左）、`ICSOP 文件` 在後（右）。
           * 視覺左右由 `grid sm:grid-cols-2` 之 **DOM 順序**決定；🔴 明文禁止以 CSS `order`／
           * `flex-direction: row-reverse` 達成——那會讓 DOM 順序與視覺順序分歧，鍵盤 Tab 順序
           * 也會與畫面相反。
           * 🔒 `AC-UX5` ①：兩張卡各帶 `aria-label`，其值逐字等於該卡標題。本頁 header 之既有
           * 可見文字 `ICSOP 文件管理平台` **同時包含**兩個標題之字面 ⇒ 以 `getByText`／正規
           * 表示式為基礎之定位在本頁結構上沒有鑑別力，`aria-label` 之精確比對才是可用的定位點。
           */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Link
              to="/admin"
              aria-label={ADMIN_CARD_TITLE}
              className="group block bg-white border border-slate-200 rounded-2xl p-6 hover:border-primary-300 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-4 group-hover:bg-primary-100 transition">
                <Icon name="layout-dashboard" className="w-6 h-6 text-primary-600" />
              </div>
              <h2 className="font-bold text-slate-900 text-lg">{ADMIN_CARD_TITLE}</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                {ADMIN_CARD_DESC}
              </p>
              <span className="inline-flex items-center gap-1 text-sm text-primary-600 font-medium mt-4">
                進入管理
                <Icon name="arrow-right" className="w-4 h-4" />
              </span>
            </Link>

            <Link
              to="/public"
              aria-label={PUBLIC_CARD_TITLE}
              className="group block bg-white border border-slate-200 rounded-2xl p-6 hover:border-primary-300 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-4 group-hover:bg-primary-100 transition">
                <Icon name="panels-top-left" className="w-6 h-6 text-primary-600" />
              </div>
              <h2 className="font-bold text-slate-900 text-lg">{PUBLIC_CARD_TITLE}</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                {PUBLIC_CARD_DESC}
              </p>
              <span className="inline-flex items-center gap-1 text-sm text-primary-600 font-medium mt-4">
                進入瀏覽文件
                <Icon name="arrow-right" className="w-4 h-4" />
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
