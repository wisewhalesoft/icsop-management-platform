import { NotFoundException } from '@nestjs/common';
import {
  EMPTY_SNAPSHOT_GRAPH,
  SnapshotGraph,
  SnapshotNode,
} from './lifecycle-snapshot-builder';
import {
  LifecycleChangeLogRow,
  LifecycleChangeLogStore,
} from '../change-history/lifecycle-change-log.store';
import { LifecycleSnapshotStore } from '../change-history/lifecycle-snapshot.store';

/**
 * F038 新舊快照重建 ＋ diff 計算 — 純函式（reconstruct 取 store 做 IO，但演算法本身無副作用）。
 *
 * 重建（reconstructBeforeAfter）：after＝目標事件自身快照；before＝前一筆事件之快照（無更早紀錄＝空 DAG）。
 * diff（computeLifecycleDiff）：後-前＝新增；前-後＝刪除；前後皆有但 name/docs 集合改變＝amber（改名/掛載
 * 變更）；位置差異不計入（比照 DagService.updateNode「位置＝佈局非結構變更」哲學）。忠實移植 prototype 23
 * 之 renderMiniDag add/rm/amber/addE/rmE 三分類。
 */

/** 循環樹狀圖變更日誌查無 → 404（新錯誤碼，需人類補入 error-handling.md）。 */
export class LifecycleChangeLogNotFoundError extends NotFoundException {
  constructor() {
    super('LIFECYCLE_CHANGE_LOG_NOT_FOUND');
  }
}

export interface LifecycleDiff {
  addNodes: string[];
  rmNodes: string[];
  /** 存在於前後兩側、但 name 或 docs 集合已變（改名／掛載變更）；位置差異不計入。 */
  amberNodes: string[];
  addEdges: Array<[string, string]>;
  rmEdges: Array<[string, string]>;
}

/** 掛載文件之 id 集合（排序後串接）→ 供集合語意比較（順序不影響）。 */
function docKey(node: SnapshotNode): string {
  return node.docs
    .map((d) => d.id)
    .slice()
    .sort()
    .join('|');
}
const edgeKey = (e: { sourceNodeId: string; targetNodeId: string }): string =>
  `${e.sourceNodeId}>${e.targetNodeId}`;

export function computeLifecycleDiff(before: SnapshotGraph, after: SnapshotGraph): LifecycleDiff {
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));

  const addNodes = after.nodes.filter((n) => !beforeNodes.has(n.id)).map((n) => n.id);
  const rmNodes = before.nodes.filter((n) => !afterNodes.has(n.id)).map((n) => n.id);
  const amberNodes = after.nodes
    .filter((n) => beforeNodes.has(n.id))
    .filter((n) => {
      const b = beforeNodes.get(n.id) as SnapshotNode;
      return b.name !== n.name || docKey(b) !== docKey(n);
    })
    .map((n) => n.id);

  const beforeE = new Set(before.edges.map(edgeKey));
  const afterE = new Set(after.edges.map(edgeKey));
  const addEdges = after.edges
    .filter((e) => !beforeE.has(edgeKey(e)))
    .map((e): [string, string] => [e.sourceNodeId, e.targetNodeId]);
  const rmEdges = before.edges
    .filter((e) => !afterE.has(edgeKey(e)))
    .map((e): [string, string] => [e.sourceNodeId, e.targetNodeId]);

  return { addNodes, rmNodes, amberNodes, addEdges, rmEdges };
}

/** 取同 lifecycleId、occurredAt 嚴格早於 before 之最近一筆；無則 null。純函式（供 store 與單測共用）。 */
export function selectPredecessor(
  rows: LifecycleChangeLogRow[],
  lifecycleId: string,
  before: Date,
): LifecycleChangeLogRow | null {
  const candidates = rows
    .filter((r) => r.lifecycleId === lifecycleId && r.occurredAt.getTime() < before.getTime())
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return candidates[0] ?? null;
}

async function snapshotOf(
  snapStore: LifecycleSnapshotStore,
  row: LifecycleChangeLogRow | null,
): Promise<SnapshotGraph> {
  // snapshotId 為 null（遺留舊列）或無 predecessor → 空圖（優雅降級，不拋錯）。
  if (!row || !row.snapshotId) return EMPTY_SNAPSHOT_GRAPH;
  const rec = await snapStore.findByChangeLogId(row.id);
  return rec?.graph ?? EMPTY_SNAPSHOT_GRAPH;
}

/**
 * §B.1 單事件重建。target 不存在或 lifecycleId 不符 URL → LIFECYCLE_CHANGE_LOG_NOT_FOUND（不洩漏跨循環
 * 存在性，比照全站「查無視為 404」）。after＝target 自身快照；before＝predecessor 快照或空圖。
 */
export async function reconstructBeforeAfter(
  logStore: LifecycleChangeLogStore,
  snapStore: LifecycleSnapshotStore,
  lifecycleId: string,
  changeLogId: string,
): Promise<{ before: SnapshotGraph; after: SnapshotGraph }> {
  const target = await logStore.findById(changeLogId);
  if (!target || target.lifecycleId !== lifecycleId) {
    throw new LifecycleChangeLogNotFoundError();
  }
  const after = await snapshotOf(snapStore, target);
  const predecessor = await logStore.findPredecessor(lifecycleId, target.occurredAt);
  const before = await snapshotOf(snapStore, predecessor);
  return { before, after };
}

/**
 * §B.1 group 模式（60 秒視窗分組；本輪僅函式層級支援，不接清單 UI）。before＝分組第一筆事件之
 * predecessor 快照；after＝最後一筆事件自身快照（跳過中間各筆）。firstId===lastId → 退化為單事件模式。
 */
export async function reconstructBeforeAfterForGroup(
  logStore: LifecycleChangeLogStore,
  snapStore: LifecycleSnapshotStore,
  lifecycleId: string,
  firstChangeLogId: string,
  lastChangeLogId: string,
): Promise<{ before: SnapshotGraph; after: SnapshotGraph }> {
  const first = await logStore.findById(firstChangeLogId);
  if (!first || first.lifecycleId !== lifecycleId) {
    throw new LifecycleChangeLogNotFoundError();
  }
  const last =
    lastChangeLogId === firstChangeLogId ? first : await logStore.findById(lastChangeLogId);
  if (!last || last.lifecycleId !== lifecycleId) {
    throw new LifecycleChangeLogNotFoundError();
  }
  const after = await snapshotOf(snapStore, last);
  const predecessor = await logStore.findPredecessor(lifecycleId, first.occurredAt);
  const before = await snapshotOf(snapStore, predecessor);
  return { before, after };
}
