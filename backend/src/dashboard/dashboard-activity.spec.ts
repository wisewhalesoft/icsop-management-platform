import {
  ACTIVITY_KINDS,
  ACTIVITY_LIMIT_MAX,
  DashboardActivityItem,
  accountDisabledText,
  documentCreatedText,
  documentDownloadedText,
  lifecycleChangedText,
  mergeActivity,
  normalizeActivityLimit,
  orgSyncCompletedText,
  visibleActivityKinds,
} from './dashboard-activity';
import { DashboardActivityService, DashboardActivityProviders } from './dashboard-activity.service';

const item = (
  id: string,
  occurredAt: string,
  kind: DashboardActivityItem['kind'] = 'DOCUMENT_CREATED',
): DashboardActivityItem => ({ id, kind, text: id, occurredAt });

describe('visibleActivityKinds（F025 逐類角色過濾）', () => {
  it('SysAdmin／ICSOPAdmin 對五類來源皆具 read → 全部可見', () => {
    expect(visibleActivityKinds('SysAdmin')).toEqual([...ACTIVITY_KINDS]);
    expect(visibleActivityKinds('ICSOPAdmin')).toEqual([...ACTIVITY_KINDS]);
  });

  /**
   * 🔴 2026-09-02 人類裁決：**主管之循環管理由「唯讀」改為「無」** ⇒ 主管之動態來源
   * 隨之少掉 `LIFECYCLE_CHANGED`（本檔之過濾一律走 `FUNCTION_MATRIX`，未另建權限表）。
   * 📝 原案逐字保留供追溯：
   *   it('主管僅見文件建立與循環變更（無帳號／同步／調閱權）', ...)
   *     expect(visibleActivityKinds('Supervisor')).toEqual(['DOCUMENT_CREATED', 'LIFECYCLE_CHANGED']);
   * ⚠ 主管與部門窗口自本輪起可見來源相同（皆僅 `DOCUMENT_CREATED`）——兩案**刻意各自保留**，
   * 不合併成一個 `it.each`：它們是兩條獨立裁決碰巧此刻同值，合併會讓下次任一邊調整時
   * 另一邊被靜默地一起改掉。
   */
  it('主管僅見文件建立（循環管理已改為 NONE，無帳號／同步／調閱權）', () => {
    expect(visibleActivityKinds('Supervisor')).toEqual(['DOCUMENT_CREATED']);
  });

  it('部門窗口僅見文件建立（循環管理為 NONE）', () => {
    expect(visibleActivityKinds('DeptContact')).toEqual(['DOCUMENT_CREATED']);
  });

  it('一般使用者／未知角色／未登入 → 空（fail-closed）', () => {
    expect(visibleActivityKinds('User')).toEqual([]);
    expect(visibleActivityKinds('Nope')).toEqual([]);
    expect(visibleActivityKinds(undefined)).toEqual([]);
  });
});

describe('normalizeActivityLimit', () => {
  it('未給／非數字／非正數 → 預設 5', () => {
    expect(normalizeActivityLimit(undefined)).toBe(5);
    expect(normalizeActivityLimit('abc')).toBe(5);
    expect(normalizeActivityLimit('0')).toBe(5);
    expect(normalizeActivityLimit(-3)).toBe(5);
  });

  it('合法值原樣；超過上限 → 截為上限', () => {
    expect(normalizeActivityLimit('8')).toBe(8);
    expect(normalizeActivityLimit(999)).toBe(ACTIVITY_LIMIT_MAX);
  });
});

