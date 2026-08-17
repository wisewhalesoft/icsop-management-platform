import { UsageFormsService } from './usage-forms.service';
import {
  AuditRecorder,
  CreateFormInput,
  FormPoolStore,
  UpdateFormFileInput,
  UsageFormAuditEvent,
  UsageFormRecord,
} from './usage-forms.store';
import { FakeBlobStore } from '../storage/fake-blob-store';
import { SessionContext, UploadFile } from '../attachments/attachments.service';

/**
 * L7 · F018 表單編號 delta（`AC-D2`～`AC-D7`）＋「編輯編號」動作（`AC-D17`～`AC-D20`）。
 *
 * 權威＝`docs/specs/features/F018-usage-form-management.md` §表單編號 delta ＋ §「編輯編號」動作
 *      ＋ `docs/specs/error-handling.md#usage-form-number`
 *      ＋ `docs/specs/architecture-spec.md` §10.7 決策 A7 與 A14。
 *
 * 🔴 §10.15 第 7 項（原理上測不到）：`formNumber` 之**大小寫不敏感是 DB collation 的行為**。
 *   本檔之記憶體 fake store 以正規化比對，**即使真 DB 為 `_CS_` 亦全綠**。
 *   ⇒ 本檔只證明「服務層自己有做不分大小寫之比對」，**不證明** DB 層擋得住。
 *      真 DB 之兩案（`FM-001` vs `fm-001` 衝突／兩筆 `NULL` 可並存）列入交付物 ③ (乙)。
 */
class FakeFormPoolStore implements FormPoolStore {
  seq = 1;
  forms: UsageFormRecord[] = [];
  links: { documentId: string; formId: string }[] = [];
  /** AC-D20：本旗標若被觸發即代表走了檔案覆蓋路徑。 */
  updateFileCalls: string[] = [];
  updateNumberCalls: { formId: string; formNumber: string | null }[] = [];

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
    this.updateFileCalls.push(formId);
    const idx = this.forms.findIndex((f) => f.id === formId);
    const rec: UsageFormRecord = { ...this.forms[idx], ...patch };
    this.forms[idx] = rec;
    return Promise.resolve(rec);
  }
  /** F018 delta 新增：**只**更新 formNumber 之寫入路徑（AC-D20 之結構性保證）。 */
  updateFormNumber(formId: string, formNumber: string | null) {
    this.updateNumberCalls.push({ formId, formNumber });
    const idx = this.forms.findIndex((f) => f.id === formId);
    const rec: UsageFormRecord = { ...this.forms[idx], formNumber };
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
    this.links = this.links.filter((l) => !(l.documentId === documentId && l.formId === formId));
    return Promise.resolve();
  }
  unlinkAll(formId: string) {
    this.links = this.links.filter((l) => l.formId !== formId);
    return Promise.resolve();
  }

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

const xlsx = (over: Partial<UploadFile> = {}): UploadFile => ({
  fileName: 'form.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 2048,
  ...over,
});

