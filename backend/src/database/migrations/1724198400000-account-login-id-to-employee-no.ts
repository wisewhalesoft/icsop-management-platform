import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 上游人員主來源更換之**穩定鍵遷移**（契約 v2.0 §7.2）。
 *
 * 舊：`ACCOUNT.loginId` ← `VW_HPMUSER.USERID`
 * 新：`ACCOUNT.loginId` ← `VW_PERSONNEL_SQL.NO`
 *
 * 🔑 **為何是 `employeeNo`**：新來源之 `NO` 即舊來源之 `EMPNO`，而 `EMPNO` 已存於
 *    `ACCOUNT.employeeNo`，故遷移不需連上游——直接以本地既有欄位改寫即可。
 *
 * 🔴 **為何非做不可（不能讓同步自然收斂）**：換來源後每筆上游帳號的鍵都會變，同步會判定
 *    「舊帳號全數消失、新帳號全數新增」，直接觸發 §7.3 之 5% 消失閾值而中止，
 *    且中止時不套用任何異動 —— 系統會卡在舊資料上，且錯誤訊息看起來像是上游出事。
 *
 * ⚠ **僅改寫「明確無歧義」者**（三個守衛，任一不成立即整筆略過，不改）：
 *   1. `source='upstream'` —— 手動帳號之 `loginId` 為使用者自訂，絕不觸碰；
 *   2. 同公司內該 `employeeNo` 於 upstream 帳號中唯一 —— 舊來源為帳號層，存在一人多帳號；
 *   3. 目標 `loginId` 未被同公司任何帳號（含手動帳號）占用 —— 否則違反
 *      `UQ_ACCOUNT_company_login`，整支 migration 失敗。
 *   被略過者維持舊 `loginId`：它們在新來源中本就不存在（多為 §3.7 之污染列），
 *   下次同步會列為「消失」但**不會被停用**（消失不等於離職，§7.3）。
 *
 * ⚠ `ORG_CHANGE_ALERT.accountLoginId` 一併改寫：該欄為 F005/F006 之 pending 去重鍵
 *   （`org-change-alert.service.ts` 之 `existingPendingInconLoginIds`）。不改寫會使既有
 *   pending 告警擋不住新 loginId 的同一筆告警，於切換後湧現整批重複告警。
 *
 * 🔒 **可逆**：舊值保存於新增之 `legacyLoginId`，`down()` 據以還原。該欄同時是切換後的
 *   稽核軌跡（可回答「這個帳號切換前叫什麼」），刻意不於日後清除。
 */
export class AccountLoginIdToEmployeeNo1724198400000 implements MigrationInterface {
  name = 'AccountLoginIdToEmployeeNo1724198400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ACCOUNT] ADD [legacyLoginId] varchar(20) NULL`);

    // 保存舊值（僅上游帳號；手動帳號不參與遷移，其 legacyLoginId 恆為 NULL）。
    await q.query(`
      UPDATE [ACCOUNT]
      SET [legacyLoginId] = [loginId]
      WHERE [source] = 'upstream'
    `);

    // 先改告警之對應鍵，再改帳號本身——順序無關正確性（兩者皆以 legacyLoginId 為來源比對），
    // 但先做告警可在帳號改寫失敗回滾時保持一致。
    await q.query(`
      UPDATE alert
      SET alert.[accountLoginId] = a.[employeeNo]
      FROM [ORG_CHANGE_ALERT] alert
      INNER JOIN [ACCOUNT] a
        ON a.[legacyLoginId] = alert.[accountLoginId]
       AND a.[source] = 'upstream'
      WHERE a.[employeeNo] IS NOT NULL
        AND a.[employeeNo] <> a.[loginId]
        AND NOT EXISTS (
          SELECT 1 FROM [ACCOUNT] b
          WHERE b.[source] = 'upstream'
            AND b.[companyCode] = a.[companyCode]
            AND b.[employeeNo] = a.[employeeNo]
            AND b.[id] <> a.[id]
        )
        AND NOT EXISTS (
          SELECT 1 FROM [ACCOUNT] c
          WHERE c.[companyCode] = a.[companyCode]
            AND c.[loginId] = a.[employeeNo]
            AND c.[id] <> a.[id]
        )
    `);

    await q.query(`
      UPDATE a
      SET a.[loginId] = a.[employeeNo]
      FROM [ACCOUNT] a
      WHERE a.[source] = 'upstream'
        AND a.[employeeNo] IS NOT NULL
        AND a.[employeeNo] <> a.[loginId]
        AND NOT EXISTS (
          SELECT 1 FROM [ACCOUNT] b
          WHERE b.[source] = 'upstream'
            AND b.[companyCode] = a.[companyCode]
            AND b.[employeeNo] = a.[employeeNo]
            AND b.[id] <> a.[id]
        )
        AND NOT EXISTS (
          SELECT 1 FROM [ACCOUNT] c
          WHERE c.[companyCode] = a.[companyCode]
            AND c.[loginId] = a.[employeeNo]
            AND c.[id] <> a.[id]
        )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    // 還原順序與 up 相反：先帳號、後告警（告警之比對需要帳號尚未還原之新值）。
    await q.query(`
      UPDATE alert
      SET alert.[accountLoginId] = a.[legacyLoginId]
      FROM [ORG_CHANGE_ALERT] alert
      INNER JOIN [ACCOUNT] a ON a.[loginId] = alert.[accountLoginId]
      WHERE a.[legacyLoginId] IS NOT NULL
        AND a.[legacyLoginId] <> a.[loginId]
    `);
    await q.query(`
      UPDATE [ACCOUNT]
      SET [loginId] = [legacyLoginId]
      WHERE [legacyLoginId] IS NOT NULL
    `);
    await q.query(`ALTER TABLE [ACCOUNT] DROP COLUMN [legacyLoginId]`);
  }
}
