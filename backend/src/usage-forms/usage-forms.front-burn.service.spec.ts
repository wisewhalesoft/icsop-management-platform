/**
 * F018 `AC-D14` —— 前台使用表單下載之**稽核義務與 `watermarkSnapshot` 落值**
 * （2026-08-16 同日第二次人類閘門，`OQ-D18-25` 推翻 `OQ-E05-03`）。
 *
 * 權威：
 *   · docs/specs/features/F018-usage-form-management.md `AC-D14`
 *     「Given `AC-D11` 之前台 PDF 下載成功（含燒錄）, When 檢視稽核, Then `AUDIT_LOG` **恰新增一筆**
 *      `targetType='USAGE_FORM'`／`actionType='DOWNLOAD'`／`formId` 落列之紀錄（既有 AC 語意不變），
 *      且其 `watermarkSnapshot` **與該次燒錄之浮水印字串逐字相同**；Given `AC-D12` 之非 PDF 下載成功,
 *      Then **同樣寫入該筆稽核**，惟 `watermarkSnapshot` 為 `null`。**燒錄與否不改變稽核義務。**」
 *   · docs/specs/features/F020-watermark.md `AC-D5`（`watermarkSnapshot` 落值規則之橫切宣告）
 *   · docs/specs/architecture-spec.md §10.1（使用表單前台下載作**與附錄逐字相同**之改動；
 *     快照取自 `WatermarkService.buildSnapshot()`——**不得自行組字**，快照為疊加／燒錄／稽核三者之唯一共同來源）
 *
 * 📌 **本檔之範圍刻意只有 `AC-D14`**（lead 指派之 `G-L2-01` 補洞）：
 *   `AC-D11`（燒錄位元組）／`AC-D12`（非 PDF 原檔與 UI 文案）／`AC-D13`（後台 RAW 回歸鎖定）
 *   屬 Lane L2 之範圍，**本檔不重複斷言、亦不與其衝突**；此處僅以 burner spy 取得「該次燒錄之
 *   浮水印字串」以完成 `AC-D14` 之逐字比對。
 *
 * 📌 **本檔所釘住之新協作點契約**（由 test-generator 定；spec 只說「與附錄逐字相同之改動」）：
 *   `UsageFormsService` 建構子**第 6 參數＝浮水印燒錄協作點**（前 5 個為既有之
 *   `blob`／`store`／`audit`／`uploaderDir?`／`orgResolver?`）。附錄側之對應注入位置為第 7 參數
 *   （`appendices.front-burn.service.spec.ts`），位置不同係因既有建構子長度不同、非設計分歧。
 *   若實作採不同之注入位置／形狀，請走 mailbox 向 test-generator 申訴，由 test-generator 修改本檔
 *   （實作端不得自行改測試）。
 *
 * ⚠ 對實作全盲：本檔依 spec ＋ architecture 撰寫。現況 `UsageFormAuditEvent` **沒有**
 *   `watermarkSnapshot` 欄位 ⇒ 本檔為**預期紅燈**（型別紅 ＋ 行為紅）。
 */
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
import { WatermarkService, WatermarkOrgLookup, WatermarkSession } from '../public/watermark.service';
import { WATERMARK_CONFIDENTIALITY } from '../public/watermark';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';

// ── 假體（形狀比照 `appendices.front-burn.service.spec.ts`，兩處為同一條管線）──────────

