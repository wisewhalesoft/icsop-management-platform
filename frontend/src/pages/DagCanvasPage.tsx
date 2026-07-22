import { useCallback, useEffect, useState } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAuth } from '../auth/useAuth';
import {
  getDagGraph,
  addDagNode,
  updateDagNode,
  deleteDagNode,
  addDagEdge,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { NodeDrawer } from './NodeDrawer';
import { graphToFlow, dagErrorMessage, type FlowNodeData } from './dag-flow';

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
      className={`w-40 rounded-[10px] border bg-white shadow-sm px-2.5 py-2 ${
        selected ? 'border-primary-600 ring-2 ring-primary-200' : 'border-slate-200'
      } ${data.hasName ? '' : 'border-dashed'} ${hasDocs ? 'border-l-4 border-l-emerald-500' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-center gap-1.5">
        <Icon name="circle-dot" className="w-3.5 h-3.5 text-slate-300" />
        <span className={`font-medium text-sm truncate ${data.hasName ? 'text-slate-800' : 'text-slate-400'}`}>
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
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.LIFECYCLE_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.LIFECYCLE_MANAGEMENT, 'write');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerNodeId, setDrawerNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const graph = await getDagGraph(lifecycleId);
      const flow = graphToFlow(graph);
      setNodes(flow.nodes as unknown as Node<FlowNodeData>[]);
      setEdges(flow.edges as unknown as Edge[]);
    } catch (e) {
      setNotice({ tone: 'err', text: e instanceof ApiError ? dagErrorMessage(e.code) : '載入失敗' });
    } finally {
      setLoading(false);
    }
  }, [lifecycleId, setNodes, setEdges]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  const onConnect = useCallback(
    async (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      if (conn.source === conn.target) {
        setNotice({ tone: 'err', text: dagErrorMessage('DAG_SELF_LOOP') });
        return;
      }
      try {
        const edge = await addDagEdge(lifecycleId, conn.source, conn.target);
        setEdges((eds) => addEdge({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId, type: 'step' }, eds));
        setNotice({ tone: 'ok', text: '已建立連線' });
      } catch (e) {
        setNotice({ tone: 'err', text: e instanceof ApiError ? dagErrorMessage(e.code) : '建立連線失敗' });
      }
    },
    [lifecycleId, setEdges],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      void updateDagNode(lifecycleId, node.id, {
        positionX: Math.round(node.position.x),
        positionY: Math.round(node.position.y),
      }).catch(() => setNotice({ tone: 'err', text: '座標儲存失敗' }));
    },
    [lifecycleId],
  );

  const onAddNode = useCallback(async () => {
    try {
      await addDagNode(lifecycleId, { positionX: 80 + nodes.length * 24, positionY: 60 + nodes.length * 16 });
      await load();
      setNotice({ tone: 'ok', text: '已新增未命名節點' });
    } catch {
      setNotice({ tone: 'err', text: '新增節點失敗' });
    }
  }, [lifecycleId, nodes.length, load]);

  const onDeleteSelected = useCallback(async () => {
    if (!selectedId) return;
    try {
      await deleteDagNode(lifecycleId, selectedId);
      setSelectedId(null);
      await load();
      setNotice({ tone: 'ok', text: '節點已刪除（連動移除相關連線）' });
    } catch {
      setNotice({ tone: 'err', text: '刪除節點失敗' });
    }
  }, [lifecycleId, selectedId, load]);

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
      <PageHeader breadcrumb={['循環管理', 'DAG 畫布']} title="DAG 畫布">
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
              onClick={() => void onDeleteSelected()}
              disabled={!selectedId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="trash-2" className="w-4 h-4" />
              刪除節點
            </button>
          </>
        )}
      </PageHeader>

      {canRead && !canWrite && (
        <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="user-circle" className="w-4 h-4 shrink-0" />
          唯讀模式 · 此角色僅可檢視循環節點與連線，無法編輯。
        </div>
      )}

      {notice && (
        <div
          role="status"
          className={`text-sm border rounded-md px-3 py-2 ${
            notice.tone === 'ok'
              ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
              : 'text-red-700 bg-red-50 border-red-100'
          }`}
        >
          {notice.text}
        </div>
      )}

      {canWrite && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 text-primary-600" />
          拖曳節點底部圓點建立「上到下」有向連線；後端會即時阻擋成環（DAG_CYCLE_DETECTED）。
        </p>
      )}

      <div className="border border-slate-200 rounded-xl overflow-hidden" style={{ height: '68vh', background: '#F8FAFC' }}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">載入中…</div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
