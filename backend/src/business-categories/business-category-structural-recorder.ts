import { randomUUID } from 'crypto';
import { EntityManager, In } from 'typeorm';
import { BusinessCategoryNode } from '../database/entities/business-category-node.entity';
import { BusinessCategoryEdge } from '../database/entities/business-category-edge.entity';
import { BusinessCategoryDoc } from '../database/entities/business-category-doc.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { BusinessCategoryChangeLog } from '../database/entities/business-category-change-log.entity';
import { BusinessCategorySnapshot } from '../database/entities/business-category-snapshot.entity';
import { SnapshotDocRef } from '../lifecycle/lifecycle-snapshot-builder';
import { buildBusinessCategorySnapshotGraph } from '../lifecycle/business-category-snapshot-builder';
import { BusinessCategoryChangedEvent } from './business-category-change-event';

/**
 * F043 `AC-38` 交易一致性核心：於**呼叫端已開啟之交易**（傳入其 `EntityManager`）內，以當下結構
 * 狀態組出自足快照，並將 `BUSINESS_CATEGORY_CHANGE_LOG` 列與 `BUSINESS_CATEGORY_SNAPSHOT` 列
 * 以**預先產生之 UUID 交叉回指**、同時 insert。
 *
 * 兩表 PK 皆應用層預生（非 DB 產生）→ 雙向 1:1 回指無插入順序死結；且無 DB FK（比照
 * `businessCategoryId` 之慣例），完整性由本函式「同一交易兩列皆到位」＋交易原子性把關。
 * 任一 insert 失敗 → 交易回滾（連同結構列）。
 *
 * 🔴 **INV-B4 之結構性保證**：本函式讀取之對象為 `BusinessCategoryNode`／`BusinessCategoryEdge`／
 * `BusinessCategoryDoc`——**不碰** `LifecycleNode`／`LifecycleEdge`，故循環側之結構不可能被
 * 誤讀進本功能之歷史快照。
 *
 * 🔴 **M:N 不去重**：同一份文件若掛在多個節點，於各節點之 `docs` 清單中**各出現一次**
 * （`AC-21`）——去重會讓歷史快照謊稱該文件只掛過一處。
 */
export async function recordBusinessCategoryStructuralChange(
  manager: EntityManager,
  event: BusinessCategoryChangedEvent,
): Promise<{ changeLogId: string; snapshotId: string }> {
  const businessCategoryId = event.businessCategoryId;

  const nodes = await manager
    .getRepository(BusinessCategoryNode)
    .find({ where: { businessCategoryId } });
  const edges = await manager
    .getRepository(BusinessCategoryEdge)
    .find({ where: { businessCategoryId } });

  const docsByNode = await loadDocsByNode(
    manager,
    nodes.map((n) => n.id),
  );
  const graph = buildBusinessCategorySnapshotGraph(nodes, edges, docsByNode);

  const changeLogId = randomUUID();
  const snapshotId = randomUUID();

  await manager.getRepository(BusinessCategoryChangeLog).insert({
    id: changeLogId,
    businessCategoryId,
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
  await manager.getRepository(BusinessCategorySnapshot).insert({
    id: snapshotId,
    businessCategoryId,
    changeLogId,
    nodesJson: JSON.stringify(graph.nodes),
    edgesJson: JSON.stringify(graph.edges),
    capturedAt: event.occurredAt,
  });

  return { changeLogId, snapshotId };
}

/**
 * 各節點之掛載文件（`id` ＋ `documentNumber`）。兩趟批次查詢（掛載列 → 文件編號），
 * **與節點數無關**（非逐節點 N+1）。
 * `BUSINESS_CATEGORY_DOC`／`ICSOP_DOCUMENT` 未建（極簡整合環境）→ 容錯回空，快照節點 `docs` 為 `[]`。
 */
async function loadDocsByNode(
  manager: EntityManager,
  nodeIds: string[],
): Promise<Map<string, SnapshotDocRef[]>> {
  const docsByNode = new Map<string, SnapshotDocRef[]>();
  if (nodeIds.length === 0) return docsByNode;
  try {
    const mounts = await manager
      .getRepository(BusinessCategoryDoc)
      .find({ where: { nodeId: In(nodeIds) }, select: { nodeId: true, documentId: true } });
    if (mounts.length === 0) return docsByNode;

    const documentIds = [...new Set(mounts.map((m) => m.documentId))];
    const docs = await manager.getRepository(IcsopDocument).find({
      where: { id: In(documentIds) },
      select: { id: true, documentNumber: true },
      order: { documentNumber: 'ASC' },
    });
    const numberById = new Map(docs.map((d) => [d.id, d.documentNumber]));

    // 依 documentNumber 排序後入桶，使同一結構產生逐位元組相同之快照（可重現）。
    const sorted = [...mounts].sort((a, b) =>
      (numberById.get(a.documentId) ?? '').localeCompare(numberById.get(b.documentId) ?? ''),
    );
    for (const m of sorted) {
      const number = numberById.get(m.documentId);
      if (number === undefined) continue; // 文件已不存在 → 不入快照（不留空編號之幽靈列）。
      const bucket = docsByNode.get(m.nodeId) ?? docsByNode.set(m.nodeId, []).get(m.nodeId)!;
      bucket.push({ id: m.documentId, documentNumber: number });
    }
  } catch {
    // 來源表未建 → 快照節點 docs 為 []（比照既有 recordStructuralChange 之容錯）。
  }
  return docsByNode;
}
