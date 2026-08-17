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
import { SessionContext } from '../attachments/attachments.service';

/**
 * L7 · F018 `AC-D18`（並發情境）／`AC-D5` 之**第二道保護**：
 * DB filtered unique index 攔下之競態，必須以**同一個 409** 現身，而非 500。
 *
 * 權威＝`docs/specs/architecture-spec.md` §10.7 注意事項第 7 條：
 *   「應用層先查後判為第一道；DB 唯一索引違反時 MSSQL 拋 error **2601／2627**，
 *    須於既有 `backend/src/documents/db-error.ts` 之錯誤轉譯加一條映射至同一個 409。
 *    **缺這條，並發下的重複會以 500 而非 409 現身。**」
 * ＋ `docs/specs/error-handling.md#usage-form-number`（並發保護：雙保險）。
 *
 * 🔴 本檔只驗證「服務層有把 2601/2627 轉譯為 409」。
 *   **filtered unique index 是否真的存在於 DB** 屬 §10.15 第 6 項之「原理上測不到」，
 *   列入交付物 ③ (乙)：對真 SOP DB 實跑 ＋ `sys.indexes` 查 `has_filter=1`。
 */
class ThrowingStore implements FormPoolStore {
  forms: UsageFormRecord[] = [];
  /** 由測試指定：更新編號時要拋出的驅動層錯誤。 */
  throwOnUpdate: unknown = null;

  create(input: CreateFormInput) {
    const rec: UsageFormRecord = { id: `form-${this.forms.length + 1}`, ...input };
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
    return Promise.resolve(this.forms.map((f) => ({ ...f, docCount: 0, documents: [] })));
  }
  updateFile(formId: string, patch: UpdateFormFileInput) {
    const idx = this.forms.findIndex((f) => f.id === formId);
    this.forms[idx] = { ...this.forms[idx], ...patch };
    return Promise.resolve(this.forms[idx]);
  }
  updateFormNumber(formId: string, formNumber: string | null) {
    if (this.throwOnUpdate) return Promise.reject(this.throwOnUpdate);
    const idx = this.forms.findIndex((f) => f.id === formId);
    this.forms[idx] = { ...this.forms[idx], formNumber };
    return Promise.resolve(this.forms[idx]);
  }
  delete() {
    return Promise.resolve();
  }
  countLinks() {
    return Promise.resolve(0);
  }
  listByDocument() {
    return Promise.resolve([]);
  }
  link() {
    return Promise.resolve();
  }
  unlink() {
    return Promise.resolve();
  }
  unlinkAll() {
    return Promise.resolve();
  }
}

class FakeAuditRecorder implements AuditRecorder {
  events: UsageFormAuditEvent[] = [];
  record(e: UsageFormAuditEvent) {
    this.events.push(e);
  }
}

const ICSOP_ADMIN: SessionContext = { roleCode: 'ICSOPAdmin', accountId: 'admin1' };

describe('UsageFormsService — 編號並發之 DB 唯一索引違反轉譯（F018 AC-D18／§10.7 第 7 條）', () => {
  let store: ThrowingStore;
  let svc: UsageFormsService;
  let formId: string;

  beforeEach(async () => {
    store = new ThrowingStore();
    svc = new UsageFormsService(new FakeBlobStore(), store, new FakeAuditRecorder());
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

  it.each([2601, 2627])(
    'TS-D18-050 🔴 TypeORM QueryFailedError（driverError.number=%s）→ 409 USAGE_FORM_NUMBER_DUPLICATE（非 500）',
    async (number) => {
      store.throwOnUpdate = { name: 'QueryFailedError', driverError: { number } };
      await expect(svc.updateFormNumber(ICSOP_ADMIN, formId, 'FM-001')).rejects.toThrow(
        'USAGE_FORM_NUMBER_DUPLICATE',
      );
    },
  );

  it('TS-D18-051 未經 TypeORM 包裝之原始 mssql 錯誤（頂層 number=2601）→ 同樣 409', async () => {
    store.throwOnUpdate = { number: 2601 };
    await expect(svc.updateFormNumber(ICSOP_ADMIN, formId, 'FM-001')).rejects.toThrow(
      'USAGE_FORM_NUMBER_DUPLICATE',
    );
  });

  it('TS-D18-052 🔴 負向防護：外鍵違反(547)／逾時等不相關 DB 錯誤**不得**被誤映射為編號重複', async () => {
    store.throwOnUpdate = { name: 'QueryFailedError', driverError: { number: 547 } };
    await expect(svc.updateFormNumber(ICSOP_ADMIN, formId, 'FM-001')).rejects.not.toThrow(
      'USAGE_FORM_NUMBER_DUPLICATE',
    );
  });
});
