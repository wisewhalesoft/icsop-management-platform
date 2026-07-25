import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { RoleBadge } from '../components/RoleBadge';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { visibleMenu, accessLabelFor } from '../domain/menu';
import { getDashboardSummary } from '../api/endpoints';
import type { DashboardSummary } from '../api/types';

/**
 * 後台首頁 / 儀表板。版面與卡片樣式權威來源：prototypes/07-admin-shell.html。
 * 「快速進入功能區」卡片依角色過濾（等同側欄）並連往各功能路由。
 * KPI「待辦提示」列（GAP-07-1）依角色過濾，計數接真實端點 GET /admin/dashboard/summary
 * （原註記之示範資料已汰換為真實計數；失敗則顯 0，不阻斷儀表板）。「最近活動」仍待對應端點，暫不呈現。
 */
const CARD_DESC: Record<string, string> = {
  account: '建立/停用帳號、指派角色',
  lifecycle: '循環池與節點連線維護',
  document: '文件新增與維護、狀態、附件、連結點',
  usageform: 'excel/pdf 表單上傳與文件關聯',
  docindex: 'AI 提取結果預覽、索引狀態與重新索引',
  audit: '查看/下載/列印稽核查詢',
  changehistory: '欄位 before/after diff、循環樹狀圖新舊對照',
  orgsync: '每日組織同步、異動待確認',
  settings: '角色×功能 / 角色×欄位矩陣',
};

/**
 * KPI 待辦提示卡（prototype 07 之 TODOS），依角色過濾。color/bg 沿用原型（inline style，避開 Tailwind 動態類）；
 * span 設 color → 內部 lucide 圖示以 currentColor 繼承。key 對映 GET /admin/dashboard/summary 之計數欄。
 */
const KPI_CARDS: {
  key: keyof DashboardSummary;
  label: string;
  icon: string;
  color: string;
  bg: string;
  roles: string[];
}[] = [
  { key: 'pendingOrgChanges', label: '待確認組織異動', icon: 'alert-triangle', color: '#B45309', bg: '#FEF3C7', roles: ['SysAdmin', 'ICSOPAdmin'] },
  { key: 'unassignedDocs', label: '未指派節點文件', icon: 'git-commit-vertical', color: '#B45309', bg: '#FEF3C7', roles: ['ICSOPAdmin'] },
  { key: 'disabledAccounts', label: '停用帳號待覆核', icon: 'user-x', color: '#B91C1C', bg: '#FEE2E2', roles: ['SysAdmin'] },
  { key: 'accessLast7Days', label: '調閱紀錄（近7日）', icon: 'history', color: '#365C97', bg: '#EAF1FA', roles: ['SysAdmin', 'ICSOPAdmin'] },
  { key: 'pendingPublish', label: '待公布的文件', icon: 'file-clock', color: '#047857', bg: '#D1FAE5', roles: ['ICSOPAdmin', 'Supervisor'] },
];

export function DashboardHome(): JSX.Element {
  const { user } = useAuth();
  const role = user?.roleCode;
  const cards = visibleMenu(role);
  const kpis = KPI_CARDS.filter((k) => !!role && k.roles.includes(role));

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  useEffect(() => {
    let alive = true;
    void getDashboardSummary()
      .then((s) => {
        if (alive) setSummary(s);
      })
      .catch(() => {
        // 靜默：KPI 為輔助資訊，失敗顯 0，不阻斷儀表板。
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader breadcrumb={['ICSOP 管理後台', '首頁']} title="後台首頁 / 儀表板" />
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            歡迎回來，
            <span className="mono">{user?.loginId}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            目前角色：
            <RoleBadge roleCode={role} />
          </p>
        </div>
      </div>

      {/* KPI 待辦提示（GAP-07-1，prototype 07 TODOS；角色過濾、真實計數 GET /admin/dashboard/summary） */}
      {kpis.length > 0 && (
        <div
          role="group"
          aria-label="待辦提示"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
        >
          {kpis.map((k) => (
            <div key={k.key} className="bg-white border border-slate-200 rounded-xl p-3.5">
              <div className="flex items-center gap-2">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: k.bg, color: k.color }}
                >
                  <Icon name={k.icon} className="w-4 h-4" />
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {summary?.[k.key] ?? 0}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
        <Icon name="layout-grid" className="w-4 h-4 text-slate-400" />
        快速進入功能區
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.length === 0 ? (
          <div className="col-span-full text-sm text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl px-4 py-8 text-center">
            此角色無可用功能區
          </div>
        ) : (
          cards.map((c) => {
            const acc = accessLabelFor(role, c.functionKey);
            const editable = acc === 'CRUD';
            return (
              <Link
                key={c.id}
                to={c.route}
                className="group bg-white border border-slate-200 rounded-xl p-4 hover:border-primary-300 hover:shadow-sm transition block"
              >
                <div className="flex items-start justify-between">
                  <span className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
                    <Icon name={c.icon} className="w-5 h-5 text-primary-600" />
                  </span>
                  {editable ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-700">
                      可編輯
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      唯讀
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-slate-900 mt-3 group-hover:text-primary-700">
                  {c.label}
                </h3>
                <p className="text-xs text-slate-500 mt-1">{CARD_DESC[c.id]}</p>
                <div className="mt-3 text-xs text-primary-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  進入
                  <Icon name="arrow-right" className="w-3.5 h-3.5" />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
