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
  DocumentUpdateResult,
  DocumentFieldChange,
  DocumentListFilters,
  DocumentListItem,
  DocumentListPage,
} from './documents.store';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { missingRequired, isNumberAvailable } from './document-rules';
import { isValidStatus, DocumentStatus } from './document-status';
import { classifyFields } from './document-field-write';
import { normalizeIdList } from './document-org-fields';
import { isUniqueConstraintViolation } from './db-error';
import { normalizeReason } from './status-reason';
import {
  DOCUMENT_LINK_STORE,
  DocumentLinkStore,
  DocumentLinkView,
} from './document-link.store';
import {
  DOCUMENT_CHANGE_PUBLISHER,
  DocumentChangePublisher,
  DocumentFieldDelta,
  NoopDocumentChangePublisher,
  toFieldValueString,
} from './document-change-event';

/** 編輯端一律唯讀之欄位（節點寫入僅經 F009 節點抽屜，F026）。 */
const EDIT_READONLY_PROPS = new Set(['nodeId']);

/**
 * 變更事件之操作者身分快照（F037）。由 controller 自 SessionUser 帶入；
 * 選填以免破壞既有 `svc.update(role,id,payload)` 手建呼叫（無 actor → 變更日誌 actor 欄落 null）。
 */
export interface DocumentActor {
  accountId?: string | null;
  name?: string | null;
  employeeNo?: string | null;
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
  ) {
    // 預設 no-op 綁定（決策 A）：seam 存在但不落地，rag/F037 併回後覆寫。
    this.publisher = publisher ?? new NoopDocumentChangePublisher();
  }

  /** 建立文件（F010）。payload 為原始酬載；經欄位面清洗與驗證後寫入。 */
  async create(
    roleCode: string | undefined,
    payload: Record<string, unknown>,
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

    // F014 多值欄位（次要室長 employeeNo／使用部門 orgCode）：正規化為明確集合（可空）後落地。
    const input: CreateDocumentInput = {
      ...(clean as Omit<CreateDocumentInput, 'status'>),
      status: status as DocumentStatus,
      documentNumber,
      secondaryChiefIds: normalizeIdList(clean.secondaryChiefIds),
      usingDeptIds: normalizeIdList(clean.usingDeptIds),
    };
    // F013 併發第二保險：DB filtered unique index 違反 → 映射 409（不洩漏原始 DB 訊息）。
    try {
      return await this.store.create(input);
    } catch (e) {
      if (isUniqueConstraintViolation(e)) {
        throw new ConflictException('DOCUMENT_NUMBER_DUPLICATE');
      }
      throw e;
    }
  }

  /**
   * 後台文件清單（F017）。store 負責篩選/排序/分頁；service 補上組織/當責室長之名稱解析
   * （org-foundation NameResolutionService；查無→null，前端 fallback）。
   */
  async listDocuments(filters: DocumentListFilters): Promise<DocumentListPage> {
    const page = await this.store.list(filters);
    await this.enrichNames(page.items);
    return page;
  }

  /** 以 NameResolutionService 補上組織/室長顯示名稱（去重、批次，避免 N+1）。無 resolver → 保持 null。 */
  private async enrichNames(items: DocumentListItem[]): Promise<void> {
    const resolver = this.nameResolver;
    if (!resolver || items.length === 0) return;

    const orgCodes = new Set<string>();
    for (const it of items) {
      for (const c of [it.draftingCompanyId, it.draftingDeptId, it.draftingSectionId]) {
        if (c) orgCodes.add(c);
      }
    }
    const orgNames = new Map<string, string | null>();
    await Promise.all(
      [...orgCodes].map(async (c) => orgNames.set(c, await resolver.resolveOrgUnitName(c))),
    );

    const chiefIds = [
      ...new Set(items.map((i) => i.primaryChiefId).filter((x): x is string => !!x)),
    ];
    const chiefNames = chiefIds.length
      ? await resolver.resolvePersonNames(chiefIds)
      : new Map<string, string>();

    for (const it of items) {
      it.draftingCompanyName = it.draftingCompanyId ? orgNames.get(it.draftingCompanyId) ?? null : null;
      it.draftingDeptName = it.draftingDeptId ? orgNames.get(it.draftingDeptId) ?? null : null;
      it.draftingSectionName = it.draftingSectionId ? orgNames.get(it.draftingSectionId) ?? null : null;
      it.primaryChiefName = it.primaryChiefId ? chiefNames.get(it.primaryChiefId) ?? null : null;
    }
  }

  /** 單筆文件讀取（F011 編輯對照；public/rag 重用）。查無 → 404。 */
  async getDocument(id: string): Promise<DocumentView> {
    const doc = await this.store.findById(id);
    if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    return doc;
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

    // 1a) F014 多值欄位（次要室長／使用部門）之編輯端持久化屬 F014 編輯頁範圍（本輪 create-side only）：
    //     此處自 clean 剔除，避免以純量覆寫路徑誤寫或產生偽 diff（功能面 FORBIDDEN 已於上方 classifyFields 攔截）。
    delete clean.secondaryChiefIds;
    delete clean.usingDeptIds;

    // 1b) F015 連結點（決策：隨 PATCH 整批送出）：自 clean 抽出 links（非純量欄，另走連結 store）。
    let linkTargetIds: string[] | undefined;
    if ('links' in clean) {
      const raw = clean.links;
      linkTargetIds = Array.isArray(raw) ? (raw as string[]) : [];
      delete clean.links;
    }

    // 2) F010 必填：合併現值後檢核（partial patch 只影響被觸及之必填欄）。
    const merged = { ...current, ...clean } as Record<string, unknown>;
    if (missingRequired(merged).length > 0) {
      throw new BadRequestException('DOCUMENT_REQUIRED_FIELD_MISSING');
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
    let updated: DocumentView;
    try {
      updated = await this.store.update(id, clean as DocumentPatch);
    } catch (e) {
      if (isUniqueConstraintViolation(e)) {
        throw new ConflictException('DOCUMENT_NUMBER_DUPLICATE');
      }
      throw e;
    }

    // 5b) F015 連結點差集同步（新增/移除；單向 source=id）。
    if (linkTargetIds !== undefined && this.linkStore) {
      await this.syncLinks(id, linkTargetIds);
    }

    // 6) 版本對照 diff（新舊值快照，供編輯頁確認）。
    const changes: DocumentFieldChange[] = [];
    const beforeRec = current as unknown as Record<string, unknown>;
    const afterRec = updated as unknown as Record<string, unknown>;
    for (const k of Object.keys(clean)) {
      if (beforeRec[k] !== afterRec[k]) {
        changes.push({ field: k, before: beforeRec[k], after: afterRec[k] });
      }
    }

    // 7) 發出變更事件（CONTENT）。決策 B：承載欄位層 before/after diff ＋操作者/編號快照，
    //    真實 publisher（DocumentChangeLogPublisher）將其持久化為 DOCUMENT_CHANGE_LOG（F037）。
    const changedFields = Object.keys(clean);
    if (linkTargetIds !== undefined) changedFields.push('links');
    const deltas: DocumentFieldDelta[] = changes.map((c) => ({
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

  /** F015：查詢某文件之連結點清單（單向；附目標編號/書名/目前狀態）。無 linkStore → 空陣列。 */
  async getDocumentLinks(sourceId: string): Promise<DocumentLinkView[]> {
    if (!this.linkStore) return [];
    const links = await this.linkStore.findBySource(sourceId);
    return Promise.all(
      links.map(async (l) => {
        const target = await this.store.findById(l.targetDocumentId);
        return {
          linkId: l.id,
          targetDocumentId: l.targetDocumentId,
          targetNumber: target?.documentNumber ?? null,
          targetName: target?.documentName ?? null,
          targetStatus: target?.status ?? null,
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
   * 切換狀態（F012）。狀態合法 → 存在 → 切回「有效」時重驗編號唯一性（F013，排除自身）→ 更新。
   * 功能面（僅 ICSOPAdmin）由 controller guard 落實。
   *
   * reason（OQ-E04-02，選填）：切換原因。經 normalizeReason 正規化（空白視同未填）。
   * ⚠ 決策 A：本 wave 之 DocumentChangedEvent 契約不承載 reason/前後狀態（屬 F037 變更歷程，deferred）；
   * 故 reason 目前僅被接收/正規化、供未來記錄使用，尚無持久化 sink。成功後發 STATUS 事件。
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

    if (status === 'active') {
      const holders = await this.store.findNumberHolders(doc.documentNumber);
      if (!isNumberAvailable(doc.documentNumber, holders, doc.id)) {
        throw new ConflictException('DOCUMENT_NUMBER_DUPLICATE');
      }
    }
    // reason 正規化（空白視同未填）；reason 目前無持久化 sink（OQ-E04-02），保留供未來記錄。
    void normalizeReason(reason);
    const oldStatus = doc.status;
    await this.store.updateStatus(id, status);

    // 決策 B：狀態切換成功後發 STATUS 事件，承載 status 欄位之 old/new ＋操作者/編號快照，
    // 由真實 publisher 落地為 DOCUMENT_CHANGE_LOG（F037）。狀態相同時不產生 delta（無日誌）。
    const deltas: DocumentFieldDelta[] =
      oldStatus === status
        ? []
        : [{ field: 'status', oldValue: oldStatus, newValue: status }];
    await this.publisher.publish({
      documentId: id,
      changeType: 'STATUS',
      changedFields: ['status'],
      changes: deltas,
      documentNumber: doc.documentNumber,
      actorId: actor?.accountId ?? null,
      actorName: actor?.name ?? null,
      actorEmployeeNo: actor?.employeeNo ?? null,
      occurredAt: new Date(),
    });
  }
}
