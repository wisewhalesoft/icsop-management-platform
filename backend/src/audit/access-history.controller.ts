import { Controller, Get, Logger, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuditWriterService } from './audit-writer.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import {
  ACCESS_HISTORY_EXPORT_TARGET_ID,
  AuditKind,
  AuditQueryFilters,
  AuditQueryScope,
  AuditRow,
  AuditTargetRefRequiredError,
} from './audit.types';
import {
  CsvColumn,
  EXPORT_ROW_LIMIT,
  assertExportRowLimit,
  exportFileName,
  formatExportTimestamp,
  toCsvBuffer,
} from '../storage/csv-export';
import { actionTypeLabel, auditKindLabel, roleLabel } from './access-history-labels';
import { resolveCompanyName } from '../org-directory/company-name';

/**
 * F024 文件調閱歷程查詢（唯讀後台）。守門鏈 SessionGuard→RolePermissionGuard。
 * 權限＝文件調閱歷程查詢（F025：SysAdmin/ICSOPAdmin READ；其餘 NONE→403）。
 * 後端強制驗證角色，不信任前端條件（Main Flow 步驟4）。查詢邏輯於 AuditWriter.queryHistory
 * （篩選/排序/分頁/近 30 天預設，見 access-history-filter）。
 *
 * 範圍恆全公司（開放問題#6）。匯出共用同一 filters+角色守門（TS-015/016），不得成為旁路。
 *
 * 🔴 2026-08-18「匯出鈕失效」修復 delta（`AC-F1`～`AC-F19`；architecture-spec §10.18 `A16-1`～`A16-4`）：
 * 匯出端點由「回 JSON `{rows,total}`」改為**真正輸出 CSV 位元組**，正式成為
 * `error-handling.md#export` 之第四處匯出（共用 `storage/csv-export.ts` 產生器、共用
 * `EXPORT_ROW_LIMIT`／`EXPORT_ROW_LIMIT_EXCEEDED`，不另立規則、不新增錯誤碼）。
 * 查詢端點（`GET /admin/access-history`）之行為、欄位、篩選、分頁**一律不變**。
 */
const SCOPE: AuditQueryScope = { company: 'ALL' };

/**
 * 匯出之 10 欄（`AC-F4`：順序與畫面主表格由左至右一致；畫面第 11 欄「展開箭頭」不匯出）。
 *  - 列舉欄（角色／類型／操作類型）一律輸出中文標籤（`AC-F5`，見 access-history-labels）。
 *  - 「對象（文件／循環）」＝ documentNumber → lifecycleName → formId 依序第一個非空值；
 *    三者皆空 → **空儲存格**（不輸出畫面之視覺佔位符 `—`，`AC-F15` ③）。
 *  - 「操作時間」以 `formatExportTimestamp()` 之顯式 +8 位移計算（`AC-F6`；不得用 toLocale*）。
 *  - 明細專屬之「浮水印快照」「對象名稱／說明」**不在欄集合內**（`AC-F14`）。
 */
const EXPORT_COLUMNS: readonly CsvColumn<AuditRow>[] = [
  { header: '操作人員', value: (r) => r.name },
  { header: '員工編號', value: (r) => r.employeeNo },
  { header: '公司', value: (r) => r.company },
  { header: '部門', value: (r) => r.department },
  { header: '處/室', value: (r) => r.section },
  { header: '角色', value: (r) => roleLabel(r.roleCode) },
  { header: '類型', value: (r) => auditKindLabel(r.targetType) },
  {
    header: '對象（文件／循環）',
    value: (r) => r.documentNumber || r.lifecycleName || r.formId || '',
  },
  { header: '操作類型', value: (r) => actionTypeLabel(r.actionType) },
  { header: '操作時間', value: (r) => formatExportTimestamp(r.occurredAt) },
];

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

/**
 * 當前操作者（`AC-F13` ②）。
 *
 * 📌 本 handler 依端點契約不接收 `@Req()`（參數尾端為 `@Res()`，比照 `ChangeHistoryController`／
 * `AppendicesController` 之匯出慣例），故經 Express 掛在回應物件上之 `res.req` 取 session；
 * 單元測試之假 Response 無 `req`，以 optional 讀取容錯（不影響 production 路徑）。
 */
function sessionOf(res: Response): SessionUser | undefined {
  return (res.req as RequestWithSession | undefined)?.sessionUser;
}

@Controller('admin/access-history')
@UseGuards(SessionGuard, RolePermissionGuard)
export class AccessHistoryController {
  private readonly logger = new Logger(AccessHistoryController.name);

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

