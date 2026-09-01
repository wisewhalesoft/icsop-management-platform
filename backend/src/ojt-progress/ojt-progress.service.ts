import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { canPerform, FunctionKey } from '../rbac/function-matrix';
import {
  assertFormatAllowed,
  assertSizeWithinLimit,
  extensionOf,
} from '../storage/file-rules';
/**
 * 🔒 `AC-04` 明文：文件層三值狀態與「已完成單位清單」**必須共用同一套規則，不得各自實作**。
 * TAB1 區一之逐筆表（`AC-14`）是該規則之第三個消費端，故此處**匯入**而非複製那兩行判定。
 *
 * ⚠ **這不是 §3.1「模組間不互相匯入業務模組內部檔案」之違例**：`ojt-completion.reader.ts`
 * 是一個**零相依之純葉節點**（只宣告型別、DI token 與一個純函式，不 import 任何模組），
 * 與 `storage/file-rules`／`public/watermark` 之共用地位相同；本模組**不**匯入
 * `DocumentsModule` 或其任何 store／service。若日後有人把 IO 加進該檔，本行才會變成問題。
 */
import { deriveOjtStatus } from '../documents/ojt-completion.reader';
import {
  OJT_AUDIT_RECORDER,
  OJT_BLOB_STORE,
  OJT_CLOCK,
  OJT_ORG_DIRECTORY,
  OJT_SESSION_STORE,
  OJT_USING_DEPT_CHECKER,
  OjtAuditRecorder,
  OjtBlobStore,
  OjtClock,
  OjtOrgDirectory,
  OjtSessionRecord,
  OjtSessionStore,
  OjtUsingDeptChecker,
} from './ojt-progress.store';

// ══════════════════════════ 對外形狀 ══════════════════════════

/** 呼叫者 session 上下文（roleCode 授權判定；accountId／name／employeeNo 供稽核與上傳者快照）。 */
export interface OjtSessionContext {
  roleCode?: string;
  accountId?: string | null;
  name?: string | null;
  employeeNo?: string | null;
  /**
   * 🔴 2026-09-01 delta（additive 選填）：稽核身分快照之公司／部門／處室三欄所需。
   * 缺此兩欄時 `OJT_SESSION_UPLOAD`／`OJT_SESSION_DELETE` 之稽核列在 F024 調閱歷程
   * 公司／部門／處室**恆為空白**（dev 實測 2／2）。controller 傳入之 `SessionUser`
   * 本就攜帶兩者，故無呼叫端需要改動。
   */
  companyCode?: string | null;
  orgCode?: string | null;
}

/** 新增場次之輸入（`AC-09` ③：**單一** file，非陣列——多檔在型別層即不可建構）。 */
export interface AddOjtSessionInput {
  trainingDate?: string;
  file?: { fileName: string; contentType: string; size: number; buffer?: Buffer };
}

/** TAB2 之**恰兩項**篩選（`AC-13`）。 */
export interface OjtRowFilters {
  /** ① 單位搜尋：比對使用單位名稱或代碼（不分大小寫之子字串）。 */
  orgQuery?: string;
  /**
   * ② 完成狀態：**恰三值**（空字串＝所有完成狀態）。
   * 🔴 比對「列自身」之二態（`AC-03`），明文**不含**「部分完成」——列層級沒有那個狀態，
   * 放進來會是一個永遠選不出任何結果的死選項。⚠ 與 `prototypes/13` 清單頁之**四值**
   * （文件層三態＋全部）刻意不同，兩軸不得互相對齊。
   */
  completionStatus?: '' | 'completed' | 'pending';
}

/** TAB2 之單一進度列（`documentId × orgCode`）。 */
export interface OjtProgressRow {
  key: string;
  documentId: string;
  documentNumber: string;
  documentName: string;
  orgCode: string;
  orgName: string;
  /** 該單位已被組織同步標記為裁撤（`AC-17`）。⚠ **僅供呈現**——本頁不因此隱藏列或禁止新增。 */
  inactive: boolean;
  /**
   * 該列之 `orgCode` 已不在文件當下之使用部門集合內。
   * 🔴 進度列由 `DOC_USING_DEPT` 原樣驅動 ⇒ 本值恆為 `false`；保留本欄是為了讓「孤兒判定
   * 依集合成員關係、不依 `orphanedAt` 旗標」這件事在回應形狀上是可觀測的（`AC-25`）。
   */
  orphaned: boolean;
  sessionCount: number;
  /** `AC-03`：場次數 ≥ 1 即完成。🔒 **列層級恆為二態**。 */
  completed: boolean;
}

export type OjtDocState = 'all' | 'partial' | 'none';

/** TAB1 區一之「依文件逐筆」表（`AC-14`／`OQ-E11-20` ①）。 */
export interface OjtDocCoverageRow {
  documentId: string;
  documentNumber: string;
  documentName: string;
  /** 🔴 `AC-04`：本欄**不套用 `isActive` 過濾**（與 coverage 之分母口徑刻意不同）。 */
  state: OjtDocState;
  totalUnits: number;
  completedUnits: number;
}

/**
 * 🔴 `OQ-E11-21`（2026-08-28 節流修正）：區一逐筆表之顯示範圍。
 * 🔒 **`incomplete` 為伺服器正規化後之預設**——缺值與未知值一律落到它，並於
 * `OjtDocCoverageSlice.scope` 回聲，使正規化結果**可觀測**（故不回 400）。
 *
 * 🔴 `OQ-E11-22`（2026-08-28 第二輪）：值域由三值增為**恰四值**，新增 `'unassigned'`
 * （未指定使用部門、**無訓練義務**者，`totalUnits === 0`）。
 * ⚠ **`unassigned` 與 `all` 不同型**：`all` 是「不過濾」，`unassigned` 是一道**正向**過濾。
 */
export type OjtDocScope = 'incomplete' | 'completed' | 'unassigned' | 'all';

/** 伺服器所套用之逐筆表筆數上限（`AC-14` 節流）。 */
export const DOC_COVERAGE_MAX_ROWS = 15;

