import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LIFECYCLE_STORE,
  LifecycleStore,
  LifecycleView,
  LifecycleStatus,
} from './lifecycle.store';

/**
 * 循環池 CRUD（F007）。功能面 RBAC 由 controller guard（循環管理 write＝ICSOPAdmin）落實。
 * 刪除保護（OQ-E03-03）：仍有文件掛載 → LIFECYCLE_HAS_DOCUMENTS；停用不受此限。
 */
@Injectable()
export class LifecycleService {
  constructor(@Inject(LIFECYCLE_STORE) private readonly store: LifecycleStore) {}

  listLifecycles(): Promise<LifecycleView[]> {
    return this.store.list();
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

  async deleteLifecycle(id: string): Promise<void> {
    const existing = await this.store.findById(id);
    if (!existing) throw new NotFoundException('LIFECYCLE_NOT_FOUND');
    const mounted = await this.store.countMountedDocuments(id);
    if (mounted > 0) throw new ConflictException('LIFECYCLE_HAS_DOCUMENTS');
    await this.store.delete(id);
  }
}
