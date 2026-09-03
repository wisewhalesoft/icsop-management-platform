import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BusinessCategoryDagService } from './business-category-dag.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { BusinessCategoryActor } from './business-category-change-event';

/** 自 `SessionUser` 取結構變更操作者快照（§戊 `AC-38`）。 */
function actorOf(req: RequestWithSession): BusinessCategoryActor {
  const s = req.sessionUser;
  return {
    accountId: s?.accountId ?? null,
    name: s?.name ?? null,
    employeeNo: s?.employeeNo ?? null,
  };
}

/**
 * F043 §乙 業務/功能類別 DAG 節點／邊維護。巢狀於類別之下。
 * 守門鏈 SessionGuard→RolePermissionGuard；read（畫布檢視）／write（增刪節點與邊、節點改名）。
 *
 * 每個 write 端點帶入 `businessCategoryId` ＋操作者快照 → service 發出結構變更事件（`AC-38`）。
 */
@Controller('admin/business-categories/:businessCategoryId')
@UseGuards(SessionGuard, RolePermissionGuard)
export class BusinessCategoryDagController {
  constructor(private readonly svc: BusinessCategoryDagService) {}

  @Get('graph')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')
  getGraph(@Param('businessCategoryId') businessCategoryId: string) {
    return this.svc.getGraph(businessCategoryId);
  }

  /**
   * `AC-18` 刪除前之確認提示來源：「刪除後將一併移除 {N} 筆掛載關係」。
   * 🔴 閘門為 `'read'`（純查詢，尚未刪除任何東西）。
   */
  @Get('nodes/:nodeId/mount-count')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')
  async nodeMountCount(@Param('nodeId') nodeId: string) {
    return { count: await this.svc.countNodeMounts(nodeId) };
  }

  @Post('nodes')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  createNode(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Body() body: { name?: string | null; positionX?: number; positionY?: number },
  ) {
    return this.svc.addNode(businessCategoryId, body ?? {}, actorOf(req));
  }

  @Patch('nodes/:nodeId')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  updateNode(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { name?: string | null; positionX?: number; positionY?: number },
  ) {
    return this.svc.updateNode(nodeId, body ?? {}, {
      businessCategoryId,
      actor: actorOf(req),
    });
  }

  @Delete('nodes/:nodeId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  async deleteNode(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<void> {
    await this.svc.deleteNode(nodeId, { businessCategoryId, actor: actorOf(req) });
  }

  @Post('edges')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  createEdge(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Body() body: { source?: string; target?: string },
  ) {
    if (!body?.source || !body?.target) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    return this.svc.addEdge(businessCategoryId, body.source, body.target, actorOf(req));
  }

  @Delete('edges/:edgeId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  async deleteEdge(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('edgeId') edgeId: string,
  ): Promise<void> {
    await this.svc.deleteEdge(edgeId, { businessCategoryId, actor: actorOf(req) });
  }
}
