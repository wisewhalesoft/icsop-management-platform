import {
  PublicDocItem,
  isAnnounced,
  isPinned,
  splitAndSort,
  matchesDeptFilter,
  matchesKeyword,
  paginate,
  buildPublicList,
  escapeLikeContains,
} from './public-list';
import { escapeLikePrefix } from '../org-directory/org-unit-read';

/** 測試用文件工廠（僅設定與斷言相關欄位）。 */
function doc(over: Partial<PublicDocItem>): PublicDocItem {
  return {
    id: over.id ?? 'd',
    status: over.status ?? 'active',
    documentNumber: over.documentNumber ?? 'N-1',
    documentName: over.documentName ?? '文件',
    lifecycleId: over.lifecycleId ?? 'lc1',
    lifecycleName: over.lifecycleName ?? null,
    usingDeptIds: over.usingDeptIds ?? [],
    draftingDeptId: over.draftingDeptId ?? null,
    announcedDate: over.announcedDate ?? '2026-01-01',
    contentSummary: over.contentSummary ?? null,
  };
}

const TODAY = new Date('2026-07-17T00:00:00Z');

describe('F019 排序：使用部門置頂 + 編號降冪', () => {
  it('TS-F019-001 使用者部門與文件使用部門完全相符 → 置頂', () => {
    const d1 = doc({ id: 'D1', usingDeptIds: ['JAC00'], documentNumber: 'A002' });
    const d2 = doc({ id: 'D2', usingDeptIds: ['JCHA0'], documentNumber: 'A001' });
    const out = splitAndSort([d2, d1], 'JAC00');
    expect(out.map((d) => d.id)).toEqual(['D1', 'D2']); // D1 置頂在前
  });

  it('TS-F019-002 置頂區與其餘區各自依文件編號降冪', () => {
    const p1 = doc({ id: 'A003', usingDeptIds: ['JAC00'], documentNumber: 'A003' });
    const p2 = doc({ id: 'A001', usingDeptIds: ['JAC00'], documentNumber: 'A001' });
    const r1 = doc({ id: 'B010', usingDeptIds: ['ZZ000'], documentNumber: 'B010' });
    const r2 = doc({ id: 'B002', usingDeptIds: ['ZZ000'], documentNumber: 'B002' });
    const out = splitAndSort([p2, r2, p1, r1], 'JAC00');
    expect(out.map((d) => d.id)).toEqual(['A003', 'A001', 'B010', 'B002']);
  });

  it('TS-F019-003 使用者部門查無相符文件 → 無置頂，純編號降冪', () => {
    const a = doc({ id: 'a', usingDeptIds: ['ZZ000'], documentNumber: 'N-1' });
    const b = doc({ id: 'b', usingDeptIds: ['YY000'], documentNumber: 'N-2' });
    const out = splitAndSort([a, b], 'JAC00');
    expect(out.map((d) => d.id)).toEqual(['b', 'a']); // 純降冪，無異常空區塊
  });

  it('TS-F019-004 文件使用部門為多部門，其一相符 → 仍列入置頂', () => {
    const d1 = doc({ id: 'D1', usingDeptIds: ['JCHA0', 'JAC00'], documentNumber: 'A001' });
    const d2 = doc({ id: 'D2', usingDeptIds: ['ZZ000'], documentNumber: 'A009' });
    const out = splitAndSort([d2, d1], 'JAC00');
    expect(out[0].id).toBe('D1'); // 置頂優先於編號較大之非置頂
  });

  /**
   * ⚠ 取代原 `TS-F019-005`（原斷言「精確集合成員比對」＝ OQ-F019-03 之暫定假設，期望值為 false）。
   * 人類已裁定改採「子樹祖先鏈」：文件使用部門若為使用者部門之祖先（含自身）即置頂。
   * 證據：prototypes/03-public-list.html 第 137-140 行 USER_SCOPE 祖先鏈；
   *       F026-role-field-matrix.md AC「部層 JA000 + 使用者 JAC00 → 相符（子樹自動展開）」。
   */
  it('TS-PS-F019-001 文件使用部門為使用者部門之上層（部層 JA000）→ 置頂', () => {
    const d1 = doc({ id: 'D1', usingDeptIds: ['JA000'] });
    expect(isPinned(d1, 'JAC00')).toBe(true);
  });

  it('TS-PS-F019-002 使用者部門與文件使用部門完全相符（自身層級）→ 置頂', () => {
    expect(isPinned(doc({ usingDeptIds: ['JAC00'] }), 'JAC00')).toBe(true);
  });

  it('TS-PS-F019-003 文件使用部門為使用者所屬部門之下層（更細單位）→ 不置頂', () => {
    // 使用者掛部層 JA000；文件使用部門為其下處室 JAC00 → 不涵蓋使用者
    expect(isPinned(doc({ usingDeptIds: ['JAC00'] }), 'JA000')).toBe(false);
  });

  it('TS-PS-F019-004 多筆使用部門其一為使用者之上層 → 仍置頂（OR 語意不變）', () => {
    expect(isPinned(doc({ usingDeptIds: ['JCHA0', 'JA000'] }), 'JAC00')).toBe(true);
  });

  it('TS-PS-F019-005 使用者無部門（orgCode 空）→ 一律非置頂', () => {
    expect(isPinned(doc({ usingDeptIds: ['JAC00'] }), null)).toBe(false);
    expect(isPinned(doc({ usingDeptIds: ['JAC00'] }), undefined)).toBe(false);
    expect(isPinned(doc({ usingDeptIds: ['JAC00'] }), '')).toBe(false);
  });

  it('TS-PS-F019-006 全公司（Root 00000）使用部門 → 對任何使用者皆置頂', () => {
    expect(isPinned(doc({ usingDeptIds: ['00000'] }), 'JCHA0')).toBe(true);
    expect(isPinned(doc({ usingDeptIds: ['00000'] }), 'JAC00')).toBe(true);
  });

  it('TS-PS-F019-007 兄弟處室之使用部門 → 不置頂（回歸：子樹展開不放寬至兄弟）', () => {
    expect(isPinned(doc({ usingDeptIds: ['JAD00'] }), 'JAC00')).toBe(false);
  });
});

