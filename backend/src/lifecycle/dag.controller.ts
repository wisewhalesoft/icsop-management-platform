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
  UseGuards,
} from '@nestjs/common';
import { DagService } from './dag.service';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * 循環 DAG 節點/邊維護（F008）。巢狀於循環之下。守門鏈 SessionGuard→RolePermissionGuard。
 * 循環管理：read（SysAdmin/ICSOPAdmin/Supervisor）／write（ICSOPAdmin only）。
 */
@Controller('admin/lifecycles/:lifecycleId')
@UseGuards(SessionGuard, RolePermissionGuard)
export class DagController {
  constructor(private readonly svc: DagService) {}

  @Get('graph')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'read')
  graph(@Param('lifecycleId') lifecycleId: string) {
    return this.svc.getGraph(lifecycleId);
  }

  @Post('nodes')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  addNode(
    @Param('lifecycleId') lifecycleId: string,
    @Body() body: { name?: string | null; positionX?: number; positionY?: number },
  ) {
    return this.svc.addNode(lifecycleId, body ?? {});
  }

  @Patch('nodes/:nodeId')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  updateNode(
    @Param('nodeId') nodeId: string,
    @Body() body: { name?: string | null; positionX?: number; positionY?: number },
  ) {
    return this.svc.updateNode(nodeId, body ?? {});
  }

  @Delete('nodes/:nodeId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  async deleteNode(@Param('nodeId') nodeId: string): Promise<void> {
    await this.svc.deleteNode(nodeId);
  }

  @Post('edges')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  addEdge(
    @Param('lifecycleId') lifecycleId: string,
    @Body() body: { source?: string; target?: string },
  ) {
    if (!body?.source || !body?.target) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    return this.svc.addEdge(lifecycleId, body.source, body.target);
  }

  @Delete('edges/:edgeId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  async deleteEdge(@Param('edgeId') edgeId: string): Promise<void> {
    await this.svc.deleteEdge(edgeId);
  }
}
