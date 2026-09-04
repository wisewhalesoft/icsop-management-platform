import { resolveCompanyName } from '../org-directory/company-name';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  DOCUMENT_STORE,
  DocumentStore,
  CreateDocumentInput,
  DocumentPatch,
  DocumentView,
  DocumentDetailView,
  DocumentUpdateResult,
  DocumentFieldChange,
  DocumentListFilters,
  DocumentListItem,
  DocumentListPage,
} from './documents.store';
import { NODE_NAME_STORE, NodeNameStore } from './node-name.store';
import {
  OJT_COMPLETION_READER,
  OjtCompletionReader,
  OjtCompletionSummary,
  deriveOjtStatus,
} from './ojt-completion.reader';
import { LIFECYCLE_STORE, LifecycleStore } from '../lifecycle/lifecycle.store';
import { DAG_STORE, DagStore } from '../lifecycle/dag.store';
import { resolveSubtreeFilter } from './subtree-filter';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { missingRequired, isNumberAvailable } from './document-rules';
import { isValidStatus, DocumentStatus } from './document-status';
import { classifyFields } from './document-field-write';
import { normalizeIdList } from './document-org-fields';
import { isUniqueConstraintViolation } from './db-error';
import { normalizeReason } from './status-reason';
import { assertLifecycleSelectable } from './lifecycle-selection';
import {
  DOCUMENT_LINK_STORE,
  DocumentLinkStore,
  DocumentLinkView,
} from './document-link.store';
import { ATTACHMENT_STORE, AttachmentStore } from '../attachments/attachments.store';
import {
  EXPORT_ROW_LIMIT,
  assertExportRowLimit,
  exportFileName,
  toCsvBuffer,
} from '../storage/csv-export';
import { buildDocumentExportColumns } from './document-export-columns';
import {
  BUSINESS_CATEGORY_DOCS_STORE,
  BusinessCategoryDocsStore,
} from '../business-categories/business-category-docs.store';
import {
  DOCUMENT_CHANGE_PUBLISHER,
  DocumentChangePublisher,
  DocumentFieldDelta,
  NoopDocumentChangePublisher,
  toFieldValueString,
  buildCreateChangeDeltas,
} from './document-change-event';

/**
 * 編輯端一律唯讀之欄位：
 *  - `nodeId`：節點寫入僅經 F009 節點抽屜（F026）。
 *
 * 📝 已作廢（⚠ 不得復原）：`companyCode` 一度列於本集合，理由逐字為「文件所屬公司於**建立時**
 *    決定即固定。改動它會使既有 `draftingDeptId`／`draftingSectionId`／`DOC_USING_DEPT.orgCode`
 *    （皆為各公司獨立編碼之 5 碼 orgCode）整批指向別家公司之單位，並直接影響 F041 之資料列
 *    可見性判定」。**2026-09-04 人類裁決推翻**：程序書目錄清單匯入把 126 筆非和潤企業之文件
 *    記成和潤企業（見 migration `1725580800000`），而制定公司唯讀意味著這種錯誤**在畫面上
 *    永遠改不掉**——鎖死擋掉「不小心改錯」的同時，也把「改正」一起擋掉了。
 *    原理由所指的連動風險不因此消失，改由 `update()` 之 1e) 連動清空承接，而非鎖死欄位。
 */
const EDIT_READONLY_PROPS = new Set(['nodeId']);

/** 公司代碼正規化：非字串或去空白後為空 → undefined（＝未提供，交由下一順位來源）。 */
function pickCompanyCode(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s === '' ? undefined : s;
}

/**
 * 變更事件之操作者身分快照（F037）。由 controller 自 SessionUser 帶入；
 * 選填以免破壞既有 `svc.update(role,id,payload)` 手建呼叫（無 actor → 變更日誌 actor 欄落 null）。
 */
export interface DocumentActor {
  accountId?: string | null;
  name?: string | null;
  employeeNo?: string | null;
  /**
   * 🔴 B 階段（多公司）：操作者所屬公司（← `SessionUser.companyCode`）。
   * 建立文件時，酬載未帶「制定公司」則以此為 `ICSOP_DOCUMENT.companyCode` 之歸屬來源。
   */
  companyCode?: string | null;
}

/**
 * ICSOP 文件服務（E04）。RBAC 功能面由 controller guard（ICSOP文件管理 write＝ICSOPAdmin）落實；
 * 本服務另做 F026 欄位面 enforcement、F010 必填、F012 狀態合法、F013 編號唯一。
 * 註：lifecycleId 於本增量為必填參照字串；對 LIFECYCLE 表之 FK 完整性與建立頁循環下拉待 E03（F007）。
 */
