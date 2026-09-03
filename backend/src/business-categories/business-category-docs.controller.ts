import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BusinessCategoryDocsService,
  BusinessCategoryMountActor,
} from './business-category-docs.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import type { SessionUser } from '../auth/session-token.service';

/** 自 `SessionUser` 取掛載／移除之操作者身分快照（`AC-31`）。 */
function actorOf(req: RequestWithSession): BusinessCategoryMountActor {
  const s = req.sessionUser as SessionUser | undefined;
  return {
    actorId: s?.accountId ?? '',
    actorName: s?.name ?? null,
    employeeNo: s?.employeeNo ?? null,
    roleCode: s?.roleCode ?? null,
    companyCode: s?.companyCode ?? null,
    orgCode: s?.orgCode ?? null,
  };
}

const DEFAULT_CANDIDATE_PAGE_SIZE = 20;

/**
 * F043 §丙 節點掛載（可寫抽屜）。巢狀於節點之下。守門鏈 SessionGuard→RolePermissionGuard。
 *
 * 🔴 `candidates`／`subtreeDocuments` 之閘門為 **`read`**（非同 controller 上 mount／unmount 之
 * `write`）——`業務/功能類別管理` 之 Supervisor 為 `READ`，寫成 `'write'` 會讓主管在樹狀圖預覽頁
 * 吃 403（本 repo 於 F036 已踩過同一形狀）。
 * 🔴 `AC-37`：無可視權限角色（DeptContact／User）略過 UI 直呼 API 亦被拒（403），
 * 不產生任何副作用。
 */
@Controller('admin/business-categories/:businessCategoryId/nodes/:nodeId')
@UseGuards(SessionGuard, RolePermissionGuard)
export class BusinessCategoryDocsController {
  constructor(private readonly svc: BusinessCategoryDocsService) {}

  /**
   * `AC-20`／`AC-28`／`AC-29`：**抽屜之完整載荷**——節點資訊 ＋ 該節點目前掛載之文件 ＋
   * 候選文件（＝**全部 ICSOP 文件**，分頁＋關鍵字）。
   *
   * 🔴 本端點**不接受**任何循環相關之過濾參數——服務層之查詢型別上根本不存在該鍵。
   * 🔴 **一次回傳三段而非讓前端打兩支端點**：抽屜開啟當下「已掛載」與「候選」必須是**同一個
   * 時間點**的快照，分兩支端點會讓兩者之間出現一個可被寫入穿插的窗口，使剛掛上的文件同時出現在
   * 兩份清單裡。
   */
  @Get('candidates')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')
  async candidates(
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('nodeId') nodeId: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const [drawer, candidates] = await Promise.all([
      this.svc.getDrawer(businessCategoryId, nodeId),
      // 🔴 候選須知道「本節點」是誰才排除得掉已掛載者（2026-09-03 修正）——
      // 少了這兩個參數，抽屜會列出一份點下去必然 409 的文件（`AC-24`）。
      this.svc.listCandidates(businessCategoryId, nodeId, {
        keyword,
        page: toPositiveInt(page, 1),
        pageSize: toPositiveInt(pageSize, DEFAULT_CANDIDATE_PAGE_SIZE),
      }),
    ]);
    return {
      node: { id: drawer.node.id, name: drawer.node.name },
      mounted: drawer.mounted,
      candidates: candidates.items,
      /**
       * 🔴 `candidateTotal`／`candidateLifecycleCount` 為**全集**之統計（已套關鍵字與排除、
       * **未分頁**），`candidates` 才是當前頁——畫面上「候選＝全部 ICSOP 文件（共 N 份，
       * 分屬 M 個相異循環）」那句必須用這兩個數字，**不得**改用 `candidates.length` 或自
       * `candidates` 推導循環數（那正是 2026-09-03 顯示「共 22 份、分屬 1 個相異循環」而
       * 真庫實為 591 份的成因）。
       */
      candidateTotal: candidates.total,
      candidateLifecycleCount: candidates.lifecycleCount,
    };
  }

  /** `AC-29`：抽屜之已掛載清單（節點名稱 ＋ 該節點目前掛載之文件）。 */
  @Get('drawer')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')
  drawer(
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.svc.getDrawer(businessCategoryId, nodeId);
  }

  /** `AC-35`：子樹抽屜（唯讀孿生；分組／排序由後端完成）。閘門逐字沿用同 controller 之 read。 */
  @Get('subtree-documents')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')
  subtreeDocuments(
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.svc.listSubtreeDocuments(businessCategoryId, nodeId);
  }

  /** `AC-21`～`AC-24`：掛載一份文件（M:N；🔴 無 `confirm` 旗標——本功能不存在改派二次確認）。 */
  @Post('documents')
  @HttpCode(204)
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  async mount(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { documentId?: string },
  ): Promise<void> {
    if (!body?.documentId) throw new BadRequestException('VALIDATION_ERROR');
    await this.svc.mount(businessCategoryId, nodeId, body.documentId, actorOf(req));
  }

  /** `AC-25`：移除一筆掛載（不存在 → 404 `BUSINESS_CATEGORY_MOUNT_NOT_FOUND`，非靜默 200）。 */
  @Delete('documents/:documentId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'write')
  async unmount(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Param('nodeId') nodeId: string,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    await this.svc.unmount(businessCategoryId, nodeId, documentId, actorOf(req));
  }
}

/** query 之正整數解析（非數字／非正 → 預設值）。 */
function toPositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
