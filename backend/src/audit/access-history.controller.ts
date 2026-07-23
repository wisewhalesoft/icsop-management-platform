import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditWriterService } from './audit-writer.service';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { AuditKind, AuditQueryFilters, AuditQueryScope } from './audit.types';

/**
 * F024 文件調閱歷程查詢（唯讀後台）。守門鏈 SessionGuard→RolePermissionGuard。
 * 權限＝文件調閱歷程查詢（F025：SysAdmin/ICSOPAdmin READ；其餘 NONE→403）。
 * 後端強制驗證角色，不信任前端條件（Main Flow 步驟4）。查詢邏輯於 AuditWriter.queryHistory
 * （篩選/排序/分頁/近 30 天預設，見 access-history-filter）。
 *
 * 範圍恆全公司（開放問題#6）。匯出共用同一 filters+角色守門（TS-015/016），不得成為旁路。
 */
const SCOPE: AuditQueryScope = { company: 'ALL' };
/** 匯出全量上限（草案；正式版格式/上限待架構定案，開放問題#3）。 */
const EXPORT_MAX = 100000;

function parseIntOr(v: string | undefined, fallback: number): number {
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function buildFilters(
  kind: string | undefined,
  person: string | undefined,
  target: string | undefined,
  from: string | undefined,
  to: string | undefined,
  page: number,
  pageSize: number,
): AuditQueryFilters {
  return {
    kind: (kind as AuditKind) || undefined,
    person: person?.trim() || undefined,
    target: target?.trim() || undefined,
    from: from?.trim() || undefined,
    to: to?.trim() || undefined,
    page,
    pageSize,
  };
}

@Controller('admin/access-history')
@UseGuards(SessionGuard, RolePermissionGuard)
export class AccessHistoryController {
  constructor(private readonly writer: AuditWriterService) {}

  @Get()
  @RequirePermission(FunctionKey.DOCUMENT_ACCESS_HISTORY, 'read')
  query(
    @Query('kind') kind?: string,
    @Query('person') person?: string,
    @Query('target') target?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const filters = buildFilters(
      kind,
      person,
      target,
      from,
      to,
      parseIntOr(page, 1),
      parseIntOr(pageSize, 50),
    );
    return this.writer.queryHistory(SCOPE, filters);
  }

  @Get('export')
  @RequirePermission(FunctionKey.DOCUMENT_ACCESS_HISTORY, 'read')
  async exportHistory(
    @Query('kind') kind?: string,
    @Query('person') person?: string,
    @Query('target') target?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // 匯出＝當前查詢條件之全量（非全表）；與查詢共用 filters+角色守門（TS-015/016）。
    const filters = buildFilters(kind, person, target, from, to, 1, EXPORT_MAX);
    const result = await this.writer.queryHistory(SCOPE, filters);
    return { rows: result.items, total: result.total };
  }
}
