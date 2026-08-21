import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { NODE_DOCS_STORE, NodeDocsStore, NodeMountedDoc } from './node-docs.store';
import {
  LIFECYCLE_CHANGE_PUBLISHER,
  LifecycleActor,
  LifecycleChangePublisher,
  LifecycleChangeType,
  LifecycleChangedEvent,
  NoopLifecycleChangePublisher,
} from './lifecycle-change-event';
import { NodeDocsStructuralTx } from './lifecycle-structural-change';
import { DAG_STORE, DagStore, EdgeRow, NodeView } from './dag.store';
import { buildTreeLayout, descendants } from './lifecycle-tree-layout';

export interface DrawerDoc {
  id: string;
  documentNumber: string;
  documentName: string;
}
export interface DrawerCandidate extends DrawerDoc {
  assignedNode: { id: string; name: string | null } | null;
}
export interface DrawerData {
  node: { id: string; name: string | null };
  mounted: DrawerDoc[];
  candidates: DrawerCandidate[];
  /** G-LC-015 掛載於其他循環而排除於候選之文件數（候選過濾註記）。 */
  excludedCount: number;
}

/**
 * F036 子樹抽屜（架構決策 C2，architecture-spec §12.2）：以節點為單位之分組。
 * 刻意省略 `isSelf`／`count` 兩個前端可零成本推導之欄位（`group.nodeId === 請求之 nodeId`／`documents.length`）。
 */
export interface SubtreeDocumentGroup {
  nodeId: string;
  nodeName: string | null;
  /** 已依 `AC-T13` 去重（鍵＝documentNumber，分組順序中首次出現者勝）＋組內依 documentNumber 遞增排序。 */
  documents: NodeMountedDoc[];
}

export interface SubtreeDocumentsResponse {
  /** 回顯請求之根節點 id。 */
  nodeId: string;
  /** 去重後之子樹文件總數（＝Σ 各組 documents.length）。 */
  totalCount: number;
  /** 已依 `AC-T11` 排序；本節點恆 groups[0]；0 份之節點不產生分組（`AC-T12`）。 */
  groups: SubtreeDocumentGroup[];
}

/** 掛載/改派/移除之最小操作面（NodeDocsStore 與交易內 NodeDocsStructuralTx 皆滿足）。 */
type NodeDocsMutationOps = Omit<NodeDocsStructuralTx, 'recordStructuralChange'>;

/** 子樹分組排序之最小節點身分（AC-T11）。 */
interface SubtreeNodeRef {
  nodeId: string;
  nodeName: string | null;
}

type NodePos = { x: number; y: number };

/**
 * `AC-T11` 之三層 tie-break：① 本節點恆第一 → ② `pos.y` 遞增（由上而下）→ ③ 同 y 則 `pos.x`
 * 遞增 → ④ x／y 皆同則以節點 id 字典序打破平手（防禦性，確保無隨機性）。
 */
function compareSubtreeNodes(
  a: string,
  b: string,
  rootId: string,
  pos: Map<string, NodePos>,
): number {
  if (a === rootId || b === rootId) return a === b ? 0 : a === rootId ? -1 : 1;
  const pa = pos.get(a) ?? { x: 0, y: 0 };
  const pb = pos.get(b) ?? { x: 0, y: 0 };
  if (pa.y !== pb.y) return pa.y - pb.y;
  if (pa.x !== pb.x) return pa.x - pb.x;
  return a.localeCompare(b);
}

/**
 * 子樹節點之分組順序（`AC-T11`）。座標取自**同一次** `buildTreeLayout()` 呼叫（確定性純函式，
 * architecture-spec §12.2），排序完全在後端完成 —— 前端不需、也不應再自行排序。
 */
