import {
  WATERMARK_CONFIDENTIALITY,
  WatermarkIdentity,
  buildWatermarkSnapshot,
  deriveSectionName,
  departmentCodeCandidates,
  resolveDepartmentFullName,
  formatWatermarkTimestamp,
} from './watermark';

const FULL: WatermarkIdentity = {
  employeeNo: 'E001',
  name: '王小明',
  companyFullName: '和潤企業股份有限公司',
  departmentFullName: '營運管理部',
  sectionName: '審查室',
  timestamp: '2026-07-23 10:00:00 (UTC+8)',
};

describe('F020 浮水印快照組裝（純函式）', () => {
  it('TS-F020-001 完整欄位組字，欄位順序與格式（NFR-007 權威）', () => {
    expect(buildWatermarkSnapshot(FULL)).toBe(
      `E001-王小明-和潤企業股份有限公司-營運管理部-審查室-${WATERMARK_CONFIDENTIALITY}-2026-07-23 10:00:00 (UTC+8)`,
    );
  });

  it('TS-F020-002 固定機密聲明為固定值，非依輸入變化', () => {
    expect(WATERMARK_CONFIDENTIALITY).toBe(
      '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現',
    );
    const a = buildWatermarkSnapshot({ ...FULL, name: '甲' });
    const b = buildWatermarkSnapshot({ ...FULL, name: '乙' });
    expect(a).toContain(WATERMARK_CONFIDENTIALITY);
    expect(b).toContain(WATERMARK_CONFIDENTIALITY);
  });

  it('TS-F020-003 處/室留空 → 自動收合分隔符，不出現 --', () => {
    const out = buildWatermarkSnapshot({ ...FULL, sectionName: '' });
    expect(out).toBe(
      `E001-王小明-和潤企業股份有限公司-營運管理部-${WATERMARK_CONFIDENTIALITY}-2026-07-23 10:00:00 (UTC+8)`,
    );
    expect(out).not.toContain('--');
  });

  it('TS-F020-004 部門與處/室皆空（孤兒帳號）→ 收合，不顯示 null/原始代碼', () => {
    const out = buildWatermarkSnapshot({ ...FULL, departmentFullName: '', sectionName: '' });
    expect(out).toBe(
      `E001-王小明-和潤企業股份有限公司-${WATERMARK_CONFIDENTIALITY}-2026-07-23 10:00:00 (UTC+8)`,
    );
    expect(out).not.toContain('--');
    expect(out).not.toMatch(/null|undefined/);
  });

  it('TS-F020-005 相鄰空欄逐一收合，不影響中段有效欄位之分隔符', () => {
    // 防禦性：模擬 company 亦空（多欄相鄰為空）
    const out = buildWatermarkSnapshot({
      ...FULL,
      companyFullName: '',
      departmentFullName: '',
      sectionName: '',
    });
    expect(out).toBe(`E001-王小明-${WATERMARK_CONFIDENTIALITY}-2026-07-23 10:00:00 (UTC+8)`);
    expect(out).not.toContain('--');
  });

  it('TS-F020-006 相隔時間兩次組字 → 僅時間戳不同，其餘相同', () => {
    const a = buildWatermarkSnapshot({ ...FULL, timestamp: '2026-07-23 10:00:00 (UTC+8)' });
    const b = buildWatermarkSnapshot({ ...FULL, timestamp: '2026-07-23 11:30:05 (UTC+8)' });
    expect(a.replace('10:00:00', 'X')).toBe(b.replace('11:30:05', 'X'));
    expect(a).not.toBe(b);
  });
});

describe('F020「處/室」欄推導（自身 tier + DESC_CHI split）', () => {
  it('TS-F020-007 處室層（SECTION）→ DESC_CHI 末段（審查室）', () => {
    expect(deriveSectionName('SECTION', '營管部/審查室')).toBe('審查室');
  });
  it('TS-F020-008 課層（SUBSECTION）→ 末段課名，略過中間處層', () => {
    expect(deriveSectionName('SUBSECTION', '北區綜合處/醫療一課')).toBe('醫療一課');
  });
  it('TS-F020-009 部層（DEPARTMENT）→ 留空', () => {
    expect(deriveSectionName('DEPARTMENT', '營運管理部')).toBe('');
  });
  it('TS-F020-010 本部層/Root（DIVISION/ROOT）→ 留空', () => {
    expect(deriveSectionName('DIVISION', '營業二本部')).toBe('');
    expect(deriveSectionName('ROOT', '和潤企業')).toBe('');
  });
  it('TS-F020-011 SECTION 但 DESC_CHI 無斜線（單段）→ 取該段本身', () => {
    expect(deriveSectionName('SECTION', '審查室')).toBe('審查室');
  });
  it('null/空 DESC_CHI → 空字串（不報錯）', () => {
    expect(deriveSectionName('SECTION', null)).toBe('');
    expect(deriveSectionName('SECTION', '')).toBe('');
  });
});

describe('F020「部門」欄之部層 DESC_FULL 推導 + fallback 鏈', () => {
  it('部層代碼候選：部層 → 本部層 → Root（依序 fallback）', () => {
    expect(departmentCodeCandidates('JAC00')).toEqual(['JA000', 'J0000', '00000']);
    expect(departmentCodeCandidates('JCHA0')).toEqual(['JC000', 'J0000', '00000']);
  });

  it('TS-F020-009(部門) 處室層 JAC00 → 部層 JA000 之 DESC_FULL（營運管理部）', () => {
    const lookup = (code: string) =>
      ({ JA000: { descFull: '營運管理部' } } as Record<string, { descFull: string | null }>)[code] ??
      null;
    expect(resolveDepartmentFullName('JAC00', lookup)).toBe('營運管理部');
  });

  it('TS-F020-014 部層缺、本部層有 → fallback 取本部層 DESC_FULL', () => {
    const lookup = (code: string) =>
      ({ J0000: { descFull: '營業二本部' } } as Record<string, { descFull: string | null }>)[code] ??
      null;
    expect(resolveDepartmentFullName('JAC00', lookup)).toBe('營業二本部');
  });

  it('TS-F020-014 部層與本部層皆缺 → null（組裝端收合為空）', () => {
    expect(resolveDepartmentFullName('JAC00', () => null)).toBeNull();
  });
});

describe('F020 時間戳格式（UTC+8）', () => {
  it('formatWatermarkTimestamp → YYYY-MM-DD HH:mm:ss (UTC+8)', () => {
    // 2026-07-23 02:00:00 UTC → 10:00:00 (UTC+8)
    expect(formatWatermarkTimestamp(new Date('2026-07-23T02:00:00Z'))).toBe(
      '2026-07-23 10:00:00 (UTC+8)',
    );
  });
});