  /**
   * 匯出＝當前查詢條件之**全部結果**（非當前分頁），輸出 CSV（UTF-8 with BOM）。
   *
   *  - `AC-F7` ③④：與查詢共用同一份 `buildFilters()`／同一個 `queryHistory()`；`page`／`pageSize`
   *    固定傳入 `1`／`EXPORT_ROW_LIMIT + 1`，本簽章本就不接收這兩個 query 參數。
   *  - `A16-4`：**單一次** `queryHistory()` 呼叫即取得 `total`（SQL `COUNT`）與列（`OFFSET/FETCH`），
   *    不比照 F037／F038 另建兩段式 count/list（`AuditStore.queryPage()` 之 `getManyAndCount()`
   *    已原生下推）。
   *  - `AC-F2`：`res.send(buffer)` 送 **Buffer**（送字串會讓 Express 自行決定編碼、BOM 可能悄悄壞掉）。
   *  - 五個 query 參數之型別由 `?: string` 改為 `: string | undefined`（語意不變）——TS 不允許
   *    必填參數排在選填參數之後，而 `@Res()` 依端點契約置於參數尾端。
   */
  @Get('export')
  @RequirePermission(FunctionKey.DOCUMENT_ACCESS_HISTORY, 'read')
  async exportHistory(
    @Query('kind') kind: string | undefined,
    @Query('person') person: string | undefined,
    @Query('target') target: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const filters = buildFilters(kind, person, target, from, to, 1, EXPORT_ROW_LIMIT + 1);
    const result = await this.writer.queryHistory(SCOPE, filters);

    // 第一道：SQL COUNT 之權威 total（`AC-F8`；> 上限即 400，捨棄 items、不產生任何檔案、不寫稽核）。
    assertExportRowLimit(result.total);
    // 第二道（競態防護，A16-4 ③）：COUNT 與 SELECT 為兩條獨立 SQL，其間可能有新列寫入。
    // 記憶體內比對，不觸發額外 SQL。
    assertExportRowLimit(result.items.length);

    const now = new Date();
    const csv = toCsvBuffer(result.items, EXPORT_COLUMNS);
    await this.recordExportAudit(res, now);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportFileName('access_history', now)}"`,
    );
    res.send(csv);
  }

  /**
   * 匯出成功之稽核（`AC-F13`）：`AUDIT_LOG` 恰一列 `ACCESS_HISTORY_EXPORT`。
   *
   * 🔴 `targetId` 為**固定哨兵常數**、與結果集無關（§10.18 `A16-1`）——稽核記錄的是「某人匯出了
   * 一份調閱歷程」這個動作，其對象不是結果集裡的任何一列。故 `total` 為 0／1／N 皆恰寫一列，
   * 0 筆不得靜默漏記（`AC-F11` 定義 0 筆匯出為成功）。**不得**照抄 F037／F038 之
   * `items[0]?.documentId ?? null` 寫法（`OQ-E07-15`）。
   *
   * 🔴 非阻斷之**適用界線**（`AC-F13`）：僅 Outbox／IO 之暫時性失敗不阻斷匯出；
   * `AUDIT_TARGET_REF_REQUIRED`（payload 根本組不出來）屬呼叫端錯誤，**上拋、不吞**。
   * 就本呼叫端而言該錯誤結構上不可達（`targetId` 恆為非空字面常數），此判斷是把 AC 之界線
   * 寫成程式碼而非依賴「反正不會發生」。
   */
  private async recordExportAudit(res: Response, now: Date): Promise<void> {
    const s = sessionOf(res);
    try {
      await this.writer.recordAccess({
        targetType: 'ACCESS_HISTORY',
        actionType: 'ACCESS_HISTORY_EXPORT',
        targetId: ACCESS_HISTORY_EXPORT_TARGET_ID,
        actorId: s?.accountId ?? '',
        actorName: s?.name ?? null,
        employeeNo: s?.employeeNo ?? null,
        company: resolveCompanyName(s?.companyCode),
        department: null,
        section: null,
        roleCode: s?.roleCode ?? null,
        targetNumber: null,
        targetName: null,
        // 非浮水印動作（`AC-F13` ④）。
        watermarkSnapshot: null,
        occurredAt: now,
      });
    } catch (err) {
      if (err instanceof AuditTargetRefRequiredError) throw err;
      this.logger.error(
        `調閱歷程匯出稽核入列失敗（已吞，不阻斷匯出）: ${(err as Error)?.message}`,
      );
    }
  }
}