/**
 * 🔴 區一逐筆表之**受限切片**（陣列 → 物件，刻意的 loud break，見 §架構設計 一-2）。
 *
 * 🔴 **本型別最重要的一條**：`totalDocuments`／`byState`／`incompleteTotal` 恆取自
 * **完整母體**，與 `scope`／`maxRows` **完全無關**——只有 `items`／`shown`／`hidden` 隨切片而動。
 * ⚠ 把上限或範圍摻進統計，是本輪 ux-fix 已犯過一次的錯：三種範圍各得 15／13／15，
 * **每個單一畫面看起來都合理，只有跨範圍比較才抓得到**（假綠陷阱 9）。
 */
export interface OjtDocCoverageSlice {
  /** 實際套用之範圍（正規化後之值，供前端回聲顯示）。 */
  scope: OjtDocScope;
  /** 伺服器所套用之筆數上限。 */
  maxRows: number;
  /** 受限切片：過濾 → 排序 → 截斷（🔴 三步順序不得調換）。 */
  items: OjtDocCoverageRow[];
  /** ＝ `items.length`。 */
  shown: number;
  /** 該 `scope` 之完整母體筆數 − `shown`，恆 ≥ 0。 */
  hidden: number;
  /** 全部 ICSOP 文件份數（**完整母體**）。 */
  totalDocuments: number;
  /**
   * 文件層三態份數（**完整母體**）＋第四鍵 `unassigned`（`OQ-E11-22`）。
   *
   * 🔴 **`unassigned` 是 `none` 之子集、不是第四個互斥類**（`totalUnits === 0` 依 `AC-04`
   * 恆為 `none`）⇒ 不變式 ④ 之和**只加前三鍵**：`all + partial + none === totalDocuments`。
   * ⚠ 四鍵相加是本輪最容易犯的算術錯誤（會把 `unassigned` 重複計一次）。
   */
  byState: { all: number; partial: number; none: number; unassigned: number };
  /**
   * 尚未全部完成合計（**完整母體**）＝**有使用部門卻尚未全部完成**之份數。
   *
   * 🔴 不變式 ③′（`OQ-E11-22` 就地更正）：`incompleteTotal === byState.partial +
   * byState.none − byState.unassigned`。原式（`partial + none`）自本輪起**不成立**——
   * `byState.none` 為 `AC-04` 口徑（**含**無義務者），而本欄依使用者裁決**排除**它們。
   * ⚠ 原式在上一輪為真只是因為當時語料無任何 `totalUnits === 0` 之文件，不是普遍關係。
   */
  incompleteTotal: number;
}

export interface OjtSummary {
  coverage: {
    numerator: number;
    denominator: number;
    /** 🔴 `denominator===0` 時**省略**（`AC-14`：不得為 `NaN`／`0%`／`100%`）。 */
    rate?: number;
    /** 供 prototype 25 之「排除註記」雙原因列舉（`AC-28` ⑭）。 */
    excludedInactive: number;
    excludedOrphaned: number;
  };
  docCoverage: OjtDocCoverageSlice;
  deptRollup: {
    deptOrgCode: string;
    deptName: string;
    totalUnits: number;
    completedUnits: number;
  }[];
  /** 🔴 `AC-16`：僅單位／文件／日期層級，明文**不含**上傳者姓名或員工編號。 */
  recentSessions: {
    documentId: string;
    documentNumber: string;
    documentName: string;
    orgCode: string;
    orgName: string;
    trainingDate: string;
  }[];
}

// ══════════════════════════ 純規則 ══════════════════════════

/** TAB1 區三之窗口（`AC-16`，`OQ-E11-07=B`）：最近 30 天**含當日**。 */
export const RECENT_WINDOW_DAYS = 30;

/**
 * 伺服器當日（`YYYY-MM-DD`，UTC）。
 *
 * 🔴 **以 UTC 取日期不是實作偏好，是 `AC-09` ② 明文之比較基準**。本 repo 已於 2026-08-15
 * 踩過「TypeORM 硬蓋 tedious `useUTC`，讀寫對稱故容器一路正確、天真測試兩種設定都會過」
 * 之陷阱；行程時區已於 Dockerfile／compose／jest 設定釘死為 UTC，本函式與之成對。
 * 若改用 `getFullYear()` 等本地時區方法，UTC+8 開發機與 UTC 容器會在每日 00:00–08:00
 * 這段窗口對「今天是哪一天」得出不同答案。
 */
export function serverToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * 部層代碼（`AC-15` 之 rollup 目標）：5 碼階層之前 2 碼 ＋ `'000'`
 * （契約 §3.5；例 `JAC00` → `JA000`）。
 *
 * 🔴 **本函式刻意不呼叫、也不重用 `isWithinSubtree`**（`AC-29` ①／`AC-15` 之明文禁止）。
 * 兩者都需要「組織階層」這份資料，但語意必須並存而不合流：`isWithinSubtree` 回答
 * 「A 是否在 B 的管轄子樹內」（權限），本函式回答「這一列該歸到哪個部去加總」（統計）。
 * 最可能的失誤形狀就是「反正都要展開，統一用 isWithinSubtree 就好」——那會同時架空
 * `AC-01`（列被展開）並破壞四處既有權限判定。
 *
 * 🔒 **本部層／公司層之代碼（無部層祖先）自成一組、不排除**（`OQ-E11-20` ② 覆核核可）：
 * 排除會使該文件之訓練事實在儀表板上完全消失，代價高於多一組。
 */
export function deptCodeOf(orgCode: string): string {
  return orgCode.length >= 5 ? `${orgCode.slice(0, 2)}000` : orgCode;
}

/** Blob 路徑新制（`AC-10` ③，逐字）：`documents/{documentId}/ojt/{orgCode}/{uuid}.{ext}`。 */
export function buildOjtBlobPath(
  documentId: string,
  orgCode: string,
  fileName: string,
): string {
  const ext = extensionOf(fileName);
  return `documents/${documentId}/ojt/${orgCode}/${randomUUID()}${ext ? '.' + ext : ''}`;
}

/** 進度列之穩定鍵（`documentId × orgCode`）。 */
function rowKey(documentId: string, orgCode: string): string {
  return `${documentId}__${orgCode}`;
}

