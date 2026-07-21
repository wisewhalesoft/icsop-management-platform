import { useLocation } from 'react-router-dom';
import { MENU } from '../domain/menu';
import { Icon } from '../components/Icon';

/**
 * 後台功能佔位頁：供尚未實作之功能路由使用（將由各功能 /tdd 增量逐一取代）。
 * 依當前路徑對映 MENU 取得功能名稱與圖示，維持外殼導覽一致。
 */
export function ModulePlaceholder(): JSX.Element {
  const { pathname } = useLocation();
  const item = MENU.find((m) => pathname.startsWith(m.route));
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-xl px-6 py-16 text-center">
      <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center mx-auto mb-3">
        <Icon name={item?.icon ?? 'layout-grid'} className="w-6 h-6 text-slate-400" />
      </div>
      <h1 className="font-semibold text-slate-900">{item?.label ?? '功能'}</h1>
      <p className="text-sm text-slate-500 mt-1">此功能開發中。</p>
    </div>
  );
}
