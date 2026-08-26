import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getNodeDrawer,
  mountNodeDoc,
  unmountNodeDoc,
  updateDagNode,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/useToast';
import type { NodeDrawerData } from '../api/types';

/** 抽屜內單筆文件草稿狀態（node=草稿指派、originNode=載入時伺服端指派、otherName=所在他節點名）。 */
interface DDoc {
  id: string;
  number: string;
  name: string;
  node: string | null;
  originNode: string | null;
  otherName: string | null;
}

/**
 * F009 節點抽屜（移植 prototypes/12-node-drawer.html）：點節點開右側抽屜維護節點名稱與掛載文件。
 * 採草稿批次語意 — 掛載/改派/移除先入草稿，改派需二次確認（NODE_DOC_ALREADY_ASSIGNED），
 * 「儲存並關閉」才 diff 出 mount/unmount API 送出；「取消」丟棄並還原畫布名稱。唯讀角色僅檢視。
 */
export function NodeDrawer({
  lifecycleId,
  nodeId,
  canWrite,
  cycleName,
  onClose,
  onNodeRenamed,
  onChanged,
}: {
  lifecycleId: string;
  nodeId: string;
  canWrite: boolean;
  /** G-LC-015 當前循環名稱（候選過濾註記顯示；來自 DagCanvasPage 之 getLifecycles 反查）。 */
  cycleName?: string;
  onClose: () => void;
  onNodeRenamed: (nodeId: string, name: string) => void;
  onChanged: () => void;
}): JSX.Element {
  const toast = useToast();
  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [kw, setKw] = useState('');
  const [docs, setDocs] = useState<DDoc[]>([]);
  const [unresolved, setUnresolved] = useState<Set<string>>(new Set());
  const [excludedCount, setExcludedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  // G-LC-018 滑入動畫：掛載後由 translate-x-full 過渡至 translate-x-0。
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setEntered(true);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d: NodeDrawerData = await getNodeDrawer(lifecycleId, nodeId);
        if (!alive) return;
        setName(d.node.name ?? '');
        setOriginalName(d.node.name ?? '');
        setExcludedCount(d.excludedCount ?? 0);
        const mounted: DDoc[] = d.mounted.map((m) => ({
          id: m.id,
          number: m.documentNumber,
          name: m.documentName,
          node: nodeId,
          originNode: nodeId,
          otherName: null,
        }));
        const cands: DDoc[] = d.candidates.map((c) => ({
          id: c.id,
          number: c.documentNumber,
          name: c.documentName,
          node: c.assignedNode?.id ?? null,
          originNode: c.assignedNode?.id ?? null,
          otherName: c.assignedNode?.name ?? null,
        }));
        setDocs([...mounted, ...cands]);
      } catch (e) {
        if (alive) toast.error(e instanceof ApiError ? e.code : '載入失敗');
      }
    })();
    return () => {
      alive = false;
    };
  }, [lifecycleId, nodeId]);

  const cancel = useCallback(() => {
    onNodeRenamed(nodeId, originalName.trim() || '未命名節點'); // 還原畫布即時預覽
    onClose();
  }, [nodeId, originalName, onNodeRenamed, onClose]);

  // ESC 取消
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [cancel]);

  const onNameChange = useCallback(
    (v: string) => {
      if (!canWrite) return;
      setName(v);
      onNodeRenamed(nodeId, v.trim() || '未命名節點'); // 即時反映於畫布
    },
    [canWrite, nodeId, onNodeRenamed],
  );

  const selectCandidate = useCallback(
    (d: DDoc) => {
      if (!canWrite) return;
      if (d.node && d.node !== nodeId) {
        setUnresolved((s) => new Set(s).add(d.id)); // 已掛他節點 → 改派待確認
        toast.info('此文件已掛載於其他節點，請確認是否改派');
        return;
      }
      setDocs((ds) => ds.map((x) => (x.id === d.id ? { ...x, node: nodeId } : x)));
    },
    [canWrite, nodeId, toast],
  );

  const confirmReassign = useCallback(
    (id: string) => {
      setDocs((ds) => ds.map((x) => (x.id === id ? { ...x, node: nodeId } : x)));
      setUnresolved((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    },
    [nodeId],
  );

  const cancelWarn = useCallback((id: string) => {
    setUnresolved((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);

  const unmount = useCallback((id: string) => {
    setDocs((ds) => ds.map((x) => (x.id === id ? { ...x, node: null } : x)));
  }, []);

  const save = useCallback(async () => {
    if (!canWrite) return;
    if (unresolved.size > 0) {
      toast.error('請先確認或取消改派警示後再儲存');
      return;
    }
    const toUnmount = docs.filter((d) => d.originNode === nodeId && d.node !== nodeId);
    const toMount = docs.filter((d) => d.node === nodeId && d.originNode !== nodeId);
    setSaving(true);
    try {
      if (name.trim() !== originalName.trim()) {
        await updateDagNode(lifecycleId, nodeId, { name: name.trim() || null });
      }
      for (const d of toUnmount) await unmountNodeDoc(lifecycleId, nodeId, d.id);
      for (const d of toMount) await mountNodeDoc(lifecycleId, nodeId, d.id, d.originNode !== null);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.code : '儲存失敗');
      setSaving(false);
    }
  }, [canWrite, unresolved, docs, nodeId, name, originalName, lifecycleId, onChanged, onClose, toast]);

  const mounted = useMemo(() => docs.filter((d) => d.node === nodeId), [docs, nodeId]);
  const candidates = useMemo(() => {
    const q = kw.trim().toLowerCase();
    return docs
      .filter((d) => d.node !== nodeId)
      .filter((d) => !q || d.number.toLowerCase().includes(q) || d.name.toLowerCase().includes(q));
  }, [docs, nodeId, kw]);

  const curName = name.trim() || '未命名節點';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={cancel} />
      <aside
        role="dialog"
        aria-label="節點維護"
        className={`fixed top-0 right-0 z-50 h-full w-[420px] max-w-full bg-white shadow-2xl flex flex-col transition-transform duration-300 ${entered ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-14 border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="git-commit-vertical" className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-slate-900">節點維護</h3>
          </div>
          <button onClick={cancel} aria-label="關閉" className="text-slate-400 hover:text-slate-600">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-5">
          {/* 節點名稱 */}
          <div>
            <label htmlFor="ndName" className="block text-sm font-medium text-slate-700 mb-1">節點名稱</label>
            <input
              id="ndName"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              readOnly={!canWrite}
              placeholder="輸入節點名稱"
              className={`w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600 ${canWrite ? '' : 'bg-slate-50'}`}
            />
            {canWrite && <p className="text-xs text-slate-400 mt-1">變更會即時反映於左側畫布。</p>}
          </div>

          {/* 目前掛載文件 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-slate-700">目前掛載文件</label>
              <span className="text-xs text-slate-400">{mounted.length} 份</span>
            </div>
            <div className="space-y-2">
              {mounted.length > 0 ? (
                mounted.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                    <Icon name="file-check-2" className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="mono text-xs text-slate-500">{d.number}</div>
                      <div className="text-sm text-slate-800 truncate">{d.name}</div>
                      {d.originNode !== nodeId && (
                        <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-700">改派至此</span>
                      )}
                    </div>
                    {canWrite && (
                      <button onClick={() => unmount(d.id)} aria-label="移除掛載" title="移除掛載" className="text-slate-400 hover:text-red-500">
                        <Icon name="x" className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">此節點尚無掛載文件</div>
              )}
            </div>
          </div>

          {/* 候選文件 */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">候選文件</label>
            <div className="flex items-start gap-1.5 text-xs text-slate-400 mb-2">
              <Icon name="filter" className="w-3.5 h-3.5 mt-0.5" />
              <span>
                {/* prototype 12 行 137：循環名稱掛 [data-lifecycle-title]，逐字呈現父層傳入之顯示名稱（含子分類），不自行截斷或改寫。 */}
                僅顯示所屬循環＝<span className="text-slate-600" data-lifecycle-title="">{cycleName ?? '當前循環'}</span> 之文件（後端過濾，已排除其他循環 {excludedCount} 筆）。
              </span>
            </div>
            <div className="relative mb-2">
              <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                disabled={!canWrite}
                placeholder="搜尋候選文件…"
                aria-label="搜尋候選文件"
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-sm disabled:bg-slate-50"
              />
            </div>
            <div className="space-y-2">
              {candidates.length === 0 ? (
                <div className="text-center border border-dashed border-slate-200 rounded-lg px-3 py-6">
                  <Icon name="inbox" className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-sm text-slate-500">尚無可掛載文件</p>
                  <p className="text-xs text-slate-400 mt-0.5">此循環的文件皆已掛載於本節點</p>
                </div>
              ) : (
                candidates.map((c) =>
                  unresolved.has(c.id) ? (
                    <div key={c.id} className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <Icon name="alert-triangle" className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="mono text-xs text-slate-500">{c.number}</div>
                          <div className="text-sm text-slate-800">{c.name}</div>
                          <div className="text-xs text-amber-800 mt-1">
                            文件已掛載於節點「{c.otherName ?? '其他'}」，是否改派至「{curName}」？
                          </div>
                          <div className="text-[10px] mono text-amber-500 mt-0.5">NODE_DOC_ALREADY_ASSIGNED</div>
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => confirmReassign(c.id)} className="px-2.5 py-1 rounded bg-amber-600 text-white text-xs">確認改派</button>
                            <button onClick={() => cancelWarn(c.id)} className="px-2.5 py-1 rounded border border-slate-300 text-xs">取消</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={c.id}
                      onClick={() => selectCandidate(c)}
                      className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:border-primary-300 ${canWrite ? 'cursor-pointer' : ''}`}
                    >
                      <Icon name="file-text" className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="mono text-xs text-slate-500">{c.number}</div>
                        <div className="text-sm text-slate-700 truncate">{c.name}</div>
                      </div>
                      {/* prototype 12 行 301：徽章鍵於「是否掛在他節點」（原型之 `other` 物件），非其名稱字串——
                          節點無名時仍屬已掛載（顯示未命名節點）。取草稿 `node` 而非 `originNode`，草稿中已移除
                          掛載者即時回落「未掛載」。後端已將懸空 nodeId 正規化為 assignedNode:null。 */}
                      {c.node ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">已掛載於 {c.otherName ?? '未命名節點'}</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-200">未掛載</span>
                      )}
                      {canWrite && <Icon name="plus-circle" className="w-4 h-4 text-primary-600 shrink-0" />}
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-3 flex items-center justify-between shrink-0 bg-white">
          <span className="text-xs text-slate-400">
            {unresolved.size > 0 ? `${unresolved.size} 項改派待確認` : canWrite ? '關閉即送出變更' : '唯讀模式'}
          </span>
          <div className="flex gap-2">
            <button onClick={cancel} className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
              取消
            </button>
            {canWrite && (
              <button
                onClick={() => void save()}
                disabled={saving}
                className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? '儲存中…' : '儲存並關閉'}
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
