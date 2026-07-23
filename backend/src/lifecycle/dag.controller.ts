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
import { DagService } from './dag.service';
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
 * 循環 DAG 節點/邊維護（F008）。巢狀於循環之下。守門鏈 SessionGuard→RolePermissionGuard。
 * 循環管理：read（SysAdmin/ICSOPAdmin/Supervisor）／write（ICSOPAdmin only）。
 * F038：每個 write 端點帶入 lifecycleId＋操作者快照 → service 發出結構變更事件。
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
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Body() body: { name?: string | null; positionX?: number; positionY?: number },
  ) {
    return this.svc.addNode(lifecycleId, body ?? {}, actorOf(req));
  }

  @Patch('nodes/:nodeId')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  updateNode(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { name?: string | null; positionX?: number; positionY?: number },
  ) {
    return this.svc.updateNode(nodeId, body ?? {}, {
      lifecycleId,
      actor: actorOf(req),
    });
  }

  @Delete('nodes/:nodeId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  async deleteNode(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<void> {
    await this.svc.deleteNode(nodeId, { lifecycleId, actor: actorOf(req) });
  }

  @Post('edges')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  addEdge(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Body() body: { source?: string; target?: string },
  ) {
    if (!body?.source || !body?.target) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    return this.svc.addEdge(lifecycleId, body.source, body.target, actorOf(req));
  }

  @Delete('edges/:edgeId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  async deleteEdge(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Param('edgeId') edgeId: string,
  ): Promise<void> {
    await this.svc.deleteEdge(edgeId, { lifecycleId, actor: actorOf(req) });
  }
}
