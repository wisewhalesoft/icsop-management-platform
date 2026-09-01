import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { AuditIdentityService } from '../audit/audit-identity.service';
import {
  ChangeHistoryActor,
  DocumentChangeHistoryService,
} from './document-change-history.service';
import { LifecycleChangeHistoryService } from './lifecycle-change-history.service';
import type { ChangeExportResult } from './document-change-history.service';

/**
 * 送出 CSV 位元組。
 * 🔴 `res.send(buffer)`（送 Buffer，不送 string）——送字串會讓 Express 自行決定編碼，
 * BOM 可能悄悄壞掉而測試仍綠（`error-handling.md#export` ①）。
 */
function sendCsv(res: Response, { csv, fileName }: ChangeExportResult): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csv);
}

/**
 * 🔴 2026-09-01 delta：`actorOf()` 曾是本檔之**同步**自由函式，只組
 * `accountId`／`name`／`employeeNo`／`roleCode` 四欄——`ChangeHistoryActor` 另外三欄
 * （`company`／`department`／`section`）從宣告日起就沒有任何呼叫端填過，於是本檔寫出的每一列
 * `CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW` 在 F024 調閱歷程之公司／部門／處室三欄
 * **恆為空白**（dev 實測 180／180 與 14／14，皆 100%）。
 *
 * 三欄選填 ⇒ 編譯期不示警；controller 之單元測試以假 service 驗「有沒有轉呼叫」，
 * 不看事件內容 ⇒ 測試期亦無感。修法是把「身分快照怎麼組」交給唯一組裝點
 * （`AuditIdentityService`），而不是在此再補三行。
 *
 * ⚠ 因需查 ORG_UNIT 解析部門／處室，本函式改為 **async**，四個呼叫端一律 `await`。
 */
async function actorOf(
  identity: AuditIdentityService,
  req: RequestWithSession,
): Promise<ChangeHistoryActor> {
  const s = req.sessionUser;
  const { actorName, ...snapshot } = await identity.resolve(s);
  return { accountId: s?.accountId ?? '', name: actorName, ...snapshot };
}

/**
 * 查詢／匯出**共用同一份** query 解析（§10.4「三處端點」）——兩份解析漂移時，
 * 使用者會匯出到一份比畫面多（或少）的結果而毫無徵兆。
 */
function documentFiltersOf(q: Record<string, string | undefined>) {
  return {
    doc: q.doc?.trim() || undefined,
    field: q.field?.trim() || undefined,
    person: q.person?.trim() || undefined,
    from: q.from || undefined,
    to: q.to || undefined,
  };
}

function lifecycleFiltersOf(q: Record<string, string | undefined>) {
  return {
    lifecycleId: q.lifecycleId?.trim() || undefined,
    changeType: q.changeType?.trim() || undefined,
    person: q.person?.trim() || undefined,
    from: q.from || undefined,
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
    private readonly identity: AuditIdentityService,
  ) {}

  @Get('documents')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  listDocumentChanges(@Query() q: Record<string, string | undefined>) {
    return this.docs.queryChanges(documentFiltersOf(q));
  }

  /**
   * F037 匯出（`AC-D1`～`AC-D9`）。
   * 🔴 **必須宣告於 `documents/:documentId` 之前**：Nest 依宣告順序比對路由，宣告在後會被參數
   * 路由吃掉（`:documentId = 'export'`）而回一份「文件 id 為 export」之空清單——HTTP 200、
   * 前端拿到 JSON 而非 CSV，且沒有任何錯誤。
   * 與查詢端點**共用同一組 query 參數解析**，避免「匯出範圍＝當前篩選」在兩份解析漂移時悄悄失準。
   */
  @Get('documents/export')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  async exportDocumentChanges(
    @Req() req: RequestWithSession,
    @Res() res: Response,
    @Query() q: Record<string, string | undefined>,
  ): Promise<void> {
    sendCsv(
      res,
      await this.docs.exportChanges(documentFiltersOf(q), await actorOf(this.identity, req)),
    );
  }

  @Get('documents/:documentId')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  async viewDocumentChanges(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
  ) {
    return this.docs.viewDocument(documentId, await actorOf(this.identity, req));
  }

  @Get('lifecycles')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  listLifecycleChanges(@Query() q: Record<string, string | undefined>) {
    return this.lifecycles.queryChanges(lifecycleFiltersOf(q));
  }

  /** F038 匯出（`AC-D1`／`AC-D2`／`AC-D4`／`AC-D5`）。路由順序理由同上。 */
  @Get('lifecycles/export')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  async exportLifecycleChanges(
    @Req() req: RequestWithSession,
    @Res() res: Response,
    @Query() q: Record<string, string | undefined>,
  ): Promise<void> {
    sendCsv(
      res,
      await this.lifecycles.exportChanges(
        lifecycleFiltersOf(q),
        await actorOf(this.identity, req),
      ),
    );
  }

  @Get('lifecycles/:lifecycleId')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  async viewLifecycleChanges(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Query('name') name?: string,
  ) {
    return this.lifecycles.viewLifecycle(
      lifecycleId,
      name ?? null,
      await actorOf(this.identity, req),
    );
  }
}