describe('UsageFormsService — 上傳時設定表單編號（F018 AC-D2／AC-D4～AC-D6）', () => {
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

  it('TS-D18-010 AC-D2 上傳填入 "  FM-001  " → 落地為 "FM-001"（trim 後值）', async () => {
    const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx(), '進件申請書', '  FM-001  ');
    expect(rec.formNumber).toBe('FM-001');
  });

  it('TS-D18-011 AC-D2 未填／純空白 → 落地為 null（不得為空字串）', async () => {
    const a = await svc.uploadForm(ICSOP_ADMIN, xlsx(), '表單 A');
    const b = await svc.uploadForm(ICSOP_ADMIN, xlsx(), '表單 B', '   ');
    expect(a.formNumber).toBeNull();
    expect(b.formNumber).toBeNull();
  });

  it('TS-D18-012 AC-D5 多筆空編號可並存（null 不參與唯一性比對）', async () => {
    await svc.uploadForm(ICSOP_ADMIN, xlsx(), 'A');
    await svc.uploadForm(ICSOP_ADMIN, xlsx(), 'B');
    await svc.uploadForm(ICSOP_ADMIN, xlsx(), 'C');
    await expect(svc.uploadForm(ICSOP_ADMIN, xlsx(), 'D')).resolves.toBeDefined();
    expect(store.forms.filter((f) => f.formNumber === null)).toHaveLength(4);
  });

  it('TS-D18-013 🔴 AC-D4 上傳重複編號 → 409 USAGE_FORM_NUMBER_DUPLICATE，**不寫記錄、不上傳 blob**', async () => {
    await svc.uploadForm(ICSOP_ADMIN, xlsx(), '既有', 'FM-001');
    const putsBefore = blob.putCalls.length;

    await expect(svc.uploadForm(ICSOP_ADMIN, xlsx(), '新的', 'FM-001')).rejects.toThrow(
      'USAGE_FORM_NUMBER_DUPLICATE',
    );

    expect(store.forms).toHaveLength(1);
    expect(blob.putCalls).toHaveLength(putsBefore);
  });

  it.each(['fm-001', '  FM-001  ', 'Fm-001'])(
    'TS-D18-014 AC-D4 以 %s 上傳 → 同樣 409（比對前 trim、不分大小寫）',
    async (candidate) => {
      await svc.uploadForm(ICSOP_ADMIN, xlsx(), '既有', 'FM-001');
      await expect(svc.uploadForm(ICSOP_ADMIN, xlsx(), '新的', candidate)).rejects.toThrow(
        'USAGE_FORM_NUMBER_DUPLICATE',
      );
      expect(store.forms).toHaveLength(1);
    },
  );

  it('TS-D18-015 AC-D6 上傳編號 101 字元 → 400 USAGE_FORM_NUMBER_TOO_LONG，不建立、不寫 blob', async () => {
    await expect(svc.uploadForm(ICSOP_ADMIN, xlsx(), 'X', 'A'.repeat(101))).rejects.toThrow(
      'USAGE_FORM_NUMBER_TOO_LONG',
    );
    expect(store.forms).toHaveLength(0);
    expect(blob.putCalls).toHaveLength(0);
  });

  it('TS-D18-016 AC-D6 恰 100 字元 → 建立成功', async () => {
    const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx(), 'X', 'A'.repeat(100));
    expect(rec.formNumber).toBe('A'.repeat(100));
  });
});

