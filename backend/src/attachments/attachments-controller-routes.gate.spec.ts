import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AttachmentsController } from './attachments.controller';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey, canPerform } from '../rbac/function-matrix';

/**
 * F020 `AC-D6` 🔴 共用附件下載端點之**閘門收斂** —— Lane L2。
 *
 * 權威：
 *  - F020 `AC-D6`（`GET /documents/attachments/download` 之閘門由 `下載列印文件 read` 收斂為
 *    **`ICSOP 文件管理` read**；`roleCode='User'`（business／other 皆然）一律 403 `PERMISSION_DENIED`，
 *    不核發任何短效期 URL、不回傳任何位元組、不寫稽核；SysAdmin／ICSOPAdmin／Supervisor／DeptContact
 *    **維持既有行為**）
 *  - architecture-spec §10.1「附帶硬化」＋ §10.15 盲區 #8：
 *    🔴「**須新增**一條 route-metadata 斷言把新閘門釘住，**否則這次收斂日後會被無聲改回**」
 *      （已查證既有 `attachments-controller-routes.spec.ts` **未斷言** `download` handler 之閘門）
 *  - F025 矩陣**逐格不變**（僅端點改綁既有功能列，未新增列、未改任何格值）
 *
 * ⚠ 對實作全盲：現況該 handler 掛的是 `DOCUMENT_DOWNLOAD_PRINT`，故本檔為**預期紅燈**。
 *
 * 🔒 本檔**不修改**既有 `attachments-controller-routes.spec.ts`（其兩案與本收斂無關，維持全綠）。
 */
describe('AttachmentsController — 共用下載端點閘門收斂（F020 AC-D6）', () => {
  const reflector = new Reflector();

  const downloadMeta = (): RequiredPermission =>
    reflector.get<RequiredPermission>(
      REQUIRE_PERMISSION_KEY,
      AttachmentsController.prototype.download,
    );

  it('AC-D6 `GET documents/attachments/download` 掛 RequirePermission(ICSOP_DOCUMENT_MANAGEMENT, read)', () => {
    const meta = downloadMeta();
    expect(meta.functionKey).toBe(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT);
    expect(meta.action).toBe('read');
  });

  it('AC-D6 該 handler **不再**掛 `下載列印文件`（DOCUMENT_DOWNLOAD_PRINT）—— 收斂之核心', () => {
    expect(downloadMeta().functionKey).not.toBe(FunctionKey.DOCUMENT_DOWNLOAD_PRINT);
  });

  it('AC-D6 路徑與方法不變（僅換閘門，不動路由字面）', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AttachmentsController.prototype.download),
    ).toBe('documents/attachments/download');
    expect(
      Reflect.getMetadata(METHOD_METADATA, AttachmentsController.prototype.download),
    ).toBe(RequestMethod.GET);
  });

  it('🔴 AC-D6 新閘門之逐角色解析：User 拒絕、其餘四個後台角色維持允許（與 AC-D4 所列四角色逐格吻合）', () => {
    const meta = downloadMeta();
    expect(canPerform('User', meta.functionKey, meta.action)).toBe(false);
    for (const role of ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact']) {
      expect(canPerform(role, meta.functionKey, meta.action)).toBe(true);
    }
  });

  it('🔒 舊閘門對 User 為允許 —— 本條記錄「為何非收斂不可」，並防止有人把閘門改回去', () => {
    // 若日後有人把 handler 改回 DOCUMENT_DOWNLOAD_PRINT，上面第 1、2、5 條會一起紅。
    expect(canPerform('User', FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')).toBe(true);
  });

  it('🔒 F025 矩陣逐格不變：三個上傳/列表 handler 之閘門維持 ICSOP_DOCUMENT_MANAGEMENT read', () => {
    for (const h of [
      AttachmentsController.prototype.listAttachments,
      AttachmentsController.prototype.uploadIcsopPdf,
      AttachmentsController.prototype.uploadOjt,
    ]) {
      const meta = reflector.get<RequiredPermission>(REQUIRE_PERMISSION_KEY, h);
      expect(meta.functionKey).toBe(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT);
      expect(meta.action).toBe('read');
    }
  });
});
