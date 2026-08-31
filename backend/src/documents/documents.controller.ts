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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
      // 🔴 F017 `AC-J14`（2026-08-28 E11 delta）：OJT 篩選之四值。`全部`＝不帶本參數；
      // 其餘三值須為三值聯集之成員，非成員一律視同「全部」（fail-open 為既有篩選慣例：
      // 未知篩選值不應把整頁清單篩成空，那會讓使用者以為資料不見了）。
      ojtStatus:
        q.ojtStatus === 'all' || q.ojtStatus === 'partial' || q.ojtStatus === 'none'
          ? q.ojtStatus
          : undefined,
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

  /**
   * F042 `AC-21`：某文件「已完成 OJT 之使用單位」唯讀衍生清單，供唯讀頁／編輯頁之 OJT 區塊。
   *
   * 🔴 **閘門刻意為 `ICSOP_DOCUMENT_MANAGEMENT read`，不是 `OJT_PROGRESS_MANAGEMENT`**：
   * 本區塊是**文件頁的一部分**，其可見範圍必須等同該頁之進入條件；`OJT_PROGRESS_MANAGEMENT`
   * 對 `User` 為 `NONE`，沿用它會讓能開文件頁的角色在頁內拿到 403、區塊永久顯示空狀態
   * ——兩個功能鍵之可見範圍不同，不可因「都跟 OJT 有關」而混用。
   *
   * 🔒 不遮蔽 `@Get(':id')`：`:id/ojt-completion` 為兩段路徑，與單段之 `:id` 不同構
   * （比照上方 `:id/links` 之既有共存）。
   */
  @Get(':id/ojt-completion')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  getOjtCompletion(@Param('id') id: string) {
    return this.svc.getDocumentOjtCompletion(id);
  }

  /**
   * F017 §清單匯出（CSV）delta：`POST /admin/documents/export`（`AC-X9`～`AC-X17`，架構 §13.2）。
   *
   * 🔴 **閘門為 `read` 而非 `write`，POST 不改變此事**：`RolePermissionGuard` 只看 `@RequirePermission`
   * 之**第二個引數**。本頁矩陣對 SysAdmin／Supervisor／DeptContact 皆為**唯讀**，改成 `'write'`
   * 會使三種角色連匯出都不能用；而為了讓它通過而把矩陣格值改成 CRUD，等同把整個文件管理模組對
   * 三者開放寫入。兩種改法皆為回歸，不是整理。
   * 📌 採 POST 純為「查詢對象集合放不進 URL」——本端點**無任何副作用**（不寫稽核、不寫任何資料表），
   * 與 `AppendicesService.exportPool()`／`UsageFormsService.exportPool()` 完全同型。
   *
   * 🔴 **驗證順序即實作順序，不可顛倒**（`AC-X17`）：① 型別 → ②（service 內）長度上限 →
   * ③ 空陣列走成功路徑 → ④ 查無之 id 靜默略過。
   * ① 必須**先於** ②：長度檢查以「`documentIds` 是陣列」為前提，順序顛倒會對非陣列輸入取 `.length`
   * 而得 `undefined`，`undefined > 10000` 恆為偽 ⇒ **驗證靜默通過**，畸形請求一路走到組 CSV。
   * ① **不得**退化為「視同空陣列」：那會讓畸形 body 產生一份**看似成功**的僅表頭 CSV，與「0 筆符合」
   * 逐位元組相同 ⇒ 沒有任何測試能區分兩者（本 repo 反覆付出代價的靜默失敗形狀）。
   * 🔴 成員非字串一律**整批拒絕**，明文禁止靜默 `typeof` 過濾：被過濾之成員會使 CSV 列數變短，而該
   * 現象與 ④ 之「該文件已被刪除」在輸出上完全無從區辨。
   * 🔒 ① **不適用於 `linkTargetId`**：該鍵為選填，缺席／空字串／指向不存在之文件一律不視為錯誤
   * ——其唯一用途是欄內排序，無命中即原樣回傳。
   * 🔒 錯誤碼沿用既有 `VALIDATION_ERROR`（同 controller 之 `setStatus()` 已在用），本 delta 不新增任何碼。
   */
  @Post('export')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  async exportList(
    @Body() body: { documentIds?: unknown; linkTargetId?: unknown },
    @Res() res: Response,
  ): Promise<void> {
    const ids = body?.documentIds;
    if (!Array.isArray(ids) || ids.some((v) => typeof v !== 'string')) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    const linkTargetId =
      typeof body?.linkTargetId === 'string' && body.linkTargetId !== ''
        ? body.linkTargetId
        : undefined;
    const { csv, fileName } = await this.svc.exportDocuments(ids as string[], linkTargetId);
    // 🔴 送 Buffer 而非 string：送字串會讓 Express 自行決定編碼，BOM 會悄悄壞掉而測試仍可能綠。
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);
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