describe('UsageFormsService.updateFormNumber — 「編輯編號」動作（F018 AC-D3／AC-D18～AC-D20）', () => {
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

  /** 直接種入表單（略過上傳路徑，避免以待測行為建立前置條件）。 */
  async function seed(name: string, formNumber: string | null = null): Promise<UsageFormRecord> {
    const rec = await store.create({
      name,
      blobPath: `usage-forms/${name}.xlsx`,
      format: 'xlsx',
      size: 2048,
      uploadedBy: 'admin1',
      uploadedAt: new Date('2026-06-10T00:00:00.000Z'),
      formNumber,
    });
    return rec;
  }

  it('TS-D18-020 AC-D3 null → FM-002 → null 之往返皆為合法操作', async () => {
    const f = await seed('進件申請書');
    expect(f.formNumber).toBeNull();

    const set = await svc.updateFormNumber(ICSOP_ADMIN, f.id, 'FM-002');
    expect(set.formNumber).toBe('FM-002');
    expect((await store.findById(f.id))!.formNumber).toBe('FM-002');

    const cleared = await svc.updateFormNumber(ICSOP_ADMIN, f.id, '');
    expect(cleared.formNumber).toBeNull();
    expect((await store.findById(f.id))!.formNumber).toBeNull();
  });

  it('TS-D18-021 AC-D3 回應為更新後之該列（供清單即時反映）', async () => {
    const f = await seed('進件申請書');
    const out = await svc.updateFormNumber(ICSOP_ADMIN, f.id, '  FM-002  ');
    expect(out).toMatchObject({ id: f.id, name: '進件申請書', formNumber: 'FM-002' });
  });

  it.each(['FM-001', 'fm-001', '  FM-001  '])(
    'TS-D18-022 🔴 AC-D18 他列已為 FM-001 時以 %s 儲存 → 409 且**該列 formNumber 不變**',
    async (candidate) => {
      await seed('他列', 'FM-001');
      const mine = await seed('本列', 'FM-009');

      await expect(svc.updateFormNumber(ICSOP_ADMIN, mine.id, candidate)).rejects.toThrow(
        'USAGE_FORM_NUMBER_DUPLICATE',
      );
      expect((await store.findById(mine.id))!.formNumber).toBe('FM-009');
    },
  );

  it('TS-D18-023 AC-D18 對自身以相同值再次儲存 → 不視為衝突（唯一性比對**排除自身列**）', async () => {
    const mine = await seed('本列', 'FM-001');
    await expect(svc.updateFormNumber(ICSOP_ADMIN, mine.id, 'FM-001')).resolves.toMatchObject({
      formNumber: 'FM-001',
    });
  });

  it('TS-D18-024 AC-D18 對自身只改大小寫（FM-001 → fm-001）→ 亦不視為衝突', async () => {
    const mine = await seed('本列', 'FM-001');
    await expect(svc.updateFormNumber(ICSOP_ADMIN, mine.id, 'fm-001')).resolves.toMatchObject({
      formNumber: 'fm-001',
    });
  });

  it('TS-D18-025 AC-D18 101 字元 → 400 USAGE_FORM_NUMBER_TOO_LONG、該列不變；恰 100 字元通過', async () => {
    const mine = await seed('本列', 'FM-001');
    await expect(svc.updateFormNumber(ICSOP_ADMIN, mine.id, 'A'.repeat(101))).rejects.toThrow(
      'USAGE_FORM_NUMBER_TOO_LONG',
    );
    expect((await store.findById(mine.id))!.formNumber).toBe('FM-001');
    await expect(svc.updateFormNumber(ICSOP_ADMIN, mine.id, 'A'.repeat(100))).resolves.toBeDefined();
  });

  it('TS-D18-026 AC-D19 以空字串／純空白儲存 → 正規化為 null 並持久化、不觸發唯一性比對', async () => {
    await seed('他列 1', null);
    await seed('他列 2', null);
    const mine = await seed('本列', 'FM-002');

    await expect(svc.updateFormNumber(ICSOP_ADMIN, mine.id, '   ')).resolves.toMatchObject({
      formNumber: null,
    });
    expect((await store.findById(mine.id))!.formNumber).toBeNull();
  });

  it('TS-D18-027 AC-D19 明確傳入 null 亦為清空', async () => {
    const mine = await seed('本列', 'FM-002');
    await expect(svc.updateFormNumber(ICSOP_ADMIN, mine.id, null)).resolves.toMatchObject({
      formNumber: null,
    });
  });

  it('TS-D18-028 🔴 AC-D20 副作用邊界：六欄逐欄未變、Blob 未讀未寫、關聯未變', async () => {
    const mine = await seed('進件申請書', null);
    store.seedLinks(mine.id, 3);
    const before = { ...(await store.findById(mine.id))! };
    const linksBefore = [...store.links];

    await svc.updateFormNumber(ICSOP_ADMIN, mine.id, 'FM-777');

    const after = (await store.findById(mine.id))!;
    expect(after.blobPath).toBe(before.blobPath);
    expect(after.format).toBe(before.format);
    expect(after.size).toBe(before.size);
    expect(after.name).toBe(before.name);
    expect(after.uploadedBy).toBe(before.uploadedBy);
    expect(after.uploadedAt).toEqual(before.uploadedAt);
    expect(after.formNumber).toBe('FM-777');

    // Blob 位元組未被讀取亦未被寫入
    expect(blob.putCalls).toHaveLength(0);
    expect(blob.deleteCalls).toHaveLength(0);
    expect(blob.urlCalls).toHaveLength(0);
    // 關聯未變
    expect(store.links).toEqual(linksBefore);
    // 走的是編號專用寫入路徑，非檔案覆蓋路徑
    expect(store.updateFileCalls).toEqual([]);
    expect(store.updateNumberCalls).toEqual([{ formId: mine.id, formNumber: 'FM-777' }]);
  });

  it('TS-D18-029 🔴 AC-D20 被 N≥2 份文件引用時執行 → 不得觸發 USAGE_FORM_OVERWRITE_SHARED', async () => {
    const mine = await seed('共用表單', null);
    store.seedLinks(mine.id, 3);
    await expect(svc.updateFormNumber(ICSOP_ADMIN, mine.id, 'FM-555')).resolves.toMatchObject({
      formNumber: 'FM-555',
    });
  });

  it('TS-D18-030 AC-D20 不寫稽核（AuditRecorder 未收到任何事件）', async () => {
    const mine = await seed('進件申請書', null);
    await svc.updateFormNumber(ICSOP_ADMIN, mine.id, 'FM-321');
    await svc.updateFormNumber(ICSOP_ADMIN, mine.id, null);
    expect(audit.events).toEqual([]);
  });

  it('TS-D18-031 表單不存在 → USAGE_FORM_NOT_FOUND（沿用既有錯誤碼）', async () => {
    await expect(svc.updateFormNumber(ICSOP_ADMIN, 'ghost', 'FM-001')).rejects.toThrow(
      'USAGE_FORM_NOT_FOUND',
    );
  });
});

