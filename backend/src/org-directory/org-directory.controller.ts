import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgDirectoryService } from './org-directory.service';
import { OrgTreeNode, OrgUnitRecord } from './org-unit-read';
import { PersonRecord } from './person-directory';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

function parseBool(v: string | undefined): boolean {
  return v === 'true' || v === '1';
}

/**
 * 生效公司別：明確帶入之 `?companyCode=` 優先，否則取**登入者自己的公司**。
 *
 * 🔴 B 階段（多公司）：舊版此處為常數 `DEFAULT_COMPANY = 'AS'`——在多公司資料共存後，該預設
 * 會使非 AS 公司的使用者在未帶參數時，靜默地取到 AS 的組織樹（部門下拉列出別家公司的部門）。
 * 改以 session 之公司為預設，語意才正確：「未指定＝我這家公司」。
 *
 * `SessionGuard` 已保證此端點必有 `sessionUser`（未登入 → 401），故此處不需再處理缺值分支；
 * 仍保留 `?? ''` 之防禦性收斂，避免型別上出現 undefined 而被迫在下游散落判斷。
 */
function effectiveCompany(
  req: RequestWithSession,
  explicit?: string,
): string {
  return explicit?.trim() || req.sessionUser?.companyCode || '';
}

/**
 * ORG_UNIT 讀取端點（供 F014 制定組織下拉、F019 部門篩選）。
 *
 * RBAC 定案（reuse 既有唯讀權限，不新增 F025 key）：以 FunctionKey.PUBLIC_BROWSING（前台瀏覽，
 * 五角色皆 READ）閘門——因 F019 前台部門篩選需覆蓋全部 5 角色；F014 之編輯權限（僅 ICSOPAdmin）
 * 於各自寫入端點另行把關，與讀取分離。守門鏈：SessionGuard（401 基準）→ RolePermissionGuard。
 * 未登入 → 401 AUTH_SESSION_EXPIRED（TS-ORGREAD-011）。
 * 註：若日後需更細之讀取權限區分（OQ-ORGREAD-2），應於 F025 spec 新增專屬 key（本輪不臆造）。
 */
@Controller('org-units')
@UseGuards(SessionGuard, RolePermissionGuard)
@RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
export class OrgUnitReadController {
  constructor(private readonly svc: OrgDirectoryService) {}

  /** list：依 companyCode 取全部（預設僅 active）。 */
  @Get()
  list(
    @Req() req: RequestWithSession,
    @Query('companyCode') companyCode?: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<OrgUnitRecord[]> {
    return this.svc.listOrgUnits(effectiveCompany(req, companyCode), {
      includeInactive: parseBool(includeInactive),
    });
  }

  /** tree：巢狀樹（公司層由 COMPANY 靜態名另包，不混入此結構）。 */
  @Get('tree')
  tree(
    @Req() req: RequestWithSession,
    @Query('companyCode') companyCode?: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<OrgTreeNode[]> {
    return this.svc.orgUnitTree(effectiveCompany(req, companyCode), {
      includeInactive: parseBool(includeInactive),
    });
  }

  /** cascade：直屬子層（F014 由上而下逐層；上層變更時清空下層之後端保證）。 */
  @Get('children')
  children(
    @Req() req: RequestWithSession,
    @Query('parentCode') parentCode?: string,
    @Query('companyCode') companyCode?: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<OrgUnitRecord[]> {
    const parent = parentCode?.trim();
    if (!parent) return Promise.resolve([]);
    return this.svc.orgUnitChildren(
      effectiveCompany(req, companyCode),
      parent,
      { includeInactive: parseBool(includeInactive) },
    );
  }

  /** subtree：codePrefix 前綴展開（空前綴 → 全域）。 */
  @Get('subtree')
  subtree(
    @Req() req: RequestWithSession,
    @Query('prefix') prefix?: string,
    @Query('companyCode') companyCode?: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<OrgUnitRecord[]> {
    return this.svc.orgUnitSubtree(
      effectiveCompany(req, companyCode),
      prefix?.trim() ?? '',
      { includeInactive: parseBool(includeInactive) },
    );
  }
}

/**
 * PERSON 讀取端點（由 ACCOUNT 提供；不另建 PERSON 表）。
 *  - GET /persons/search：僅回在職者（F014 當責室長候選）。
 *  - GET /persons/:employeeNo：單筆解析，含離職者（供歷史文件顯示既有室長）。
 * ⚠ 路由順序：/search 必須宣告於 /:employeeNo 之前（否則 'search' 會被當成 employeeNo 捕捉）。
 * RBAC 同上（reuse PUBLIC_BROWSING read）；未登入 → 401（TS-PERSON-015）。人員搜尋之角色範圍
 * （OQ-PERSON-4）待 F025 定案，本輪採「已登入即可讀」。
 */
@Controller('persons')
@UseGuards(SessionGuard, RolePermissionGuard)
@RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
export class PersonReadController {
  constructor(private readonly svc: OrgDirectoryService) {}

  @Get('search')
  search(
    @Req() req: RequestWithSession,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('companyCode') companyCode?: string,
  ): Promise<PersonRecord[]> {
    const parsed = limit === undefined ? undefined : Number(limit);
    const lim =
      parsed !== undefined && Number.isFinite(parsed) && parsed > 0
        ? Math.min(Math.floor(parsed), 100)
        : undefined;
    return this.svc.searchActivePersons(
      effectiveCompany(req, companyCode),
      q?.trim() ?? '',
      lim,
    );
  }

  @Get(':employeeNo')
  async byEmployeeNo(
    @Req() req: RequestWithSession,
    @Param('employeeNo') employeeNo: string,
    @Query('companyCode') companyCode?: string,
  ): Promise<PersonRecord> {
    const p = await this.svc.getPerson(
      effectiveCompany(req, companyCode),
      employeeNo,
    );
    if (p === null) throw new NotFoundException('PERSON_NOT_FOUND');
    return p;
  }
}
