/**
 * F042 UX16 delta — `AC-UX49`（TAB2 新增「制定本部」篩選，服務層）／`AC-UX51`／`AC-UX53`
 * （匯出，`exportRows`）。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md#ux16-delta;
 * docs/specs/architecture-spec.md §16.8（`ARCH-UX8`：`OjtRowFilters` ＋ `divisionCode`，
 * `OjtProgressService.exportRows()` 委派既有 `listRows()`，`GET admin/ojt-progress/export`）。
 *
 * ⚠ 對實作全盲：`OjtProgressService.exportRows` 尚不存在——本檔對應之案例為預期紅燈。
 */
import { OjtProgressService } from './ojt-progress.service';
import {
  FakeOjtAuditRecorder,
  FakeOjtBlobStore,
  FakeOjtSessionStore,
  FakeOrgDirectory,
  FakeUsingDeptChecker,
  ICSOP_ADMIN,
  OjtProgressRow,
  OjtSessionContext,
} from './ojt-progress.test-support';

/**
 * 型別輔助（非行為變更）：`OjtProgressService` 為既有已實作類別，其真實 `listRows()` 之
 * `OjtRowFilters` 型別（定義於 production `ojt-progress.service.ts`／`ojt-progress.store.ts`，
 * 非本檔可讀之來源）尚未含 `divisionCode`（`AC-UX49`），`exportRows()` 方法本身亦尚不存在
 * （`AC-UX51`）。比照本 repo「延伸已實作函式簽章」之既有紀律，以 cast 承載新欄位/新方法，
 * 使紅燈落在個別斷言而非整檔編譯崩潰（見 org-sync/role-derivation.spec.ts 等既有先例之精神）。
 */
interface Ux16RowFilters {
  orgQuery?: string;
  completionStatus?: '' | 'completed' | 'pending';
  divisionCode?: string;
}
interface OjtProgressServiceUx16 {
  listRows(ctx: OjtSessionContext, filters: Ux16RowFilters): Promise<OjtProgressRow[]>;
  exportRows(ctx: OjtSessionContext, filters: Ux16RowFilters): Promise<{ csv: Buffer; fileName: string }>;
}
function asUx16(svc: OjtProgressService): OjtProgressServiceUx16 {
  return svc as unknown as OjtProgressServiceUx16;
}

function makeService() {
  const sessionStore = new FakeOjtSessionStore();
  const usingDept = new FakeUsingDeptChecker();
  const orgDirectory = new FakeOrgDirectory();
  const audit = new FakeOjtAuditRecorder();
  const blob = new FakeOjtBlobStore();
  const svc = new OjtProgressService(sessionStore, usingDept, orgDirectory, audit, blob, () =>
    new Date('2026-09-22T00:00:00.000Z'),
  );
  return { svc, sessionStore, usingDept, orgDirectory };
}

/** 兩個部門，同一本部（DIV1）＋ 一個部門，另一本部（DIV2）——AC-UX49 之「上溯到本部」鑑別語料。 */
function seedTwoDivisions(usingDept: FakeUsingDeptChecker, orgDirectory: FakeOrgDirectory): void {
  usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['DEPT-A'] });
  usingDept.seedDoc({ id: 'd2', documentNumber: 'N2', documentName: '文件二', companyCode: 'AS', usingDeptIds: ['DEPT-B'] });
  usingDept.seedDoc({ id: 'd3', documentNumber: 'N3', documentName: '文件三', companyCode: 'AS', usingDeptIds: ['DEPT-C'] });
  orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'DEPT-A', name: '部門甲', isActive: true, divisionCode: 'DIV1' });
  orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'DEPT-B', name: '部門乙', isActive: true, divisionCode: 'DIV1' });
  orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'DEPT-C', name: '部門丙', isActive: true, divisionCode: 'DIV2' });
}

