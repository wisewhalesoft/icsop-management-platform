import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NodeDocsService } from './node-docs.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { LifecycleActor } from './lifecycle-change-event';

/** 自 SessionUser 取結構變更操作者快照（F038）。 */
function actorOf(req: RequestWithSession): LifecycleActor {
  const s = req.sessionUser;
  return {
    accountId: s?.accountId ?? null,
    name: s?.name ?? null,
    employeeNo: s?.employeeNo ?? null,
  };
}

/**
 * F009 節點抽屜（文件掛載）。巢狀於節點之下。守門鏈 SessionGuard→RolePermissionGuard。
 * 循環管理：read（檢視掛載）／write（掛載/改派/移除，ICSOPAdmin）。
 * F038：write 端點帶入操作者快照 → service 發出 DOCUMENT_MOUNTED/REASSIGNED/UNMOUNTED 事件。
 */
@Controller('admin/lifecycles/:lifecycleId/nodes/:nodeId')
@UseGuards(SessionGuard, RolePermissionGuard)
export class NodeDocsController {
  constructor(private readonly svc: NodeDocsService) {}

  @Get('drawer')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'read')
  drawer(
    @Param('lifecycleId') lifecycleId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.svc.getDrawer(lifecycleId, nodeId);
  }

  /**
   * F036 樹狀圖節點雙擊之唯讀文件清單。
   * 🔴 閘門為 `'read'`（非同 controller 上 mount／unmount 之 `'write'`）——`LIFECYCLE_MANAGEMENT`
   * 之 Supervisor 為 READ，寫成 `'write'` 會讓主管在樹狀圖預覽頁吃 403（F036 AC-D5）。
   */
  @Get('documents')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'read')
  listDocuments(
    @Param('lifecycleId') lifecycleId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.svc.listNodeDocuments(lifecycleId, nodeId);
  }

  /**
   * F036 子樹抽屜（架構決策 C2，architecture-spec §12.2）：該節點及其全部下游所掛載之程序書，
   * 已由後端分組／排序／去重。
   * 🔴 閘門逐字沿用同 controller 之單節點 `.../documents` 端點（`LIFECYCLE_MANAGEMENT read`，
   * `AC-T25` ①）——寫成 `'write'` 會讓主管在樹狀圖預覽頁吃 403。
   */
  @Get('subtree-documents')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'read')
  listSubtreeDocuments(
    @Param('lifecycleId') lifecycleId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.svc.listSubtreeDocuments(lifecycleId, nodeId);
  }

  @Post('documents')
  @HttpCode(204)
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  async mount(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { documentId?: string; confirm?: boolean },
  ): Promise<void> {
    if (!body?.documentId) throw new BadRequestException('VALIDATION_ERROR');
    await this.svc.mount(lifecycleId, nodeId, body.documentId, body.confirm === true, actorOf(req));
  }

  @Delete('documents/:docId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  async unmount(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Param('nodeId') nodeId: string,
    @Param('docId') docId: string,
  ): Promise<void> {
    await this.svc.unmount(lifecycleId, nodeId, docId, actorOf(req));
  }
}
