import { OjtAuditWriterRecorder } from './audit-writer-recorder.adapter';
import { AuditAccessEvent } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';
import { AuditIdentityService } from '../audit/audit-identity.service';

/**
 * F042 場次稽核轉接器之身分快照（2026-09-01 delta）。
 *
 * 本檔存在的理由：該轉接器的檔頭自陳「身分快照六欄逐一顯式轉送」，實際只轉送了姓名與員編，
 * 公司／部門／處室／角色四欄從未落值（dev 實測 `OJT_SESSION_UPLOAD` 之 2 列四欄全空）。
 * 註解寫了不等於程式做了——本檔把該承諾變成可執行的約束。
 */

class FakeAuditWriter {
  calls: AuditAccessEvent[] = [];
  recordAccess(event: AuditAccessEvent): Promise<void> {
    this.calls.push(event);
    return Promise.resolve();
  }
}

function identityService(): AuditIdentityService {
  return new AuditIdentityService({
    async findByOrgCode(companyCode, orgCode) {
      const rows: Record<string, { tier: string; name: string; descFull: string | null }> = {
        'AS:A1210': { tier: 'SECTION', name: '營運管理部/審查室', descFull: null },
        'AS:A1000': { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
        // 場次所屬**使用單位**——若實作誤用 `event.orgCode` 解析操作者身分，
        // 部門欄會落成「稽核部」，本檔即以此值揪出該混淆。
        'AS:A2100': { tier: 'SECTION', name: '稽核部/稽核室', descFull: null },
        'AS:A2000': { tier: 'DEPARTMENT', name: '稽核部', descFull: '稽核部' },
      };
      const row = rows[`${companyCode}:${orgCode}`];
      return row ? ({ companyCode, orgCode, ...row } as never) : null;
    },
    async listByCompany() {
      return [];
    },
  });
}

const BASE = {
  actionType: 'OJT_SESSION_UPLOAD' as const,
  documentId: 'doc-1',
  documentNumber: 'ICSOP-A-001',
  /** 場次所屬使用單位（**非**操作者所屬單位）。 */
  orgCode: 'A2100',
  accountId: 'acct-1',
  sessionId: 'sess-1',
  watermarkSnapshot: null,
};

describe('OjtAuditWriterRecorder — 身分快照六欄', () => {
  let writer: FakeAuditWriter;
  let recorder: OjtAuditWriterRecorder;
  beforeEach(() => {
    writer = new FakeAuditWriter();
    recorder = new OjtAuditWriterRecorder(
      writer as unknown as AuditWriterService,
      identityService(),
    );
  });

  it('🔴 六欄齊全：公司為全稱、部門為部層全名、處室為 DESC_CHI 末段', async () => {
    await recorder.record({
      ...BASE,
      name: '王小明',
      employeeNo: 'E001',
      actorCompanyCode: 'AS',
      actorOrgCode: 'A1210',
      actorRoleCode: 'Supervisor',
    });

    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0]).toMatchObject({
      actorName: '王小明',
      employeeNo: 'E001',
      company: '和潤企業股份有限公司',
      department: '營運管理部',
      section: '審查室',
      roleCode: 'Supervisor',
    });
  });

  it('🔴 部門欄取**操作者**所屬單位，不得誤取場次之使用單位', async () => {
    await recorder.record({
      ...BASE,
      orgCode: 'A2100', // 使用單位＝稽核室
      actorOrgCode: 'A1210', // 操作者＝審查室
      actorCompanyCode: 'AS',
    });

    const ev = writer.calls[0];
    // 正向半句先確立載體存在：
    expect(ev.department).toBe('營運管理部');
    expect(ev.department).not.toBe('稽核部');
    expect(ev.section).toBe('審查室');
    expect(ev.section).not.toBe('稽核室');
  });

  it('場次之使用單位仍原樣落 orgCode 欄（身分快照之修正不得動到既有維度）', async () => {
    await recorder.record({ ...BASE, actorCompanyCode: 'AS', actorOrgCode: 'A1210' });

    expect(writer.calls[0]).toMatchObject({ orgCode: 'A2100', documentId: 'doc-1' });
  });

  it('操作者未掛組織（無 actorOrgCode）→ 部門／處室為 null，公司與角色照常落值', async () => {
    await recorder.record({
      ...BASE,
      name: '李慧玲',
      employeeNo: 'E002',
      actorCompanyCode: 'AS',
      actorOrgCode: null,
      actorRoleCode: 'ICSOPAdmin',
    });

    expect(writer.calls[0]).toMatchObject({
      actorName: '李慧玲',
      employeeNo: 'E002',
      company: '和潤企業股份有限公司',
      department: null,
      section: null,
      roleCode: 'ICSOPAdmin',
    });
  });

  it('刪除事件走同一條組裝路徑（六欄同樣齊全）', async () => {
    await recorder.record({
      ...BASE,
      actionType: 'OJT_SESSION_DELETE',
      name: '王小明',
      actorCompanyCode: 'AS',
      actorOrgCode: 'A1210',
    });

    expect(writer.calls[0]).toMatchObject({
      actionType: 'OJT_SESSION_DELETE',
      company: '和潤企業股份有限公司',
      department: '營運管理部',
    });
  });
});