describe('OjtProgressService.listRows — UX16 delta AC-UX49（divisionCode 篩選）', () => {
  it('🔴 選定本部後，該本部下轄之全部部門文件皆納入（防「只比對了部層」）：語料須含同一本部下兩個不同部', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    seedTwoDivisions(usingDept, orgDirectory);

    const rows = await asUx16(svc).listRows(ICSOP_ADMIN, { divisionCode: 'DIV1' });
    expect(rows.map((r) => r.documentNumber).sort()).toEqual(['N1', 'N2']);
  });

  it('未提供 divisionCode → 不施加限制（既有兩項篩選之既有規則擴及第三項）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    seedTwoDivisions(usingDept, orgDirectory);
    const rows = await asUx16(svc).listRows(ICSOP_ADMIN, {});
    expect(rows).toHaveLength(3);
  });

  it('與既有兩項篩選並用為 AND：divisionCode=DIV1 ∧ orgQuery=部門乙 → 僅 N2', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    seedTwoDivisions(usingDept, orgDirectory);
    const rows = await asUx16(svc).listRows(ICSOP_ADMIN, { divisionCode: 'DIV1', orgQuery: '部門乙' });
    expect(rows.map((r) => r.documentNumber)).toEqual(['N2']);
  });

  it('推導不出本部之單位——不產生 sentinel，且該單位之列在未選定任何本部時照常呈現（同構 AC-UX24）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd9', documentNumber: 'N9', documentName: '無本部文件', companyCode: 'AS', usingDeptIds: ['DEPT-Z'] });
    orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'DEPT-Z', name: '部門玄', isActive: true }); // divisionCode 未提供 → null
    const rows = await asUx16(svc).listRows(ICSOP_ADMIN, {});
    expect(rows.map((r) => r.documentNumber)).toContain('N9');
    // 選定任一本部時，該單位（查無本部）不應被誤篩入。
    const filtered = await asUx16(svc).listRows(ICSOP_ADMIN, { divisionCode: 'DIV1' });
    expect(filtered.map((r) => r.documentNumber)).not.toContain('N9');
  });
});

describe('OjtProgressService.exportRows — UX16 delta AC-UX51／AC-UX53', () => {
  it('AC-UX51：CSV 之資料列集合恰等於當前畫面三項篩選套用後之進度列集合（與 listRows 同一份邏輯）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    seedTwoDivisions(usingDept, orgDirectory);

    const filters = { divisionCode: 'DIV1' };
    const rowsOnScreen = await asUx16(svc).listRows(ICSOP_ADMIN, filters);
    const { csv } = await asUx16(svc).exportRows(ICSOP_ADMIN, filters);
    const lines = csv.subarray(3).toString('utf8').replace(/\r?\n$/, '').split(/\r?\n/);
    // 表頭 + N 筆資料列 = rowsOnScreen.length + 1。
    expect(lines).toHaveLength(rowsOnScreen.length + 1);
    for (const r of rowsOnScreen) {
      expect(csv.toString('utf8')).toContain(r.documentNumber);
    }
  });

  it('🔴 AC-UX53：恆為逐列進度資料，與分組模式無關——本服務層無分組概念，匯出參數不受任何前端呈現狀態影響（結構性保證）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    seedTwoDivisions(usingDept, orgDirectory);
    const { csv: csv1 } = await asUx16(svc).exportRows(ICSOP_ADMIN, { divisionCode: 'DIV1' });
    const { csv: csv2 } = await asUx16(svc).exportRows(ICSOP_ADMIN, { divisionCode: 'DIV1' });
    expect(csv1.equals(csv2)).toBe(true);
  });

  it('0 筆 → 僅含表頭列之 CSV（沿用既有 F017 AC-X1/AC-X2 規則，不改）', async () => {
    const { svc } = makeService();
    const { csv } = await asUx16(svc).exportRows(ICSOP_ADMIN, { divisionCode: 'no-such-division' });
    const lines = csv.subarray(3).toString('utf8').replace(/\r?\n$/, '').split(/\r?\n/);
    expect(lines).toHaveLength(1);
  });
});
