import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  LifecycleChangePublisher,
  LifecycleChangedEvent,
} from '../lifecycle/lifecycle-change-event';
import {
  LIFECYCLE_CHANGE_LOG_STORE,
  LifecycleChangeLogRow,
  LifecycleChangeLogStore,
} from './lifecycle-change-log.store';

/** 循環結構變更事件 → append-only 落地列之純轉換（F038）。 */
export function buildLifecycleChangeLogRow(
  event: LifecycleChangedEvent,
): LifecycleChangeLogRow {
  return {
    id: randomUUID(),
    lifecycleId: event.lifecycleId,
    changeType: event.changeType,
    summary: event.summary,
    oldValue: event.oldValue ?? null,
    newValue: event.newValue ?? null,
    nodeId: event.nodeId ?? null,
    actorId: event.actorId ?? null,
    actorName: event.actorName ?? null,
    actorEmployeeNo: event.actorEmployeeNo ?? null,
    occurredAt: event.occurredAt,
    // 循序（非交易）路徑不產生快照 → snapshotId 為 null；原子路徑（recordStructuralChange）另行覆寫。
    snapshotId: null,
  };
}

/**
 * F038 真實結構變更事件消費者。lifecycle.module 併回後以此覆寫 LIFECYCLE_CHANGE_PUBLISHER 綁定。
 * 將 DagService/NodeDocsService 發出之事件持久化為 LIFECYCLE_CHANGE_LOG。append-only。
 */
@Injectable()
export class LifecycleChangeLogPublisher implements LifecycleChangePublisher {
  constructor(
    @Inject(LIFECYCLE_CHANGE_LOG_STORE)
    private readonly store: LifecycleChangeLogStore,
  ) {}

  async publish(event: LifecycleChangedEvent): Promise<void> {
    await this.store.append(buildLifecycleChangeLogRow(event));
  }
}
