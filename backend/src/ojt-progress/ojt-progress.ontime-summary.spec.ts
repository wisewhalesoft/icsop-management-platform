import 'reflect-metadata';
import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { OjtProgressService } from './ojt-progress.service';
import { OjtProgressController } from './ojt-progress.controller';
import {
  FakeOjtSessionStore,
  FakeUsingDeptChecker,
  FakeOrgDirectory,
  FakeOjtAuditRecorder,
  FakeOjtBlobStore,
  DEPT_CONTACT,
  ICSOP_ADMIN,
  NORMAL_USER,
  SUPERVISOR,
  SYS_ADMIN,
  type OjtSessionRecord,
} from './ojt-progress.test-support';

/**
 * F044 卡④ 之**服務層 ＋ 路由層**建環（`GET /admin/ojt-progress/ontime-summary`）。
 *
 * 涵蓋：`AC-G86`（端點路徑逐字、無查詢參數、掛在 OJT 模組）、`AC-G14`（🔴 `rate` 鍵由**後端**
 * 省略）、`AC-G12` ②（`excludedOrphaned` 來自既有 `countOrphanedRows()`——🔴 前端**結構上**
 * 算不出來，這正是 `ARCH-G1` 把聚合放後端的功能性理由）、`AC-G11`（完成判定沿用 F042 `AC-03`）、
 * 既有 `assertCanRead()` 之閘門。
 *
 * 🔴 **本檔對實作全盲**：`OjtProgressService.getOnTimeUnitStats` 與 controller 之
 *    `ontime-summary` 路由於建環當下尚不存在。
 *    ⚠ `OjtProgressService`／`OjtProgressController` **已存在** ⇒ 為了不讓整份檔案在
 *    `import` 階段就死掉（那會蓋掉逐條紅燈的資訊），本檔以 `as unknown as` 之窄介面取用
 *    尚不存在的方法（比照本 repo 既有之 not-yet-existing-method 取用慣例）。
 *
 * 🔒 **契約**（`architecture-spec` §15.5 ③ 逐字）：
 * ```
 * interface OjtOnTimeSummary {
 *   today: string;                      // YYYY-MM-DD（UTC；= serverToday(now)）
 *   numerator: number; denominator: number;
 *   rate?: number;                      // 🔒 denominator === 0 時**省略本鍵**
 *   excludedInactive: number; excludedOrphaned: number; excludedNoAnnouncedDate: number;
 * }
 * // 於 OjtProgressService 上：
 * getOnTimeUnitStats(session: OjtSessionContext): Promise<OjtOnTimeSummary>;
 * ```
 */

interface OjtOnTimeSummary {
  today: string;
  numerator: number;
  denominator: number;
  rate?: number;
  excludedInactive: number;
  excludedOrphaned: number;
  excludedNoAnnouncedDate: number;
}

type OnTimeCapable = {
  getOnTimeUnitStats(session: unknown): Promise<OjtOnTimeSummary>;
};

/** 🔒 凍結之「今日」。窗口 ＝ `[2026-01-28, 2026-02-28]`。 */
const TODAY = '2026-02-28';

function makeService(today: string = TODAY): {
  svc: OjtProgressService & OnTimeCapable;
  sessionStore: FakeOjtSessionStore;
  usingDept: FakeUsingDeptChecker;
  orgDirectory: FakeOrgDirectory;
} {
  const sessionStore = new FakeOjtSessionStore();
  const usingDept = new FakeUsingDeptChecker();
  const orgDirectory = new FakeOrgDirectory();
  const audit = new FakeOjtAuditRecorder();
  const blob = new FakeOjtBlobStore();
  const svc = new OjtProgressService(sessionStore, usingDept, orgDirectory, audit, blob, () =>
    new Date(`${today}T00:00:00.000Z`),
  );
  return {
    svc: svc as unknown as OjtProgressService & OnTimeCapable,
    sessionStore,
    usingDept,
    orgDirectory,
  };
}

