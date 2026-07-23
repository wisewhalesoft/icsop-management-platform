/**
 * 文件變更事件 seam（F011/F012）。
 *
 * 決策 A：本 wave 只定義並「發出」變更事件之契約 seam，預設綁定為 no-op；
 * 真正之變更歷程持久化（F037 `DOCUMENT_CHANGE_LOG`）與 RAG 消費者於後續 worktree／併回後綁定。
 * 因此本檔不涉及任何儲存；`update()`／`setStatus()` 成功後呼叫 `publish()`，
 * 現階段落到 NoopDocumentChangePublisher（不阻斷、不持久化）。
 *
 * ⚠ 契約鎖定（rag/public/F037 逐字重用，勿擅改欄位）：
 *   - changeType：CONTENT（欄位內容異動，F011）／STATUS（狀態切換，F012）／META（保留）
 *   - changedFields：本次異動之欄位屬性名（選填，供下游過濾）
 *   - occurredAt：事件發生時間
 */
export interface DocumentChangedEvent {
  documentId: string;
  changeType: 'CONTENT' | 'STATUS' | 'META';
  changedFields?: string[];
  occurredAt: Date;
}

export interface DocumentChangePublisher {
  publish(event: DocumentChangedEvent): Promise<void>;
}

/** DI token；模組預設綁 NoopDocumentChangePublisher，rag 併回後可覆寫為真實消費者。 */
export const DOCUMENT_CHANGE_PUBLISHER = Symbol('DOCUMENT_CHANGE_PUBLISHER');

/** 預設 no-op 綁定：接受事件但不做任何事（不阻斷來源交易）。 */
export class NoopDocumentChangePublisher implements DocumentChangePublisher {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async publish(_event: DocumentChangedEvent): Promise<void> {
    // 預設不落地；F037 到位後由真實 publisher 覆寫此綁定。
  }
}