function orderSubtreeNodes(
  nodes: NodeView[],
  edges: EdgeRow[],
  subtree: Set<string>,
  rootId: string,
): SubtreeNodeRef[] {
  const layout = buildTreeLayout(
    nodes.map((n) => ({ id: n.id, name: n.name })),
    edges.map((e) => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId })),
  );
  const pos = new Map<string, NodePos>(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  return nodes
    .filter((n) => subtree.has(n.id))
    .map((n) => ({ nodeId: n.id, nodeName: n.name }))
    .sort((a, b) => compareSubtreeNodes(a.nodeId, b.nodeId, rootId, pos));
}

/**
 * 依 `AC-T11` 之分組順序建構分組：組內依 `documentNumber` 遞增（`AC-T13` ②）、跨組以
 * `documentNumber` 去重且**首次出現者勝**（`AC-T13` ①；失效文件之編號可被重用，OQ-E04-01b）、
 * 去重後掛載 0 份之節點不產生分組（`AC-T12`）。
 */
function buildSubtreeGroups(
  ordered: SubtreeNodeRef[],
  docsByNode: Map<string, NodeMountedDoc[]>,
): SubtreeDocumentGroup[] {
  const seen = new Set<string>();
  const groups: SubtreeDocumentGroup[] = [];
  for (const ref of ordered) {
    const sorted = [...(docsByNode.get(ref.nodeId) ?? [])].sort((a, b) =>
      a.documentNumber.localeCompare(b.documentNumber),
    );
    const documents: NodeMountedDoc[] = [];
    for (const d of sorted) {
      if (seen.has(d.documentNumber)) continue;
      seen.add(d.documentNumber);
      documents.push(d);
    }
    if (documents.length > 0) {
      groups.push({ nodeId: ref.nodeId, nodeName: ref.nodeName, documents });
    }
  }
  return groups;
}

/**
 * F009 節點抽屜：文件掛載至節點（＝設 ICSOP_DOCUMENT.nodeId；一份文件僅屬一節點）。
 * 候選文件過濾為當前循環（後端）；已掛他節點須二次確認改派（NODE_DOC_ALREADY_ASSIGNED）。
 * 功能面 RBAC（循環管理 write＝ICSOPAdmin）由 controller guard 落實。
 *
 * F038 交易一致性（architecture-spec §5.9）：掛載/改派/移除文件與其結構變更事件（DOCUMENT_MOUNTED／
 * DOCUMENT_REASSIGNED／DOCUMENT_UNMOUNTED）＋ LIFECYCLE_SNAPSHOT 於**同一 DB 交易**內提交（store 提供
 * runStructuralChange 時）；未提供之 fake → 退化循序路徑（行為不變、無快照）。
 */
@Injectable()
export class NodeDocsService {
  private readonly publisher: LifecycleChangePublisher;

  constructor(
    @Inject(NODE_DOCS_STORE) private readonly store: NodeDocsStore,
    @Optional()
    @Inject(LIFECYCLE_CHANGE_PUBLISHER)
    publisher?: LifecycleChangePublisher,
    @Optional() private readonly clock: () => Date = () => new Date(),
    // F036 子樹抽屜（架構決策 C2）：追加注入既有 DAG_STORE 取節點/邊，供子樹走訪與座標排序。
    // 選填——未提供之既有 fake → 子樹退化為僅本節點（行為不變，不打爆既有手建呼叫）。
    @Optional() @Inject(DAG_STORE) private readonly dagStore?: DagStore,
  ) {
    this.publisher = publisher ?? new NoopLifecycleChangePublisher();
  }

  private buildEvent(
    lifecycleId: string,
    changeType: LifecycleChangeType,
    summary: string,
    nodeId: string | null,
    actor?: LifecycleActor,
  ): LifecycleChangedEvent {
    return {
      lifecycleId,
      changeType,
      summary,
      nodeId,
      actorId: actor?.accountId ?? null,
      actorName: actor?.name ?? null,
      actorEmployeeNo: actor?.employeeNo ?? null,
      occurredAt: this.clock(),
    };
  }

