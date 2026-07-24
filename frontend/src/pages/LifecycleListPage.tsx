import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getLifecycles,
  createLifecycle,
  updateLifecycle,
  setLifecycleStatus,
  deleteLifecycle,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';
import { formatDateTime } from './org-sync-view';
import type { LifecycleView } from '../api/types';

/**
 * 循環（Life Cycle）池管理（F007）。版面/樣式權威來源：prototypes/10-lifecycle-list.html。
 * 接真實端點；RBAC：循環管理 write（建立/編輯/停用/刪除）＝ICSOPAdmin、SysAdmin/Supervisor 唯讀。
 * 刪除保護：仍有文件掛載 → LIFECYCLE_HAS_DOCUMENTS。
 * 註：「掛載文件」數需 ICSOP_DOCUMENT（E04）→ 暫顯示 —；DAG 畫布連往 canvas 頁（F008）。
 */
const ERROR_MSG: Record<string, string> = {
  LIFECYCLE_NAME_REQUIRED: '循環名稱不可為空',
  LIFECYCLE_HAS_DOCUMENTS: '此循環仍有文件掛載，需先解除全部掛載才能刪除（可改為停用）',
  LIFECYCLE_NOT_FOUND: '找不到此循環',
};
const msgOf = (e: unknown) =>
  e instanceof ApiError ? (ERROR_MSG[e.code] ?? e.code) : '操作失敗';

interface Confirm {
  title: string;
  body: string;
  onConfirm: () => void;
}

