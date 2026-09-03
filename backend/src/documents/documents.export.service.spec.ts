import { DocumentsService } from './documents.service';
import {
  DocumentStore,
  CreateDocumentInput,
  DocumentPatch,
  DocumentView,
  DocumentListFilters,
  DocumentListItem,
  DocumentListPage,
  DocumentSummary,
  DocSecondaryChiefRef,
} from './documents.store';
import { NumberHolder } from './document-rules';
import { DocumentStatus } from './document-status';
import { DocumentLink, DocumentLinkStore } from './document-link.store';
import {
  AttachmentStore,
  DocumentAttachmentRecord,
  SingleAttachmentType,
  UpsertAttachmentInput,
} from '../attachments/attachments.store';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { EXPORT_ROW_LIMIT, formatExportTimestamp } from '../storage/csv-export';

/**
 * F017 §清單匯出（CSV）delta —— `DocumentsService.exportDocuments()` 之約束環（後端服務層）。
 *
 * 權威（逐條，不得以他處覆蓋）：
 *  - `docs/specs/features/F017-backend-document-list.md` §export-delta
 *    `AC-X1`（BOM／14 欄逐字表頭／RFC 4180／CRLF／列序）｜`AC-X2`（值層通則、注入前綴）｜
 *    `AC-X3`（14 欄逐欄語意）｜`AC-X4`（OJT 三值標籤）｜`AC-X5`（當責室長主要∪次要、全形頓號、去重、員編 fallback）｜
 *    `AC-X6`（連結點欄＝共用 `joinLinkedDocumentNumbers()`、命中排第一、`targetNumber===null` 跳過）｜
 *    `AC-X7`（狀態＝衍生標籤；🔴 `today` **不得**套 `toTaipei()`）｜`AC-X8`（公告日期 `YYYY-MM-DD`）｜
 *    `AC-X11` ②③（列序＝請求原序、逐格值）｜`AC-X12`／`AC-X13`（上限、空結果、檔名）｜
 *    `AC-X15`（禁 N+1、load-all ＋ 交集 ＋ 重排 ＋ 五個既有 enrich）｜`AC-X16` ⑤（store 介面一格未動）
 *  - `docs/specs/architecture-spec.md` §13.2 ⑤（回應位元組）／§13.3（值層落點與四步讀取路徑）／
 *    §13.4（(i)(ii)(iii)(iv) 四條子命題與其斷言形狀）
 *  - `docs/specs/error-handling.md#export`（v1.9，五處匯出共用之值層通則）
 *  - `prototypes/13-document-list.html`：`EXPORT_HEADER`（L1022）／`exportRow()`（L1049-1069）／
 *    `buildExportCsv()`（L1072-1075）／`doExport()`（L1076-1091）為版面與逐字權威
 *
 * ⚠ **對實作全盲**：`DocumentsService.exportDocuments()` 於本環撰寫時**尚不存在**。以區域介面 cast
 *    取用（`asExport(svc)`），使紅燈落在**逐條斷言**上而非整檔 TS2339 編譯紅。
 *
 * 📌 **本環所訂之契約（規格只定方法名與參數，未定回傳形狀）**：
 *    `exportDocuments(documentIds: string[], linkTargetId?: string): Promise<{ csv: Buffer; fileName: string }>`
 *    ——逐字同型於既有 `AppendicesService.exportPool()`／`UsageFormsService.exportPool()`
 *    （architecture §13.2 ③⑥ 明文「完全同型」）。⚠ 若實作採不同回傳形狀，請走 mailbox 申訴。
 *
 * 🔴 **本檔刻意不做之事**：
 *  · **不驗證 `documentIds` 缺席／非陣列／長度上限之錯誤路徑**——`AC-X12` 明訂「🔒 不得有第二處檢查」，
 *    若本檔與 controller 檔各驗一次，其中一處必然為紅（無論實作把檢查點放哪）。該批斷言**單點**落在
 *    `documents.export.controller.spec.ts`（＝ `AC-X17` 所述之「呼叫匯出端點」層）。
 *  · **不重複斷言 `cell()`／`toCsvBuffer()` 之個別行為**（§13.4 (iv)：已由既有 `csv-export.spec.ts` 覆蓋）——
 *    本檔只驗「匯出路徑確實走同一個產生器」之接線（注入前綴、RFC 4180、BOM 各一條代表案）。
 */

// ── 本環所訂之呼叫契約（見檔頭 📌）─────────────────────────────────────────
interface ExportResult {
  csv: Buffer;
  fileName: string;
}
interface ExportCapableService {
  exportDocuments(documentIds: string[], linkTargetId?: string): Promise<ExportResult>;
}
const asExport = (svc: DocumentsService): ExportCapableService =>
  svc as unknown as ExportCapableService;

/**
 * `AC-X1` ②：原十四欄逐字表頭（權威＝prototype 13 之 `EXPORT_HEADER`）。
 * 🔴 2026-09-02 F043 delta（F017 `AC-B9` ①）：14 → **15** 欄，新欄「業務/功能類別」置於最末；
 * 既有 14 個表頭字面與其順序一字不改（`AC-B11`）。舊常數逐字保留供追溯／單獨引用既有 14 欄語意。
 */
const HEADER_14 =
  'OJT,制定公司,制定部門,制定室別,當責室長,狀態,檔案,程序書編號,程序書書名,版次,內容摘要,連結點程序書,公告日期,循環別';
const HEADER = `${HEADER_14},業務/功能類別`;

/** `AC-X7` 可測形狀：釘死於**台北 00:00–08:00 窗口內**之「現在」（UTC 17:00 ＝台北隔日 01:00）。 */
const NOW_TAIPEI_EARLY_MORNING = new Date('2026-06-09T17:00:00.000Z');

// ── 替身 ────────────────────────────────────────────────────────────────

class FakeNameResolver {
  orgNames = new Map<string, string>();
  personNames = new Map<string, string>();
  orgCalls = 0;
  personCalls = 0;
  resolveOrgUnitName(_companyCode: string, code: string): Promise<string | null> {
    this.orgCalls += 1;
    return Promise.resolve(this.orgNames.get(code) ?? null);
  }
  resolvePersonNames(_companyCode: string, empNos: string[]): Promise<Map<string, string>> {
    this.personCalls += 1;
    const out = new Map<string, string>();
    for (const e of empNos) {
      const n = this.personNames.get(e);
      if (n) out.set(e, n);
    }
    return Promise.resolve(out);
  }
}

