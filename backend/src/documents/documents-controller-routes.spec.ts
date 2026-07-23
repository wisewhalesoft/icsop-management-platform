import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { DocumentsController } from './documents.controller';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * F011 新端點上線前之最低防線：以 Reflector 讀取實際套於 handler 之 metadata，
 * 確認 RBAC 裝飾正確 + 新路由不與既有路由互相遮蔽（等價於 e2e router 斷言）。
 */
describe('DocumentsController 路由/RBAC metadata（F011）', () => {
  const reflector = new Reflector();

  it('TS-F011-021 PATCH :id 正確掛載 RequirePermission(ICSOP_DOCUMENT_MANAGEMENT, write)', () => {
    const meta = reflector.get<RequiredPermission>(
      REQUIRE_PERMISSION_KEY,
      DocumentsController.prototype.update,
    );
    expect(meta.functionKey).toBe(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT);
    expect(meta.action).toBe('write');
  });

  it('GET :id 掛載 RequirePermission(ICSOP_DOCUMENT_MANAGEMENT, read)', () => {
    const meta = reflector.get<RequiredPermission>(
      REQUIRE_PERMISSION_KEY,
      DocumentsController.prototype.getOne,
    );
    expect(meta.functionKey).toBe(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT);
    expect(meta.action).toBe('read');
  });

  it('PATCH :id 與 PATCH :id/status 路徑字面不同（不互相遮蔽）', () => {
    const editPath = Reflect.getMetadata(
      PATH_METADATA,
      DocumentsController.prototype.update,
    );
    const statusPath = Reflect.getMetadata(
      PATH_METADATA,
      DocumentsController.prototype.setStatus,
    );
    expect(editPath).toBe(':id');
    expect(statusPath).toBe(':id/status');
    expect(editPath).not.toBe(statusPath);
    expect(
      Reflect.getMetadata(METHOD_METADATA, DocumentsController.prototype.update),
    ).toBe(RequestMethod.PATCH);
  });

  it('GET :id 與 GET / 列表路徑字面不同（不互相遮蔽）', () => {
    const oneP = Reflect.getMetadata(
      PATH_METADATA,
      DocumentsController.prototype.getOne,
    );
    const listP = Reflect.getMetadata(
      PATH_METADATA,
      DocumentsController.prototype.list,
    );
    expect(oneP).toBe(':id');
    expect(listP).toBe('/');
    expect(oneP).not.toBe(listP);
  });
});
