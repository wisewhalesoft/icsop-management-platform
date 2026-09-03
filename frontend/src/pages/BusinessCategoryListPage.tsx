import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getBusinessCategories,
  createBusinessCategory,
  updateBusinessCategory,
  setBusinessCategoryStatus,
  deleteBusinessCategory,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { businessCategoryDisplayName } from '../domain/business-category';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';
import { formatDateTime } from './org-sync-view';
import { BC_TREE_PREVIEW_WINDOW_NAME } from './BusinessCategoryTreePreviewPage';
import type { BusinessCategoryView } from '../api/types';

/**
 * F043 §甲 業務/功能類別池管理。版面／結構／文案／欄寬權威＝`prototypes/26-business-category-list.html`
 * （鏡射 `10-lifecycle-list.html`，7 欄：業務/功能類別名稱／說明／狀態／節點數／掛載文件數／最後更新／操作）。
 *
 * 🔴 RBAC 與循環管理**刻意不同**（`AC-44`）：主管對本功能為**唯讀**（可進入、看得到），
 *    而其對「循環管理」為**無**。阻擋角色僅部門窗口／一般使用者。
 * 🔴 `AC-12` 之不對稱：仍有掛載 → **刪除** 409 `BUSINESS_CATEGORY_HAS_DOCUMENTS`；**停用不受此限**。
 * 🔴 `AC-05`：`子分類` 之 trim **不在前端做**——原樣送出，正規化之權威在服務層。
 */
const ERROR_MSG: Record<string, string> = {
  BUSINESS_CATEGORY_NAME_REQUIRED: '業務/功能類別名稱不可為空',
  BUSINESS_CATEGORY_DUPLICATE: '此業務/功能類別名稱與子分類之組合已存在',
  BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT:
    '同一業務/功能類別名稱不可同時存在「無子分類」與「有子分類」之設定；請先處理既有該筆',
  BUSINESS_CATEGORY_HAS_DOCUMENTS:
    '此業務/功能類別仍有文件掛載，需先解除全部掛載才能刪除（可改為停用）',
  BUSINESS_CATEGORY_NOT_FOUND: '找不到此業務/功能類別',
};
const msgOf = (e: unknown): string =>
  e instanceof ApiError ? (ERROR_MSG[e.code] ?? e.code) : '操作失敗';

interface Confirm {
  title: string;
  body: string;
  onConfirm: () => void;
}

