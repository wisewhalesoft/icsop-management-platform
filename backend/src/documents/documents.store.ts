import { NumberHolder } from './document-rules';
import { DocumentStatus } from './document-status';
import { DocumentLinkView } from './document-link.store';
import { LifecycleIdentity } from '../lifecycle/lifecycle-subcategory';
import { OjtCompletionStatus } from './ojt-completion.reader';

/** 文件資料存取邊界（可注入 mock/TypeORM）。E04-1 僅需建立與編號唯一性查詢。 */
export const DOCUMENT_STORE = Symbol('DOCUMENT_STORE');

/** 建立酬載（欄位面清洗後之可寫欄位；核心 4 必填＋選填）。 */
export interface CreateDocumentInput {
  lifecycleId: string;
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  /**
   * 🔴 B 階段（多公司）：文件所屬公司（`ICSOP_DOCUMENT.companyCode`，**NOT NULL 且無 default**）。
   * 由 service 解析後恆為具體值（建立酬載之「制定公司」→ 無則退回操作者所屬公司），store 直接落地。
   * ⚠ 不得省略：未帶值之 INSERT 會被 SQL Server 以「Cannot insert the value NULL」擋下（→ 500）。
   * 🔴 2026-08-27 裁定：**「制定公司」即本欄**。原先另有一個 `draftingCompanyId`（該公司 ROOT 之
   * `orgCode`）承載制定公司，但 AS／AD／AJ 三家之 ROOT 皆為 `'00000'`、AE 更無 ROOT 列——該欄
   * 除了 `'00000'` 就是 NULL，零資訊量，已整個移除。制定公司之顯示名＝公司主檔全稱。
   */
  companyCode: string;
  /** 制定公司/部門/室別＝ORG_UNIT.orgCode（業務鍵，非 UUID；與名稱解析 findByOrgCode 一致，F014）。 */
  draftingDeptId?: string | null;
  draftingSectionId?: string | null;
  /** 當責室長-主要＝員工編號（employeeNo）。 */
  primaryChiefId?: string | null;
  /** F014 多值：當責室長-次要（employeeNo 集合，DOC_SECONDARY_CHIEF；允許為空）。 */
  secondaryChiefIds?: string[] | null;
  /** F014 多值：文件使用部門（ORG_UNIT.orgCode 集合，DOC_USING_DEPT；允許為空）。 */
  usingDeptIds?: string[] | null;
  edition?: string | null;
  /**
   * 🔴 F042 第五輪（2026-09-02）：**OJT 訓練基準版次**（`ICSOP_DOCUMENT.ojtTrainingEdition`）
   * ——各使用單位目前必須完成訓練的那個版次。
   *
   * 🔒 **不是使用者可寫欄位**：不在 `FIELD_KEY_BY_PROP` 白名單內 ⇒ 客戶端直接送本鍵會被
   * `classifyFields` 當成未知欄丟棄。唯二寫入點皆在 `documents.service`——建立時取當下版次、
   * 編輯時之「改版是否要求重新訓練」裁決分支。
   * ⚠ 落在本介面（而非另建一張表）是刻意的：它是**文件的一個屬性**，與 `edition` 同生共死；
   * 另立一張 `OJT_DOC_BASELINE` 只會多一個必須跟著文件刪除而清理的參照。
   */
  ojtTrainingEdition?: string | null;
  announcedDate?: Date | null;
  contentSummary?: string | null;
}

export interface DocumentView extends CreateDocumentInput {
  id: string;
  // companyCode 由 CreateDocumentInput 繼承（見該處說明；建立與檢視為同一個必填值）。
  nodeId: string | null;
  /** F014：單筆讀取一律回明確集合（可為空陣列），供編輯頁載入次要室長/使用部門。 */
  secondaryChiefIds: string[];
  usingDeptIds: string[];
}

/**
 * 單筆文件檢視 + 所屬節點名（G-DOC-205/301）。GET /admin/documents/:id 回此超集；
 * store 仍回 DocumentView（不知節點名），service 於 getDocument 以 NODE_NAME_STORE 解析 nodeId→名。
 * 為超集故任何期望 DocumentView 之呼叫端不受影響。
 */