class FakeAttachmentStore implements AttachmentStore {
  rows: DocumentAttachmentRecord[] = [];
  findManyByTypeCalls = 0;
  seed(documentId: string, fileName: string): void {
    this.rows.push({
      id: `att-${this.rows.length + 1}`,
      documentId,
      type: 'ICSOP_PDF',
      fileName,
      blobPath: `documents/${documentId}/icsop_pdf/a.pdf`,
      contentType: 'application/pdf',
      size: 1,
      uploadedBy: 'admin',
      uploadedAt: new Date(),
    });
  }
  findSingle(documentId: string, type: SingleAttachmentType) {
    return Promise.resolve(
      this.rows.find((r) => r.documentId === documentId && r.type === type) ?? null,
    );
  }
  findManyByType(documentIds: string[], type: SingleAttachmentType) {
    this.findManyByTypeCalls += 1;
    const set = new Set(documentIds);
    return Promise.resolve(this.rows.filter((r) => r.type === type && set.has(r.documentId)));
  }
  upsertSingle(input: UpsertAttachmentInput) {
    const rec: DocumentAttachmentRecord = { id: 'x', ...input };
    this.rows.push(rec);
    return Promise.resolve(rec);
  }
  findByBlobPath(blobPath: string) {
    return Promise.resolve(this.rows.find((r) => r.blobPath === blobPath) ?? null);
  }
}

