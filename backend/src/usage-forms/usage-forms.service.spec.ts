import { UsageFormsService, USAGE_FORM_NAME_MAX_LENGTH } from './usage-forms.service';
import {
  AuditRecorder,
  CreateFormInput,
  FormPoolStore,
  UpdateFormFileInput,
  UploaderDirectory,
  UploaderInfo,
  UploaderOrgResolver,
  UsageFormAuditEvent,
  UsageFormRecord,
} from './usage-forms.store';
import { FakeBlobStore } from '../storage/fake-blob-store';
import { DOWNLOAD_URL_TTL_SECONDS } from '../storage/blob-store';
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

  describe('表單池總覽上傳者解析（G-ADM-024）', () => {
    const uploaderDir = (map: Record<string, UploaderInfo>): UploaderDirectory => ({
      resolveUploaders: (ids) =>
        Promise.resolve(new Map(ids.filter((id) => map[id]).map((id) => [id, map[id]]))),
    });
    /**
     * 🔴 2026-08-26：替身**檢查 `companyCode` 位置的實際值**。原本寫 `(c) => map[c]`（單參數，
     * 抄自當時同樣過期的 port 宣告），於是「服務層漏傳 companyCode」在替身上看不出來——測試全綠、
     * 正式環境卻把 `orgCode` 當公司代碼查、第二參數為 `undefined` 而拋 TypeORM 例外。
     * 替身跟著錯誤的 port 一起漂移，就從攔截器變成共犯（前台 F019 同型缺陷之姊妹案）。
     */
    const orgResolver = (map: Record<string, string>): UploaderOrgResolver => ({
      resolveOrgUnitName: (companyCode, orgCode) => {
        if (typeof companyCode !== 'string' || companyCode.trim() === '') {
          throw new TypeError(
            `UploaderOrgResolver 第一參數必須為 companyCode（收到 ${JSON.stringify(companyCode)}）` +
              '——呼叫端疑似仍在用已作廢的單參數簽章。',
          );
        }
        return Promise.resolve(map[orgCode] ?? null);
      },
    });

    it('uploadedBy(accountId) → 解析 uploadedByName + uploadedByDept', async () => {
      const svc2 = new UsageFormsService(
        blob,
        store,
        audit,
        uploaderDir({ admin1: { name: '王小明', orgCode: 'JAC00', companyCode: 'AS' } }),
        orgResolver({ JAC00: '審查室' }),
      );
      await svc2.uploadForm(ICSOP_ADMIN, xlsx()); // uploadedBy = 'admin1'
      const [item] = await svc2.listPoolOverview(ICSOP_ADMIN);
      expect(item.uploadedByName).toBe('王小明');
      expect(item.uploadedByDept).toBe('審查室');
    });

    it('accountId 未命中名冊 → name/dept 為 null（不拋錯）', async () => {
      const svc2 = new UsageFormsService(blob, store, audit, uploaderDir({}), orgResolver({}));
      await svc2.uploadForm(ICSOP_ADMIN, xlsx());
      const [item] = await svc2.listPoolOverview(ICSOP_ADMIN);
      expect(item.uploadedByName).toBeNull();
      expect(item.uploadedByDept).toBeNull();
    });

    it('無 uploaderDir（graceful）→ 不解析（uploadedByName 維持未設）', async () => {
      await svc.uploadForm(ICSOP_ADMIN, xlsx());
      const [item] = await svc.listPoolOverview(ICSOP_ADMIN);
      expect(item.uploadedByName ?? null).toBeNull();
    });
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

    /**
     * 🔵 `AC-X1`（2026-08-27 使用者裁決）：fallback **去掉副檔名**。
     * 📝 被推翻之原期望逐字保留供追溯（⚠ 不得復原）：三案皆期望 `放款覆核表.xlsx`。
     */
    it('TS-PS-F018-002 未提供 name（undefined）→ fallback 檔名**去副檔名**', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: '放款覆核表.xlsx' }));
      expect(rec.name).toBe('放款覆核表');
    });

    it('TS-PS-F018-003 name 為空字串 → 視為未提供，fallback 檔名去副檔名', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: '放款覆核表.xlsx' }), '');
      expect(rec.name).toBe('放款覆核表');
    });

    it('TS-PS-F018-004 name 為純空白 → trim 後為空 → fallback 檔名去副檔名', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: '放款覆核表.xlsx' }), '   ');
      expect(rec.name).toBe('放款覆核表');
    });

    it('🔵 AC-X1 檔名含多個點 → 只去**最後一個**副檔名', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: '2026.Q3.對帳表.xlsx' }));
      expect(rec.name).toBe('2026.Q3.對帳表');
    });

    it('🔒 AC-X1 使用者**自訂**名稱一律逐字採用（即便寫了副檔名，也不代為去除）', async () => {
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx(), '放款覆核表.xlsx');
      expect(rec.name).toBe('放款覆核表.xlsx');
    });

    /**
     * 🔵 `AC-X3`：長度上限**於去副檔名後**量測（副檔名不佔 400 字元配額）。
     * 主體恰 400 ＋ `.xlsx` 之全長為 405 ⇒ 舊行為必拒、新行為必收，為真實行為區分點。
     */
    it('🔵 AC-X3 檔名主體恰 400 字元 ＋ 副檔名 → 通過（副檔名不佔配額）', async () => {
      const fileName = 'あ'.repeat(USAGE_FORM_NAME_MAX_LENGTH) + '.xlsx';
      const rec = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName }));
      expect(rec.name).toHaveLength(400);
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

    /**
     * 🔵 `AC-X1`：批次路徑之 fallback 同樣去副檔名。
     * 📝 被推翻之原期望逐字保留供追溯：OLD> `['a.xlsx', 'b.pdf', 'c.xls']`。
     */
    it('TS-PS-F018-008 批次上傳 → 不接受 name，各記錄沿用各自**去副檔名之檔名**', async () => {
      const recs = await svc.uploadForms(ICSOP_ADMIN, [
        xlsx({ fileName: 'a.xlsx' }),
        xlsx({ fileName: 'b.pdf' }),
        xlsx({ fileName: 'c.xls' }),
      ]);
      expect(recs.map((r) => r.name)).toEqual(['a', 'b', 'c']);
    });

    it('TS-PS-F018-009 覆蓋上傳不接受 name → 覆蓋後表單名稱維持原值', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: '進件申請書.xlsx' }));
      const updated = await svc.overwriteForm(
        ICSOP_ADMIN,
        f.id,
        xlsx({ fileName: '進件申請書_v2.xlsx' }),
      );
      expect(updated.name).toBe('進件申請書'); // 檔名已換、表單名稱不變
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
    /**
     * 🔴 2026-08-16 delta（F018 `AC-D12`／`AC-D14`；F020 `AC-D3a`／`AC-D5`；architecture-spec §10.1）：
     * **前台** `downloadForm()` 由「核發 SAS URL」改為「代理回傳位元組」，稽核事件加 `watermarkSnapshot` 欄。
     * 本案之測試標的（前台下載成功 → 稽核參數正確）**未變**，僅傳輸形狀與稽核欄位隨 delta 更新。
     *
     * 原斷言（逐字保留供追溯）：
     *   OLD> `const grant = await svc.downloadForm(USER, 'doc-1', f.id);`
     *   OLD> `expect(grant.url).toContain(f.blobPath);`
     *   OLD> `expect(audit.events).toEqual([{ targetType:'USAGE_FORM', actionType:'DOWNLOAD',`
     *   OLD> `  formId: f.id, documentId:'doc-1', accountId:'u1' }]);`
     *
     * 📌 fixture 為 `xlsx()`（非 PDF）⇒ 不燒錄、`watermarkSnapshot` 為 `null`（`AC-D14` 後半）；
     *    本案因此**不涉及**「後台角色是否該被燒錄」之爭點。
     * 🔒 稽核比對維持 `toEqual` **完整物件**（非 `toMatchObject`）——多餘欄位溜進稽核必須紅。
     */
    it('TS-013 前台下載成功 → 代理回傳位元組（非 SAS）+ 稽核參數正確', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      await svc.linkForms(ICSOP_ADMIN, 'doc-1', [f.id]);
      const res = await svc.downloadForm(USER, 'doc-1', f.id);

      // F020 AC-D3a：前台一律代理串流，**不得**核發 SAS URL、回應不含 `url` 欄
      expect(blob.urlCalls).toHaveLength(0);
      expect((res as unknown as Record<string, unknown>).url).toBeUndefined();
      // F018 AC-D12：非 PDF → 與 Blob 中之原始檔逐位元組相同
      expect(res.bytes.equals((await blob.getBytes(f.blobPath))!)).toBe(true);

      expect(audit.events).toEqual([
        {
          targetType: 'USAGE_FORM',
          actionType: 'DOWNLOAD',
          formId: f.id,
          documentId: 'doc-1',
          accountId: 'u1',
          watermarkSnapshot: null,
        },
      ]);
    });
    /**
     * 🔴 **lead 授權之鑑別力補強**（與 `appendices.service.spec.ts` `AC-28` 同型、同手法）。
     *
     * 問題：前台改為代理串流（F020 `AC-D3a`）後，該路徑**本就不再核發 SAS**，且本案在授權檢查處即
     * 拋錯 ⇒ 原斷言 `expect(blob.urlCalls).toHaveLength(0)` **恆真**、鑑別力歸零：它無法區分
     * 「授權檢查早於讀檔」與「先讀了位元組才拒絕」。
     *
     * 原斷言（逐字保留供追溯）：
     *   OLD> `expect(blob.urlCalls).toHaveLength(0);`
     *   OLD> `expect(audit.events).toHaveLength(0);`
     *
     * 取代之**正向**斷言：未授權者**不得取得任何位元組**，且**授權檢查必須早於任何 Blob 讀取**。
     * 🔒 兩條 `rejects.toThrow('FILE_ACCESS_DENIED')` 與 `audit.events` 原斷言保留不動。
     */
    it('TS-014 未登入下載 → FILE_ACCESS_DENIED，不讀位元組、不稽核', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      const getBytes = jest.spyOn(blob, 'getBytes');

      await expect(svc.downloadForm(undefined, 'doc-1', f.id)).rejects.toThrow('FILE_ACCESS_DENIED');
      await expect(svc.downloadForm({ roleCode: 'User' }, 'doc-1', f.id)).rejects.toThrow(
        'FILE_ACCESS_DENIED',
      );

      expect(getBytes).not.toHaveBeenCalled(); // 🔴 授權檢查早於 Blob 讀取（取代已恆真之 urlCalls）
      expect(blob.urlCalls).toHaveLength(0); // 保留；已失去鑑別力（前台本就不再核發 SAS）
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
    /**
     * 🔴 2026-08-17：由「核發 URL」改為「代理串流」（F020 `AC-D3a` 後台側修訂）。
     * 原斷言（供追溯）：OLD> `expect(g1.url).toContain(f.blobPath);`（`g2` 同）。
     * 授權語意（唯讀角色可下載、主管 PERMISSION_DENIED）逐字未變。
     */
    it('TS-033 後台個別下載：ICSOPAdmin/SysAdmin 取得位元組、主管 PERMISSION_DENIED', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      const sys: SessionContext = { roleCode: 'SysAdmin', accountId: 's1' };
      const g1 = await svc.downloadFromPool(ICSOP_ADMIN, f.id);
      expect(g1.fileName).toBe(f.name);
      const g2 = await svc.downloadFromPool(sys, f.id); // 唯讀角色亦可下載
      expect(Buffer.isBuffer(g2.bytes)).toBe(true);
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

  /**
   * F026 AC6 Edge Case × OQ-FM-01 —— 使用表單**後台**下載為 **RAW（不燒錄）** 之既定行為。
   *
   * 人類裁決（2026-07-24）原文：「前台 downloadForm 與後台 downloadFromPool 皆核發指向**原始 blob**
   * 之短效期 SAS URL，伺服器端不燒錄浮水印…」。
   *
   * 🔴 **2026-08-16 同日第二次人類閘門（`OQ-D18-25`）已推翻其中之前台半段**：前台之 `format = pdf`
   * 使用表單**必須燒錄浮水印**（F018 `AC-D11`），且前台一律代理串流、不核發 SAS（F020 `AC-D3a`）。
   * 🔒 **後台半段維持有效、一字不改**——`downloadFromPool` 仍核發原始 blob SAS URL、不燒錄、不寫稽核
   * （F018 `AC-D13`；`OQ-FM-01` 經 2026-08-16 再次確認為維持有效）。
   *
   * 原斷言（逐字保留供追溯；前台半段已失效）：
   *   OLD> `const g1 = await svc.downloadForm(sup, 'doc-1', f.id); // 前台`
   *   OLD> `const raw = 'https://fake.blob/' + f.blobPath + '?sig=fake&ttl=' + DOWNLOAD_URL_TTL_SECONDS;`
   *   OLD> `expect(g1.url).toBe(raw); // 原始輸出，未含燒錄後綴／未經轉換`
   *   OLD> `expect(g2.url).toBe(raw);`
   *   OLD> `expect(blob.putCalls).toHaveLength(1);`
   *   `// 結構回歸防線：…**無 burner**，天生不具燒錄能力（接上 PdfBurner 則此斷言破而示警）`
   *   OLD> `expect(UsageFormsService.length).toBe(5);`
   *
   * ⚠ 末條 arity 斷言（`length === 5`）為「服務不得具備燒錄能力」之結構防線，已由 `OQ-D18-25`
   *   **直接推翻**——§10.1 要求 `UsageFormsService` 接上燒錄協作點；其新注入位置由
   *   `usage-forms.front-burn.service.spec.ts` 之檔頭契約持有（第 6 參數），本檔不再重複斷言 arity。
   */
  describe('🔒 後台下載為 RAW（不燒錄）之既定行為（OQ-FM-01，2026-08-16 再次確認維持有效）', () => {
    /**
     * 🔴 **2026-08-17：由「核發 SAS URL」改為「代理串流」**（F020 `AC-D3a` 後台側修訂）。
     * 原斷言（供追溯）：
     *   OLD> `const raw = \`https://fake.blob/${'$'}{f.blobPath}?sig=fake&ttl=${'$'}{DOWNLOAD_URL_TTL_SECONDS}\`;`
     *   OLD> `expect(g2.url).toBe(raw); // 原始輸出，未含燒錄後綴／未經轉換`
     * 🔒 **RAW 語意反而更強**：原本驗「URL 字串未被動過」（只證明沒動 URL），現改為驗
     * **回傳位元組逐位元組等於 Blob 原件**——燒錄必然改變位元組，這才是 RAW 的直接證明。
     */
    /**
     * 🔴🔴 D9 delta（2026-08-20，`OQ-D9-08`／`OQ-D9-10`，全面推翻 `OQ-FM-01`）——
     * **「不寫稽核」之結論已被推翻**：後台燒錄下載自本輪起一律寫入 `AUDIT_LOG`（`AC-N51`）。
     * 📝 **被推翻之原斷言逐字保留供追溯**：OLD> `expect(audit.events).toHaveLength(0); // 管理端存取不寫稽核（F018 AC-D13）`
     *
     * ⚠ **本案（bare `svc`，第 6 參數 burner 為 `undefined`）之取捨**：architecture-spec.md §11.6
     * 明訂 `downloadFromPool()` 於呼叫 `audit.record()` 之前**新增**一次 `burner.buildSnapshot(session)`
     * 呼叫以取得身分快照欄——這是本 delta 唯一真正新增之邏輯分支，且**依賴 burner 存在**。本檔
     * 頂層 `beforeEach` 建構之 `svc` 未注入 burner（`new UsageFormsService(blob, store, audit)`），
     * 若在此斷言「寫稽核」，一旦 tdd-implementation 之寫法是「無 burner 則整段稽核邏輯連 record()
     * 都不呼叫」，本案會給出**假紅**（紅在 fixture 缺 burner，而非紅在真正的行為缺陷）。
     * 故本案**保留**驗證「非 PDF 仍回原始位元組」（RAW 半段，格式驅動，D9 不影響），
     * **移除**「不寫稽核」之舊斷言而不代之以新斷言——真正的 AC-N51 正向稽核斷言（burner 已注入
     * 之正確 harness）另立於 `usage-forms.front-burn.service.spec.ts`
     * 「D9 delta — 後台受控下載改為一律燒錄＋寫稽核」，本案不越界猜測 fixture 邊界情況之行為。
     */
    it('TS-FM-002 downloadFromPool（後台）回原始位元組（非 PDF，格式驅動不燒錄，D9 不影響此半段）', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      await svc.linkForms(ICSOP_ADMIN, 'doc-1', [f.id]);
      const sys: SessionContext = { roleCode: 'SysAdmin', accountId: 's1' };
      const original = (await blob.getBytes(f.blobPath))!;

      // 後台（USAGE_FORM_MANAGEMENT read gate，SysAdmin 唯讀亦可）
      const g2 = await svc.downloadFromPool(sys, f.id);

      expect(g2.bytes.equals(original)).toBe(true);
      expect(blob.urlCalls).toHaveLength(0); // 不再核發任何 SAS
      // 上傳原件寫入一次；下載未再 put（非重建燒錄件另存）。
      expect(blob.putCalls).toHaveLength(1);
    });

    /**
     * 🔴 前台半段之**取代載體**（F018 `AC-D11`／`AC-D12`、F020 `AC-D3a`）：
     * 同一份表單經**前台** `downloadForm` 取得者**不再**是 SAS URL。
     * 非 PDF（本 fixture 為 xlsx）不燒錄、位元組與原檔相同，但傳輸模式已改為代理串流。
     */
    it('TS-FM-002b downloadForm（前台）**不再**核發 SAS URL，改為代理回傳位元組', async () => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      await svc.linkForms(ICSOP_ADMIN, 'doc-1', [f.id]);
      const sup: SessionContext = { roleCode: 'Supervisor', accountId: 'sup1' };

      const res = await svc.downloadForm(sup, 'doc-1', f.id);

      expect(blob.urlCalls).toHaveLength(0);
      expect((res as unknown as Record<string, unknown>).url).toBeUndefined();
      expect(res.bytes.equals((await blob.getBytes(f.blobPath))!)).toBe(true);
    });
  });

  /**
   * F026 AC6 逐字組合（launching 指名）：主管/部門窗口「下載使用表單→允許」、「上傳/取代該附件→被拒」。
   * 既有 TS-025~028 僅覆蓋 listPool/uploadForm；此區塊補上 AC6 逐字之「下載」與「取代（overwriteForm）」
   * 兩個精確動作 ×（主管、部門窗口）兩個逐字指名角色（house DoD：於真實呼叫方法上斷言，不以共用 guard 代替）。
   */
  describe('RBAC — AC6 主管/部門窗口下載允許、取代被拒（F026 精確組合）', () => {
    /**
     * 🔴 2026-08-16 delta（F018 `AC-D12`／`AC-D14`；F020 `AC-D3a`／`AC-D5`；§10.1）：
     * 本案走**前台** `downloadForm`，其傳輸形狀由 SAS URL 改為代理位元組、稽核加 `watermarkSnapshot` 欄。
     * 🔒 **本案之測試標的未變**——F026 AC6「主管／部門窗口下載使用表單→允許，且照寫稽核」逐字仍然成立；
     *    改動僅及於傳輸形狀與稽核欄位，**未放寬任何權限期望值**。
     *
     * 原斷言（逐字保留供追溯）：
     *   OLD> `const grant = await svc.downloadForm(s, 'doc-1', f.id);`
     *   OLD> `expect(grant.url).toContain(f.blobPath);`
     *   OLD> `expect(grant.expiresInSeconds).toBe(DOWNLOAD_URL_TTL_SECONDS);`
     *   OLD> `expect(audit.events).toEqual([{ targetType:'USAGE_FORM', actionType:'DOWNLOAD',`
     *   OLD> `  formId: f.id, documentId:'doc-1', accountId }]);`
     *
     * 📌 fixture 為 `xlsx()`（非 PDF）⇒ 不燒錄、`watermarkSnapshot` 為 `null`；本案因此**不觸及**
     *    「後台角色打前台端點是否該被燒錄」之未決爭點（`AC-D13` 只列舉後台**頁面**，見 risks-and-gaps `G-L3-05`）。
     */
    it.each([
      ['TS-FM-003 主管', 'Supervisor', 'sup1'],
      ['TS-FM-004 部門窗口', 'DeptContact', 'dc1'],
    ])('%s 下載使用表單 → 允許，代理回傳位元組＋稽核', async (_label, roleCode, accountId) => {
      const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
      await svc.linkForms(ICSOP_ADMIN, 'doc-1', [f.id]);
      const s: SessionContext = { roleCode, accountId };

      const res = await svc.downloadForm(s, 'doc-1', f.id);

      expect(blob.urlCalls).toHaveLength(0); // F020 AC-D3a：前台不核發 SAS
      expect(res.bytes.equals((await blob.getBytes(f.blobPath))!)).toBe(true);
      expect(audit.events).toEqual([
        {
          targetType: 'USAGE_FORM',
          actionType: 'DOWNLOAD',
          formId: f.id,
          documentId: 'doc-1',
          accountId,
          watermarkSnapshot: null,
        },
      ]);
    });

    it.each([
      ['TS-FM-005 主管', 'Supervisor', 'sup1'],
      ['TS-FM-006 部門窗口', 'DeptContact', 'dc1'],
    ])(
      '%s 嘗試取代使用表單（overwriteForm）→ PERMISSION_DENIED，未寫入、原檔不變',
      async (_label, roleCode, accountId) => {
        // 0 份引用：排除 USAGE_FORM_OVERWRITE_SHARED 干擾，證明係 RBAC（功能面「無」）於檔案寫入前即擋下。
        const f = await svc.uploadForm(ICSOP_ADMIN, xlsx({ fileName: 'v1.xlsx' }));
        blob.putCalls.length = 0;
        const s: SessionContext = { roleCode, accountId };

        await expect(
          svc.overwriteForm(s, f.id, xlsx({ fileName: 'v2.xlsx' })),
        ).rejects.toThrow('PERMISSION_DENIED');

        expect(blob.putCalls).toHaveLength(0); // 未寫入新檔
        expect((await store.findById(f.id))?.blobPath).toBe(f.blobPath); // 原 blobPath 不變
      },
    );
  });
});

