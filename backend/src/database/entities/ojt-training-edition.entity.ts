import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 各文件「曾經要求使用單位訓練」之版次紀錄（2026-09-29 新增；F044 卡④ 不分版次統計之母體來源）。
 *
 * `ICSOP_DOCUMENT.ojtTrainingEdition` 只存**當下**之訓練基準版次，改版要求重訓時直接覆寫，
 * 舊基準不留任何痕跡 ⇒ 「文件 × 使用單位 × 要訓練的版次」在本表出現之前**無法完整列舉**：
 * 只能從 `OJT_SESSION.edition` 反推，而「要求了重訓、卻沒有任何單位在那一版辦過訓練」的版次
 * 會整個從母體消失。本表把每一次「基準版次被設定」記成一列，補上這個缺口。
 *
 * 🔒 寫入點＝`ojtTrainingEdition` 被寫入之**同一個交易**（`typeorm-documents.store.ts` 之
 *   `create()`／`update()`）：兩者分開寫，任一邊失敗就會出現「基準推進了、紀錄沒有」之半套狀態。
 * 🔒 `(documentId, edition)` 唯一：同一版次被再次設為基準（例 A→B→A）不重複記一列——
 *   統計問的是「這一版要不要訓練」，不是「被設了幾次」。SQL Server 之唯一索引視 `NULL` 為相同值，
 *   故每份文件至多一列「未設版次」，恰為所需語意。
 * 🔒 `edition` 可為 `NULL`：＝「這份文件沒有版次概念」（比照 `ojtTrainingEdition` 之既有語意）。
 */
@Entity({ name: 'OJT_TRAINING_EDITION' })
@Index('UQ_OJT_TRAINING_EDITION_doc_edition', ['documentId', 'edition'], { unique: true })
export class OjtTrainingEdition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  documentId!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  edition!: string | null;

  /**
   * 紀錄來源：`CREATE`（建立文件）／`RETRAIN`（改版要求重訓）／
   * `BACKFILL_BASELINE`（上線時之當下基準）／`BACKFILL_SESSION`（上線時自場次快照反推）。
   * 📌 兩種 BACKFILL 之區分是刻意保留的：後者是**推定**、不是當時留下的紀錄，
   *   日後對數字有疑義時要能分辨哪些列是反推來的。
   */
  @Column({ type: 'varchar', length: 20 })
  source!: string;

  @Column({ type: 'datetime2' })
  requiredAt!: Date;
}
