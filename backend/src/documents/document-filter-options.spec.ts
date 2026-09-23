import { ForbiddenException } from '@nestjs/common';
import { AppendicesController } from '../appendices/appendices.controller';
import { UsageFormsController } from '../usage-forms/usage-forms.controller';
import { REQUIRE_PERMISSION_KEY } from '../rbac/require-permission.decorator';
import { AppendicesService } from '../appendices/appendices.service';
import { UsageFormsService } from '../usage-forms/usage-forms.service';
import { canPerform, FunctionKey } from '../rbac/function-matrix';

/**
 * 🔵 2026-09-23 使用者回報：主管無法以「附錄」「使用表單」篩選 ICSOP 文件管理清單。
 * 根因＝選項取自附錄／使用表單**管理**端點（主管／部門窗口為 NONE）⇒ 403 被前端靜默吞成空選項。
 * 本檔鎖定新選項端點之兩件事：
 *  ① 閘門＝**清單頁之進入條件**（ICSOP_DOCUMENT_MANAGEMENT read）——凡能開清單者皆拿得到選項；
 *  ② 只投影選項所需欄位（開放的是「能篩選」，不是「能看池」）。
 */
const appendix = {
  id: 'apx1', name: '附錄甲', blobPath: 'secret/apx1.xlsx', format: 'xlsx', size: 1,
  uploadedBy: 'acc-9', uploadedAt: new Date('2026-01-01'),
};
const form = {
  id: 'uf1', name: '申請書', formNumber: 'F-001', blobPath: 'secret/uf1.pdf', format: 'pdf',
  size: 1, uploadedBy: 'acc-9', uploadedAt: new Date('2026-01-01'),
};
const appendixSvc = () =>
  new AppendicesService({} as never, { list: async () => [appendix] } as never, {} as never, {} as never);
const formSvc = () =>
  new UsageFormsService({} as never, { list: async () => [form] } as never, {} as never);

const ROLES = ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact', 'User'];

describe('文件管理清單之附錄／使用表單篩選選項（2026-09-23）', () => {
  it.each(ROLES)('%s：可否取得選項 ≡ 可否讀取文件管理清單', async (roleCode) => {
    const canList = canPerform(roleCode, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read');
    const a = appendixSvc().listFilterOptions({ roleCode } as never);
    const f = formSvc().listFilterOptions({ roleCode } as never);
    if (canList) {
      await expect(a).resolves.toHaveLength(1);
      await expect(f).resolves.toHaveLength(1);
    } else {
      await expect(a).rejects.toBeInstanceOf(ForbiddenException);
      await expect(f).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('語料鑑別力：主管與部門窗口對兩個管理功能皆無讀取權（否則上案對原 bug 無鑑別力）', () => {
    for (const r of ['Supervisor', 'DeptContact']) {
      expect(canPerform(r, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')).toBe(true);
      expect(canPerform(r, FunctionKey.APPENDIX_MANAGEMENT, 'read')).toBe(false);
      expect(canPerform(r, FunctionKey.USAGE_FORM_MANAGEMENT, 'read')).toBe(false);
    }
  });

  it('只投影選項所需欄位（不含 blobPath／上傳者等管理資訊）', async () => {
    const s = { roleCode: 'Supervisor' } as never;
    await expect(appendixSvc().listFilterOptions(s)).resolves.toEqual([{ id: 'apx1', name: '附錄甲' }]);
    await expect(formSvc().listFilterOptions(s)).resolves.toEqual([
      { id: 'uf1', name: '申請書', formNumber: 'F-001' },
    ]);
  });
});

describe('選項端點之路由閘門（2026-09-23）', () => {
  it('兩個 filter-options 路由皆以 ICSOP_DOCUMENT_MANAGEMENT read 把關（非各自之管理功能鍵）', () => {
    for (const handler of [
      AppendicesController.prototype.listFilterOptions,
      UsageFormsController.prototype.listFilterOptions,
    ]) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual({
        functionKey: FunctionKey.ICSOP_DOCUMENT_MANAGEMENT,
        action: 'read',
      });
    }
  });
});
