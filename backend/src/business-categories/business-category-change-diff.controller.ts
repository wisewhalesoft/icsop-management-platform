import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { BusinessCategoryChangeDiffService } from './business-category-change-diff.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { toWatermarkSession } from '../public/watermark.controller';
import type { SessionUser } from '../auth/session-token.service';

/**
 * F043 `AC-41` 業務/功能類別結構變更歷程 · 新舊對照（單筆事件之新舊結構 ＋ diff ＋ 雙頁下載）。
 *
 * **物理上掛於 `BusinessCategoriesModule`**（避免 `ChangeHistoryModule` 反向 import
 * `BusinessCategoriesModule` 造成循環相依）；**URL 保留 `change-history` 家族前綴**，
 * 逐字比照既有 `LifecycleChangeDiffController` 之掛法（architecture-spec §14.5）。
 *
 * 🔴 **守門鏈之權限為 `文件變更歷程` read（`DOCUMENT_CHANGE_HISTORY`），不是
 * `業務/功能類別管理`**（`AC-54`／人類決 7）。用錯會直接架空 `AC-54`：主管對
 * `業務/功能類別管理` 是**唯讀** ⇒ 該功能鍵之 `read` 對主管放行 ⇒ 主管會拿到本頁之
 * 清單／明細／diff／download，而人類裁決明訂**主管看不到任何一個 tab**。
 * 矩陣格值與端點閘門會各說各話，且**矩陣那一側完全看不出問題**。
 *
 * 🔴 **本組端點與 `/admin/change-history/{documents,lifecycles}` 並列為第三組資源**，
 * 詞尾（`changes/:changeLogId/tree-diff`／`/download`）逐字沿用 F038 之既有形狀、不發明新詞尾
 * ——舊草案之 `/admin/business-category-changes*` 自成一個前綴，會使**同一個 tab 的端點跨兩條
 * 守門鏈**，那正是先前閘門衝突的成因結構（2026-09-02 lead 裁定收斂）。
 */
@Controller(
  'admin/change-history/business-categories/:businessCategoryId/changes/:changeLogId/tree-diff',
)
@UseGuards(SessionGuard, RolePermissionGuard)
export class BusinessCategoryChangeDiffController {
  constructor(private readonly svc: BusinessCategoryChangeDiffService) {}

  /** 新舊結構 ＋ diff ＋ 浮水印快照（JSON）；不重複記稽核（清單頁之檢視已記一筆）。 */
  @Get()
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  treeDiff(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('changeLogId') changeLogId: string,
  ) {
    return this.svc.preview(
      toWatermarkSession(req.sessionUser as SessionUser),
      businessCategoryId,
      changeLogId,
    );
  }

  /** 雙頁已燒錄浮水印之新舊對照 PDF；記 `BUSINESS_CATEGORY_CHANGELOG_DOWNLOAD` 稽核。 */
  @Get('download')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  async download(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('changeLogId') changeLogId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf } = await this.svc.download(
      toWatermarkSession(req.sessionUser as SessionUser),
      businessCategoryId,
      changeLogId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="business-category-${businessCategoryId}-${changeLogId}-diff.pdf"`,
    );
    res.send(pdf);
  }
}
