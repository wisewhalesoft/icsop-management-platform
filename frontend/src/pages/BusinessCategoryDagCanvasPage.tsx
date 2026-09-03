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
  getBusinessCategoryGraph,
  getBusinessCategories,
  addBusinessCategoryNode,
  updateBusinessCategoryNode,
  deleteBusinessCategoryNode,
  addBusinessCategoryEdge,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { businessCategoryDisplayName } from '../domain/business-category';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';
import { BusinessCategoryNodeDrawer } from './BusinessCategoryNodeDrawer';
import { graphToFlow, layoutDag, type FlowNodeData } from './dag-flow';
import {
  businessCategoryDagErrorMessage,
  deleteBusinessCategoryNodeConfirm,
} from './business-category-dag-flow';
import type { BusinessCategoryGraph } from '../api/types';

/**
 * F043 §乙 業務/功能類別 DAG 畫布（`AC-15`～`AC-19`）。版面權威＝
 * `prototypes/27-business-category-canvas.html`（鏡射 `11-dag-canvas.html`）。
 *
 * 🔴 防環由**後端**於交易內權威驗證（`AC-17`），前端據其**專屬**錯誤碼提示
 *    （`BUSINESS_CATEGORY_SELF_LOOP`／`BUSINESS_CATEGORY_CYCLE_DETECTED`，`AC-16`）。
 * 🔴 RBAC 與循環管理**刻意不同**（`AC-44`）：主管為**唯讀**（可進入、無工具列），**非** 403；
 *    整頁擋下者僅部門窗口／一般使用者。
 * 🔒 `AC-49`：`DagCanvasPage.tsx` 一行未改——本頁為平行第二套，不是它的 delta。
 */
