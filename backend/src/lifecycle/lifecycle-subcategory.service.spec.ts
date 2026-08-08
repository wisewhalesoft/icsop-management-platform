/**
 * F040 循環子分類 — 服務層約束環（後端，含副作用斷言）
 *
 * 權威來源：docs/specs/features/F040-lifecycle-subcategory.md（AC-03、AC-07～AC-20）
 *           docs/specs/features/F007-lifecycle-pool-crud.md（AC-S1～AC-S7）
 *           docs/specs/error-handling.md#lifecycle-subcategory（固定驗證順序、HTTP 語意）
 *           prototypes/10-lifecycle-list.html（submitLc）
 *
 * 每個錯誤案例除斷言錯誤碼字串外，另斷言 HTTP 狀態（400／409）與**池筆數不變**，
 * 避免「只丟例外但已寫入」之假綠。
 */
import { HttpException } from '@nestjs/common';
import { LifecycleService } from './lifecycle.service';
import {
  CreateLifecycleInput,
  LifecycleStore,
  LifecycleView,
  UpdateLifecyclePatch,
} from './lifecycle.store';

class FakeStore implements LifecycleStore {
  seq = 1;
  rows: LifecycleView[] = [];
  docCounts: Record<string, number> = {};
  deleted: string[] = [];
  /** 實際落到 store 之建立輸入（用於斷言「未寫入」）。 */
  created: CreateLifecycleInput[] = [];
  updated: { id: string; patch: UpdateLifecyclePatch }[] = [];

  seed(over: Partial<LifecycleView>): LifecycleView {
    const r: LifecycleView = {
      id: `lc-${this.seq++}`,
      name: '循環',
      subcategory: null,
      description: null,
      status: 'active',
      nodeCount: 0,
      updatedAt: new Date('2026-07-21T00:00:00Z'),
      ...over,
    };
    this.rows.push(r);
    return r;
  }
  list(): Promise<LifecycleView[]> {
    return Promise.resolve(this.rows);
  }
  findById(id: string): Promise<LifecycleView | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  create(input: CreateLifecycleInput): Promise<LifecycleView> {
    this.created.push(input);
    return Promise.resolve(this.seed({ ...input }));
  }
  update(id: string, patch: UpdateLifecyclePatch): Promise<LifecycleView> {
    this.updated.push({ id, patch });
    const r = this.rows.find((x) => x.id === id)!;
    Object.assign(r, patch, { updatedAt: new Date('2026-08-07T09:00:00Z') });
    return Promise.resolve(r);
  }
  countMountedDocuments(id: string): Promise<number> {
    return Promise.resolve(this.docCounts[id] ?? 0);
  }
  countMountedByLifecycle(): Promise<Map<string, number>> {
    return Promise.resolve(new Map(Object.entries(this.docCounts)));
  }
  delete(id: string): Promise<void> {
    this.deleted.push(id);
    this.rows = this.rows.filter((r) => r.id !== id);
    return Promise.resolve();
  }
}

/** 取出被拋出之錯誤，供逐項斷言（碼字串 ＋ HTTP 狀態）。 */
async function catchError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (e) {
    return e;
  }
  throw new Error('預期應拋出錯誤，但呼叫成功結束');
}

/** 斷言：拋出之錯誤同時滿足「錯誤碼字串」與「HTTP 狀態」。 */
function expectHttpError(err: unknown, code: string, status: number): void {
  expect(err).toBeInstanceOf(HttpException);
  expect((err as HttpException).message).toContain(code);
  expect((err as HttpException).getStatus()).toBe(status);
}