export function BusinessCategoryListPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write');

  const [rows, setRows] = useState<BusinessCategoryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [editTarget, setEditTarget] = useState<BusinessCategoryView | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBusinessCategories();
      setRows(Array.isArray(res) ? res : []);
    } catch (e) {
      toast.error(msgOf(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  /** `AC-14`：關鍵字比對對象＝`businessCategoryDisplayName` 之**輸出**（名稱＋子分類），非僅 `name`。 */
  const shown = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter(
      (b) =>
        (!kw || businessCategoryDisplayName(b).toLowerCase().includes(kw)) &&
        (!fStatus || b.status === fStatus),
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
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無業務/功能類別管理權限</h1>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumb={[{ label: '業務/功能類別管理' }, { label: '類別池' }]}
        title="業務/功能類別池管理"
      >
        {canWrite && (
          <button
            onClick={() => setEditTarget('new')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="plus" className="w-4 h-4" />
            新增業務/功能類別
          </button>
        )}
      </PageHeader>

      {/* 🔴 AC-44：主管落在此分支（唯讀），非 403 遮罩——與循環管理刻意不同。 */}
      {canRead && !canWrite && (
        <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="eye" className="w-4 h-4 shrink-0" />
          唯讀模式 · 此角色僅可檢視業務/功能類別與節點，無法新增/編輯/刪除。
        </div>
      )}

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋業務/功能類別名稱／子分類…"
            aria-label="搜尋業務/功能類別名稱"
            className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
          />
        </div>
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          aria-label="狀態篩選"
          className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm"
        >
          <option value="">所有狀態</option>
          <option value="active">啟用</option>
          <option value="inactive">停用</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">共 {shown.length} 個業務/功能類別</span>
      </div>

      {/* table：7 欄，欄序與欄名逐字取自 prototype 26 */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">業務/功能類別名稱</th>
                <th className="text-left font-medium px-4 py-2.5">說明</th>
                <th className="text-left font-medium px-4 py-2.5">狀態</th>
                <th className="text-left font-medium px-4 py-2.5">節點數</th>
                <th className="text-left font-medium px-4 py-2.5">掛載文件數</th>
                <th className="text-left font-medium px-4 py-2.5">最後更新</th>
                <th className="text-left font-medium px-4 py-2.5">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((b) => {
                const label = businessCategoryDisplayName(b);
                return (
                  <tr key={b.id} className="hover:bg-slate-50" data-business-category-id={b.id}>
                    {/* AC-01／AC-02：顯示字串一律經 businessCategoryDisplayName（無子分類不含括號）。 */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800" data-business-category-name="">
                        {label}
                      </div>
                    </td>
                    {/* §A.8.5 ⑥：「說明」欄為 lead 指定之新增欄（`10` 無此欄）；掛鉤逐字取自 prototype。 */}
                    <td className="px-4 py-3">
                      <span
                        className="block max-w-[300px] truncate text-slate-600"
                        data-business-category-desc=""
                        title={b.description ?? ''}
                      >
                        {b.description ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {b.status === 'active' ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ color: '#047857', background: '#D1FAE5' }}
                          >
                            ● 啟用
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                            ● 停用
                          </span>
                        )}
                        {/* AC-32：樹狀圖預覽入口——**開新頁**並帶入 businessCategoryId。
                            🔴 固定視窗名稱 ⇒ 取代同一個預覽分頁、不無限增生（比照 F036 AC-D3）；
                            ⚠ 不得加 noopener/noreferrer（會使具名 target 失效，且預覽頁之 close() 需要 opener）。 */}
                        <button
                          onClick={() => window.open(`/business-categories/${b.id}/tree`, BC_TREE_PREVIEW_WINDOW_NAME)}
                          title="檢視樹狀圖預覽（開新分頁）"
                          aria-label={`檢視「${label}」樹狀圖預覽`}
                          className="w-7 h-7 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
                        >
                          <Icon name="git-fork" className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600" data-node-count={b.nodeCount}>
                      {b.nodeCount}
                    </td>
                    {/* 📌 「掛載文件數」＝**去重後之相異文件數**（同一份文件掛在本類別多個節點只算一份）。 */}
                    <td className="px-4 py-3" data-mounted-doc-count={b.mountedDocCount}>
                      {b.mountedDocCount > 0 ? (
                        <span className="text-slate-600">{b.mountedDocCount} 份</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 mono text-xs">{formatDateTime(b.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 text-sm whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/admin/business-categories/${b.id}/canvas`)}
                          className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
                        >
                          DAG 畫布
                        </button>
                        {canWrite && (
                          <>
                            <button
                              onClick={() => setEditTarget(b)}
                              className="text-slate-600 hover:text-primary-700 hover:underline"
                            >
                              編輯
                            </button>
                            {/* 🔴 AC-12 後半：停用**不受掛載限制**（既有節點／邊／掛載關係完全不受影響）。 */}
                            <button
                              onClick={() =>
                                void act(
                                  () =>
                                    setBusinessCategoryStatus(
                                      b.id,
                                      b.status === 'active' ? 'inactive' : 'active',
                                    ),
                                  '業務/功能類別狀態已更新；既有節點、連線與掛載關係不受影響',
                                )
                              }
                              className="text-slate-600 hover:text-primary-700 hover:underline"
                            >
                              {b.status === 'active' ? '停用' : '啟用'}
                            </button>
                            <button
                              onClick={() =>
                                setConfirm({
                                  title: `刪除業務/功能類別「${label}」？`,
                                  body:
                                    b.mountedDocCount > 0
                                      ? `此業務/功能類別仍有 ${b.mountedDocCount} 份文件掛載；請先至各節點抽屜逐筆移除掛載，亦可改用列上的「停用」保留它（停用不受掛載限制）。`
                                      : '此業務/功能類別已無文件掛載，刪除後其節點與連線一併移除並記錄稽核（不可復原）。刪除以 id 為操作對象，不影響同名之其他子分類類別，亦不影響任何文件本身或其循環節點掛載。',
                                  onConfirm: () =>
                                    void act(() => deleteBusinessCategory(b.id), '業務/功能類別已刪除'),
                                })
                              }
                              className="text-red-600 hover:text-red-700 hover:underline"
                            >
                              刪除
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
        <BusinessCategoryModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async (created) => {
            setEditTarget(null);
            // AC-01：建立成功 → **導向該類別 DAG 畫布編輯頁**。
            if (created) {
              navigate(`/admin/business-categories/${created.id}/canvas`);
              return;
            }
            toast.success('已儲存業務/功能類別');
            await load();
          }}
        />
      )}

      {confirm && <ConfirmModal data={confirm} onClose={() => setConfirm(null)} />}
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

/**
 * 建立／編輯 modal（版面逐字移植 prototype 26 之 `#bcModal`）。
 *
 * 🔴 `AC-09` 驗證順序固定：① `NAME_REQUIRED`（前端即擋，不打端點）→ ② `DUPLICATE` → ③
 * `SUBCATEGORY_CONFLICT`（後兩者為後端權威判定之回傳）。刻意**不做**前端唯一性預先比對——
 * 比對範圍涵蓋停用列（`AC-13`），唯後端持有全池權威。
 */
function BusinessCategoryModal({
  target,
  onClose,
  onSaved,
}: {
  target: BusinessCategoryView | 'new';
  onClose: () => void;
  /** created＝新建之類別（觸發導向 DAG 畫布）；undefined＝編輯（僅重載清單）。 */
  onSaved: (created?: BusinessCategoryView) => void;
}): JSX.Element {
  const isNew = target === 'new';
  const [name, setName] = useState(isNew ? '' : target.name);
  const [subcategory, setSubcategory] = useState(isNew ? '' : (target.subcategory ?? ''));
  const [description, setDescription] = useState(isNew ? '' : (target.description ?? ''));
  const [nameErr, setNameErr] = useState(false);
  const [uniqErr, setUniqErr] = useState<
    'BUSINESS_CATEGORY_DUPLICATE' | 'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT' | null
  >(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setUniqErr(null);
    // ① `AC-09`：名稱必填優先於任何唯一性檢查（前端即擋，不呼叫端點）。
    if (name.trim() === '') {
      setNameErr(true);
      return;
    }
    setBusy(true);
    try {
      // 🔴 `AC-05`：`subcategory`／`description` **原樣送出**（trim 之責任在服務層）。
      const payload = { name, subcategory, description };
      if (isNew) {
        onSaved(await createBusinessCategory(payload));
      } else {
        await updateBusinessCategory(target.id, payload);
        onSaved();
      }
    } catch (e) {
      if (
        e instanceof ApiError &&
        (e.code === 'BUSINESS_CATEGORY_DUPLICATE' ||
          e.code === 'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT')
      ) {
        setUniqErr(e.code);
      } else if (e instanceof ApiError && e.code === 'BUSINESS_CATEGORY_NAME_REQUIRED') {
        setNameErr(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay>
      <div role="dialog" aria-labelledby="bcTitle" className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 id="bcTitle" className="font-semibold text-slate-900 mb-4">
          {isNew ? '新增業務/功能類別' : '編輯業務/功能類別'}
        </h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="bcName" className="block text-sm font-medium text-slate-700 mb-1">
              業務/功能類別名稱 <span className="text-red-500">*</span>
            </label>
            <input
              id="bcName"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameErr(false);
              }}
              placeholder="請輸入業務/功能類別名稱"
              className={`w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 ${nameErr ? 'border-red-500' : 'border-slate-300'}`}
            />
            {nameErr && (
              <p id="bcNameErr" className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5 shrink-0" />
                業務/功能類別名稱不可為空（BUSINESS_CATEGORY_NAME_REQUIRED）
              </p>
            )}
          </div>
          <div>
            <label htmlFor="bcSub" className="block text-sm font-medium text-slate-700 mb-1">
              子分類 <span className="text-xs font-normal text-slate-400">（非必填）</span>
            </label>
            <input
              id="bcSub"
              value={subcategory}
              onChange={(e) => {
                setSubcategory(e.target.value);
                setUniqErr(null);
              }}
              placeholder="例：消金；留白代表此業務/功能類別無子分類"
              className={`w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 ${uniqErr ? 'border-red-500' : 'border-slate-300'}`}
            />
            <p className="text-[10px] text-slate-400 mt-1">
              業務/功能類別之身分＝<span className="mono">名稱＋子分類</span>
              之組合：同名之不同子分類為
              <strong className="text-slate-500">彼此獨立的類別</strong>
              （各有 UUID／DAG／文件掛載）。同一名稱不可同時存在「無子分類」與「有子分類」。留白（或僅空白）一律存為
              <span className="mono">null</span>。
            </p>
            {uniqErr === 'BUSINESS_CATEGORY_DUPLICATE' && (
              <p id="bcDupErr" className="mt-1 text-xs text-red-600 flex items-start gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  此業務/功能類別名稱與子分類之組合已存在（<span className="mono">subcategory</span>{' '}
                  為 null 之「無子分類」亦視為一種具體組合）（BUSINESS_CATEGORY_DUPLICATE）
                </span>
              </p>
            )}
            {uniqErr === 'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT' && (
              <p id="bcConflictErr" className="mt-1 text-xs text-red-600 flex items-start gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  同一業務/功能類別名稱不可同時存在「無子分類」與「有子分類」之設定（雙向皆適用）；請先處理既有該筆（BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT）
                </span>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="bcDesc" className="block text-sm font-medium text-slate-700 mb-1">
              說明
            </label>
            <textarea
              id="bcDesc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="選填"
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
            取消
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50"
          >
            儲存
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ConfirmModal({ data, onClose }: { data: Confirm; onClose: () => void }): JSX.Element {
  return (
    <Overlay>
      <div role="dialog" aria-labelledby="bcCfTitle" className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Icon name="alert-triangle" className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 id="bcCfTitle" className="font-semibold text-slate-900">
              {data.title}
            </h3>
            <p className="text-sm text-slate-500 mt-1">{data.body}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
            取消
          </button>
          <button onClick={data.onConfirm} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700">
            確認刪除
          </button>
        </div>
      </div>
    </Overlay>
  );
}
