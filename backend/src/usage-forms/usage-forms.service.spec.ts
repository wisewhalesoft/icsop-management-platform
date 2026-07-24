import { UsageFormsService, USAGE_FORM_NAME_MAX_LENGTH } from './usage-forms.service';
import {
  AuditRecorder,
  CreateFormInput,
  FormPoolStore,
  UpdateFormFileInput,
  UsageFormAuditEvent,
  UsageFormRecord,
} from './usage-forms.store';
import { FakeBlobStore } from '../storage/fake-blob-store';
import { MAX_FILE_SIZE_BYTES } from '../storage/file-rules';
import { SessionContext, UploadFile } from '../attachments/attachments.service';

class FakeFormPoolStore implements FormPoolStore {
  seq = 1;
  forms: UsageFormRecord[] = [];
  links: { documentId: string; formId: string }[] = [];

  create(input: CreateFormInput) {
    const rec: UsageFormRecord = { id: `form-${this.seq++}`, ...input };
    this.forms.push(rec);
    return Promise.resolve(rec);
  }
  findById(formId: string) {
    return Promise.resolve(this.forms.find((f) => f.id === formId) ?? null);
  }
  list() {
    return Promise.resolve([...this.forms]);
  }
  listPoolOverview() {
    // 假體：documents 精簡欄以 documentId 充填（無 ICSOP_DOCUMENT 中繼；真實 join 於 TypeOrm store）。
    return Promise.resolve(
      this.forms.map((f) => {
        const docIds = this.links.filter((l) => l.formId === f.id).map((l) => l.documentId);
        return {
          ...f,
          docCount: docIds.length,
          documents: docIds.map((id) => ({ id, documentNumber: id, documentName: id })),
        };
      }),
    );
  }
  updateFile(formId: string, patch: UpdateFormFileInput) {
    const idx = this.forms.findIndex((f) => f.id === formId);
    const rec: UsageFormRecord = { ...this.forms[idx], ...patch };
    this.forms[idx] = rec;
    return Promise.resolve(rec);
  }
  delete(formId: string) {
    this.forms = this.forms.filter((f) => f.id !== formId);
    return Promise.resolve();
  }
  countLinks(formId: string) {
    return Promise.resolve(this.links.filter((l) => l.formId === formId).length);
  }
  listByDocument(documentId: string) {
    const ids = this.links.filter((l) => l.documentId === documentId).map((l) => l.formId);
    return Promise.resolve(this.forms.filter((f) => ids.includes(f.id)));
  }
  link(documentId: string, formId: string) {
    if (!this.links.some((l) => l.documentId === documentId && l.formId === formId)) {
      this.links.push({ documentId, formId });
    }
    return Promise.resolve();
  }
  unlink(documentId: string, formId: string) {
    this.links = this.links.filter(
      (l) => !(l.documentId === documentId && l.formId === formId),
    );
    return Promise.resolve();
  }
  unlinkAll(formId: string) {
    this.links = this.links.filter((l) => l.formId !== formId);
    return Promise.resolve();
  }

  /** 測試輔助：直接種入 N 份引用（不同 documentId）。 */
  seedLinks(formId: string, n: number) {
    for (let i = 0; i < n; i++) this.links.push({ documentId: `d${i}`, formId });
  }
}

class FakeAuditRecorder implements AuditRecorder {
  events: UsageFormAuditEvent[] = [];
  record(event: UsageFormAuditEvent) {
    this.events.push(event);
  }
}

const ICSOP_ADMIN: SessionContext = { roleCode: 'ICSOPAdmin', accountId: 'admin1' };
const USER: SessionContext = { roleCode: 'User', accountId: 'u1' };

const xlsx = (over: Partial<UploadFile> = {}): UploadFile => ({
  fileName: 'form.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 2048,
  ...over,
});