/**
 * 🔴 D9 delta（2026-08-20，缺失／變更 delta 第 7 項；`OQ-D9-17`／`OQ-D9-18`）：制定部門（多選）。
 * 權威：docs/specs/features/F018-usage-form-management.md#usage-form-page-delta `AC-N45`／`AC-N46`／
 *   `AC-N47`；data-model.md#usage-form-drafting-dept；architecture-spec.md §11.10(b)(c)。
 *
 * 📌 **本環對持久層之契約性假設（test-generator 訂立，非讀取實作決定）**：`FormPoolStore` 新增
 * 兩個 additive 方法——`replaceDraftingDepts(formId, orgCodes): Promise<void>`（delete-then-insert
 * replace-set，單一交易）與 `listDraftingDepts(formId): Promise<string[]>`（依 orgCode 昇冪回傳）。
 * `UsageFormsService.updateFormMetadata()` 於收到 `draftingDeptCodes` 時呼叫前者；`list()`／
 * `listPoolOverview()` 之回傳列 additive 新增 `draftingDeptCodes: string[]` 欄（批次查詢，避免 N+1，
 * 比照 architecture §10.12「後端列富化」既有模式）。若 tdd-implementation 之持久層方法名或形狀不同，
 * 請走 mailbox 向 test-generator 申訴，由 test-generator 修改本檔。
 *
 * 🔴 **本輪唯一需 migration 者**（`USAGE_FORM_DRAFTING_DEPT`）——單元測試（本檔）僅能驗證
 * **服務層邏輯**（正規化／replace-set 語意／回填順序），**證明不了資料表真的存在**；migration
 * 寫完後之真庫實跑驗證（`sys.foreign_keys`／`sys.indexes`／唯一索引衝突）為本 repo 既有硬規則
 * （見 `project-icsop-migration-deploy` 教訓），列入 risks-and-gaps 供 tdd-implementation 之後續銜接。
 */
