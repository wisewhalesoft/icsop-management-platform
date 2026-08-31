import {
  classifyOrgUnit,
  classifyAccount,
  classifyJobTitle,
  classifyJobPosition,
  ExistingOrgUnit,
  ExistingAccount,
  ExistingJobTitle,
  ExistingJobPosition,
} from './change-classification';
import { NormalizedOrgUnit, NormalizedAccount } from './normalization';

/**
 * 異動分類（新增 / 更新 / 離職停用 / 無異動）——冪等核心。
 * upstream-hr-source-contract.md §6（EMPSTS 權威）／US-010 AC2（無異動不寫）／AC4（三類異動）。
 * ⚠ 離職停用一律以 EMPSTS≠'A' 觸發，不得以「來源消失」逕行判定（US-010 AC4）。
 */

const srcOrg = (over: Partial<NormalizedOrgUnit> = {}): NormalizedOrgUnit => ({
  companyCode: 'AS',
  orgCode: 'JAC00',
  codePrefix: 'JAC',
  tier: 'SECTION',
  parentCode: 'JA000',
  name: '審查室',
  descFull: '營運管理部審查室',
  managerEmpNo: 'E1',
  isActive: true,
  ...over,
});

const localOrg = (over: Partial<ExistingOrgUnit> = {}): ExistingOrgUnit => ({
  orgCode: 'JAC00',
  codePrefix: 'JAC',
  tier: 'SECTION',
  parentCode: 'JA000',
  name: '審查室',
  descFull: '營運管理部審查室',
  managerEmpNo: 'E1',
  isActive: true,
  ...over,
});

const srcAcc = (over: Partial<NormalizedAccount> = {}): NormalizedAccount => ({
  companyCode: 'AS',
  loginId: 'peter',
  employeeNo: 'E0001',
  name: '王小明',
  email: 'peter@hfcfinance.com.tw',
  orgCode: 'JAC00',
  empActive: true,
  resignDate: new Date('9999-12-31T00:00:00Z'),
  hireDate: new Date('2015-03-01T00:00:00Z'),
  managerEmpNo: 'E9999',
  jobTitleCode: null,
  jobPositionCode: null,
  upstreamModifiedAt: new Date('2026-07-09T00:00:00Z'),
  ...over,
});

const localAcc = (over: Partial<ExistingAccount> = {}): ExistingAccount => ({
  companyCode: 'AS',
  loginId: 'peter',
  employeeNo: 'E0001',
  name: '王小明',
  email: 'peter@hfcfinance.com.tw',
  orgCode: 'JAC00',
  status: 'active',
  resignDate: new Date('9999-12-31T00:00:00Z'),
  hireDate: new Date('2015-03-01T00:00:00Z'),
  managerEmpNo: 'E9999',
  ...over,
});

describe('classifyOrgUnit', () => {
  it('本地不存在 → create', () => {
    expect(classifyOrgUnit(srcOrg(), null)).toBe('create');
  });
  it('完全相同 → noop（不寫入）', () => {
    expect(classifyOrgUnit(srcOrg(), localOrg())).toBe('noop');
  });
  it('名稱變動 → update', () => {
    expect(classifyOrgUnit(srcOrg({ name: '審查一室' }), localOrg())).toBe('update');
  });
  it('主管員編變動 → update', () => {
    expect(classifyOrgUnit(srcOrg({ managerEmpNo: 'E2' }), localOrg())).toBe(
      'update',
    );
  });
  it('部門關閉（isActive 變 false）→ update', () => {
    expect(classifyOrgUnit(srcOrg({ isActive: false }), localOrg())).toBe(
      'update',
    );
  });
});

describe('classifyAccount', () => {
  it('新人員（本地不存在、在職）→ create', () => {
    expect(classifyAccount(srcAcc(), null)).toBe('create');
  });

  it('無異動（在職、欄位相同）→ noop', () => {
    expect(classifyAccount(srcAcc(), localAcc())).toBe('noop');
  });

  it('部門/姓名/員編/email 任一異動（在職）→ update', () => {
    expect(classifyAccount(srcAcc({ orgCode: 'JAD00' }), localAcc())).toBe('update');
    expect(classifyAccount(srcAcc({ name: '王大明' }), localAcc())).toBe('update');
    expect(classifyAccount(srcAcc({ employeeNo: 'E9' }), localAcc())).toBe('update');
    expect(classifyAccount(srcAcc({ email: 'new@hfcfinance.com.tw' }), localAcc())).toBe(
      'update',
    );
  });

  it('EMPSTS≠A 且本地在職 → disable（離職停用）', () => {
    expect(classifyAccount(srcAcc({ empActive: false }), localAcc())).toBe('disable');
  });

  it('EMPSTS≠A 且本地已停用 → noop（不重複停用）', () => {
    expect(
      classifyAccount(srcAcc({ empActive: false }), localAcc({ status: 'disabled' })),
    ).toBe('noop');
  });

  it('EMPSTS≠A 且本地不存在 → noop（不建立離職帳號）', () => {
    expect(classifyAccount(srcAcc({ empActive: false }), null)).toBe('noop');
  });

  it('本地停用、上游回復在職 → update（誤判恢復）', () => {
    expect(classifyAccount(srcAcc(), localAcc({ status: 'disabled' }))).toBe('update');
  });

  it('upstreamModifiedAt 差異不觸發 update（僅水位，非業務欄）', () => {
    const s = srcAcc({ upstreamModifiedAt: new Date('2030-01-01T00:00:00Z') });
    expect(classifyAccount(s, localAcc())).toBe('noop');
  });

  it('TS-ORGALERT-016 EMPSTS=A 但 RESIGNDT 過去日（資料不一致）→ 絕不停用（F005 AC）', () => {
    // EMPSTS='A' 權威優於 RESIGNDT：過去離職日只是資料矛盾（另由 DATA_INCONSISTENCY 告警），
    // classifyAccount 對 empActive=true 之帳號結構上不可能回傳 disable。
    const past = new Date('2024-12-31T00:00:00Z');
    expect(classifyAccount(srcAcc({ empActive: true, resignDate: past }), localAcc())).not.toBe(
      'disable',
    );
    expect(
      classifyAccount(srcAcc({ empActive: true, resignDate: past }), localAcc({ resignDate: past })),
    ).toBe('noop');
  });
});


