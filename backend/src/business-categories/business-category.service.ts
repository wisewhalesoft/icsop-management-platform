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
  BUSINESS_CATEGORY_STORE,
  BusinessCategoryStore,
  BusinessCategoryStatus,
  BusinessCategoryView,
} from './business-category.store';
import {
  BusinessCategoryIdentity,
  BusinessCategoryUniquenessViolation,
  businessCategoryDisplayName,
  checkBusinessCategoryUniqueness,
  normalizeSubcategory,
} from './business-category-subcategory';

/** 刪除稽核之操作者身分快照（來自 request context `SessionUser`）。 */
export interface BusinessCategoryAuditActor {
  actorId: string;
  actorName?: string | null;
  employeeNo?: string | null;
  roleCode?: string | null;
  /** 公司／部門／處室三欄之解析原料（經 `AuditIdentityService` 解析為全稱與部門全名）。 */
  companyCode?: string | null;
  orgCode?: string | null;
}

/**
 * F043 §甲 業務/功能類別池 CRUD。功能面 RBAC 由 controller guard
 * （`業務/功能類別管理` write ＝ ICSOPAdmin）落實。
 *
 * 🔴 `AC-04` **跨表獨立**：本服務之依賴**只有** `BusinessCategoryStore`——建構子上連一個
 * LIFECYCLE 相關的注入都沒有，遑論讀取。這不是紀律，是結構性保證。
 *
 * 刪除保護（`AC-12`）：仍有掛載 → `BUSINESS_CATEGORY_HAS_DOCUMENTS`（語意＝**需先解除全部
 * 掛載才能刪除**，非「永不可刪」）；**停用不受此限**。
 * 刪除稽核：成功刪除後記一筆 `BUSINESS_CATEGORY_DELETE`（非阻斷；`AuditWriter` 為 `@Optional`，
 * 未注入時靜默略過，保留 `new BusinessCategoryService(store)` 之純建構單元測試）。
 */
@Injectable()
export class BusinessCategoryService {
  private readonly logger = new Logger(BusinessCategoryService.name);

  constructor(
    @Inject(BUSINESS_CATEGORY_STORE) private readonly store: BusinessCategoryStore,
    @Optional() private readonly auditWriter?: AuditWriter,
    @Optional() private readonly clock: () => Date = () => new Date(),
    @Optional() private readonly auditIdentity?: AuditIdentityService,
  ) {}

  /** 類別清單 ＋ 掛載文件數富化（**單次** GROUP BY，無 N+1）。 */
  async listBusinessCategories(): Promise<BusinessCategoryView[]> {
    const items = await this.store.list();
    const counts = await this.store.countMountedByCategory();
    for (const it of items) it.mountedDocCount = counts.get(it.id) ?? 0;
    return items;
  }

  /**
   * `AC-14`：清單搜尋之比對對象＝`businessCategoryDisplayName` 之**輸出**（含子分類），
   * 非 `name` 單欄——否則「消金」這個關鍵字永遠命不中 `授信（消金）`。
   */
  async searchBusinessCategories(keyword: string): Promise<BusinessCategoryView[]> {
    const items = await this.listBusinessCategories();
    const kw = (keyword ?? '').trim();
    if (kw === '') return items;
    const needle = kw.toLowerCase();
    return items.filter((c) => businessCategoryDisplayName(c).toLowerCase().includes(needle));
  }

  /**
   * `AC-03`／`AC-07`～`AC-09`／`AC-13` 唯一性守門：以**全池**（含 `inactive`）判定 INV-B1／INV-B2，
   * 違反即拋出對應例外，**不呼叫 store.create／store.update**（池筆數不變）。
   */
  private async assertUniqueness(candidate: {
    id?: string | null;
    name: string;
    subcategory?: string | null;
  }): Promise<void> {
    const pool: BusinessCategoryIdentity[] = (await this.store.list()).map((c) => ({
      id: c.id,
      name: c.name,
      subcategory: c.subcategory ?? null,
    }));
    const violation = checkBusinessCategoryUniqueness(candidate, pool);
    if (violation) throw BusinessCategoryService.toHttpError(violation);
  }