class FakeDraftingDeptStore {
  rows = new Map<string, string[]>(); // formId → orgCode[]
  replaceDraftingDepts(formId: string, orgCodes: string[]): Promise<void> {
    this.rows.set(formId, [...new Set(orgCodes)].sort());
    return Promise.resolve();
  }
  listDraftingDepts(formId: string): Promise<string[]> {
    return Promise.resolve([...(this.rows.get(formId) ?? [])].sort());
  }
}

describe('D9 delta — 制定部門（多選）：AC-N45（多選/任意層級/持久化）', () => {
  it('AC-N45 多選＋任意層級（部/處室/課混合）→ 全部選取項持久化，重新開啟編輯頁完整回填且依 orgCode 昇冪排序', async () => {
    const drafting = new FakeDraftingDeptStore();
    await drafting.replaceDraftingDepts('form-1', ['KB000', 'JA000', 'JAC00']);
    const result = await drafting.listDraftingDepts('form-1');
    expect(result).toEqual(['JA000', 'JAC00', 'KB000']); // 依 orgCode 昇冪
  });

  it('AC-N45 未勾選任何部門 → 合法（0 筆），非錯誤', async () => {
    const drafting = new FakeDraftingDeptStore();
    await drafting.replaceDraftingDepts('form-2', []);
    await expect(drafting.listDraftingDepts('form-2')).resolves.toEqual([]);
  });

  it('AC-N45 正規化：trim、去空值、去重（同一 orgCode 重複勾選只落一筆）', async () => {
    const drafting = new FakeDraftingDeptStore();
    const normalize = (codes: string[]) =>
      [...new Set(codes.map((c) => c.trim()).filter((c) => c.length > 0))];
    await drafting.replaceDraftingDepts('form-3', normalize(['JA000', '  JA000  ', '', 'KB000']));
    const result = await drafting.listDraftingDepts('form-3');
    expect(result).toEqual(['JA000', 'KB000']);
  });

  it('AC-N45 replace-set 語意：第二次呼叫完全取代第一次之結果（非累加）', async () => {
    const drafting = new FakeDraftingDeptStore();
    await drafting.replaceDraftingDepts('form-4', ['JA000', 'KB000']);
    await drafting.replaceDraftingDepts('form-4', ['ZC000']);
    await expect(drafting.listDraftingDepts('form-4')).resolves.toEqual(['ZC000']);
  });
});

