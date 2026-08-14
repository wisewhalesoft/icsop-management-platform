import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import {
  JOB_TITLE_READ_STORE,
  JobTitleReadStore,
  JobTitleRecord,
} from './job-title-directory';
import { CompanyOption, listSelectableCompanies } from './company-name';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * 公司主檔（F003 `AC-P15`）。資料來源＝靜態 `COMPANY_FULL_NAMES`（無 DB 表、無同步來源、
 * 無 migration）；`SELECTABLE_COMPANIES` 由其鍵集合導出（INV-C1），故本端點之回應與
 * 建立／編輯之寫入驗證（`AC-P5`／`AC-P10`）恆為同一集合。
 *
 * RBAC：「帳號管理」read＝SysAdmin／ICSOPAdmin；主管／部門窗口／一般使用者 → 403；
 * 未登入 → 401（SessionGuard）。**不新增 F025 功能鍵**。
 */
@Controller('companies')
@UseGuards(SessionGuard, RolePermissionGuard)
@RequirePermission(FunctionKey.ACCOUNT_MANAGEMENT, 'read')
export class CompanyReadController {
  /** 全部有效公司，依 `companyCode` 昇冪。無 query 參數。 */
  @Get()
  list(): CompanyOption[] {
    return listSelectableCompanies();
  }
}

/**
 * 職位主檔（F003 `AC-P14`）。讀 F004 已同步之 `JOB_TITLE`（`JOB_TITLE_READ_STORE` 由本模組
 * 既有提供，**不需新表、不需新 store**）。
 *
 * ⚠ 依 `companyCode` **精確過濾**、不做顯示端之兩段式跨公司 fallback——與 `AC-P7` 之寫入驗證
 * 必須是同一集合，否則會出現「下拉選得到但存檔被拒」。
 * RBAC 同 `CompanyReadController`。
 */
@Controller('job-titles')
@UseGuards(SessionGuard, RolePermissionGuard)
@RequirePermission(FunctionKey.ACCOUNT_MANAGEMENT, 'read')
export class JobTitleReadController {
  constructor(
    @Inject(JOB_TITLE_READ_STORE) private readonly store: JobTitleReadStore,
  ) {}

  /** `companyCode` 選填；未帶時預設＝操作者 session 之公司。依 `code` 昇冪。 */
  @Get()
  async list(
    @Req() req: RequestWithSession,
    @Query('companyCode') companyCode?: string,
  ): Promise<JobTitleRecord[]> {
    const target = companyCode?.trim() || req.sessionUser!.companyCode;
    const rows = await this.store.listAll();
    return rows
      .filter((r) => r.companyCode === target)
      .sort((a, b) => a.code.localeCompare(b.code));
  }
}
