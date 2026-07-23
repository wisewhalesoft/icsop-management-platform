import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * 文件↔使用表單關聯 DOC_USAGE_FORM（多對多附屬表）。
 * 複合主鍵 (documentId, formId)；一份表單可關聯多份文件、一份文件可關聯多份表單。
 * ⚠ data-model 未明列此附屬表（OQ-F018-07），依表單池多對多定案新增。
 */
@Entity({ name: 'DOC_USAGE_FORM' })
@Index('IX_DOC_USAGE_FORM_formId', ['formId'])
export class DocUsageForm {
  @PrimaryColumn({ type: 'uniqueidentifier' })
  documentId!: string; // → ICSOP_DOCUMENT

  @PrimaryColumn({ type: 'uniqueidentifier' })
  formId!: string; // → USAGE_FORM_POOL
}
