---
type: implementation-log
feature_id: F023
feature_name: 稽核軌跡記錄
status: partial
last_updated: 2026-07-23
---

# F023: 稽核軌跡記錄 — Implementation Log

> worktree: `feature/audit-F023-F024`（icsop-audit）· unit-only（無 migration/DB 執行）

## 範圍與定案（authoritative，覆蓋 spec 草案文字）

- **D. AuditWriter 共用契約（lock this）**——見下方「最終簽章」。下游 F005/F007/F012/F020/F034/F037/F038 依此逐字整合。
- **E. 不可竄改**：`AuditStore` 介面**結構上不暴露**任何 update/delete/remove（App 層第一道防線，以型別/單測驗）；DB 層 `REVOKE UPDATE/DELETE` 為第二道（`[integration]`，migration 內落地、本輪未執行）。
- **F. 空條件非阻斷**：查詢空條件套用近 30 天預設（見 F024），不硬擋 `QUERY_CONDITION_REQUIRED`。
- **watermarkSnapshot＝條件必填**（型別 optional；僅浮水印動作攜帶）。`targetId` 依 targetType 必填卻缺漏 → **`AUDIT_TARGET_REF_REQUIRED`**（覆蓋 test-spec 暫定名 `AUDIT_TARGET_FIELD_REQUIRED`）。

## Test Results Summary

| Scenario | 說明 | 測試檔 | 狀態 |
|----------|------|--------|------|
| TS-F023-001 | VIEW → 1 筆、欄位正確、source 預設 DIRECT | audit-event.spec / audit-writer.service.spec | PASS |
| TS-F023-002 | DOWNLOAD/PRINT 各自獨立、唯一 id | audit-event.spec | PASS |
| TS-F023-003 | watermarkSnapshot 逐字保存 | audit-event.spec | PASS |
| TS-F023-004 | USAGE_FORM → formId、documentId/lifecycleId null | audit-event.spec | PASS |
| TS-F023-005 | targetType 條件必填 → AUDIT_TARGET_REF_REQUIRED | audit-event.spec / audit-writer.service.spec | PASS |
| TS-F023-006 | 短時間重複 3 次 → 3 筆不去重 | audit-writer.service.spec | PASS |
| TS-F023-007 | Outbox 暫時失敗 → recordAccess 仍 resolve | audit-writer.service.spec | PASS |
| TS-F023-008 | Outbox 持續失敗 → 不中斷主流程 | audit-writer.service.spec | PASS |
| TS-F023-009 | 補償重試成功 → 搬遷至 AuditStore、outbox 清空 | audit-writer.service.spec | PASS |
| TS-F023-010 | 部分失敗 → 成功搬遷/失敗留存、整批不外拋 | audit-writer.service.spec | PASS |
| TS-F023-011 | 冪等：同 outbox id 不重複補寫 | audit-writer.service.spec | PASS |
| TS-F023-012 | 不可竄改（App 層）store 無 update/delete/remove/save | audit-writer.service.spec | PASS |
| TS-F023-016 | targetType 全集（5 種）皆可寫入 | audit-event.spec | PASS |
| TS-F023-013 | DB 層 REVOKE 拒 UPDATE/DELETE | — | **[integration] DEFERRED** |
| TS-F023-014 | 保留策略：無刪除路徑（≥3 年） | — | **[integration] DEFERRED**（程式/schema 審查：無 DELETE 路徑、無 TTL） |
| TS-F023-015 | 查詢索引存在性 | — | **[integration] DEFERRED**（migration 已建 5 索引，待實跑驗證） |

補償重試排程另附 `scheduled-audit-retry.service.spec`（委派 + 吞例外，比照 scheduled-org-sync）。
本模組單測合計 **51 passed**（backend 全量 375 passed / 37 suites，無回歸）。

## Files Changed

