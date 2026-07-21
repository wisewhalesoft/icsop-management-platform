import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';

/**
 * 前台瀏覽佔位頁。前台瀏覽（E06 / F019）為後續 epic，尚未實作；
 * 此頁維持導覽可用並誠實標示開發中，待該 epic 移植 prototypes/03-public-list.html。
 */
export function PublicPlaceholder(): JSX.Element {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="panels-top-left" className="w-7 h-7 text-primary-600" />
        </div>
        <h1 className="font-semibold text-slate-900 text-lg">前台瀏覽</h1>
        <p className="text-sm text-slate-500 mt-1">
          前台文件瀏覽（E06）尚在開發中。
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Icon name="arrow-left" className="w-4 h-4" />
          返回
        </Link>
      </div>
    </div>
  );
}
