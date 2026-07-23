import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PublicDocumentsService } from './public-documents.service';
import { DEFAULT_PAGE_SIZE, PublicListFilters } from './public-list';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * F019 前台文件清單端點（新獨立 controller，不改 documents.service，避免撞 doc-edit worktree）。
 *
 * RBAC：reuse FunctionKey.PUBLIC_BROWSING（前台瀏覽＝五角色 READ，滿足 AC「全角色可瀏覽」），
 * 不新增 F025 key。守門鏈 SessionGuard→RolePermissionGuard：未登入 → 401 AUTH_SESSION_EXPIRED。
 * 置頂所依之使用者部門取自 session（SessionGuard 每請求以 DB 現行值填入 orgCode，PII 不進 JWT）。
 */
@Controller('public/documents')
@UseGuards(SessionGuard, RolePermissionGuard)
@RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
export class PublicDocumentsController {
  constructor(private readonly svc: PublicDocumentsService) {}

  @Get()
  list(
    @Req() req: RequestWithSession,
    @Query('keyword') keyword?: string,
    @Query('deptCode') deptCode?: string,
    @Query('lifecycleId') lifecycleId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userOrgCode = req.sessionUser?.orgCode ?? null;
    const filters: PublicListFilters = {
      keyword: keyword?.trim() || undefined,
      deptCode: deptCode?.trim() || undefined,
      lifecycleId: lifecycleId?.trim() || undefined,
      status: status?.trim() || undefined,
    };
    return this.svc.list(
      userOrgCode,
      filters,
      parsePositiveInt(page, 1),
      parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE),
    );
  }
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
