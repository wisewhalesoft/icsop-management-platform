import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 一次性資料修補：清除**孤兒掛載**——`ICSOP_DOCUMENT.nodeId` 指向已不存在之 `LIFECYCLE_NODE`。
 *
 * 成因：`nodeId` 對 `LIFECYCLE_NODE` **無 FK**（見 1721865600000-icsop-document），而刪除節點
 * （`TypeOrmDagStore.deleteNodeWithEdges`）過去只刪節點與邊、不解除文件掛載，於是留下懸空 GUID。
 *
 * 症狀：該文件自 DAG 畫布與樹狀圖完全消失（掛在不存在的節點上），卻仍被判為「已掛載」——
 * 於其他節點抽屜點選它會跳出改派警示（節點名空白／「其他」），非確認改派不得儲存。
 *
 * 修補後之防線（本 migration 僅處理既有髒資料）：
 *  1. `TypeOrmDagStore.deleteNodeWithEdges` 於同一交易內先行解除掛載（不可繞過之不變式）；
 *  2. `NodeDocsService.getDrawer`／`mount` 將查無節點之 `nodeId` 正規化為「未掛載」（防禦性）。
 *
 * ⚠ **刻意不更新 `updatedAt`**：這是修正歷史殘值，不是使用者此刻對文件所做的異動；
 * 若一併蓋成 migration 執行時間，這些文件會憑空躍上「最近更新」清單頂端，反而失真。
 *
 * 🔴 **本 migration 必須對真庫實跑**（單元測試證明不了資料列已修）。
 */
export class OrphanNodeDocMount1724716800000 implements MigrationInterface {
  name = 'OrphanNodeDocMount1724716800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE d SET [nodeId] = NULL
      FROM [ICSOP_DOCUMENT] d
      WHERE d.[nodeId] IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM [LIFECYCLE_NODE] n WHERE n.[id] = d.[nodeId])`);
  }

  /**
   * 不可逆：被清掉的 `nodeId` 所指之節點列早已不存在，無從回填（回填亦只會復原缺陷本身）。
   * 刻意留空而非拋錯——本 migration 之後的 down 若因此中斷整串回滾，代價高於保留現狀。
   */
  public async down(): Promise<void> {
    /* no-op（見上方說明） */
  }
}
