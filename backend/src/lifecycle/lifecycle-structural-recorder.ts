import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { LifecycleNode } from '../database/entities/lifecycle-node.entity';
import { LifecycleEdge } from '../database/entities/lifecycle-edge.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { LifecycleChangeLog } from '../database/entities/lifecycle-change-log.entity';
import { LifecycleSnapshot } from '../database/entities/lifecycle-snapshot.entity';
import { LifecycleChangedEvent } from './lifecycle-change-event';
import { buildSnapshotGraph, SnapshotDocRef } from './lifecycle-snapshot-builder';

/**
 * F038 交易一致性核心：於**呼叫端已開啟之交易**（傳入其 EntityManager）內，以當下結構狀態組出自足快照，
 * 並將 LIFECYCLE_CHANGE_LOG 列與 LIFECYCLE_SNAPSHOT 列以預先產生之 UUID 交叉回指、同時 insert。
 *
 * 兩表 PK 皆應用層預生（非 DB 產生）→ 雙向 1:1 回指無插入順序死結；且無 DB FK（比照 lifecycleId 慣例），
 * 完整性由本函式「同一交易兩列皆到位」＋交易原子性把關。任一 insert 失敗 → 交易回滾（連同結構列）。
 */
export async function recordStructuralChange(
  manager: EntityManager,
  event: LifecycleChangedEvent,
): Promise<{ changeLogId: string; snapshotId: string }> {
  const lifecycleId = event.lifecycleId;

  const nodes = await manager.getRepository(LifecycleNode).find({ where: { lifecycleId } });
  const edges = await manager.getRepository(LifecycleEdge).find({ where: { lifecycleId } });

  // 掛載文件（ICSOP_DOCUMENT 未建時容錯回空，比照 docCountsByNode）。
  const docsByNode = new Map<string, SnapshotDocRef[]>();
  try {
    const docs = await manager.getRepository(IcsopDocument).find({
      where: { lifecycleId },
      select: { id: true, documentNumber: true, nodeId: true },
      order: { documentNumber: 'ASC' },
    });
    for (const d of docs) {
      if (!d.nodeId) continue;
      const arr = docsByNode.get(d.nodeId) ?? docsByNode.set(d.nodeId, []).get(d.nodeId)!;
      arr.push({ id: d.id, documentNumber: d.documentNumber });
    }
  } catch {
    // ICSOP_DOCUMENT 未建（如僅 DAG 之極簡整合環境）→ 快照節點 docs 為 []。
  }

  const graph = buildSnapshotGraph(nodes, edges, docsByNode);

  const changeLogId = randomUUID();
  const snapshotId = randomUUID();

  await manager.getRepository(LifecycleChangeLog).insert({
    id: changeLogId,
    lifecycleId,
    changeType: event.changeType,
    summary: event.summary,
    oldValue: event.oldValue ?? null,
    newValue: event.newValue ?? null,
    nodeId: event.nodeId ?? null,
    actorId: event.actorId ?? null,
    actorName: event.actorName ?? null,
    actorEmployeeNo: event.actorEmployeeNo ?? null,
    occurredAt: event.occurredAt,
    snapshotId,
  });
  await manager.getRepository(LifecycleSnapshot).insert({
    id: snapshotId,
    lifecycleId,
    changeLogId,
    nodesJson: JSON.stringify(graph.nodes),
    edgesJson: JSON.stringify(graph.edges),
    capturedAt: event.occurredAt,
  });

  return { changeLogId, snapshotId };
}