describe('F019 部門篩選：子樹前綴展開（契約 §9）', () => {
  it('TS-F019-006 選定本部層 J0000 → 涵蓋整個子樹（prefix J）', () => {
    const items = [
      doc({ usingDeptIds: ['JA000'] }),
      doc({ usingDeptIds: ['JAC00'] }),
      doc({ usingDeptIds: ['JCHA0'] }),
    ];
    expect(items.every((i) => matchesDeptFilter(i, 'J0000'))).toBe(true);
  });

  it('TS-F019-007 選定部層 JA000（prefix JA）→ 不含他部 JB', () => {
    expect(matchesDeptFilter(doc({ usingDeptIds: ['JAC00'] }), 'JA000')).toBe(true);
    expect(matchesDeptFilter(doc({ usingDeptIds: ['JB000'] }), 'JA000')).toBe(false);
  });

  it('TS-F019-008 選定處室層 JAC00（prefix JAC）→ 不含同部他處室 JAD00', () => {
    expect(matchesDeptFilter(doc({ usingDeptIds: ['JAC00'] }), 'JAC00')).toBe(true);
    expect(matchesDeptFilter(doc({ usingDeptIds: ['JAD00'] }), 'JAC00')).toBe(false);
  });

  it('TS-F019-009 選定課層 JCHA0（prefix JCHA）→ 不誤含同處室他課 JCHB0', () => {
    expect(matchesDeptFilter(doc({ usingDeptIds: ['JCHA0'] }), 'JCHA0')).toBe(true);
    expect(matchesDeptFilter(doc({ usingDeptIds: ['JCHB0'] }), 'JCHA0')).toBe(false);
  });

  it('TS-F019-010 Root（00000）有效前綴為空 → 不施加部門限制', () => {
    expect(matchesDeptFilter(doc({ usingDeptIds: ['ZZ999'] }), '00000')).toBe(true);
  });

  it('未提供部門篩選 → 全通過', () => {
    expect(matchesDeptFilter(doc({ usingDeptIds: ['JAC00'] }), undefined)).toBe(true);
    expect(matchesDeptFilter(doc({ usingDeptIds: ['JAC00'] }), '')).toBe(true);
  });

  it('TS-F019-011 前綴含萬用字元 %/_ 視為字面值（不擴大比對）', () => {
    // 記憶體 startsWith 天然字面安全：前綴 'J%' 不應命中 'JA000'
    expect('JA000'.startsWith('J%')).toBe(false);
    // SQL 下推路徑之跳脫函式（[integration] 用）：% _ [ 逐字跳脫
    expect(escapeLikePrefix('J%_[')).toBe('J[%][_][[]');
  });
});