  /** 違反碼 → Nest 例外（400 BadRequest／409 Conflict）。 */
  private static toHttpError(v: BusinessCategoryUniquenessViolation): Error {
    return v.status === 400 ? new BadRequestException(v.code) : new ConflictException(v.code);
  }

  /** `AC-01`／`AC-02`／`AC-05`：建立類別（子分類經既有 `normalizeSubcategory` 正規化）。 */
  async createBusinessCategory(input: {
    name: string;
    subcategory?: string | null;
    description?: string | null;
  }): Promise<BusinessCategoryView> {
    const name = (input.name ?? '').trim();
    // ① 名稱必填優先於任何唯一性檢查（`AC-09`；提前擋下可免去對池之查詢）。
    if (name === '') throw new BadRequestException('BUSINESS_CATEGORY_NAME_REQUIRED');
    const subcategory = normalizeSubcategory(input.subcategory);
    // ②③ INV-B1／INV-B2。
    await this.assertUniqueness({ name, subcategory });
    return this.store.create({ name, subcategory, description: input.description ?? null });
  }

  /** `AC-11`：編輯名稱／子分類／說明（唯一性比對**排除自身列**）。 */
  async updateBusinessCategory(
    id: string,
    patch: { name?: string; subcategory?: string | null; description?: string | null },
  ): Promise<BusinessCategoryView> {
    const existing = await this.store.findById(id);
    if (!existing) throw new NotFoundException('BUSINESS_CATEGORY_NOT_FOUND');
    if (patch.name !== undefined && patch.name.trim() === '') {
      throw new BadRequestException('BUSINESS_CATEGORY_NAME_REQUIRED');
    }
    // 僅當 patch 觸及身分欄位（名稱／子分類）時重驗唯一性；比對「套用 patch 後之結果」。
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

  /** `AC-12`：停用／啟用。🔴 **不受掛載數限制**（與刪除保護之刻意不對稱）。 */
  async setStatus(id: string, status: string): Promise<BusinessCategoryView> {
    if (status !== 'active' && status !== 'inactive') {
      throw new BadRequestException('BUSINESS_CATEGORY_STATUS_INVALID');
    }
    const existing = await this.store.findById(id);
    if (!existing) throw new NotFoundException('BUSINESS_CATEGORY_NOT_FOUND');
    return this.store.update(id, { status: status as BusinessCategoryStatus });
  }

  /** `AC-12`：刪除類別（含其節點／邊）。仍有掛載 → 409，且類別／節點／邊／掛載一筆未動。 */
  async deleteBusinessCategory(id: string, actor?: BusinessCategoryAuditActor): Promise<void> {
    const existing = await this.store.findById(id);
    if (!existing) throw new NotFoundException('BUSINESS_CATEGORY_NOT_FOUND');
    const mounted = await this.store.countMountedDocuments(id);
    if (mounted > 0) throw new ConflictException('BUSINESS_CATEGORY_HAS_DOCUMENTS');
    await this.store.delete(id);
    await this.auditDelete(existing, actor);
  }

  /**
   * 記錄一筆類別刪除稽核（`BUSINESS_CATEGORY_DELETE`）。非阻斷：稽核寫入失敗不使刪除回退。
   * 無 `AuditWriter`（未注入）或無 actor（無法歸屬）時靜默略過。
   */
  private async auditDelete(
    deleted: BusinessCategoryView,
    actor?: BusinessCategoryAuditActor,
  ): Promise<void> {
    if (!this.auditWriter || !actor) return;
    // 名稱快照一律經 `businessCategoryDisplayName`（含子分類），使歷史事件可唯一辨識所屬類別。
    const displayName = businessCategoryDisplayName(deleted);
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
        targetType: 'BUSINESS_CATEGORY',
        actionType: 'BUSINESS_CATEGORY_DELETE',
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
        `業務/功能類別刪除稽核記錄失敗（已吞，不阻斷刪除）businessCategory=${deleted.id}: ${
          (err as Error)?.message
        }`,
      );
    }
  }
}
