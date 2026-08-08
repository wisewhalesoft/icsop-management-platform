import { DataSource } from 'typeorm';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { LifecycleNode } from '../database/entities/lifecycle-node.entity';
import {
  LifecycleStore,
  LifecycleView,
  LifecycleStatus,
  CreateLifecycleInput,
  UpdateLifecyclePatch,
} from './lifecycle.store';

/** 循環 store 之 TypeORM 實作（AppDataSource 單例、延遲初始化）。 */
export class TypeOrmLifecycleStore implements LifecycleStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toView(l: Lifecycle, nodeCount: number): LifecycleView {
    return {
      id: l.id,
      name: l.name,
      // F040：欄位未加前之既有列讀出為 undefined → 一律收斂為 null（INV-3 之讀取端保險）。
      subcategory: l.subcategory ?? null,
      description: l.description,
      status: l.status as LifecycleStatus,
      nodeCount,
      updatedAt: l.updatedAt,
    };
  }

  private async nodeCounts(ds: DataSource): Promise<Map<string, number>> {
    const raw = await ds
      .getRepository(LifecycleNode)
      .createQueryBuilder('n')
      .select('n.lifecycleId', 'lifecycleId')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('n.lifecycleId')
      .getRawMany<{ lifecycleId: string; cnt: string | number }>();
    return new Map(raw.map((r) => [r.lifecycleId, Number(r.cnt)]));
  }

  async list(): Promise<LifecycleView[]> {
    const ds = await this.init();
    const rows = await ds.getRepository(Lifecycle).find({ order: { updatedAt: 'DESC' } });
    const counts = await this.nodeCounts(ds);
    return rows.map((l) => TypeOrmLifecycleStore.toView(l, counts.get(l.id) ?? 0));
  }

  async findById(id: string): Promise<LifecycleView | null> {
    const ds = await this.init();
    const l = await ds.getRepository(Lifecycle).findOne({ where: { id } });
    if (!l) return null;
    const cnt = await ds
      .getRepository(LifecycleNode)
      .count({ where: { lifecycleId: id } });
    return TypeOrmLifecycleStore.toView(l, cnt);
  }

  async create(input: CreateLifecycleInput): Promise<LifecycleView> {
    const ds = await this.init();
    const repo = ds.getRepository(Lifecycle);
    const now = new Date();
    const saved = await repo.save(
      repo.create({
        name: input.name,
        subcategory: input.subcategory ?? null,
        description: input.description,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }),
    );
    return TypeOrmLifecycleStore.toView(saved, 0);
  }

  async update(id: string, patch: UpdateLifecyclePatch): Promise<LifecycleView> {
    const ds = await this.init();
    await ds
      .getRepository(Lifecycle)
      .update({ id }, { ...patch, updatedAt: new Date() });
    const view = await this.findById(id);
    return view!;
  }

  async countMountedDocuments(id: string): Promise<number> {
    const ds = await this.init();
    try {
      const rows = await ds.query(
        `SELECT COUNT(*) AS cnt FROM [ICSOP_DOCUMENT] WHERE [lifecycleId] = @0`,
        [id],
      );
      return Number(rows?.[0]?.cnt ?? 0);
    } catch {
      // ICSOP_DOCUMENT 尚未建立（E04 未落地）→ 視為無掛載。
      return 0;
    }
  }

  /** G-LC-002：單次 GROUP BY 取全循環之掛載文件數（比照 countMountedDocuments 之 lifecycleId 口徑）。 */
  async countMountedByLifecycle(): Promise<Map<string, number>> {
    const ds = await this.init();
    try {
      const rows = await ds.query(
        `SELECT [lifecycleId] AS lifecycleId, COUNT(*) AS cnt FROM [ICSOP_DOCUMENT] GROUP BY [lifecycleId]`,
      );
      return new Map(
        (rows ?? []).map((r: { lifecycleId: string; cnt: string | number }) => [
          r.lifecycleId,
          Number(r.cnt),
        ]),
      );
    } catch {
      return new Map();
    }
  }

  async delete(id: string): Promise<void> {
    const ds = await this.init();
    // LIFECYCLE_NODE / LIFECYCLE_EDGE 之 lifecycleId FK 為 ON DELETE CASCADE，一併移除。
    await ds.getRepository(Lifecycle).delete({ id });
  }
}
