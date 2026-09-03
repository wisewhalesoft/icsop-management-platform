import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BusinessCategoryService, BusinessCategoryAuditActor } from './business-category.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import type { SessionUser } from '../auth/session-token.service';

/** `SessionUser`（request context）→ 刪除稽核操作者身分快照。 */
export function toBusinessCategoryAuditActor(u: SessionUser): BusinessCategoryAuditActor {
  return {
    actorId: u.accountId ?? '',
    actorName: u.name ?? null,
    employeeNo: u.employeeNo ?? null,
    roleCode: u.roleCode ?? null,
    // 🔴 此處刻意仍傳**代碼**——解析公司全稱／部門全名需查 ORG_UNIT，是有 IO 的動作，
    // 由服務層之 `AuditIdentityService`（唯一組裝點）負責，不屬於這個純函式的職責。
    companyCode: u.companyCode ?? null,
    orgCode: u.orgCode ?? null,
  };
}

/**
 * F043 §甲 業務/功能類別池 CRUD。守門鏈 SessionGuard→RolePermissionGuard。
 *
 * `AC-45`／`AC-46`：`業務/功能類別管理` read（SysAdmin／ICSOPAdmin／Supervisor）／
 * write（**僅** ICSOPAdmin）；DeptContact／User 對**任一**端點（含讀取類）一律 403。
 * 🔴 側選單之隱藏**不得**是唯一防線——前端隱藏 ＋ 後端 403 兩者皆須成立。
 */
@Controller('admin/business-categories')
@UseGuards(SessionGuard, RolePermissionGuard)
export class BusinessCategoryController {
  constructor(private readonly svc: BusinessCategoryService) {}

  /** `AC-14`：帶 `keyword` 時比對 `businessCategoryDisplayName` 之輸出（含子分類）。 */
  @Get()
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')
  list(@Query('keyword') keyword?: string) {
    const kw = keyword?.trim();
    return kw ? this.svc.searchBusinessCategories(kw) : this.svc.listBusinessCategories();
  }

  @Get(':id')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')
  async findOne(@Param('id') id: string) {
    const items = await this.svc.listBusinessCategories();
    const found = items.find((c) => c.id === id);
    if (!found) throw new NotFoundException('BUSINESS_CATEGORY_NOT_FOUND');
    return found;
  }

  @Post()
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  create(
    @Body() body: { name?: string; subcategory?: string | null; description?: string | null },
  ) {
    return this.svc.createBusinessCategory({
      name: body?.name ?? '',
      // 未帶鍵／空白 → 服務層 `normalizeSubcategory` 收斂為 null。
      subcategory: body?.subcategory,
      description: body?.description ?? null,
    });
  }

  /**
   * `AC-11`／`AC-12`：編輯名稱／子分類／說明**／狀態**（架構 §14.5 端點表：四者由同一支 PATCH 承接，
   * 本功能**沒有**獨立的 `/status` 子路由）。
   *
   * 🔴 `status` 必須在此被承接：只處理三個欄位而讓 `status` 靜默落地失敗，會產生
   * 「HTTP 200、但停用沒生效」之**值人間蒸發**——前端與後端之單元測試在整個過程中都是綠的
   * （本 repo 已三度付出代價之形狀）。
   * 🔴 狀態切換**不受刪除保護限制**（`AC-12` 之刻意不對稱），故先套用其餘欄位、再切狀態，
   * 兩者互不阻擋。
   */
  @Patch(':id')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      subcategory?: string | null;
      description?: string | null;
      status?: string;
    },
  ) {
    const { status, ...patch } = body ?? {};
    // 三態：body 未帶 `subcategory` 鍵＝不修改；帶 null／空白＝清空。
    const touchesFields =
      patch.name !== undefined || patch.subcategory !== undefined || patch.description !== undefined;
    const afterPatch = touchesFields
      ? await this.svc.updateBusinessCategory(id, patch)
      : undefined;
    if (status !== undefined) return this.svc.setStatus(id, status);
    return afterPatch ?? this.svc.updateBusinessCategory(id, patch);
  }

  /** `AC-12`：停用／啟用。🔴 不受掛載數限制（與刪除保護之刻意不對稱）。 */
  @Patch(':id/status')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  setStatus(@Param('id') id: string, @Body() body: { status?: string }) {
    if (!body?.status) throw new BadRequestException('VALIDATION_ERROR');
    return this.svc.setStatus(id, body.status);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  async remove(@Req() req: RequestWithSession, @Param('id') id: string): Promise<void> {
    await this.svc.deleteBusinessCategory(
      id,
      toBusinessCategoryAuditActor(req.sessionUser as SessionUser),
    );
  }
}