export interface DocumentDetailView extends DocumentView {
  nodeName: string | null;
  /**
   * 制定公司之顯示名（公司主檔全稱，如「和潤企業股份有限公司」）；未知代碼 → null。
   * 由 service 解析後附上，使編輯頁／唯讀頁不必各自再拿一份公司主檔對照。
   */
  companyName: string | null;
}

/** F017 清單富化：某文件之單筆次要室長參照（documentId + employeeNo）。 */
export interface DocSecondaryChiefRef {
  documentId: string;
  employeeNo: string;
}

/** F011 編輯：可覆寫之業務欄位子集（部分更新；nodeId 不在此，節點寫入僅經 F009 抽屜）。 */
export type DocumentPatch = Partial<Omit<CreateDocumentInput, never>>;

/** F011 版本對照：單一欄位之新舊值快照，供編輯頁確認 diff。 */
export interface DocumentFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** F011 update() 回傳：覆寫後之文件 + 本次異動之新舊值對照。 */
export interface DocumentUpdateResult {
  document: DocumentView;
  changes: DocumentFieldChange[];
}

/** F017 清單排序鍵。 */
export type DocumentSortBy = 'documentNumber' | 'announcedDate';
export type SortDir = 'asc' | 'desc';

/** F017 清單篩選/排序/分頁。 */
export interface DocumentListFilters {
  lifecycleId?: string;
  /** 狀態：接受原始儲存值（active/inactive/void）或衍生顯示值（已公告/進度中/失效/作廢）。 */
  status?: string;
  /** 模糊搜尋（既有）：編號/書名之 LIKE 部分比對。 */
  keyword?: string;
  /** 精確篩選（F017 下拉）。 */
  documentNumber?: string;
  documentName?: string;
  /** 制定公司＝公司代碼（等值比對）。 */
  companyCode?: string;
  draftingDeptId?: string;
  draftingSectionId?: string;
  primaryChiefId?: string;
  /** 連結點程序書篩選（F015 依賴：擁有指向此目標之連結者）。 */
  linkTargetId?: string;
  /**
   * F017 `AC-D6`（2026-08-16 delta）：附錄／使用表單篩選（選具體一份）。
   * 比照 `linkTargetId` 之既有樣板——後端回傳符合之文件 id 集合、前端交集；**不**於列上富化
   * `appendixIds[]`／`formIds[]`（2000 筆工作集每列各帶兩陣列，99% 請求用不到，§10.12）。
   */
  appendixId?: string;
  formId?: string;
  /**
   * 🔴 F017 `AC-J14`（2026-08-28 E11 delta）：OJT 篩選由三值（`全部`／`有 OJT`／`無 OJT`）
   * 改**四值**——`全部`（不提供本鍵／空字串）＋ 三值聯集之 `all`／`partial`／`none`。
   * 🔒 與 F042 TAB2（`AC-13`）之**三值**「完成狀態」篩選刻意不同：本鍵比對**文件層三態**，
   * TAB2 比對**列自身之二態**。⚠ 兩軸不得互相對齊。
   */
  ojtStatus?: OjtCompletionStatus | '';
  /**
   * F017 `AC-T40`（2026-08-21 delta，架構決策 C3）：**子樹解析之根節點 id**。
   * 恆與 `lifecycleId` 成對；任一缺席／無法解析 ⇒ 靜默 no-op（`AC-T41`）。
   * 🔴 由**服務層**解析為 `nodeIdIn`；store 不承擔圖走訪。
   */
  nodeSubtreeId?: string;
  /**
   * F017 `AC-T40`（2026-08-21 delta，架構決策 C3）：子樹篩選**已展開**之節點 id 集合，純 SQL `IN()` 下推。
   * Store 不知道、也不需要知道這是「子樹」——對它而言只是又一個 id 清單篩選（比照既有 `linkTargetId` 樣板）。
   * `AC-T40` ①「未指派節點者（`nodeId IS NULL`）一律排除」由 `IN` 對 `NULL` 恆不匹配之語意自動滿足。
   */
  nodeIdIn?: string[];
  /**
   * 🔴 F017 `AC-B6`／`AC-B7`（2026-09-02 F043 delta）：第 14 項篩選「業務/功能類別」。
   * 值為 **`businessCategoryId`**（🔴 非名稱字串——同名不同子分類之兩個類別必須可分別被選取）。
   * 比對語意為**存在量詞**：「該文件至少存在一筆掛載，其節點所屬類別 ＝ 所選 id」；
   * 未提供者不施加限制；與其餘 13 項並用為 AND。
   */
  businessCategoryId?: string;
  sortBy?: DocumentSortBy;
  sortDir?: SortDir;
  /** 1-based 頁碼（預設 1）。 */
  page?: number;
  /** 每頁筆數（預設 50，比照 F024）。 */
  pageSize?: number;
}

