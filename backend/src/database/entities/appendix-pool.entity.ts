import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 附錄池 APPENDIX_POOL（F039／data-model #appendix-entity）。
 * 集中共用資產：一份附錄可被多份文件引用（關聯見 DOC_APPENDIX，含文件內顯示順序 sortOrder）。
 * 覆蓋式更新、不留歷史版本（AC-13）；結構比照 USAGE_FORM_POOL。
 */
@Entity({ name: 'APPENDIX_POOL' })
export class AppendixPool {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** trim 後之名稱；未提供／空白 → fallback 原始檔名。上限 400 字元（APPENDIX_NAME_TOO_LONG）。 */
  @Column({ type: 'nvarchar', length: 400 })
  name!: string;

  @Column({ type: 'varchar', length: 1000 })
  blobPath!: string;

  @Column({ type: 'varchar', length: 20 })
  format!: string; // xlsx / xls / pdf

  @Column({ type: 'bigint' })
  size!: string;

  @Column({ type: 'varchar', length: 100 })
  uploadedBy!: string;

  @Column({ type: 'datetime2' })
  uploadedAt!: Date;
}
