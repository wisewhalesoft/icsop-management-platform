import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AuditWriter } from '../audit/audit.types';
import {
  LIFECYCLE_STORE,
  LifecycleStore,
  LifecycleView,
  LifecycleStatus,
} from './lifecycle.store';

/** 刪除稽核之操作者身分快照（來自 request context SessionUser；F007 Main Flow 4）。 */
export interface LifecycleAuditActor {
  actorId: string;
  actorName?: string | null;
  employeeNo?: string | null;
  roleCode?: string | null;
}

/**
 * 循環池 CRUD（F007）。功能面 RBAC 由 controller guard（循環管理 write＝ICSOPAdmin）落實。
 * 刪除保護（OQ-E03-03）：仍有文件掛載 → LIFECYCLE_HAS_DOCUMENTS；停用不受此限。
 * 刪除稽核（Main Flow 4）：成功刪除後記一筆 LIFECYCLE_DELETE（非阻斷；AuditWriter 為 @Optional，
 * 未注入時靜默略過，保留既有 `new LifecycleService(store)` 單元建構）。
 */
@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(
    @Inject(LIFECYCLE_STORE) private readonly store: LifecycleStore,
    @Optional() private readonly auditWriter?: AuditWriter,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {}

  /** 循環清單（F007）＋G-LC-002 掛載文件數（單次 GROUP BY 富化，無 N+1）。 */
  async listLifecycles(): Promise<LifecycleView[]> {
    const items = await this.store.list();
    const counts = await this.store.countMountedByLifecycle();
    for (const it of items) it.mountedDocCount = counts.get(it.id) ?? 0;
    return items;
  }

  async createLifecycle(input: {
    name: string;
    description?: string | null;
  }): Promise<LifecycleView> {
    const name = (input.name ?? '').trim();
    if (name === '') throw new BadRequestException('LIFECYCLE_NAME_REQUIRED');
    return this.store.create({ name, description: input.description ?? null });
  }

  async updateLifecycle(
    id: string,
    patch: { name?: string; description?: string | null },
  ): Promise<LifecycleView> {
    const existing = await this.store.findById(id);
    if (!existing) throw new NotFoundException('LIFECYCLE_NOT_FOUND');
    if (patch.name !== undefined && patch.name.trim() === '') {
      throw new BadRequestException('LIFECYCLE_NAME_REQUIRED');
    }
    return this.store.update(id, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    });
  }

  async setStatus(id: string, status: string): Promise<LifecycleView> {
    if (status !== 'active' && status !== 'inactive') {
      throw new BadRequestException('LIFECYCLE_STATUS_INVALID');
    }
    const existing = await this.store.findById(id);
    if (!existing) throw new NotFoundException('LIFECYCLE_NOT_FOUND');
    return this.store.update(id, { status: status as LifecycleStatus });
  }

  async deleteLifecycle(id: string, actor?: LifecycleAuditActor): Promise<void> {
    const existing = await this.store.findById(id);
    if (!existing) throw new NotFoundException('LIFECYCLE_NOT_FOUND');
    const mounted = await this.store.countMountedDocuments(id);
    if (mounted > 0) throw new ConflictException('LIFECYCLE_HAS_DOCUMENTS');
    await this.store.delete(id);
    await this.auditDelete(existing, actor);
  }

  /**
   * 記錄一筆循環刪除稽核（LIFECYCLE_DELETE）。非阻斷：稽核寫入失敗不使刪除回退（刪除已完成）。
   * 無 AuditWriter（未注入）或無 actor（無法歸屬）時靜默略過。
   */
  private async auditDelete(
    deleted: LifecycleView,
    actor?: LifecycleAuditActor,
  ): Promise<void> {
    if (!this.auditWriter || !actor) return;
    try {
      await this.auditWriter.recordAccess({
        targetType: 'LIFECYCLE',
        actionType: 'LIFECYCLE_DELETE',
        targetId: deleted.id,
        actorId: actor.actorId,
        actorName: actor.actorName ?? null,
        employeeNo: actor.employeeNo ?? null,
        roleCode: actor.roleCode ?? null,
        targetNumber: deleted.name,
        targetName: deleted.name,
        occurredAt: this.clock(),
      });
    } catch (err) {
      this.logger.error(
        `循環刪除稽核記錄失敗（已吞，不阻斷刪除）lifecycle=${deleted.id}: ${
          (err as Error)?.message
        }`,
      );
    }
  }
}