/** 清單項（含循環名稱、公告日期以 ISO 字串傳出，供前端衍生已公告/進度中）。 */
export interface DocumentListItem {
  id: string;
  /**
   * 🔴 B 階段（多公司）：文件所屬公司。名稱解析（部門／室長姓名）必須以本欄為範圍——
   * 清單一頁可能橫跨多家公司，若以單一公司批次解析，會把某公司員工的姓名誤植到另一公司
   * 的文件列上（員編僅在單一公司內唯一）。
   */
  companyCode: string;
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  nodeId: string | null;
  draftingDeptId: string | null;
  draftingSectionId: string | null;
  /** F017 名稱解析（org-foundation NameResolutionService；查無→null，前端顯示「—」）。 */
  draftingCompanyName: string | null;
  draftingDeptName: string | null;
  draftingSectionName: string | null;
  primaryChiefId: string | null;
  /** F017 當責室長姓名（resolvePersonName；查無→null，前端 fallback 顯示員編）。 */
  primaryChiefName: string | null;
  /** G-DOC-001 當責室長「+N」次要室長數（0＝無次要室長；不含主要室長）。 */
  secondaryChiefCount: number;
  /** G-DOC-001「+N」tooltip 內容：次要室長姓名（查無→fallback 員編），與 count 同序。 */
  secondaryChiefNames: string[];
  /**
   * F017 `AC-D7`（2026-08-16 delta）：次要當責室長之**員編**。既有之 `secondaryChiefNames`／
   * `Count` 為顯示用、沒有 id，無法據以篩選；本欄為「主要 ∪ 次要」比對之唯一鍵。
   * 取自 `DOC_SECONDARY_CHIEF` 之既有批次查詢（名稱解析路徑），零額外往返。
   * 選填宣告以沿用本 repo「既有共享型別加欄一律 additive optional」之慣例（缺鍵＝無次要室長）。
   */
  secondaryChiefIds?: string[];
  /**
   * 🔴 F042／F017 `AC-J12`（2026-08-28 E11 delta）：文件層之 OJT **三值衍生狀態**。
   * 值＝該文件之全部使用單位是否皆已完成 OJT，來源＝`DOC_USING_DEPT` × `OJT_SESSION` 之聚合
   * （非「是否上傳過一份附件」）。空使用單位集合 ⇒ `'none'`（`AC-04` 明文覆寫 `every([])` 恆真）。
   *
   * 🔴 **由 `hasOjt: boolean` 改名而來，不是命名美學而是真值強制風險**：`has` 前綴承載三值字串時，
   * 既有寫法 `if (item.hasOjt)` 對 `'partial'` 與 `'all'` 同為 truthy，兩種狀態會靜默合流。
   * 📝 原欄位逐字保留供追溯：OLD> `hasOjt?: boolean;`（來源＝`findManyByType(ids,'OJT_SIGNIN')`）。
   */
  ojtStatus?: OjtCompletionStatus;
  /**
   * @deprecated F042 `AC-J12` 已改由 `ojtStatus` 承載，本欄自 E11 起**永不賦值**（恆為 `undefined`）。
   *
   * 🔴 **保留理由是相容而非行為**：`DocumentListItem` 為跨模組共享型別，多處既有測試與工廠函式
   * 仍在其物件字面量中寫入 `hasOjt`；欄位一旦自型別移除，那些字面量會觸發 TS2353（多餘屬性檢查）
   * 而整檔編譯失敗——即 `AC-D9`「既有欄位一欄未刪」之保護對象。
   * 🔒 真值強制風險不因保留而回歸：本欄恆為 `undefined`（falsy），三值狀態一律只走 `ojtStatus`。
   */
  hasOjt?: boolean;
  edition: string | null;
  announcedDate: string | null;
  contentSummary: string | null;
  /** F017「檔案」欄：該文件自身之 ICSOP PDF（供受控下載端點）；無附件→null。OJT 不落此欄。 */
  icsopPdfBlobPath: string | null;
  /** F017「檔案」欄：下載鈕 title「下載 {fileName}」之來源；無附件→null。 */
  icsopPdfFileName: string | null;
  /** F017「連結點程序書」欄：本文件之連結點摘要（0..*，目標編號/書名/目前狀態）。 */
  links: DocumentLinkView[];
  /**
   * 🔴 F017 `AC-B1`～`AC-B3`（2026-09-02 F043 delta，架構決策 E5）：本文件掛載之**相異**
   * 業務/功能類別（依 `businessCategoryId` 去重、依 `businessCategoryDisplayName` 排序）。
   *
   * 🔒 **additive 且選填**：本欄由 `DocumentsService.enrichBusinessCategories()` 於富化階段填入，
   * store 層不產出；未接線之既有純 store 單測缺鍵＝無掛載，行為完全不變（`AC-B11` ⑧）。
   * 🔴 掛載為 **M:N**，住在 `BUSINESS_CATEGORY_DOC`——`ICSOP_DOCUMENT` **未新增任何欄位**
   * （F043 `AC-50`）。
   */
  businessCategories?: { id: string; displayName: string }[];
}