export function LifecycleListPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.LIFECYCLE_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.LIFECYCLE_MANAGEMENT, 'write');

  const [rows, setRows] = useState<LifecycleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [editTarget, setEditTarget] = useState<LifecycleView | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getLifecycles());
    } catch (e) {
      toast.error(msgOf(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  const shown = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter(
      (l) =>
        (!kw || l.name.toLowerCase().includes(kw)) &&
        (!fStatus || l.status === fStatus),
    );
  }, [rows, keyword, fStatus]);

  const act = useCallback(
    async (fn: () => Promise<unknown>, okText: string) => {
      setConfirm(null);
      try {
        await fn();
        toast.success(okText);
        await load();
      } catch (e) {
        toast.error(msgOf(e));
      }
    },
    [load, toast],
  );

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="alert-circle" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無循環管理權限</h1>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={['循環管理', '循環池']} title="循環（Life Cycle）池管理">
        {canWrite && (
          <button
            onClick={() => setEditTarget('new')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="plus" className="w-4 h-4" />
            新增循環
          </button>
        )}
      </PageHeader>

      {canRead && !canWrite && (
        <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="eye" className="w-4 h-4 shrink-0" />
          唯讀模式 · 此角色僅可檢視循環與節點，無法新增/編輯/刪除。
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋循環名稱…"
            aria-label="搜尋循環名稱"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
          />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="狀態篩選" className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
          <option value="">所有狀態</option>
          <option value="active">啟用</option>
          <option value="inactive">停用</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">共 {shown.length} 個循環</span>
      </div>

      {/* table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">循環名稱</th>
                <th className="text-left font-medium px-4 py-2.5">狀態</th>
                <th className="text-left font-medium px-4 py-2.5">節點數</th>
                <th className="text-left font-medium px-4 py-2.5">掛載文件</th>
                <th className="text-left font-medium px-4 py-2.5">最後更新</th>
                <th className="text-left font-medium px-4 py-2.5">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{l.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {l.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ color: '#047857', background: '#D1FAE5' }}>● 啟用</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">● 停用</span>
                      )}
                      {/* F036 循環樹狀圖預覽入口（唯讀，讀權即可見）；開新分頁至 viewer 路由。 */}
                      <button
                        onClick={() => window.open(`/lifecycles/${l.id}/tree`, '_blank', 'noopener,noreferrer')}
                        title="檢視樹狀圖預覽（開新分頁）"
                        aria-label={`檢視「${l.name}」樹狀圖預覽`}
                        className="w-7 h-7 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
                      >
                        <Icon name="git-fork" className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.nodeCount}</td>
                  <td className="px-4 py-3">
                    {(l.mountedDocCount ?? 0) > 0 ? (
                      <span className="text-slate-600">{l.mountedDocCount} 份</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 mono text-xs">{formatDateTime(l.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 text-sm whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/admin/lifecycles/${l.id}/canvas`)}
                        className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
                      >
                        DAG 畫布
                      </button>
                      {canWrite && (
                        <>
                          <button onClick={() => setEditTarget(l)} className="text-slate-600 hover:text-primary-700 hover:underline">編輯</button>
                          <button
                            onClick={() =>
                              void act(
                                () => setLifecycleStatus(l.id, l.status === 'active' ? 'inactive' : 'active'),
                                '循環狀態已更新',
                              )
                            }
                            className="text-slate-600 hover:text-primary-700 hover:underline"
                          >
                            {l.status === 'active' ? '停用' : '啟用'}
                          </button>
                          <button
                            onClick={() => {
                              const mounted = l.mountedDocCount ?? 0;
                              setConfirm({
                                title: `刪除循環「${l.name}」？`,
                                body:
                                  mounted > 0
                                    ? `此循環仍有 ${mounted} 份文件掛載，需先解除全部掛載才能刪除（LIFECYCLE_HAS_DOCUMENTS）；亦可改用「停用」保留此循環。`
                                    : '此循環已無文件掛載，刪除後將記錄稽核（不可復原）。',
                                onConfirm: () => void act(() => deleteLifecycle(l.id), '循環已刪除'),
                              });
                            }}
                            className="text-red-600 hover:text-red-700 hover:underline"
                          >
                            刪除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && shown.length === 0 && (
          <div className="text-center py-14">
            <Icon name="inbox" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">查無符合結果</p>
          </div>
        )}
        {loading && (
          <div className="p-6 animate-pulse space-y-3">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        )}
      </div>

      {editTarget && (
        <LifecycleModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async (created) => {
            setEditTarget(null);
            // F007 Main Flow 1／AC：新增循環成功 → 導向該循環 DAG 畫布編輯頁（F008）。
            if (created) {
              navigate(`/admin/lifecycles/${created.id}/canvas`);
              return;
            }
            toast.success('已儲存循環');
            await load();
          }}
          onError={(e) => toast.error(msgOf(e))}
        />
      )}

      {confirm && (
        <ConfirmModal data={confirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      {children}
    </div>
  );
}

function LifecycleModal({
  target,
  onClose,
  onSaved,
  onError,
}: {
  target: LifecycleView | 'new';
  onClose: () => void;
  /** created＝新建之循環（觸發導向 DAG 畫布）；undefined＝編輯（僅重載清單）。 */
  onSaved: (created?: LifecycleView) => void;
  onError: (e: unknown) => void;
}): JSX.Element {
  const isNew = target === 'new';
  const [name, setName] = useState(isNew ? '' : target.name);
  const [description, setDescription] = useState(isNew ? '' : (target.description ?? ''));
  const [nameErr, setNameErr] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    if (name.trim() === '') {
      setNameErr(true);
      return;
    }
    setBusy(true);
    try {
      if (isNew) {
        const created = await createLifecycle({ name: name.trim(), description: description.trim() || null });
        onSaved(created);
      } else {
        await updateLifecycle(target.id, { name: name.trim(), description: description.trim() || null });
        onSaved();
      }
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay>
      <div role="dialog" aria-labelledby="lcTitle" className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 id="lcTitle" className="font-semibold text-slate-900 mb-4">{isNew ? '新增循環' : '編輯循環'}</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="lcName" className="block text-sm font-medium text-slate-700 mb-1">
              循環名稱 <span className="text-red-500">*</span>
            </label>
            <input
              id="lcName"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameErr(false); }}
              placeholder="請輸入循環名稱"
              className={`w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 ${nameErr ? 'border-red-500' : 'border-slate-300'}`}
            />
            {nameErr && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5 shrink-0" />
                循環名稱不可為空（LIFECYCLE_NAME_REQUIRED）
              </p>
            )}
          </div>
          <div>
            <label htmlFor="lcDesc" className="block text-sm font-medium text-slate-700 mb-1">說明</label>
            <textarea id="lcDesc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="選填" className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">取消</button>
          <button onClick={() => void submit()} disabled={busy} className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50">儲存</button>
        </div>
      </div>
    </Overlay>
  );
}

function ConfirmModal({ data, onClose }: { data: Confirm; onClose: () => void }): JSX.Element {
  return (
    <Overlay>
      <div role="dialog" aria-labelledby="cfTitle" className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Icon name="alert-triangle" className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 id="cfTitle" className="font-semibold text-slate-900">{data.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{data.body}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">取消</button>
          <button onClick={data.onConfirm} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700">確認刪除</button>
        </div>
      </div>
    </Overlay>
  );
}
