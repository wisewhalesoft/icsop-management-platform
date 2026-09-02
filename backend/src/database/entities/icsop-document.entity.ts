import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ICSOP 文件（E04）。19 欄位權威定義見 data-model §document-entity。
 * 本增量含 scalar 欄位；多值關聯（當責室長-次要、使用部門）、附件、連結點為後續增量（F014/F015/F016）。
 * 編號唯一性（F013）以 filtered unique index（WHERE status IN('active','void')）於 migration 落實。
 */
@Entity({ name: 'ICSOP_DOCUMENT' })
export class IcsopDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * 🔴 B 階段（多公司）：文件所屬公司。`draftingCompanyId`／`draftingDeptId`／
   * `draftingSectionId` 存的是裸 `ORG_UNIT.orgCode`，而各公司之 orgCode 獨立編碼、字串可能
   * 相同——沒有本欄，文件無法自證屬於哪家公司，部門名稱解析與 F041 可見性判定皆會歧義。
   * 既有列已由 migration backfill 為 'AS'（上線以來僅同步過該公司）。
   */
  @Index('IX_ICSOP_DOCUMENT_companyCode')
  @Column({ type: 'varchar', length: 10 })
  companyCode!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: string; // active / inactive / void

  @Index('IX_ICSOP_DOCUMENT_number')
  @Column({ type: 'varchar', length: 100 })
  documentNumber!: string;

  @Column({ type: 'nvarchar', length: 200 })
  documentName!: string;

  @Index('IX_ICSOP_DOCUMENT_lifecycleId')
  @Column({ type: 'uniqueidentifier' })
  lifecycleId!: string; // → LIFECYCLE（建立時必填）

  @Column({ type: 'uniqueidentifier', nullable: true })
  nodeId!: string | null; // → LIFECYCLE_NODE（唯一權威寫入＝節點抽屜 F009）

  // 制定公司/部門/室別＝ORG_UNIT.orgCode（業務鍵，非 UUID；對齊讀取端 findByOrgCode 與前端下拉，F014）。

  @Column({ type: 'varchar', length: 10, nullable: true })
  draftingDeptId!: string | null; // → ORG_UNIT.orgCode（部）

  @Column({ type: 'varchar', length: 10, nullable: true })
  draftingSectionId!: string | null; // → ORG_UNIT.orgCode（處/室）

  @Column({ type: 'varchar', length: 20, nullable: true })
  primaryChiefId!: string | null; // 當責室長-主要（員編；PERSON 表待建）

  @Column({ type: 'varchar', length: 20, nullable: true })
  edition!: string | null; // 版次 {YY}'{NN}

  /**
   * 🔴 F042 第五輪（2026-09-02）：**OJT 訓練基準版次**——「各使用單位目前必須完成訓練的那個
   * 版次」。`OJT_SESSION.edition` 與本欄相符之場次才算數（`null` 與 `null` 亦視為相符）。
   *
   * 🔴 **刻意與 `edition` 分成兩欄、不共用一欄**：改版不必然要求重新訓練（由 ICSOP 管理員於
   * 編輯時逐次裁決）。共用一欄等於強制「改版＝全部單位重訓」，而人類明文要求那是一個**問句**，
   * 不是規則。⇒ 要求重訓時本欄跟進新版次（既有場次因版次不符而失效）；不要求時本欄不動
   * （既有場次繼續算數，新登記之場次亦快照本欄而非 `edition`）。
   * 🔒 **非使用者可寫欄位**：不在 `FIELD_KEY_BY_PROP` 白名單內 ⇒ 客戶端直接送本鍵一律被
   * `classifyFields` 歸為未知欄而丟棄；唯一寫入點是 `documents.service` 之改版裁決分支。
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  ojtTrainingEdition!: string | null;

  @Column({ type: 'datetime2', nullable: true })
  announcedDate!: Date | null; // 公告日期（決定已公告/進度中衍生）

  @Column({ type: 'nvarchar', length: 2000, nullable: true })
  contentSummary!: string | null;

  @Column({ type: 'datetime2' })
  createdAt!: Date;

  @Column({ type: 'datetime2' })
  updatedAt!: Date;
}
