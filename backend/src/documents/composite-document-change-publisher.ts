import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentChangePublisher,
  DocumentChangedEvent,
} from './document-change-event';

/**
 * `DOCUMENT_CHANGE_PUBLISHER` 之 fan-out 綁定。
 *
 * 背景：seam 原為單一綁定（F037 之 DocumentChangeLogPublisher）。F006 需再掛一個訂閱者
 * （提示自動解除，Route A），故改為 Composite——既有訂閱者語意不變，新增者並存。
 *
 * ⚠ 逐一 try/catch：任一訂閱者失敗不影響其他訂閱者，亦不上拋至 `DocumentsService.update()`
 *   （文件儲存為主流程，事件廣播為附加副作用）。
 */
@Injectable()
export class CompositeDocumentChangePublisher implements DocumentChangePublisher {
  private readonly logger = new Logger(CompositeDocumentChangePublisher.name);

  constructor(private readonly subscribers: DocumentChangePublisher[]) {}

  async publish(event: DocumentChangedEvent): Promise<void> {
    for (const s of this.subscribers) {
      try {
        await s.publish(event);
      } catch (e) {
        this.logger.error(
          `文件變更事件訂閱者失敗（已吞，不阻斷其他訂閱者）document=${event.documentId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  }
}
