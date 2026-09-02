import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * OJT 場次 `OJT_SESSION`（data-model §ojt-session-entity，F042／E11）。
 *
 * 以「**一份 ICSOP 文件 × 一個使用單位**」為歸屬鍵，每列＝一次教育訓練場次事實；
 * 同一 `(documentId, orgCode)` 可累積 0..* 筆（F042 `AC-02`：**累加、非覆蓋**）。
 * 生命週期為 **append ＋ delete only，無 update 路徑**（`AC-19` 僅 ICSOPAdmin 可刪／
 * `AC-20` 不可編輯）——唯一例外是待歸位列之一次性 `orgCode` 指派（`AC-26`，單向不可逆）。
 *
 * 🔴 **`orgCode` 對 `DOC_USING_DEPT` 之關係為「值比對之衍生 join」，刻意不建 FK 指向其 `id`**：
 * 文件之使用部門編輯採 delete-then-insert 全量取代（`typeorm-documents.store.ts`），每次編輯
 * 既有全部 `DOC_USING_DEPT` 列（含代理鍵）皆被重建。若以 FK 指向 `DOC_USING_DEPT.id`，
 * 任何一次使用部門編輯都會因 CASCADE 抹掉該文件**全部**使用單位之**全部**場次——直接牴觸
 * 「場次是累加之歷史事實」之產品前提。
 */
@Entity({ name: 'OJT_SESSION' })
// 非唯一（與 DOC_USING_DEPT 之複合唯一索引刻意不同——同一單位可累積多筆場次）。
// 供 TAB2 分組查詢與文件層 ojtStatus 富化之批次聚合。
@Index('IX_OJT_SESSION_doc_org', ['documentId', 'orgCode'])
export class OjtSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** → ICSOP_DOCUMENT（FK ON DELETE CASCADE，比照 DOC_USING_DEPT 之既有慣例）。 */
  @Index('IX_OJT_SESSION_doc')
  @Column({ type: 'uniqueidentifier' })
  documentId!: string;

  /**
   * 使用單位之組織代碼（`ORG_UNIT.orgCode`）。
   * 🔴 **nullable**（`OQ-E11-01=C`）：`NULL` ＝既有單份 `OJT_SIGNIN` 附件遷移而來、尚未指派
   * 使用單位之「待歸位」列，由 ICSOPAdmin 手動歸位。正常登記流程（`AC-05`）建立者恆非 NULL。
   * 🔒 **不另設布林 pending 旗標**——`orgCode IS NULL` 本身即為充分且無歧義之信號，
   * 另加一個恆與之相依的欄位只是冗餘狀態，且兩者一旦不同步就會產生「哪個才算數」之爭議。
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  orgCode!: string | null;

  /** 所屬公司（恆等同其文件之 companyCode；比照 DOC_USING_DEPT 之 B 階段多公司不變式）。 */
  @Column({ type: 'varchar', length: 10 })
  companyCode!: string;

  /**
   * 該場次所屬單位自文件使用部門移除之時間戳記（`AC-25`，`OQ-E11-02=C` 軟標記）。
   * `NULL`＝仍是使用部門／從未移除／已重新掛回（復活）；有值＝已移除，不計入任何統計分子分母。
   *
   * ⚠ **不變式**：`orphanedAt IS NULL ⟺ orgCode ∈ 該文件當下之 DOC_USING_DEPT 集合`
   * （`orgCode IS NULL` 之待歸位列除外）。
   * 🔴 **本欄記錄的是孤兒化「發生的時點」（供稽核回溯），不是判定之來源**——下游顯示邏輯
   * 一律以集合成員關係判定，不得綁死在本旗標上；兩者依不變式等價，但若某條 patch 路徑漏跑
   * 維護 `UPDATE`，綁旗標者會靜默顯示錯誤狀態，綁集合者仍然正確。
   */
  @Column({ type: 'datetime2', nullable: true })
  orphanedAt!: Date | null;

  /**
   * 訓練日期（`YYYY-MM-DD`）。必填、不可為未來日（以伺服器當日為界，**當日合法**）。
   * ⚠ 遷移之待歸位列以既有附件之 `uploadedAt` 日期作**最佳近似值**（真實訓練日期已不可考）。
   * 🔴 型別為 `date` 而非 `datetime2`：訓練日期是**日曆日**，不帶時刻；用 datetime 會把時區
   * 問題引進一個本來沒有時區的概念（本 repo 2026-08-15 已於 `useUTC` 吃過一次虧）。
   */
  @Column({ type: 'date' })
  trainingDate!: string;

  /**
   * 🔴 F042 第五輪（2026-09-02）：登記當下之 **OJT 訓練基準版次快照**
   * （＝`ICSOP_DOCUMENT.ojtTrainingEdition`，**不是** `edition`）。
   *
   * 完成判定＝該列存在 `edition` 與文件當下 `ojtTrainingEdition` **相符**之場次
   * （`null` 對 `null` 亦相符——591 份文件中僅 7 份填了版次，全 `null` 之退化情形必須是
   * 「照舊全部算數」而非「全部失效」）。
   * 🔴 **快照的是基準版次、不是文件當下版次**：改版但裁決「不需重訓」時 `ojtTrainingEdition`
   * 停在舊值，此時新登記之場次若快照 `edition`（新版次）就會與基準不符 ⇒ 一個剛辦完訓練的
   * 單位仍顯示「尚未完成」。兩者只有在「需重訓」時才相等，平時可以不等。
   * ⚠ **既有列由 migration 回填為其文件當下之 `edition`**（人類裁決：既有場次視為當下版次），
   * 使既有已完成之列不會在上線當天整批翻紅。
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  edition!: string | null;

  @Column({ type: 'nvarchar', length: 400 })
  fileName!: string;

  /**
   * Azure Blob 參照。新制路徑＝`documents/{documentId}/ojt/{orgCode}/{uuid}.{ext}`（`AC-10` ③）；
   * 🔒 遷移之待歸位列**沿用舊格式**（`documents/{documentId}/ojt_signin/{uuid}.{ext}`）且
   * **歸位時不搬移**——兩種格式並存是刻意的，搬移只為了讓路徑好看卻要承擔搬移失敗與參照
   * 不同步的風險。系統內無任何程式路徑反解析本欄字串取 `orgCode`（DB 欄位才是權威）。
   */
  @Column({ type: 'varchar', length: 1000 })
  blobPath!: string;

  @Column({ type: 'varchar', length: 200 })
  contentType!: string;

  /** ⚠ bigint 由 tedious 以字串傳回（比照 DOCUMENT_ATTACHMENT.size 之既有處置）。 */
  @Column({ type: 'bigint' })
  size!: string;

  /** 上傳者帳號（accountId）。⚠ 為**登記者**身分，非受訓人員——系統自始不記錄受訓名單。 */
  @Column({ type: 'varchar', length: 100 })
  uploadedBy!: string;

  @Index('IX_OJT_SESSION_uploadedAt')
  @Column({ type: 'datetime2' })
  uploadedAt!: Date;
}
