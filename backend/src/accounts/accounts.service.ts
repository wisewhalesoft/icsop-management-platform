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
  ACCOUNT_STORE,
  AccountStore,
  AccountListFilters,
  AccountListItem,
  AccountView,
  UpdateAccountPatch,
  ACCOUNT_AUDIT_RECORDER,
  AccountAuditRecorder,
} from './accounts.store';
import { hashPassword } from './password';
import {
  isValidRole,
  isSelfRoleLockout,
  canAssignRole,
  AccountIdentity,
} from './account-rules';
import {
  ACCOUNT_CODE_MAX_LENGTH,
  ACCOUNT_NAME_MAX_LENGTH,
  exceedsLength,
  normalizeAccountCode,
  normalizeAccountName,
} from './account-profile-rules';
import { ORG_UNIT_READ_STORE, OrgUnitReadStore } from '../org-directory/org-unit-read';
import { createOrgPathResolver } from '../org-directory/org-path';
import {
  JOB_TITLE_READ_STORE,
  JobTitleReadStore,
  buildJobTitleResolver,
  jobTitleKey,
} from '../org-directory/job-title-directory';
import {
  JOB_POSITION_READ_STORE,
  JobPositionReadStore,
  buildJobPositionResolver,
  jobPositionKey,
} from '../org-directory/job-position-directory';
import {
  isSelectableCompany,
  resolveCompanyName,
} from '../org-directory/company-name';
import { normalizeUserSubtype } from '../rbac/viewer-scope';
import {
  AuditIdentityService,
  AuditIdentitySnapshot,
} from '../audit/audit-identity.service';

export interface CreateManualInput {
  loginId: string;
  password: string;
  roleCode: string;
  /** F003 AC-P3：必填（trim 後不得為空）。 */
  name?: string | null;
  /** F003 AC-P5：選填；未提供＝以操作者 session 之公司寫入，提供＝須存在於 SELECTABLE_COMPANIES。 */
  companyCode?: string;
  /** F003 AC-P6：選填部門代碼（主檔下拉）。 */
  orgCode?: string | null;
  /** F003 AC-P7：選填資位代碼（主檔下拉）。 */
  jobTitleCode?: string | null;
  /** F003 AC-P30：選填職位代碼（主檔下拉）。 */
  jobPositionCode?: string | null;
}

/**
 * F003 AC-P9：編輯 payload。欄位缺席＝不變更；`orgCode`／`jobTitleCode`／`jobPositionCode`
 * 明確傳 `null`＝清空。
 */
export interface UpdateAccountInput {
  name?: string | null;
  password?: string;
  companyCode?: string;
  orgCode?: string | null;
  jobTitleCode?: string | null;
  jobPositionCode?: string | null;
}

/** F003 AC-P11／AC-P32：上游帳號唯讀之欄位集合（含明確傳 `null` 之清空意圖）。 */
const UPSTREAM_READONLY_KEYS = [
  'name',
  'password',
  'companyCode',
  'orgCode',
  'jobTitleCode',
  'jobPositionCode',
] as const;

/**
 * 帳號管理服務（F003 / US-005+US-006）。RBAC 於 controller 之 guard 落實
 * （帳號管理 write＝SysAdmin；角色指派＝SysAdmin only）；本服務負責業務規則與驗證。
 */
/**
 * 角色變更之人可讀快照（→ `AUDIT_LOG.targetName`，供 F024 明細直接呈現）。
 *
 * 格式：`舊角色 → 新角色`；若本次一併寫入子分類則附記 `（子分類：業務）`。
 * ⚠ 純函式、無 IO——快照之措辭是**稽核資料的一部分**，一旦寫入即不可回頭重算，
 *   故獨立成可單測之函式，避免日後在服務層被順手改動而使新舊列語意不一致。
 */