/** F017 清單富化：連結目標之精簡摘要（批次查詢，避免逐列 N+1）。 */
export interface DocumentSummary {
  id: string;
  documentNumber: string;
  documentName: string;
  status: DocumentStatus;
}

/** F017 分頁結果（real pagination，取代既有 take(2000)）。 */
/**
 * F017 `AC-T45`（2026-08-21 delta，架構決策 C3）：子樹篩選描述子。
 * 🔴 chip 之顯示與文案完全以本描述子為準——前端**不得**自行組字或另行查名（`AC-T43`）。
 */
export interface SubtreeFilterDescriptor {
  lifecycleId: string;
  /** `lifecycleDisplayName()` 之輸出（含子分類時為 `名稱（子分類）`，F040 `AC-S1`）。 */
  lifecycleName: string;
  nodeId: string;
  /** `NodeInfo.name` 既有型別即 `string | null`，如實延續（不代入任何字面）。 */
  nodeName: string | null;
}

export interface DocumentListPage {
  items: DocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  /**
   * F017 `AC-T45`／`AC-T48` ⑥（2026-08-21 delta）：子樹篩選描述子，**additive 第 6 個頂層欄位**。
   * 🔴 服務層回應**恆為顯式 key**（不適用時為 `null`，不省略）。宣告為選填係因 store 層不產出本欄
   * ——它由 `DocumentsService.listDocuments()` 與篩選條件於**同一次**解析中一併賦值（`AC-T40` ⑤）。
   */
  subtreeFilter?: SubtreeFilterDescriptor | null;
}

export interface DocumentStore {
  /** 取具指定編號之現存文件（id/編號/狀態），供 F013 唯一性判定（查詢範圍小）。 */
  findNumberHolders(documentNumber: string): Promise<NumberHolder[]>;
  create(input: CreateDocumentInput): Promise<DocumentView>;
  list(filters: DocumentListFilters): Promise<DocumentListPage>;
  findById(id: string): Promise<DocumentView | null>;
  /** F017 清單富化：批次取多筆文件之精簡摘要（連結點目標；查無者不列）。 */
  findSummaries(ids: string[]): Promise<DocumentSummary[]>;
  /** G-DOC-001 清單富化：批次取多筆文件之次要室長參照（一次查詢；空 ids → 空陣列）。 */
  findSecondaryChiefsByDocumentIds(documentIds: string[]): Promise<DocSecondaryChiefRef[]>;
  updateStatus(id: string, status: DocumentStatus): Promise<void>;
  /** F011 編輯：以 patch 覆寫（不留歷史、UUID 不變）；回傳覆寫後之完整檢視。 */
  update(id: string, patch: DocumentPatch): Promise<DocumentView>;
  /**
   * F040 循環選取有效性（INV-4）之池來源：全部 LIFECYCLE 列之最小身分（不分 status）。
   * **選用成員**——既有 store 實作／測試 fake 不受影響；未提供時服務層視為無池資料而略過判定，
   * 不得因此誤擋既有流程。
   */
  listLifecycleIdentities?(): Promise<LifecycleIdentity[]>;
}
