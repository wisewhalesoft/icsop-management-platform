import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F041 UX16 delta `AC-UX9`（`OQ-UX16-05`＝選項 B；架構落點 `ARCH-UX9`／architecture-spec §16.9）——
 * **停用「業務」自動判定**後，把自動判定留下的 `userSubtype = 'business'` 一次性回填為 `'other'`。
 *
 * ## 為何是一支獨立 migration，而不是放寬同步門檻跑一次同步
 * `roleChangeRatioExceeded()` 收的是**整份計畫之 `writeCount`**（`role-derivation.ts`＝
 * `roleUpgrades.length + subtypeChanges.length`），它**分不出**哪些變更是本次回填、哪些是同一次
 * 同步裡的其他變更 ⇒ 放寬閾值等於**連同該次同步的角色升級與其他子分類變更一起放行**。
 * `OQ-RA-01`（2026-08-25 首次全量套用）用過該手法，當時全站只有那一個變更來源；**本次不是**。
 * 🔴 故 `DEFAULT_ROLE_CHANGE_THRESHOLD`（5%）與 `ROLE_CHANGE_MIN_ABSOLUTE`（10）一格未動，
 *   亦**不得**為本次回填新增任何「跳過門檻」之旗標／環境變數／參數（[F004](../../../../docs/specs/features/F004-org-sync.md) `AC-UX12` ②）。
 *
 * ## 為何放在 `migrations/` 而不是獨立 script
 * migration runner 之 `migrations` 表天然保證「各站執行一次且僅一次」；獨立 script 得另造一套
 * 「這站跑過了沒」的追蹤機制。本目錄對**純資料回填**已有明文先例
 * （`1725580800000-document-catalog-company-fix.ts` 檔頭第 27 行，及 `1724371200000` 等多支）。
 *
 * ## 選取述詞（🔴 兩個條件缺一不可）
 *  - `roleSource = 'derived'`：以帳號管理**手動指派**為 `business` 者（`roleSource` 非 `derived`）
 *    **不在回填範圍**——手動指派是人做的決定，自動判定的停用不構成推翻它的理由。
 *  - `userSubtype = 'business'`：已是 `'other'` 者不必動（亦使本支**冪等**——第二次執行恆 0 列）。
 *
 * ## 🔒 只停來源、不動語意（`AC-UX11`）
 * `ACCOUNT.userSubtype` 欄位與 `'business'` 列舉值**一律保留**（手動指派仍要有值可選），
 * F019 之部門限縮管線一行未改。本支只改「目前有多少人落在 `business` 這一桶」。
 *
 * ## ⚠ 不可逆（已裁決 A，後果已知並接受）
 * `down()` 為 no-op：回填前「哪些列是自動判定寫的」這個資訊本身沒有留存，還原等於臆造。
 * 比照既有純資料修補 migration 對不可逆變更之慣例。
 *
 * ## 🔴 驗收（`AC-UX10`；單元測試證明不了這一段）
 * ① 對 dev 真庫實跑 COMMIT；
 * ② `SELECT COUNT(*) FROM ACCOUNT WHERE roleSource='derived' AND userSubtype='business'` 須為 `0`。
 * 不跑本支而直接讓下一次例行同步跑 `deriveRoles()`：正式環境約 **699 筆** `business→other` 會湧進
 * 同一份計畫，`writeCount` 遠超 `1,368 × 5% = 68` 亦遠超絕對下限 10 ⇒ **整批被擋、一筆不寫**
 * （門檻運作正確，被擋不是缺陷；缺陷是「以為改完判定式、同步照跑即可」）。
 *
 * ⚠ **刻意不寫 `AUDIT_LOG`／任何變更歷程**：這是資料修補、不是使用者編輯（比照
 *   `1725580800000` 之處置），且 F041 本身無變更歷程機制可掛。
 * ⚠ **刻意不掛進 `SYNC_RUN` 之任何統計或告警**（`AC-UX12` ④）：它不是同步的一部分。
 */
export class AccountUserSubtypeDerivedBackfill1725753600000
  implements MigrationInterface
{
  name = 'AccountUserSubtypeDerivedBackfill1725753600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE [ACCOUNT]
         SET [userSubtype] = 'other'
       WHERE [roleSource] = 'derived'
         AND [userSubtype] = 'business'
    `);
  }

  /**
   * 🔴 no-op：本 migration 不可逆。**尤其不得**寫成
   * `UPDATE ACCOUNT SET userSubtype='business' WHERE roleSource='derived'`——那會把
   * **從來就不是**業務的人（回填前本就是 `'other'` 的絕大多數帳號）一併標成業務，
   * 造成比原缺口更大的錯誤。
   */
  public async down(): Promise<void> {
    /* 不可逆，刻意不做任何事。 */
  }
}
