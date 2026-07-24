/**
 * 文件變更事件 seam（F011/F012）。
 *
 * 決策 A（wave 1）：本檔只定義並「發出」變更事件之契約 seam，預設綁定為 no-op。
 * 決策 B（F037，changehistory worktree）：F037 到位後由真實 publisher（DocumentChangeLogPublisher）
 *   覆寫綁定，將事件持久化為 append-only 之欄位層變更日誌（DOCUMENT_CHANGE_LOG）。
 *   為承載欄位層 before/after diff 與操作者身分快照，本事件**加選填欄位**（向後相容，Noop 忽略）：
 *   `changes`（逐欄位 old/new）、`actorId/actorName/actorEmployeeNo`（操作者快照）、`documentNumber`（文件編號快照）。
 *
 * ⚠ 契約鎖定核心欄（rag/public 逐字重用，勿改既有欄位語意；新增欄一律選填）：
 *   - changeType：CONTENT（欄位內容異動，F011）／STATUS（狀態切換，F012）／META（保留）
 *   - changedFields：本次異動之欄位屬性名（選填，供下游過濾）
 *   - occurredAt：事件發生時間
 */

/** 單一欄位之 before/after 快照（字串化；null＝無值）。供 F037 欄位層變更日誌落地。 */
export interface DocumentFieldDelta {
  /** 欄位屬性名（例：status、documentName、draftingDeptId）。 */
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface DocumentChangedEvent {
  documentId: string;
  /**
   * changeType：CONTENT（欄位內容異動，F011）／STATUS（狀態切換，F012）／META（保留）／
   * CREATE（建立，F010——逐欄位 new-value 列，oldValue 恆 null）。
   * DB 欄位 `changeType varchar(20)` 已容納 'CREATE'（6 字元），無需 migration。
   */
  changeType: 'CONTENT' | 'STATUS' | 'META' | 'CREATE';
  changedFields?: string[];
  /** F037：逐欄位 before/after（空陣列或未提供＝無實際欄位變更，不落地任何變更日誌）。 */
  changes?: DocumentFieldDelta[];
  /** 文件編號快照（供變更歷程顯示/篩選；覆寫可能改編號，取當下值）。 */
  documentNumber?: string | null;
  /** 操作者帳號 UUID（= SessionUser.accountId）。 */
  actorId?: string | null;
  /** 操作者姓名快照（寫入當下，避免日後改名使歷史跑掉）。 */
  actorName?: string | null;
  /** 操作者員工編號快照。 */
  actorEmployeeNo?: string | null;
  /**
   * F012 切換原因（選填，事件層級；語意上僅 changeType==='STATUS' 時有意義，其餘 changeType 恆 undefined）。
   * 真實 publisher 將其落地至 DOCUMENT_CHANGE_LOG.reason（供變更歷程檢視，F012 AC36）。
   */
  reason?: string | null;
  occurredAt: Date;
}

export interface DocumentChangePublisher {
  publish(event: DocumentChangedEvent): Promise<void>;
}

/** DI token；documents.module 預設綁 Noop，changehistory 併回後覆寫為 DocumentChangeLogPublisher。 */
export const DOCUMENT_CHANGE_PUBLISHER = Symbol('DOCUMENT_CHANGE_PUBLISHER');

/** 預設 no-op 綁定：接受事件但不做任何事（不阻斷來源交易）。 */
export class NoopDocumentChangePublisher implements DocumentChangePublisher {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async publish(_event: DocumentChangedEvent): Promise<void> {
    // 預設不落地；F037 到位後由真實 publisher 覆寫此綁定。
  }
}

/**
 * 欄位值字串化（供變更日誌 old/new 落地）。純函式。
 *  - null/undefined → null（DB NULL）
 *  - Date → ISO 字串
 *  - 物件/陣列 → JSON（理論上不會出現，多值欄於 service 已剔除）
 *  - 其餘（string/number/boolean）→ String()
 */
export function toFieldValueString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * F010 建立事件之逐欄位 delta（純函式，無 IO）。建立＝「由無到有」，故每列 oldValue 恆為 null。
 *  - null/undefined → 略過（欄位未填，非「變更」）。
 *  - 空陣列（secondaryChiefIds:[]／usingDeptIds:[]）→ 略過（「未提供」不是一個值得記錄的新值，杜絕噪音列）。
 *  - 其餘 → `{ field, oldValue:null, newValue: toFieldValueString(v) }`（重用既有字串化：Date→ISO、陣列→JSON）。
 *
 * 呼叫端固定傳入 create() 中已正規化完成之 input（CreateDocumentInput；系統欄如 UUID 早於 classifyFields
 * 歸為 ignored 並自 clean 剔除，不會流入此處）。
 */
export function buildCreateChangeDeltas(
  fields: Record<string, unknown>,
): DocumentFieldDelta[] {
  const deltas: DocumentFieldDelta[] = [];
  for (const [field, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    deltas.push({ field, oldValue: null, newValue: toFieldValueString(v) });
  }
  return deltas;
}
