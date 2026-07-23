import { Logger } from '@nestjs/common';
import { ExtractionTrigger } from './xls-source.store';

/**
 * F028/F030 抽取管線佔位觸發器：僅記錄，不執行抽取（F028 未建，屬未來 worktree）。
 * 整合階段以真實 job queue / event bus 觸發器取代（介面不變，OQ-F027-05）。
 */
export class LoggingExtractionTrigger implements ExtractionTrigger {
  private readonly logger = new Logger('ExtractionTrigger');
  trigger(documentId: string, reason: 'initial' | 'reextract'): void {
    this.logger.log(
      `xls uploaded → 待觸發抽取管線（F028/F030 未接線）documentId=${documentId} reason=${reason}`,
    );
  }
}
