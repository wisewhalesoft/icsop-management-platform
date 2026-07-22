import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DOCUMENT_STORE,
  DocumentStore,
  CreateDocumentInput,
  DocumentView,
  DocumentListFilters,
  DocumentListItem,
} from './documents.store';
import { missingRequired, isNumberAvailable } from './document-rules';
import { isValidStatus, DocumentStatus } from './document-status';
import { classifyFields } from './document-field-write';

/**
 * ICSOP 文件服務（E04）。RBAC 功能面由 controller guard（ICSOP文件管理 write＝ICSOPAdmin）落實；
 * 本服務另做 F026 欄位面 enforcement、F010 必填、F012 狀態合法、F013 編號唯一。
 * 註：lifecycleId 於本增量為必填參照字串；對 LIFECYCLE 表之 FK 完整性與建立頁循環下拉待 E03（F007）。
 */
@Injectable()
export class DocumentsService {
  constructor(@Inject(DOCUMENT_STORE) private readonly store: DocumentStore) {}

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
    return this.store.create(input);
  }

  /** 後台文件清單（F017）。 */
  listDocuments(filters: DocumentListFilters): Promise<DocumentListItem[]> {
    return this.store.list(filters);
  }

  /**
   * 切換狀態（F012）。狀態合法 → 存在 → 切回「有效」時重驗編號唯一性（F013，排除自身）→ 更新。
   * 功能面（僅 ICSOPAdmin）由 controller guard 落實。
   */
  async setStatus(id: string, status: string): Promise<void> {
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
    await this.store.updateStatus(id, status);
  }
}