export function buildRoleChangeSummary(
  oldRole: string,
  newRole: string,
  newSubtype?: string,
): string {
  const base = `${oldRole} → ${newRole}`;
  if (newSubtype === undefined) return base;
  return `${base}（子分類：${newSubtype === 'business' ? '業務' : '其他'}）`;
}

@Injectable()
export class AccountsService {
  constructor(
    @Inject(ACCOUNT_STORE) private readonly store: AccountStore,
    // 選填：org-foundation ORG_UNIT 讀取 store，供清單解析 部門 名稱。缺（手建 spec）→ 優雅降級（department=null）。
    @Optional()
    @Inject(ORG_UNIT_READ_STORE)
    private readonly orgUnits?: OrgUnitReadStore,
    // 選填：JOB_TITLE 對照 store，供清單解析 資位 名稱。缺（手建 spec）→ 優雅降級（title=null）。
    @Optional()
    @Inject(JOB_TITLE_READ_STORE)
    private readonly jobTitles?: JobTitleReadStore,
    // 🔴 2026-08-25 角色自動化 delta（裁定 `Q4.5`）：角色變更稽核。
    // 選填係為相容既有 14 處以測試替身建構本服務之單元測試（比照上方兩個 store 之慣例）。
    // ⚠ **選填 ≠ 可以不接線**——真實 DI 若漏接，稽核會靜默消失且無人察覺。
    //   接線之證明必須靠整合測試（`test/int/account-role-audit.itest.ts`），單元測試證明不了。
    @Optional()
    @Inject(ACCOUNT_AUDIT_RECORDER)
    private readonly auditRecorder?: AccountAuditRecorder,
    // 選填：JOB_POSITION 對照 store，供清單解析 職位 名稱。缺 → 優雅降級（position=null）。
    // ⚠ **刻意置於建構子末位**：既有十餘處單元測試以位置參數建構本服務，插在中間會使
    //   既有替身（如稽核 recorder）被錯位注入——那種錯誤只會在執行期以「型別對不上」現形。
    @Optional()
    @Inject(JOB_POSITION_READ_STORE)
    private readonly jobPositions?: JobPositionReadStore,
    // 🔴 2026-09-01 delta：`AUDIT_LOG` 身分快照六欄之唯一組裝點。
    // ⚠ 同樣**置於建構子末位**（理由見上一個參數之註解）。缺（純建構單元測試）→
    //   `auditIdentityOf()` 以純函式降級，公司欄仍取全稱、絕不退化為代碼。
    @Optional()
    private readonly auditIdentity?: AuditIdentityService,
  ) {}

  /**
   * 角色變更稽核之操作者身分快照（2026-09-01 delta）。
   *
   * 🔴 本方法取代了原本就地展開之 `actorCompany: actor.companyCode`／
   * `actorDepartment: actor.orgCode` 兩行——那兩行把**代碼**（`AS`／`A1200`）寫進了
   * F024 調閱歷程之公司欄與部門欄（dev 實測 23／23 之 `ROLE_ASSIGNED` 列公司欄為 `AS`），
   * 而同一個人的檢視／下載列顯示的是「和潤企業股份有限公司」與部門全名。
   *
   * 無 DI 時之降級：公司仍經 `resolveCompanyName()` 取全稱（純函式、無 IO）；
   * 部門／處室需查 ORG_UNIT，無從解析 ⇒ `null`（留空，**不得**回填代碼）。
   */
  private async auditIdentityOf(actor: AccountIdentity): Promise<AuditIdentitySnapshot> {
    if (this.auditIdentity) return this.auditIdentity.resolve(actor);
    return {
      actorName: actor.name ?? null,
      employeeNo: actor.employeeNo ?? null,
      company: resolveCompanyName(actor.companyCode),
      department: null,
      section: null,
      roleCode: actor.roleCode ?? null,
    };
  }

