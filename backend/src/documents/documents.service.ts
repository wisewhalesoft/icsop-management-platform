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
import { isUniqueConstraintViolation } from './db-error';
import { normalizeReason } from './status-reason';
import {
  DOCUMENT_CHANGE_PUBLISHER,
  DocumentChangePublisher,
  NoopDocumentChangePublisher,
} from './document-change-event';

/** 編輯端一律唯讀之欄位（節點寫入僅經 F009 節點抽屜，F026）。 */
const EDIT_READONLY_PROPS = new Set(['nodeId']);

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

    const input: CreateDocumentInput = {
      ...(clean as Omit<CreateDocumentInput, 'status'>),
      status: status as DocumentStatus,
      documentNumber,
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

    // 6) 版本對照 diff（新舊值快照，供編輯頁確認）。
    const changes: DocumentFieldChange[] = [];
    const beforeRec = current as unknown as Record<string, unknown>;
    const afterRec = updated as unknown as Record<string, unknown>;
    for (const k of Object.keys(clean)) {
      if (beforeRec[k] !== afterRec[k]) {
        changes.push({ field: k, before: beforeRec[k], after: afterRec[k] });
      }
    }

    // 7) 發出變更事件（CONTENT，決策 A seam）。
    await this.publisher.publish({
      documentId: id,
      changeType: 'CONTENT',
      changedFields: Object.keys(clean),
      occurredAt: new Date(),
    });

    return { document: updated, changes };
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
    // reason 正規化（空白視同未填）；目前無持久化 sink（F037 deferred），保留供未來記錄。
    void normalizeReason(reason);
    await this.store.updateStatus(id, status);

    // 決策 A seam：狀態切換成功後發 STATUS 事件（不承載 reason，契約鎖定）。
    await this.publisher.publish({
      documentId: id,
      changeType: 'STATUS',
      changedFields: ['status'],
      occurredAt: new Date(),
    });
  }
}
