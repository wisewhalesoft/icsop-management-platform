import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { WatermarkService, WatermarkSession } from './watermark.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import type { SessionUser } from '../auth/session-token.service';
import {
  attachmentDisposition,
  contentTypeOfFileName,
} from '../storage/content-disposition';

/** SessionUser（request context）→ 浮水印身分。accountId＝ACCOUNT.id（UUID，稽核用；SessionGuard 每請求填入）。 */
export function toWatermarkSession(u: SessionUser): WatermarkSession {
  return {
    accountId: u.accountId ?? '',
    employeeNo: u.employeeNo ?? null,
    name: u.name ?? null,
    companyCode: u.companyCode,
    orgCode: u.orgCode ?? null,
    roleCode: u.roleCode ?? null,
    // F041：一般使用者子分類（可見性判定用；與 orgCode/roleCode 同為 SessionGuard 之 DB 現行值）。
    userSubtype: u.userSubtype ?? null,
  };
}

/**
 * 附件白名單副檔名 → 回應 `Content-Type`。
 * 🔴 2026-08-17：改指向 `storage/content-disposition` 之**全站唯一表**（與 `attachmentDisposition`
 * 同一落點）。原為本檔之私有實作，與 `usage-forms`／`appendices` 服務中兩份逐字相同者並存三份。
 * 判定依據仍為伺服器端事實（已通過白名單驗證之檔名副檔名，§10.3），絕不採客戶端宣告。
 */
const attachmentContentType = contentTypeOfFileName;

/**
 * F020 前台文件檢視器 / 下載 / 列印（浮水印）。
 *
 * 守門鏈 SessionGuard→RolePermissionGuard：未登入 → 401（AC「未登入拒絕並導回登入頁」；
 * 前端於 401 導回登入）。VIEW/PDF 代理＝前台瀏覽（PUBLIC_BROWSING，五角色 READ）；
 * DOWNLOAD/PRINT＝下載列印文件（DOCUMENT_DOWNLOAD_PRINT，五角色 READ）——故唯一拒絕路徑為未登入
 * （OQ-F020-03：現行矩陣無角色別 403）。ICSOP_PDF 一律後端代理，不核發 SAS（架構 §5.2）。
 */
@Controller('public/documents')
@UseGuards(SessionGuard, RolePermissionGuard)
export class WatermarkController {
  constructor(private readonly svc: WatermarkService) {}

  /** 檢視器疊加用浮水印字串＋開啟中文件之編號/書名（G-PUB-032，JSON）；記錄 VIEW 稽核。 */
  @Get(':id/view')
  @RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
  view(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
  ): Promise<{ watermark: string; documentNumber: string | null; documentName: string | null }> {
    return this.svc.view(toWatermarkSession(req.sessionUser as SessionUser), id);
  }

  /** 代理原始 PDF 位元組（檢視器疊加預覽；不核發 SAS、不燒錄）。 */
  @Get(':id/pdf')
  @RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
  async pdf(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.svc.getOriginalPdf(toWatermarkSession(req.sessionUser as SessionUser), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buf);
  }

  /** 下載（內容層已燒錄浮水印）；記錄 DOWNLOAD 稽核。 */
  @Get(':id/download')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  async download(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf } = await this.svc.download(toWatermarkSession(req.sessionUser as SessionUser), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${id}.pdf"`);
    res.send(pdf);
  }

  /**
   * F020 `AC-D8`：前台 **ICSOP PDF** 附件下載（燒錄浮水印）。
   * 閘門為 `下載列印文件` read（**與 `:id/download` 完全相同**，五角色皆通過）——
   * 🔴 不得誤用 `ICSOP 文件管理`，那是 `AC-D6` 所收斂之**後台**共用端點之閘門（User 為 NONE），
   * 誤用會使一般使用者連前台附件都下載不到，架空 F026 矩陣「ICSOP PDF＝唯讀（可下載）」。
   */
  @Get(':id/attachments/icsop-pdf/download')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  async downloadIcsopPdf(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendAttachment(req, id, 'ICSOP_PDF', res);
  }

  /**
   * 📝 **本處原有 `downloadOjt`（`GET :id/attachments/ojt/download`），已整條移除**——逐字見
   * git 歷史。🔴 F042 E11（[F020](../../../docs/specs/features/F020-watermark.md) `AC-J26`
   * ／[F042](../../../docs/specs/features/F042-ojt-progress-management.md) `AC-24`）：
   * **前台不提供 OJT 場次檔下載**——簽到表為出席紀錄，與 `AC-16` 之 PII 防線同源，
   * 故燒錄／不燒錄之規則**自始不適用於場次檔之前台路徑**（該路徑不存在）。
   * 🔒 前台詳情頁之 OJT 區改為**純衍生唯讀清單**（已完成單位名稱），無下載入口。
   */

  /**
   * 附件端點之共用出口（不與其他路徑各寫一份串流碼）。
   *
   * `AC-D3a`：前台一律**代理串流**——body 即檔案位元組本身，不核發 SAS URL、不 3xx 轉址。
   * 燒錄與否、快照取得、F041 可見性判定與調閱稽核**全在 `svc.downloadAttachment` 內**完成
   * （與檢視器共用同一份 `buildSnapshot()`，`AC-D1` 要求逐字相同）；本層只負責回應標頭與送出。
   * 🔒 `blobPath` 不接受客戶端傳入——伺服器自 `(documentId, type)` 反查（`AC-D8` ②）。
   */
  private async sendAttachment(
    req: RequestWithSession,
    documentId: string,
    type: 'ICSOP_PDF',
    res: Response,
  ): Promise<void> {
    const { bytes, fileName } = await this.svc.downloadAttachment(
      toWatermarkSession(req.sessionUser as SessionUser),
      documentId,
      type,
    );
    res.setHeader('Content-Type', attachmentContentType(fileName));
    res.setHeader('Content-Disposition', attachmentDisposition(fileName));
    res.send(bytes);
  }

  /** 列印用 PDF（內容層已燒錄浮水印）；記錄 PRINT 稽核。 */
  @Get(':id/print')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  async print(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf } = await this.svc.print(toWatermarkSession(req.sessionUser as SessionUser), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.send(pdf);
  }
}