class FakeLinkStore implements DocumentLinkStore {
  links: DocumentLink[] = [];
  findBySourcesCalls = 0;
  seed(sourceId: string, targetId: string, n: number): void {
    this.links.push({ id: `l${n}`, sourceDocumentId: sourceId, targetDocumentId: targetId });
  }
  findBySource(sourceId: string): Promise<DocumentLink[]> {
    return Promise.resolve(this.links.filter((l) => l.sourceDocumentId === sourceId));
  }
  findBySources(sourceIds: string[]): Promise<DocumentLink[]> {
    this.findBySourcesCalls += 1;
    const set = new Set(sourceIds);
    return Promise.resolve(this.links.filter((l) => set.has(l.sourceDocumentId)));
  }
  add(sourceId: string, targetId: string): Promise<DocumentLink> {
    const l = { id: `l-${this.links.length + 1}`, sourceDocumentId: sourceId, targetDocumentId: targetId };
    this.links.push(l);
    return Promise.resolve(l);
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

interface OjtCompletionFact {
  totalUnits: number;
  completedOrgCodes: string[];
}
class FakeOjtCompletionReader {
  private byDoc = new Map<string, OjtCompletionFact>();
  calls = 0;
  seed(documentId: string, fact: OjtCompletionFact): void {
    this.byDoc.set(documentId, fact);
  }
  getCompletionByDocument(documentIds: string[]): Promise<Map<string, OjtCompletionFact>> {
    this.calls += 1;
    const out = new Map<string, OjtCompletionFact>();
    for (const id of documentIds) {
      out.set(id, this.byDoc.get(id) ?? { totalUnits: 0, completedOrgCodes: [] });
    }
    return Promise.resolve(out);
  }
}

/**
 * 🔴 `AC-X11` 可測形狀 ②／§13.4 (ii)：`list()` **刻意以與請求相反之順序**回傳工作集。
 * fake 若依序回傳，「有沒有依請求原序重排」完全測不出來。
 */
class FakeStore implements DocumentStore {
  rows: DocumentListItem[] = [];
  secondaryChiefs: DocSecondaryChiefRef[] = [];
  listCalls: DocumentListFilters[] = [];
  findSummariesCalls = 0;
  secondaryChiefCalls = 0;
  /** 🔒 匯出**無副作用**：以下三者一律不得被呼叫。 */
  writeCalls: string[] = [];

  seedRow(row: DocumentListItem): DocumentListItem {
    this.rows.push(row);
    return row;
  }
  seedSecondaryChief(documentId: string, employeeNo: string): void {
    this.secondaryChiefs.push({ documentId, employeeNo });
  }

  list(filters: DocumentListFilters): Promise<DocumentListPage> {
    this.listCalls.push(filters);
    // 🔴 逆序回傳（見上方註記）；同時深拷貝，避免富化就地改寫污染 fixture。
    const items = [...this.rows].reverse().map((r) => ({ ...r, links: [...r.links] }));
    return Promise.resolve({
      items,
      total: items.length,
      page: 1,
      pageSize: filters.pageSize ?? 0,
      hasNext: false,
    });
  }
  findSummaries(ids: string[]): Promise<DocumentSummary[]> {
    this.findSummariesCalls += 1;
    const set = new Set(ids);
    return Promise.resolve(
      this.rows
        .filter((r) => set.has(r.id))
        .map((r) => ({
          id: r.id,
          documentNumber: r.documentNumber,
          documentName: r.documentName,
          status: r.status,
        })),
    );
  }
  findSecondaryChiefsByDocumentIds(documentIds: string[]): Promise<DocSecondaryChiefRef[]> {
    this.secondaryChiefCalls += 1;
    const set = new Set(documentIds);
    return Promise.resolve(this.secondaryChiefs.filter((r) => set.has(r.documentId)));
  }
  findNumberHolders(): Promise<NumberHolder[]> {
    return Promise.resolve([]);
  }
  findById(): Promise<DocumentView | null> {
    return Promise.resolve(null);
  }
  create(_input: CreateDocumentInput): Promise<DocumentView> {
    this.writeCalls.push('create');
    return Promise.reject(new Error('匯出不得寫入'));
  }
  update(_id: string, _patch: DocumentPatch): Promise<DocumentView> {
    this.writeCalls.push('update');
    return Promise.reject(new Error('匯出不得寫入'));
  }
  updateStatus(_id: string, _status: DocumentStatus): Promise<void> {
    this.writeCalls.push('updateStatus');
    return Promise.reject(new Error('匯出不得寫入'));
  }
}

// ── fixture 工廠 ────────────────────────────────────────────────────────

/**
 * 🔴 F043 delta：`businessCategories` 於本環撰寫時尚未存在於 `DocumentListItem`（決策 E5 之
 * additive 欄，等實作補上）。`over` 之型別以本地交集顯式允許該鍵（非 `any`），使呼叫端仍有型別
 * 檢查；回傳值以 `as unknown as DocumentListItem` 逐點繞過「多出一個既有型別沒有的屬性」之
 * excess-property 檢查——刻意讓紅燈落在「實際存取該欄之斷言」上，而非整檔編譯紅吞掉既有測試。
 */
type RowOverride = Partial<DocumentListItem> & {
  id: string;
  businessCategories?: { id: string; displayName: string }[];
};
const row = (over: RowOverride): DocumentListItem =>
  ({
    companyCode: 'AS',
    status: 'active',
    documentNumber: `N-${over.id}`,
    documentName: `書名-${over.id}`,
    lifecycleId: 'lc1',
    lifecycleName: '銷售及收款循環',
    nodeId: null,
    draftingDeptId: 'A2000',
    draftingSectionId: null,
    draftingCompanyName: null,
    draftingDeptName: null,
    draftingSectionName: null,
    primaryChiefId: null,
    primaryChiefName: null,
    secondaryChiefCount: 0,
    secondaryChiefNames: [],
    edition: null,
    announcedDate: null,
    contentSummary: null,
    icsopPdfBlobPath: null,
    icsopPdfFileName: null,
    links: [],
    // 🔴 F043 delta（決策 E5）：additive 新增欄，預設無掛載（去重後之相異類別，依 displayName 排序）。
    businessCategories: [] as { id: string; displayName: string }[],
    ...over,
  }) as unknown as DocumentListItem;

/**
 * F043 決策 E5：`BusinessCategoryDocsStore.listCategoriesByDocumentIds()` 之最小消費介面
 * （§14.6.4 明文簽章：`(documentIds: string[]) => Promise<Map<string, {id,displayName}[]>>`）。
 * 📌 本環所訂之契約：`DocumentsService` 建構子新增之第 10 個位置參數即消費此介面（未定精確型別名，
 * 若實作採不同參數位置/型別名，請走 mailbox 申訴）。
 */
interface BusinessCategoryDocsLookup {
  listCategoriesByDocumentIds(documentIds: string[]): Promise<Map<string, { id: string; displayName: string }[]>>;
}
class FakeBusinessCategoryDocsStore implements BusinessCategoryDocsLookup {
  byDocument = new Map<string, { id: string; displayName: string }[]>();
  calls = 0;
  seed(documentId: string, categories: { id: string; displayName: string }[]): void {
    this.byDocument.set(documentId, categories);
  }
  listCategoriesByDocumentIds(documentIds: string[]): Promise<Map<string, { id: string; displayName: string }[]>> {
    this.calls += 1;
    const out = new Map<string, { id: string; displayName: string }[]>();
    for (const id of documentIds) out.set(id, this.byDocument.get(id) ?? []);
    return Promise.resolve(out);
  }
}

interface Harness {
  svc: DocumentsService;
  store: FakeStore;
  names: FakeNameResolver;
  attachments: FakeAttachmentStore;
  linkStore: FakeLinkStore;
  ojt: FakeOjtCompletionReader;
  businessCategoryDocs: FakeBusinessCategoryDocsStore;
}

/** 建構子位置參數（既有簽章＋F043 additive 第 10 參）：(store, publisher, nameResolver, linkStore, attachmentStore, nodeNameStore, lifecycleStore, dagStore, ojtCompletionReader, businessCategoryDocsLookup)。 */
function makeHarness(): Harness {
  const store = new FakeStore();
  const names = new FakeNameResolver();
  const attachments = new FakeAttachmentStore();
  const linkStore = new FakeLinkStore();
  const ojt = new FakeOjtCompletionReader();
  const businessCategoryDocs = new FakeBusinessCategoryDocsStore();
  /**
   * 🔴 F043 delta：建構子第 10 參於本環撰寫時尚不存在（既有簽章僅 1–9 參，TS2554）。
   * 以建構子型別本身之區域轉型繞過**參數個數**檢查（型別系統對 arity 之檢查無法用參數層級的
   * `as` 繞過，須轉型建構子本身），刻意讓紅燈落在「業務類別確實被查詢/格式化」之個別斷言上，
   * 而非整檔編譯紅吞掉本檔其餘 AC-X1～AC-X17 之既有測試。
   */
  const DocumentsServiceCtor = DocumentsService as unknown as new (
    ...args: unknown[]
  ) => DocumentsService;
  const svc = new DocumentsServiceCtor(
    store,
    undefined,
    names as unknown as NameResolutionService,
    linkStore,
    attachments,
    undefined,
    undefined,
    undefined,
    ojt as unknown as never,
    businessCategoryDocs,
  );
  return { svc, store, names, attachments, linkStore, ojt, businessCategoryDocs };
}

/** 位元組 → 原始文字（跳過 BOM，保留 CRLF 與引號，供 `AC-X1` ①③④ 之位元組層斷言）。 */
const rawText = (buf: Buffer): string => buf.subarray(3).toString('utf8');

/** RFC 4180 解析（支援欄內逗號／換行／`""` 逸出），回傳 records[][]。 */
function parseCsv(buf: Buffer): string[][] {
  const text = rawText(buf);
  const records: string[][] = [];
  let record: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      record.push(cur);
      cur = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      record.push(cur);
      cur = '';
      records.push(record);
      record = [];
      i += 1;
    } else {
      cur += c;
    }
  }
  if (cur !== '' || record.length > 0) {
    record.push(cur);
    records.push(record);
  }
  return records;
}

/** 表頭以外之資料列（已解析）。 */
const dataRows = (buf: Buffer): string[][] => parseCsv(buf).slice(1);

// ══════════════════════════════════════════════════════════════════════════

