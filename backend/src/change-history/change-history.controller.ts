import { Controller, Get, Optional, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
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
import { BusinessCategoryChangeHistoryService } from './business-category-change-history.service';
import { BusinessCategoryChangeFilters } from './business-category-change-query';
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
 * F043 `AC-40` 第三個 tab（`業務/功能類別樹狀圖`）之查詢面：`類別`／`期間`／`變更類型`。
 * 🔴 查詢與匯出**共用同一份解析**（理由逐字同上方兩個 tab）：兩份解析漂移時，使用者會匯出到
 * 一份比畫面多（或少）的結果而毫無徵兆。
 */
function businessCategoryFiltersOf(
  q: Record<string, string | undefined>,
): BusinessCategoryChangeFilters {
  return {
    businessCategoryId: q.businessCategoryId?.trim() || undefined,
    changeType: q.changeType?.trim() || undefined,
    person: q.person?.trim() || undefined,
    from: q.from || undefined,
    to: q.to || undefined,
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
    /**
     * 🔴 F043 additive 第三組資源（`AC-40`）。
     * **宣告為 `@Optional()` 純為相容既有 3 引數之手建單元測試**（`change-history.controller.spec.ts`
     * 之 `new ChangeHistoryController(docs, lifecycles, identity)`）；生產 DI 恆提供
     * （見 `change-history.module.ts` 之 providers）。
     * 未接線時三個新端點以**明確錯誤**中止，而非靜默回空——靜默是本 repo 反覆付出代價的形狀。
     */
    @Optional()
    private readonly businessCategories?: BusinessCategoryChangeHistoryService,
  ) {}

  /**
   * 取第三組資源之服務；未接線 → 立即拋錯（不靜默降級）。
   *
   * 🔴 **刻意為方法而非 getter**：本 repo 之既有路由測試以
   * `Object.getOwnPropertyNames(Controller.prototype)` 逐一**讀取**每個成員以蒐集 handler，
   * 讀取 getter 會**執行**它 ⇒ 一個未接線之守衛會把那些與本 feature 無關的測試全部炸紅。
   */
  private bcService(): BusinessCategoryChangeHistoryService {
    if (!this.businessCategories) {
      throw new Error('BUSINESS_CATEGORY_CHANGE_HISTORY_NOT_WIRED');
    }
    return this.businessCategories;
  }

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

  // ── F043 第三組資源：業務/功能類別樹狀圖（`AC-40`／`AC-54`）──────────────────────
  //
  // 🔴 三個端點之閘門逐字為 `DOCUMENT_CHANGE_HISTORY read`，**不是**
  // `BUSINESS_CATEGORY_MANAGEMENT`——tab 之可見性屬於**它所在的頁面**，不屬於**它所描述的對象**。
  // 用錯會讓主管（對 `業務/功能類別管理` 為唯讀）拿到本頁內容，直接架空 `AC-54`，
  // 而**矩陣那一側完全看不出問題**。
  // 🔒 既有 `documents`／`lifecycles` 兩組端點一行未改——本組為並列之第三組。

  @Get('business-categories')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  listBusinessCategoryChanges(@Query() q: Record<string, string | undefined>) {
    return this.bcService().queryChanges(businessCategoryFiltersOf(q));
  }

  /**
   * `AC-42` 匯出（CSV）。**GET**，比照既有 `documents/export`／`lifecycles/export`——
   * 本 tab 之匯出範圍由**篩選條件式**界定（類別／期間／變更類型），不像 F017 清單匯出那樣需要
   * 送上萬個 UUID，故無 URL 容量問題，沒有理由自成一種動詞。
   *
   * 🔴 **必須宣告於 `business-categories/:businessCategoryId` 之前**：Nest 依宣告順序比對路由，
   * 宣告在後會被參數路由吃掉（`:businessCategoryId = 'export'`）而回一份「類別 id 為 export」之
   * 空清單——HTTP 200、前端拿到 JSON 而非 CSV，且**沒有任何錯誤**。
   * 🔴 閘門仍為 `'read'`：改成 `'write'` 會讓 SysAdmin 這個唯讀角色連匯出都不能用。
   * 🔒 **無副作用**：不寫任何資料表；僅記一筆檢視稽核（由服務層負責）。
   */
  @Get('business-categories/export')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  async exportBusinessCategoryChanges(
    @Req() req: RequestWithSession,
    @Res() res: Response,
    @Query() q: Record<string, string | undefined>,
  ): Promise<void> {
    sendCsv(
      res,
      await this.bcService().exportChanges(
        businessCategoryFiltersOf(q),
        await actorOf(this.identity, req),
      ),
    );
  }

  /**
   * 某類別之結構變更列 ＋ 記一筆 `BUSINESS_CATEGORY_CHANGELOG_VIEW` 稽核。
   * 🔴 必須宣告於 `business-categories` 與 `business-categories/export` **之後**——Nest 依宣告
   * 順序比對路由；參數路由宣告在前會把固定段吃掉。
   */
  @Get('business-categories/:businessCategoryId')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  async viewBusinessCategoryChanges(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Query('name') name?: string,
  ) {
    return this.bcService().viewBusinessCategory(
      businessCategoryId,
      name ?? null,
      await actorOf(this.identity, req),
    );
  }
}
