import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 附件 DOCUMENT_ATTACHMENT（data-model §attachment-entity）。
 * 本增量（storage worktree）僅承載單份覆蓋式類型：ICSOP_PDF / OJT_SIGNIN（各文件各 1 份）。
 * USAGE_FORM 因採「表單池 + 多對多」模型（F018），另置於 USAGE_FORM_POOL / DOC_USAGE_FORM，
 * 不落於本表（與 data-model 將 USAGE_FORM 併入本表之敘述有出入，已於 impl log/summary flag）。
 * (documentId, type) 於單份類型唯一（覆蓋式）→ migration filtered unique index。
 */
@Entity({ name: 'DOCUMENT_ATTACHMENT' })
@Index('IX_DOCUMENT_ATTACHMENT_documentId', ['documentId'])
export class DocumentAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  documentId!: string; // → ICSOP_DOCUMENT

  @Column({ type: 'varchar', length: 20 })
  type!: string; // ICSOP_PDF / OJT_SIGNIN

  @Column({ type: 'nvarchar', length: 400 })
  fileName!: string;

  @Column({ type: 'varchar', length: 1000 })
  blobPath!: string;

  @Column({ type: 'varchar', length: 200 })
  contentType!: string;

  @Column({ type: 'bigint' })
  size!: string; // bigint 由 tedious 以字串傳回

  @Column({ type: 'varchar', length: 100 })
  uploadedBy!: string;

  @Column({ type: 'datetime2' })
  uploadedAt!: Date;
}