| 路徑 | 類型 | 說明 |
|------|------|------|
| backend/src/audit/audit.types.ts | new | 共用契約：AuditAccessEvent 聯集、AuditRow、AuditWriter/AuditStore/AuditOutboxStore 介面、錯誤類、DI symbols |
| backend/src/audit/audit-event.ts | new | 純轉換 buildAuditRow（驗證+對映+UUID+預設） |
| backend/src/audit/audit-writer.service.ts | new | AuditWriterService：recordAccess/processOutboxRetry/queryHistory |
| backend/src/audit/access-history-filter.ts | new | 純查詢邏輯（F024 共用；F023 queryHistory 委派） |
| backend/src/audit/typeorm-audit.store.ts | new | AUDIT_LOG store（append-only，無 update/delete） |
| backend/src/audit/typeorm-audit-outbox.store.ts | new | Outbox store（enqueue/listPending/markDone） |
| backend/src/audit/scheduled-audit-retry.service.ts | new | @Cron 每 5 分鐘補償重試包裝 |
| backend/src/audit/audit.module.ts | new | 模組裝配（匯出 AuditWriterService 供下游注入） |
| backend/src/database/entities/audit-log.entity.ts | new | AUDIT_LOG entity（datetime2、nvarchar(max) 浮水印、5 索引） |
| backend/src/database/entities/audit-outbox.entity.ts | new | AUDIT_LOG_OUTBOX entity（內部暫存表） |
| backend/src/database/migrations/1721952000000-audit-log.ts | new | 建表+索引+**REVOKE UPDATE/DELETE**（**未執行**） |
| backend/src/app.module.ts | modified | 匯入 AuditModule |
| backend/src/audit/*.spec.ts | new | 4 個單測檔（event/writer/filter/scheduled-retry） |

## 最終 AuditWriter / AuditAccessEvent 簽章（下游 worktree 逐字整合）

```typescript
interface AuditWriter {
  recordAccess(event: AuditAccessEvent): Promise<void>;
  queryHistory(scope: AuditQueryScope, filters: AuditQueryFilters): Promise<Page<AuditRow>>;
  processOutboxRetry(): Promise<void>;
}

// 以 targetType 判別之聯集；共用欄位（actorId/actorName?/employeeNo?/company?/department?/
// section?/roleCode?/targetId/targetNumber?/targetName?/watermarkSnapshot?/occurredAt/source?）
// targetId＝依 targetType 必填之對象參照（DOCUMENT/DOCUMENT_CHANGE_LOG→documentId；
// LIFECYCLE/LIFECYCLE_CHANGE_LOG→lifecycleId；USAGE_FORM→formId）。缺漏→AUDIT_TARGET_REF_REQUIRED。
type AuditAccessEvent =
  | { targetType:'DOCUMENT';             actionType:'VIEW'|'DOWNLOAD'|'PRINT'; /* +base */ }
  | { targetType:'USAGE_FORM';           actionType:'VIEW'|'DOWNLOAD'|'PRINT'; /* +base */ }
  | { targetType:'LIFECYCLE';            actionType:'LIFECYCLE_VIEW'|'LIFECYCLE_DOWNLOAD'|'LIFECYCLE_PRINT'; /* +base */ }
  | { targetType:'DOCUMENT_CHANGE_LOG';  actionType:'CHANGE_LOG_VIEW'; /* +base */ }
  | { targetType:'LIFECYCLE_CHANGE_LOG'; actionType:'LIFECYCLE_CHANGELOG_VIEW'|'LIFECYCLE_CHANGELOG_DOWNLOAD'; /* +base */ };
```

呼叫端最小用法：`writer.recordAccess({ targetType:'DOCUMENT', actionType:'VIEW', actorId, targetId:documentId, targetNumber:documentNumber, watermarkSnapshot, occurredAt })`。

## 架構決策（spec 邊界內）

- **queryHistory 分工**（開放問題#6）：store 僅 `listAll(scope)` 忠實載回；篩選/排序/分頁/近 30 天預設落在純函式 `resolveAuditQuery`（可測、不測 fake）。**正式版效能**（下推 WHERE/ORDER/OFFSET）為 `[integration]`（NFR-001，TS-F024-017）。
- **AUDIT_IMMUTABLE 觸發點**（開放問題#2）：採路線 (c)——`AuditStore` 結構性不暴露 update/delete，`AUDIT_IMMUTABLE` 錯誤碼僅存在於文件；未建陷阱路由。App 層 AC5 以型別/單測驗（TS-012），DB 層 REVOKE 為權威第二防線。
- **Outbox 冪等鍵**＝`AuditRow.id`（＝outbox id）；`append` 先查後插，重複 id no-op（§5.6）。

## Blocking / Spec-doc changes needed（唯讀，僅回報）

1. **error-handling.md**：新增錯誤碼 `AUDIT_TARGET_REF_REQUIRED`（400，targetType 條件必填之對象參照缺漏）。已在本模組實作，需 architect 補正式碼值。
2. **data-model.md AUDIT_LOG**：
   - `watermarkSnapshot` 必填規則應改為**條件必填**（浮水印動作系列必填；`*_CHANGE_LOG` 之 `*_VIEW`/`*_DOWNLOAD` 得為 null）——與 F024 Main Flow 步驟5「無浮水印之動作類型該欄留空」一致（見 F024-test 開放問題#2）。
   - `USAGE_FORM` 之 `documentId` 目前列為條件必填；本實作依 **TS-F023-004**（documentId=null、僅記 formId）落地，與 data-model line 318 牴觸，需 architect 裁定（測試優先，已 flag）。
   - 新增顯示用欄位 `targetName`（對象名稱/說明快照，供 F024 明細「對象名稱／說明」）——目前 schema 無此欄；或改由 F024 join ICSOP_DOCUMENT/LIFECYCLE 取名。本實作以 `targetName` 快照落地。
3. **AUDIT_LOG_OUTBOX schema**（data-model 標「非對外實體」未列 schema）：本輪落地 `(id, payload, status, attempts, createdAt)`，需 architect 追認欄位/重試上限/死信策略（開放問題#3）。
