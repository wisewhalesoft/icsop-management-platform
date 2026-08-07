import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * 文件↔附錄關聯 DOC_APPENDIX（多對多附屬表，F039／data-model #doc-appendix）。
 * 複合主鍵 (documentId, appendixId)（同一附錄於同一文件至多一筆）；appendixId 上建索引供 docCount 查詢。
 *
 * `sortOrder`＝該文件內之顯示順序（1-based、連續、文件內互異）。
 * ⚠ OQ-E10-02 已定案（architecture-spec §4.9）：**不**建 (documentId, sortOrder) 唯一索引；
 * 不變式由服務層 replaceDocumentAppendices()（單一交易 delete-then-insert）保證。
 */
@Entity({ name: 'DOC_APPENDIX' })
@Index('IX_DOC_APPENDIX_appendixId', ['appendixId'])
export class DocAppendix {
  @PrimaryColumn({ type: 'uniqueidentifier' })
  documentId!: string; // → ICSOP_DOCUMENT

  @PrimaryColumn({ type: 'uniqueidentifier' })
  appendixId!: string; // → APPENDIX_POOL

  @Column({ type: 'int' })
  sortOrder!: number;
}