describe('F017 AC-X1／AC-X13：CSV 位元組格式、十四欄逐字表頭與空結果', () => {
  it('AC-X1 ① 位元組以 UTF-8 BOM（EF BB BF）開頭', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    const { csv } = await asExport(svc).exportDocuments(['d1']);
    expect([csv[0], csv[1], csv[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('AC-X11 ⑤ 回傳之 csv 必須是 **Buffer**（送字串會讓 Express 自行決定編碼、BOM 悄悄壞掉）', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    const { csv } = await asExport(svc).exportDocuments(['d1']);
    expect(Buffer.isBuffer(csv)).toBe(true);
  });

  it('AC-X1 ②／AC-B9 ① 第 1 列逐字為十五欄表頭（＝畫面 16 欄去掉「樹狀圖」；14→15，新欄「業務/功能類別」置末）', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    const { csv } = await asExport(svc).exportDocuments(['d1']);
    expect(rawText(csv).split('\r\n')[0]).toBe(HEADER);
    expect(HEADER.split(',')).toHaveLength(15);
    expect(HEADER.endsWith(',業務/功能類別')).toBe(true);
    // 既有 14 欄字面與順序一字不改（AC-B11 回歸鎖定）。
    expect(HEADER.startsWith(HEADER_14 + ',')).toBe(true);
  });

  it('AC-X1 ⑤ (a)／AC-X16 ①「樹狀圖」不是欄——表頭不得出現該字面', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    const { csv } = await asExport(svc).exportDocuments(['d1']);
    expect(rawText(csv).split('\r\n')[0]).not.toContain('樹狀圖');
  });

  it('AC-X1 ④ 表頭列與每一資料列（含最末一列）皆以 CRLF 終止；不得出現裸 LF', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    store.seedRow(row({ id: 'd2' }));
    const { csv } = await asExport(svc).exportDocuments(['d1', 'd2']);
    const text = rawText(csv);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('AC-X13 `documentIds` 為 0 筆 → 200 之僅含表頭列（十五欄）CSV（非錯誤、非空檔）', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    const { csv } = await asExport(svc).exportDocuments([]);
    expect(rawText(csv)).toBe(`${HEADER}\r\n`);
    expect(csv.length).toBeGreaterThan(3);
  });

  it('AC-X13 檔名形狀為 `documents_{YYYYMMDD}_{HHmmss}.csv`（scope 字面為 documents）', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    const { fileName } = await asExport(svc).exportDocuments(['d1']);
    expect(fileName).toMatch(/^documents_\d{8}_\d{6}\.csv$/);
    expect(fileName.startsWith('appendices_')).toBe(false);
    expect(fileName.startsWith('usage-forms_')).toBe(false);
  });
});

describe('F017 AC-X11 ②／§13.4 (ii)：列序＝請求之 id 原序（後端不得重排）', () => {
  it('🔴 store fake 刻意逆序回傳 → CSV 資料列順序仍為請求之 id 順序', async () => {
    const { svc, store } = makeHarness();
    for (const id of ['a', 'b', 'c', 'd']) store.seedRow(row({ id, documentNumber: `N-${id}` }));
    const requested = ['c', 'a', 'd', 'b'];
    const { csv } = await asExport(svc).exportDocuments(requested);
    // 第 8 欄（index 7）＝程序書編號
    expect(dataRows(csv).map((r) => r[7])).toEqual(['N-c', 'N-a', 'N-d', 'N-b']);
  });

  it('🔒 自證：本 fake 之回傳序確實與請求序相異（否則上一案對「完全不重排」之實作恆真）', async () => {
    const { store } = makeHarness();
    for (const id of ['a', 'b', 'c', 'd']) store.seedRow(row({ id }));
    const page = await store.list({ pageSize: EXPORT_ROW_LIMIT });
    expect(page.items.map((i) => i.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('AC-X17 ④／§13.4 (i) ② 查無之 id → 靜默略過該列，其餘照常輸出（不回 404、不中止）', async () => {
    const { svc, store } = makeHarness();
    for (const id of ['a', 'b']) store.seedRow(row({ id, documentNumber: `N-${id}` }));
    const { csv } = await asExport(svc).exportDocuments(['a', 'ghost', 'b']);
    const rows = dataRows(csv);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r[7])).toEqual(['N-a', 'N-b']);
  });

  it('AC-X17 邊界：`documentIds` 成員重複 → 依請求順序輸出且**僅輸出一次**（取首次出現之位置）', async () => {
    const { svc, store } = makeHarness();
    for (const id of ['a', 'b']) store.seedRow(row({ id, documentNumber: `N-${id}` }));
    const { csv } = await asExport(svc).exportDocuments(['b', 'a', 'b']);
    expect(dataRows(csv).map((r) => r[7])).toEqual(['N-b', 'N-a']);
  });

  it('AC-X17 邊界：空字串成員為合法字串 ⇒ 不觸發驗證錯誤，落入查無並被靜默略過', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'a', documentNumber: 'N-a' }));
    const { csv } = await asExport(svc).exportDocuments(['', 'a']);
    expect(dataRows(csv).map((r) => r[7])).toEqual(['N-a']);
  });
});

