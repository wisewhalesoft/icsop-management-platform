import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { RoleBadge } from '../components/RoleBadge';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { visibleMenu, accessLabelFor } from '../domain/menu';

/**
 * 後台首頁 / 儀表板。版面與卡片樣式權威來源：prototypes/07-admin-shell.html。
 * 「快速進入功能區」卡片依角色過濾（等同側欄）並連往各功能路由。
 * 註：原型之待辦徽章與最近活動為示範資料，需各自對應功能之後端端點；
 * 待該等功能實作後再接真實資料，避免於正式頁呈現虛構資料。
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

export function DashboardHome(): JSX.Element {
  const { user } = useAuth();
  const role = user?.roleCode;
  const cards = visibleMenu(role);

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
