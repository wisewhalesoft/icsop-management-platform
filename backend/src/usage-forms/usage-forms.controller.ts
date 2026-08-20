import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UsageFormsService } from './usage-forms.service';
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

const isTrue = (v?: string) => /^(true|1|yes)$/i.test(v ?? '');

/**
 * 🔴 `AC-N43`／architecture-spec §11.10(b)：multipart 之制定部門欄位為**純文字 JSON 陣列字串**
 * （如 `'["JA000","KB000"]'`）。
 *
 * **為何不採「同名欄位重複出現」**：multipart 對重複欄位名之陣列化行為依賴 body-parser 之實作
 * 細節（multer 對非檔案欄位之陣列化並非所有設定下皆一致）；JSON 字串化是顯式、無歧義、跨
 * multer 版本穩定的作法。
 *
 * 未送出 → `undefined`（＝不觸碰關聯表，與「送出空陣列＝清空」語意不同）；
 * 送出但非合法 JSON 陣列 → 視為空陣列（不因客戶端送壞值而 500；正規化仍由 service 負責）。
 */
function parseDraftingDeptCodes(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

/**
 * F018 使用表單管理。守門鏈 SessionGuard→RolePermissionGuard。
 * 寫入路由要求 `read`（G 定案：唯讀角色卡欄位層 FIELD_WRITE_FORBIDDEN、無存取角色路由層 PERMISSION_DENIED）。
 * 前台詳情表單清單/下載屬文件瀏覽/下載列印（全角色 READ）。
 *
 * 上傳為 multipart/form-data；池上傳支援多檔（欄位名 `files`），覆蓋為單檔（欄位名 `file`）。
 *
 * ⚠ 服務層回 `Promise<void>` 之路由一律標 `@HttpCode(204)`：不標則 Nest 回「200/201 + 空 body」，
 * 前端 `apiFetch` 對空 body 呼叫 `res.json()` 會拋 SyntaxError，使已成功之寫入被當成失敗
 * （建立文件時更會中斷後續步驟：附錄關聯與連結點被整段跳過）。詳見 AppendicesController 同段註記。
 */
@Controller()
@UseGuards(SessionGuard, RolePermissionGuard)
export class UsageFormsController {
  constructor(private readonly svc: UsageFormsService) {}

  // ── 表單池管理（後台）──
  @Get('admin/usage-forms')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  listPool(@Req() req: RequestWithSession) {
    return this.svc.listPool(req.sessionUser);
  }

  /** 表單池總覽（每筆附關聯文件數 + 關聯文件精簡清單；供管理頁 prototype 19）。 */
  @Get('admin/usage-forms/overview')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  listPoolOverview(@Req() req: RequestWithSession) {
    return this.svc.listPoolOverview(req.sessionUser);
  }

  @Post('admin/usage-forms')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  @UseInterceptors(FilesInterceptor('files', 20, MULTIPART_OPTIONS))
  upload(
    @Req() req: RequestWithSession,
    @UploadedFiles() files: MulterUploadedFile[],
    @Body('name') name?: string,
    @Body('formNumber') formNumber?: string,
    @Body('draftingDeptCodes') draftingDeptCodes?: string,
  ) {
    const uploads = (files ?? []).map(toUploadFile);
    // 多檔 → uploadForms（先全部驗證再全部建立，避免部分寫入；不接受 name/formNumber
    // ——prototype 19 之 fileInput 無 multiple，UI 無逐檔命名/編號之驗收依據）。
    if (uploads.length !== 1) return this.svc.uploadForms(req.sessionUser, uploads);
    const depts = parseDraftingDeptCodes(draftingDeptCodes);
    // 單檔 → uploadForm。`formNumber`／`draftingDeptCodes` 僅在客戶端**確實送出**時才轉發
    // （未送 ≠ 送 undefined），使既有呼叫形狀不因本 delta 改變。
    if (formNumber === undefined && depts === undefined) {
      return this.svc.uploadForm(req.sessionUser, uploads[0], name);
    }
    return this.svc.uploadForm(req.sessionUser, uploads[0], name, formNumber ?? null, depts);
  }

  /**
   * F018 編輯頁 metadata 端點（🔴 D9 delta `AC-N48`／architecture-spec §11.10(b)）：
   * **`PATCH /admin/usage-forms/:formId`**。
   *
   * 📝 **被推翻之路由字面逐字保留供追溯**：OLD> `PATCH admin/usage-forms/:formId/number`（`AC-D3`）。
   * **推翻理由**：`AC-N41` 明訂「編輯編號」modal 由獨立整頁取代，該頁範圍已擴大為
   * 「表單編號＋制定部門」兩項 metadata，端點路徑隨之擴大、移除 `/number` 尾段。
   * 本端點之唯一呼叫端正是被取代的那個 modal ⇒ 擴大端點形狀無外部相容性代價。
   *
   * 🔴 body **只接受 `{ formNumber?, draftingDeptCodes? }` 兩鍵**——`AC-D20`／`AC-N49` 之
   * 「六欄未變、Blob 未讀未寫」由 body 形狀本身保證最強：service 收不到檔案，就不可能碰檔案。
   * 其餘鍵（含意圖夾帶 `name`／`blobPath`／`size` 者）一律**忽略且不報錯**。
   * 🔴 以 `'key' in body` 逐鍵挑選而非整個 body 轉發：**「未帶鍵」與「帶鍵但值為 null／空陣列」
   * 語意不同**（前者＝不動該項，後者＝顯式清空），照抄整個 body 會讓惡意鍵一併流入 service。
   * 🔴 與覆蓋上傳（`PUT admin/usage-forms/:formId`，multipart）為兩條不同路徑，不共用 handler
   * （HTTP 方法不同：PATCH vs PUT）。
   * 回 200 ＋更新後之該列（不用 204——前端需其值重繪該列，否則得重查整張清單）。
   */
  @Patch('admin/usage-forms/:formId')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  updateNumber(
    @Req() req: RequestWithSession,
    @Param('formId') formId: string,
    @Body() body: { formNumber?: string | null; draftingDeptCodes?: string[] },
  ) {
    const patch: { formNumber?: string | null; draftingDeptCodes?: string[] } = {};
    if (body && 'formNumber' in body) patch.formNumber = body.formNumber ?? null;
    if (body && 'draftingDeptCodes' in body) {
      patch.draftingDeptCodes = body.draftingDeptCodes ?? [];
    }
    return this.svc.updateFormMetadata(req.sessionUser, formId, patch);
  }

  @Put('admin/usage-forms/:formId')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  @UseInterceptors(FileInterceptor('file', MULTIPART_OPTIONS))
  overwrite(
    @Req() req: RequestWithSession,
    @Param('formId') formId: string,
    @UploadedFile() file: MulterUploadedFile,
    @Query('confirmed') confirmed?: string,
  ) {
    return this.svc.overwriteForm(req.sessionUser, formId, toUploadFile(file), {
      confirmed: isTrue(confirmed),
    });
  }

  /**
   * 後台表單池個別下載（read gate）。
   * 🔴 2026-08-17：由核發 SAS 改為**代理串流**（F020 `AC-D3a` 後台側修訂）——原作法之
   * `window.open(sasUrl)` 導覽至 `*.blob.core.windows.net`，Chrome Safe Browsing 出示
   * 「偵測到危險網站」攔截頁。RAW、不寫稽核之語意（`AC-D4`）未動。
   */
  @Get('admin/usage-forms/:formId/download')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  async downloadFromPool(
    @Req() req: RequestWithSession,
    @Param('formId') formId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, fileName, contentType } = await this.svc.downloadFromPool(
      req.sessionUser,
      formId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', attachmentDisposition(fileName));
    res.send(bytes);
  }

  @Delete('admin/usage-forms/:formId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  remove(
    @Req() req: RequestWithSession,
    @Param('formId') formId: string,
    @Query('confirmed') confirmed?: string,
  ) {
    return this.svc.deleteForm(req.sessionUser, formId, {
      confirmed: isTrue(confirmed),
    });
  }

  // ── 文件關聯（多對多）──
  @Post('admin/documents/:documentId/usage-forms')
  @HttpCode(204)
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  link(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: { formIds: string[] },
  ) {
    return this.svc.linkForms(req.sessionUser, documentId, body?.formIds ?? []);
  }

  @Delete('admin/documents/:documentId/usage-forms/:formId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  unlink(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('formId') formId: string,
  ) {
    return this.svc.unlinkForm(req.sessionUser, documentId, formId);
  }

  // ── 前後台共用詳情清單 + 下載 ──
  @Get('documents/:documentId/usage-forms')
  @RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
  listByDocument(@Param('documentId') documentId: string) {
    return this.svc.listFormsByDocument(documentId);
  }

  /**
   * F018 `AC-D22` 後台側：**RAW、不寫稽核**（管理端存取）。
   * 閘門維持 `下載列印文件` read（Supervisor／DeptContact 亦須可下載，見 `AC-D22` ⚠）。
   * 呼叫端＝後台唯讀詳情頁 `DocumentReadonlyPage`。
   *
   * 🔴 2026-08-17：由回 `{ url }` 短效期 SAS 改為**代理串流**（F020 `AC-D3a` 後台側修訂）。
   * ⚠ 與同檔前台端點之差別**只剩燒錄與稽核**（前台燒、後台不燒；前台寫稽核、後台不寫），
   * 傳輸模式已一致——但兩者**仍為兩條 route、兩支方法**，因為那兩項差異本身不可共用。
   */
  @Get('documents/:documentId/usage-forms/:formId/download')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  async download(
    @Req() req: RequestWithSession,
    // 🔴 §11.6 v1.9a：原宣告為 `_documentId`（底線前綴、宣告後從未使用）——`AC-N17` 要求本路徑
    // 之稽核列 `documentId` 必填落值，故改回正常具名並一併傳入 service。舊 docblock 之理由
    // 「documentId 不參與查找」在「RAW／不寫稽核」之舊語意下成立，該前提已被 `AC-N14` 推翻。
    @Param('documentId') documentId: string,
    @Param('formId') formId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, fileName, contentType } = await this.svc.downloadFormRaw(
      req.sessionUser,
      documentId,
      formId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', attachmentDisposition(fileName));
    res.send(bytes);
  }

  /**
   * F018 `AC-D22` 前台側（新增）：代理串流之檔案位元組——PDF 已燒錄（`AC-D11`）、
   * 非 PDF 原檔（`AC-D12` 策略 A）、寫入 `targetType='USAGE_FORM'` 之調閱稽核（`AC-D14`）。
   * 三者皆由 `svc.downloadForm()` 完成（其行為未因本次分流而改變），本層只負責標頭與送出。
   *
   * 🔴 路徑置於 `/public/...` 命名空間＝與 F020 `AC-D8` 之附件端點同型（architecture-spec §10.1）；
   * **不得**改採 `/admin/...`——那條之閘門為 `使用表單管理`，Supervisor／DeptContact 會吃 403。
   */
  @Get('public/documents/:documentId/usage-forms/:formId/download')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  async downloadUsageFormPublic(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('formId') formId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, fileName, contentType } = await this.svc.downloadForm(
      req.sessionUser,
      documentId,
      formId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', attachmentDisposition(fileName));
    res.send(bytes);
  }
}