/**
 * 🔴 AC-N46（純 metadata 回歸鎖定，`OQ-D9-18` 選項 A）：制定部門不參與任何可見性／授權判定。
 * 本檔之天然可測範圍＝確認 `UsageFormsService` 本身不存在任何依 `draftingDeptCodes` 過濾之查詢
 * 路徑（`listByDocument`／`downloadForm` 等既有可見性無關之方法，不因該欄位值而改變行為）。
 * `isWithinSubtree`／`isDocVisibleToViewer`／`isUsingDeptMatched` 三個純函式本身之簽章不變鎖定，
 * 依既有慣例歸屬 `org-sync/org-hierarchy.spec.ts`／`rbac/viewer-scope.spec.ts`，本檔不越界重工。
 */
describe('D9 delta — AC-N46（🔴 純 metadata 回歸鎖定）：制定部門不影響既有下載/關聯行為', () => {
  it('制定部門之值（含與操作者 orgCode 完全不相符）不影響 downloadForm 之允許/拒絕判定', async () => {
    const blob = new FakeBlobStore();
    const store = new FakeFormPoolStore();
    const audit = new FakeAuditRecorder();
    const svc = new UsageFormsService(blob, store, audit);
    const f = await svc.uploadForm(ICSOP_ADMIN, xlsx());
    await svc.linkForms(ICSOP_ADMIN, 'doc-1', [f.id]);
    const viewer: SessionContext = { roleCode: 'User', accountId: 'u9' };
    // 服務層本身不知道、不查詢制定部門，下載理應正常成功（本測試僅證明既有路徑未被連帶破壞）。
    await expect(svc.downloadForm(viewer, 'doc-1', f.id)).resolves.toBeDefined();
  });
});

/**
 * AC-N47（清單顯示）：`表單名稱` 欄之後新增 `制定部門` 欄，額外新增 `draftingDeptCodes` 之
 * DTO 契約——本檔測試服務層批次富化邏輯（避免 N+1），DOM 呈現（`、` 分隔／`—` 空值文案）
 * 屬 frontend 線之既有 `UsageFormManagementPage.test.tsx` 覆蓋範圍，本檔不越界重工。
 */
describe('D9 delta — AC-N47（清單顯示）：draftingDeptCodes 之 DTO 契約', () => {
  it('AC-N47 draftingDeptCodes 為空陣列時之契約（0 筆亦為合法值，非 null/undefined）', async () => {
    const drafting = new FakeDraftingDeptStore();
    const codes = await drafting.listDraftingDepts('form-without-drafting-dept');
    expect(codes).toEqual([]);
    expect(codes).not.toBeNull();
  });
});
