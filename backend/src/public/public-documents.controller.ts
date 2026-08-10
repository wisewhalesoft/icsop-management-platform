import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { PublicDocumentsService } from './public-documents.service';
import { PublicDocumentDetailService } from './public-document-detail.service';
import { DEFAULT_PAGE_SIZE, PublicListFilters } from './public-list';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { toViewerScope } from '../rbac/viewer-scope';

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
  constructor(
    private readonly svc: PublicDocumentsService,
    private readonly detailSvc: PublicDocumentDetailService,
  ) {}

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
    // F041：viewer 之唯一合法來源＝req.sessionUser（SessionGuard 每請求以 DB 現行值填入）。
    const viewer = toViewerScope(req.sessionUser);
    const filters: PublicListFilters = {
      keyword: keyword?.trim() || undefined,
      deptCode: deptCode?.trim() || undefined,
      lifecycleId: lifecycleId?.trim() || undefined,
      status: status?.trim() || undefined,
    };
    return this.svc.list(
      viewer,
      filters,
      parsePositiveInt(page, 1),
      parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE),
    );
  }

  /**
   * G-PUB-020 前台文件詳情（登入員工可讀；19 欄 + 附件/使用表單/連結）。
   * 非「已公告」文件 → 404 DOCUMENT_NOT_FOUND（視同不存在）；未登入 → 401（守門鏈）。
   * 註：`:id` 為單段路徑，與 WatermarkController 之 `:id/view` 等（雙段）不衝突。
   *
   * F041：本端點原先完全未接收 `@Req()`，本次從零新增——業務子分類之直連 URL 限縮需要 viewer
   * （架構 §3.7 決策一，四入口簽章變更之唯一「新增請求物件存取」者）。
   */
  @Get(':id')
  detail(@Param('id') id: string, @Req() req: RequestWithSession) {
    return this.detailSvc.detail(id, toViewerScope(req.sessionUser));
  }
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
