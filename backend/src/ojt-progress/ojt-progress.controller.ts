import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { OjtProgressService } from './ojt-progress.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import {
  MulterUploadedFile,
  MULTIPART_OPTIONS,
  toUploadFile,
} from '../storage/multipart';
import { attachmentDisposition } from '../storage/content-disposition';

/**
 * F042 OJT 進度管理（架構 §一 端點契約）。守門鏈 `SessionGuard` → `RolePermissionGuard`。
 *
 * 🔴 **`@RequirePermission` 之 read／write 只是第一道閘門**：刪除與歸位另有一道
 * `roleCode === 'ICSOPAdmin'` 檢查在**服務層**（`AC-19`／`AC-26`）——功能矩陣之
 * `受限CRUD` 格值對 Supervisor／DeptContact 於 `write` 恆為允許，**擋不住刪除**。
 *
 * 🔴 **`AC-20` 負向鎖定：本 controller 永久不得出現任何 `PATCH`／`PUT` 之
 * `sessions/:sessionId` 路由**——不是「暫緩」，是設計上就不存在此路由。更正之唯一路徑
 * ＝`ICSOPAdmin` 依 `AC-19` 刪除後重新登記。
 *
 * ⚠ 服務層回 `Promise<void>` 之路由標 `@HttpCode(204)`（比照 appendices／lifecycle 之既有
 * 契約）：不標則 Nest 回「200 ＋ 空 body」，前端 `apiFetch` 會對空 body 呼叫 `res.json()`
 * 而拋 SyntaxError，使**已成功之寫入被前端當成失敗**。
 */
@Controller()
@UseGuards(SessionGuard, RolePermissionGuard)
export class OjtProgressController {
  constructor(private readonly svc: OjtProgressService) {}

  /** TAB1 儀表板三區（`AC-14`／`AC-15`／`AC-16`）。 */
  @Get('admin/ojt-progress/summary')
  @RequirePermission(FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')
  getSummary(@Req() req: RequestWithSession) {
    return this.svc.getSummary(req.sessionUser);
  }

  /**
   * TAB2 進度列（`AC-11`）＋**恰兩項**篩選（`AC-13`）。
   *
   * 🔴 **回應為信封 `{ items, total }`，非裸陣列**——§架構設計 一之端點表「回應形狀」欄為
   * HTTP 契約之權威。服務層回陣列（其單元測試據此撰寫、不受影響），信封在本層組裝：
   * 兩者是不同層的形狀，混為一談會讓「服務回什麼」與「端點回什麼」互相綁死。
   */
  @Get('admin/ojt-progress/rows')
  @RequirePermission(FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')
  async listRows(
    @Req() req: RequestWithSession,
    @Query() q: Record<string, string | undefined>,
  ) {
    const items = await this.svc.listRows(req.sessionUser, {
      orgQuery: q.orgQuery || undefined,
      // 恰三值（`AC-13`）；未知值視同「所有完成狀態」——未知篩選值不應把整頁篩成空，
      // 那會讓使用者以為資料不見了。
      completionStatus:
        q.completionStatus === 'completed' || q.completionStatus === 'pending'
          ? q.completionStatus
          : '',
    });
    // `total` 為**篩選後**之列數（前端據以顯示「共 N 筆」）；本輪 MVP 未分頁，故等同 items.length。
    return { items, total: items.length };
  }

  /** 展開單一進度列之場次明細（`AC-12`；0 筆為合法空狀態，非錯誤）。 */
  @Get('admin/ojt-progress/rows/:documentId/:orgCode/sessions')
  @RequirePermission(FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')
  async getRowSessions(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('orgCode') orgCode: string,
  ) {
    const sessions = await this.svc.getRowSessions(req.sessionUser, documentId, orgCode);
    return { sessions };
  }

  /**
   * 新增場次（`AC-02`／`AC-05`／`AC-09`／`AC-10`；multipart，欄位名 `file`）。
   * ⚠ `MULTIPART_OPTIONS` 內含 `defParamCharset:'utf8'`——缺之則中文檔名會以 latin1 解讀而亂碼。
   */
  @Post('admin/ojt-progress/rows/:documentId/:orgCode/sessions')
  @RequirePermission(FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')
  @UseInterceptors(FileInterceptor('file', MULTIPART_OPTIONS))
  addSession(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('orgCode') orgCode: string,
    @Body('trainingDate') trainingDate: string | undefined,
    @UploadedFile() file: MulterUploadedFile,
  ) {
    return this.svc.addSession(req.sessionUser, documentId, orgCode, {
      trainingDate,
      file: file ? toUploadFile(file) : undefined,
    });
  }

  /** 場次簽到檔下載（代理串流，不核發 SAS）。 */
  @Get('admin/ojt-progress/sessions/:sessionId/download')
  @RequirePermission(FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')
  async download(
    @Req() req: RequestWithSession,
    @Param('sessionId') sessionId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, fileName, contentType } = await this.svc.downloadSession(
      req.sessionUser,
      sessionId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', attachmentDisposition(fileName));
    res.send(bytes);
  }

  /**
   * 刪除場次（`AC-19`）。🔴 路由層閘門為 `write`，**真正擋住 Supervisor／DeptContact 的是
   * 服務層那一道 `ICSOPAdmin` 檢查**——`受限CRUD` 於 `canPerform` 恆通過 `write`。
   */
  @Delete('admin/ojt-progress/sessions/:sessionId')
  @RequirePermission(FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')
  @HttpCode(204)
  deleteSession(@Req() req: RequestWithSession, @Param('sessionId') sessionId: string) {
    return this.svc.deleteSession(req.sessionUser, sessionId);
  }

  /**
   * 待歸位工作台清單（`AC-26`）。歸位完畢後整區自然消失。
   *
   * 🔴 回應為 `{ items: [{ id, documentId, documentNumber, documentName, fileName,
   * trainingDate, uploadedAt }] }`（§架構設計 一之端點表）——**帶文件編號／書名**：
   * 只給 `documentId` 的話，工作台上會是一排 UUID，操作者無從判斷該把哪一筆歸到哪個單位。
   */
  @Get('admin/ojt-progress/pending')
  @RequirePermission(FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')
  listPending(@Req() req: RequestWithSession) {
    return this.svc.listPendingView(req.sessionUser);
  }

  /**
   * 歸位（`AC-26`）。🔴 僅 `ICSOPAdmin`（服務層第二道閘門）；**單向、不可逆**。
   * 🔒 路徑刻意含 `pending/` 前綴而非做成通用之 `PATCH sessions/:id`——後者等於從側門把
   * `AC-20`（場次不可編輯）打開。
   */
  @Post('admin/ojt-progress/pending/:sessionId/assign')
  @RequirePermission(FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')
  assignPending(
    @Req() req: RequestWithSession,
    @Param('sessionId') sessionId: string,
    @Body() body: { orgCode?: string; trainingDate?: string },
  ) {
    return this.svc.assignPending(req.sessionUser, sessionId, {
      orgCode: body?.orgCode,
      trainingDate: body?.trainingDate,
    });
  }
}
