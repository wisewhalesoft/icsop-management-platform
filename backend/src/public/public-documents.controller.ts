import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { PublicDocumentsService } from './public-documents.service';
import { PublicDocumentDetailService } from './public-document-detail.service';
import { DEFAULT_PAGE_SIZE, PublicListFilters } from './public-list';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { toViewerScope } from '../rbac/viewer-scope';

/**
 * F019 前台文件清單端點（新獨立 controller，不改 documents.service，避免撞 doc-edit worktree）。
 *
 * RBAC：reuse FunctionKey.PUBLIC_BROWSING（前台瀏覽＝五角色 READ，滿足 AC「全角色可瀏覽」），
 * 不新增 F025 key。守門鏈 SessionGuard→RolePermissionGuard：未登入 → 401 AUTH_SESSION_EXPIRED。
 * 置頂所依之使用者部門取自 session（SessionGuard 每請求以 DB 現行值填入 orgCode，PII 不進 JWT）。
 */
@Controller('public/documents')
@UseGuards(SessionGuard, RolePermissionGuard)
@RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
export class PublicDocumentsController {
  constructor(
    private readonly svc: PublicDocumentsService,
    private readonly detailSvc: PublicDocumentDetailService,
  ) {}

  /**
   * 🔴 2026-08-16 delta：`deptCode` 之 query 解析**一併移除**（架構 A9 §10.9 之三處第 2 處）。
   * 只自 UI 移除而 controller 仍解析，客戶端仍可送 `?deptCode=` 而後端仍據以過濾——
   * `AC-D1` 表面滿足而該能力靜默續存。
   * 參數順序：`keyword` 維持首位（既有），其後依 `AC-D1` 之 UI 逐字順序排列。
   */
  @Get()
  list(
    @Req() req: RequestWithSession,
    @Query('keyword') keyword?: string,
    @Query('companyCode') companyCode?: string,
    @Query('draftingDeptId') draftingDeptId?: string,
    @Query('draftingSectionId') draftingSectionId?: string,
    @Query('chiefId') chiefId?: string,
    @Query('status') status?: string,
    @Query('lifecycleId') lifecycleId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    /**
     * 🔵 2026-09-22 UX16 delta（`AC-UX22`，項 10）：制定本部。複合鍵
     * `` `${公司代碼}__{本部代碼}` ``（🔴 非顯示名稱字串、非裸本部代碼——5 碼組織代碼各公司
     * 獨立編碼，單用本部代碼會把不同公司的同碼本部併成同一個值）。
     *
     * 🔴 **三個新參數一律附加於參數列最末、不插入中段**：`AC-UX22`／`AC-UX40` 所指定之
     * 「插入中段」是**畫面篩選列由左至右之順序**，與本方法之 TypeScript 參數位置無關
     * （`@Query()` 依**名稱**繫結）。插入中段會把其後每一個既有參數的位置往後推一格，
     * 使既有以位置引數直呼本方法之測試（`public-documents.controller.spec.ts:71`）整組錯位
     * ——那是一次純粹自傷的轉紅，與本 delta 的驗收意圖毫無關係。
     */
    @Query('draftingDivisionId') draftingDivisionId?: string,
    /**
     * 🔵 2026-09-22 UX16 delta（`AC-UX15` ⑤／架構 §16.4，項 5）：節點子樹之 deep link 兩參數。
     * 🔴 **恆成對**，任一缺席即靜默 no-op（不篩選、不顯示 chip、**不回錯誤**）。
     * 🔴 刻意**不併入 `filters`**（§16.4）：chip 之清除與既有六項篩選之清除語意互不干涉，
     * 塞進同一份資料結構就會糾纏在一起。
     */
    @Query('bcSubtreeId') bcSubtreeId?: string,
    @Query('bcSubtreeNodeId') bcSubtreeNodeId?: string,
  ) {
    // F041：viewer 之唯一合法來源＝req.sessionUser（SessionGuard 每請求以 DB 現行值填入）。
    const viewer = toViewerScope(req.sessionUser);
    const filters: PublicListFilters = {
      keyword: keyword?.trim() || undefined,
      companyCode: companyCode?.trim() || undefined,
      draftingDivisionId: draftingDivisionId?.trim() || undefined,
      draftingDeptId: draftingDeptId?.trim() || undefined,
      draftingSectionId: draftingSectionId?.trim() || undefined,
      chiefId: chiefId?.trim() || undefined,
      status: status?.trim() || undefined,
      lifecycleId: lifecycleId?.trim() || undefined,
    };
    const pageNo = parsePositiveInt(page, 1);
    const size = parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE);
    /**
     * `AC-UX15` ⑤ 之**成對性在邊界就兌現**：任一參數缺席 ⇒ **完全不帶第五引數**，呼叫形狀與
     * 本 delta 導入前逐字相同（additive 之字面意義——未帶新參數之既有請求行為完全不變）。
     * 🔒 服務層之同一項檢查**刻意保留**（`resolveSubtree()` 之四個 no-op 成因）：兩層各自獨立
     * 判定，任一層被誤刪另一層仍是完整防線。
     */
    const businessCategoryId = bcSubtreeId?.trim();
    const nodeId = bcSubtreeNodeId?.trim();
    if (!businessCategoryId || !nodeId) return this.svc.list(viewer, filters, pageNo, size);
    return this.svc.list(viewer, filters, pageNo, size, { businessCategoryId, nodeId });
  }

  /**
   * F019 `AC-D5`：五組可搜尋下拉之選項（單一端點一次回傳，確保五組來自同一次可見性計算）。
   *
   * 🔴 **不接受任何 filters／query 參數**——選項為全域 distinct、非當前結果集衍生，
   * 簽章上沒有 filters 可收即為該語意之結構性保證。
   * 🔴 必須宣告於 `@Get(':id')` **之前**，否則會被參數路由吃掉。
   */
  @Get('filter-options')
  filterOptions(@Req() req: RequestWithSession) {
    return this.svc.filterOptions(toViewerScope(req.sessionUser));
  }

  /**
   * G-PUB-020 前台文件詳情（登入員工可讀；19 欄 + 附件/使用表單/連結）。
   * 非「已公告」文件 → 404 DOCUMENT_NOT_FOUND（視同不存在）；未登入 → 401（守門鏈）。
   * 註：`:id` 為單段路徑，與 WatermarkController 之 `:id/view` 等（雙段）不衝突。
   *
   * F041：本端點原先完全未接收 `@Req()`，本次從零新增——業務子分類之直連 URL 限縮需要 viewer
   * （架構 §3.7 決策一，四入口簽章變更之唯一「新增請求物件存取」者）。
   */
  @Get(':id')
  detail(@Param('id') id: string, @Req() req: RequestWithSession) {
    return this.detailSvc.detail(id, toViewerScope(req.sessionUser));
  }
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