  /**
   * 清單（G-ADM-001）：於 store 列上疊加 公司/部門/職位 名稱。
   *
   * 🔵 F003 AC-P23（2026-08-14 公司可跨選之漣漪）：清單已改為**跨公司可見**（AC-P23a，租戶過濾
   * 移除；篩選改由選填之 `filters.companyCode` 表達，AC-P23b），故三個名稱一律以**該列自身之
   * `companyCode`** 解析，不得對全列套用操作者公司：
   *  - company＝`resolveCompanyName(row.companyCode)`（AC-P23c）。
   *  - department＝以**複合鍵 `(row.companyCode, row.orgCode)`** 命中之 ORG_UNIT 之**組織路徑**
   *    （AC-P23d ＋ AC-P17，格式如 `營運管理部 / 審查室`；未命中 → `null`）
   *    ——`ORG_UNIT` 之唯一鍵為 `(companyCode, orgCode)`，不同公司可有相同 `orgCode` 但不同單位。
   *    每個出現於本頁之公司各查一次 `listByCompany`（公司數 ≤ SELECTABLE_COMPANIES 之大小，無 N+1）。
   *  - title（資位）＝`resolveTitle(row.companyCode, row.jobTitleCode)`（AC-P23e）。
   *  - position（職位）＝`resolvePosition(row.companyCode, row.jobPositionCode)`（AC-P28）。
   *    🔴 職位之解析為**單段精確**，查無即 `null`——同代碼跨公司語意可相反，
   *    不得比照資位做跨公司 fallback（見 job-position-directory 檔頭）。
   *  - lastLoginAt 由 store 直接帶出。
   *
   * 第一參數 `companyCode`（操作者公司）僅作為 store 呼叫慣例保留，**不再用於過濾**。
   */
  async listAccounts(
    companyCode: string,
    filters: AccountListFilters,
  ): Promise<AccountListItem[]> {
    const rows = await this.store.list(companyCode, filters);
    const deptByCompanyOrg = await this.buildDepartmentIndex(rows);
    const resolveTitle = this.jobTitles
      ? buildJobTitleResolver(await this.jobTitles.listAll())
      : null;
    const resolvePosition = this.jobPositions
      ? buildJobPositionResolver(await this.jobPositions.listAll())
      : null;
    return rows.map((r) => ({
      ...r,
      company: resolveCompanyName(r.companyCode),
      department:
        r.orgCode && r.companyCode
          ? (deptByCompanyOrg.get(orgUnitKey(r.companyCode, r.orgCode)) ?? null)
          : null,
      title: resolveTitle ? resolveTitle(r.companyCode, r.jobTitleCode) : null,
      position: resolvePosition
        ? resolvePosition(r.companyCode, r.jobPositionCode)
        : null,
    }));
  }

