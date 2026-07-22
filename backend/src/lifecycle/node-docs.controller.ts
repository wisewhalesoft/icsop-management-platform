import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NodeDocsService } from './node-docs.service';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * F009 節點抽屜（文件掛載）。巢狀於節點之下。守門鏈 SessionGuard→RolePermissionGuard。
 * 循環管理：read（檢視掛載）／write（掛載/改派/移除，ICSOPAdmin）。
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

  @Post('documents')
  @HttpCode(204)
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  async mount(
    @Param('lifecycleId') lifecycleId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { documentId?: string; confirm?: boolean },
  ): Promise<void> {
    if (!body?.documentId) throw new BadRequestException('VALIDATION_ERROR');
    await this.svc.mount(lifecycleId, nodeId, body.documentId, body.confirm === true);
  }

  @Delete('documents/:docId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  async unmount(
    @Param('lifecycleId') lifecycleId: string,
    @Param('nodeId') nodeId: string,
    @Param('docId') docId: string,
  ): Promise<void> {
    await this.svc.unmount(lifecycleId, nodeId, docId);
  }
}