describe('UsageFormsService.updateFormNumber — AC-D17 逐角色權限（服務層兩道閘門）', () => {
  let blob: FakeBlobStore;
  let store: FakeFormPoolStore;
  let svc: UsageFormsService;
  let formId: string;

  beforeEach(async () => {
    blob = new FakeBlobStore();
    store = new FakeFormPoolStore();
    svc = new UsageFormsService(blob, store, new FakeAuditRecorder());
    const rec = await store.create({
      name: '進件申請書',
      blobPath: 'usage-forms/x.xlsx',
      format: 'xlsx',
      size: 1024,
      uploadedBy: 'admin1',
      uploadedAt: new Date('2026-06-10T00:00:00.000Z'),
      formNumber: null,
    });
    formId = rec.id;
  });

  it('TS-D18-032 ICSOPAdmin → 允許（「使用表單（多）」＝ICSOPAdmin 可寫）', async () => {
    await expect(svc.updateFormNumber(ICSOP_ADMIN, formId, 'FM-100')).resolves.toBeDefined();
  });

  it('TS-D18-033 🔴 SysAdmin → 403 FIELD_WRITE_FORBIDDEN（功能面過、欄位面擋），且該列不變', async () => {
    const sys: SessionContext = { roleCode: 'SysAdmin', accountId: 's1' };
    await expect(svc.updateFormNumber(sys, formId, 'FM-100')).rejects.toThrow(
      'FIELD_WRITE_FORBIDDEN',
    );
    expect((await store.findById(formId))!.formNumber).toBeNull();
  });

  it.each([
    ['Supervisor', 'sup1'],
    ['DeptContact', 'dc1'],
    ['User', 'u1'],
  ])('TS-D18-034 %s → 403 PERMISSION_DENIED（功能面即擋），且該列不變', async (roleCode, accountId) => {
    const s: SessionContext = { roleCode, accountId };
    await expect(svc.updateFormNumber(s, formId, 'FM-100')).rejects.toThrow('PERMISSION_DENIED');
    expect((await store.findById(formId))!.formNumber).toBeNull();
  });
});