  /**
   * 建立 `(companyCode, orgCode)` → 部門**顯示路徑**之索引（AC-P23d ＋ AC-P17）。
   * 逐一列出本頁出現過之公司（去重）各取一次；無 ORG_UNIT store（手建 spec）→ 空索引（優雅降級）。
   *
   * 🔵 AC-P17（2026-08-14 真容器煙霧測試揪出之回歸）：值由 `ORG_UNIT.name` 原值（如
   * `營管部/審查室`）改為**全站唯一之組織路徑算法** `buildOrgPath` 之輸出（如
   * `營運管理部 / 審查室`）——與同畫面「部門下拉」共用同一演算法，不得並存兩種格式。
   *
   * ⚠ 效能（清單為熱路徑，不得引入 N+1）：DB 存取次數**與改動前完全相同**——每家公司仍只
   * `listByCompany` 一次；路徑所需之父層（部層）一律自該次結果建成的**記憶體索引**取得，
   * 不為了取父層而逐列回查 DB。每家公司之索引只建一次（`createOrgPathResolver`），
   * 逐單位求值為 O(1) → 整體 O(units)，非 O(units²)。
   *
   * ⚠ 僅為**確實存在於該公司**之單位建鍵：`buildOrgPath` 對查無之代碼會退回代碼原字串，
   * 而清單契約要求「`(companyCode, orgCode)` 未命中 → `department` 為 `null`」
   * （跨公司誤解析之防線，AC-P23d／AC-P6；留空於畫面顯示「—」＝AC-P18）。
   * 故 fallback 交由 `listAccounts` 之查表 miss 表達。
   *
   * 為何清單與下拉之最末層 fallback 不同、卻**不算兩套演算法**（勿「順手統一」，統一會打破
   * AC-P18）：下拉候選一律來自 ORG_UNIT 主檔，故「查無代碼」在下拉情境於 UI 上**不可達**，
   * 其 fallback 是死路；清單則可能遇到主檔已查無之**歷史** `orgCode`，規格要求該列留空。
   * 兩者共用同一組取值規則（`org-path.ts`），只是清單多一道「須主檔命中」的前置條件。
   */
  private async buildDepartmentIndex(
    rows: readonly AccountView[],
  ): Promise<Map<string, string>> {
    const index = new Map<string, string>();
    if (!this.orgUnits) return index;
    const companies = new Set(
      rows
        .filter((r) => r.orgCode)
        .map((r) => r.companyCode)
        .filter((c): c is string => Boolean(c)),
    );
    for (const company of companies) {
      const units = await this.orgUnits.listByCompany(company, {
        includeInactive: true,
      });
      const resolveOrgPath = createOrgPathResolver(units);
      for (const u of units) {
        const path = resolveOrgPath(u.orgCode);
        if (path !== null) index.set(orgUnitKey(u.companyCode, u.orgCode), path);
      }
    }
    return index;
  }

  /**
   * 建立手動帳密帳號（AC1＋F003 AC-P1～AC-P8）。
   *
   * 驗證順序固定不可調換（AC-P8）：
   *  ① 必填／長度（`VALIDATION_ERROR`, 400）→ ② 角色（`ROLE_INVALID`, 400）→
   *  ③ 公司（`ACCOUNT_COMPANY_CODE_INVALID`, 400）→ ④ 部門（`ACCOUNT_ORG_CODE_INVALID`, 400）→
   *  ⑤ 資位（`ACCOUNT_JOB_TITLE_INVALID`, 400）→ ⑥ 職位（`ACCOUNT_JOB_POSITION_INVALID`, 400）
   *  → ⑦ 帳號唯一性（`ACCOUNT_USERNAME_EXISTS`, 409）。
   * ⑥ 係插入於 ⑤ 之後（AC-P30），既有各項之相對順序不變。
   */
  async createManual(
    companyCode: string,
    input: CreateManualInput,
  ): Promise<AccountView> {
    // AC-P2：正規化先於一切驗證。
    const name = normalizeAccountName(input.name);
    const orgCode = normalizeAccountCode(input.orgCode);
    const jobTitleCode = normalizeAccountCode(input.jobTitleCode);
    const jobPositionCode = normalizeAccountCode(input.jobPositionCode);
    // AC-P5：未提供 → 以操作者 session 之公司寫入；提供（含空字串）→ 以送入值為準並驗證有效性。
    const companyProvided = input.companyCode !== undefined && input.companyCode !== null;
    const targetCompany = companyProvided ? input.companyCode!.trim() : companyCode;

    // ① 必填（AC-P3）與長度（AC-P4）。
    if (name === null || name.length === 0) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    assertProfileLengths(
      name,
      companyProvided ? targetCompany : null,
      orgCode,
      jobTitleCode,
      jobPositionCode,
    );

    // ② 角色（既有行為，順序不變）。
    if (!isValidRole(input.roleCode)) throw new BadRequestException('ROLE_INVALID');

    // ③ 公司（AC-P5）。未提供時採操作者公司，非錯誤、不驗證。
    if (companyProvided && !isSelectableCompany(targetCompany)) {
      throw new BadRequestException('ACCOUNT_COMPANY_CODE_INVALID');
    }

    // ④⑤⑥ 部門／資位／職位有效性，一律以**本次寫入之** companyCode 為範圍（非操作者公司）。
    await this.assertOrgCodeValid(targetCompany, orgCode);
    await this.assertJobTitleValid(targetCompany, jobTitleCode);
    await this.assertJobPositionValid(targetCompany, jobPositionCode);

    // ⑦ 帳號唯一性（AC-P24：範圍擴為全部公司；store 未提供全域查詢時退回既有 per-company）。
    if (await this.loginIdTaken(targetCompany, input.loginId)) {
      throw new ConflictException('ACCOUNT_USERNAME_EXISTS');
    }

    return this.store.create({
      companyCode: targetCompany,
      loginId: input.loginId,
      name,
      roleCode: input.roleCode,
      passwordHash: hashPassword(input.password),
      orgCode,
      jobTitleCode,
      jobPositionCode,
      // AC-U3：手動建立未指定子分類 → 'other'（預設不限縮）。
      userSubtype: 'other',
    });
  }