const ORG: Record<string, { tier: string; name: string; descFull: string | null }> = {
  JAC00: { tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室' },
  JA000: { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
};
const fakeOrg = (): WatermarkOrgLookup => ({
  findByOrgCode: (code) => Promise.resolve(ORG[code] ?? null),
});

class FakeBurner {
  calls: { original: Buffer; snapshot: string }[] = [];
  burnPdf(original: Buffer, snapshot: string): Promise<Buffer> {
    this.calls.push({ original, snapshot });
    return Promise.resolve(Buffer.concat([Buffer.from(`BURNED[${snapshot}]`), original]));
  }
}

class NoopAuditWriter implements AuditWriter {
  recordAccess(_e: AuditAccessEvent): Promise<void> {
    return Promise.resolve();
  }
  queryHistory(): never {
    throw new Error('n/a');
  }
  processOutboxRetry(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeAuditRecorder implements AuditRecorder {
  events: UsageFormAuditEvent[] = [];
  record(event: UsageFormAuditEvent): void {
    this.events.push(event);
  }
}

class FakeFormPoolStore implements FormPoolStore {
  seq = 1;
  forms: UsageFormRecord[] = [];
  links: { documentId: string; formId: string }[] = [];

  create(input: CreateFormInput): Promise<UsageFormRecord> {
    const rec: UsageFormRecord = { id: `form-${this.seq++}`, ...input };
    this.forms.push(rec);
    return Promise.resolve(rec);
  }
  findById(formId: string): Promise<UsageFormRecord | null> {
    return Promise.resolve(this.forms.find((f) => f.id === formId) ?? null);
  }
  list(): Promise<UsageFormRecord[]> {
    return Promise.resolve([...this.forms]);
  }
  listPoolOverview(): Promise<never[]> {
    return Promise.resolve([]);
  }
  updateFile(formId: string, patch: UpdateFormFileInput): Promise<UsageFormRecord> {
    const idx = this.forms.findIndex((f) => f.id === formId);
    this.forms[idx] = { ...this.forms[idx], ...patch };
    return Promise.resolve(this.forms[idx]);
  }
  delete(formId: string): Promise<void> {
    this.forms = this.forms.filter((f) => f.id !== formId);
    return Promise.resolve();
  }
  countLinks(formId: string): Promise<number> {
    return Promise.resolve(this.links.filter((l) => l.formId === formId).length);
  }
  listByDocument(documentId: string): Promise<UsageFormRecord[]> {
    const ids = this.links.filter((l) => l.documentId === documentId).map((l) => l.formId);
    return Promise.resolve(this.forms.filter((f) => ids.includes(f.id)));
  }
  link(documentId: string, formId: string): Promise<void> {
    if (!this.links.some((l) => l.documentId === documentId && l.formId === formId)) {
      this.links.push({ documentId, formId });
    }
    return Promise.resolve();
  }
  unlink(documentId: string, formId: string): Promise<void> {
    this.links = this.links.filter((l) => !(l.documentId === documentId && l.formId === formId));
    return Promise.resolve();
  }
  unlinkAll(formId: string): Promise<void> {
    this.links = this.links.filter((l) => l.formId !== formId);
    return Promise.resolve();
  }
}

const T0 = new Date('2026-08-16T02:00:00Z'); // → 10:00:00 (UTC+8)

/** 前台使用者身分（浮水印身分快照所需之完整欄位；`SessionContext` 為其子集）。 */
const VIEWER: SessionContext & WatermarkSession = {
  accountId: 'acc-user-1',
  roleCode: 'User',
  employeeNo: 'E001',
  name: '王小明',
  companyCode: 'AS',
  orgCode: 'JAC00',
  userSubtype: 'other',
};
const ICSOP_ADMIN: SessionContext = { roleCode: 'ICSOPAdmin', accountId: 'admin1' };

const PDF_BYTES = Buffer.from('%PDF-1.4 raw usage form\n', 'utf8');
const XLSX_BYTES = Buffer.from('PK raw xlsx usage form', 'utf8');

const file = (fileName: string, contentType: string, buffer: Buffer): UploadFile => ({
  fileName,
  contentType,
  size: buffer.length,
  buffer,
});
const PDF_FILE = (): UploadFile => file('進件申請書.pdf', 'application/pdf', PDF_BYTES);
const XLSX_FILE = (): UploadFile =>
  file(
    '進件申請書.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    XLSX_BYTES,
  );

function makeHarness() {
  const blob = new FakeBlobStore();
  const store = new FakeFormPoolStore();
  const burner = new FakeBurner();
  const audit = new FakeAuditRecorder();
  const watermark = new WatermarkService(
    fakeOrg(),
    { getOriginalPdf: () => Promise.resolve(null) },
    burner,
    new NoopAuditWriter(),
    undefined,
    () => T0,
  );
  // 第 4／5 參數為既有之選填 uploaderDir／orgResolver（本檔用不到，傳 undefined）；
  // **第 6 參數＝浮水印燒錄協作點**（本環所訂之注入位置，可申訴，見檔頭）。
  const svc = new UsageFormsService(blob, store, audit, undefined, undefined, watermark);
  return { svc, blob, store, burner, audit, watermark };
}

/** 以真實上傳路徑種入一份表單並關聯至 `documentId`（避免手刻 blob 內容與 store 列不同步）。 */
async function seed(
  svc: UsageFormsService,
  upload: UploadFile,
  documentId = 'doc-42',
): Promise<UsageFormRecord> {
  const rec = await svc.uploadForm(ICSOP_ADMIN, upload);
  await svc.linkForms(ICSOP_ADMIN, documentId, [rec.id]);
  return rec;
}

// ── AC-D14：稽核義務不變 ＋ 快照落值 ────────────────────────────────────────

describe('F018 AC-D14：前台使用表單下載之稽核（PDF 已燒錄）', () => {
  it('TS-F018-D14-001 恰新增一筆 targetType=USAGE_FORM／actionType=DOWNLOAD，formId＋documentId 落列', async () => {
    const { svc, audit } = makeHarness();
    const rec = await seed(svc, PDF_FILE(), 'doc-42');
    audit.events.length = 0; // 排除上傳／關聯路徑之干擾，只計本次下載

    await svc.downloadForm(VIEWER, 'doc-42', rec.id);

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0].targetType).toBe('USAGE_FORM');
    expect(audit.events[0].actionType).toBe('DOWNLOAD');
    expect(audit.events[0].formId).toBe(rec.id);
    expect(audit.events[0].documentId).toBe('doc-42');
    expect(audit.events[0].accountId).toBe('acc-user-1');
  });

  it('TS-F018-D14-002 🔴 watermarkSnapshot 與**該次燒錄**之浮水印字串逐字相同', async () => {
    const { svc, audit, burner } = makeHarness();
    const rec = await seed(svc, PDF_FILE());
    audit.events.length = 0;

    await svc.downloadForm(VIEWER, 'doc-42', rec.id);

    expect(burner.calls).toHaveLength(1); // 前提：本次確有燒錄（AC-D11 之最小佐證）
    expect(audit.events[0].watermarkSnapshot).toBe(burner.calls[0].snapshot);
  });

  it('TS-F018-D14-003 🔴 快照唯一來源＝WatermarkService.buildSnapshot()（不得自行組字）', async () => {
    const { svc, audit, watermark } = makeHarness();
    const rec = await seed(svc, PDF_FILE());
    audit.events.length = 0;

    const { snapshot: viewerSnapshot } = await watermark.buildSnapshot(VIEWER);
    await svc.downloadForm(VIEWER, 'doc-42', rec.id);

    expect(audit.events[0].watermarkSnapshot).toBe(viewerSnapshot);
    // 逐字形狀（與 F020 檢視器同一時刻所得相同；僅時間戳依當下產生）
    // 🔴 2026-08-21 D9 delta（AC-N12；impl-be 申訴 2，經覆核＝屬實並裁決 A）：公司名稱欄改用簡稱。
    // OLD> `E001-王小明-和潤企業股份有限公司-營運管理部-審查室-{機密聲明}-2026-08-16 10:00:00 (UTC+8)`
    expect(viewerSnapshot).toBe(
      `E001-王小明-和潤企業-營運管理部-審查室-${WATERMARK_CONFIDENTIALITY}-2026-08-16 10:00:00 (UTC+8)`,
    );
  });
});

describe('F018 AC-D14：前台使用表單下載之稽核（非 PDF 未燒錄）', () => {
  it('TS-F018-D14-004 xlsx → **同樣寫入該筆稽核**（燒錄與否不改變稽核義務）', async () => {
    const { svc, audit, burner } = makeHarness();
    const rec = await seed(svc, XLSX_FILE(), 'doc-7');
    audit.events.length = 0;

    await svc.downloadForm(VIEWER, 'doc-7', rec.id);

    expect(burner.calls).toHaveLength(0); // 前提：非 PDF 不燒錄（AC-D12 之最小佐證）
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0].targetType).toBe('USAGE_FORM');
    expect(audit.events[0].actionType).toBe('DOWNLOAD');
    expect(audit.events[0].formId).toBe(rec.id);
    expect(audit.events[0].documentId).toBe('doc-7');
  });

  it('TS-F018-D14-005 xlsx → watermarkSnapshot 恰為 null（非空字串、非 undefined、非佔位字）', async () => {
    const { svc, audit } = makeHarness();
    const rec = await seed(svc, XLSX_FILE());
    audit.events.length = 0;

    await svc.downloadForm(VIEWER, 'doc-42', rec.id);

    // `toBeNull()` 已蘊含「非空字串／非 undefined」——原本另寫的那兩條是恆真的裝飾，已刪除。
    expect(audit.events[0].watermarkSnapshot).toBeNull();
  });

  it('TS-F018-D14-006 兩種格式之稽核筆數相同（1:1），僅 watermarkSnapshot 之落值不同', async () => {
    const { svc, audit, burner } = makeHarness();
    const pdf = await seed(svc, PDF_FILE(), 'doc-1');
    const xlsx = await seed(svc, XLSX_FILE(), 'doc-1');
    audit.events.length = 0;

    await svc.downloadForm(VIEWER, 'doc-1', pdf.id);
    await svc.downloadForm(VIEWER, 'doc-1', xlsx.id);

    expect(audit.events).toHaveLength(2);
    expect(audit.events[0].watermarkSnapshot).toBe(burner.calls[0].snapshot);
    expect(audit.events[1].watermarkSnapshot).toBeNull();
  });
});

