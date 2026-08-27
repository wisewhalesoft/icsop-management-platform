import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DocumentsService, DocumentActor } from './documents.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * ICSOP 文件（E04）。守門鏈 SessionGuard→RolePermissionGuard。
 * ICSOP文件管理（F025）：ICSOPAdmin CRUD、SysAdmin/Supervisor/DeptContact 唯讀。
 * 欄位面（F026）另於 service 以 classifyFields 落實（唯讀欄寫入→FIELD_WRITE_FORBIDDEN、UUID 忽略）。
 */
/** 自 SessionUser 取變更事件操作者快照（F037）。 */
function actorOf(req: RequestWithSession): DocumentActor {
  const s = req.sessionUser;
  return {
    accountId: s?.accountId ?? null,
    name: s?.name ?? null,
    employeeNo: s?.employeeNo ?? null,
    // 🔴 B 階段（多公司）：建立文件未指定「制定公司」時之歸屬來源（自家公司）。
    companyCode: s?.companyCode ?? null,
  };
}

@Controller('admin/documents')
@UseGuards(SessionGuard, RolePermissionGuard)
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get()
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  list(@Query() q: Record<string, string | undefined>) {
    const num = (v: string | undefined): number | undefined => {
      if (v === undefined || v.trim() === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    return this.svc.listDocuments({
      lifecycleId: q.lifecycleId || undefined,
      status: q.status || undefined,
      keyword: q.keyword?.trim() || undefined,
      documentNumber: q.documentNumber || undefined,
      documentName: q.documentName || undefined,
      companyCode: q.companyCode || undefined,
      draftingDeptId: q.draftingDeptId || undefined,
      draftingSectionId: q.draftingSectionId || undefined,
      primaryChiefId: q.primaryChiefId || undefined,
      linkTargetId: q.linkTargetId || undefined,
      // 🔴 F017 `AC-D2` 第 10／11 列／`AC-D6`：附錄／使用表單篩選（比照上一行 linkTargetId 之樣板）。
      // 📝 這兩行自 2026-08-16 立條起就漏了——本方法逐欄手動映射 q → filters，獨缺這兩欄；
      //    與前端 getDocuments() 之同型缺漏合起來，使該兩項篩選端到端完全無作用（靜默無錯誤）。
      appendixId: q.appendixId || undefined,
      formId: q.formId || undefined,
      // F017 AC-T40／AC-T43（2026-08-21 delta）：前端**原樣**帶上兩參數，子樹展開由服務層負責。
      nodeSubtreeId: q.nodeSubtreeId || undefined,
      sortBy:
        q.sortBy === 'documentNumber' || q.sortBy === 'announcedDate'
          ? q.sortBy
          : undefined,
      sortDir: q.sortDir === 'asc' || q.sortDir === 'desc' ? q.sortDir : undefined,
      page: num(q.page),
      pageSize: num(q.pageSize),
    });
  }

  @Get(':id')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  getOne(@Param('id') id: string) {
    return this.svc.getDocument(id);
  }

  /** F015：某文件之連結點清單（附目標編號/書名/目前狀態）。 */
  @Get(':id/links')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  getLinks(@Param('id') id: string) {
    return this.svc.getDocumentLinks(id);
  }

  @Post()
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')
  create(@Req() req: RequestWithSession, @Body() body: Record<string, unknown>) {
    // F037/F010：操作者身分快照（accountId/name/employeeNo）帶入 → 建立稽核事件記操作者。
    return this.svc.create(req.sessionUser?.roleCode, body ?? {}, actorOf(req));
  }

  /** F011 編輯：以新值覆蓋（不留歷史、UUID 不變）。欄位面/必填/狀態/編號唯一於 service 落實。 */
  @Patch(':id')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')
  update(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    // F037：操作者身分快照（accountId/name/employeeNo）帶入 → 變更日誌記操作者。
    return this.svc.update(req.sessionUser?.roleCode, id, body ?? {}, actorOf(req));
  }

  // svc.setStatus 回 void → 標 204，否則 Nest 回「200 + 空 body」而前端 apiFetch 會對空 body
  // 呼叫 res.json() 拋 SyntaxError（同 AppendicesController／UsageFormsController 之修正）。
  @Patch(':id/status')
  @HttpCode(204)
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')
  setStatus(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Body() body: { status?: string; reason?: string },
  ) {
    if (!body?.status) throw new BadRequestException('VALIDATION_ERROR');
    // F012：切換原因（選填）一併傳遞；缺鍵→undefined（不阻擋）。F037：帶入操作者快照。
    return this.svc.setStatus(id, body.status, body.reason, actorOf(req));
  }
}