describe('F017 AC-X15／AC-X16 ⑤：讀取路徑＝load-all，store 介面一格未動、禁 N+1', () => {
  it('AC-X15 ①（架構 §13.3 步驟 1）`store.list()` 恰呼叫一次，且 `pageSize` ＝ EXPORT_ROW_LIMIT（10000，非 LOAD_SIZE 2000）', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    await asExport(svc).exportDocuments(['d1']);
    expect(store.listCalls).toHaveLength(1);
    expect(store.listCalls[0].pageSize).toBe(EXPORT_ROW_LIMIT);
    expect(EXPORT_ROW_LIMIT).toBe(10_000);
  });

  it('🔴 AC-X11／AC-X16 ⑤ 後端**完全不重跑篩選**——傳給 `store.list()` 之 filters 不得含任何篩選鍵', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    await asExport(svc).exportDocuments(['d1'], 'd-link-target');
    const f = store.listCalls[0] as Record<string, unknown>;
    for (const key of [
      'lifecycleId', 'status', 'keyword', 'documentNumber', 'documentName', 'companyCode',
      'draftingDeptId', 'draftingSectionId', 'primaryChiefId', 'linkTargetId', 'appendixId',
      'formId', 'ojtStatus', 'nodeSubtreeId', 'nodeIdIn', 'sortBy', 'sortDir',
    ]) {
      expect(f[key]).toBeUndefined();
    }
  });

  it('🔴 AC-X15 禁 N+1：匯出 50 筆與匯出 1 筆之 store／resolver／reader 呼叫次數**完全相同**', async () => {
    const snapshot = async (count: number): Promise<Record<string, number>> => {
      const h = makeHarness();
      h.names.orgNames.set('A2000', '企劃部');
      h.names.personNames.set('E009', '王小明');
      const ids: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const id = `d${i}`;
        ids.push(id);
        h.store.seedRow(row({ id, primaryChiefId: 'E009' }));
        h.store.seedSecondaryChief(id, 'E001');
        h.linkStore.seed(id, 'd0', i + 1);
        h.ojt.seed(id, { totalUnits: 2, completedOrgCodes: ['A1'] });
      }
      await asExport(h.svc).exportDocuments(ids);
      return {
        list: h.store.listCalls.length,
        findSummaries: h.store.findSummariesCalls,
        secondaryChiefs: h.store.secondaryChiefCalls,
        attachmentsFindManyByType: h.attachments.findManyByTypeCalls,
        linksFindBySources: h.linkStore.findBySourcesCalls,
        ojtReader: h.ojt.calls,
        resolveOrgUnitName: h.names.orgCalls,
        resolvePersonNames: h.names.personCalls,
        businessCategoryDocs: h.businessCategoryDocs.calls,
      };
    };
    const one = await snapshot(1);
    const many = await snapshot(50);
    expect(many).toEqual(one);
    // 逐列查詢之實作會使下列任一者隨列數線性成長；此處同時釘住其為個位數常數。
    expect(one.list).toBe(1);
    expect(one.ojtReader).toBe(1);
    expect(one.linksFindBySources).toBe(1);
    // 🔴 F043 決策 E5：listCategoriesByDocumentIds 亦為單次批次查詢，不得隨列數線性成長。
    expect(one.businessCategoryDocs).toBe(1);
  });

  it('🔒 匯出**無副作用**：不呼叫任何寫入型 store 方法（不寫稽核、不寫任何資料表）', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    await asExport(svc).exportDocuments(['d1']);
    expect(store.writeCalls).toEqual([]);
  });
});

describe('F017 AC-X12：匯出筆數上限（服務層以既有 assertExportRowLimit 單點檢查）', () => {
  it('AC-X12 恰 10,000 筆 → 成功（邊界值含）', async () => {
    const { svc, store } = makeHarness();
    store.seedRow(row({ id: 'd1' }));
    const ids = Array.from({ length: EXPORT_ROW_LIMIT }, (_, i) => (i === 0 ? 'd1' : `ghost-${i}`));
    const { csv } = await asExport(svc).exportDocuments(ids);
    expect(dataRows(csv)).toHaveLength(1);
  });
});

describe('F017 AC-X11 ③／AC-X3：十四欄逐格值（單一列 fixture，每欄各給一個有鑑別力之值）', () => {
  const SUMMARY = '涵蓋 A、B，並含「引號」與 " 雙引號\n第二行';

  async function exportOneRow(): Promise<string[]> {
    const h = makeHarness();
    h.names.orgNames.set('A2000', '企劃部');
    h.names.personNames.set('E009', '王小明');
    h.names.personNames.set('E001', '李大華');
    h.names.personNames.set('E002', '張三');
    h.store.seedRow(
      row({
        id: 'dX',
        companyCode: 'AS',
        status: 'active',
        documentNumber: 'ICSOP-SRC-101-1-01',
        documentName: '車輛分期進件作業',
        lifecycleName: '銷售及收款循環（子分類A）',
        draftingDeptId: 'A2000',
        // 🔴 `AC-X3` 第 4 列：制定室別為 null → 空儲存格（畫面之 `—` 是佔位符、不是資料）
        draftingSectionId: null,
        primaryChiefId: 'E009',
        edition: "26'01",
        announcedDate: '2026-06-10T00:00:00.000Z',
        contentSummary: SUMMARY,
      }),
    );
    // 連結點三顆（`AC-X11` ③：命中第三顆）；三個目標亦須在工作集內方能解析出編號。
    h.store.seedRow(row({ id: 'd2', documentNumber: 'ICSOP-SRC-101-2-00' }));
    h.store.seedRow(row({ id: 'd5', documentNumber: 'ICSOP-SRC-102-1-01' }));
    h.store.seedRow(row({ id: 'd8', documentNumber: 'ICSOP-CIPS-104-1-01' }));
    h.linkStore.seed('dX', 'd2', 1);
    h.linkStore.seed('dX', 'd5', 2);
    h.linkStore.seed('dX', 'd8', 3);
    h.store.seedSecondaryChief('dX', 'E001');
    h.store.seedSecondaryChief('dX', 'E002');
    h.ojt.seed('dX', { totalUnits: 3, completedOrgCodes: ['A1', 'A2'] }); // → partial
    // 🔴 F043 AC-B9／AC-B3：兩個相異類別（碼位序：'帳' < '授' ⇒ 帳務處理 排在 授信 之前）。
    h.businessCategoryDocs.seed('dX', [
      { id: 'bc-credit', displayName: '授信（消金）' },
      { id: 'bc-fin', displayName: '帳務處理' },
    ]);
    const { csv } = await asExport(h.svc).exportDocuments(['dX'], 'd8');
    return dataRows(csv)[0];
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW_TAIPEI_EARLY_MORNING);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('AC-X11 ③／AC-B9 十五個儲存格逐字（欄序同 AC-X1 ②；新第 15 欄之值為兩相異類別以全形頓號相接、依碼位序排列）', async () => {
    expect(await exportOneRow()).toEqual([
      '部分完成',                                   //  1 OJT           AC-X4
      '和潤企業股份有限公司',                        //  2 制定公司
      '企劃部',                                     //  3 制定部門
      '',                                          //  4 制定室別      null → 空儲存格
      '王小明、李大華、張三',                        //  5 當責室長      AC-X5
      '進度中',                                     //  6 狀態          AC-X7（台北 01:00 之窗口）
      '',                                          //  7 檔案          無附件 → 空儲存格
      'ICSOP-SRC-101-1-01',                        //  8 程序書編號
      '車輛分期進件作業',                            //  9 程序書書名
      "26'01",                                     // 10 版次
      SUMMARY,                                     // 11 內容摘要      全文不截斷
      'ICSOP-CIPS-104-1-01;ICSOP-SRC-101-2-00;ICSOP-SRC-102-1-01', // 12 連結點 AC-X6
      '2026-06-10',                                // 13 公告日期      AC-X8
      '銷售及收款循環（子分類A）',                    // 14 循環別
      '帳務處理、授信（消金）',                       // 15 業務/功能類別 AC-B9（碼位序：帳 < 授）
    ]);
  });

  it('AC-X2 ① 空值欄輸出**空儲存格**，不得輸出字面 `null`／`undefined`', async () => {
    const cells = await exportOneRow();
    expect(cells[3]).toBe('');
    expect(cells[6]).toBe('');
    for (const c of cells) {
      expect(c).not.toBe('null');
      expect(c).not.toBe('undefined');
    }
  });

  it('AC-X2 ② 畫面之空值佔位符 `—`（U+2014）不得出現於任何儲存格', async () => {
    for (const c of await exportOneRow()) expect(c).not.toContain('—');
  });

  it('AC-X1 ③ 內容摘要含逗號／引號／換行 → RFC 4180 包覆並將內部 `"` 逸出為 `""`', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'dQ', contentSummary: 'A,B "quoted"\nC' }));
    const { csv } = await asExport(h.svc).exportDocuments(['dQ']);
    expect(rawText(csv)).toContain('"A,B ""quoted""\nC"');
    expect(dataRows(csv)[0][10]).toBe('A,B "quoted"\nC');
  });

  it('AC-X2 ③ 注入前綴：值以 `=` 開頭 → 前置半形單引號（證明匯出走同一個 `cell()`）', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'dI', documentName: '=cmd|/C calc' }));
    const { csv } = await asExport(h.svc).exportDocuments(['dI']);
    expect(dataRows(csv)[0][8]).toBe("'=cmd|/C calc");
  });

  it('AC-X2 ③ 注入前綴六種字元逐一生效（`=`／`+`／`-`／`@`／Tab／CR）', async () => {
    for (const ch of ['=', '+', '-', '@', '\t', '\r']) {
      const h = makeHarness();
      h.store.seedRow(row({ id: 'dI', edition: `${ch}X` }));
      const { csv } = await asExport(h.svc).exportDocuments(['dI']);
      expect(dataRows(csv)[0][9]).toBe(`'${ch}X`);
    }
  });

  it('AC-X1 🔒 表頭列**不套用**注入前綴（其逐字斷言不受注入防護影響）', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'dI', documentName: '=x' }));
    const { csv } = await asExport(h.svc).exportDocuments(['dI']);
    expect(rawText(csv).split('\r\n')[0]).toBe(HEADER);
  });
});