/**
 * 🔴🔴 D9 delta（2026-08-20，`OQ-D9-08` 選項 B，全面推翻 `OQ-FM-01`）：後台受控下載改為一律
 * 燒錄＋寫稽核。權威：docs/specs/features/F020-watermark.md#backend-burn-delta `AC-N14`～`AC-N18`；
 * docs/specs/features/F023-audit-logging.md#d9-audit-delta `AC-N51`。
 *
 * 📌 **本檔（burner 已於 `makeHarness()` 第 6 參數注入）為驗證「後台下載 PDF 格式時是否真的燒錄」
 * 之正確載體**——`usage-forms.service.spec.ts` 之 bare `svc`（未注入 burner）僅能驗證非 PDF 半段
 * （格式驅動、不受 D9 影響），PDF 燒錄之正向斷言必須在本檔（見該檔對應案之取捨說明）。
 *
 * ✅ **`downloadFormRaw()` 符號名與簽章——已由 architect 於 2026-08-21 裁定並查證兌現**
 * （§11.6 v1.9a，`33a8529`）：`downloadFormRaw()` 確實存在（`usage-forms.service.ts:429`，實跑
 * stack trace 已證實），簽章為 **`downloadFormRaw(session, documentId, formId)`**——與姊妹方法
 * `downloadForm(session, documentId, formId)`（`:457-460`）參數順序一致。原提報之「與 `TS-FM-003`／
 * `TS-FM-004`（`usage-forms.service.spec.ts`）疑似路徑歸屬落差」**已由 architect 查明並非衝突**：
 * Supervisor／DeptContact 確實有**兩條獨立且各自自洽**之路徑——`downloadFormRaw()`（後台唯讀頁）
 * 與 `downloadForm()`（前台公開詳情頁，服務層直呼，`TS-FM-003`／`TS-FM-004` 緊鄰註解已明載「本案
 * 走前台」），兩者皆維持不動、皆為既有合法呼叫點，**不是**「一條 route 兩個相衝呼叫端」。
 * 🔴 **本次查證同時揪出真缺口**：`usage-forms.controller.ts:195` 現行把路由參數宣告為
 * `@Param('documentId') _documentId`（底線前綴、從未使用、呼叫時未傳給 service）——見下方 AC-N14
 * ／AC-N51 案之詳細裁定記錄。
 */
