/** 循環資料存取邊界（F007）。 */
export const LIFECYCLE_STORE = Symbol('LIFECYCLE_STORE');

export type LifecycleStatus = 'active' | 'inactive';

export interface LifecycleView {
  id: string;
  name: string;
  description: string | null;
  status: LifecycleStatus;
  nodeCount: number;
  updatedAt: Date;
}

export interface CreateLifecycleInput {
  name: string;
  description: string | null;
}

export interface UpdateLifecyclePatch {
  name?: string;
  description?: string | null;
  status?: LifecycleStatus;
}

export interface LifecycleStore {
  list(): Promise<LifecycleView[]>;
  findById(id: string): Promise<LifecycleView | null>;
  create(input: CreateLifecycleInput): Promise<LifecycleView>;
  update(id: string, patch: UpdateLifecyclePatch): Promise<LifecycleView>;
  /** 該循環仍掛載之文件數（刪除保護，OQ-E03-03）。ICSOP_DOCUMENT 未建時回 0。 */
  countMountedDocuments(id: string): Promise<number>;
  /** 刪除循環（含其節點/連線）。 */
  delete(id: string): Promise<void>;
}
