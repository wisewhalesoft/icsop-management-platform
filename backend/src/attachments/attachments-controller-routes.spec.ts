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

  it('TS-A-009 新路由與既有兩個上傳路由之路徑字面/方法皆不同（不互相遮蔽）', () => {
    const p = (h: unknown) => Reflect.getMetadata(PATH_METADATA, h as object);
    const listPath = p(AttachmentsController.prototype.listAttachments);
    const pdfPath = p(AttachmentsController.prototype.uploadIcsopPdf);
    const ojtPath = p(AttachmentsController.prototype.uploadOjt);

    expect(listPath).toBe('admin/documents/:documentId/attachments');
    expect(pdfPath).toBe('admin/documents/:documentId/attachments/icsop-pdf');
    expect(ojtPath).toBe('admin/documents/:documentId/attachments/ojt');
    expect(new Set([listPath, pdfPath, ojtPath]).size).toBe(3);

    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AttachmentsController.prototype.uploadIcsopPdf,
      ),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(METHOD_METADATA, AttachmentsController.prototype.uploadOjt),
    ).toBe(RequestMethod.POST);
  });
});