/**
 * F043 AC-B9／AC-B10（第 15 欄「業務/功能類別」值層規則）—— 本區塊只驗**接線**（匯出路徑確實
 * 呼叫 `listCategoriesByDocumentIds` 並把結果正確格式化進第 15 欄），詳盡之純函式行為（碼位序、
 * 禁 localeCompare、頓號分隔、去重）已窮盡於 `business-category-export-format.spec.ts`／
 * `business-category-grouping.spec.ts`，本檔不重工。
 */
describe('F017 AC-B9／AC-B10：第 15 欄「業務/功能類別」接線', () => {
  it('N=0（未掛載任何類別）→ 第 15 欄為空儲存格（🔴 非 `—`、非 `0`）', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    const cells = dataRows(csv)[0];
    expect(cells).toHaveLength(15);
    expect(cells[14]).toBe('');
    expect(cells[14]).not.toBe('—');
    expect(cells[14]).not.toBe('0');
  });

  it('AC-B3 依 categoryId 去重：同一份文件掛於同類別之 2 節點＋另一類別之 1 節點 → 第 15 欄僅列 2 個相異類別', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    // listCategoriesByDocumentIds 之回傳形狀本身即為「去重後」之類別陣列（去重責任在 store 層，
    // 見 business-category-grouping.spec.ts）；此處以已去重之兩筆模擬其正確輸出，驗證匯出路徑
    // 忠實格式化該陣列，不重新引入任何列數。
    h.businessCategoryDocs.seed('d1', [
      { id: 'bc-credit', displayName: '授信' },
      { id: 'bc-risk', displayName: '風險管理' },
    ]);
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    const cell = dataRows(csv)[0][14];
    expect(cell.split('、')).toHaveLength(2);
  });

  it('🔴 順序忠實反映 listCategoriesByDocumentIds 之輸出並非重新以 localeCompare 排序（接線層不得偷加第二道排序）', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    h.businessCategoryDocs.seed('d1', [
      { id: 'a', displayName: '授信' },
      { id: 'b', displayName: '風險管理' },
      { id: 'c', displayName: '帳務處理' },
    ]);
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    const cell = dataRows(csv)[0][14];
    const byCodePoint = ['授信', '風險管理', '帳務處理'].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    const byLocale = ['授信', '風險管理', '帳務處理'].sort((x, y) => x.localeCompare(y, 'zh-Hant'));
    expect(byCodePoint).not.toEqual(byLocale); // 自證：本語料下兩序不同，具鑑別力
    expect(cell).toBe(byCodePoint.join('、'));
    expect(cell).not.toBe(byLocale.join('、'));
  });

  it('注入前綴：類別顯示名以 `=` 開頭 → 前置半形單引號（與其餘欄一致套用同一個 `cell()`）', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    h.businessCategoryDocs.seed('d1', [{ id: 'bc-x', displayName: '=SUM(A1)' }]);
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    expect(dataRows(csv)[0][14]).toBe("'=SUM(A1)");
  });
});

