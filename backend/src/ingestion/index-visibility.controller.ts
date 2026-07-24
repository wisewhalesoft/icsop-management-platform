import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import {
  ChunkPreviewItem,
  IndexOverviewResult,
  IndexStatusView,
  IndexVisibilityService,
  OverviewStateFilter,
} from './index-visibility.service';

/**
 * F031 管理端「文件索引管理」端點（route base：/admin/doc-index）。
 *
 * RBAC（F025「文件索引管理」列＝row('READ','CRUD','NONE','NONE','NONE')）：
 *  - 查詢類（overview / 單文件狀態 / chunk 預覽）＝ 'read'：ICSOPAdmin CRUD、SysAdmin 唯讀允許。
 *  - 手動重新索引＝ 'write'：僅 ICSOPAdmin；SysAdmin 唯讀 → 403（本 feature 逐端點 action 為最易錯處）。
 *  - 主管/部門窗口/一般使用者：任一端點皆 403（矩陣 NONE）。
 * 守門鏈：SessionGuard（401 基準）→ RolePermissionGuard（403 授權）。
 * ⚠ 路由順序：/overview 宣告於 /:documentId 之前（避免 overview 被當 documentId 捕捉）。
 */
@Controller('admin/doc-index')
@UseGuards(SessionGuard, RolePermissionGuard)
@RequirePermission(FunctionKey.DOCUMENT_INDEX_MANAGEMENT, 'read')
export class IndexVisibilityController {
  constructor(private readonly svc: IndexVisibilityService) {}

  /** 跨文件索引狀態總覽（彙總計數 + 分頁 + 失敗篩選）。 */
  @Get('overview')
  overview(
    @Query('state') state?: string,
    @Query('page') page?: string,
  ): Promise<IndexOverviewResult> {
    const parsedPage = page ? Number(page) : undefined;
    return this.svc.getOverview({
      state:
        state === 'success' ||
        state === 'failed' ||
        state === 'running' ||
        state === 'not_built'
          ? (state as OverviewStateFilter)
          : undefined,
      page:
        parsedPage !== undefined && Number.isFinite(parsedPage) && parsedPage > 0
          ? Math.floor(parsedPage)
          : undefined,
    });
  }

  /** 單一文件之索引狀態三態（+ not_built + 失敗詳情）。 */
  @Get(':documentId')
  status(@Param('documentId') documentId: string): Promise<IndexStatusView> {
    return this.svc.getIndexStatus(documentId);
  }

  /** 單一文件之 chunk 預覽（依 chunkSeq 排序 + 8 項 metadata）。 */
  @Get(':documentId/chunks')
  chunks(@Param('documentId') documentId: string): Promise<ChunkPreviewItem[]> {
    return this.svc.previewChunks(documentId);
  }

  /** 手動重新索引（寫入類；SysAdmin 唯讀 → 403）。 */
  @Post(':documentId/reindex')
  @HttpCode(202)
  @RequirePermission(FunctionKey.DOCUMENT_INDEX_MANAGEMENT, 'write')
  async reindex(
    @Param('documentId') documentId: string,
  ): Promise<{ accepted: true }> {
    await this.svc.manualReindex(documentId);
    return { accepted: true };
  }
}
