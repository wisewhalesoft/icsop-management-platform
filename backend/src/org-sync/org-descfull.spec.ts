import { getMetadataArgsStorage } from 'typeorm';
import { normalizeDept, RawDept, NormalizedOrgUnit } from './normalization';
import {
  classifyOrgUnit,
  ExistingOrgUnit,
} from './change-classification';
import { TypeOrmOrgSyncStore } from './typeorm-org-sync.store';
import { OrgUnit } from '../database/entities/org-unit.entity';
import { SyncPlan } from './org-sync.types';
import { DataSource } from 'typeorm';

/**
 * DESC_FULL（部門全名，供 F020 浮水印「部門」欄）保留之四層變更：
 * 正規化（normalizeDept）／異動分類（classifyOrgUnit）／儲存（applySync/entity）／既有列回填。
 * 對應 ORG-descfull-normalization-test.md。
 *
 * ⚠ classifyOrgUnit 之比對清單原未含 descFull（迴歸缺口 OQ-DESCFULL-1）：若不修，既有列
 *   （descFull=null）之回填永遠不會被觸發（誤判 noop）。TS-DESCFULL-004 專測此修正。
 */

const now = new Date('2026-07-21T00:00:00Z');

const rawDept = (over: Partial<RawDept> = {}): RawDept => ({
  CODE: 'JAC00',
  COMPID: 'AS',
  DESC_CHI: '審查室',
  DESC_FULL: '營運管理部審查室',
  JOB_CODE: 'E12345',
  CLOSE_DATE: '9999-12-31',
  ESTABLISHED_DATE: '2010-01-01',
  ...over,
});

const localOrg = (over: Partial<ExistingOrgUnit> = {}): ExistingOrgUnit => ({
  orgCode: 'JAC00',
  codePrefix: 'JAC',
  tier: 'SECTION',
  parentCode: 'JA000',
  name: '審查室',
  descFull: '營運管理部審查室',
  managerEmpNo: 'E12345',
  isActive: true,
  ...over,
});

describe('normalizeDept — descFull 保留', () => {
  it('TS-DESCFULL-001 DESC_FULL 有值 → descFull 保留', () => {
    const d = normalizeDept(rawDept({ DESC_FULL: '營運管理部' }), now);
    expect(d.descFull).toBe('營運管理部');
  });

  it('TS-DESCFULL-002 DESC_FULL 為 null/空字串 → descFull=null', () => {
    expect(normalizeDept(rawDept({ DESC_FULL: null }), now).descFull).toBeNull();
    expect(normalizeDept(rawDept({ DESC_FULL: '' }), now).descFull).toBeNull();
  });

  it('TS-DESCFULL-003 DESC_FULL 前後空白 → trim 後儲存', () => {
    const d = normalizeDept(rawDept({ DESC_FULL: '  營運管理部  ' }), now);
    expect(d.descFull).toBe('營運管理部');
  });

  it('TS-DESCFULL-010 僅保存上游原始值（不做 fallback 組裝，屬 F020 責任）', () => {
    // DIVISION/ROOT 層若上游 DESC_FULL 為 null，本層即忠實保存 null，不向本部層 fallback。
    const d = normalizeDept(rawDept({ CODE: 'A0000', DESC_FULL: null }), now);
    expect(d.descFull).toBeNull();
  });
});

