import { AppDataSource } from './data-source';
import { Account } from './entities/account.entity';

/**
 * 種子③：管理員 bootstrap——將 `DEV_ADMIN_EMAIL` 對應之帳號升為 SysAdmin。
 *
 * ⚠ 必須「後於」組織同步執行：帳號本身由 F004 同步自上游寫入，同步前此表為空。
 * ⚠ 升 SysAdmin（非 ICSOPAdmin）：F003 之角色指派端點僅 SysAdmin 可呼叫，系統需要一個起點，
 *   之後由其在 UI 指派其他人角色（＝以 F003 取代種子式角色 bootstrap，OQ 定案）。
 * ⚠ 不建立 manual 測試帳號——會與同步進來的真實帳號同 email 撞成 MultipleMatch
 *   （2026-07-21 實測踩到：manual peter 與同步之 AS22455 皆為 peter@… → 登入被拒）。
 *
 * 冪等：已是 SysAdmin 則不動作；命中 0 筆或多筆一律不升級（僅告警），避免誤授權。
 * 未設 DEV_ADMIN_EMAIL 時直接跳過並回傳成功——供 compose 鏈路在未設定時不中斷。
 */
async function bootstrapAdmin(): Promise<void> {
  const target = (process.env.DEV_ADMIN_EMAIL ?? '').trim().toLowerCase();
  // eslint-disable-next-line no-console
  const log = console.log;

  if (!target) {
    log('[bootstrap-admin] 未設 DEV_ADMIN_EMAIL，略過（不視為失敗）');
    return;
  }

  await AppDataSource.initialize();
  try {
    const accRepo = AppDataSource.getRepository(Account);
    const matches = await accRepo
      .createQueryBuilder('a')
      .where('LOWER(a.email) = :email', { email: target })
      .getMany();

    if (matches.length === 0) {
      log('[bootstrap-admin] ⚠ DEV_ADMIN_EMAIL 尚無對應帳號（請確認組織同步已完成）');
      return;
    }
    if (matches.length > 1) {
      log(`[bootstrap-admin] ⚠ DEV_ADMIN_EMAIL 命中 ${matches.length} 筆，不明確，未升級`);
      return;
    }
    const acc = matches[0];
    if (acc.roleCode === 'SysAdmin') {
      log(`[bootstrap-admin] ${acc.loginId} 已是 SysAdmin，無需變更`);
      return;
    }
    await accRepo.update({ id: acc.id }, { roleCode: 'SysAdmin' });
    log(`[bootstrap-admin] ${acc.loginId} 已由 ${acc.roleCode} 升為 SysAdmin`);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

bootstrapAdmin()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[bootstrap-admin] 失敗：', e instanceof Error ? e.message : e);
    process.exit(1);
  });