function seedSession(store: FakeOjtSessionStore, over: Partial<OjtSessionRecord>): void {
  const rec: Omit<OjtSessionRecord, 'id'> = {
    documentId: 'd1',
    orgCode: 'A1000',
    companyCode: 'AS',
    orphanedAt: null,
    trainingDate: '2026-02-01',
    edition: null,
    fileName: 'signin.pdf',
    blobPath: 'documents/d1/ojt/A1000/x.pdf',
    contentType: 'application/pdf',
    size: 1024,
    uploadedBy: 'acc-admin',
    uploadedByName: '王志明',
    uploadedAt: new Date('2026-02-01T00:00:00.000Z'),
    ...over,
  };
  store.rows.push({ id: `seed-${store.rows.length + 1}`, ...rec });
}

describe('AC-G86 — 路由層：GET /admin/ojt-progress/ontime-summary（逐字、無查詢參數）', () => {
  function routesOf(): { name: string; path: string; method: RequestMethod }[] {
    const proto = OjtProgressController.prototype as unknown as Record<string, unknown>;
    const names = Object.getOwnPropertyNames(proto).filter(
      (n) => n !== 'constructor' && typeof proto[n] === 'function',
    );
    const out: { name: string; path: string; method: RequestMethod }[] = [];
    for (const name of names) {
      const handler = proto[name] as object;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (path === undefined || method === undefined) continue;
      out.push({ name, path, method });
    }
    return out;
  }

  it('自我守護：controller 之路由清單非空', () => {
    expect(routesOf().length).toBeGreaterThan(0);
  });

  it('存在一個 GET，其路徑逐字含 `ontime-summary`', () => {
    const hit = routesOf().filter(
      (r) => r.method === RequestMethod.GET && /(^|\/)ontime-summary$/.test(r.path),
    );
    expect(hit).toHaveLength(1);
  });

  /**
   * 🔴 `AC-G86`：**三個端點皆無查詢參數**；🔴 `today` 明文不得由 client 傳入
   * （否則使用者可自行改「今天」而使全部統計失真）。
   */
  it('該路由之路徑不含任何參數區段（`:param`），且未宣告 @Query 之 today', () => {
    const hit = routesOf().find(
      (r) => r.method === RequestMethod.GET && /(^|\/)ontime-summary$/.test(r.path),
    );
    expect(hit).toBeDefined();
    expect(hit?.path).not.toContain(':');
    const proto = OjtProgressController.prototype as unknown as Record<string, unknown>;
    const handler = proto[hit?.name ?? ''] as ((...a: unknown[]) => unknown) | undefined;
    // 🔴 只收 `@Req()`（session）一個參數；多一個 @Query 會使 length 變成 2。
    expect(handler?.length).toBeLessThanOrEqual(1);
  });
});