describe('classifyOrgUnit — descFull 納入比對（迴歸缺口修正）', () => {
  const src = (over: Partial<NormalizedOrgUnit> = {}): NormalizedOrgUnit => ({
    companyCode: 'AS',
    orgCode: 'JAC00',
    codePrefix: 'JAC',
    tier: 'SECTION',
    parentCode: 'JA000',
    name: '審查室',
    descFull: '營運管理部審查室',
    managerEmpNo: 'E12345',
    isActive: true,
    ...over,
  });

  it('TS-DESCFULL-004 僅 descFull 變更 → update（修正前會誤判 noop）', () => {
    expect(
      classifyOrgUnit(src({ descFull: '營運管理部/審查室(新全名)' }), localOrg()),
    ).toBe('update');
  });

  it('TS-DESCFULL-004b 既有列 descFull=null、來源有值 → update（回填觸發）', () => {
    expect(classifyOrgUnit(src(), localOrg({ descFull: null }))).toBe('update');
  });

  it('TS-DESCFULL-005 descFull 與 name 同時變更 → update（不受影響）', () => {
    expect(
      classifyOrgUnit(src({ name: '審查一室', descFull: '新全名' }), localOrg()),
    ).toBe('update');
  });

  it('descFull 相同、其餘相同 → noop（回歸：不誤觸 update）', () => {
    expect(classifyOrgUnit(src(), localOrg())).toBe('noop');
  });
});

describe('TypeOrmOrgSyncStore — applySync / findOrgUnits 攜帶 descFull', () => {
  it('TS-DESCFULL-007 orgCreates/orgUpdates insert/update 物件皆含 descFull', async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const fakeManager = {
      insert: (_e: unknown, rows: Array<Record<string, unknown>>) => {
        inserts.push(...rows);
        return Promise.resolve();
      },
      update: (
        _e: unknown,
        _where: unknown,
        patch: Record<string, unknown>,
      ) => {
        updates.push(patch);
        return Promise.resolve();
      },
    };
    const fakeDs = {
      isInitialized: true,
      transaction: (cb: (m: typeof fakeManager) => Promise<void>) =>
        cb(fakeManager),
    } as unknown as DataSource;
    const store = new TypeOrmOrgSyncStore(fakeDs);

    const plan: SyncPlan = {
      orgCreates: [
        {
          companyCode: 'AS',
          orgCode: 'JAC00',
          codePrefix: 'JAC',
          parentCode: 'JA000',
          tier: 'SECTION',
          name: '審查室',
          descFull: '營運管理部審查室',
          managerEmpNo: 'E1',
          isActive: true,
        },
      ],
      orgUpdates: [
        {
          companyCode: 'AS',
          orgCode: 'JAD00',
          codePrefix: 'JAD',
          parentCode: 'JA000',
          tier: 'SECTION',
          name: '核保室',
          descFull: '營運管理部核保室',
          managerEmpNo: 'E2',
          isActive: true,
        },
      ],
      accountCreates: [],
      accountUpdates: [],
      accountDisables: [],
    };

    await store.applySync('AS', plan);

    expect(inserts[0]).toMatchObject({ descFull: '營運管理部審查室' });
    expect(updates[0]).toMatchObject({ descFull: '營運管理部核保室' });
  });

  it('findOrgUnits 回傳之 ExistingOrgUnit 含 descFull', async () => {
    const fakeRepo = {
      find: () =>
        Promise.resolve([
          {
            orgCode: 'JAC00',
            codePrefix: 'JAC',
            tier: 'SECTION',
            parentCode: 'JA000',
            name: '審查室',
            descFull: '營運管理部審查室',
            managerEmpNo: 'E1',
            isActive: true,
          },
        ]),
    };
    const fakeDs = {
      isInitialized: true,
      getRepository: () => fakeRepo,
    } as unknown as DataSource;
    const store = new TypeOrmOrgSyncStore(fakeDs);

    const m = await store.findOrgUnits('AS');
    expect(m.get('JAC00')?.descFull).toBe('營運管理部審查室');
  });
});

describe('TS-DESCFULL-008 OrgUnit entity — descFull 欄位為 nullable nvarchar', () => {
  it('descFull 欄位存在、nullable、nvarchar', () => {
    const col = getMetadataArgsStorage().columns.find(
      (c) => c.target === OrgUnit && c.propertyName === 'descFull',
    );
    expect(col).toBeDefined();
    expect(col?.options.nullable).toBe(true);
    expect(col?.options.type).toBe('nvarchar');
  });
});
