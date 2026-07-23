import { ForbiddenException } from '@nestjs/common';
import { canPerform } from '../rbac/function-matrix';
import { canWriteField } from '../rbac/field-matrix';

/**
 * 文件檔案資產（附件 F016 / .xls 原件 F027 / 使用表單 F018）寫入之共用兩道授權閘門
 * （G/OQ-F016-01 定案，跨 F016/F018/F027 一致）：
 *   1) 功能面 canPerform(role, functionKey, 'read')＝false → PERMISSION_DENIED
 *      （矩陣為「無」之角色；路由層亦以 @RequirePermission(fnKey,'read') 擋下）。
 *   2) 欄位面 canWriteField(role, fieldKey)≠WRITABLE → FIELD_WRITE_FORBIDDEN
 *      （矩陣為「唯讀」之角色：可讀不可寫，寫入決策下放欄位層）。
 * 兩者分流使唯讀角色（讀→FIELD_WRITE_FORBIDDEN）與無存取角色（→PERMISSION_DENIED）得以區分。
 */
export function assertCanWriteDocumentAsset(
  roleCode: string | undefined,
  functionKey: string,
  fieldKey: string,
): void {
  if (!canPerform(roleCode, functionKey, 'read')) {
    throw new ForbiddenException('PERMISSION_DENIED');
  }
  if (canWriteField(roleCode, fieldKey) !== 'WRITABLE') {
    throw new ForbiddenException('FIELD_WRITE_FORBIDDEN');
  }
}