describe('getOnTimeUnitStats — 閘門（既有 assertCanRead）', () => {
  it.each([
    ['ICSOPAdmin', ICSOP_ADMIN],
    ['SysAdmin', SYS_ADMIN],
    ['Supervisor', SUPERVISOR],
    ['DeptContact', DEPT_CONTACT],
  ] as const)('%s 可讀（OJT_PROGRESS_MANAGEMENT read 為真）', async (_label, session) => {
    const { svc } = makeService();
    await expect(svc.getOnTimeUnitStats(session)).resolves.toBeDefined();
  });

  it('一般使用者 → ForbiddenException（沿用既有 assertCanRead，不另寫角色清單）', async () => {
    const { svc } = makeService();
    await expect(svc.getOnTimeUnitStats(NORMAL_USER)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('getOnTimeUnitStats — 口徑與排除（AC-G9～AC-G12）', () => {
  it('分母＝窗口內相異單位、分子＝全部完成之單位；today 為 UTC 之 YYYY-MM-DD', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    // 應完成日 ＝ 2026-01-29 + 1 月 ＝ 2026-02-28（落在窗口上界）
    usingDept.seedDoc({
      id: 'd1',
      documentNumber: 'N1',
      documentName: '文件一',
      companyCode: 'AS',
      usingDeptIds: ['A1000', 'B1000'],
      announcedDate: '2026-01-29',
    });
    orgDirectory.seedOrg({ orgCode: 'A1000', name: '甲部', isActive: true });
    orgDirectory.seedOrg({ orgCode: 'B1000', name: '乙部', isActive: true });
    seedSession(sessionStore, { documentId: 'd1', orgCode: 'A1000' });

    const s = await svc.getOnTimeUnitStats(ICSOP_ADMIN);
    expect(s.today).toBe(TODAY);
    expect(s.denominator).toBe(2);
    expect(s.numerator).toBe(1);
    expect(s.rate).toBe(50);
  });

  /**
   * 🔴 `AC-G11`：完成判定**完全沿用** F042 `AC-03`（版次相符之場次存在即完成；`null` 對 `null`
   * 亦相符）。🔴 **明文禁止**引入 `trainingDate ≤ 應完成日` 之「準時」條件——「準時」由時間窗口承載。
   * 鑑別語料：`trainingDate` 刻意設在**應完成日之後**（2026-05-01），仍應算完成。
   */
  it('AC-G11：完成判定僅依場次（訓練日期晚於應完成日仍算完成）', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    usingDept.seedDoc({
      id: 'd1',
      documentNumber: 'N1',
      documentName: '文件一',
      companyCode: 'AS',
      usingDeptIds: ['A1000'],
      announcedDate: '2026-01-29',
    });
    orgDirectory.seedOrg({ orgCode: 'A1000', name: '甲部', isActive: true });
    seedSession(sessionStore, { documentId: 'd1', orgCode: 'A1000', trainingDate: '2026-05-01' });

    const s = await svc.getOnTimeUnitStats(ICSOP_ADMIN);
    expect(s.numerator).toBe(1);
    expect(s.denominator).toBe(1);
  });

  it('AC-G11：版次不相符之場次不算完成（F042 第五輪之既有判定）', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    usingDept.seedDoc({
      id: 'd1',
      documentNumber: 'N1',
      documentName: '文件一',
      companyCode: 'AS',
      usingDeptIds: ['A1000'],
      announcedDate: '2026-01-29',
      ojtTrainingEdition: "26'02",
    });
    orgDirectory.seedOrg({ orgCode: 'A1000', name: '甲部', isActive: true });
    seedSession(sessionStore, { documentId: 'd1', orgCode: 'A1000', edition: "26'01" });

    const s = await svc.getOnTimeUnitStats(ICSOP_ADMIN);
    expect(s.denominator).toBe(1);
    expect(s.numerator).toBe(0);
  });

  it('AC-G12 ①：裁撤單位自分子與分母同時排除並計數', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({
      id: 'd1',
      documentNumber: 'N1',
      documentName: '文件一',
      companyCode: 'AS',
      usingDeptIds: ['A1000', 'X9000'],
      announcedDate: '2026-01-29',
    });
    orgDirectory.seedOrg({ orgCode: 'A1000', name: '甲部', isActive: true });
    orgDirectory.seedOrg({ orgCode: 'X9000', name: '已裁撤部', isActive: false });

    const s = await svc.getOnTimeUnitStats(ICSOP_ADMIN);
    expect(s.denominator).toBe(1);
    expect(s.excludedInactive).toBe(1);
  });

  /**
   * 🔴 `AC-G12` ②／`ARCH-G1` ① 之**功能性阻斷**：孤兒依定義已不在 `DOC_USING_DEPT` 集合內
   * ⇒ 進度列裡**結構性地不含孤兒** ⇒ 該數字之唯一來源是後端既有之 `countOrphanedRows()`。
   * 🔴 本案即「為何聚合不能落前端」的可執行證明：把 `excludedOrphaned` 改成自 rows 推導，它恆為 0。
   */
  it('AC-G12 ②：excludedOrphaned 取自集合成員關係（前端結構上算不出來）', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    usingDept.seedDoc({
      id: 'd1',
      documentNumber: 'N1',
      documentName: '文件一',
      companyCode: 'AS',
      usingDeptIds: ['A1000'],
      announcedDate: '2026-01-29',
    });
    orgDirectory.seedOrg({ orgCode: 'A1000', name: '甲部', isActive: true });
    // 🔴 孤兒：場次之 orgCode 已不在該文件之使用部門集合內（不讀 orphanedAt 旗標）
    seedSession(sessionStore, { documentId: 'd1', orgCode: 'Z9000' });

    const s = await svc.getOnTimeUnitStats(ICSOP_ADMIN);
    expect(s.excludedOrphaned).toBe(1);
    expect(s.denominator).toBe(1); // 孤兒不成列，母體仍只有 A1000
  });

  it('AC-G12 ③：announcedDate 為 null 之文件排除並計數', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({
      id: 'd1',
      documentNumber: 'N1',
      documentName: '有公告日',
      companyCode: 'AS',
      usingDeptIds: ['A1000'],
      announcedDate: '2026-01-29',
    });
    usingDept.seedDoc({
      id: 'd2',
      documentNumber: 'N2',
      documentName: '無公告日',
      companyCode: 'AS',
      usingDeptIds: ['B1000'],
      announcedDate: null,
    });
    orgDirectory.seedOrg({ orgCode: 'A1000', name: '甲部', isActive: true });
    orgDirectory.seedOrg({ orgCode: 'B1000', name: '乙部', isActive: true });

    const s = await svc.getOnTimeUnitStats(ICSOP_ADMIN);
    expect(s.excludedNoAnnouncedDate).toBe(1);
    expect(s.denominator).toBe(1);
  });
});

