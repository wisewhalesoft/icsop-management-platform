import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AttachmentsController } from './attachments.controller';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * A 節新端點上線前之最低防線（比照 documents-controller-routes.spec）：
 * 以 Reflector 讀取實際套於 handler 之 metadata，確認 RBAC 裝飾正確
 * ＋新路由不與既有兩個上傳路由互相遮蔽（等價於 e2e router 斷言）。
 */
describe('AttachmentsController 路由/RBAC metadata（A 附件列表）', () => {
  const reflector = new Reflector();

  it('TS-A-008 GET admin/documents/:documentId/attachments 掛載 RequirePermission(ICSOP_DOCUMENT_MANAGEMENT, read)', () => {
    const meta = reflector.get<RequiredPermission>(
      REQUIRE_PERMISSION_KEY,
      AttachmentsController.prototype.listAttachments,
    );
    expect(meta.functionKey).toBe(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT);
    expect(meta.action).toBe('read');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AttachmentsController.prototype.listAttachments,
      ),
    ).toBe(RequestMethod.GET);
  });

  it('TS-A-009 既有上傳路由（ICSOP PDF）之路徑/方法未受本 delta 影響', () => {
    const p = (h: unknown) => Reflect.getMetadata(PATH_METADATA, h as object);
    const listPath = p(AttachmentsController.prototype.listAttachments);
    const pdfPath = p(AttachmentsController.prototype.uploadIcsopPdf);

    expect(listPath).toBe('admin/documents/:documentId/attachments');
    expect(pdfPath).toBe('admin/documents/:documentId/attachments/icsop-pdf');
    expect(new Set([listPath, pdfPath]).size).toBe(2);

    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AttachmentsController.prototype.uploadIcsopPdf,
      ),
    ).toBe(RequestMethod.POST);
  });

  /**
   * 🔴 F042 E11 delta（2026-08-27／28；`OQ-E11-11`→A）：舊端點
   * `POST /admin/documents/:documentId/attachments/ojt`（即 `AttachmentsController.uploadOjt`）
   * **直接移除、回 404**（非 403、非 410）。權威：
   * docs/specs/features/F016-pdf-ojt-attachment.md#ojt-progress-supersede-delta `AC-J2`。
   *
   * 📌 可測形狀（`AC-J2` 明文）：「路由表中不存在該路徑」——本測試以 Reflector 直接斷言
   * `AttachmentsController.prototype` 已無 `uploadOjt` handler；NestJS 之路由表由
   * `@Controller`／方法層 `@Post` 等裝飾器於啟動期組裝，handler 不存在即該路徑**不可能**被路由
   * 命中，任何角色呼叫皆會落至 NestJS 預設之 404（不經過 RBAC guard，因為根本沒有 handler 可比對）。
   *
   * ⚠ **本檔刻意不另外以五種角色各自發起 HTTP 呼叫斷言「回 404」**：一旦 handler 不存在，
   * 404 是 Express／Nest 路由機制之**必然**結果、與角色完全無關（guard 根本不會被觸發）——
   * 五案重複驗證的只會是同一件事（框架本身的預設行為），而非任何本 feature 之業務邏輯，
   * 屬刻意精簡、非覆蓋率缺口。
   */
  it('AC-J2 舊端點已移除：AttachmentsController 不再有 uploadOjt handler（路由表中不存在該路徑）', () => {
    expect((AttachmentsController.prototype as any).uploadOjt).toBeUndefined();
  });
});
