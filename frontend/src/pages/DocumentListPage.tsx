import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getDocuments, setDocumentStatus } from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { formatDateTime } from './org-sync-view';
import { deriveDisplayStatus, DISPLAY_LABEL, statusCounts, type DisplayStatus } from './document-display';
import type { DocumentListItem, DocumentStatus } from '../api/types';

/**
 * 後台 ICSOP 文件清單（F017）。版面權威來源：prototypes/13-document-list.html。
 * 統計卡（程序書數量/已公告/進度中，依公告日期衍生 F012）、篩選（關鍵字/狀態/循環）、
 * 狀態切換（ICSOPAdmin；切回「有效」由後端重驗編號唯一性 F013）。RBAC：ICSOP文件管理
 * read=SysAdmin/ICSOPAdmin/Supervisor/DeptContact、write=ICSOPAdmin。
 * 註：制定組織名/當責室長名/檔案下載/樹狀圖 等欄位待 F014/F016 資料；本頁先呈現現有欄位。
 */
const ERROR_MSG: Record<string, string> = {
  DOCUMENT_NUMBER_DUPLICATE: '編號與其他「有效/作廢」文件重複，需先更換編號',
  DOCUMENT_STATUS_INVALID: '狀態值不合法',
  DOCUMENT_NOT_FOUND: '找不到文件',
};
const msgOf = (e: unknown) =>
  e instanceof ApiError ? (ERROR_MSG[e.code] ?? e.code) : '操作失敗';

const DISPLAY_TONE: Record<DisplayStatus, string> = {
  announced: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  in_progress: 'text-primary-700 bg-primary-50 border-primary-100',
  inactive: 'text-amber-700 bg-amber-50 border-amber-100',
  void: 'text-red-700 bg-red-50 border-red-100',
};

export function DocumentListPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write');
  const today = useMemo(() => new Date(), []);

  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await getDocuments());
    } catch (e) {
      setNotice({ tone: 'err', text: msgOf(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  const shown = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return docs.filter(
      (d) =>
        (!kw || d.documentNumber.toLowerCase().includes(kw) || d.documentName.toLowerCase().includes(kw)) &&
        (!fStatus || d.status === fStatus),
    );
  }, [docs, keyword, fStatus]);

  const counts = useMemo(() => statusCounts(docs, today), [docs, today]);

  const onChangeStatus = useCallback(
    async (id: string, status: DocumentStatus) => {
      try {
        await setDocumentStatus(id, status);
        setNotice({ tone: 'ok', text: '狀態已更新' });
        await load();
      } catch (e) {
        setNotice({ tone: 'err', text: msgOf(e) });
      }
    },
    [load],
  );

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="alert-circle" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無程序書管理權限</h1>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ICSOP 文件管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">後台文件清單；狀態依公告日期衍生顯示。</p>
        </div>
        {canWrite && (
          <button
            onClick={() => navigate('/admin/documents/new')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="plus" className="w-4 h-4" />
            建立文件
          </button>
        )}
      </div>

      {/* 統計卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon="database" tone="text-primary-600 bg-primary-50" value={counts.total} label="程序書數量（總數）" valueClass="text-slate-900" />
        <StatCard icon="check-circle-2" tone="text-emerald-600 bg-emerald-50" value={counts.announced} label="已公告（公告日期已到）" valueClass="text-emerald-700" />
        <StatCard icon="clock" tone="text-primary-600 bg-primary-50" value={counts.inProgress} label="進度中（公告日期未到）" valueClass="text-primary-700" />
      </div>

      {canRead && !canWrite && (
        <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="user-circle" className="w-4 h-4 shrink-0" />
          唯讀模式 · 此角色僅可檢視文件，無法建立或變更狀態。
        </div>
      )}

      {notice && (
        <div role="status" className={`text-sm border rounded-md px-3 py-2 ${notice.tone === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-700 bg-red-50 border-red-100'}`}>
          {notice.text}
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜尋編號 / 書名…" aria-label="搜尋編號或書名"
            className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white w-56 focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="狀態篩選" className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
          <option value="">所有狀態</option>
          <option value="active">有效</option>
          <option value="inactive">失效</option>
          <option value="void">作廢</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">共 {shown.length} 份</span>
      </div>

      {/* table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-3 py-2.5">程序書編號</th>
                <th className="text-left font-medium px-3 py-2.5">程序書書名</th>
                <th className="text-left font-medium px-3 py-2.5">狀態</th>
                <th className="text-left font-medium px-3 py-2.5">循環別</th>
                <th className="text-left font-medium px-3 py-2.5">版次</th>
                <th className="text-left font-medium px-3 py-2.5">公告日期</th>
                <th className="text-left font-medium px-3 py-2.5">節點</th>
                {canWrite && <th className="text-left font-medium px-3 py-2.5">變更狀態</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((d) => {
                const disp = deriveDisplayStatus(d.status, d.announcedDate, today);
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 mono text-slate-700">{d.documentNumber}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{d.documentName}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${DISPLAY_TONE[disp]}`}>
                        {DISPLAY_LABEL[disp]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{d.lifecycleName ?? '—'}</td>
                    <td className="px-3 py-2.5 mono text-xs text-slate-500">{d.edition ?? '—'}</td>
                    <td className="px-3 py-2.5 mono text-xs text-slate-500">{d.announcedDate ? formatDateTime(d.announcedDate).slice(0, 10) : '—'}</td>
                    <td className="px-3 py-2.5">
                      {d.nodeId ? (
                        <span className="text-slate-500 text-xs">已指派</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                          <Icon name="alert-triangle" className="w-3.5 h-3.5" />未指派節點
                        </span>
                      )}
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2.5">
                        <select
                          value={d.status}
                          onChange={(e) => void onChangeStatus(d.id, e.target.value as DocumentStatus)}
                          aria-label={`變更 ${d.documentNumber} 狀態`}
                          className="px-2 py-1 rounded border border-slate-300 bg-white text-xs"
                        >
                          <option value="active">有效</option>
                          <option value="inactive">失效</option>
                          <option value="void">作廢</option>
                        </select>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && shown.length === 0 && (
          <div className="text-center py-14 text-sm text-slate-500">
            {docs.length === 0 ? '尚無文件' : '查無符合結果'}
          </div>
        )}
        {loading && (
          <div className="p-6 animate-pulse space-y-3">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, tone, value, label, valueClass }: {
  icon: string; tone: string; value: number; label: string; valueClass: string;
}): JSX.Element {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
        <Icon name={icon} className="w-5 h-5" />
      </div>
      <div>
        <div className={`text-2xl font-bold leading-none ${valueClass}`}>{value}</div>
        <div className="text-xs text-slate-500 mt-1">{label}</div>
      </div>
    </div>
  );
}