/** 職稱＝資位（G-ADM-001 第 5 欄）。代碼比對納入 classifyAccount；對照主檔以 classifyJobTitle 分類。 */
describe('classifyAccount — jobTitleCode 納入比對', () => {
  it('僅職稱代碼變動 → update（資位異動必須反映）', () => {
    const kind = classifyAccount(
      srcAcc({ jobTitleCode: 'F01' }),
      localAcc({ jobTitleCode: 'J01' }),
    );
    expect(kind).toBe('update');
  });

  it('加欄後既有列為 null、上游有值 → update（使既有帳號自動回填，非誤判 noop）', () => {
    expect(classifyAccount(srcAcc({ jobTitleCode: 'J01' }), localAcc({ jobTitleCode: null }))).toBe(
      'update',
    );
  });

  it('兩端同值 → noop（不造成無謂寫入放大）', () => {
    expect(classifyAccount(srcAcc({ jobTitleCode: 'J01' }), localAcc({ jobTitleCode: 'J01' }))).toBe(
      'noop',
    );
  });

  it('本地替身省略此欄（undefined）且上游為 null → noop（undefined 與 null 視為相等）', () => {
    const local = localAcc();
    delete (local as { jobTitleCode?: string | null }).jobTitleCode;
    expect(classifyAccount(srcAcc({ jobTitleCode: null }), local)).toBe('noop');
  });
});

/**
 * 職位（G-ADM-001 第 6 欄，2026-08-31 加欄）。
 * 🔴 本組之存在理由：漏列此欄於比對 ⇒ 全部既有列判 noop ⇒ **連 SYNC_FULL_RESYNC=1 之全量重同步
 *    都回填不了**（值寫不進 DB，畫面永遠「—」）。與 jobTitleCode／descFull 是同一顆雷。
 */
describe('classifyAccount — jobPositionCode 納入比對', () => {
  it('僅職位代碼變動 → update（職位異動必須反映）', () => {
    expect(
      classifyAccount(
        srcAcc({ jobPositionCode: 'C04' }),
        localAcc({ jobPositionCode: 'N03' }),
      ),
    ).toBe('update');
  });

  it('加欄後既有列為 null、上游有值 → update（使既有帳號可經全量重同步回填）', () => {
    expect(
      classifyAccount(
        srcAcc({ jobPositionCode: 'N03' }),
        localAcc({ jobPositionCode: null }),
      ),
    ).toBe('update');
  });

  it('兩端同值 → noop（不造成無謂寫入放大）', () => {
    expect(
      classifyAccount(
        srcAcc({ jobPositionCode: 'N03' }),
        localAcc({ jobPositionCode: 'N03' }),
      ),
    ).toBe('noop');
  });

  it('本地替身省略此欄（undefined）且上游為 null → noop', () => {
    const local = localAcc();
    delete (local as { jobPositionCode?: string | null }).jobPositionCode;
    expect(classifyAccount(srcAcc({ jobPositionCode: null }), local)).toBe('noop');
  });

  it('僅職位變、資位不變 → 仍為 update（兩維度互不遮蔽）', () => {
    expect(
      classifyAccount(
        srcAcc({ jobTitleCode: 'I01', jobPositionCode: 'C04' }),
        localAcc({ jobTitleCode: 'I01', jobPositionCode: 'N03' }),
      ),
    ).toBe('update');
  });
});

describe('classifyJobPosition（對照主檔）', () => {
  const local = (over: Partial<ExistingJobPosition> = {}): ExistingJobPosition => ({
    companyCode: 'AS',
    code: 'N03',
    name: '營業一般職',
    ...over,
  });
  const src = { companyCode: 'AS', code: 'N03', name: '營業一般職' };

  it('本地無此列 → create', () => {
    expect(classifyJobPosition(src, null)).toBe('create');
  });

  it('名稱不同 → update', () => {
    expect(classifyJobPosition(src, local({ name: '營業職' }))).toBe('update');
  });

  it('完全相同 → noop', () => {
    expect(classifyJobPosition(src, local())).toBe('noop');
  });
});

describe('classifyJobTitle（對照主檔）', () => {
  const local = (over: Partial<ExistingJobTitle> = {}): ExistingJobTitle => ({
    companyCode: 'AS',
    code: 'J01',
    name: '業務專員',
    ...over,
  });
  const src = { companyCode: 'AS', code: 'J01', name: '業務專員' };

  it('本地無 → create', () => {
    expect(classifyJobTitle(src, null)).toBe('create');
  });

  it('名稱相同 → noop', () => {
    expect(classifyJobTitle(src, local())).toBe('noop');
  });

  it('上游改名 → update', () => {
    expect(classifyJobTitle({ ...src, name: '資深業務專員' }, local())).toBe('update');
  });
});