describe('F017 AC-X4：OJT 欄輸出三值中文標籤，不得輸出列舉代碼', () => {
  const cases: [string, { totalUnits: number; completedOrgCodes: string[] } | null, string][] = [
    ['all', { totalUnits: 2, completedOrgCodes: ['A1', 'A2'] }, '已全部完成'],
    ['partial', { totalUnits: 2, completedOrgCodes: ['A1'] }, '部分完成'],
    ['none', { totalUnits: 2, completedOrgCodes: [] }, '尚未開始'],
    ['缺鍵（未提供事實）', null, '尚未開始'],
  ];

  it.each(cases)('AC-X4 %s → OJT 欄逐字 `%s`', async (_label, fact, expected) => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    if (fact) h.ojt.seed('d1', fact);
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    expect(dataRows(csv)[0][0]).toBe(expected);
  });

  it('🔴 AC-X4 三值之標籤兩兩相異（防「永遠回同一個值」之偽實作全綠）', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'a' }));
    h.store.seedRow(row({ id: 'b' }));
    h.store.seedRow(row({ id: 'c' }));
    h.ojt.seed('a', { totalUnits: 2, completedOrgCodes: ['A1', 'A2'] });
    h.ojt.seed('b', { totalUnits: 2, completedOrgCodes: ['A1'] });
    h.ojt.seed('c', { totalUnits: 2, completedOrgCodes: [] });
    const { csv } = await asExport(h.svc).exportDocuments(['a', 'b', 'c']);
    const labels = dataRows(csv).map((r) => r[0]);
    expect(labels).toEqual(['已全部完成', '部分完成', '尚未開始']);
    expect(new Set(labels).size).toBe(3);
  });

  it('AC-X4 🔴 不得輸出列舉代碼 `all`／`partial`／`none`', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'a' }));
    h.ojt.seed('a', { totalUnits: 2, completedOrgCodes: ['A1'] });
    const { csv } = await asExport(h.svc).exportDocuments(['a']);
    expect(dataRows(csv)[0][0]).not.toMatch(/^(all|partial|none)$/);
  });
});

describe('F017 AC-X5：當責室長欄＝主要 ∪ 次要、全形頓號相接、去重、員編 fallback', () => {
  async function chiefCell(
    over: Partial<DocumentListItem>,
    secondaries: string[],
    names: Record<string, string>,
  ): Promise<string> {
    const h = makeHarness();
    for (const [k, v] of Object.entries(names)) h.names.personNames.set(k, v);
    h.store.seedRow(row({ id: 'd1', ...over }));
    for (const s of secondaries) h.store.seedSecondaryChief('d1', s);
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    return dataRows(csv)[0][4];
  }

  it('AC-X5 主要＋兩位次要 → `王小明、李大華、張三`（全形頓號，前後無空白，主要在前）', async () => {
    expect(
      await chiefCell({ primaryChiefId: 'E009' }, ['E001', 'E002'], {
        E009: '王小明', E001: '李大華', E002: '張三',
      }),
    ).toBe('王小明、李大華、張三');
  });

  it('🔴 AC-X5 分隔符恆為全形頓號 `、`，明文禁用半形逗號（逗號會觸發 RFC 4180 包覆）', async () => {
    const cell = await chiefCell({ primaryChiefId: 'E009' }, ['E001'], {
      E009: '王小明', E001: '李大華',
    });
    expect(cell).toContain('、');
    expect(cell).not.toContain(',');
    expect(cell).not.toContain(';'); // 🔒 與第 12 欄之半形分號刻意不同，不得統一
  });

  it('AC-X5 主要姓名解析失敗（`primaryChiefName` 為 null）→ 以**員編**代入（與畫面 fallback 相同）', async () => {
    expect(await chiefCell({ primaryChiefId: 'E001' }, [], {})).toBe('E001');
  });

  it('AC-X5 主要與次要皆無 → 空儲存格', async () => {
    expect(await chiefCell({ primaryChiefId: null }, [], {})).toBe('');
  });

  it('AC-X5 同一姓名同時出現於主要與次要 → **去重**，只出現一次', async () => {
    expect(
      await chiefCell({ primaryChiefId: 'E009' }, ['E009', 'E001'], {
        E009: '王小明', E001: '李大華',
      }),
    ).toBe('王小明、李大華');
  });
});

describe('F017 AC-X6：連結點程序書欄（共用 joinLinkedDocumentNumbers，半形分號）', () => {
  it('AC-X6 N=0 → 空儲存格（非 `—`、非 `0`）', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    expect(dataRows(csv)[0][11]).toBe('');
  });

  it('AC-X6 分隔符為**半形分號**、前後無空白', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    h.store.seedRow(row({ id: 't1', documentNumber: 'N-T1' }));
    h.store.seedRow(row({ id: 't2', documentNumber: 'N-T2' }));
    h.linkStore.seed('d1', 't1', 1);
    h.linkStore.seed('d1', 't2', 2);
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    expect(dataRows(csv)[0][11]).toBe('N-T1;N-T2');
  });

  it('🔴 AC-X6 目標查無編號（`targetNumber === null`）→ **跳過**，不得產生 `;;` 或前／後綴分號', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    h.store.seedRow(row({ id: 't1', documentNumber: 'N-T1' }));
    h.store.seedRow(row({ id: 't3', documentNumber: 'N-T3' }));
    h.linkStore.seed('d1', 't1', 1);
    h.linkStore.seed('d1', 'deleted-target', 2); // 不在工作集 ⇒ targetNumber 解析為 null
    h.linkStore.seed('d1', 't3', 3);
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    const cell = dataRows(csv)[0][11];
    expect(cell).toBe('N-T1;N-T3');
    expect(cell).not.toContain(';;');
    expect(cell.startsWith(';')).toBe(false);
    expect(cell.endsWith(';')).toBe(false);
  });

  it('AC-X6 `linkTargetId` 命中者排第一顆，其餘維持原相對順序', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    h.store.seedRow(row({ id: 't1', documentNumber: 'N-T1' }));
    h.store.seedRow(row({ id: 't2', documentNumber: 'N-T2' }));
    h.store.seedRow(row({ id: 't3', documentNumber: 'N-T3' }));
    h.linkStore.seed('d1', 't1', 1);
    h.linkStore.seed('d1', 't2', 2);
    h.linkStore.seed('d1', 't3', 3);
    const { csv } = await asExport(h.svc).exportDocuments(['d1'], 't3');
    expect(dataRows(csv)[0][11]).toBe('N-T3;N-T1;N-T2');
  });

  it('AC-X6 未提供 `linkTargetId` → 原序（與上一案相異，證明該參數確實生效）', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    h.store.seedRow(row({ id: 't1', documentNumber: 'N-T1' }));
    h.store.seedRow(row({ id: 't2', documentNumber: 'N-T2' }));
    h.store.seedRow(row({ id: 't3', documentNumber: 'N-T3' }));
    h.linkStore.seed('d1', 't1', 1);
    h.linkStore.seed('d1', 't2', 2);
    h.linkStore.seed('d1', 't3', 3);
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    expect(dataRows(csv)[0][11]).toBe('N-T1;N-T2;N-T3');
  });

  it('🔒 AC-X6 `linkTargetId` 僅供欄內排序，**不得**被用於任何篩選判定（列集合不因它縮減）', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1', documentNumber: 'N-1' }));
    h.store.seedRow(row({ id: 'd2', documentNumber: 'N-2' }));
    h.store.seedRow(row({ id: 't9', documentNumber: 'N-T9' }));
    h.linkStore.seed('d1', 't9', 1); // 只有 d1 連到 t9
    const { csv } = await asExport(h.svc).exportDocuments(['d1', 'd2'], 't9');
    expect(dataRows(csv).map((r) => r[7])).toEqual(['N-1', 'N-2']);
  });

  it('🔒 AC-X6 不輸出書名、不輸出 `targetHasPdf`（畫面該格之可見文字本即只有編號）', async () => {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1' }));
    h.store.seedRow(row({ id: 't1', documentNumber: 'N-T1', documentName: '目標書名XYZ' }));
    h.linkStore.seed('d1', 't1', 1);
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    expect(dataRows(csv)[0][11]).toBe('N-T1');
    expect(rawText(csv)).not.toContain('目標書名XYZ');
  });
});

