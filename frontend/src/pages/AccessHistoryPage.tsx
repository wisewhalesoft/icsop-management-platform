import { Fragment, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { getAccessHistory, exportAccessHistory } from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { roleMeta } from '../domain/roles';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import type {
  AccessHistoryFilters,
  AccessHistoryPage as AccessHistoryPageResult,
  AccessHistoryRow,
  AuditKind,
} from '../api/types';

/**
 * 文件調閱歷程查詢（F024，US-061）。版面/欄位/文案權威來源：prototypes/17-access-history.html。
 * 接真實端點 GET /admin/access-history（＋/export）。RBAC：SysAdmin/ICSOPAdmin 全公司唯讀；
 * 主管/部門窗口/一般使用者無此功能（自我守門封鎖，比照 OrgSyncPage）。
 * 篩選/排序/分頁/近 30 天預設由後端 queryHistory 完成，前端僅呈現與傳遞條件。
 */

/** targetType → 前端類型顯示值。 */
function rowKind(targetType: string): AuditKind {
  if (targetType === 'DOCUMENT' || targetType === 'USAGE_FORM') return '文件';
  if (targetType === 'LIFECYCLE') return '循環';
  return '變更';
}

/** 操作類型顯示標籤（比照 prototype ACT_STYLE）。 */
const ACT_LABEL: Record<string, string> = {
  VIEW: '檢視',
  DOWNLOAD: '下載',
  PRINT: '列印',
  LIFECYCLE_VIEW: '循環樹狀圖檢視',
  LIFECYCLE_DOWNLOAD: '循環樹狀圖下載',
  LIFECYCLE_PRINT: '循環樹狀圖列印',
  CHANGE_LOG_VIEW: '文件變更歷程檢視',
  LIFECYCLE_CHANGELOG_VIEW: '循環變更歷程檢視',
  LIFECYCLE_CHANGELOG_DOWNLOAD: '新舊樹狀圖下載',
};

const KIND_TONE: Record<AuditKind, string> = {
  文件: 'bg-slate-50 text-slate-700 border-slate-100',
  循環: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  變更: 'bg-amber-50 text-amber-700 border-amber-100',
};

/** 對象欄主識別：文件編號 → 循環名稱 → 使用表單 id。 */
function targetPrimary(r: AccessHistoryRow): string {
  return r.documentNumber || r.lifecycleName || r.formId || '—';
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // 以 sv-SE 取得 YYYY-MM-DD HH:mm:ss（伺服器時間 UTC+8 於後端已定，前端原樣呈現）。
  return d.toLocaleString('sv-SE');
}

interface Notice {
  tone: 'success' | 'danger' | 'info';
  text: string;
}
const TONE_BADGE: Record<string, string> = {
  success: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  danger: 'text-red-700 bg-red-50 border-red-100',
  info: 'text-blue-700 bg-blue-50 border-blue-100',
};

export function AccessHistoryPage(): JSX.Element {
  const { user } = useAuth();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.DOCUMENT_ACCESS_HISTORY, 'read');

  const [kind, setKind] = useState<AuditKind | ''>('');
  const [person, setPerson] = useState('');
  const [target, setTarget] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [result, setResult] = useState<AccessHistoryPageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (filters: AccessHistoryFilters) => {
    setLoading(true);
    setExpandedId(null);
    try {
      const res = await getAccessHistory(filters);
      setResult(res);
    } catch (e) {
      setNotice({
        tone: 'danger',
        text: e instanceof ApiError ? e.code : '載入調閱歷程失敗',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // 目前輸入狀態組成 filters（可帶 override，供類型切換即時查詢）。
  const buildFilters = useCallback(
    (o?: Partial<Record<'kind' | 'person' | 'target' | 'from' | 'to', string>>): AccessHistoryFilters => {
      const k = (o?.kind ?? kind) as AuditKind | '';
      const p = o?.person ?? person;
      const t = o?.target ?? target;
      const f = o?.from ?? from;
      const tt = o?.to ?? to;
      const filters: AccessHistoryFilters = {};
      if (k) filters.kind = k;
      if (p.trim()) filters.person = p.trim();
      if (t.trim()) filters.target = t.trim();
      if (f) filters.from = f;
      if (tt) filters.to = tt;
      return filters;
    },
    [kind, person, target, from, to],
  );

  useEffect(() => {
    if (canRead) void load({});
  }, [canRead, load]);

  const onKindChange = (v: string) => {
    const next = v as AuditKind | '';
    setKind(next);
    void load(buildFilters({ kind: next }));
  };

  const runQuery = () => void load(buildFilters());

  const clearQuery = () => {
    setKind('');
    setPerson('');
    setTarget('');
    setFrom('');
    setTo('');
    void load({});
  };

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportAccessHistory(buildFilters());
      setNotice({ tone: 'success', text: '已匯出查詢結果（CSV，草案格式）' });
    } catch (e) {
      setNotice({
        tone: 'danger',
        text: e instanceof ApiError ? `匯出失敗：${e.code}` : '匯出失敗',
      });
    } finally {
      setExporting(false);
    }
  }, [buildFilters]);

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無文件調閱歷程查詢權限</h1>
        <p className="text-sm text-slate-500 mt-1">
          僅系統管理員／ICSOP 管理員可存取本功能。
        </p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const rows = result?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={['稽核與調閱歷程', '查詢']} title="文件調閱歷程查詢">
        <button
          onClick={() => void onExport()}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Icon name="download" className="w-4 h-4" />
          匯出
        </button>
      </PageHeader>

      {/* 查詢範圍提示（全公司） */}
      <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm border bg-primary-50 border-primary-100 text-primary-700">
        <Icon name="globe" className="w-4 h-4 mt-0.5" />
        <span>
          查詢範圍：<b>全公司</b>（系統管理員 / ICSOP 管理員）。
        </span>
      </div>

      {notice && (
        <div
          role="status"
          className={`text-sm border rounded-md px-3 py-2 ${TONE_BADGE[notice.tone]}`}
        >
          {notice.text}
        </div>
      )}

      {/* 查詢列 */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label htmlFor="qKind" className="block text-xs font-medium text-slate-500 mb-1">
              類型
            </label>
            <select
              id="qKind"
              value={kind}
              onChange={(e) => onKindChange(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
            >
              <option value="">全部類型</option>
              <option value="文件">文件</option>
              <option value="循環">循環</option>
              <option value="變更">變更</option>
            </select>
          </div>
          <div>
            <label htmlFor="qPerson" className="block text-xs font-medium text-slate-500 mb-1">
              人員（姓名／員工編號）
            </label>
            <div className="relative">
              <Icon
                name="user-search"
                className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
              />
              <input
                id="qPerson"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-md border border-slate-300 text-sm"
                placeholder="王小明 / 22345"
              />
            </div>
          </div>
          <div>
            <label htmlFor="qDoc" className="block text-xs font-medium text-slate-500 mb-1">
              文件（編號／名稱）
            </label>
            <div className="relative">
              <Icon
                name="file-search"
                className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
              />
              <input
                id="qDoc"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-md border border-slate-300 text-sm"
                placeholder="ICSOP-SRC-101-1-01 / 進件"
              />
            </div>
          </div>
          <div>
            <label htmlFor="qFrom" className="block text-xs font-medium text-slate-500 mb-1">
              起始日期
            </label>
            <input
              id="qFrom"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label htmlFor="qTo" className="block text-xs font-medium text-slate-500 mb-1">
              結束日期
            </label>
            <input
              id="qTo"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={runQuery}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="search" className="w-4 h-4" />
            查詢
          </button>
          <button
            onClick={clearQuery}
            className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
          >
            清除條件
          </button>
          {result?.appliedDefaultRange && (
            <span className="ml-1 inline-flex items-center gap-1 text-xs text-amber-700">
              <Icon name="info" className="w-3.5 h-3.5" />
              未輸入條件，已套用近 30 天預設範圍
            </span>
          )}
          <span className="ml-auto text-sm text-slate-500">
            {result ? `共 ${result.total} 筆` : ''}
          </span>
        </div>
      </section>

      {/* 結果 */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1220px]">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">操作人員</th>
                <th className="text-left font-medium px-4 py-2.5">員工編號</th>
                <th className="text-left font-medium px-4 py-2.5">公司</th>
                <th className="text-left font-medium px-4 py-2.5">部門</th>
                <th className="text-left font-medium px-4 py-2.5">處/室</th>
                <th className="text-left font-medium px-4 py-2.5">角色</th>
                <th className="text-left font-medium px-4 py-2.5">類型</th>
                <th className="text-left font-medium px-4 py-2.5">對象（文件／循環）</th>
                <th className="text-left font-medium px-4 py-2.5">操作類型</th>
                <th className="text-left font-medium px-4 py-2.5">操作時間（新→舊）</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const k = rowKind(r.targetType);
                const open = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedId(open ? null : r.id)}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-2.5 mono text-slate-500">{r.employeeNo}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.company}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.department}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {r.section || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {roleMeta(r.roleCode ?? undefined)?.label ?? r.roleCode ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${KIND_TONE[k]}`}
                        >
                          {k}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 mono text-slate-600">{targetPrimary(r)}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-50 text-slate-700 border border-slate-100">
                          {r.actionType} · {ACT_LABEL[r.actionType] ?? r.actionType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 mono text-slate-500">
                        {formatDateTime(r.occurredAt)}
                      </td>
                      <td className="px-2 py-2.5 text-slate-400">
                        <Icon name={open ? 'chevron-right' : 'chevron-right'} className="w-4 h-4" />
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={11} className="px-4 py-4">
                          <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                              <Icon name="file-badge" className="w-4 h-4 text-primary-600" />
                              調閱明細
                            </div>
                            <dl className="grid sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                              <div>
                                <dt className="text-slate-400 text-xs">操作人員</dt>
                                <dd className="text-slate-700">
                                  {r.name}（{r.employeeNo}）
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">公司</dt>
                                <dd className="text-slate-700">{r.company}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">部門</dt>
                                <dd className="text-slate-700">{r.department}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">處/室</dt>
                                <dd className="text-slate-700">
                                  {r.section || (
                                    <span className="text-slate-400">（無，浮水印自動收合分隔符）</span>
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">角色</dt>
                                <dd className="text-slate-700">
                                  {roleMeta(r.roleCode ?? undefined)?.label ?? r.roleCode ?? '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">操作類型</dt>
                                <dd className="text-slate-700">
                                  {r.actionType} · {ACT_LABEL[r.actionType] ?? r.actionType}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">類型</dt>
                                <dd className="text-slate-700">{k}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">對象（文件／循環）</dt>
                                <dd className="mono text-slate-700">{targetPrimary(r)}</dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-slate-400 text-xs">對象名稱／說明</dt>
                                <dd className="text-slate-700">{r.targetName || '—'}</dd>
                              </div>
                              <div className="sm:col-span-3">
                                <dt className="text-slate-400 text-xs">
                                  操作時間（伺服器時間 UTC+8）
                                </dt>
                                <dd className="mono text-slate-700">
                                  {formatDateTime(r.occurredAt)}
                                </dd>
                              </div>
                            </dl>
                            <div className="mt-3 pt-3 border-t border-slate-100">
                              <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1.5">
                                <Icon name="stamp" className="w-4 h-4 text-primary-600" />
                                當次浮水印快照（與稽核內容完全一致）
                              </div>
                              {r.watermarkSnapshot ? (
                                <div className="mono text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2 break-all">
                                  {r.watermarkSnapshot}
                                </div>
                              ) : (
                                <div className="text-xs text-slate-400">
                                  （此動作類型無浮水印，該欄留空）
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="p-6 animate-pulse space-y-3">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-14">
            <Icon name="inbox" className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500">查無符合結果</p>
            <p className="text-sm text-slate-400 mt-1">請調整人員／文件／時間條件</p>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>
              顯示 1–{rows.length} 筆 · 每頁 {result?.pageSize ?? 50} 筆
            </span>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400 flex items-start gap-1.5">
        <Icon name="shield-check" className="w-3.5 h-3.5 mt-0.5" />
        稽核紀錄為 append-only、不可竄改（AUDIT_IMMUTABLE）；每筆之身分/時間快照與該次浮水印完全一致（F023）。
      </p>
    </div>
  );
}
