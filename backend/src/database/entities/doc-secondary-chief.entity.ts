import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 文件當責室長-次要（F014，多值）。(documentId, employeeNo) 一筆一位次要室長。
 * employeeNo＝員工編號（業務鍵，對應 ACCOUNT/PERSON；與 primaryChiefId 同語意，非 UUID）。
 * FK → ICSOP_DOCUMENT ON DELETE CASCADE（刪文件連帶清除其多值列）。
 * (documentId, employeeNo) 複合唯一（同一文件不重複同一人）。
 */
@Entity({ name: 'DOC_SECONDARY_CHIEF' })
@Index('UQ_DOC_SECONDARY_CHIEF_doc_emp', ['documentId', 'employeeNo'], { unique: true })
export class DocSecondaryChief {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IX_DOC_SECONDARY_CHIEF_doc')
  @Column({ type: 'uniqueidentifier' })
  documentId!: string;

  @Column({ type: 'varchar', length: 20 })
  employeeNo!: string;
}