  /**
   * 指派角色（US-006）：角色驗證 → 帳號存在 → 阻擋系統管理員自我降級 → 更新。
   *
   * F041（架構 §3.7 決策四）：新增第四參數 `userSubtype`。**僅當 `newRole === 'User'` 時**經
   * `normalizeUserSubtype` 正規化後併入 patch；其餘角色縱使呼叫端夾帶該值亦**不寫入此鍵**
   * ——是否寫入取決於 newRole 本身，與呼叫端是否傳參無關（AC-36／F003 AC-U5：休眠但保留，
   * 日後改回一般使用者時舊設定直接復活）。
   *
   * F003 AC-P11：**不受**上游唯讀限制——上游帳號仍可調角色（OQ-E01-03 定案）。
   */
  async assignRole(
    id: string,
    actor: AccountIdentity,
    newRole: string,
    userSubtype?: string,
  ): Promise<AccountView> {
    if (!isValidRole(newRole)) throw new BadRequestException('ROLE_INVALID');
    const acc = await this.store.findById(id);
    if (!acc) throw new NotFoundException('ACCOUNT_NOT_FOUND');
    // 🔴 2026-08-25 角色自動化 delta（Q4.1b／OQ-RA-03）：可指派範圍檢查。
    // 順序固定：① ROLE_INVALID（既有）→ ② 帳號存在（既有）→ ③ **本檢查** → ④ 自我降級阻擋（既有）。
    // 置於自我降級之前：「你根本無權指派這個角色」比「你不能降自己」更前置，
    // 且可避免對無權者洩漏「該帳號是不是你自己」之資訊。
    if (!canAssignRole(actor.roleCode, newRole)) {
      throw new ForbiddenException('ROLE_ASSIGN_SCOPE_FORBIDDEN');
    }
    if (
      isSelfRoleLockout(
        actor,
        { companyCode: acc.companyCode, loginId: acc.loginId },
        acc.roleCode,
        newRole,
      )
    ) {
      throw new ForbiddenException('ROLE_SELF_DOWNGRADE_BLOCKED');
    }
    // 🔴 舊角色必須在寫入**之前**取值並複製為原始字串。
    // `updateById` 之實作可能就地改寫 `acc`（記憶體 store 即如此 `Object.assign`），
    // 寫入後再讀 `acc.roleCode` 會拿到新值，使快照退化為「User → User」。
    // 正式環境走 DB 時 `acc` 為獨立物件、湊巧不會顯現——這種別名依賴不可留。
    const previousRole = acc.roleCode;
    // 🔴 裁定 Q1.2：人工指派過即鎖定——翻為 'manual' 後，同步之角色推導永不再覆寫此列。
    //    這是「自動化」與「人工優先權」共存的機制本體；漏寫此鍵 ⇒ 管理員的決定會在
    //    隔天 02:00 被推導蓋掉，且不會有任何錯誤訊息。
    const patch: UpdateAccountPatch = { roleCode: newRole, roleSource: 'manual' };
    if (newRole === 'User') patch.userSubtype = normalizeUserSubtype(userSubtype);
    const updated = await this.store.updateById(id, patch);

    // 🔴 稽核（裁定 `Q4.5`）：**寫入成功後**才記錄——失敗之嘗試不產生稽核列，
    // 與既有各 recordDownload 之「權限/歸屬把關在前、成功才寫」慣例一致。
    // ⚠ 刻意記錄「舊 → 新」而非僅記新值：F024 明細須能自證當時發生了什麼變化，
    //   而帳號之現值日後還會再變，回查現值無法還原當時。
    const identity = await this.auditIdentityOf(actor);
    await this.auditRecorder?.record({
      accountId: id,
      summary: buildRoleChangeSummary(previousRole, newRole, patch.userSubtype),
      actorAccountId: actor.accountId ?? '',
      actorName: identity.actorName,
      actorEmployeeNo: identity.employeeNo,
      actorCompany: identity.company,
      actorDepartment: identity.department,
      actorSection: identity.section,
      actorRoleCode: identity.roleCode,
    });
    return updated;
  }