describe('UsageFormsService（F018 使用表單管理）', () => {
  let blob: FakeBlobStore;
  let store: FakeFormPoolStore;
  let audit: FakeAuditRecorder;
  let svc: UsageFormsService;
  beforeEach(() => {
    blob = new FakeBlobStore();
    store = new FakeFormPoolStore();
    audit = new FakeAuditRecorder();
    svc = new UsageFormsService(blob, store, audit);
  });

  describe('表單池上傳（建立）', () => {
    it('TS-001 ICSOPAdmin 上傳 excel → 建立池記錄、關聯數 0、顯示於清單', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      expect(rec.id).toMatch(/^form-/);
      expect(await store.countLinks(rec.id)).toBe(0);
      expect(await svc.listPool(ICSOP_ADMIN)).toHaveLength(1);
      expect(blob.putCalls).toHaveLength(1);
    });
    it('TS-002 上傳 pdf 表單 → 成功', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: 'form.pdf' }));
      expect(rec.format).toBe('pdf');
    });
    it('TS-003 上傳 .xls（非 .xlsx）→ 成功', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: 'form.xls' }));
      expect(rec.format).toBe('xls');
    });
    it('TS-004 一次多檔（xlsx/pdf/xls 皆合法）→ 全部成功，各自獨立記錄', async () => {
      const recs = await svc.uploadForms(ICSOP_ADMIN, [
        xlsx({ fileName: 'a.xlsx' }),
        xlsx({ fileName: 'b.pdf' }),
        xlsx({ fileName: 'c.xls' }),
      ]);
      expect(recs).toHaveLength(3);
      expect(new Set(recs.map((r) => r.id)).size).toBe(3);
      expect(store.forms).toHaveLength(3);
    });
  });

  /**
   * F018 使用表單自訂名稱（public-seams）：上傳時可帶 multipart 文字欄位 `name`。
   * 未提供／空字串／純空白 → fallback 檔名；有值 → trim 後採用。
   * 上限＝USAGE_FORM_POOL.name 之 nvarchar(400)，超出 → USAGE_FORM_NAME_TOO_LONG（400）。
   * 批次上傳與覆蓋上傳**刻意不接受** name（prototype 19 無對應 UI）。
   */
  describe('自訂表單名稱（name）', () => {
    it('TS-PS-F018-001 提供自訂名稱（不同於檔名）→ 以自訂名稱建立記錄', async () => {
      const rec = await svc.uploadForm(
        ICSOP_ADMIN,
        xlsx({ fileName: '放款覆核表.xlsx' }),
        '貸款覆核申請表',
      );
      expect(rec.name).toBe('貸款覆核申請表');
    });

    it('TS-PS-F018-002 未提供 name（undefined）→ fallback 檔名（既有行為回歸）', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: '放款覆核表.xlsx' }));
      expect(rec.name).toBe('放款覆核表.xlsx');
    });

    it('TS-PS-F018-003 name 為空字串 → 視為未提供，fallback 檔名', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: '放款覆核表.xlsx' }), '');
      expect(rec.name).toBe('放款覆核表.xlsx');
    });

    it('TS-PS-F018-004 name 為純空白 → trim 後為空 → fallback 檔名', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: '放款覆核表.xlsx' }), '   ');
      expect(rec.name).toBe('放款覆核表.xlsx');
    });

    it('TS-PS-F018-005 name 前後含空白 → 儲存值已 trim', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx(), ' 貸款覆核申請表 ');
      expect(rec.name).toBe('貸款覆核申請表');
    });

    it('TS-PS-F018-006 name 長度恰為 400（nvarchar(400) 邊界）→ 成功且完整保留', async () => {
      const name = 'あ'.repeat(USAGE_FORM_NAME_MAX_LENGTH);
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx(), name);
      expect(rec.name).toBe(name);
      expect(rec.name).toHaveLength(400);
    });

    it('TS-PS-F018-007 name 長度為 401 → USAGE_FORM_NAME_TOO_LONG（400），不建立、不寫 blob', async () => {
      blob.putCalls.length = 0;
      await expect(
        svc.uploadForm(ICSOP_ADMIN, xlsx(), 'あ'.repeat(USAGE_FORM_NAME_MAX_LENGTH + 1)),
      ).rejects.toThrow('USAGE_FORM_NAME_TOO_LONG');
      expect(store.forms).toHaveLength(0);
      expect(blob.putCalls).toHaveLength(0);
    });

    it('TS-PS-F018-007b 長度以 trim 後計算：前後空白不計入上限', async () => {
      const rec = await svc.uploadForm(
        ICSOP_ADMIN,
        xlsx(),
        `   ${'あ'.repeat(USAGE_FORM_NAME_MAX_LENGTH)}   `,
      );
      expect(rec.name).toHaveLength(400);
    });

    it('TS-PS-F018-008 批次上傳 → 不接受 name，各記錄沿用各自檔名', async () => {
      const recs = await svc.uploadForms(ICSOP_ADMIN, [
        xlsx({ fileName: 'a.xlsx' }),
        xlsx({ fileName: 'b.pdf' }),
        xlsx({ fileName: 'c.xls' }),
      ]);
      expect(recs.map((r) => r.name)).toEqual(['a.xlsx', 'b.pdf', 'c.xls']);
    });

    it('TS-PS-F018-009 覆蓋上傳不接受 name → 覆蓋後表單名稱維持原值', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: '進件申請書.xlsx' }));
      const updated = await svc.overwriteForm(
        ICSOP_ADMIN,
        f.id,
        xlsx({ fileName: '進件申請書_v2.xlsx' }),
      );
      expect(updated.name).toBe('進件申請書.xlsx'); // 檔名已換、表單名稱不變
      expect(updated.blobPath).not.toBe(f.blobPath);
    });

    it('TS-PS-F018-009b 名稱驗證不繞過 RBAC：無寫入權角色仍先卡權限', async () => {
      await expect(svc.uploadForm(USER, xlsx(), '合法名稱')).rejects.toThrow('PERMISSION_DENIED');
    });
  });

  describe('格式/大小驗證', () => {
    it('TS-005 非 excel/pdf（.docx）→ FILE_FORMAT_NOT_ALLOWED，不建立', async () => {
      await expect(svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: 'x.docx' }))).rejects.toThrow(
        'FILE_FORMAT_NOT_ALLOWED',
      );
      expect(store.forms).toHaveLength(0);
      expect(blob.putCalls).toHaveLength(0);
    });
    it('TS-006 恰 50MB → 成功', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ size: MAX_FILE_SIZE_BYTES }));
      expect(rec.size).toBe(MAX_FILE_SIZE_BYTES);
    });
    it('TS-007 超過 50MB → FILE_SIZE_EXCEEDED', async () => {
      await expect(
        svc.uploadForm(ICSOP_ADMIN, xlsx({ size: MAX_FILE_SIZE_BYTES + 1 })),
      ).rejects.toThrow('FILE_SIZE_EXCEEDED');
    });
  });

  describe('文件關聯（多對多）', () => {
    it('TS-008 自表單池多選關聯 2 個表單 → 2 筆關聯、各表單關聯數 +1', async () => {
      const f1 = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: 'a.xlsx' }));
      const f2 = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: 'b.xlsx' }));
      await svc.linkForms(ICSOP_ADMIN, 'doc-1', [f1.id, f2.id]);
      expect(await store.countLinks(f1.id)).toBe(1);
      expect(await store.countLinks(f2.id)).toBe(1);
      expect(await svc.listFormsByDocument('doc-1')).toHaveLength(2);
    });
    it('TS-009 解除單一關聯 → 該關聯移除、其餘不受影響、表單仍存於池', async () => {
      const forms = await svc.uploadForms(ICSOP_ADMIN, [
        xlsx({ fileName: 'a.xlsx' }),
        xlsx({ fileName: 'b.xlsx' }),
        xlsx({ fileName: 'c.xlsx' }),
      ]);
      await svc.linkForms(ICSOP_ADMIN, 'doc-1', forms.map((f) => f.id));
      await svc.unlinkForm(ICSOP_ADMIN, 'doc-1', forms[0].id);
      expect(await svc.listFormsByDocument('doc-1')).toHaveLength(2);
      expect(await store.findById(forms[0].id)).not.toBeNull(); // 仍存於池
    });
  });

  describe('詳情頁呈現', () => {
    it('TS-010 3 個關聯表單 → 詳情回傳 3 筆（含名稱/格式）', async () => {
      const forms = await svc.uploadForms(ICSOP_ADMIN, [
        xlsx({ fileName: 'a.xlsx' }),
        xlsx({ fileName: 'b.pdf' }),
        xlsx({ fileName: 'c.xls' }),
      ]);
      await svc.linkForms(ICSOP_ADMIN, 'doc-1', forms.map((f) => f.id));
      const list = await svc.listFormsByDocument('doc-1');
      expect(list).toHaveLength(3);
      expect(list.map((f) => f.format).sort()).toEqual(['pdf', 'xls', 'xlsx']);
    });
    it('TS-011 無關聯表單 → 空陣列（非錯誤）', async () => {
      expect(await svc.listFormsByDocument('doc-empty')).toEqual([]);
    });
    it('TS-012 前後台共用同一 API → 內容一致', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      await svc.linkForms(ICSOP_ADMIN, 'doc-1', [f.id]);
      const a = await svc.listFormsByDocument('doc-1');
      const b = await svc.listFormsByDocument('doc-1');
      expect(a).toEqual(b);
    });
  });

  describe('下載與稽核', () => {
    it('TS-013 前台下載成功 → 核發憑證 + 稽核參數正確', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      await svc.linkForms(ICSOP_ADMIN, 'doc-1', [f.id]);
      const grant = await svc.downloadForm(USER, 'doc-1', f.id);
      expect(grant.url).toContain(f.blobPath);
      expect(audit.events).toEqual([
        {
          targetType: 'USAGE_FORM',
          actionType: 'DOWNLOAD',
          formId: f.id,
          documentId: 'doc-1',
          accountId: 'u1',
        },
      ]);
    });
    it('TS-014 未登入下載 → FILE_ACCESS_DENIED，不核發、不稽核', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      await expect(svc.downloadForm(undefined, 'doc-1', f.id)).rejects.toThrow('FILE_ACCESS_DENIED');
      await expect(svc.downloadForm({ roleCode: 'User' }, 'doc-1', f.id)).rejects.toThrow(
        'FILE_ACCESS_DENIED',
      );
      expect(blob.urlCalls).toHaveLength(0);
      expect(audit.events).toHaveLength(0);
    });
  });

  describe('覆蓋上傳（跨文件引用警示）', () => {
    it('TS-015 被 0 份引用覆蓋 → 直接成功、無 USAGE_FORM_OVERWRITE_SHARED', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: 'v1.xlsx' }));
      const updated = await svc.overwriteForm(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' }));
      expect(updated.blobPath).not.toBe(f.blobPath);
    });
    it('TS-016 恰被 1 份引用覆蓋 → 直接成功、不觸發警示', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      store.seedLinks(f.id, 1);
      await expect(svc.overwriteForm(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' }))).resolves.toBeDefined();
    });
    it('TS-017 恰被 2 份引用覆蓋 → USAGE_FORM_OVERWRITE_SHARED（含 N=2），未寫入', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      store.seedLinks(f.id, 2);
      blob.putCalls.length = 0;
      await expect(
        svc.overwriteForm(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' })),
      ).rejects.toThrow(/USAGE_FORM_OVERWRITE_SHARED.*2/);
      expect(blob.putCalls).toHaveLength(0);
    });
    it('TS-018 被 5 份引用、二次確認覆蓋 → 成功、全部引用同步新檔、舊 blob 回收', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: 'v1.xlsx' }));
      store.seedLinks(f.id, 5);
      const old = f.blobPath;
      const updated = await svc.overwriteForm(
        ICSOP_ADMIN,
        f.id,
        xlsx({ fileName: 'v2.xlsx' }),
        { confirmed: true },
      );
      expect(updated.blobPath).not.toBe(old);
      expect(blob.deleteCalls).toContain(old);
      // 5 份引用文件皆透過關聯查得同一（新）表單。
      expect((await store.findById(f.id))?.blobPath).toBe(updated.blobPath);
    });
    it('TS-019 覆蓋警示後取消（未確認）→ 原檔不變、put 未被呼叫', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      store.seedLinks(f.id, 3);
      blob.putCalls.length = 0;
      await expect(svc.overwriteForm(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' }))).rejects.toThrow(
        'USAGE_FORM_OVERWRITE_SHARED',
      );
      expect(blob.putCalls).toHaveLength(0);
      expect((await store.findById(f.id))?.blobPath).toBe(f.blobPath);
    });
    it('TS-020 覆蓋新檔格式不合法 → FILE_FORMAT_NOT_ALLOWED（先於引用數判斷）', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      store.seedLinks(f.id, 3);
      await expect(
        svc.overwriteForm(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.docx' })),
      ).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
      expect((await store.findById(f.id))?.blobPath).toBe(f.blobPath);
    });
  });

  describe('移除保護（USAGE_FORM_IN_USE）', () => {
    it('TS-021 被 0 份引用刪除 → 成功刪除', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      await svc.deleteForm(ICSOP_ADMIN, f.id);
      expect(await store.findById(f.id)).toBeNull();
      expect(blob.deleteCalls).toContain(f.blobPath);
    });
    it('TS-022 被 3 份引用刪除未確認 → USAGE_FORM_IN_USE（N=3）；確認後解除全部關聯並刪除', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      store.seedLinks(f.id, 3);
      await expect(svc.deleteForm(ICSOP_ADMIN, f.id)).rejects.toThrow(/USAGE_FORM_IN_USE.*3/);
      expect(await store.findById(f.id)).not.toBeNull(); // 未刪
      await svc.deleteForm(ICSOP_ADMIN, f.id, { confirmed: true });
      expect(await store.findById(f.id)).toBeNull();
      expect(await store.countLinks(f.id)).toBe(0); // 全部關聯解除
    });
    it('TS-023 移除確認彈窗取消（未確認）→ 表單保留、關聯不受影響', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      store.seedLinks(f.id, 2);
      await expect(svc.deleteForm(ICSOP_ADMIN, f.id)).rejects.toThrow('USAGE_FORM_IN_USE');
      expect(await store.findById(f.id)).not.toBeNull();
      expect(await store.countLinks(f.id)).toBe(2);
    });
  });

  describe('表單池總覽（管理頁 prototype 19）', () => {
    it('TS-031 listPoolOverview → 每筆附 docCount 與關聯文件清單（read gate）', async () => {
      const f1 = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: 'a.xlsx' }));
      const f2 = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: 'b.xlsx' }));
      await svc.linkForms(ICSOP_ADMIN, 'doc-1', [f1.id]);
      await svc.linkForms(ICSOP_ADMIN, 'doc-2', [f1.id]);
      const overview = await svc.listPoolOverview(ICSOP_ADMIN);
      const o1 = overview.find((o) => o.id === f1.id)!;
      const o2 = overview.find((o) => o.id === f2.id)!;
      expect(o1.docCount).toBe(2);
      expect(o1.documents.map((d) => d.id).sort()).toEqual(['doc-1', 'doc-2']);
      expect(o2.docCount).toBe(0);
      expect(o2.documents).toEqual([]);
    });
    it('TS-032 主管（功能=無）呼叫總覽 → PERMISSION_DENIED', async () => {
      const sup: SessionContext = { roleCode: 'Supervisor', accountId: 'x' };
      await expect(svc.listPoolOverview(sup)).rejects.toThrow('PERMISSION_DENIED');
    });
    it('TS-033 後台個別下載：ICSOPAdmin/SysAdmin 核發 URL、主管 PERMISSION_DENIED', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      const sys: SessionContext = { roleCode: 'SysAdmin', accountId: 's1' };
      const g1 = await svc.downloadFromPool(ICSOP_ADMIN, f.id);
      expect(g1.url).toContain(f.blobPath);
      const g2 = await svc.downloadFromPool(sys, f.id); // 唯讀角色亦可下載
      expect(g2.url).toContain(f.blobPath);
      await expect(
        svc.downloadFromPool({ roleCode: 'Supervisor', accountId: 'x' }, f.id),
      ).rejects.toThrow('PERMISSION_DENIED');
    });
  });

  describe('RBAC（功能面）', () => {
    it('TS-024 ICSOPAdmin CRUD 全允許', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      await expect(svc.listPool(ICSOP_ADMIN)).resolves.toBeDefined();
      await expect(svc.overwriteForm(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' }))).resolves.toBeDefined();
      await expect(svc.deleteForm(ICSOP_ADMIN, f.id)).resolves.toBeUndefined();
    });
    it('TS-025 系統管理員：查詢允許、寫入 → FIELD_WRITE_FORBIDDEN', async () => {
      const sys: SessionContext = { roleCode: 'SysAdmin', accountId: 's1' };
      await expect(svc.listPool(sys)).resolves.toBeDefined(); // READ 可查
      await expect(svc.uploadForm(sys, xlsx())).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
    });
    it.each([
      ['TS-026 主管', 'Supervisor'],
      ['TS-027 部門窗口', 'DeptContact'],
      ['TS-028 一般使用者', 'User'],
    ])('%s：查詢與寫入皆 PERMISSION_DENIED（功能=無）', async (_label, roleCode) => {
      const s: SessionContext = { roleCode, accountId: 'x' };
      await expect(svc.listPool(s)).rejects.toThrow('PERMISSION_DENIED');
      await expect(svc.uploadForm(s, xlsx())).rejects.toThrow('PERMISSION_DENIED');
    });
  });

  describe('操作記錄', () => {
    it('TS-030 上傳/覆蓋記錄 uploadedBy/uploadedAt', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      expect(f.uploadedBy).toBe('admin1');
      expect(f.uploadedAt).toBeInstanceOf(Date);
      const u = await svc.overwriteForm(
        { roleCode: 'ICSOPAdmin', accountId: 'admin2' },
        f.id,
        xlsx({ fileName: 'v2.xlsx' }),
      );
      expect(u.uploadedBy).toBe('admin2');
      expect(u.uploadedAt).toBeInstanceOf(Date);
    });
  });
});