  /** 見 DagService.runChange：原子（交易＋快照）或循序（publisher）二選一。 */
  private async runChange<T>(
    op: (m: NodeDocsMutationOps) => Promise<{ result: T; event: LifecycleChangedEvent | null }>,
  ): Promise<T> {
    if (this.store.runStructuralChange) {
      return this.store.runStructuralChange(async (tx) => {
        const { result, event } = await op(tx);
        if (event) await tx.recordStructuralChange(event);
        return result;
      });
    }
    const { result, event } = await op(this.store);
    if (event) await this.publisher.publish(event);
    return result;
  }

  async getDrawer(lifecycleId: string, nodeId: string): Promise<DrawerData> {
    const node = await this.store.getNode(lifecycleId, nodeId);
    if (!node) throw new NotFoundException('NODE_NOT_FOUND');

    const docs = await this.store.listLifecycleDocs(lifecycleId);
    const mounted = docs.filter((d) => d.nodeId === nodeId);
    const candDocs = docs.filter((d) => d.nodeId !== nodeId);

    const otherNodeIds = [...new Set(candDocs.map((d) => d.nodeId).filter((v): v is string => !!v))];
    const names = await this.store.nodeNames(otherNodeIds);

    // G-LC-015：掛載於其他循環而排除之文件數（選填能力；未提供之 fake → 0）。
    const excludedCount = this.store.countDocsMountedInOtherLifecycles
      ? await this.store.countDocsMountedInOtherLifecycles(lifecycleId)
      : 0;

    return {
      node: { id: node.id, name: node.name },
      mounted: mounted.map((d) => ({ id: d.id, documentNumber: d.documentNumber, documentName: d.documentName })),
      candidates: candDocs.map((d) => ({
        id: d.id,
        documentNumber: d.documentNumber,
        documentName: d.documentName,
        assignedNode: d.nodeId ? { id: d.nodeId, name: names.get(d.nodeId) ?? null } : null,
      })),
      excludedCount,
    };
  }

  /**
   * F036 樹狀圖節點雙擊之**唯讀**文件清單（architecture-spec §10.5）。
   *
   * 刻意不重用 `getDrawer()`：後者回傳 `candidates`（可被掛載之其他文件），那是**寫入路徑**
   * 所需之資料，對唯讀抽屜是多餘的資訊暴露；且其 `mounted` 缺版次／狀態／公告日期三欄。
   */
  async listNodeDocuments(lifecycleId: string, nodeId: string): Promise<NodeMountedDoc[]> {
    const node = await this.store.getNode(lifecycleId, nodeId);
    if (!node) throw new NotFoundException('NODE_NOT_FOUND');
    if (!this.store.listNodeMountedDocs) return [];
    return this.store.listNodeMountedDocs(lifecycleId, nodeId);
  }

  /**
   * F036 子樹抽屜之唯讀文件清單（architecture-spec §12.2 決策 C2；`AC-T10`～`AC-T13`／`AC-T25`）。
   *
   * 回傳該節點及其全部下游（`descendants()`，決策 C1）所掛載之程序書，**分組／排序／去重全部在後端完成**。
   * 子樹之全部節點恆屬同一循環為**結構性保證**：`listNodes`／`listEdges` 本即以 `lifecycleId` 限定，
   * 跨循環之邊不可能被納入走訪（`AC-T25` ②）。
   */
  async listSubtreeDocuments(
    lifecycleId: string,
    nodeId: string,
  ): Promise<SubtreeDocumentsResponse> {
    const node = await this.store.getNode(lifecycleId, nodeId);
    if (!node) throw new NotFoundException('NODE_NOT_FOUND');

    const [nodes, edges] = this.dagStore
      ? await Promise.all([
          this.dagStore.listNodes(lifecycleId),
          this.dagStore.listEdges(lifecycleId),
        ])
      : [[] as NodeView[], [] as EdgeRow[]];

    // 無 dagStore（既有手建 fake）→ 子樹退化為僅本節點，行為不變。
    const ordered = this.dagStore
      ? orderSubtreeNodes(nodes, edges, descendants(edges, nodeId), nodeId)
      : [{ nodeId: node.id, nodeName: node.name }];

    const docsByNode = await this.subtreeDocs(
      lifecycleId,
      ordered.map((n) => n.nodeId),
    );
    const groups = buildSubtreeGroups(ordered, docsByNode);
    return {
      nodeId,
      totalCount: groups.reduce((sum, g) => sum + g.documents.length, 0),
      groups,
    };
  }

