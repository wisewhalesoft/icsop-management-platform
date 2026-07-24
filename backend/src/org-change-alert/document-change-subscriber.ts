import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentChangePublisher,
  DocumentChangedEvent,
} from '../documents/document-change-event';
import { FieldKey } from '../rbac/field-matrix';
import { OrgChangeAlertService } from './org-change-alert.service';

/**
 * 文件 DTO 屬性 → F026 欄位鍵（＝ORG_CHANGE_ALERT.affectedField 之值域）。
 *
 * ⚠ `secondaryChiefIds`／`usingDeptIds` 一併納入：F014 編輯端多值持久化到位後
 * （doc-seams 軌：`DocumentsService.update()` 不再於 diff 前剔除此二欄），其變更事件即會抵達，
 * Route A 屆時自動涵蓋此二類提示，無需再改本檔（刻意不針對現況行為做任何暫時性繞道）。
 */
export const FIELD_KEY_BY_PROP: Readonly<Record<string, string>> = {
  draftingCompanyId: FieldKey.ESTABLISH_COMPANY,
  draftingDeptId: FieldKey.ESTABLISH_DEPT,
  draftingSectionId: FieldKey.ESTABLISH_SECTION,
  primaryChiefId: FieldKey.CHIEF_PRIMARY,
  secondaryChiefIds: FieldKey.CHIEF_SECONDARY,
  usingDeptIds: FieldKey.USING_DEPTS,
};

/** 自變更事件抽出可對映之 FieldKey（去重、保序）。純函式。 */
export function affectedFieldsFromEvent(event: DocumentChangedEvent): string[] {
  const out: string[] = [];
  for (const c of event.changes ?? []) {
    const key = FIELD_KEY_BY_PROP[c.field];
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Route A：F011/F014 儲存欄位變更 → 自動解除對應之 pending 提示（AC4「管理員更新欄位」）。
 * 以 `DocumentChangePublisher` seam 訂閱，不經 resolve HTTP 端點。
 *
 * ⚠ 非阻斷：任何失敗僅記 log，不上拋至 `DocumentsService.update()`（提示解除不得使文件儲存失敗）。
 */
@Injectable()
export class OrgChangeAlertAutoResolveSubscriber implements DocumentChangePublisher {
  private readonly logger = new Logger(OrgChangeAlertAutoResolveSubscriber.name);

  constructor(private readonly svc: OrgChangeAlertService) {}

  async publish(event: DocumentChangedEvent): Promise<void> {
    const affectedFields = affectedFieldsFromEvent(event);
    if (affectedFields.length === 0) return;
    try {
      await this.svc.autoResolveFromDocumentChange({
        documentId: event.documentId,
        affectedFields,
        actor: {
          accountId: event.actorId ?? null,
          name: event.actorName ?? null,
          employeeNo: event.actorEmployeeNo ?? null,
        },
        occurredAt: event.occurredAt,
      });
    } catch (e) {
      this.logger.error(
        `組織異動提示自動解除失敗（已吞，不阻斷文件儲存）document=${event.documentId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}