@Injectable()
export class DocumentsService {
  private readonly publisher: DocumentChangePublisher;

  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    @Optional()
    @Inject(DOCUMENT_CHANGE_PUBLISHER)
    publisher?: DocumentChangePublisher,
    // F017 名稱解析（org-foundation 共用）；選填以免破壞既有純 store 單測（無 resolver → 名稱留 null）。
    @Optional() private readonly nameResolver?: NameResolutionService,
    // F015 連結點 store；選填（無則 payload 之 links 不落地）。
    @Optional()
    @Inject(DOCUMENT_LINK_STORE)
    private readonly linkStore?: DocumentLinkStore,
    // F017 清單「檔案」欄之附件 store（批次富化；store-token 對 store-token，非 Service 對 Service，
    // 避免 DocumentsService ↔ AttachmentsService 循環相依）。選填以免破壞既有純 store 單測。
    @Optional()
    @Inject(ATTACHMENT_STORE)
    private readonly attachmentStore?: AttachmentStore,
    // G-DOC-205/301 單筆檢視之節點名解析 store（反循環自建 TypeOrm adapter）。選填→無則 nodeName 留 null。
    @Optional()
    @Inject(NODE_NAME_STORE)
    private readonly nodeNameStore?: NodeNameStore,
    // F017 AC-T40／AC-T45（架構決策 C3）：子樹篩選解析所需之唯讀查詢能力。
    // 反循環：DocumentsModule **自建** store 實例（同 AppDataSource 單例），不匯入 LifecycleModule
    // ——比照同模組既有之 ATTACHMENT_STORE／NODE_NAME_STORE 慣例。
    // 選填以免打爆既有純 store 單測（無 → 子樹篩選恆 no-op，既有行為完全不變）。
    @Optional()
    @Inject(LIFECYCLE_STORE)
    private readonly lifecycleStore?: LifecycleStore,
    @Optional()
    @Inject(DAG_STORE)
    private readonly dagStore?: DagStore,
    /**
     * 🔴 F042／F017 `AC-J12`（E11 delta）：文件層 OJT 三值衍生狀態之唯讀來源。
     * 反循環：本模組**自建** `TypeOrmOjtCompletionReader`（同 AppDataSource 單例），
     * **不匯入 `OjtProgressModule`**——比照同模組既有之 ATTACHMENT_STORE／NODE_NAME_STORE
     * ／LIFECYCLE_STORE 慣例（架構 §二）。
     * 選填以免打爆既有純 store 單測（無 → `ojtStatus` 一律降級為 `'none'`，不拋錯）。
     */
    @Optional()
    @Inject(OJT_COMPLETION_READER)
    private readonly ojtCompletionReader?: OjtCompletionReader,
    /**
     * 🔴 F017 `AC-B1`～`AC-B3`（F043 delta，決策 E5）：第 16 欄之唯讀來源。
     * 反循環：**store token 對 store token**（`BusinessCategoriesModule` 匯出該 token），
     * 非 Service 對 Service。選填以免打爆既有純 store 單測（無 → `businessCategories` 留
     * `undefined`，既有行為完全不變）。
     */
    @Optional()
    @Inject(BUSINESS_CATEGORY_DOCS_STORE)
    private readonly businessCategoryDocsStore?: BusinessCategoryDocsStore,
  ) {
    // 預設 no-op 綁定（決策 A）：seam 存在但不落地，rag/F037 併回後覆寫。
    this.publisher = publisher ?? new NoopDocumentChangePublisher();
  }

  /**
   * 建立文件（F010）。payload 為原始酬載；經欄位面清洗與驗證後寫入。
   * 成功後發出 CREATE 變更事件（逐已填欄位一列，oldValue=null，F010 Main Flow 第 7 步）。
   * actor（操作者身分快照，選填）由 controller 自 SessionUser 帶入；無 → 事件 actor 欄落 null。
   */
  async create(
    roleCode: string | undefined,
    payload: Record<string, unknown>,
    actor?: DocumentActor,
  ): Promise<DocumentView> {
    // 1) F026 欄位面：唯讀欄被寫 → 403；系統/未知欄靜默丟棄。
    const { forbidden, ignored } = classifyFields(roleCode, Object.keys(payload));
    if (forbidden.length > 0) {
      throw new ForbiddenException('FIELD_WRITE_FORBIDDEN');
    }
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (!ignored.includes(k)) clean[k] = v;
    }

    // 2) F010 必填（4 核心）。
    const missing = missingRequired(clean);
    if (missing.length > 0) {
      throw new BadRequestException('DOCUMENT_REQUIRED_FIELD_MISSING');
    }

    // 2b) F040 循環選取有效性（INV-4）。刻意置於既有必填檢查**之後**——`lifecycleId` 缺漏歸
    //     DOCUMENT_REQUIRED_FIELD_MISSING（AC-24，既有行為不變更），非本碼。
    await this.assertLifecycleSelection(clean.lifecycleId);

    // 3) F012 狀態合法。
    const status = clean.status as string;
    if (!isValidStatus(status)) {
      throw new BadRequestException('DOCUMENT_STATUS_INVALID');
    }

    // 4) F013 編號唯一（比對有效＋作廢；失效釋出）。
    const documentNumber = (clean.documentNumber as string).trim();
    const holders = await this.store.findNumberHolders(documentNumber);
    if (!isNumberAvailable(documentNumber, holders)) {
      throw new ConflictException('DOCUMENT_NUMBER_DUPLICATE');
    }

    // 🔴 B 階段（多公司）：解析文件所屬公司（`ICSOP_DOCUMENT.companyCode`，NOT NULL）。
    //   ① 酬載之「制定公司」選擇（建立頁該欄標示「選填」）
    //   ② 未選 → 操作者所屬公司（自家公司；等同建立前之單公司語意）
    // 兩者皆無（無 session 之直呼）→ 400。刻意**不**放行 undefined：DB 會以
    // 「Cannot insert the value NULL」擋下，對使用者呈現為無從解讀的 500。
    const companyCode = pickCompanyCode(clean.companyCode) ?? pickCompanyCode(actor?.companyCode);
    if (!companyCode) {
      throw new BadRequestException('DOCUMENT_COMPANY_REQUIRED');
    }

    // F014 多值欄位（次要室長 employeeNo／使用部門 orgCode）：正規化為明確集合（可空）後落地。
    const input: CreateDocumentInput = {
      ...(clean as Omit<CreateDocumentInput, 'status' | 'companyCode'>),
      status: status as DocumentStatus,
      companyCode,
      documentNumber,
      secondaryChiefIds: normalizeIdList(clean.secondaryChiefIds),
      usingDeptIds: normalizeIdList(clean.usingDeptIds),
    };
    // F013 併發第二保險：DB filtered unique index 違反 → 映射 409（不洩漏原始 DB 訊息）。
    let created: DocumentView;
    try {
      created = await this.store.create({
        ...input,
        // 🔴 F042 第五輪：建立時之 **OJT 訓練基準版次＝建立當下之版次**。
        // ⚠ 刻意在此賦值而**不**併入上方之 `input`：`buildCreateChangeDeltas(input)` 逐欄產生
        // CREATE 變更列，帶進去會讓變更歷程多出一列使用者從未填過的欄位。基準版次是系統的
        // 記帳欄，不是使用者填的資料。
        ojtTrainingEdition: input.edition ?? null,
      });
    } catch (e) {
      if (isUniqueConstraintViolation(e)) {
        throw new ConflictException('DOCUMENT_NUMBER_DUPLICATE');
      }
      throw e;
    }

    // F010 建立稽核事件（CREATE）。刻意置於 409/欄位權限攔截之後——建立失敗不應產生任何變更事件
    // （比照 update()/setStatus() 之「失敗不發事件」慣例）。逐已填欄位一列（oldValue=null）。
    // publish 為 fan-out（CompositeDocumentChangePublisher）之附加副作用，已逐訂閱者 try/catch，此處不重複包裹。
    // 🔴 `companyCode` **納入**變更歷程，標籤為「制定公司」（`change-labels.ts` ／
    // 前端 `ChangeHistoryPage.tsx` 兩份鏡射皆已補上）。
    // 📝 已作廢（⚠ 不得復原）：本處一度把 `companyCode` 自 delta 排除，理由是「與制定公司
    //    （`draftingCompanyId`）同源、不重複記一列」。2026-08-27 裁定把 `draftingCompanyId`
    //    整個移除、制定公司即 `companyCode` 之後，該理由不再成立——再排除就等於**建立文件
    //    時選了哪家公司完全不留紀錄**。
    const deltas = buildCreateChangeDeltas(input as unknown as Record<string, unknown>);
    await this.publisher.publish({
      documentId: created.id,
      changeType: 'CREATE',
      changedFields: deltas.map((d) => d.field),
      changes: deltas,
      documentNumber: created.documentNumber,
      actorId: actor?.accountId ?? null,
      actorName: actor?.name ?? null,
      actorEmployeeNo: actor?.employeeNo ?? null,
      occurredAt: new Date(),
    });
    return created;
  }

  /**
   * F012/F013 狀態切換核心（update() 與 setStatus() 共用，杜絕分歧）：
   *  1. 切回「有效」時重驗編號唯一性（排除自身；比對有效＋作廢，失效釋出）。
   *  2. 執行 persist（呼叫端提供：setStatus→updateStatus；update→整批 store.update）。
   *  3. 發 STATUS 變更事件，承載 status 之 old/new ＋ reason（normalizeReason，空白視同未填）＋操作者/編號快照。
   * 狀態未實際改變（oldStatus===newStatus）→ 空 delta（不落地任何日誌，reason 隨之捨棄）。
   * ⚠ 重驗於 persist 之前（失敗則不落地、不發事件）；事件於 persist 之後。
   */
  private async applyStatusTransition(params: {
    docId: string;
    oldStatus: string;
    /** 重驗與事件快照所用之「結果編號」（setStatus＝現值；update＝patch 新值或現值）。 */
    resultingNumber: string;
    newStatus: string;
    reason?: string;
    actor?: DocumentActor;
    persist: () => Promise<void>;
  }): Promise<void> {
    const { docId, oldStatus, resultingNumber, newStatus, reason, actor, persist } = params;
    if (newStatus === 'active') {
      const holders = await this.store.findNumberHolders(resultingNumber);
      if (!isNumberAvailable(resultingNumber, holders, docId)) {
        throw new ConflictException('DOCUMENT_NUMBER_DUPLICATE');
      }
    }
    await persist();
    const normalizedReason = normalizeReason(reason);
    const deltas: DocumentFieldDelta[] =
      oldStatus === newStatus
        ? []
        : [{ field: 'status', oldValue: oldStatus, newValue: newStatus }];
    await this.publisher.publish({
      documentId: docId,
      changeType: 'STATUS',
      changedFields: ['status'],
      changes: deltas,
      documentNumber: resultingNumber,
      actorId: actor?.accountId ?? null,
      actorName: actor?.name ?? null,
      actorEmployeeNo: actor?.employeeNo ?? null,
      // 未填/純空白 → normalizeReason 回 undefined（事件層級不帶值）；publisher 落地時 `?? null` → DB NULL。
      reason: normalizedReason,
      occurredAt: new Date(),
    });
  }

  /**
   * 後台文件清單（F017）。store 負責篩選/排序/分頁；service 補上組織/當責室長之名稱解析
   * （org-foundation NameResolutionService；查無→null，前端 fallback）。
   */
  /**
   * F017 清單查詢。
   *
   * F017 `AC-T40` ⑤（2026-08-21 delta，架構決策 C3）：子樹篩選之**篩選條件與描述子來自同一次解析
   * 呼叫**——`resolveSubtreeFilter()` 成功 ⇒ `nodeIdIn` 下推與 `subtreeFilter` 描述子同時設定；
   * 回 `null`（`AC-T41` 四種殘缺情形）⇒ 兩者同時不設定，回應等同於未帶該兩參數之請求（HTTP 仍 200）。
   * `subtreeFilter` 為 **additive 第 6 個頂層欄位且恆為顯式 key**（不適用時 `null`，`AC-T45`／`AC-T48` ⑥）。
   */
  async listDocuments(filters: DocumentListFilters): Promise<DocumentListPage> {
    const subtree = await resolveSubtreeFilter(
      filters.lifecycleId,
      filters.nodeSubtreeId,
      this.lifecycleStore,
      this.dagStore,
    );
    const page = await this.store.list(
      subtree ? { ...filters, nodeIdIn: subtree.nodeIds } : filters,
    );
    await this.enrichListItems(page.items);
    return { ...page, subtreeFilter: subtree?.descriptor ?? null };
  }

  /**
   * 清單列之五個既有批次富化（順序固定），供清單查詢與 F017 匯出**兩處共用同一段程式碼**。
   *
   * 🔴 各為**固定次數**之批次查詢，往返數與列數無關（`AC-X15`／`AC-J15` ⑤／NFR-001）——
   * 逐列查一次是最直覺的寫法，即 N+1。
   * 🔒 抽為一處而非兩處各寫五行，使「匯出的值一定是清單的值」由**同一段程式碼**保證，
   * 而非由紀律保證（`AC-X15` 之建議形狀）。
   */
  private async enrichListItems(items: DocumentListItem[]): Promise<void> {
    await this.enrichNames(items);
    await this.enrichSecondaryChiefs(items);
    await this.enrichIcsopPdf(items);
    await this.enrichOjt(items);
    await this.enrichLinks(items);
    // 🔴 F017 `AC-B1`～`AC-B3`（F043 delta，決策 E5）：**第六步**——第 16 欄之類別 pill。
    // 讀取路徑對 `store.list()`／`applyDocumentQuery()`／`DocumentStore` 介面**一行未改**，
    // 僅 `DocumentListItem` 新增一個 additive 欄位。
    await this.enrichBusinessCategories(items);
  }

  /**
   * F043 決策 E5（architecture-spec §14.6.4）：以**單一批次查詢**取得各文件掛載之相異
   * 業務/功能類別（`AC-B3` 去重規則由共用純函式 `groupBusinessCategoriesByDocument()` 負責）。
   *
   * 🔴 **防 N+1**：一次 `listCategoriesByDocumentIds()`，往返數與列數無關（同 `enrichLinks` 之慣例）。
   * 🔴 **反循環**：注入的是 `BUSINESS_CATEGORY_DOCS_STORE`（**store token 對 store token**，
   * 非 Service 對 Service），避免 `DocumentsModule ↔ BusinessCategoriesModule` 互相依賴——
   * 比照同模組既有之 `ATTACHMENT_STORE`／`NODE_NAME_STORE`／`LIFECYCLE_STORE` 慣例。
   * 未注入（既有純 store 單測）→ 本欄一律留 `undefined`，既有行為完全不變。
   */
  private async enrichBusinessCategories(items: DocumentListItem[]): Promise<void> {
    const lookup = this.businessCategoryDocsStore?.listCategoriesByDocumentIds;
    if (!this.businessCategoryDocsStore || !lookup || items.length === 0) return;
    // 🔴 store 回傳之陣列**已依 `businessCategoryId` 去重**（`AC-B3`）——本層不再數列數、
    // 也不重新排序（CSV 之碼位序由 `formatBusinessCategoriesForExport()` 這一層負責）。
    const byDoc = await lookup.call(
      this.businessCategoryDocsStore,
      items.map((i) => i.id),
    );
    for (const it of items) it.businessCategories = byDoc.get(it.id) ?? [];
  }

  /**
   * F017 §清單匯出（CSV）delta：以**前端送來之文件 id 清單**產生 CSV（`AC-X1`～`AC-X17`）。
   *
   * 🔴 **後端完全不重跑篩選、不重跑排序**（架構決策 D1 乙案）：本頁 13 項篩選全部在瀏覽器端施加，
   * 且前後端之篩選語言不同構（前端比對**顯示名稱**、後端比對 **id／代碼**），兩項篩選後端根本沒有
   * 參數，三項篩選在前端是「先取 id 集合再交集」——由後端重跑一次必然漂移成兩套語意，而兩邊
   * 單元測試各自為真、交集無人驗（本 repo F024 匯出鈕已踩過之假綠形狀）。
   *
   * 讀取路徑（架構 §13.3，四步，順序不可顛倒）：
   *  ① **取工作集**——`store.list({ pageSize: EXPORT_ROW_LIMIT })`，**不帶任何篩選**（load-all）；
   *  ② **交集**——以請求之 id 建 `Set`，查無之 id **靜默略過**（`AC-X17` ④，不回 404、不中止）；
   *  ③ **重排**——依請求之 id **原序**重排（重複成員只取首次出現之位置）；
   *  ④ **富化**——對**重排後之列**（非整個工作集）呼叫與清單完全相同之 `enrichListItems()`。
   *
   * 🔴 步驟 ① 之 `pageSize` 取 `EXPORT_ROW_LIMIT`（10,000）而非畫面之 `LOAD_SIZE`（2,000），使匯出之
   * 載入天花板**不低於**畫面之載入天花板 ⇒「匯出恆等於畫面所見、不多也不少」在畫面自身被截斷時仍成立。
   * 🔴 列序由**服務層**以請求之 id 原序重排（`Map<id, item>`），**不得**沿用 store／DB 之回傳順序
   * ——那是本裁決全部價值之所在。
   * 🔒 `DocumentStore` 介面一格未動（不新增 store 方法、不新增 `DocumentListFilters` 欄位）。
   * 🔒 **無副作用**：不寫稽核、不寫任何資料表（同 `AppendicesService.exportPool()`／`UsageFormsService.exportPool()`）。
   */
  async exportDocuments(
    documentIds: string[],
    linkTargetId?: string,
  ): Promise<{ csv: Buffer; fileName: string }> {
    // 🔒 上限之**單點**檢查，且在任何 DB 查詢之前（`AC-X12`；本裁決下 id 清單長度即符合條件之筆數）。
    assertExportRowLimit(documentIds.length);
    const page = await this.store.list({ pageSize: EXPORT_ROW_LIMIT });
    const byId = new Map(page.items.map((it) => [it.id, it]));
    const rows: DocumentListItem[] = [];
    const taken = new Set<string>();
    for (const id of documentIds) {
      if (taken.has(id)) continue;
      taken.add(id);
      const item = byId.get(id);
      if (item) rows.push(item);
    }
    await this.enrichListItems(rows);
    // 🔴 `now` 取一次並同時供「狀態」欄之今日基準與檔名時間戳；一份檔案內不得有兩個「現在」。
    const now = new Date();
    return {
      csv: toCsvBuffer(rows, buildDocumentExportColumns(linkTargetId, now)),
      fileName: exportFileName('documents', now),
    };
  }

  /**
   * G-DOC-001「+N」次要室長：批次取次要室長參照（單次查詢），計數並解析姓名（fallback 員編）。
   * count 不依賴 nameResolver（恆可得）；names 於無 resolver 時退化為員編字串。
   */
  private async enrichSecondaryChiefs(items: DocumentListItem[]): Promise<void> {
    if (items.length === 0) return;
    const refs = await this.store.findSecondaryChiefsByDocumentIds(
      items.map((i) => i.id),
    );
    const byDoc = new Map<string, string[]>();
    for (const r of refs) {
      const bucket = byDoc.get(r.documentId);
      if (bucket) bucket.push(r.employeeNo);
      else byDoc.set(r.documentId, [r.employeeNo]);
    }
    // 🔴 B 階段（多公司）：**依公司分組**批次解析，不得把整頁員編混成一批。
    // 員編（← 上游 `NO`）僅在單一公司內唯一；一頁清單可能橫跨多家公司，混批解析會讓
    // 某公司員工的姓名被誤植到另一公司的文件列（靜默錯誤，且隨清單筆數放大）。
    // 仍維持「每公司一次批次查詢」，公司數 ≤ 4，不構成 N+1。
    const companiesOf = new Map<string, Set<string>>();
    for (const it of items) {
      const list = byDoc.get(it.id) ?? [];
      if (list.length === 0) continue;
      const bucket = companiesOf.get(it.companyCode) ?? new Set<string>();
      for (const e of list) bucket.add(e);
      companiesOf.set(it.companyCode, bucket);
    }
    const nameMapByCompany = new Map<string, Map<string, string>>();
    if (this.nameResolver) {
      for (const [companyCode, empNoSet] of companiesOf) {
        nameMapByCompany.set(
          companyCode,
          await this.nameResolver.resolvePersonNames(companyCode, [...empNoSet]),
        );
      }
    }
    for (const it of items) {
      const list = byDoc.get(it.id) ?? [];
      const nameMap = nameMapByCompany.get(it.companyCode);
      it.secondaryChiefCount = list.length;
      it.secondaryChiefNames = list.map((e) => nameMap?.get(e) ?? e);
    }
  }

  /**
   * F017「檔案」欄：批次補上各列自身之 ICSOP PDF（blobPath/fileName），供受控下載端點。
   * 單次批次查詢（非逐列 N+1）；無 attachmentStore → 保持 null（優雅降級）。
   * OJT 不落此欄（prototype 13 之「檔案」欄僅呈現 ICSOP PDF）。
   */
  private async enrichIcsopPdf(items: DocumentListItem[]): Promise<void> {
    if (!this.attachmentStore || items.length === 0) return;
    const recs = await this.attachmentStore.findManyByType(
      items.map((i) => i.id),
      'ICSOP_PDF',
    );
    const byDoc = new Map(recs.map((r) => [r.documentId, r]));
    for (const it of items) {
      const rec = byDoc.get(it.id);
      it.icsopPdfBlobPath = rec?.blobPath ?? null;
      it.icsopPdfFileName = rec?.fileName ?? null;
    }
  }

  /**
   * 🔴 F042 `AC-04`／F017 `AC-J12`～`AC-J13`「OJT」欄：批次補上各列之**三值衍生狀態**。
   *
   * 📝 **舊實作逐字保留供追溯**：OLD> 以 `attachmentStore.findManyByType(ids,'OJT_SIGNIN')`
   * 判定「該文件是否曾上傳過 1 份 OJT 附件」，賦值於 `hasOjt: boolean`。
   * 該語意已隨模型重構整條作廢——`OJT_SIGNIN` 附件類型本身已不存在（`AC-J1`／`AC-J2`），
   * 且新問題不是「有沒有傳過檔」而是「**每個使用單位**辦沒辦過訓練」。
   *
   * 🔴 **降級值為 `'none'` 而非沿用舊值 `false`**（`AC-J12`）：未注入 reader 時仍顯式賦值，
   * 沿用姊妹富化欄位「無資料＝顯式空值、非省略鍵」之既有慣例。省略鍵會讓「從未計算」
   * 這個病灶對測試完全隱形——那正是本欄上一輪的缺陷形狀。
   *
   * 🔴 **效能紅線（`AC-J15` ⑤）**：本方法對 reader 恰呼叫 **1 次**（reader 內部為固定 2 次
   * 批次查詢），往返數與列數無關；與 `enrichIcsopPdf`／`enrichLinks` 之既有批次慣例同型。
   *
   * 🔒 三值之推導委派 `deriveOjtStatus()`——與 `AC-21`「已完成單位清單」共用同一次查詢與
   * 同一套規則（`AC-04` 明文要求，不得各自實作）。
   */
  private async enrichOjt(items: DocumentListItem[]): Promise<void> {
    if (items.length === 0) return;
    const completion = this.ojtCompletionReader
      ? await this.ojtCompletionReader.getCompletionByDocument(items.map((i) => i.id))
      : new Map<string, OjtCompletionSummary>();
    for (const it of items) {
      const c = completion.get(it.id);
      it.ojtStatus = deriveOjtStatus(c?.totalUnits ?? 0, c?.completedOrgCodes.length ?? 0);
    }
  }

  /**
   * F017「連結點程序書」欄：批次補上各列之連結點摘要（目標編號/書名/目前狀態＋有無 ICSOP PDF）。
   * 三次批次查詢（連結列＋目標摘要＋目標之 ICSOP PDF），與列數無關；無 linkStore → 保持空陣列。
   * 目標狀態為即時查詢（非連結建立當下之快照），與 getDocumentLinks 一致。
   *
   * 🔴 第三次查詢為 `AC-E10`（2026-08-27 delta）所需：`targetHasPdf`。手法與 `enrichOjt` 同型
   * （固定次數之 `findManyByType` 批次，往返數與列數／連結數無關，非 N+1），故未違反
   * `AC-N40` 之「不得引入 N+1」效能前提。無 attachmentStore → 該欄留 `undefined`（＝未知，
   * 前端維持既有可下載外觀），**不得**降級寫成 `false`。
   */
  private async enrichLinks(items: DocumentListItem[]): Promise<void> {
    if (!this.linkStore || items.length === 0) return;
    const links = await this.linkStore.findBySources(items.map((i) => i.id));
    if (links.length === 0) return;
    const targetIds = [...new Set(links.map((l) => l.targetDocumentId))];
    const summaries = await this.store.findSummaries(targetIds);
    const byId = new Map(summaries.map((s) => [s.id, s]));
    const withPdf = await this.targetsWithIcsopPdf(targetIds);
    const bySource = new Map<string, DocumentLinkView[]>();
    for (const l of links) {
      const t = byId.get(l.targetDocumentId);
      const view: DocumentLinkView = {
        linkId: l.id,
        targetDocumentId: l.targetDocumentId,
        targetNumber: t?.documentNumber ?? null,
        targetName: t?.documentName ?? null,
        targetStatus: t?.status ?? null,
        ...(withPdf ? { targetHasPdf: withPdf.has(l.targetDocumentId) } : {}),
      };
      const bucket = bySource.get(l.sourceDocumentId);
      if (bucket) bucket.push(view);
      else bySource.set(l.sourceDocumentId, [view]);
    }
    for (const it of items) it.links = bySource.get(it.id) ?? [];
  }

  /**
   * `AC-E10`（2026-08-27 delta）：一次批次查出「這些目標文件之中，哪些已有 ICSOP PDF」。
   * 無 attachmentStore（純建構子之單元測試替身）→ 回 `null`＝**未知**，呼叫端據此**省略**
   * `targetHasPdf` 鍵，而非填 `false`：把未知寫成 `false` 會讓前端把下載得到的連結點標成不可下載。
   */
  private async targetsWithIcsopPdf(targetIds: string[]): Promise<Set<string> | null> {
    if (!this.attachmentStore) return null;
    const recs = await this.attachmentStore.findManyByType(targetIds, 'ICSOP_PDF');
    return new Set(recs.map((r) => r.documentId));
  }

  /** 以 NameResolutionService 補上組織/室長顯示名稱（去重、批次，避免 N+1）。無 resolver → 保持 null。 */
  private async enrichNames(items: DocumentListItem[]): Promise<void> {
    const resolver = this.nameResolver;
    if (!resolver || items.length === 0) return;

    // 🔴 B 階段（多公司）：解析鍵一律為 **(companyCode, code) 複合鍵**，不得再以裸 code 扁平化。
    // 一頁清單可能橫跨多家公司，而 orgCode／employeeNo 皆僅在單一公司內唯一——扁平化會使
    // 某公司之部門名或室長姓名被誤植到另一公司的文件列（靜默錯誤）。
    const key = (companyCode: string, code: string): string => `${companyCode}\u0000${code}`;

    const orgKeys = new Map<string, { companyCode: string; orgCode: string }>();
    for (const it of items) {
      for (const c of [it.draftingDeptId, it.draftingSectionId]) {
        if (c) orgKeys.set(key(it.companyCode, c), { companyCode: it.companyCode, orgCode: c });
      }
    }
    const orgNames = new Map<string, string | null>();
    await Promise.all(
      [...orgKeys].map(async ([k, v]) =>
        orgNames.set(k, await resolver.resolveOrgUnitName(v.companyCode, v.orgCode)),
      ),
    );

    // 室長姓名：依公司分組批次（每公司一次查詢；公司數 ≤ 4，非 N+1）。
    const chiefsByCompany = new Map<string, Set<string>>();
    for (const it of items) {
      if (!it.primaryChiefId) continue;
      const bucket = chiefsByCompany.get(it.companyCode) ?? new Set<string>();
      bucket.add(it.primaryChiefId);
      chiefsByCompany.set(it.companyCode, bucket);
    }
    const chiefNamesByCompany = new Map<string, Map<string, string>>();
    for (const [companyCode, ids] of chiefsByCompany) {
      chiefNamesByCompany.set(
        companyCode,
        await resolver.resolvePersonNames(companyCode, [...ids]),
      );
    }

    for (const it of items) {
      const orgName = (c: string | null): string | null =>
        c ? (orgNames.get(key(it.companyCode, c)) ?? null) : null;
      // 🔴 2026-08-27 裁定：制定公司＝文件所屬公司，顯示為公司主檔**全稱**
      //    （和潤企業股份有限公司），不再是該公司 ROOT 之 ORG_UNIT 名（和潤本部）。
      it.draftingCompanyName = resolveCompanyName(it.companyCode);
      it.draftingDeptName = orgName(it.draftingDeptId);
      it.draftingSectionName = orgName(it.draftingSectionId);
      it.primaryChiefName = it.primaryChiefId
        ? (chiefNamesByCompany.get(it.companyCode)?.get(it.primaryChiefId) ?? null)
        : null;
    }
  }

  /**
   * 單筆文件讀取（F011 編輯對照；public/rag 重用）。查無 → 404。
   * G-DOC-205/301：以 NODE_NAME_STORE 將 nodeId 解析為所屬節點名（無 store／無 nodeId／查無→null）。
   * 回傳 DocumentDetailView（DocumentView 超集），既有期望 DocumentView 之呼叫端不受影響。
   */
  async getDocument(id: string): Promise<DocumentDetailView> {
    const doc = await this.store.findById(id);
    if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    const nodeName =
      doc.nodeId && this.nodeNameStore
        ? await this.nodeNameStore.findNameById(doc.nodeId)
        : null;
    return { ...doc, nodeName, companyName: resolveCompanyName(doc.companyCode) };
  }

  /**
   * 編輯文件（F011）。以 patch 覆寫（不留歷史、UUID 不變）；回傳覆寫後檢視 + 新舊值對照。
   *  - F026 欄位面：唯讀欄被寫→403；系統/未知欄靜默忽略；nodeId 於編輯端一律唯讀（僅經 F009 抽屜）。
   *  - F010 必填：合併現值後檢核（僅影響 patch 觸及之必填欄）。
   *  - F012 狀態合法；F013 編號唯一（編輯側排除自身）＋併發 DB 唯一鍵違反映射。
   *  - 成功後發出 DocumentChangedEvent{CONTENT}（決策 A seam）。
   */
  async update(
    roleCode: string | undefined,
    id: string,
    payload: Record<string, unknown>,
    actor?: DocumentActor,
  ): Promise<DocumentUpdateResult> {
    // 0) 載入現值（供對照 + not-found）。
    const current = await this.store.findById(id);
    if (!current) throw new NotFoundException('DOCUMENT_NOT_FOUND');

    // 1) F026 欄位面（編輯路徑）：先剔除編輯端唯讀欄（nodeId），再分類。
    const props = Object.keys(payload).filter((k) => !EDIT_READONLY_PROPS.has(k));
    const { forbidden, ignored } = classifyFields(roleCode, props);
    if (forbidden.length > 0) {
      throw new ForbiddenException('FIELD_WRITE_FORBIDDEN');
    }
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (EDIT_READONLY_PROPS.has(k)) continue; // 編輯端唯讀（nodeId）
      if (!ignored.includes(k)) clean[k] = v;
    }

    // 1a) F014 多值欄位（次要室長／使用部門）編輯端持久化：帶鍵才處理（partial patch 語意）。
    //     顯式 [] ＝清空既有集合；未帶鍵 ＝ 不觸碰（避免只改書名卻意外清空次要室長）。
    //     正規化與 create 路徑共用 normalizeIdList（trim／去空字串／去重／保留順序）。
    //     非 ICSOPAdmin 寫此二欄已於上方 classifyFields 攔截（FIELD_WRITE_FORBIDDEN）。
    if ('secondaryChiefIds' in clean) {
      clean.secondaryChiefIds = normalizeIdList(clean.secondaryChiefIds);
    }
    if ('usingDeptIds' in clean) {
      clean.usingDeptIds = normalizeIdList(clean.usingDeptIds);
    }

    /**
     * 1e) 🔴 制定公司變更之**連動清空**（2026-09-04 開放編輯；見 `EDIT_READONLY_PROPS` 之註）。
     *
     * `draftingDeptId`／`draftingSectionId`／`usingDeptIds` 存的都是**裸 5 碼 orgCode**，而各
     * 公司之 orgCode 各自從 `00000` 獨立編碼——AS 的 `AA000` 與 AJ 的 `AA000` 字串相同、意義
     * 完全不同。改了公司卻留著舊值，那三欄會靜默指向新公司裡「碰巧同碼」的別的單位；
     * `DOC_USING_DEPT` 更會被 store 以**新**公司代碼重新蓋章（見 `typeorm-documents.store.ts`
     * 之 `companyCode: row.companyCode`），直接餵進 F041 之可見性判定（`isUsingDeptMatched`）。
     *
     * 故本次 PATCH 若改動公司，同一酬載**未明文重填**之組織欄一律清空（而非沿用舊值）；
     * 明文重填者以呼叫端所送為準——與 create 路徑同一層信任（前端之公司下拉一變更即重載該
     * 公司之部門候選；後端不另行查核候選是否屬於該公司，此點刻意與 create 一致，不在此處
     * 單方面新增一條 create 沒有的驗證）。
     */
    if ('companyCode' in clean) {
      const nextCompany = pickCompanyCode(clean.companyCode);
      if (!nextCompany) {
        throw new BadRequestException('DOCUMENT_COMPANY_REQUIRED');
      }
      clean.companyCode = nextCompany;
      if (nextCompany !== current.companyCode) {
        if (!('draftingDeptId' in clean)) clean.draftingDeptId = null;
        if (!('draftingSectionId' in clean)) clean.draftingSectionId = null;
        if (!('usingDeptIds' in clean)) clean.usingDeptIds = [];
      }
    }

    // 1b) F015 連結點（決策：隨 PATCH 整批送出）：自 clean 抽出 links（非純量欄，另走連結 store）。
    let linkTargetIds: string[] | undefined;
    if ('links' in clean) {
      const raw = clean.links;
      linkTargetIds = Array.isArray(raw) ? (raw as string[]) : [];
      delete clean.links;
    }

    // 1c) F012 切換原因（ruling 2，Option B）：非文件欄位（classifyFields 視為 ignored、不落入 clean），
    //     自原始 payload 讀取，僅於本次含狀態變更時貫穿至 STATUS 事件（見 applyStatusTransition）。
    const reason =
      typeof payload.reason === 'string' ? (payload.reason as string) : undefined;

    /**
     * 1d) 🔴 F042 第五輪（2026-09-02 人類裁決）：**改版是否要求各使用單位重新進行 OJT 訓練**。
     *
     * 與 `reason` 同一形狀——**控制旗標、不是文件欄位**，故自原始 `payload` 讀取
     * （`classifyFields` 會把它歸為未知欄而自 `clean` 剔除，那正是我們要的：它不該被當成
     * 一個可寫欄位落進 `ICSOP_DOCUMENT`）。
     *
     * 🔴 **只在版次真的變了才生效**：`'edition' in clean` 且新舊值不同。沒改版次卻送
     * `ojtRetrainRequired:true` 一律無效——「要求重訓」在本模型裡是**改版的一個屬性**，
     * 不是一顆隨時可按的「全部單位重來」按鈕（那會讓人一次點掉全公司的訓練紀錄狀態）。
     * 🔒 **選 `false`／未帶鍵 ⇒ 基準版次不動**：既有場次繼續算數，完成狀態一格不變。
     */
    const editionChanged =
      'edition' in clean &&
      toFieldValueString(clean.edition) !== toFieldValueString(current.edition);
    const retrainRequired = editionChanged && payload.ojtRetrainRequired === true;

    // 2) F010 必填：合併現值後檢核（partial patch 只影響被觸及之必填欄）。
    const merged = { ...current, ...clean } as Record<string, unknown>;
    if (missingRequired(merged).length > 0) {
      throw new BadRequestException('DOCUMENT_REQUIRED_FIELD_MISSING');
    }

    // 2b) F040 循環選取有效性（AC-26）。三態語意：patch 未帶 lifecycleId ＝不修改該欄位 → **跳過**本判定
    //     （既有文件即使指向髒資料之 null 列，只要本次未動該欄位就不得被擋）。
    if ('lifecycleId' in clean) {
      await this.assertLifecycleSelection(clean.lifecycleId);
    }

    // 3) F012 狀態合法（僅當 patch 含 status）。
    if ('status' in clean && !isValidStatus(clean.status as string)) {
      throw new BadRequestException('DOCUMENT_STATUS_INVALID');
    }

    // 4) F013 編號唯一（編輯側排除自身；僅當 patch 含 documentNumber）。
    if ('documentNumber' in clean) {
      const num = (clean.documentNumber as string).trim();
      clean.documentNumber = num;
      const holders = await this.store.findNumberHolders(num);
      if (!isNumberAvailable(num, holders, id)) {
        throw new ConflictException('DOCUMENT_NUMBER_DUPLICATE');
      }
    }

    // 4b) F015 連結點目標存在性預查（於任何寫入前；缺目標 → 400，不建立任何連結列）。
    if (linkTargetIds !== undefined && this.linkStore) {
      await this.validateLinkTargets(id, linkTargetIds);
    }

    // 5) 覆寫（不留歷史）；併發 DB 唯一鍵違反 → 映射 409。
    //    ruling 2（Option B）：patch 含狀態變更時走共用狀態核心——切回「有效」重驗編號唯一性（F013，
    //    即使未同時改編號），並發 STATUS 事件（承載 reason）。持久化仍為整批 store.update（同一次 PATCH）。
    /**
     * 🔴 持久化用之酬載＝`clean` ＋（要求重訓時）新的訓練基準版次。
     * ⚠ **刻意與 `clean` 分成兩個變數**：下方之版本對照 diff 與變更事件一律以 `clean` 為準，
     * 使 `ojtTrainingEdition` **不進**變更歷程——它是 `edition` 變更的一個系統性後果，
     * 而 `edition` 那一列已經記了。多記一列只會讓使用者在歷程裡看到兩個長得很像的版次欄位。
     */
    const persistPatch: Record<string, unknown> = retrainRequired
      ? { ...clean, ojtTrainingEdition: (clean.edition as string | null) ?? null }
      : clean;

    let updated: DocumentView;
    if ('status' in clean) {
      const resultingNumber = (
        'documentNumber' in clean ? clean.documentNumber : current.documentNumber
      ) as string;
      let persisted: DocumentView | undefined;
      await this.applyStatusTransition({
        docId: id,
        oldStatus: current.status,
        resultingNumber,
        newStatus: clean.status as string,
        reason,
        actor,
        persist: async () => {
          persisted = await this.persistUpdate(id, persistPatch as DocumentPatch);
        },
      });
      updated = persisted!;
    } else {
      updated = await this.persistUpdate(id, persistPatch as DocumentPatch);
    }

    // 5b) F015 連結點差集同步（新增/移除；單向 source=id）。
    if (linkTargetIds !== undefined && this.linkStore) {
      await this.syncLinks(id, linkTargetIds);
    }

    // 6) 版本對照 diff（新舊值快照，供編輯頁確認）。
    //    以 toFieldValueString 的正規化字面比對（Date→ISO、陣列/物件→JSON、純量→String），
    //    而非參考比對：多值欄（次要室長／使用部門）新舊為不同陣列實例，參考比對會令內容相同
    //    之重送恆判為變更，於 DOCUMENT_CHANGE_LOG 落幽靈記錄並可能經 Route A 誤自動解除提示。
    //    序異即內容異（normalizeIdList 保留順序，序具語意），JSON 字面天然涵蓋此語意。
    const changes: DocumentFieldChange[] = [];
    const beforeRec = current as unknown as Record<string, unknown>;
    const afterRec = updated as unknown as Record<string, unknown>;
    for (const k of Object.keys(clean)) {
      if (toFieldValueString(beforeRec[k]) !== toFieldValueString(afterRec[k])) {
        changes.push({ field: k, before: beforeRec[k], after: afterRec[k] });
      }
    }

    // 7) 發出變更事件（CONTENT）。決策 B：承載欄位層 before/after diff ＋操作者/編號快照，
    //    真實 publisher（DocumentChangeLogPublisher）將其持久化為 DOCUMENT_CHANGE_LOG（F037）。
    //    ⚠ ruling 2：排除 status——狀態變更已由 applyStatusTransition 發獨立 STATUS 事件，
    //    此處若再帶 status 會於變更日誌重複記錄。回傳之 changes（版本對照）仍含 status（供編輯頁並列）。
    const changedFields = Object.keys(clean).filter((k) => k !== 'status');
    if (linkTargetIds !== undefined) changedFields.push('links');
    const deltas: DocumentFieldDelta[] = changes
      .filter((c) => c.field !== 'status')
      .map((c) => ({
        field: c.field,
        oldValue: toFieldValueString(c.before),
        newValue: toFieldValueString(c.after),
      }));
    await this.publisher.publish({
      documentId: id,
      changeType: 'CONTENT',
      changedFields,
      changes: deltas,
      documentNumber: updated.documentNumber,
      actorId: actor?.accountId ?? null,
      actorName: actor?.name ?? null,
      actorEmployeeNo: actor?.employeeNo ?? null,
      occurredAt: new Date(),
    });

    return { document: updated, changes };
  }

  /**
   * F040 循環選取有效性守門（INV-4／AC-25）。
   * 空值／非字串 → 交由既有必填檢查處置（AC-24），本處不裁決；
   * store 未提供 listLifecycleIdentities（選用 seam）→ 視為無池資料而略過，不誤擋既有流程。
   */
  private async assertLifecycleSelection(lifecycleId: unknown): Promise<void> {
    if (typeof lifecycleId !== 'string' || lifecycleId === '') return;
    const pool = await this.store.listLifecycleIdentities?.();
    if (!pool) return;
    assertLifecycleSelectable(lifecycleId, pool);
  }

  /** 覆寫式持久化（不留歷史）＋併發 DB 唯一鍵違反 → 映射 409（不洩漏原始 DB 訊息）。 */
  private async persistUpdate(
    id: string,
    clean: DocumentPatch,
  ): Promise<DocumentView> {
    try {
      return await this.store.update(id, clean);
    } catch (e) {
      if (isUniqueConstraintViolation(e)) {
        throw new ConflictException('DOCUMENT_NUMBER_DUPLICATE');
      }
      throw e;
    }
  }

  /**
   * F042 `AC-21`：單一文件之「已完成 OJT 之使用單位」唯讀衍生事實，供後台唯讀頁／編輯頁之
   * OJT 區塊（`GET /admin/documents/:id/ojt-completion`）。
   *
   * 🔒 **與 `AC-04` 之清單頁三值狀態共用同一個 port、同一套規則**（`AC-04` 明文「不得各自
   * 實作」）——此處刻意重用 `getCompletionByDocument`（批次介面傳單一 id）而**不另寫**一支
   * 單筆查詢：同一份底層事實若各算一次，遲早出現「清單說已全部完成、詳情頁卻列不滿」。
   *
   * 🔴 未注入 reader 時降級為 `totalUnits: 0` ＋ 空清單（**不拋錯**），沿用本服務既有富化路徑
   * 之優雅降級慣例——前端據此顯示空狀態提示（`AC-21` 明文：非空白、非錯誤）。
   */
  async getDocumentOjtCompletion(
    documentId: string,
  ): Promise<OjtCompletionSummary> {
    if (!this.ojtCompletionReader) return { totalUnits: 0, completedOrgCodes: [] };
    const byDoc = await this.ojtCompletionReader.getCompletionByDocument([documentId]);
    return byDoc.get(documentId) ?? { totalUnits: 0, completedOrgCodes: [] };
  }

  /**
   * F015：查詢某文件之連結點清單（單向；附目標編號/書名/目前狀態）。無 linkStore → 空陣列。
   * `AC-E10`（2026-08-27 delta）：同一份檢視型別另帶 `targetHasPdf`，與清單富化取同一份事實，
   * 免得兩支端點對「同一個連結點下不下載得到」給出不同答案。
   */
  async getDocumentLinks(sourceId: string): Promise<DocumentLinkView[]> {
    if (!this.linkStore) return [];
    const links = await this.linkStore.findBySource(sourceId);
    const withPdf = await this.targetsWithIcsopPdf(
      [...new Set(links.map((l) => l.targetDocumentId))],
    );
    return Promise.all(
      links.map(async (l) => {
        const target = await this.store.findById(l.targetDocumentId);
        return {
          linkId: l.id,
          targetDocumentId: l.targetDocumentId,
          targetNumber: target?.documentNumber ?? null,
          targetName: target?.documentName ?? null,
          targetStatus: target?.status ?? null,
          ...(withPdf ? { targetHasPdf: withPdf.has(l.targetDocumentId) } : {}),
        };
      }),
    );
  }

  /** F015：驗證即將新增之連結目標皆存在（作廢/失效仍允許）；缺 → 400 DOCUMENT_LINK_TARGET_NOT_FOUND。 */
  private async validateLinkTargets(
    sourceId: string,
    targetIds: string[],
  ): Promise<void> {
    const existing = await this.linkStore!.findBySource(sourceId);
    const existingTargets = new Set(existing.map((l) => l.targetDocumentId));
    const toAdd = targetIds.filter((t) => !existingTargets.has(t));
    for (const t of toAdd) {
      const target = await this.store.findById(t);
      if (!target) throw new BadRequestException('DOCUMENT_LINK_TARGET_NOT_FOUND');
    }
  }

  /** F015：以差集同步連結點（新增缺少者、移除多餘者）。單向：僅動 sourceId 之列。 */
  private async syncLinks(sourceId: string, targetIds: string[]): Promise<void> {
    const existing = await this.linkStore!.findBySource(sourceId);
    const existingTargets = new Set(existing.map((l) => l.targetDocumentId));
    const incoming = new Set(targetIds);
    for (const t of targetIds) {
      if (!existingTargets.has(t)) await this.linkStore!.add(sourceId, t);
    }
    for (const l of existing) {
      if (!incoming.has(l.targetDocumentId)) {
        await this.linkStore!.remove(sourceId, l.targetDocumentId);
      }
    }
  }

  /**
   * 切換狀態（F012，專用端點路徑）。狀態合法 → 存在 → 委派共用狀態核心（applyStatusTransition）：
   * 切回「有效」重驗編號唯一性（F013，排除自身）→ 更新 → 發 STATUS 事件（承載 reason）。
   * 功能面（僅 ICSOPAdmin）由 controller guard 落實。
   *
   * ruling 2：前端編輯頁改由一般 update() 驅動狀態切換（含 reason）；本端點與 update() 共用同一狀態核心，
   * 兩路徑之 F013 重驗與 STATUS 事件語意不可能分歧。本端點保留供 API 完整性與其他呼叫方。
   *
   * reason（F012 切換原因，選填）：經 normalizeReason 正規化（空白視同未填），落地至 DOCUMENT_CHANGE_LOG.reason。
   */
  async setStatus(
    id: string,
    status: string,
    reason?: string,
    actor?: DocumentActor,
  ): Promise<void> {
    if (!isValidStatus(status)) {
      throw new BadRequestException('DOCUMENT_STATUS_INVALID');
    }
    const doc = await this.store.findById(id);
    if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');

    await this.applyStatusTransition({
      docId: doc.id,
      oldStatus: doc.status,
      resultingNumber: doc.documentNumber,
      newStatus: status,
      reason,
      actor,
      persist: () => this.store.updateStatus(id, status as DocumentStatus),
    });
  }
}
