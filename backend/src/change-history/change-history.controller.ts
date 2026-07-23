import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import {
  ChangeHistoryActor,
  DocumentChangeHistoryService,
} from './document-change-history.service';
import { LifecycleChangeHistoryService } from './lifecycle-change-history.service';

/** 自 SessionUser 取檢視稽核之操作者身分快照。 */
function actorOf(req: RequestWithSession): ChangeHistoryActor {
  const s = req.sessionUser;
  return {
    accountId: s?.accountId ?? '',
    name: s?.name ?? null,
    employeeNo: s?.employeeNo ?? null,
    roleCode: s?.roleCode ?? null,
  };
}

/**
 * F037/F038 文件變更歷程查詢（獨立後台功能）。守門鏈 SessionGuard→RolePermissionGuard。
 * 「文件變更歷程」（F025 獨立功能列）：SysAdmin/ICSOPAdmin 唯讀；主管/部門窗口/一般使用者→403 PERMISSION_DENIED。
 *  - GET documents            F037 程序書變更清單（篩選）
 *  - GET documents/:documentId F037 某文件欄位層 before/after ＋ CHANGE_LOG_VIEW 稽核
 *  - GET lifecycles           F038 循環結構變更清單（篩選）
 *  - GET lifecycles/:lifecycleId F038 某循環結構變更 ＋ LIFECYCLE_CHANGELOG_VIEW 稽核
 */
@Controller('admin/change-history')
@UseGuards(SessionGuard, RolePermissionGuard)
export class ChangeHistoryController {
  constructor(
    private readonly docs: DocumentChangeHistoryService,
    private readonly lifecycles: LifecycleChangeHistoryService,
  ) {}

  @Get('documents')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  listDocumentChanges(@Query() q: Record<string, string | undefined>) {
    return this.docs.queryChanges({
      doc: q.doc?.trim() || undefined,
      field: q.field?.trim() || undefined,
      person: q.person?.trim() || undefined,
      from: q.from || undefined,
      to: q.to || undefined,
    });
  }

  @Get('documents/:documentId')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  viewDocumentChanges(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
  ) {
    return this.docs.viewDocument(documentId, actorOf(req));
  }

  @Get('lifecycles')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  listLifecycleChanges(@Query() q: Record<string, string | undefined>) {
    return this.lifecycles.queryChanges({
      lifecycleId: q.lifecycleId?.trim() || undefined,
      changeType: q.changeType?.trim() || undefined,
      person: q.person?.trim() || undefined,
      from: q.from || undefined,
    });
  }

  @Get('lifecycles/:lifecycleId')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  viewLifecycleChanges(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Query('name') name?: string,
  ) {
    return this.lifecycles.viewLifecycle(lifecycleId, name ?? null, actorOf(req));
  }
}
