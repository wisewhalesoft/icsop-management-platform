import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 文件連結點（F015）。單向：sourceDocumentId → targetDocumentId（A→B 不代表 B→A，OQ-E04-04）。
 * 目標作廢/失效仍允許連結（OQ-E04-05）；目標存在性於應用層以 DocumentStore.findById 預查（F015）。
 * (source, target) 複合唯一（避免重複列）；刪文件之連帶清理由 app 層處理（NO ACTION）。
 * 註：本檔僅撰寫 entity，對應 migration 亦僅撰寫、未執行（unit-only）。
 */
@Entity({ name: 'DOCUMENT_LINK' })
@Index('UQ_DOCUMENT_LINK_source_target', ['sourceDocumentId', 'targetDocumentId'], {
  unique: true,
})
export class DocumentLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IX_DOCUMENT_LINK_source')
  @Column({ type: 'uniqueidentifier' })
  sourceDocumentId!: string;

  @Column({ type: 'uniqueidentifier' })
  targetDocumentId!: string;

  @Column({ type: 'datetime2' })
  createdAt!: Date;
}
