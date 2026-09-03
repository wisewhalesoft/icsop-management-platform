import { NotFoundException } from '@nestjs/common';
import { SnapshotGraph, SnapshotNode } from './lifecycle-snapshot-builder';
import { EMPTY_BUSINESS_CATEGORY_SNAPSHOT_GRAPH } from './business-category-snapshot-builder';
import {
  BusinessCategoryChangeLogRow,
  BusinessCategoryChangeLogStore,
} from '../change-history/business-category-change-log.store';
import { BusinessCategorySnapshotStore } from '../change-history/business-category-snapshot.store';

/**
 * F043 `AC-41` 新舊快照重建 ＋ diff 計算。
 *
 * 🔴 **決策 E1（architecture-spec §14.1）之兩種處置在本檔並存**：
 *  · `computeBusinessCategoryDiff` —— `computeLifecycleDiff` 之**逐字複製 ＋ 固定向量綁定**
 *    （純函式、零 LIFECYCLE 耦合、**不讀 `changeType`**，故與 7 值／8 值之值域差異無關）；
 *  · `selectBusinessCategoryPredecessor`／`reconstructBusinessCategoryBeforeAfter` ——
 *    **正常複製、不需固定向量綁定**：其參數型別直接綁定 `BusinessCategoryChangeLogStore`／
 *    `BusinessCategorySnapshotStore`（特定 DI token），本質是「針對特定 store token 的薄橋接」，
 *    正確性由上一列已綁定之純函式與本模組之 fake-store 單元測試保證。
 *
 * 🔴 **落點刻意在 `lifecycle/`**（§14.2）：與被綁定之 `lifecycle-change-diff.ts` 同目錄。
 */

/** 業務/功能類別變更日誌查無 → 404（error-handling.md#business-category 之既定碼）。 */
export class BusinessCategoryChangeLogNotFoundError extends NotFoundException {
  constructor() {
    super('BUSINESS_CATEGORY_CHANGE_LOG_NOT_FOUND');
  }
}

export interface BusinessCategoryDiff {
  addNodes: string[];
  rmNodes: string[];
  /** 存在於前後兩側、但 `name` 或 `docs` 集合已變（改名／掛載變更）；位置差異不計入。 */
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

/**
 * 後-前＝新增；前-後＝刪除；前後皆有但 `name`／`docs` 集合改變＝amber；位置差異不計入
 * （比照「位置＝佈局非結構變更」之既有哲學）。
 */
export function computeBusinessCategoryDiff(
  before: SnapshotGraph,
  after: SnapshotGraph,
): BusinessCategoryDiff {
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

/**
 * 取同 `businessCategoryId`、`occurredAt` **嚴格早於** `before` 之最近一筆；無則 `null`。
 * 純函式（供 store 與單測共用）。跨類別隔離：不同 `businessCategoryId` 之更早列不得被誤取。
 */
export function selectBusinessCategoryPredecessor(
  rows: BusinessCategoryChangeLogRow[],
  businessCategoryId: string,
  before: Date,
): BusinessCategoryChangeLogRow | null {
  const candidates = rows
    .filter(
      (r) =>
        r.businessCategoryId === businessCategoryId &&
        r.occurredAt.getTime() < before.getTime(),
    )
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return candidates[0] ?? null;
}

async function snapshotOf(
  snapStore: BusinessCategorySnapshotStore,
  row: BusinessCategoryChangeLogRow | null,
): Promise<SnapshotGraph> {
  // 無 predecessor 或 snapshotId 為 null（遺留列）→ 空圖（優雅降級，不拋錯）。
  if (!row || !row.snapshotId) return EMPTY_BUSINESS_CATEGORY_SNAPSHOT_GRAPH;
  const rec = await snapStore.findByChangeLogId(row.id);
  return rec?.graph ?? EMPTY_BUSINESS_CATEGORY_SNAPSHOT_GRAPH;
}

/**
 * `AC-41` 單事件重建。target 不存在或 `businessCategoryId` 不符 URL →
 * `BUSINESS_CATEGORY_CHANGE_LOG_NOT_FOUND`（**不洩漏跨類別存在性**）。
 * `after`＝target 自身快照；`before`＝predecessor 快照或空圖（該類別第一筆事件）。
 */
export async function reconstructBusinessCategoryBeforeAfter(
  logStore: BusinessCategoryChangeLogStore,
  snapStore: BusinessCategorySnapshotStore,
  businessCategoryId: string,
  changeLogId: string,
): Promise<{ before: SnapshotGraph; after: SnapshotGraph }> {
  const target = await logStore.findById(changeLogId);
  if (!target || target.businessCategoryId !== businessCategoryId) {
    throw new BusinessCategoryChangeLogNotFoundError();
  }
  const after = await snapshotOf(snapStore, target);
  const predecessor = await logStore.findPredecessor(businessCategoryId, target.occurredAt);
  const before = await snapshotOf(snapStore, predecessor);
  return { before, after };
}
