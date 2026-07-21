import { AppDataSource } from './data-source';
import { Role } from './entities/role.entity';
import { Account } from './entities/account.entity';

/** 固定 5 角色（F025）。 */
const ROLES: Array<{ code: string; name: string }> = [
  { code: 'SysAdmin', name: '系統管理員' },
  { code: 'ICSOPAdmin', name: 'ICSOP 管理員' },
  { code: 'Supervisor', name: '主管' },
  { code: 'DeptContact', name: '部門窗口' },
  { code: 'User', name: '一般使用者' },
];

/**
 * 種子：5 角色（參照資料）＋ 一筆測試帳號（供 auth 從 SeedAccountRepository 改接真實 DB）。
 * ⚠ 測試帳號僅供開發；正式帳號由 F004 組織同步寫入。
 * 冪等：以主鍵/唯一鍵存在與否判斷，重跑不重複。
 */
async function seed(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const roleRepo = AppDataSource.getRepository(Role);
    for (const r of ROLES) {
      const exists = await roleRepo.findOneBy({ code: r.code });
      if (!exists) await roleRepo.insert(r);
    }
    // eslint-disable-next-line no-console
    console.log(`[seed] ROLE：${ROLES.length} 筆已就緒`);

    // Dev 管理員 bootstrap：將 DEV_ADMIN_EMAIL 對應之帳號升為 ICSOPAdmin（若存在且唯一）。
    // ⚠ 不再建立 manual 測試帳號——會與 F004 同步進來的真實帳號同 email 撞成 MultipleMatch
    //   （2026-07-21 實測踩到：manual peter 與同步之 AS22455 皆為 peter@… → 登入被拒）。
    //   帳號本身由 F004 同步寫入；正式環境之角色指派由 F003 處理，不靠種子。
    const devAdmin = (process.env.DEV_ADMIN_EMAIL ?? '').trim().toLowerCase();
    if (devAdmin) {
      const accRepo = AppDataSource.getRepository(Account);
      const matches = await accRepo
        .createQueryBuilder('a')
        .where('LOWER(a.email) = :email', { email: devAdmin })
        .getMany();
      if (matches.length === 1) {
        await accRepo.update({ id: matches[0].id }, { roleCode: 'ICSOPAdmin' });
        // eslint-disable-next-line no-console
        console.log(`[seed] dev 管理員 ${matches[0].loginId} 已升為 ICSOPAdmin`);
      } else if (matches.length === 0) {
        // eslint-disable-next-line no-console
        console.log('[seed] DEV_ADMIN_EMAIL 尚無對應帳號（請先執行 F004 同步）');
      } else {
        // eslint-disable-next-line no-console
        console.log(`[seed] ⚠ DEV_ADMIN_EMAIL 命中 ${matches.length} 筆，不明確，未升級`);
      }
    } else {
      // eslint-disable-next-line no-console
      console.log('[seed] 未設 DEV_ADMIN_EMAIL，略過 dev 管理員 bootstrap');
    }
  } finally {
    await AppDataSource.destroy();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[seed] 失敗：', e instanceof Error ? e.message : e);
    process.exit(1);
  });