describe('F017 AC-X7：狀態欄＝衍生顯示標籤；🔴 today 不得套 toTaipei()', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  async function statusCell(over: Partial<DocumentListItem>): Promise<string> {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1', ...over }));
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    return dataRows(csv)[0][5];
  }

  it('AC-X7 active ＋ 公告日期為昨日 → `已公告`', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T03:00:00.000Z'));
    expect(await statusCell({ status: 'active', announcedDate: '2026-06-19T00:00:00.000Z' })).toBe('已公告');
  });

  it('AC-X7 active ＋ 公告日期為明日 → `進度中`', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T03:00:00.000Z'));
    expect(await statusCell({ status: 'active', announcedDate: '2026-06-21T00:00:00.000Z' })).toBe('進度中');
  });

  it('AC-X7 inactive → `失效`；void → `作廢`', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T03:00:00.000Z'));
    expect(await statusCell({ status: 'inactive' })).toBe('失效');
    expect(await statusCell({ status: 'void' })).toBe('作廢');
  });

  it('AC-X7 🔴 **時區鐵則**：now 釘於 UTC 17:00（台北隔日 01:00）＋ 公告日期為該台北日 → `進度中`；若對 today 套了 toTaipei() 會得 `已公告` 而紅', async () => {
    jest.useFakeTimers().setSystemTime(NOW_TAIPEI_EARLY_MORNING); // 台北 2026-06-10 01:00
    expect(await statusCell({ status: 'active', announcedDate: '2026-06-10T00:00:00.000Z' })).toBe('進度中');
  });

  it('AC-X7 🔴 不得輸出儲存值 active／inactive／void', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T03:00:00.000Z'));
    for (const s of ['active', 'inactive', 'void'] as DocumentStatus[]) {
      expect(await statusCell({ status: s })).not.toMatch(/^(active|inactive|void)$/);
    }
  });

  it('AC-X7 active ＋ 公告日期為 null → `進度中`（沿用 deriveDisplayStatus 既有語意）', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T03:00:00.000Z'));
    expect(await statusCell({ status: 'active', announcedDate: null })).toBe('進度中');
  });
});

/**
 * 🔵 **spec 字面同步中之提醒（2026-08-31，lead 裁決；讀到本區塊覺得「測試與 spec 對不上」時請先看這段）**
 *
 * `AC-X8` 現行字面仍寫著「✅ 落點已定案：後端**新增** `export function formatExportDate(value)`，
 * 落於 `csv-export.ts`」，`AC-X16` ⑦ 亦仍為「為此就地放寬」之版本。**該兩處字面已由 lead 裁定作廢、
 * 正由 spec-writer 同步收斂中**（連同 `AC-X6`／`AC-X16` ⑩ 共四處）。
 *
 * 🔴 **裁決（權威，優先於現行 AC 字面）**：**不新增 `formatExportDate()`**，公告日期欄直接用既有
 * `formatExportTimestamp(announcedDate).slice(0, 10)`，`csv-export.ts` **維持一行未改**
 * ——理由＝`AC-X16` ⑦ 得以回到未放寬之嚴格字面，且不產生第二份 `toTaipei()` 位移
 * （那正是當初放寬所要防的東西）。負向鎖見 `documents.export.zero-ripple.spec.ts`。
 *
 * 📌 本 describe 之斷言為 `AC-X8` 自己給的「**可驗證之等式**」，兩案皆滿足 ⇒ 本區塊**不因該字面收斂而需改動**。
 */
describe('F017 AC-X8：公告日期欄＝YYYY-MM-DD（UTC+8），不附時分秒', () => {
  async function dateCell(announcedDate: string | null): Promise<string> {
    const h = makeHarness();
    h.store.seedRow(row({ id: 'd1', announcedDate }));
    const { csv } = await asExport(h.svc).exportDocuments(['d1']);
    return dataRows(csv)[0][12];
  }

  it('AC-X8 逐字 `2026-06-10`，不得附時分秒', async () => {
    const cell = await dateCell('2026-06-10T00:00:00.000Z');
    expect(cell).toBe('2026-06-10');
    expect(cell).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('AC-X8 null → 空儲存格', async () => {
    expect(await dateCell(null)).toBe('');
  });

  it('🔴 AC-X8 UTC 16:00 之後屬台北隔日——對 ISO 字串直接 `.slice(0,10)` 會差一天而紅', async () => {
    expect(await dateCell('2026-06-10T16:30:00.000Z')).toBe('2026-06-11');
  });

  it('AC-X8 可驗證之等式：該儲存格 ≡ `formatExportTimestamp(announcedDate).slice(0, 10)`（同檔同位移，互為交叉檢查）', async () => {
    for (const iso of [
      '2026-06-10T00:00:00.000Z',
      '2026-06-10T15:59:59.000Z',
      '2026-06-10T16:00:00.000Z',
      '2026-12-31T16:00:00.000Z',
    ]) {
      expect(await dateCell(iso)).toBe(formatExportTimestamp(iso).slice(0, 10));
    }
  });
});
