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
import { AuditIdentityService } from '../audit/audit-identity.service';
import {
  LIFECYCLE_STORE,
  LifecycleStore,
  LifecycleView,
  LifecycleStatus,
} from './lifecycle.store';
import {
  LifecycleIdentity,
  LifecycleUniquenessViolation,
  checkLifecycleUniqueness,
  lifecycleDisplayName,
  normalizeSubcategory,
} from './lifecycle-subcategory';

/** 刪除稽核之操作者身分快照（來自 request context SessionUser；F007 Main Flow 4）。 */
export interface LifecycleAuditActor {
  actorId: string;
  actorName?: string | null;
  employeeNo?: string | null;
  roleCode?: string | null;
  /**
   * 🔴 2026-09-01 delta（additive 選填）：公司／部門／處室三欄之解析原料。
   * 此前 `LIFECYCLE_DELETE` 之稽核列該三欄從未落值——同一個人刪一條循環，在 F024
   * 調閱歷程上會比他檢視同一條循環少三欄。
   */
  companyCode?: string | null;
  orgCode?: string | null;
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
    // 🔴 2026-09-01 delta：身分快照六欄之唯一組裝點。@Optional() 沿用 auditWriter 之既有
    // 慣例（保留 `new LifecycleService(store)` 之純建構單元測試）；缺 ⇒ 三欄仍為 null，
    // 即修復前之行為，不會更糟，但正式 DI 一律接上。
    @Optional() private readonly auditIdentity?: AuditIdentityService,
  ) {}

  /** 循環清單（F007）＋G-LC-002 掛載文件數（單次 GROUP BY 富化，無 N+1）。 */
  async listLifecycles(): Promise<LifecycleView[]> {
    const items = await this.store.list();
    const counts = await this.store.countMountedByLifecycle();
    for (const it of items) it.mountedDocCount = counts.get(it.id) ?? 0;
    return items;
  }

  /**
   * F040 唯一性守門：以全池（含 `inactive`，AC-20）判定 INV-1／INV-2，違反即拋出對應 HttpException，
   * **不呼叫 store.create／store.update**（池筆數不變）。驗證順序固定 ①②③（見 lifecycle-subcategory.ts）。
   */
  private async assertUniqueness(candidate: {
    id?: string | null;
    name: string;
    subcategory?: string | null;
  }): Promise<void> {
    const pool: LifecycleIdentity[] = (await this.store.list()).map((l) => ({
      id: l.id,
      name: l.name,
      subcategory: l.subcategory ?? null,
    }));
    const violation = checkLifecycleUniqueness(candidate, pool);
    if (violation) throw LifecycleService.toHttpError(violation);
  }

  /** 違反碼 → Nest 例外（400 BadRequest／409 Conflict）。 */
  private static toHttpError(v: LifecycleUniquenessViolation): Error {
    return v.status === 400
      ? new BadRequestException(v.code)
      : new ConflictException(v.code);
  }

  async createLifecycle(input: {
    name: string;
    subcategory?: string | null;
    description?: string | null;
  }): Promise<LifecycleView> {
    const name = (input.name ?? '').trim();
    // ① 名稱必填（既有行為；提前擋下可免去對池之查詢）。
    if (name === '') throw new BadRequestException('LIFECYCLE_NAME_REQUIRED');
    const subcategory = normalizeSubcategory(input.subcategory);
    // ②③ F040 唯一性（INV-1／INV-2）。
    await this.assertUniqueness({ name, subcategory });
    return this.store.create({ name, subcategory, description: input.description ?? null });
  }

  async updateLifecycle(
    id: string,
    patch: { name?: string; subcategory?: string | null; description?: string | null },
  ): Promise<LifecycleView> {
    const existing = await this.store.findById(id);
    if (!existing) throw new NotFoundException('LIFECYCLE_NOT_FOUND');
    if (patch.name !== undefined && patch.name.trim() === '') {
      throw new BadRequestException('LIFECYCLE_NAME_REQUIRED');
    }
    // F040：僅當 patch 觸及身分欄位（名稱／子分類）時重驗唯一性；比對「套用 patch 後之結果」並排除自身列。
    const subcategoryTouched = patch.subcategory !== undefined;
    const nextSubcategory = subcategoryTouched
      ? normalizeSubcategory(patch.subcategory)
      : normalizeSubcategory(existing.subcategory);
    if (patch.name !== undefined || subcategoryTouched) {
      await this.assertUniqueness({
        id,
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        subcategory: nextSubcategory,
      });
    }
    return this.store.update(id, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      // 三態：未帶鍵＝不修改；帶鍵（含 null／空白字串）＝設定為正規化後之值。
      ...(subcategoryTouched ? { subcategory: nextSubcategory } : {}),
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
    // F040 AC-30／AC-35：名稱快照一律經 lifecycleDisplayName（含子分類），使歷史事件可唯一辨識所屬循環。
    const displayName = lifecycleDisplayName(deleted);
    const identity = (await this.auditIdentity?.resolve({
      name: actor.actorName,
      employeeNo: actor.employeeNo,
      companyCode: actor.companyCode,
      orgCode: actor.orgCode,
      roleCode: actor.roleCode,
    })) ?? {
      actorName: actor.actorName ?? null,
      employeeNo: actor.employeeNo ?? null,
      company: null,
      department: null,
      section: null,
      roleCode: actor.roleCode ?? null,
    };
    try {
      await this.auditWriter.recordAccess({
        targetType: 'LIFECYCLE',
        actionType: 'LIFECYCLE_DELETE',
        targetId: deleted.id,
        actorId: actor.actorId,
        actorName: identity.actorName,
        employeeNo: identity.employeeNo,
        company: identity.company,
        department: identity.department,
        section: identity.section,
        roleCode: identity.roleCode,
        targetNumber: displayName,
        targetName: displayName,
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