describe('LifecycleService — F040 建立之唯一性（AC-03、AC-07～AC-14、AC-20）', () => {
  let store: FakeStore;
  let svc: LifecycleService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new LifecycleService(store);
  });

  it('AC-03 名稱與子分類於持久化前 trim；未填子分類 → 落地 null（非空字串）', async () => {
    const lc = await svc.createLifecycle({
      name: '  銷售及收款循環  ',
      subcategory: '   ',
      description: null,
    });
    expect(lc.name).toBe('銷售及收款循環');
    expect(lc.subcategory).toBeNull();
    expect(store.created[0].subcategory).toBeNull();
    expect(store.created[0].subcategory).not.toBe('');
  });

  it('F007 AC-S2 子分類 `"  消金  "` → 落地 `"消金"`', async () => {
    const lc = await svc.createLifecycle({
      name: '銷售及收款循環',
      subcategory: '  消金  ',
      description: null,
    });
    expect(lc.subcategory).toBe('消金');
  });

  it('AC-07 池為空 → 建立 A(∅) 成功並配發 id', async () => {
    const lc = await svc.createLifecycle({ name: 'A', subcategory: null, description: null });
    expect(lc.id).toMatch(/^lc-/);
    expect(lc.subcategory).toBeNull();
    expect(store.rows).toHaveLength(1);
  });

  it('AC-08 池為 { A(∅) } → 再建 A(∅) 回 409 LIFECYCLE_DUPLICATE，池筆數不變', async () => {
    store.seed({ name: 'A', subcategory: null });
    const err = await catchError(() =>
      svc.createLifecycle({ name: 'A', subcategory: null, description: null }),
    );
    expectHttpError(err, 'LIFECYCLE_DUPLICATE', 409);
    expect(store.rows).toHaveLength(1);
    expect(store.created).toHaveLength(0);
  });

  it('AC-09 池為 { A(甲) } → 再建 A(甲) 回 409 LIFECYCLE_DUPLICATE，池筆數不變', async () => {
    store.seed({ name: 'A', subcategory: '甲' });
    const err = await catchError(() =>
      svc.createLifecycle({ name: 'A', subcategory: '甲', description: null }),
    );
    expectHttpError(err, 'LIFECYCLE_DUPLICATE', 409);
    expect(store.rows).toHaveLength(1);
    expect(store.created).toHaveLength(0);
  });

  it('AC-10 池為 { A(甲) } → 建立 A(乙) 成功，兩列 id 相異', async () => {
    const first = store.seed({ name: 'A', subcategory: '甲' });
    const second = await svc.createLifecycle({ name: 'A', subcategory: '乙', description: null });
    expect(store.rows).toHaveLength(2);
    expect(second.id).not.toBe(first.id);
  });

  it('AC-11 INV-2 方向一：池為 { A(∅) } → 建立 A(甲) 回 409 SUBCATEGORY_CONFLICT，池筆數不變', async () => {
    store.seed({ name: 'A', subcategory: null });
    const err = await catchError(() =>
      svc.createLifecycle({ name: 'A', subcategory: '甲', description: null }),
    );
    expectHttpError(err, 'LIFECYCLE_SUBCATEGORY_CONFLICT', 409);
    expect(store.rows).toHaveLength(1);
    expect(store.created).toHaveLength(0);
  });

  it('AC-12 INV-2 方向二：池為 { A(甲) } → 建立 A(∅) 回 409 SUBCATEGORY_CONFLICT，池筆數不變', async () => {
    store.seed({ name: 'A', subcategory: '甲' });
    const err = await catchError(() =>
      svc.createLifecycle({ name: 'A', subcategory: null, description: null }),
    );
    expectHttpError(err, 'LIFECYCLE_SUBCATEGORY_CONFLICT', 409);
    expect(store.rows).toHaveLength(1);
    expect(store.created).toHaveLength(0);
  });

  it('AC-13 池為 { A(甲) } → 建立 B(甲) 成功（子分類可跨名稱重複）', async () => {
    store.seed({ name: 'A', subcategory: '甲' });
    await svc.createLifecycle({ name: 'B', subcategory: '甲', description: null });
    expect(store.rows).toHaveLength(2);
  });

  it('AC-14 名稱 trim 後為空且池中已有同組合 → 回 400 LIFECYCLE_NAME_REQUIRED（非 DUPLICATE）', async () => {
    store.seed({ name: '', subcategory: null });
    const err = await catchError(() =>
      svc.createLifecycle({ name: '   ', subcategory: null, description: null }),
    );
    expectHttpError(err, 'LIFECYCLE_NAME_REQUIRED', 400);
    expect((err as HttpException).message).not.toContain('LIFECYCLE_DUPLICATE');
    expect(store.rows).toHaveLength(1);
  });

  it('AC-20 比對涵蓋 inactive 列：池為 { A(甲) status=inactive } → 建立 A(甲) 回 409 DUPLICATE', async () => {
    store.seed({ name: 'A', subcategory: '甲', status: 'inactive' });
    const err = await catchError(() =>
      svc.createLifecycle({ name: 'A', subcategory: '甲', description: null }),
    );
    expectHttpError(err, 'LIFECYCLE_DUPLICATE', 409);
    expect(store.rows).toHaveLength(1);
  });

  it('AC-20 停用列亦參與 INV-2：池為 { A(∅) status=inactive } → 建立 A(甲) 回 409 CONFLICT', async () => {
    store.seed({ name: 'A', subcategory: null, status: 'inactive' });
    const err = await catchError(() =>
      svc.createLifecycle({ name: 'A', subcategory: '甲', description: null }),
    );
    expectHttpError(err, 'LIFECYCLE_SUBCATEGORY_CONFLICT', 409);
    expect(store.rows).toHaveLength(1);
  });
});