function includesCi(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * 🔒 `docScope` 正規化：缺值與**任何**未知值一律落到 `'incomplete'`。
 * 🔴 **不拋 400**——正規化結果經 `OjtDocCoverageSlice.scope` 回聲而**可觀測**，
 * 使用者看得到實際套用的是哪個範圍；對一個純呈現用的查詢參數而言，
 * 靜默降級才是問題，回聲式降級不是。
 */
function normalizeDocScope(raw: unknown): OjtDocScope {
  return raw === 'completed' || raw === 'unassigned' || raw === 'all' ? raw : 'incomplete';
}

/**
 * 🔴 `AC-14` ⑧（`OQ-E11-22`）：「無訓練義務」之**單一判準**——該文件未指定任何使用部門。
 *
 * 🔴 **本態不是「進度差」，是「不適用」**：區一問的是「哪些文件需要關注」，一份沒有使用
 * 部門的文件不需要關注（要處理的是去補使用部門，不是去登記場次）。
 * ⚠ **與 `AC-04` 之關係**：`AC-04` 口徑下它**仍然是 `none`**（`state` 值不變、不新增第四個
 * 狀態值），本述詞只用於**區一之呈現態**（範圍過濾／沉底排序／`incompleteTotal` 之扣除）。
 */
function hasNoTrainingObligation(r: OjtDocCoverageRow): boolean {
  return r.totalUnits === 0;
}

/** 覆蓋率（`totalUnits === 0` ⇒ 0，避免除以零）。 */
function coverageRatioOf(r: OjtDocCoverageRow): number {
  return r.totalUnits === 0 ? 0 : r.completedUnits / r.totalUnits;
}

/**
 * 區一逐筆表之切片（純函式，`AC-14` 節流）。
 *
 * 🔴 **三步順序不得調換：過濾 → 排序 → 截斷。**
 *  · 先截斷再排序 ⇒ 取到的是「寫入順序」的前 N 筆，高覆蓋率文件會因為剛好排在前面而逃過截斷，
 *    使用者看到的「最需要關注的文件」其實是隨機的一批。
 *  · 先排序再過濾雖然結果相同，卻要對整個母體排序後再丟掉大半，白做工。
 *
 * 🔴 **統計欄一律取自 `population`，不取自 `filtered`／`items`**——這是本次修正的核心：
 * 把上限或範圍摻進統計，三種範圍會各自得到看似合理、實則互相矛盾的數字。
 *
 * 🔒 排序＝**三段鍵**（`OQ-E11-22` 就地更正）：**(1) 有無訓練義務**（`totalUnits === 0` 者
 * 一律在後）→ **(2) 覆蓋率昇冪**（最需要關注者在前）→ **(3) `documentNumber` 昇冪**，
 * 使輸出**決定性**（同率文件之相對順序不隨母體寫入順序而變）。
 * 🔴 `totalUnits === 0` 之覆蓋率仍是 `0`，只是第 (1) 段先把它推到最後 ⇒ **不得再據舊註解
 * 推論「無義務者排最前」**。
 */
function sliceDocCoverage(
  population: OjtDocCoverageRow[],
  rawScope: unknown,
  maxRows: number = DOC_COVERAGE_MAX_ROWS,
): OjtDocCoverageSlice {
  const scope = normalizeDocScope(rawScope);

  const byState = {
    all: population.filter((r) => r.state === 'all').length,
    partial: population.filter((r) => r.state === 'partial').length,
    none: population.filter((r) => r.state === 'none').length,
    // 🔴 `none` 之**子集**（`AC-04` 口徑下無義務者恆為 `none`），非第四個互斥類。
    unassigned: population.filter(hasNoTrainingObligation).length,
  };

  // ① 過濾
  const filtered = population.filter((r) => {
    if (scope === 'completed') return r.state === 'all';
    // 🔴 `incomplete` 之集合定義已收窄（`AC-14` ⑨）：「僅未全部完成」**不含**無義務者
    // ——它們沒有「未完成」可言。
    if (scope === 'incomplete') return !hasNoTrainingObligation(r) && r.state !== 'all';
    // 🔴 正向過濾（與 `all` 之「不過濾」不同型）。
    if (scope === 'unassigned') return hasNoTrainingObligation(r);
    return true; // 'all'：不過濾
  });
  // ② 排序（三段鍵：沉底 → 覆蓋率昇冪 → documentNumber 昇冪）
  const sorted = [...filtered].sort(
    (a, b) =>
      // 🔴 第 (1) 段（`AC-14` ⑩，本輪之核心修正）：無義務者一律沉底，**不得占用前 maxRows
      // 名額**。⚠ 只拆出第四態而不改排序等於沒修——`0 / 0`⇒`0%` 與「真的一列都沒完成」
      // 共用同一個覆蓋率鍵，而無義務者在真庫佔 587/591 ⇒ 前 15 名照樣被整批占滿。
      Number(hasNoTrainingObligation(a)) - Number(hasNoTrainingObligation(b)) ||
      coverageRatioOf(a) - coverageRatioOf(b) ||
      a.documentNumber.localeCompare(b.documentNumber),
  );
  // ③ 截斷
  const items = sorted.slice(0, maxRows);

  return {
    scope,
    maxRows,
    items,
    shown: items.length,
    hidden: filtered.length - items.length,
    totalDocuments: population.length,
    byState,
    // 🔴 不變式 ③′（`AC-14` ⑪）：扣掉無義務者。把 587 份沒有訓練義務的文件計入「尚未全部
    // 完成」，等於在畫面上宣告 587 件待辦——那是一個數量級錯誤的行動號召。
    incompleteTotal: byState.partial + byState.none - byState.unassigned,
  };
}

/** 內部聚合中間形狀（同時服務 TAB1 三區與 TAB2 之列）。 */
interface AggregatedRow {
  documentId: string;
  documentNumber: string;
  documentName: string;
  orgCode: string;
  sessionCount: number;
  completed: boolean;
  active: boolean;
}

// ══════════════════════════ 服務 ══════════════════════════

/**
 * F042 OJT 進度管理（`AC-01`～`AC-29`）。
 *
 * **授權為兩道閘門，不是三道**（架構 §四）：
 *  1) 功能層 `canPerform(role, OJT_PROGRESS_MANAGEMENT, read|write)`——`RESTRICTED_CRUD` 於
 *     `canPerform` 之既有語意等同 `CRUD`，故 Supervisor／DeptContact 對**新增**為允許。
 *  2) 🔴 **刪除與歸位另加一道 `roleCode === 'ICSOPAdmin'` 檢查**——功能矩陣無法表達
 *     「可新增、不可刪除」，`受限CRUD` 之「受限」語意**只存在於本檔與 `AC-19`**，矩陣本身
 *     讀不出來。⚠ 這是本 feature 唯一一處「矩陣格值不足以完整表達授權規則」之處。
 *
 * **不套第三道欄位層閘門**（`assertCanWriteDocumentAsset`）：F026 欄位矩陣管轄的是
 * `ICSOP_DOCUMENT` 之 20 個欄位，而場次是一個**獨立資源**（`OJT_SESSION`），不是文件的欄位。
 * 硬套需要發明一個不存在的欄位鍵，徒增一層無意義的間接。
 */
@Injectable()
export class OjtProgressService {
  constructor(
    @Inject(OJT_SESSION_STORE) private readonly sessions: OjtSessionStore,
    @Inject(OJT_USING_DEPT_CHECKER) private readonly usingDept: OjtUsingDeptChecker,
    @Inject(OJT_ORG_DIRECTORY) private readonly orgDirectory: OjtOrgDirectory,
    @Inject(OJT_AUDIT_RECORDER) private readonly audit: OjtAuditRecorder,
    @Inject(OJT_BLOB_STORE) private readonly blob: OjtBlobStore,
    @Inject(OJT_CLOCK) private readonly now: OjtClock = () => new Date(),
  ) {}

  // ══════════ D. 新增教育訓練場次（AC-02／AC-05／AC-08／AC-09／AC-10／AC-18） ══════════

  /**
   * 為 `(documentId, orgCode)` 新增一筆場次。
   *
   * 🔴 **累加、非覆蓋**（`AC-02`）：本方法只有 `create` 一條路徑，**不存在**任何以
   * `(documentId, orgCode)` 為鍵之 upsert／replace 分支——不同場次代表不同時間點之獨立
   * 教育訓練事實，不應互相取代。這是對 F016 `AC-N29`「重傳即覆蓋」之明確反轉。
   *
   * 🔴 **不限權責範圍**（`AC-08`，負向鎖定，沿用 `OQ-D9-21`）：操作者之 `orgCode` 與目標
   * 文件之當責室長／制定組織／使用部門有無交集，一律**不檢查**。本路徑**不得**新增
   * `isWithinSubtree` 或任何同義之子樹範圍判定。
   *
   * 🔴 **驗證失敗為 all-or-nothing**（`AC-09`）：三項驗證任一失敗，皆**不寫 Blob、不建立
   * 場次、不寫稽核**。⚠ 順序不可顛倒——先寫 Blob 再驗日期，失敗時會留下一個沒有任何紀錄
   * 指向它的孤兒檔案。
   */
  async addSession(
    session: OjtSessionContext | undefined,
    documentId: string,
    orgCode: string,
    input: AddOjtSessionInput,
  ): Promise<OjtSessionRecord> {
    this.assertCanWrite(session?.roleCode);

    const doc = await this.usingDept.getDocumentMeta(documentId);
    if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    // `AC-01`：進度列＝使用部門原樣。指向不存在之進度列是**輸入錯誤（400）而非權限問題**——
    // 回 403 會讓操作者以為是自己權限不足而去申請權限，實際上該單位根本不在使用部門裡。
    if (!(await this.usingDept.isOrgUsingDept(documentId, orgCode))) {
      throw new BadRequestException('OJT_ORG_NOT_USING_DEPT');
    }

    const trainingDate = this.assertTrainingDate(input.trainingDate);
    const file = input.file;
    if (!file) throw new BadRequestException('FILE_FORMAT_NOT_ALLOWED');
    // 🔒 沿用 F016 之既有白名單與大小上限（`AC-10`，`OQ-E11-10=A`）⇒ **零新增檔案類錯誤碼**。
    assertFormatAllowed('OJT_SIGNIN', file);
    assertSizeWithinLimit(file.size);

    const blobPath = buildOjtBlobPath(documentId, orgCode, file.fileName);
    await this.blob.put(blobPath, file.buffer ?? Buffer.alloc(0), file.contentType);

    const created = await this.sessions.create({
      documentId,
      orgCode,
      companyCode: doc.companyCode,
      orphanedAt: null,
      trainingDate,
      fileName: file.fileName,
      blobPath,
      contentType: file.contentType,
      size: file.size,
      uploadedBy: session?.accountId ?? 'unknown',
      // ⚠ **登記者**之姓名，非受訓人員——系統自始不記錄受訓名單（`AC-12` 之 PII 結構性前提）。
      uploadedByName: session?.name ?? null,
      uploadedAt: this.now(),
    });

    // 🔴 `AC-18`：三種可寫角色**一律**寫入，無角色不對稱（D9 `AC-N32` 之不對稱整條作廢）。
    await this.recordAudit('OJT_SESSION_UPLOAD', session, created, doc.documentNumber);
    return created;
  }

  /** `AC-12`：單一進度列之全部場次明細（0 筆為合法空陣列，非錯誤）。 */
  async getRowSessions(
    session: OjtSessionContext | undefined,
    documentId: string,
    orgCode: string,
  ): Promise<OjtSessionRecord[]> {
    this.assertCanRead(session?.roleCode);
    return this.sessions.listByDocumentOrg(documentId, orgCode);
  }

  /**
   * `AC-19`：刪除場次。**僅 `ICSOPAdmin`**（第二道閘門，見類別註解）。
   * 🔒 場次為 1:1 單一擁有者之 blob（`AC-26` 之遷移設計使然）⇒ 刪列即回收 blob，
   * 不需比照 `APPENDIX_POOL` 之引用計數。
   */
  async deleteSession(
    session: OjtSessionContext | undefined,
    sessionId: string,
  ): Promise<void> {
    this.assertCanWrite(session?.roleCode);
    this.assertIcsopAdmin(session?.roleCode);

    const rec = await this.sessions.findById(sessionId);
    if (!rec) throw new NotFoundException('OJT_SESSION_NOT_FOUND');

    await this.sessions.delete(sessionId);
    await this.blob.delete(rec.blobPath);

    // 待歸位列（`orgCode IS NULL`）之刪除不寫稽核——無 `orgCode` 可落值（`AC-26` 界線 ④ 之對偶）。
    if (rec.orgCode !== null) {
      const doc = await this.usingDept.getDocumentMeta(rec.documentId);
      await this.recordAudit('OJT_SESSION_DELETE', session, rec, doc?.documentNumber ?? '');
    }
  }

  // ══════════ C. TAB2 進度列（AC-01／AC-03／AC-11／AC-13／AC-17） ══════════

  /**
   * TAB2 之進度列。
   *
   * 🔴 **列粒度＝依使用部門原樣，不展開子樹**（`AC-01`）：列一律由 `DOC_USING_DEPT` 之
   * `usingDeptIds` 逐一產生。子單位辦過訓練**不使**其上層單位列變成已完成，反之亦然——
   * 兩列之完成狀態互不影響。
   *
   * 🔴 **待歸位列（`orgCode IS NULL`）不構成任何進度列**（`AC-26` 界線 ①）：本方法之列
   * 來源是使用部門集合，`null` 天然不是任何集合的成員。
   *
   * 🔒 **裁撤單位之列仍然呈現、仍可新增場次**（`AC-17`）：`isActive` 過濾之適用範圍是
   * `AC-14`／`AC-15` 之覆蓋率**封閉集合**，不外溢至本方法。⚠ 統計排除與操作禁止是兩件事。
   */
  async listRows(
    session: OjtSessionContext | undefined,
    filters: OjtRowFilters,
  ): Promise<OjtProgressRow[]> {
    this.assertCanRead(session?.roleCode);
    const aggregated = await this.aggregate();

    const rows: OjtProgressRow[] = [];
    for (const a of aggregated) {
      rows.push({
        key: rowKey(a.documentId, a.orgCode),
        documentId: a.documentId,
        documentNumber: a.documentNumber,
        documentName: a.documentName,
        orgCode: a.orgCode,
        orgName: await this.orgDirectory.nameOf(a.orgCode),
        inactive: !a.active,
        // 列來自使用部門集合 ⇒ 依集合成員關係判定，恆為非孤兒（**不讀 `orphanedAt` 旗標**）。
        orphaned: false,
        sessionCount: a.sessionCount,
        completed: a.completed,
      });
    }

    const orgQuery = (filters.orgQuery ?? '').trim();
    const status = filters.completionStatus ?? '';
    const filtered = rows.filter((r) => {
      if (orgQuery && !includesCi(r.orgName, orgQuery) && !includesCi(r.orgCode, orgQuery)) {
        return false;
      }
      if (status === 'completed' && !r.completed) return false;
      if (status === 'pending' && r.completed) return false;
      return true;
    });

    // 以使用單位為群組呈現（`AC-11`）⇒ 先依單位名、再依文件編號，使同一單位之列相鄰且順序穩定。
    return filtered.sort(
      (a, b) =>
        a.orgName.localeCompare(b.orgName) || a.documentNumber.localeCompare(b.documentNumber),
    );
  }

  // ══════════ B. TAB1 儀表板三區（AC-14／AC-15／AC-16／AC-17） ══════════

  /**
   * TAB1 之三區聚合。
   *
   * 🔴 **同頁兩個數字口徑不同是刻意的**（`AC-14` 末段之明文警語）：
   *  · `docCoverage`（區一逐筆表）呈現**文件層三態**，**不套** `isActive` 過濾（`AC-04`）；
   *  · `coverage`／`deptRollup` 之分子分母**排除裁撤單位與孤兒場次**（`AC-17`／`AC-25`）。
   * ⚠ **不得**為了「看起來一致」而把任一邊改成另一邊——欄位要的是「實際狀況」，統計要的是
   * 「還追得動的部分」。
   */
  async getSummary(
    session: OjtSessionContext | undefined,
    docScope?: OjtDocScope,
  ): Promise<OjtSummary> {
    this.assertCanRead(session?.roleCode);
    const aggregated = await this.aggregate();

    // ── 區一 · 逐筆表（文件層三態，不套 isActive）──
    const docs = await this.usingDept.listAllDocs();
    const byDoc = new Map<string, AggregatedRow[]>();
    for (const a of aggregated) {
      const bucket = byDoc.get(a.documentId);
      if (bucket) bucket.push(a);
      else byDoc.set(a.documentId, [a]);
    }
    /**
     * 🔴 **完整母體**（population）：全部文件逐筆，**未經任何 scope／上限切片**。
     * 🔒 **不套 `isActive` 過濾**（`AC-04`／`AC-14` 母體口徑鎖）——裁撤單位之文件仍計入本表。
     * ⚠ **亦不套「孤兒」過濾，且那不是遺漏**：孤兒依定義已不在 `DOC_USING_DEPT` 集合內，
     * `aggregate()` 之列由該集合驅動 ⇒ 孤兒**天然不成列**。多加一道 `orphaned` 過濾不只冗餘，
     * 還會掩埋「為何這裡不需要過濾」這個正確理解，使後人以為它是一道可調整的旋鈕。
     */
    const population: OjtDocCoverageRow[] = docs.map((d) => {
      const own = byDoc.get(d.id) ?? [];
      const completedUnits = own.filter((a) => a.completed).length;
      return {
        documentId: d.id,
        documentNumber: d.documentNumber,
        documentName: d.documentName,
        state: deriveOjtStatus(own.length, completedUnits),
        totalUnits: own.length,
        completedUnits,
      };
    });
    const docCoverage = sliceDocCoverage(population, docScope);

    // ── 區一 · 總覽比率（有效列＝排除裁撤單位；孤兒場次因列由使用部門集合驅動而天然不在其中）──
    const valid = aggregated.filter((a) => a.active);
    const denominator = valid.length;
    const numerator = valid.filter((a) => a.completed).length;
    const coverage: OjtSummary['coverage'] = {
      numerator,
      denominator,
      excludedInactive: aggregated.length - valid.length,
      excludedOrphaned: await this.countOrphanedRows(),
    };
    // 🔴 `AC-14` 最易寫錯處：`0/0` 在 JS 為 `NaN`，直接渲染會出現 `NaN%`；退化為 `0%` 則與
    // 「全部未完成」無從分辨，退化為 `100%` 更會謊報。⇒ 分母為零時**省略本鍵**，由前端
    // 呈現「尚無可統計之進度列」。
    if (denominator > 0) coverage.rate = Math.round((numerator / denominator) * 100);

    // ── 區二 · 部門完成率（rollup 至部層；🔴 彙總發生於統計階段，列產生階段一律不展開）──
    const groups = new Map<string, { totalUnits: number; completedUnits: number }>();
    for (const a of valid) {
      const dept = deptCodeOf(a.orgCode);
      const g = groups.get(dept) ?? { totalUnits: 0, completedUnits: 0 };
      g.totalUnits += 1;
      if (a.completed) g.completedUnits += 1;
      groups.set(dept, g);
    }
    const deptRollup: OjtSummary['deptRollup'] = [];
    for (const [deptOrgCode, g] of groups) {
      deptRollup.push({
        deptOrgCode,
        deptName: await this.orgDirectory.nameOf(deptOrgCode),
        totalUnits: g.totalUnits,
        completedUnits: g.completedUnits,
      });
    }
    deptRollup.sort((a, b) => a.deptOrgCode.localeCompare(b.deptOrgCode));

    return {
      coverage,
      docCoverage,
      deptRollup,
      recentSessions: await this.recentSessions(),
    };
  }

  /**
   * 區三「最近完成 OJT 的單位」（`AC-16`）。
   *
   * 🔴 **PII 硬性防線**：回應**僅含**文件／單位／日期層級之資訊，**不含**上傳者姓名、員工
   * 編號或帳號 id。教育訓練出席狀況涉及個別員工之出勤資訊，本區塊為多角色（含跨部門之主管
   * ／部門窗口）可見之聚合看板，**不應成為變相查詢特定人員出席紀錄之途徑**。
   * ⚠ 上傳者姓名於 **TAB2 場次明細**（`getRowSessions`）中**得以呈現**——那是逐筆操作紀錄
   * 而非聚合看板，兩者刻意不同，**不得**互相對齊。
   *
   * 🔴 **本區塊不套用 `isActive` 過濾**（`AC-16` 之明文界線）：這是「最近發生了什麼」之事實
   * 列表，一場已辦完的訓練不因該單位事後被裁撤而變成沒發生過。
   * 🔒 **孤兒場次仍排除**——其所屬單位已非該文件之使用部門，列出來會指向一個不存在的進度列。
   */
  private async recentSessions(): Promise<OjtSummary['recentSessions']> {
    const cutoff =
      Date.parse(`${serverToday(this.now())}T00:00:00.000Z`) -
      RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const all = await this.sessions.listAll();
    const out: OjtSummary['recentSessions'] = [];
    for (const s of all) {
      if (s.orgCode === null) continue; // 待歸位列不出現於區三（`AC-26` 界線）
      if (s.uploadedAt.getTime() < cutoff) continue;
      // 孤兒判定依**集合成員關係**、非 `orphanedAt` 旗標（`AC-25`）。
      const usingDeptIds = await this.usingDept.getUsingDeptIds(s.documentId);
      if (!usingDeptIds.includes(s.orgCode)) continue;
      const doc = await this.usingDept.getDocumentMeta(s.documentId);
      if (!doc) continue;
      out.push({
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        documentName: doc.documentName,
        orgCode: s.orgCode,
        orgName: await this.orgDirectory.nameOf(s.orgCode),
        trainingDate: s.trainingDate,
      });
    }
    /**
     * 🔴 **決定性 tie-break**（`documentNumber` → `orgCode` 次鍵）：`trainingDate` 只到「日」，
     * 同日多筆極常見。若同日順序取決於 store 回傳順序，前端切前 8 筆呈現時，
     * **第 8／9 筆同日者每次請求顯示哪一筆會跳動**——資料完全沒變，畫面卻自己動了。
     * 🔒 **穩定性不等於可斷言性**：`AC-16` 明文禁止對同日順序建立斷言，本次鍵不與之衝突——
     * 它讓輸出可重現，而非讓某個特定順序成為契約。
     */
    return out.sort(
      (a, b) =>
        b.trainingDate.localeCompare(a.trainingDate) ||
        a.documentNumber.localeCompare(b.documentNumber) ||
        a.orgCode.localeCompare(b.orgCode),
    );
  }

  // ══════════ AC-26 待歸位工作台 ══════════

  /** `AC-26`：待歸位場次清單（`orgCode IS NULL`）。歸位完畢後本清單自然清空。 */
  async listPending(session: OjtSessionContext | undefined): Promise<OjtSessionRecord[]> {
    this.assertCanRead(session?.roleCode);
    return this.sessions.listPending();
  }

  /**
   * `AC-26` 待歸位工作台之**對外呈現形狀**（§架構設計 一之端點表：
   * `{ items: [{ id, documentId, documentNumber, documentName, fileName, trainingDate, uploadedAt }] }`）。
   *
   * 🔴 **為何另立一支而非改 `listPending()`**：`listPending()` 之回傳形狀已被既有測試釘住，
   * 且「原始場次記錄」與「工作台呈現列」是兩件事——前者是資料層事實，後者多帶了文件身分
   * 快照。分開兩支使兩者各自演進，不互相牽制。
   *
   * 🔴 **效能**：文件身分以 `listAllDocs()` **單次**批次取回後建 Map，**不逐列**呼叫
   * `getDocumentMeta`——待歸位列數雖通常很小，但「小資料所以 N+1 沒關係」正是本 repo
   * 反覆踩過的那個假設。
   * ⚠ 查無文件之待歸位列**仍然列出**（編號／書名為 `null`）：那種列最需要人工處理，
   * 靜默濾掉等於把問題藏起來。
   */
  async listPendingView(session: OjtSessionContext | undefined): Promise<{
    items: {
      id: string;
      documentId: string;
      documentNumber: string | null;
      documentName: string | null;
      fileName: string;
      trainingDate: string;
      uploadedAt: Date;
    }[];
  }> {
    const rows = await this.listPending(session);
    if (rows.length === 0) return { items: [] };
    const docs = await this.usingDept.listAllDocs();
    const byId = new Map(docs.map((d) => [d.id, d]));
    return {
      items: rows.map((r) => {
        const doc = byId.get(r.documentId);
        return {
          id: r.id,
          documentId: r.documentId,
          documentNumber: doc?.documentNumber ?? null,
          documentName: doc?.documentName ?? null,
          fileName: r.fileName,
          trainingDate: r.trainingDate,
          uploadedAt: r.uploadedAt,
        };
      }),
    };
  }

  /**
   * `AC-26`：為待歸位場次指派使用單位。**僅 `ICSOPAdmin`**，**單向、不可逆**。
   *
   * 🔴 **三種失敗必須分別回、不得合流**：
   *  · 已被他人歸位 → `OJT_SESSION_ALREADY_ASSIGNED`（409）：紀錄還在，只是**狀態已變**。
   *    ⚠ 這是多位 ICSOPAdmin 同時清理舊資料時**最可能發生**的那一種；回成 404 會讓操作者
   *    以為資料被刪了而去追查，實際上只是別人先做完了。
   *  · `sessionId` 整筆不存在 → `OJT_SESSION_NOT_FOUND`（404）：紀錄**不在了**。
   *  · 單位非該文件之使用部門（**含未選任何單位**）→ `OJT_ORG_NOT_USING_DEPT`（400）：
   *    輸入指向一個不存在的進度列。空值天然不是任何集合的成員，該檢查自然涵蓋「沒選」，
   *    **不需另立一道必填碼**。
   *
   * 🔒 **歸位不是編輯**（`AC-20` 不受影響）：這是待歸位列之一次性歸屬指派；已歸位場次之
   * `trainingDate`／檔案仍不可更正，更正路徑仍是刪除後重新登記。
   * 🔒 **`blobPath` 不搬移**：沿用遷移前之舊格式路徑，不套用 `AC-10` ③ 之新制——兩種格式
   * 並存是刻意的，搬移只為了讓路徑好看，卻要承擔搬移失敗與參照不同步的風險。
   */
  async assignPending(
    session: OjtSessionContext | undefined,
    sessionId: string,
    input: { orgCode?: string; trainingDate?: string },
  ): Promise<OjtSessionRecord> {
    this.assertCanWrite(session?.roleCode);
    this.assertIcsopAdmin(session?.roleCode);

    const rec = await this.sessions.findById(sessionId);
    if (!rec) throw new NotFoundException('OJT_SESSION_NOT_FOUND');
    if (rec.orgCode !== null) throw new ConflictException('OJT_SESSION_ALREADY_ASSIGNED');

    const orgCode = (input.orgCode ?? '').trim();
    if (!orgCode || !(await this.usingDept.isOrgUsingDept(rec.documentId, orgCode))) {
      throw new BadRequestException('OJT_ORG_NOT_USING_DEPT');
    }
    const trainingDate =
      input.trainingDate === undefined
        ? rec.trainingDate
        : this.assertTrainingDate(input.trainingDate);

    const assigned = await this.sessions.assignPending(sessionId, orgCode, trainingDate);
    // `WHERE orgCode IS NULL` 命中 0 筆＝競態下被他人搶先歸位（上方預檢與此處之間的窗口）。
    if (!assigned) throw new ConflictException('OJT_SESSION_ALREADY_ASSIGNED');

    // 歸位後該場次首次具備 `orgCode` ⇒ 此時才寫得出 `AC-18` 形狀之稽核列
    // （`AC-26` 界線 ④「歸位**前**不產生稽核」之對偶）。歸位為單向不可逆之管理動作，
    // 沒有稽核就完全無從追溯是誰把哪一筆 legacy 檔指派給了哪個單位。
    const doc = await this.usingDept.getDocumentMeta(assigned.documentId);
    await this.recordAudit('OJT_SESSION_UPLOAD', session, assigned, doc?.documentNumber ?? '');
    return assigned;
  }

  // ══════════ AC-25 孤兒化／復活（使用部門編輯之副作用接縫） ══════════

  /**
   * `AC-25`：文件之 `usingDeptIds` 變更後，同步場次之孤兒標記。
   *
   * 🔴 **兩道 `UPDATE` 皆為冪等**，可安全地在**每次** patch 皆執行，**不需先 diff 比對舊值**：
   *  ① 孤兒化——不在新集合內、且尚未標記過者，落 `orphanedAt`（已標記者不覆寫時間戳）。
   *  ② 復活——重新回到新集合內、先前曾標記者，`orphanedAt` 清空。
   *
   * 🔒 **不變式**：`orphanedAt IS NULL ⟺ orgCode ∈ 該文件當下之 DOC_USING_DEPT 集合`
   * （`orgCode IS NULL` 之待歸位列除外）。單位重新掛回 ⇒ 依不變式 `orphanedAt` **必須**
   * 為 `NULL`——「不復活」不是另一個可選項，是直接違反不變式。
   * 🔒 **孤兒化不回收 Blob**：場次是歷史事實，不應因編輯一份文件的欄位而被物理刪除；
   * 硬刪會使既有稽核紀錄指向已不存在的資料。
   *
   * ⚠ **本方法是接縫，不是唯一落點**：真實 patch 路徑之交易一致性由
   * `typeorm-documents.store.ts` 之同交易 SQL 承擔（見該處註解）；兩者實作同一組不變式。
   */
  async applyUsingDeptChange(documentId: string, newUsingDeptIds: string[]): Promise<void> {
    await this.sessions.orphanize(documentId, newUsingDeptIds, this.now());
    await this.sessions.revive(documentId, newUsingDeptIds);
  }

  // ══════════ 下載 ══════════

  /**
   * 場次簽到檔之下載（代理串流，比照 `attachments.service.ts` 之既有模式，**不核發 SAS**）。
   * 參照指向空氣（DB 有列、Blob 無檔）→ `FILE_ACCESS_DENIED`；🔒 **該場次紀錄不因此消失、
   * 該列亦不退回「未完成」**——場次紀錄與檔案可用性是兩個正交維度。
   */
  async downloadSession(
    session: OjtSessionContext | undefined,
    sessionId: string,
  ): Promise<{ bytes: Buffer; fileName: string; contentType: string }> {
    this.assertCanRead(session?.roleCode);
    const rec = await this.sessions.findById(sessionId);
    if (!rec) throw new NotFoundException('OJT_SESSION_NOT_FOUND');
    const bytes = await this.blob.getBytes(rec.blobPath);
    if (!bytes) throw new ForbiddenException('FILE_ACCESS_DENIED');
    return { bytes, fileName: rec.fileName, contentType: rec.contentType };
  }

  // ══════════ 內部共用 ══════════

  /**
   * 進度列之單一聚合點（TAB1 與 TAB2 共用）。
   *
   * 🔒 **共用是 `AC-04` 之明文要求之延伸**：同一份底層事實的兩種呈現若各算一次，遲早會出現
   * 「TAB1 說完成、TAB2 說未完成」這種同頁自相矛盾。
   * 🔴 **完成判定僅依場次數**（`AC-03`），不依訓練日期是否已過、不依檔案是否可下載。
   * 🔴 **孤兒判定依集合成員關係，不讀 `orphanedAt` 旗標**（`AC-25`）：本方法自 `usingDeptIds`
   * 產生列、再以 `(documentId, orgCode)` 對回場次，`orgCode` 不在集合內者天然不產生列。
   * 若日後不變式之維護出現漏洞（某條 patch 路徑忘了跑那兩道 `UPDATE`），綁旗標者會靜默
   * 顯示錯誤狀態，本作法仍然正確。
   */
  private async aggregate(): Promise<AggregatedRow[]> {
    const docs = await this.usingDept.listAllDocs();
    const sessions = await this.sessions.listAll();

    const counts = new Map<string, number>();
    for (const s of sessions) {
      if (s.orgCode === null) continue; // 待歸位列不計入任何進度列
      const k = rowKey(s.documentId, s.orgCode);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    const out: AggregatedRow[] = [];
    for (const d of docs) {
      for (const orgCode of d.usingDeptIds) {
        const sessionCount = counts.get(rowKey(d.id, orgCode)) ?? 0;
        out.push({
          documentId: d.id,
          documentNumber: d.documentNumber,
          documentName: d.documentName,
          orgCode,
          sessionCount,
          completed: sessionCount > 0,
          active: await this.orgDirectory.isActive(orgCode),
        });
      }
    }
    return out;
  }

  /** 孤兒場次所涉之 `(documentId, orgCode)` 對數（供 TAB1 之排除註記，`AC-28` ⑭）。 */
  private async countOrphanedRows(): Promise<number> {
    const sessions = await this.sessions.listAll();
    const orphaned = new Set<string>();
    for (const s of sessions) {
      if (s.orgCode === null) continue;
      const usingDeptIds = await this.usingDept.getUsingDeptIds(s.documentId);
      if (!usingDeptIds.includes(s.orgCode)) orphaned.add(rowKey(s.documentId, s.orgCode));
    }
    return orphaned.size;
  }

  /**
   * `AC-09` ①②：訓練日期必填、不可晚於**伺服器當日**（**當日含在合法範圍內**）。
   * 🔒 以 `YYYY-MM-DD` 字串比較——同格式之字典序等同日期序，且完全繞開時區換算。
   */
  private assertTrainingDate(value: string | undefined): string {
    const trainingDate = (value ?? '').trim();
    if (!trainingDate) throw new BadRequestException('OJT_TRAINING_DATE_REQUIRED');
    if (trainingDate > serverToday(this.now())) {
      throw new BadRequestException('OJT_TRAINING_DATE_FUTURE');
    }
    return trainingDate;
  }

  private async recordAudit(
    actionType: 'OJT_SESSION_UPLOAD' | 'OJT_SESSION_DELETE',
    session: OjtSessionContext | undefined,
    record: OjtSessionRecord,
    documentNumber: string,
  ): Promise<void> {
    await this.audit.record({
      actionType,
      documentId: record.documentId,
      documentNumber,
      orgCode: record.orgCode ?? '',
      accountId: session?.accountId ?? '',
      name: session?.name ?? null,
      employeeNo: session?.employeeNo ?? null,
      // 🔴 2026-09-01 delta：**操作者**之公司／部門／處室三欄之解析原料（轉接器經
      // `AuditIdentityService` 解析為全稱與部門全名，本層不自行推導）。
      // ⚠ 與上方 `orgCode`（場次所屬**使用單位**）是兩個不同維度，故冠 `actor` 前綴。
      actorCompanyCode: session?.companyCode ?? null,
      actorOrgCode: session?.orgCode ?? null,
      actorRoleCode: session?.roleCode ?? null,
      // 登記／刪除非浮水印動作（`AC-18`）——型別已鎖為 null，此處為顯式落值而非省略。
      watermarkSnapshot: null,
      sessionId: record.id,
    });
  }

  private assertCanRead(roleCode: string | undefined): void {
    if (!canPerform(roleCode, FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')) {
      // 🔒 **不採 F041 之 404 隱藏存在性例外**——該例外於 `OQ-E06-03` 定案時已明文
      // 「本系統唯一之此類例外、不推廣」（`AC-07`）。
      throw new ForbiddenException('PERMISSION_DENIED');
    }
  }

  private assertCanWrite(roleCode: string | undefined): void {
    if (!canPerform(roleCode, FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')) {
      throw new ForbiddenException('PERMISSION_DENIED');
    }
  }

  /**
   * 🔴 第二道閘門（`AC-19`／`AC-26`）：刪除與歸位限 `ICSOPAdmin`。
   * `canPerform` 對 `RESTRICTED_CRUD` 恆為 `true`，**功能矩陣本身無法表達「可新增、不可刪除」**
   * ——沒有這一道，Supervisor／DeptContact 會直接通過。
   */
  private assertIcsopAdmin(roleCode: string | undefined): void {
    if (roleCode !== 'ICSOPAdmin') throw new ForbiddenException('PERMISSION_DENIED');
  }
}