describe('D9 delta — 後台受控下載改為一律燒錄＋寫稽核（AC-N14／AC-N51；全面推翻 OQ-FM-01）', () => {
  it('AC-N14 downloadFromPool（表單池管理頁）PDF 下載 → burnPdf 恰呼叫 1 次，回傳已燒錄位元組', async () => {
    const { svc, burner } = makeHarness();
    const rec = await svc.uploadForm(ICSOP_ADMIN, PDF_FILE());

    const out = await svc.downloadFromPool(ICSOP_ADMIN, rec.id);

    expect(burner.calls).toHaveLength(1);
    expect(out.bytes.equals(PDF_BYTES)).toBe(false); // 燒錄必然改變位元組
  });

  it('AC-N15 downloadFromPool 非 PDF（xlsx）→ 策略 A 於後台亦適用：burnPdf 呼叫次數為 0', async () => {
    const { svc, burner } = makeHarness();
    const rec = await svc.uploadForm(ICSOP_ADMIN, XLSX_FILE());

    const out = await svc.downloadFromPool(ICSOP_ADMIN, rec.id);

    expect(burner.calls).toHaveLength(0);
    expect(out.bytes.equals(XLSX_BYTES)).toBe(true);
  });

  it('AC-N51 downloadFromPool PDF 下載成功 → AUDIT_LOG 恰新增一筆，documentId 為 null（池管理頁脈絡）、watermarkSnapshot 落值', async () => {
    const { svc, audit, burner } = makeHarness();
    const rec = await svc.uploadForm(ICSOP_ADMIN, PDF_FILE());

    await svc.downloadFromPool(ICSOP_ADMIN, rec.id);

    expect(audit.events).toHaveLength(1);
    const e = audit.events[0];
    expect(e.targetType).toBe('USAGE_FORM');
    expect(e.actionType).toBe('DOWNLOAD');
    expect(e.formId).toBe(rec.id);
    expect(e.documentId ?? null).toBeNull();
    expect(e.watermarkSnapshot).toBe(burner.calls[0].snapshot);
  });

  it('AC-N16 無例外角色：SysAdmin 自後台下載同一份 PDF → 同樣取得已燒錄位元組（burnPdf 呼叫次數為 1）', async () => {
    const { svc, burner } = makeHarness();
    const rec = await svc.uploadForm(ICSOP_ADMIN, PDF_FILE());
    const sys: SessionContext = { roleCode: 'SysAdmin', accountId: 'sys-1' };

    await svc.downloadFromPool(sys, rec.id);

    expect(burner.calls).toHaveLength(1);
  });

  /**
   * 🔴 `downloadFormRaw()`——見本 describe 檔頭關於此符號名來源與風險之說明。若此方法於
   * 實作中不存在（TS2339），視為前述風險已兌現，屬需經 mailbox 申訴之情形，非測試本身之錯誤。
   */
  /**
   * 🔴 2026-08-21 architect 裁定（§11.6 v1.9a，`33a8529`）：`downloadFormRaw(session, documentId,
   * formId)`——與姊妹方法 `downloadForm(session, documentId, formId)`（`usage-forms.service.ts:
   * 457-460`）參數順序一致。**真缺口**：`usage-forms.controller.ts:195` 現行把路由參數宣告為
   * `@Param('documentId') _documentId`（底線前綴、從未使用、呼叫時未傳），舊 docblock「documentId
   * 不參與查找」在「RAW、不寫稽核」之舊語意下成立，但 `AC-N17` 要求本路徑寫稽核時 `documentId`
   * 必須落列，舊理由不再成立——此為 architect 依我原提報之落差親查後找到的真正缺口，非我方測試誤判。
   * 📝 **被更正之原斷言逐字保留供追溯**（我方一度依實跑報錯之表面現象誤校正為相反順序）：
   *   OLD> `const out = await svcAny.downloadFormRaw(supervisor, rec.id, 'doc-42');`
   *   （即 `(session, formId, documentId)`——與裁定之 `(session, documentId, formId)` 相反）
   * 🔴 **鑑別力（防「兩參數皆 string，TS 抓不到對調」）**：`documentId`（`'doc-42'`）與 `formId`
   * （`rec.id`，`FakeFormPoolStore` 產生之 `form-N` 格式）為刻意不同形狀之值，並**分別**斷言
   * `audit.events[0].documentId` 與 `audit.events[0].formId`——若實作把兩參數對調，`documentId`
   * 會被錯誤地寫入 `rec.id`（或反之），兩條斷言至少一條會紅；若兩值恰好長得像，此斷言即恆真
   * （比照「三種 fixture 缺陷」第三種），本案已刻意避開此陷阱。
   */
  it('AC-N14／AC-N51 downloadFormRaw（後台唯讀/編輯頁下載，architecture §11.6 v1.9a 裁定簽章）PDF → 燒錄 1 次且寫稽核，documentId／formId 皆正確落列（不得對調）', async () => {
    const { svc, audit, burner } = makeHarness();
    const rec = await svc.uploadForm(ICSOP_ADMIN, PDF_FILE());
    await svc.linkForms(ICSOP_ADMIN, 'doc-42', [rec.id]);
    audit.events.length = 0; // 排除上傳/關聯路徑之干擾

    const svcAny = svc as unknown as {
      downloadFormRaw: (session: SessionContext, documentId: string, formId: string) => Promise<{ bytes: Buffer }>;
    };
    const supervisor: SessionContext = { roleCode: 'Supervisor', accountId: 'sup-1' };
    const out = await svcAny.downloadFormRaw(supervisor, 'doc-42', rec.id);

    expect(burner.calls).toHaveLength(1);
    expect(out.bytes.equals(PDF_BYTES)).toBe(false);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0].documentId).toBe('doc-42');
    expect(audit.events[0].formId).toBe(rec.id); // 與 documentId 分開斷言，防參數對調
  });
});

describe('F018 AC-D14：失敗路徑不得留下稽核（既有語意不變）', () => {
  it('TS-F018-D14-007 未登入（無 accountId）→ FILE_ACCESS_DENIED，不燒錄、不寫稽核', async () => {
    const { svc, audit, burner } = makeHarness();
    const rec = await seed(svc, PDF_FILE());
    audit.events.length = 0;

    await expect(svc.downloadForm({ roleCode: 'User' }, 'doc-42', rec.id)).rejects.toThrow(
      'FILE_ACCESS_DENIED',
    );
    expect(burner.calls).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });

  it('TS-F018-D14-008 表單不存在 → 拋錯，不燒錄、不寫稽核', async () => {
    const { svc, audit, burner } = makeHarness();
    await seed(svc, PDF_FILE());
    audit.events.length = 0;

    await expect(svc.downloadForm(VIEWER, 'doc-42', 'form-missing')).rejects.toThrow();
    expect(burner.calls).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });
});