describe('mergeActivity', () => {
  it('跨來源合併後時間新→舊並截斷至 limit', () => {
    const merged = mergeActivity(
      [
        [item('a', '2026-08-27T01:00:00.000Z'), item('b', '2026-08-25T01:00:00.000Z')],
        [item('c', '2026-08-26T01:00:00.000Z')],
      ],
      2,
    );
    expect(merged.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('同時間以 id 穩定排序（同一請求重跑順序不跳動）', () => {
    const t = '2026-08-27T01:00:00.000Z';
    expect(mergeActivity([[item('z', t)], [item('a', t)]], 5).map((r) => r.id)).toEqual([
      'a',
      'z',
    ]);
  });

  it('無效時間戳排最後而非污染排序', () => {
    const merged = mergeActivity([[item('bad', ''), item('ok', '2026-01-01T00:00:00.000Z')]], 5);
    expect(merged.map((r) => r.id)).toEqual(['ok', 'bad']);
  });
});

describe('活動文案（比照 prototype 07 ACTIVITY 句型）', () => {
  it('文件建立／下載／同步／停用／循環', () => {
    expect(documentCreatedText('ICSOP-SRC-101-1-01', '車輛分期進件作業')).toBe(
      'ICSOP-SRC-101-1-01 車輛分期進件作業 已建立',
    );
    expect(orgSyncCompletedText('scheduled', 12)).toBe('每日組織同步完成，異動 12 筆');
    expect(orgSyncCompletedText('manual', 0)).toBe('手動組織同步完成，異動 0 筆');
    expect(accountDisabledText('20321', '周立群', 'departed')).toBe(
      '帳號 20321（周立群·離職）自動停用',
    );
    expect(accountDisabledText('20321', '周立群', 'manual')).toBe(
      '帳號 20321（周立群·手動）已停用',
    );
    expect(lifecycleChangedText('銷售及收款循環', '新增節點『案件結束作業』')).toBe(
      '循環『銷售及收款循環』新增節點『案件結束作業』',
    );
    expect(documentDownloadedText('ICSOP-SRC-101-1-01', '車輛分期進件作業', '王小明')).toBe(
      'ICSOP-SRC-101-1-01 車輛分期進件作業 被下載（王小明）',
    );
  });

  it('缺值以「—」佔位（不輸出 null／undefined 字樣）；循環名解析不到 → 僅摘要', () => {
    expect(documentCreatedText(null, null)).toBe('— — 已建立');
    expect(accountDisabledText(null, null, null)).toBe('帳號 —（—·手動）已停用');
    expect(lifecycleChangedText(null, '新增節點『X』')).toBe('新增節點『X』');
    expect(orgSyncCompletedText(null, null)).toBe('每日組織同步完成，異動 0 筆');
  });
});

describe('DashboardActivityService', () => {
  const calls: string[] = [];
  const providers = (
    over: Partial<DashboardActivityProviders> = {},
  ): DashboardActivityProviders => {
    const src =
      (kind: DashboardActivityItem['kind'], at: string) =>
      (limit: number): Promise<DashboardActivityItem[]> => {
        calls.push(kind);
        return Promise.resolve([item(kind, at, kind)].slice(0, limit));
      };
    return {
      DOCUMENT_CREATED: src('DOCUMENT_CREATED', '2026-08-27T05:00:00.000Z'),
      ORG_SYNC_COMPLETED: src('ORG_SYNC_COMPLETED', '2026-08-27T04:00:00.000Z'),
      ACCOUNT_DISABLED: src('ACCOUNT_DISABLED', '2026-08-27T03:00:00.000Z'),
      LIFECYCLE_CHANGED: src('LIFECYCLE_CHANGED', '2026-08-27T02:00:00.000Z'),
      DOCUMENT_DOWNLOADED: src('DOCUMENT_DOWNLOADED', '2026-08-27T01:00:00.000Z'),
      ...over,
    };
  };

  beforeEach(() => {
    calls.length = 0;
  });

  it('ICSOPAdmin → 五類皆查、時間新→舊', async () => {
    const svc = new DashboardActivityService(providers());
    const rows = await svc.getRecent('ICSOPAdmin', 5);
    expect(rows.map((r) => r.kind)).toEqual([
      'DOCUMENT_CREATED',
      'ORG_SYNC_COMPLETED',
      'ACCOUNT_DISABLED',
      'LIFECYCLE_CHANGED',
      'DOCUMENT_DOWNLOADED',
    ]);
  });

  /**
   * 🔴 2026-09-02 人類裁決之連動：主管少掉 `LIFECYCLE_CHANGED` 來源。
   * 🔒 本案真正鑑別的是 `calls`——「未授權來源**根本不被查詢**」而非查完再過濾；
   * 該性質一格未動，只是授權集合小了一項。
   * 📝 原期望值逐字保留供追溯：OLD> ['DOCUMENT_CREATED', 'LIFECYCLE_CHANGED']（兩處）
   */
  it('主管 → 未授權來源根本不被查詢（非查完再過濾）', async () => {
    const svc = new DashboardActivityService(providers());
    const rows = await svc.getRecent('Supervisor', 5);
    expect(rows.map((r) => r.kind)).toEqual(['DOCUMENT_CREATED']);
    expect(calls).toEqual(['DOCUMENT_CREATED']);
  });

  it('一般使用者／未登入 → 空陣列且完全不查詢', async () => {
    const svc = new DashboardActivityService(providers());
    expect(await svc.getRecent('User')).toEqual([]);
    expect(await svc.getRecent(undefined)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('單一來源失敗 → 該來源降為空，其餘照常回傳', async () => {
    const svc = new DashboardActivityService(
      providers({
        ORG_SYNC_COMPLETED: () => Promise.reject(new Error('db down')),
      }),
    );
    const rows = await svc.getRecent('SysAdmin', 5);
    expect(rows.map((r) => r.kind)).toEqual([
      'DOCUMENT_CREATED',
      'ACCOUNT_DISABLED',
      'LIFECYCLE_CHANGED',
      'DOCUMENT_DOWNLOADED',
    ]);
  });

  it('limit 傳遞至各來源並於合併後截斷', async () => {
    const svc = new DashboardActivityService(providers());
    expect(await svc.getRecent('SysAdmin', 2)).toHaveLength(2);
  });
});
