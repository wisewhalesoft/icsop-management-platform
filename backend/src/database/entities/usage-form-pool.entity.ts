import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 使用表單池 USAGE_FORM_POOL（OQ-E05-04 定案：表單池多對多）。
 * 一份表單可被多份文件引用（關聯見 DOC_USAGE_FORM）。覆蓋式，不留歷史版本。
 */
@Entity({ name: 'USAGE_FORM_POOL' })
export class UsageFormPool {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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