  /**
   * 子樹全節點之掛載文件（§12.4 #5 無 N+1）：優先走 store 之批次能力**恰一次**查詢；
   * 未提供批次能力之 store → 退化為行程內逐節點迴圈（非 N 次用戶端往返）。
   */
  private async subtreeDocs(
    lifecycleId: string,
    nodeIds: string[],
  ): Promise<Map<string, NodeMountedDoc[]>> {
    if (this.store.listNodesMountedDocs) {
      return this.store.listNodesMountedDocs(lifecycleId, nodeIds);
    }
    const map = new Map<string, NodeMountedDoc[]>();
    if (!this.store.listNodeMountedDocs) return map;
    for (const id of nodeIds) {
      map.set(id, await this.store.listNodeMountedDocs(lifecycleId, id));
    }
    return map;
  }

  /** 掛載文件至節點。confirm=true 允許自他節點改派。 */
  async mount(
    lifecycleId: string,
    nodeId: string,
    docId: string,
    confirm: boolean,
    actor?: LifecycleActor,
  ): Promise<void> {
    await this.runChange<void>(async (m) => {
      const node = await m.getNode(lifecycleId, nodeId);
      if (!node) throw new NotFoundException('NODE_NOT_FOUND');
      const doc = await m.getDoc(docId);
      if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
      if (doc.lifecycleId !== lifecycleId) {
        throw new ConflictException('NODE_DOC_LIFECYCLE_MISMATCH');
      }
      if (doc.nodeId === nodeId) return { result: undefined, event: null }; // 已在本節點，no-op
      const reassigned = !!doc.nodeId;
      if (reassigned && !confirm) {
        throw new ConflictException('NODE_DOC_ALREADY_ASSIGNED');
      }
      await m.setDocNode(docId, nodeId);

      const label = await this.docLabel(m, lifecycleId, docId);
      const event = reassigned
        ? this.buildEvent(
            lifecycleId,
            'DOCUMENT_REASSIGNED',
            `文件改派至節點『${node.name ?? '未命名節點'}』：${label}`,
            nodeId,
            actor,
          )
        : this.buildEvent(
            lifecycleId,
            'DOCUMENT_MOUNTED',
            `文件掛載至節點『${node.name ?? '未命名節點'}』：${label}`,
            nodeId,
            actor,
          );
      return { result: undefined, event };
    });
  }

  /** 移除掛載（該文件 nodeId 設為 null）。 */
  async unmount(
    lifecycleId: string,
    nodeId: string,
    docId: string,
    actor?: LifecycleActor,
  ): Promise<void> {
    await this.runChange<void>(async (m) => {
      const node = await m.getNode(lifecycleId, nodeId);
      if (!node) throw new NotFoundException('NODE_NOT_FOUND');
      const label = await this.docLabel(m, lifecycleId, docId);
      await m.setDocNode(docId, null);
      const event = this.buildEvent(
        lifecycleId,
        'DOCUMENT_UNMOUNTED',
        `文件自節點『${node.name ?? '未命名節點'}』移除掛載：${label}`,
        nodeId,
        actor,
      );
      return { result: undefined, event };
    });
  }

  /** 文件顯示標籤（編號 書名）；查無則回文件 id（不阻斷主流程）。 */
  private async docLabel(
    m: NodeDocsMutationOps,
    lifecycleId: string,
    docId: string,
  ): Promise<string> {
    const d = (await m.listLifecycleDocs(lifecycleId)).find((x) => x.id === docId);
    return d ? `${d.documentNumber} ${d.documentName}` : docId;
  }
}
