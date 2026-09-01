import {
  AuditIdentityService,
  EMPTY_AUDIT_IDENTITY,
} from './audit-identity.service';
import { OrgUnitReadStore, OrgUnitRecord } from '../org-directory/org-unit-read';

/**
 * `AUDIT_LOG` 操作者身分快照六欄之單一組裝點（2026-09-01 delta）。
 *
 * 本檔鎖定的是 F024 調閱歷程「同一個人、不同動作、欄位齊全度不同」之根因修復：
 * 六欄之落值規則自本輪起**只有一個答案**，且該答案與 F020 浮水印／帳號清單部門欄
 * 吃同一份組織路徑算法（`org-directory/org-path.ts`）。
 *
 * ⚠ 本檔刻意**不**斷言「某某呼叫端有沒有呼叫本服務」——那是各呼叫端自己的 spec 之責任。
 */

/** ORG_UNIT 讀取替身：以 `${companyCode}:${orgCode}` 為鍵，未登錄 → null（查無）。 */
function fakeOrgs(rows: Record<string, Partial<OrgUnitRecord>>): OrgUnitReadStore {
  return {
    async findByOrgCode(companyCode, orgCode) {
      const row = rows[`${companyCode}:${orgCode}`];
      return row ? ({ companyCode, orgCode, ...row } as OrgUnitRecord) : null;
    },
    async listByCompany() {
      return [];
    },
  };
}

const AS_ORG = {
  // 自身單位＝處/室層（DESC_CHI 以 '/' 分段，取末段）
  'AS:A1210': { tier: 'SECTION', name: '營運管理部/審查室', descFull: null },
  // 部層（LEFT(orgCode,2)+'000'）之 DESC_FULL
  'AS:A1000': { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
};

describe('AuditIdentityService.resolve — 六欄之落值規則', () => {
  it('齊全之 session → 六欄皆落值，公司為**全稱**（非代碼、非簡稱）', async () => {
    const svc = new AuditIdentityService(fakeOrgs(AS_ORG));

    const id = await svc.resolve({
      name: '王小明',
      employeeNo: 'A12345',
      companyCode: 'AS',
      orgCode: 'A1210',
      roleCode: 'ICSOPAdmin',
    });

    expect(id).toEqual({
      actorName: '王小明',
      employeeNo: 'A12345',
      company: '和潤企業股份有限公司',
      department: '營運管理部',
      section: '審查室',
      roleCode: 'ICSOPAdmin',
    });
  });

  it('公司欄**不得**落代碼——這正是 ALERT_RESOLVED／ROLE_ASSIGNED 兩路徑之既有缺陷形狀', async () => {
    const svc = new AuditIdentityService(fakeOrgs(AS_ORG));

    const { company } = await svc.resolve({ companyCode: 'AS', orgCode: 'A1210' });

    // 正向半句先確立載體存在（避免恆真之否定斷言）：
    expect(company).toBe('和潤企業股份有限公司');
    expect(company).not.toBe('AS');
  });

  it('部門欄**不得**落 orgCode——ROLE_ASSIGNED 既有缺陷之第二半', async () => {
    const svc = new AuditIdentityService(fakeOrgs(AS_ORG));

    const { department } = await svc.resolve({ companyCode: 'AS', orgCode: 'A1210' });

    expect(department).toBe('營運管理部');
    expect(department).not.toBe('A1210');
  });

  it('未知公司代碼 → 公司為 null（不回退為代碼本身）', async () => {
    const svc = new AuditIdentityService(fakeOrgs({}));

    expect(await svc.resolve({ companyCode: 'ZZ' })).toMatchObject({ company: null });
  });

  it('帳號未掛組織（orgCode 為 null）→ 部門／處室為 null，其餘四欄照常落值', async () => {
    const svc = new AuditIdentityService(fakeOrgs(AS_ORG));

    const id = await svc.resolve({
      name: '王小明',
      employeeNo: 'A12345',
      companyCode: 'AS',
      orgCode: null,
      roleCode: 'SysAdmin',
    });

    expect(id).toEqual({
      actorName: '王小明',
      employeeNo: 'A12345',
      company: '和潤企業股份有限公司',
      department: null,
      section: null,
      roleCode: 'SysAdmin',
    });
  });

  it('使用者本身即部層（tier=DEPARTMENT）→ 處/室留空（契約 §8.3，非缺陷）', async () => {
    const svc = new AuditIdentityService(
      fakeOrgs({ 'AS:A1000': { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' } }),
    );

    const id = await svc.resolve({ companyCode: 'AS', orgCode: 'A1000' });

    expect(id.department).toBe('營運管理部');
    expect(id.section).toBeNull();
  });

  it('部層查無 DESC_FULL → 依 fallback 鏈上溯本部層', async () => {
    const svc = new AuditIdentityService(
      fakeOrgs({
        'AS:A1210': { tier: 'SECTION', name: '審查室', descFull: null },
        'AS:A1000': { tier: 'DEPARTMENT', name: '營運管理部', descFull: '   ' },
        'AS:A0000': { tier: 'DIVISION', name: '營運本部', descFull: '營運本部' },
      }),
    );

    expect(await svc.resolve({ companyCode: 'AS', orgCode: 'A1210' })).toMatchObject({
      department: '營運本部',
      section: '審查室',
    });
  });

  it('無 session（未登入／系統自動路徑）→ 六欄皆 null，且不觸發任何組織查詢', async () => {
    let calls = 0;
    const orgs: OrgUnitReadStore = {
      async findByOrgCode() {
        calls += 1;
        return null;
      },
      async listByCompany() {
        return [];
      },
    };
    const svc = new AuditIdentityService(orgs);

    expect(await svc.resolve(undefined)).toEqual(EMPTY_AUDIT_IDENTITY);
    expect(calls).toBe(0);
  });

  it('六欄一律為 null 而非 undefined——「沒有值」與「被丟掉」須在資料層可分辨', async () => {
    const svc = new AuditIdentityService(fakeOrgs({}));

    const id = await svc.resolve({ companyCode: null, orgCode: null });

    for (const key of Object.keys(EMPTY_AUDIT_IDENTITY)) {
      expect(id).toHaveProperty(key, null);
    }
  });
});
