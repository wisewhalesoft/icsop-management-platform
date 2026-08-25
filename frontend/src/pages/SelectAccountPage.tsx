import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Icon } from '../components/Icon';
import { getSelectAccountCandidates, selectAccount } from '../api/endpoints';
import type { SelectAccountResponse } from '../api/types';

/**
 * F001 帳號選擇 delta — 帳號選擇畫面（丙節 `AC-M12`〜`AC-M17`／`AC-M26`）。
 *
 * 🔴 本批無對應 prototype（`[OPEN-M5]`）：版面為依丙節 AC 之最小揭露原則自訂之合理預設。
 *  - `GET /auth/select-account`：取候選；401 `AUTH_SELECTION_TICKET_INVALID` → 導回登入頁，
 *    不顯示任何帳號資料（`AC-M17`）。
 *  - 不預先選取任一候選、確認鈕於未選取前停用（`AC-M16`）。
 *  - 選定並確認後呼叫 `selectAccount(accountId)`，成功後以 `useAuth().refresh()` 重新解析 session
 *    （cookie 已由後端核發），交由 `AppRoutes` 導向已登入路由。
 */
export function SelectAccountPage(): JSX.Element | null {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [data, setData] = useState<SelectAccountResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSelectAccountCandidates()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        // AC-M17：票證缺漏／無效／過期 → 不顯示任何帳號資料，導回登入頁。
        if (!cancelled) navigate('/login', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function onConfirm(): Promise<void> {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      await selectAccount(selected);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
            style={{
              background: 'linear-gradient(135deg,#2A4A7E 0%,#365C97 50%,#6E96D4 100%)',
            }}
          >
            <Icon name="building-2" className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg text-slate-900">ICSOP 文件管理平台</span>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-1">選擇帳號</h2>
        <p className="text-sm text-slate-500 mb-1">
          <Icon name="user" className="w-4 h-4 inline mr-1 text-slate-400" />
          {data.name}
        </p>
        <p className="text-sm text-slate-500 mb-4">您的信箱對應多筆帳號，請選擇要登入之帳號。</p>

        <div role="radiogroup" aria-label="選擇帳號" className="space-y-2 mb-6">
          {data.candidates.map((c) => (
            <label
              key={c.accountId}
              className="flex items-center gap-3 rounded-md border border-slate-300 px-3 py-2.5 text-sm cursor-pointer hover:bg-slate-50 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50"
            >
              <input
                type="radio"
                name="select-account-candidate"
                aria-label={c.loginId}
                checked={selected === c.accountId}
                onChange={() => setSelected(c.accountId)}
                className="shrink-0"
              />
              <span className="flex-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span className="text-slate-900">{c.companyName}</span>
                <span className="text-slate-500">{c.orgName}</span>
                <span className="text-slate-500">{c.roleName}</span>
                <span className="mono text-slate-400">{c.loginId}</span>
              </span>
            </label>
          ))}
        </div>

        <button
          type="button"
          disabled={!selected || submitting}
          onClick={() => void onConfirm()}
          className="w-full py-2.5 rounded-md bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? '登入中…' : '確認登入'}
        </button>
      </div>
    </div>
  );
}