  /**
   * 停用/恢復（AC3）：停用記 disableReason=manual＋disabledAt；即時失效由 SessionGuard 依 DB 狀態把關。
   * F003 AC-P11：**不受**上游唯讀限制（上游帳號仍可停用／恢復）。
   */
  async setStatus(id: string, status: string): Promise<AccountView> {
    if (status !== 'active' && status !== 'disabled') {
      throw new BadRequestException('STATUS_INVALID');
    }
    const acc = await this.store.findById(id);
    if (!acc) throw new NotFoundException('ACCOUNT_NOT_FOUND');
    if (status === 'disabled') {
      return this.store.updateById(id, {
        status: 'disabled',
        disableReason: 'manual',
        disabledAt: new Date(),
      });
    }
    return this.store.updateById(id, {
      status: 'active',
      disableReason: null,
      disabledAt: null,
    });
  }

  /**
   * 編輯帳號基本資料（F003 AC-P9～AC-P12）。
   *
   * 順序：
   *  0) 帳號存在 → 1) 上游唯讀（AC-P11，**先於一切值驗證**）→ 2) 必填／長度／換公司之強制重給值
   *     （`VALIDATION_ERROR`）→ 3) 公司有效性 → 4) 部門 → 5) 職位 → 6) 換公司後之帳號碰撞（409）。
   *  只有全部通過才組 patch 寫入；patch 僅含 payload 出現過之欄位（AC-P12 副作用邊界）。
   */
  async updateAccount(id: string, input: UpdateAccountInput): Promise<AccountView> {
    const acc = await this.store.findById(id);
    if (!acc) throw new NotFoundException('ACCOUNT_NOT_FOUND');

    // 1) AC-P11：上游帳號之基本資料/密碼一律唯讀，含明確傳 null 之清空意圖、含 companyCode
    //    等於現值之情形（不視為 no-op）。本檢查先於一切值驗證。
    if (acc.source === 'upstream' && UPSTREAM_READONLY_KEYS.some((k) => input[k] !== undefined)) {
      throw new ForbiddenException('ACCOUNT_UPSTREAM_READONLY');
    }

    const nameProvided = input.name !== undefined;
    const companyProvided = input.companyCode !== undefined;
    const orgProvided = input.orgCode !== undefined;
    const jobTitleProvided = input.jobTitleCode !== undefined;
    const jobPositionProvided = input.jobPositionCode !== undefined;

    // AC-P2：正規化先於驗證。
    const name = nameProvided ? normalizeAccountName(input.name) : null;
    const orgCode = orgProvided ? normalizeAccountCode(input.orgCode) : null;
    const jobTitleCode = jobTitleProvided ? normalizeAccountCode(input.jobTitleCode) : null;
    const jobPositionCode = jobPositionProvided
      ? normalizeAccountCode(input.jobPositionCode)
      : null;
    const targetCompany = companyProvided ? input.companyCode!.trim() : acc.companyCode;
    const companyChanged = companyProvided && targetCompany !== acc.companyCode;

    // 2) AC-P9：name 若出現則不得為空／null（姓名為必填欄位，不可清空）。
    if (nameProvided && (name === null || name.length === 0)) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    // AC-P4 於編輯亦適用。
    assertProfileLengths(
      name,
      companyProvided ? targetCompany : null,
      orgCode,
      jobTitleCode,
      jobPositionCode,
    );
    // AC-P10b：公司一變更，舊部門／資位／職位代碼必然失效 → 三者須於同一請求明確出現
    // （值可為合法代碼或 null）。嚴禁靜默沿用舊值（會在 DB 留下跨公司髒代碼）。
    if (
      companyChanged &&
      (!orgProvided || !jobTitleProvided || !jobPositionProvided)
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    // 3) AC-P10：公司有效性（等於現值＝no-op，但仍須為有效公司）。
    if (companyProvided && !isSelectableCompany(targetCompany)) {
      throw new BadRequestException('ACCOUNT_COMPANY_CODE_INVALID');
    }

    // 4)5)6) 部門／資位／職位一律以**變更後之** companyCode 為範圍驗證
    //        （AC-P6／AC-P7／AC-P30／AC-P10b）。
    if (orgProvided) await this.assertOrgCodeValid(targetCompany, orgCode);
    if (jobTitleProvided) await this.assertJobTitleValid(targetCompany, jobTitleCode);
    if (jobPositionProvided) {
      await this.assertJobPositionValid(targetCompany, jobPositionCode);
    }

    // 6) AC-P10a：變更後之 (companyCode, loginId) 已為他帳號佔用 → 409，且不寫入任何欄位。
    //    ⚠ 比對範圍為**變更後之單一公司**（對應 DB 唯一鍵 UQ_ACCOUNT_company_login＝per-company），
    //    與 AC-P24 之全域比對（建立端）為不同檢查點，兩者皆保留（AC-P10a 對照表）。
    if (companyChanged && (await this.store.existsLoginId(targetCompany, acc.loginId))) {
      throw new ConflictException('ACCOUNT_USERNAME_EXISTS');
    }

    const patch: UpdateAccountPatch = {};
    if (nameProvided) patch.name = name;
    if (input.password !== undefined && input.password !== '') {
      patch.passwordHash = hashPassword(input.password);
    }
    if (companyProvided) patch.companyCode = targetCompany;
    if (orgProvided) patch.orgCode = orgCode;
    if (jobTitleProvided) patch.jobTitleCode = jobTitleCode;
    if (jobPositionProvided) patch.jobPositionCode = jobPositionCode;
    return this.store.updateById(id, patch);
  }

  /**
   * AC-P6：`orgCode` 非 null 時，必須存在一筆 `ORG_UNIT` 同時滿足 `orgCode` 相等**且**
   * `companyCode` 等於該帳號之公司。
   * ⚠ 刻意**不檢查 `isActive`**——下拉候選僅列 active（AC-P13），但既有帳號之部門可能於組織
   * 同步後被停用，若寫入端要求 active 將使該帳號連姓名都無法再儲存。
   * 無 ORG_UNIT store（手建 spec）→ 無從驗證，比照既有清單解析之優雅降級略過。
   */
  private async assertOrgCodeValid(
    companyCode: string,
    orgCode: string | null,
  ): Promise<void> {
    if (orgCode === null || !this.orgUnits) return;
    const units = await this.orgUnits.listByCompany(companyCode, {
      includeInactive: true,
    });
    if (!units.some((u) => u.orgCode === orgCode && u.companyCode === companyCode)) {
      throw new BadRequestException('ACCOUNT_ORG_CODE_INVALID');
    }
  }

  /**
   * AC-P7：`jobTitleCode`（資位）非 null 時，`(companyCode, code)` 必須**精確相等**命中一筆
   * `JOB_TITLE`。
   * ⚠ 寫入驗證刻意**不採**顯示端之兩段式跨公司 fallback（OQ-E01-08 記錄此不對稱）。
   * 無 JOB_TITLE store（手建 spec）→ 略過（同上之優雅降級）。
   */
  private async assertJobTitleValid(
    companyCode: string,
    jobTitleCode: string | null,
  ): Promise<void> {
    if (jobTitleCode === null || !this.jobTitles) return;
    const rows = await this.jobTitles.listAll();
    const wanted = jobTitleKey(companyCode, jobTitleCode);
    if (!rows.some((r) => jobTitleKey(r.companyCode, r.code) === wanted)) {
      throw new BadRequestException('ACCOUNT_JOB_TITLE_INVALID');
    }
  }

  /**
   * AC-P30：`jobPositionCode` 非 null 時，`(companyCode, code)` 必須**精確相等**命中一筆
   * `JOB_POSITION`。
   * ⚠ 此處與顯示端（`buildJobPositionResolver`）為**完全同一規則**——職位無 fallback 版本，
   *   故不存在資位那種「顯示寬鬆、寫入嚴格」之不對稱（OQ-E01-08）。
   * 無 JOB_POSITION store（手建 spec）→ 略過（同上之優雅降級）。
   */
  private async assertJobPositionValid(
    companyCode: string,
    jobPositionCode: string | null,
  ): Promise<void> {
    if (jobPositionCode === null || !this.jobPositions) return;
    const rows = await this.jobPositions.listAll();
    const wanted = jobPositionKey(companyCode, jobPositionCode);
    if (!rows.some((r) => jobPositionKey(r.companyCode, r.code) === wanted)) {
      throw new BadRequestException('ACCOUNT_JOB_POSITION_INVALID');
    }
  }

  /**
   * AC-P24：`loginId` 唯一性檢查範圍為**全部公司**（使 F001 AC-C1 之登入解析可單以 loginId 定位）。
   * store 未實作 `existsLoginIdGlobal`（既有測試替身）→ 退回既有 per-company 檢查；後者為前者之
   * 子集，故不會誤放行既有情境。
   */
  private loginIdTaken(companyCode: string, loginId: string): Promise<boolean> {
    return this.store.existsLoginIdGlobal
      ? this.store.existsLoginIdGlobal(loginId)
      : this.store.existsLoginId(companyCode, loginId);
  }
}

/** `(companyCode, orgCode)` 複合鍵字串化（AC-P23d）。以 `|` 分隔，比照 `jobTitleKey` 之慣例。 */
function orgUnitKey(companyCode: string, orgCode: string): string {
  return `${companyCode}|${orgCode}`;
}

/** AC-P4：五欄之 trim 後長度上限（任一超限即 `VALIDATION_ERROR`）。`null`＝未提供、不檢查。 */
function assertProfileLengths(
  name: string | null,
  companyCode: string | null,
  orgCode: string | null,
  jobTitleCode: string | null,
  jobPositionCode: string | null,
): void {
  if (
    exceedsLength(name, ACCOUNT_NAME_MAX_LENGTH) ||
    exceedsLength(companyCode, ACCOUNT_CODE_MAX_LENGTH) ||
    exceedsLength(orgCode, ACCOUNT_CODE_MAX_LENGTH) ||
    exceedsLength(jobTitleCode, ACCOUNT_CODE_MAX_LENGTH) ||
    exceedsLength(jobPositionCode, ACCOUNT_CODE_MAX_LENGTH)
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }
}
