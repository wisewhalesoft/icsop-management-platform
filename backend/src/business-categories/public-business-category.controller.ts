import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common';
import { PublicBusinessCategoryService } from './public-business-category.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { toViewerScope } from '../rbac/viewer-scope';
import { toWatermarkSession } from '../public/watermark.controller';
import { LifecycleWatermarkBuilder } from '../lifecycle/lifecycle-watermark';
import { BUSINESS_CATEGORY_WATERMARK_BUILDER } from './business-category-preview.service';
import type { SessionUser } from '../auth/session-token.service';

/**
 * F043 §己 前台業務/功能類別瀏覽（3 端點）。守門鏈 SessionGuard→RolePermissionGuard。
 *
 * 🔴 **`AC-47` 前台不受後台功能列限制**：本 controller 之閘門為 **`前台瀏覽`**
 * （`PUBLIC_BROWSING`，5 種角色皆為「可」），**不是** `業務/功能類別管理`。
 * 部門窗口與一般使用者呼叫**前台**端點得 200、呼叫**後台** `/admin/business-categories/*` 得 403
 * ——**兩者是不同維度，不得混為一談**。
 *
 * 🔴 閘門逐一宣告於**方法上**（非 class 上）：本 repo 之 RBAC 測試以
 * `Reflector.get(REQUIRE_PERMISSION_KEY, handler)` 讀 method-level metadata，
 * 只掛在 class 上會讓那些斷言讀到 `undefined`。
 *
 * 可見性（已公告 ＋ F041 使用部門）一律於**服務層之查詢路徑**施加（`AC-B22`），
 * 本 controller 只負責把 `req.sessionUser` 轉為 `ViewerScope`——
 * 🔴 **不得**新增任何讓客戶端自帶 viewer 身分之 query/body 參數。
 */
@Controller('public/business-categories')
@UseGuards(SessionGuard, RolePermissionGuard)
export class PublicBusinessCategoryController {
  constructor(
    private readonly svc: PublicBusinessCategoryService,
    @Inject(BUSINESS_CATEGORY_WATERMARK_BUILDER)
    private readonly watermark: LifecycleWatermarkBuilder,
  ) {}

  /** `AC-B18`：切換器選項（僅 `active` 且對該 viewer 至少一份可見文件之類別）。 */
  @Get()
  @RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
  listCategories(@Req() req: RequestWithSession) {
    return this.svc.listCategories(toViewerScope(req.sessionUser));
  }

  /**
   * `AC-B21`：樹狀圖資料（各節點掛載數**已套可見性過濾**）＋類別身分＋浮水印快照。
   *
   * 🔴 `AC-B25`：前台樹狀圖之疊加層浮水印是**必要**載體（該頁渲染 HTML、無內容層可燒錄），
   * 且其字串一律由**伺服器端**組出（與後台同一支 `buildSnapshot`）——前端不得自組，
   * 否則兩處格式會各自漂移（NFR-007 一致性）。
   * ⚠ `AC-53` ②：前台**沒有**下載／列印端點——「不提供 PDF」不等於「不需要浮水印」，
   * 兩者是不同的事。
   */
  @Get(':businessCategoryId/graph')
  @RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
  async getGraph(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
  ) {
    const session = toWatermarkSession(req.sessionUser as SessionUser);
    const [businessCategory, graph, { snapshot }] = await Promise.all([
      this.svc.getCategory(businessCategoryId),
      this.svc.getGraph(businessCategoryId, toViewerScope(req.sessionUser)),
      this.watermark.buildSnapshot(session),
    ]);
    return {
      businessCategory: {
        id: businessCategory.id,
        name: businessCategory.name,
        subcategory: businessCategory.subcategory,
      },
      graph,
      watermark: snapshot,
    };
  }

  /** `AC-B20`：節點雙擊抽屜之文件（已套已公告＋F041 過濾；不可見者連欄位都不外洩）。 */
  @Get(':businessCategoryId/nodes/:nodeId/documents')
  @RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
  listNodeDocuments(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.svc.listNodeDocuments(
      businessCategoryId,
      nodeId,
      toViewerScope(req.sessionUser),
    );
  }
}