describe('LifecycleService — F040 編輯之唯一性（排除自身，AC-15～AC-19）', () => {
  let store: FakeStore;
  let svc: LifecycleService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new LifecycleService(store);
  });

  it('AC-15 僅改 description（未帶 subcategory ＝不修改該欄位）→ 成功、子分類保留、updatedAt 更新', async () => {
    const lc = store.seed({ name: 'A', subcategory: '甲' });
    const before = lc.updatedAt;
    const updated = await svc.updateLifecycle(lc.id, { description: '新說明' });
    expect(updated.description).toBe('新說明');
    expect(updated.subcategory).toBe('甲');
    expect(updated.updatedAt).not.toEqual(before);
  });

  it('AC-16 池為 { A(甲), A(乙) }：將 A(乙) 子分類改為 甲 → 409 DUPLICATE，兩列皆不變', async () => {
    const a = store.seed({ name: 'A', subcategory: '甲' });
    const b = store.seed({ name: 'A', subcategory: '乙' });
    const err = await catchError(() => svc.updateLifecycle(b.id, { subcategory: '甲' }));
    expectHttpError(err, 'LIFECYCLE_DUPLICATE', 409);
    expect(store.updated).toHaveLength(0);
    expect(a.subcategory).toBe('甲');
    expect(b.subcategory).toBe('乙');
  });

  it('AC-17 池為 { A(甲), A(乙) }：將 A(乙) 子分類清空 → 409 SUBCATEGORY_CONFLICT，兩列皆不變', async () => {
    const a = store.seed({ name: 'A', subcategory: '甲' });
    const b = store.seed({ name: 'A', subcategory: '乙' });
    const err = await catchError(() => svc.updateLifecycle(b.id, { subcategory: null }));
    expectHttpError(err, 'LIFECYCLE_SUBCATEGORY_CONFLICT', 409);
    expect(store.updated).toHaveLength(0);
    expect(a.subcategory).toBe('甲');
    expect(b.subcategory).toBe('乙');
  });

  it('AC-18 該名稱僅此一列：清空子分類 → 成功，池為 { A(∅) }', async () => {
    const lc = store.seed({ name: 'A', subcategory: '甲' });
    const updated = await svc.updateLifecycle(lc.id, { subcategory: null });
    expect(updated.subcategory).toBeNull();
    expect(store.rows).toHaveLength(1);
  });

  it('AC-18 清空子分類時傳入空白字串亦收斂為 null（不得落地空字串）', async () => {
    const lc = store.seed({ name: 'A', subcategory: '甲' });
    const updated = await svc.updateLifecycle(lc.id, { subcategory: '   ' });
    expect(updated.subcategory).toBeNull();
  });

  it('AC-19 該名稱僅此一列：補上子分類 甲 → 成功，池為 { A(甲) }', async () => {
    const lc = store.seed({ name: 'A', subcategory: null });
    const updated = await svc.updateLifecycle(lc.id, { subcategory: '甲' });
    expect(updated.subcategory).toBe('甲');
    expect(store.rows).toHaveLength(1);
  });

  it('AC-14 編輯側順序相同：名稱改為空白 → 400 LIFECYCLE_NAME_REQUIRED，未寫入', async () => {
    store.seed({ name: '', subcategory: null });
    const lc = store.seed({ name: 'A', subcategory: '甲' });
    const err = await catchError(() => svc.updateLifecycle(lc.id, { name: '  ' }));
    expectHttpError(err, 'LIFECYCLE_NAME_REQUIRED', 400);
    expect(store.updated).toHaveLength(0);
  });
});

describe('LifecycleService — F040 AC-32／F007 AC-S7 向後相容（全池 subcategory = null）', () => {
  let store: FakeStore;
  let svc: LifecycleService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new LifecycleService(store);
  });

  it('全池皆無子分類時，建立不同名稱之循環不受任何新增阻擋', async () => {
    store.seed({ name: '採購及付款循環', subcategory: null });
    store.seed({ name: '薪工循環', subcategory: null });
    const lc = await svc.createLifecycle({ name: '融資循環', subcategory: null, description: null });
    expect(lc.subcategory).toBeNull();
    expect(store.rows).toHaveLength(3);
  });

  it('建立時完全未提供 subcategory 欄位（既有呼叫形狀）→ 仍成功且落地 null', async () => {
    const lc = await svc.createLifecycle({ name: '融資循環', description: null });
    expect(lc.subcategory).toBeNull();
  });

  it('既有「名稱必填」行為不變：名稱空白 → LIFECYCLE_NAME_REQUIRED', async () => {
    const err = await catchError(() => svc.createLifecycle({ name: '  ', description: null }));
    expectHttpError(err, 'LIFECYCLE_NAME_REQUIRED', 400);
  });
});
