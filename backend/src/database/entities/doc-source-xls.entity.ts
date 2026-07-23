import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * .xls 原始檔 DOC_SOURCE_XLS（data-model §docsourcexls-entity）。
 * 1:1（documentId 唯一）、覆蓋式（不留歷史檔）。僅作 RAG 內容來源，無對外下載端點。
 */
@Entity({ name: 'DOC_SOURCE_XLS' })
export class DocSourceXls {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('UQ_DOC_SOURCE_XLS_documentId', { unique: true })
  @Column({ type: 'uniqueidentifier' })
  documentId!: string; // → ICSOP_DOCUMENT（1:1）

  @Column({ type: 'varchar', length: 1000 })
  blobPath!: string;

  @Column({ type: 'nvarchar', length: 400 })
  fileName!: string;

  @Column({ type: 'varchar', length: 200 })
  contentType!: string;

  @Column({ type: 'bigint' })
  size!: string; // bigint → 字串（tedious）

  @Column({ type: 'varchar', length: 20, nullable: true })
  edition!: string | null; // 上傳當下文件版次快照

  @Column({ type: 'varchar', length: 100 })
  uploadedBy!: string;

  @Column({ type: 'datetime2' })
  uploadedAt!: Date;
}
