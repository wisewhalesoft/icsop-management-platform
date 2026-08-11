import { AppDataSource } from './data-source';
import { Role } from './entities/role.entity';

/**
 * 種子①：固定 5 角色（F025 參照資料）。
 *
 * ⚠ 必須先於組織同步執行——`FK_ACCOUNT_role`（ACCOUNT.roleCode → ROLE.code）要求角色先存在，
 *   否則同步寫入帳號時撞 FK。原 seed.ts 已拆為本檔（角色）與 seed-bootstrap-admin.ts（升管理員），
 *   因為後者反過來必須「後於」同步（需帳號已存在）。
 *
 * 冪等：以 code 存在與否判斷，重跑不重複。
 */
const ROLES: Array<{ code: string; name: string }> = [
  { code: 'SysAdmin', name: '系統管理員' },
  { code: 'ICSOPAdmin', name: 'ICSOP 管理員' },
  { code: 'Supervisor', name: '主管' },
  { code: 'DeptContact', name: '部門窗口' },
  { code: 'User', name: '一般使用者' },
];

async function seedRoles(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const roleRepo = AppDataSource.getRepository(Role);
    let created = 0;
    for (const r of ROLES) {
      const exists = await roleRepo.findOneBy({ code: r.code });
      if (!exists) {
        await roleRepo.insert(r);
        created += 1;
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[seed-roles] ROLE：${ROLES.length} 筆已就緒（本次新增 ${created}）`);
  } finally {
    await AppDataSource.destroy();
  }
}

seedRoles()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[seed-roles] 失敗：', e instanceof Error ? e.message : e);
    process.exit(1);
  });