describe('🔒 AC-G14 — `rate` 鍵由**後端**省略（不是前端判斷後不渲染）', () => {
  it('分母為 0（無任何應完成單位）⇒ 回應中不存在 rate 鍵', async () => {
    const { svc } = makeService();
    const s = await svc.getOnTimeUnitStats(ICSOP_ADMIN);
    expect(s.denominator).toBe(0);
    expect('rate' in s).toBe(false);
    // 🔴 明文禁止 `NaN%`／`undefined%`／`0%`／`100%`——鍵不存在時 TypeScript 會逼呼叫端處理 undefined。
    expect(JSON.stringify(s)).not.toContain('"rate"');
  });

  it('分母 > 0 ⇒ rate 鍵存在（證明上一條不是「永遠沒有 rate」）', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    usingDept.seedDoc({
      id: 'd1',
      documentNumber: 'N1',
      documentName: '文件一',
      companyCode: 'AS',
      usingDeptIds: ['A1000'],
      announcedDate: '2026-01-29',
    });
    orgDirectory.seedOrg({ orgCode: 'A1000', name: '甲部', isActive: true });
    seedSession(sessionStore, { documentId: 'd1', orgCode: 'A1000' });

    const s = await svc.getOnTimeUnitStats(ICSOP_ADMIN);
    expect('rate' in s).toBe(true);
    expect(s.rate).toBe(100);
  });
});

/**
 * 🔒 §庚 `AC-G79`／`AC-G81` 之同檔回歸旁證：新增之公開方法**不得**改動既有兩支方法之行為。
 * ⚠ 本組在建環當下即為**綠燈**——它不是紅燈閘門，而是「新方法上線後這兩支仍然一樣」的鎖。
 */
describe('🔒 AC-G79 — 既有 getSummary／listRows 之存在與簽章未被改動', () => {
  it('OjtProgressService 仍具 getSummary 與 listRows', () => {
    const proto = OjtProgressService.prototype as unknown as Record<string, unknown>;
    expect(typeof proto['getSummary']).toBe('function');
    expect(typeof proto['listRows']).toBe('function');
  });
});
