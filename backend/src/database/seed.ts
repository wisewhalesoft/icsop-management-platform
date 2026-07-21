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

    const accRepo = AppDataSource.getRepository(Account);
    const testLogin = { companyCode: 'AS', loginId: 'peter' };
    const existing = await accRepo.findOneBy(testLogin);
    if (!existing) {
      await accRepo.insert({
        ...testLogin,
        email: 'peter@hfcfinance.com.tw',
        name: '測試帳號',
        roleCode: 'ICSOPAdmin',
        status: 'active',
        source: 'manual',
      });
      // eslint-disable-next-line no-console
      console.log('[seed] 測試帳號 AS/peter 已建立');
    } else {
      // eslint-disable-next-line no-console
      console.log('[seed] 測試帳號 AS/peter 已存在，略過');
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
