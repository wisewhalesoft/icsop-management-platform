import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAuth } from '../auth/useAuth';
import {
  getDagGraph,
  getLifecycles,
  addDagNode,
  updateDagNode,
  deleteDagNode,
  addDagEdge,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { lifecycleDisplayName } from '../domain/lifecycle-subcategory';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';
import { NodeDrawer } from './NodeDrawer';
import {
  graphToFlow,
  layoutDag,
  dagErrorMessage,
  deleteNodeConfirm,
  type FlowNodeData,
} from './dag-flow';
import type { DagGraph } from '../api/types';

/**
 * 循環 DAG 畫布（F008）。以 React Flow（@xyflow/react）呈現節點/直角 elbow 邊。
 * 成環防止由後端 addDagEdge 權威驗證（DAG_SELF_LOOP/DAG_CYCLE_DETECTED），前端據錯誤碼提示。
 * RBAC：循環管理 write（ICSOPAdmin）可編輯；SysAdmin/Supervisor 唯讀（不可拖曳/連線/增刪）。
 * 節點座標於拖曳結束持久化（updateDagNode）。
 */
function DagNodeCard({ data, selected }: NodeProps<Node<FlowNodeData>>): JSX.Element {
  const hasDocs = data.docCount > 0;
  return (
    <div
      title={data.label}
      className={`min-w-[10rem] max-w-[16rem] rounded-[10px] border bg-white shadow-sm px-2.5 py-2 ${
        selected ? 'border-primary-600 ring-2 ring-primary-200' : 'border-slate-200'
      } ${data.hasName ? '' : 'border-dashed'} ${hasDocs ? 'border-l-4 border-l-emerald-500' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-start gap-1.5">
        <Icon name="circle-dot" className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />
        <span className={`font-medium text-sm leading-snug break-words ${data.hasName ? 'text-slate-800' : 'text-slate-400'}`}>
          {data.label}
        </span>
      </div>
      <div className={`mt-1.5 flex items-center gap-1 text-[11px] ${hasDocs ? 'text-emerald-600' : 'text-slate-400'}`}>
        <Icon name={hasDocs ? 'file-check-2' : 'file-x-2'} className="w-3.5 h-3.5" />
        {hasDocs ? `掛載 ${data.docCount} 份文件` : '尚未掛載文件'}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}

const nodeTypes = { dagNode: DagNodeCard };

export function DagCanvasPage(): JSX.Element {
  const { lifecycleId = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.LIFECYCLE_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.LIFECYCLE_MANAGEMENT, 'write');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerNodeId, setDrawerNodeId] = useState<string | null>(null);
  // 刪除節點之二次確認：掛載文件會被連動解除掛載（破壞性副作用）→ 事前告知份數。
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    label: string;
    docCount: number;
  } | null>(null);
  // G-LC-007 循環名稱（頂欄標題「«name» · DAG 畫布」＋抽屜候選註記）；沿用清單端點反查。
  const [cycleName, setCycleName] = useState<string | null>(null);
  const rfRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const applyGraph = useCallback(
    (graph: DagGraph) => {
      const flow = graphToFlow(graph);
      setNodes(flow.nodes as unknown as Node<FlowNodeData>[]);
      setEdges(flow.edges as unknown as Edge[]);
    },
    [setNodes, setEdges],
  );

  // 初次載入（切換 loading 會重掛 ReactFlow → 觸發 fitView，僅用於首次）。
  const load = useCallback(async () => {
    setLoading(true);
    try {
      applyGraph(await getDagGraph(lifecycleId));
    } catch (e) {
      toast.error(e instanceof ApiError ? dagErrorMessage(e.code) : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [lifecycleId, applyGraph, toast]);

  // 靜默刷新（不切 loading → 不重掛畫布 → 不重置視窗），用於掛載變更後更新 docCount。
  const silentReload = useCallback(async () => {
    try {
      applyGraph(await getDagGraph(lifecycleId));
    } catch {
      /* 靜默：刷新失敗不打斷操作 */
    }
  }, [lifecycleId, applyGraph]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  // 反查循環名稱（清單端點；失敗不阻斷畫布）。
  // F040 F008 AC-S1／F009 AC-S1：一律經 lifecycleDisplayName 組合（含子分類），
  // 使同名不同子分類之畫布標題與節點抽屜過濾提示可彼此區分。本處亦為 NodeDrawer `cycleName` prop 之唯一來源。
  useEffect(() => {
    if (!canRead) return;
    getLifecycles()
      .then((ls) => {
        const lc = ls.find((l) => l.id === lifecycleId);
        setCycleName(lc ? lifecycleDisplayName(lc) : null);
      })
      .catch(() => undefined);
  }, [canRead, lifecycleId]);

  const onConnect = useCallback(
    async (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      if (conn.source === conn.target) {
        toast.error(dagErrorMessage('DAG_SELF_LOOP'));
        return;
      }
      try {
        const edge = await addDagEdge(lifecycleId, conn.source, conn.target);
        setEdges((eds) => addEdge({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId, type: 'step' }, eds));
        toast.success('已建立連線');
      } catch (e) {
        toast.error(e instanceof ApiError ? dagErrorMessage(e.code) : '建立連線失敗');
      }
    },
    [lifecycleId, setEdges, toast],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      void updateDagNode(lifecycleId, node.id, {
        positionX: Math.round(node.position.x),
        positionY: Math.round(node.position.y),
      }).catch(() => toast.error('座標儲存失敗'));
    },
    [lifecycleId, toast],
  );

  const onAddNode = useCallback(async () => {
    try {
      // 於當前視窗中央放置新節點，避免整個畫布重新定位（維持使用者當前視角）。
      let pos = { x: 80 + nodes.length * 24, y: 60 + nodes.length * 16 };
      const inst = rfRef.current, wrap = wrapRef.current;
      if (inst && wrap) {
        const r = wrap.getBoundingClientRect();
        const c = inst.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        pos = { x: Math.round(c.x - 92), y: Math.round(c.y - 38) }; // 置中（節點約 184×76）
      }
      const created = await addDagNode(lifecycleId, { positionX: pos.x, positionY: pos.y });
      if (!created) return;
      setNodes((nds) => [
        ...nds,
        {
          id: created.id,
          type: 'dagNode',
          position: { x: created.positionX, y: created.positionY },
          data: { label: created.name ?? '未命名節點', hasName: !!created.name, docCount: created.docCount ?? 0 },
        } as unknown as Node<FlowNodeData>,
      ]);
      toast.success('已於畫布中央新增未命名節點');
    } catch {
      toast.error('新增節點失敗');
    }
  }, [lifecycleId, nodes.length, setNodes, toast]);

  // 開啟確認對話框（帶入該節點掛載份數，供文案提示連動解除掛載）。
  const onDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    const n = nodes.find((x) => x.id === selectedId);
    setPendingDelete({
      id: selectedId,
      label: n?.data.label ?? '未命名節點',
      docCount: n?.data.docCount ?? 0,
    });
  }, [selectedId, nodes]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { id, docCount } = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteDagNode(lifecycleId, id);
      // 就地移除節點與其相關連線（後端亦連動刪邊），不重掛畫布以維持視角。
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
      toast.success(
        docCount > 0
          ? `節點已刪除（連動移除相關連線，並解除 ${docCount} 份文件掛載）`
          : '節點已刪除（連動移除相關連線）',
      );
    } catch {
      toast.error('刪除節點失敗');
    }
  }, [lifecycleId, pendingDelete, setNodes, setEdges, toast]);

  // 整理連結線：dagre 上到下分層排列，套用並持久化座標，再框選全圖。
  const onTidy = useCallback(async () => {
    if (!nodes.length) return;
    const laid = layoutDag(nodes, edges.map((e) => ({ source: e.source, target: e.target })));
    setNodes(laid);
    requestAnimationFrame(() => rfRef.current?.fitView({ padding: 0.2, duration: 300 }));
    try {
      await Promise.all(
        laid.map((n) =>
          updateDagNode(lifecycleId, n.id, {
            positionX: Math.round(n.position.x),
            positionY: Math.round(n.position.y),
          }),
        ),
      );
      toast.success('已重新整理節點排列（上到下分層）並儲存座標');
    } catch {
      toast.error('排列已套用，但座標儲存失敗（重新整理後可能還原）');
    }
  }, [nodes, edges, lifecycleId, setNodes, toast]);

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
    <div className="space-y-3">
      {/* prototype 11 行 65：標題節點掛 [data-lifecycle-title]，內容為「循環顯示名稱 · DAG 畫布」。 */}
      <PageHeader
        breadcrumb={[{ label: '循環管理', to: '/admin/lifecycles' }, { label: 'DAG 畫布' }]}
        title={cycleName ? `${cycleName} · DAG 畫布` : 'DAG 畫布'}
        titleAttrs={{ 'data-lifecycle-title': '' }}
      >
        {canWrite && (
          <>
            <button
              onClick={() => void onAddNode()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
            >
              <Icon name="plus" className="w-4 h-4" />
              新增節點
            </button>
            <button
              onClick={onDeleteSelected}
              disabled={!selectedId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="trash-2" className="w-4 h-4" />
              刪除節點
            </button>
            <button
              onClick={() => void onTidy()}
              disabled={!nodes.length}
              title="以上到下分層自動排列，整理凌亂的連結線"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="layout-grid" className="w-4 h-4" />
              整理連結線
            </button>
          </>
        )}
      </PageHeader>

      {canRead && !canWrite && (
        <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="eye" className="w-4 h-4 shrink-0" />
          唯讀模式 · 此角色僅可檢視循環節點與連線，無法編輯。
        </div>
      )}

      {/* G-LC-010 畫布最大化（於 admin shell 內以 viewport 計算高度；full-bleed 需 AppShell 重構，另議）。 */}
      <div ref={wrapRef} data-testid="dag-canvas-viewport" className="relative border border-slate-200 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 180px)', minHeight: 520, background: '#F8FAFC' }}>
        {/* G-LC-013 連線提示：畫布右上浮動卡（prototype 11 文案）。 */}
        {canWrite && (
          <div className="absolute right-4 top-4 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/90 border border-slate-200 shadow-sm text-xs text-slate-500 max-w-[220px]">
            <Icon name="info" className="w-4 h-4 shrink-0 text-primary-600" />
            <span>拖曳節點底部圓點可建立「上到下」有向連線；系統會即時阻擋成環。</span>
          </div>
        )}
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">載入中…</div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onInit={(inst) => (rfRef.current = inst)}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(c) => void onConnect(c)}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_e, node) => setDrawerNodeId(node.id)}
            onSelectionChange={({ nodes: sel }) => setSelectedId(sel[0]?.id ?? null)}
            nodeTypes={nodeTypes}
            nodesDraggable={canWrite}
            nodesConnectable={canWrite}
            elementsSelectable
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} color="#E2E8F0" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        )}
      </div>

      {drawerNodeId && (
        <NodeDrawer
          lifecycleId={lifecycleId}
          nodeId={drawerNodeId}
          canWrite={canWrite}
          cycleName={cycleName ?? undefined}
          onClose={() => setDrawerNodeId(null)}
          onNodeRenamed={(id, nm) =>
            setNodes((nds) =>
              nds.map((n) =>
                n.id === id
                  ? { ...n, data: { ...n.data, label: nm, hasName: nm !== '未命名節點' } }
                  : n,
              ),
            )
          }
          onChanged={() => void silentReload()}
        />
      )}

      {pendingDelete && (
        <DeleteNodeConfirm
          label={pendingDelete.label}
          docCount={pendingDelete.docCount}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}

/** 刪除節點之確認對話框（版式沿用 LifecycleListPage.ConfirmModal）。 */
function DeleteNodeConfirm({
  label,
  docCount,
  onCancel,
  onConfirm,
}: {
  label: string;
  docCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const { title, body } = deleteNodeConfirm(label, docCount);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-labelledby="delNodeTitle"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Icon name="alert-triangle" className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 id="delNodeTitle" className="font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 mt-1">{body}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCancel} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">取消</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700">確認刪除</button>
        </div>
      </div>
    </div>
  );
}