function BcDagNodeCard({ data, selected }: NodeProps<Node<FlowNodeData>>): JSX.Element {
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

const nodeTypes = { dagNode: BcDagNodeCard };

export function BusinessCategoryDagCanvasPage(): JSX.Element {
  const { businessCategoryId = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerNodeId, setDrawerNodeId] = useState<string | null>(null);
  /** `AC-18`：刪除節點之二次確認——連動移除之**掛載列數**須事前讓使用者知情。 */
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    label: string;
    mountCount: number;
  } | null>(null);
  const [categoryLabel, setCategoryLabel] = useState<string | null>(null);
  const rfRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const applyGraph = useCallback(
    (graph: BusinessCategoryGraph) => {
      const flow = graphToFlow(graph);
      setNodes(flow.nodes as unknown as Node<FlowNodeData>[]);
      setEdges(flow.edges as unknown as Edge[]);
    },
    [setNodes, setEdges],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      applyGraph(await getBusinessCategoryGraph(businessCategoryId));
    } catch (e) {
      toast.error(e instanceof ApiError ? businessCategoryDagErrorMessage(e.code) : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [businessCategoryId, applyGraph, toast]);

  /** 靜默刷新（不切 loading → 不重掛畫布 → 不重置視窗），用於掛載變更後更新掛載數。 */
  const silentReload = useCallback(async () => {
    try {
      applyGraph(await getBusinessCategoryGraph(businessCategoryId));
    } catch {
      /* 靜默：刷新失敗不打斷操作 */
    }
  }, [businessCategoryId, applyGraph]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  /**
   * `AC-19`：頁首標題＝`businessCategoryDisplayName` 之輸出＋` · DAG 畫布`
   * （有子分類含全形括號、無則不含）。反查清單端點；失敗不阻斷畫布。
   */
  useEffect(() => {
    if (!canRead) return;
    getBusinessCategories()
      .then((list) => {
        const bc = Array.isArray(list) ? list.find((b) => b.id === businessCategoryId) : undefined;
        setCategoryLabel(bc ? businessCategoryDisplayName(bc) : null);
      })
      .catch(() => undefined);
  }, [canRead, businessCategoryId]);

  const onConnect = useCallback(
    async (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      if (conn.source === conn.target) {
        toast.error(businessCategoryDagErrorMessage('BUSINESS_CATEGORY_SELF_LOOP'));
        return;
      }
      try {
        const edge = await addBusinessCategoryEdge(businessCategoryId, conn.source, conn.target);
        setEdges((eds) =>
          addEdge({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId, type: 'step' }, eds),
        );
        toast.success('已建立連線');
      } catch (e) {
        toast.error(e instanceof ApiError ? businessCategoryDagErrorMessage(e.code) : '建立連線失敗');
      }
    },
    [businessCategoryId, setEdges, toast],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      void updateBusinessCategoryNode(businessCategoryId, node.id, {
        positionX: Math.round(node.position.x),
        positionY: Math.round(node.position.y),
      }).catch(() => toast.error('座標儲存失敗'));
    },
    [businessCategoryId, toast],
  );

  const onAddNode = useCallback(async () => {
    try {
      let pos = { x: 80 + nodes.length * 24, y: 60 + nodes.length * 16 };
      const inst = rfRef.current;
      const wrap = wrapRef.current;
      if (inst && wrap) {
        const r = wrap.getBoundingClientRect();
        const c = inst.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        pos = { x: Math.round(c.x - 92), y: Math.round(c.y - 38) };
      }
      const created = await addBusinessCategoryNode(businessCategoryId, {
        positionX: pos.x,
        positionY: pos.y,
      });
      if (!created) return;
      setNodes((nds) => [
        ...nds,
        {
          id: created.id,
          type: 'dagNode',
          position: { x: created.positionX, y: created.positionY },
          data: {
            label: created.name ?? '未命名節點',
            hasName: !!created.name,
            docCount: created.docCount ?? 0,
          },
        } as unknown as Node<FlowNodeData>,
      ]);
      toast.success('已於畫布中央新增未命名節點');
    } catch {
      toast.error('新增節點失敗');
    }
  }, [businessCategoryId, nodes.length, setNodes, toast]);

  const onDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    const n = nodes.find((x) => x.id === selectedId);
    setPendingDelete({
      id: selectedId,
      label: n?.data.label ?? '未命名節點',
      mountCount: n?.data.docCount ?? 0,
    });
  }, [selectedId, nodes]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { id, mountCount } = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteBusinessCategoryNode(businessCategoryId, id);
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
      toast.success(
        mountCount > 0
          ? `節點已刪除（連動移除相關連線，並移除 ${mountCount} 筆掛載關係）`
          : '節點已刪除（連動移除相關連線）',
      );
    } catch {
      toast.error('刪除節點失敗');
    }
  }, [businessCategoryId, pendingDelete, setNodes, setEdges, toast]);

  const onTidy = useCallback(async () => {
    if (!nodes.length) return;
    const laid = layoutDag(nodes, edges.map((e) => ({ source: e.source, target: e.target })));
    setNodes(laid);
    requestAnimationFrame(() => rfRef.current?.fitView({ padding: 0.2, duration: 300 }));
    try {
      await Promise.all(
        laid.map((n) =>
          updateBusinessCategoryNode(businessCategoryId, n.id, {
            positionX: Math.round(n.position.x),
            positionY: Math.round(n.position.y),
          }),
        ),
      );
      toast.success('已重新整理節點排列（上到下分層）並儲存座標');
    } catch {
      toast.error('排列已套用，但座標儲存失敗（重新整理後可能還原）');
    }
  }, [nodes, edges, businessCategoryId, setNodes, toast]);

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
    <div className="space-y-3">
      {/* AC-19：標題＝businessCategoryDisplayName 之輸出 ＋「 · DAG 畫布」。 */}
      <PageHeader
        breadcrumb={[
          { label: '業務/功能類別管理', to: '/admin/business-categories' },
          { label: 'DAG 畫布' },
        ]}
        title={categoryLabel ? `${categoryLabel} · DAG 畫布` : 'DAG 畫布'}
        titleAttrs={{ 'data-business-category-title': '' }}
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

      {/* 🔴 AC-44：主管落在此分支（唯讀可視），非整頁 403。 */}
      {canRead && !canWrite && (
        <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="eye" className="w-4 h-4 shrink-0" />
          唯讀模式 · 此角色僅可檢視業務/功能類別之節點與連線，無法編輯。
        </div>
      )}

      <div
        ref={wrapRef}
        data-testid="bc-dag-canvas-viewport"
        className="relative border border-slate-200 rounded-xl overflow-hidden"
        style={{ height: 'calc(100vh - 180px)', minHeight: 520, background: '#F8FAFC' }}
      >
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
        <BusinessCategoryNodeDrawer
          businessCategoryId={businessCategoryId}
          nodeId={drawerNodeId}
          canWrite={canWrite}
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
        <DeleteBcNodeConfirm
          label={pendingDelete.label}
          mountCount={pendingDelete.mountCount}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}

/** `AC-18` 刪除節點之確認對話框（文案唯一組字點見 `business-category-dag-flow.ts`）。 */
function DeleteBcNodeConfirm({
  label,
  mountCount,
  onCancel,
  onConfirm,
}: {
  label: string;
  mountCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const { title, body } = deleteBusinessCategoryNodeConfirm(label, mountCount);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-labelledby="delBcNodeTitle"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Icon name="alert-triangle" className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 id="delBcNodeTitle" className="font-semibold text-slate-900">
              {title}
            </h3>
            <p className="text-sm text-slate-500 mt-1">{body}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCancel} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
            取消
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700">
            確認刪除
          </button>
        </div>
      </div>
    </div>
  );
}