describe('F019 狀態/循環篩選 + AND 組合', () => {
  it('TS-F019-013 循環篩選（lifecycleId 相等）', () => {
    const items = [
      doc({ id: 'a', lifecycleId: 'LC-A' }),
      doc({ id: 'b', lifecycleId: 'LC-B' }),
    ];
    const page = buildPublicList(items, null, { lifecycleId: 'LC-A' }, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['a']);
  });

  it('TS-F019-014 部門＋循環三條件交集（AND，非聯集）', () => {
    const items = [
      doc({ id: 'hit', usingDeptIds: ['JAC00'], lifecycleId: 'LC-A' }),
      doc({ id: 'deptOnly', usingDeptIds: ['JAC00'], lifecycleId: 'LC-B' }),
      doc({ id: 'cycOnly', usingDeptIds: ['ZZ000'], lifecycleId: 'LC-A' }),
    ];
    const page = buildPublicList(items, null, { deptCode: 'JAC00', lifecycleId: 'LC-A' }, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['hit']);
  });

  it('TS-F019-015 篩選 AND 關鍵字同時套用', () => {
    const items = [
      doc({ id: 'hit', usingDeptIds: ['JAC00'], documentName: '審查作業' }),
      doc({ id: 'deptNoKw', usingDeptIds: ['JAC00'], documentName: '其他' }),
    ];
    const page = buildPublicList(items, null, { deptCode: 'JAC00', keyword: '審查' }, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['hit']);
  });
});

describe('F019 關鍵字搜尋（編號＋名稱）+ 跳脫', () => {
  it('TS-F019-016 關鍵字為文件編號部分字串', () => {
    expect(matchesKeyword(doc({ documentNumber: 'ICSOP-2026-001' }), '2026-001')).toBe(true);
  });
  it('TS-F019-017 關鍵字為文件名稱部分字串', () => {
    expect(matchesKeyword(doc({ documentName: '消費金融作業程序書' }), '消費金融')).toBe(true);
  });
  it('TS-F019-018 關鍵字含 %/_/\' 視為字面值，無錯誤/注入', () => {
    const d = doc({ documentName: "100%_test'x" });
    expect(matchesKeyword(d, "100%_test'")).toBe(true); // 字面命中
    expect(matchesKeyword(doc({ documentName: '無關' }), "100%_test'")).toBe(false);
    // SQL 下推之跳脫（[integration]）
    expect(escapeLikeContains("100%_")).toBe('100[%][_]');
  });
  it('空關鍵字 → 全通過', () => {
    expect(matchesKeyword(doc({}), '')).toBe(true);
    expect(matchesKeyword(doc({}), '   ')).toBe(true);
  });
});

describe('F019 強制基底條件（不可繞過）', () => {
  it('TS-F019-020 僅回傳已公告文件（有效且公告日期≤今日）', () => {
    const announced = doc({ id: 'ann', status: 'active', announcedDate: '2026-01-01' });
    const inProgress = doc({ id: 'ip', status: 'active', announcedDate: '2026-12-31' });
    const inactive = doc({ id: 'ina', status: 'inactive', announcedDate: '2026-01-01' });
    const voided = doc({ id: 'void', status: 'void', announcedDate: '2026-01-01' });
    const page = buildPublicList([announced, inProgress, inactive, voided], null, {}, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['ann']);
  });

  it('TS-F019-021 呼叫端夾帶 status 參數企圖繞過 → 後端強制忽略', () => {
    const inactive = doc({ id: 'ina', status: 'inactive', announcedDate: '2026-01-01' });
    // 前端傳入 status=失效 亦不放寬：基底條件恆鎖已公告
    const page = buildPublicList([inactive], null, { status: 'inactive' }, TODAY);
    expect(page.items).toHaveLength(0);
  });

  it('TS-F019-022 有效且公告日期＝今日（含當日）→ 已公告', () => {
    expect(isAnnounced(doc({ status: 'active', announcedDate: '2026-07-17' }), TODAY)).toBe(true);
  });

  it('TS-F019-023 有效但公告日期＝明日 → 進度中，不列入', () => {
    expect(isAnnounced(doc({ status: 'active', announcedDate: '2026-07-18' }), TODAY)).toBe(false);
  });
});

describe('F019 分頁', () => {
  it('TS-F019-024/025 分頁中繼與跨頁排序一致（105 筆 / 每頁 50）', () => {
    // 產生編號可排序之 105 筆（皆已公告、無置頂）
    const items = Array.from({ length: 105 }, (_, i) =>
      doc({ id: `d${i}`, documentNumber: `N-${String(i).padStart(3, '0')}`, usingDeptIds: ['ZZ000'] }),
    );
    const sorted = splitAndSort(items.filter((i) => isAnnounced(i, TODAY)), null);
    const p1 = paginate(sorted, 1, 50);
    const p2 = paginate(sorted, 2, 50);
    const p3 = paginate(sorted, 3, 50);
    expect(p1.items).toHaveLength(50);
    expect(p2.items).toHaveLength(50);
    expect(p3.items).toHaveLength(5);
    expect(p1.total).toBe(105);
    expect(p3.hasNext).toBe(false);
    expect(p2.hasNext).toBe(true);
    // 第 2 頁銜接第 1 頁末筆之後，無重複/遺漏
    const ids = [...p1.items, ...p2.items, ...p3.items].map((d) => d.id);
    expect(new Set(ids).size).toBe(105);
    expect(ids).toEqual(sorted.map((d) => d.id));
  });
});
