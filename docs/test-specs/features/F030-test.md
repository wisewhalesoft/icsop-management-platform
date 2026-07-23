---
type: test-design-feature
feature_id: F030
feature_name: 改版重抽與重建索引、舊版排除
priority: P0-MVP
related_spec: docs/specs/features/F030-reindex-version-status.md
last_updated: 2026-07-23
status: draft
---

# F030 — 改版重抽與重建索引、舊版排除 · Test Design
> source: docs/specs/features/F030-reindex-version-status.md · worktree: rag (F028-F031) · 2026-07-23

## 測試策略（unit 用「觸發介面」fake caller＋F028/F029 collaborator 替身；真實 F011/F012 接線＝[integration]，且**目前無法達成**，見策略前言）

### 核心設計缺口：F030 如何在不緊耦合 `documents.service.ts` 的前提下接收改版事件

本 worktree 之依賴文件狀態如下（已於 2026-07-23 查證）：
- **F012（狀態切換）已存在** `backend/src/documents/documents.service.ts` 之 `DocumentsService.setStatus(id, status)`，其目前實作**未呼叫任何索引相關 collaborator**——`store.updateStatus()` 後即返回，無事件發送、無 hook。
- **F011（編輯）完全不存在**（`feature-status.md`：「無 `PATCH :id` 編輯端點、無 `store.update`」），故「內容改版」之其中一個觸發來源在此 worktree 階段**無實體程式碼可依附**。
- worktree-guide 明確要求「**避免直接改 documents.service（減少跨線耦合）**」——`documents.service.ts` 屬另一並行 worktree（doc-edit 線）之擁有範圍，本 worktree 不應修改它。

因此，本測試設計**不假設**任何對 `documents.service.ts` 的直接修改已完成，而是設計並測試一個**獨立於呼叫方的觸發埠（Port）介面**，作為 F011/F012 未來接線的目標契約：

```
interface ReindexTriggerPort {
  onContentRevised(documentId: string, source: 'xls_update' | 'document_edit'): Promise<void>
  onStatusChanged(documentId: string, newStatus: DocumentStatus): Promise<void>
}
```

- **本 worktree 之測試範圍**：`IngestionModule` 對 `ReindexTriggerPort` 兩個方法的**實作邏輯**（收到呼叫後應執行什麼），以及 F027 既有之 `extractionTrigger.enqueue(documentId)` collaborator（`F027-test.md` TS-F027-011 已驗證存在）如何映射至 `onContentRevised(documentId, 'xls_update')`。
- **本 worktree 明確排除**：`documents.service.ts` 的 `setStatus()`／未來 `update()` 是否/如何實際呼叫此 port（此為 doc-edit 線的整合責任，見開放設計問題 OQ-F030-01）。此為**已知、目前無法在本 worktree 內以 `[integration]` 方式驗證的缺口**，非疏漏。
- 所有觸發測試皆以 `FakeReindexCaller`（模擬 F011/F012 之未來呼叫方）直接呼叫 `ReindexTriggerPort` 方法，驗證 `IngestionModule` 側之反應正確，不驗證呼叫方是否存在。

### 其餘測試替身

```
FakeIndexBuilder {
  // 包裝 F028+F029 之完整重跑流程（見 F028-test.md／F029-test.md），記錄呼叫次數與參數供斷言
  rebuild(documentId): Promise<{ status: 'success'|'failed'; newIndexRunId: string; chunkCount?: number; errorStage?: string }>
}

FakeChunkStore（沿用 F029-test.md 定義，新增）{
  swapToNewVersion(documentId, newIndexRunId): Promise<void>   // new-then-swap：新版成功後取代舊版
  updateStatusMetadataOnly(documentId, newStatus): Promise<void>  // 輕量分支：僅改 status，不動 content/indexRunId
  findActiveByDocumentId(documentId): Promise<DocumentChunk[]>   // 僅回傳「當前有效版本」chunk（供驗證舊版已排除）
}

FakeVectorStore.upsertMetadataOnly(chunkIds, payloadPatch): Promise<void>  // F030 輕量分支之向量庫端幂等更新
```

### [integration] 邊界
真實 F011/F012 呼叫 `ReindexTriggerPort`（依 OQ-F030-01 待接線）、真實 F028/F029 全流程重跑、真實跨庫（App MSSQL＋pgvector）new-then-swap 之實際時序與併發安全、`sp_getapplock` 認領互斥之真實 DB 行為。

## Test Scenarios

### 內容改版分支：換 .xls 觸發（AC1）

#### TS-F030-001 換 .xls 觸發內容改版重抽 [unit]
- Given：文件已有一版成功索引（`indexRunId=OLD`, 3 個 chunk）
- When：呼叫 `ReindexTriggerPort.onContentRevised(documentId, 'xls_update')`
- Then：建立新 `INDEX_RUN(triggerType='xls_update', status='running')`；`FakeIndexBuilder.rebuild()` 被呼叫一次
- 對應 AC / 錯誤碼：AC1

#### TS-F030-002 換 .xls 重抽成功後新版取代舊版 [unit]
- Given：TS-F030-001 情境，`rebuild()` 回傳 `status='success'`, `newIndexRunId=NEW`, `chunkCount=4`
- When：重抽完成
- Then：`FakeChunkStore.swapToNewVersion(documentId, NEW)` 被呼叫；`findActiveByDocumentId(documentId)` 之後僅回傳 `indexRunId=NEW` 之 4 個 chunk，`OLD` 版之 3 個 chunk 不再出現於「有效」查詢結果
- 對應 AC / 錯誤碼：AC1, AC2

#### TS-F030-003 建置新版期間（尚未 swap）舊版仍可正常服務檢索 [unit]
- Given：`rebuild()` 尚在執行中（模擬非同步延遲，`swapToNewVersion` 尚未被呼叫）
- When：於此期間查詢 `findActiveByDocumentId(documentId)`
- Then：仍回傳舊版（`OLD`）3 個 chunk（new-then-swap 語意：新版對外不可見直到 swap 完成）
- 對應 AC / 錯誤碼：Postconditions「有效檢索範圍僅含最新有效版本」與「new-then-swap」設計原則（architecture-spec §5.4/§5.7 一致命名）

### 內容改版分支：編輯內容觸發（AC1，同一路徑之另一觸發來源）

#### TS-F030-004 內容編輯觸發改版重抽（`triggerType='document_edit'`） [unit]
- Given：同 TS-F030-001，改以 `onContentRevised(documentId, 'document_edit')` 呼叫
- Then：`INDEX_RUN.triggerType='document_edit'`（與 `xls_update` 分支共用同一 `FakeIndexBuilder.rebuild()` 邏輯，僅 `triggerType` 標記不同，供 F031 呈現觸發來源）
- 對應 AC / 錯誤碼：AC1（Preconditions 列舉之另一觸發來源；F011 尚未存在，見策略前言）

### 狀態切換輕量分支（AC3）

#### TS-F030-005 狀態切換為失效（narrowing）僅更新 chunk status metadata [unit]
- Given：文件目前 `status='active'`，已有索引（3 個 chunk）
- When：呼叫 `onStatusChanged(documentId, 'inactive')`
- Then：`FakeChunkStore.updateStatusMetadataOnly(documentId, 'inactive')` 被呼叫；`FakeIndexBuilder.rebuild()`（F028/F029 重跑）**未被呼叫**（輕量分支不重抽內文）；建立輕量 `INDEX_RUN(triggerType='status_change', stage='chunk')`
- 對應 AC / 錯誤碼：AC3

#### TS-F030-006 狀態切換為作廢（narrowing）同步排除 [unit]
- Given：同上，`onStatusChanged(documentId, 'void')`
- Then：同 TS-F030-005 邏輯（`void` 與 `inactive` 皆屬 narrowing 方向），chunk 立即被排除於「有效」查詢
- 對應 AC / 錯誤碼：AC3 / Edge Case「狀態切為作廢」

#### TS-F030-007 narrowing 方向更新為同步／近同步，呼叫返回前即完成 metadata 更新 [unit]
- Given：TS-F030-005 情境
- When：`onStatusChanged()` 呼叫返回
- Then：**呼叫返回當下**（非之後某個非同步 job 執行後）`findActiveByDocumentId()` 已反映新 `status`（回歸驗證 architecture-spec §4.3/§5.8「narrowing 方向須同步或近同步，不可等待一般排程節奏」之安全關鍵要求）
- 對應 AC / 錯誤碼：NFR-009 AC2（間接）／architecture-spec §5.8 風險#11

#### TS-F030-008 狀態切換之向量庫端 metadata 同步更新（跨庫 narrowing） [unit]
- Given：TS-F030-005 情境，`VECTOR_EMBEDDING` 落於獨立向量庫（pgvector）
- When：`onStatusChanged(documentId, 'inactive')` 執行
- Then：`FakeVectorStore.upsertMetadataOnly(chunkIds, {status:'inactive'})` 亦被呼叫（跨庫 payload 同步，非僅更新 App MSSQL 端），呼應 architecture-spec §4.7「若向量庫為外部服務，須將對應 payload 過濾欄位同步寫入向量庫」
- 對應 AC / 錯誤碼：架構決策（§4.7、§5.7 輕量分支）

### 狀態還原（widening，AC5）

#### TS-F030-009 失效切回有效，chunk 重新納入有效檢索範圍 [unit]
- Given：文件目前 `status='inactive'`（chunk 已被排除）
- When：`onStatusChanged(documentId, 'active')`
- Then：`updateStatusMetadataOnly(documentId, 'active')` 被呼叫；`findActiveByDocumentId()` 再次回傳該文件 chunk；**未**重跑 `FakeIndexBuilder.rebuild()`（無需重抽內文）
- 對應 AC / 錯誤碼：AC5

#### TS-F030-010 widening 方向之時效性要求較寬鬆（不要求同步斷言） [unit]
- Given：TS-F030-009 情境
- Then：本測試**不**斷言「呼叫返回當下立即可見」（widening 方向依 architecture-spec §4.3 僅需「可接受一般非同步節奏」），僅斷言「最終一致」（呼叫完成後某個可觀察時點已生效）——刻意與 TS-F030-007（narrowing 之嚴格同步斷言）形成對照，避免對 widening 施加不必要的實作限制
- 對應 AC / 錯誤碼：architecture-spec §4.3「widening 方向…可接受一般非同步節奏」

### 重抽失敗保留舊版（AC4）

#### TS-F030-011 新版抽取失敗（F028 階段）時保留舊版繼續可用 [unit]
- Given：文件已有舊版索引（3 個 chunk），`rebuild()` 回傳 `status='failed'`, `errorStage='extract'`
- When：`onContentRevised()` 觸發之重抽失敗
- Then：`swapToNewVersion()` **未被呼叫**；`findActiveByDocumentId()` 仍回傳舊版 3 個 chunk（完全不受影響）；`INDEX_RUN` 標記 `status='failed'`, `stage='extract'`, `errorStage='extract'`（`REINDEX_FAILED`）
- 對應 AC / 錯誤碼：AC4 / `REINDEX_FAILED`

#### TS-F030-012 新版索引建立失敗（F029 embed 階段）時保留舊版繼續可用 [unit]
- Given：同上，`rebuild()` 回傳 `errorStage='embed'`
- Then：同 TS-F030-011（保留舊版），`stage='embed'`
- 對應 AC / 錯誤碼：AC4

#### TS-F030-013 重抽失敗後文件不落入「完全無索引」狀態 [unit]
- Given：TS-F030-011 情境
- Then：`findActiveByDocumentId(documentId).length > 0`（明確驗證「非零」，區別於 F029-test.md TS-F029-018「首次建置失敗→完全無索引」之情境——F030 重抽失敗因**有舊版可保留**而結果不同，兩份測試設計刻意對照互斥情境）
- 對應 AC / 錯誤碼：AC4「文件不處於『完全無索引』狀態」／與 F029-test.md TS-F029-018 之情境區分

#### TS-F030-014 「保留舊版」為技術過渡緩衝，重抽成功後舊版立即被取代（非永久保留） [unit]
- Given：TS-F030-011 失敗情境後，管理員手動再次觸發重抽（見 F031-test.md「手動重新索引」），此次成功
- When：重抽成功
- Then：`swapToNewVersion()` 被呼叫，舊版（`OLD`）不再可查詢；驗證「保留舊版」不代表「保留歷史版本供日後回溯」，成功後舊版即被取代（呼應 F030 spec Edge Case「非永久保留舊版，不違反 E04 不保留歷史版本檔之策略」）
- 對應 AC / 錯誤碼：Edge Case（AC4 補述）

### 首次改版無前版本

#### TS-F030-015 文件從未成功索引，首次改版等同 F029 初建 [unit]
- Given：文件無任何舊版 `INDEX_RUN`（首次上傳 .xls 後之首次觸發，或先前皆失敗從未成功過）
- When：`onContentRevised(documentId, 'xls_update')`
- Then：邏輯路徑與「初建」完全相同（`FakeIndexBuilder.rebuild()` 不需區分「初建」vs「改版」，統一走同一介面），無特殊分支
- 對應 AC / 錯誤碼：Alternative Flow「首次改版但先前無索引：等同 F029 初建」

### 觸發介面存在性（本 worktree 核心貢獻）

#### TS-F030-016 `ReindexTriggerPort.onContentRevised` 對未知/不存在文件之防呆 [unit]
- Given：`documentId` 不存在於 `ICSOP_DOCUMENT`
- When：呼叫 `onContentRevised(unknownId, 'xls_update')`
- Then：明確拋出可辨識錯誤（不靜默失敗、不建立孤兒 `INDEX_RUN`）——精確錯誤碼未定案，見開放設計問題 OQ-F030-02
- 對應 AC / 錯誤碼：防呆（spec 未明文，測試設計延伸）

#### TS-F030-017 同一文件短時間內連續觸發兩次內容改版（防重複建置） [unit]
- Given：`onContentRevised(documentId, 'xls_update')` 被連續呼叫 2 次（模擬管理員快速連續操作，或 F027 覆蓋上傳後緊接 F030 又收到編輯事件）
- When：兩次呼叫幾乎同時發生
- Then：**預期行為未在 spec 中定案**——是否應以 `sp_getapplock('ingestion-'+documentId)` 序列化（architecture-spec §5.7 已為 `ingestion-worker` 認領設計此鎖）使第二次等待第一次完成，或直接拒絕第二次請求（回某種「索引建置中」錯誤）？本測試僅標記此為待補情境，暫不斷言具體結果，見開放設計問題 OQ-F030-03
- 對應 AC / 錯誤碼：待定（OQ-F030-03）

#### TS-F030-018 `onStatusChanged` 收到與現況相同之狀態值（no-op 冪等性） [unit]
- Given：文件目前已是 `status='active'`
- When：`onStatusChanged(documentId, 'active')`（重複設為相同狀態）
- Then：應為冪等操作（不報錯、不產生多餘 `INDEX_RUN` 記錄，或產生但無實際 metadata 變化）——具體是否應完全略過建立 `INDEX_RUN` 未定案，暫依「安全冪等、允許重複建立輕量記錄」為保守假設
- 對應 AC / 錯誤碼：防呆（spec 未明文）

### [integration] 佔位場景（本 worktree 不執行，待 OQ-F030-01 接線定案）

#### TS-F030-019 F011/F012 真實呼叫 `ReindexTriggerPort` 端到端 [integration]
- Given：OQ-F030-01 之接線方式定案並實作（`documents.service.ts` 或事件匯流排）
- When：真實執行狀態切換／內容編輯
- Then：F030 邏輯被正確觸發，結果與本檔案 TS-001～010 之替身測試斷言一致（驗證真實接線未偏離介面契約）
- 對應 AC / 錯誤碼：AC1, AC3 / OQ-F030-01

#### TS-F030-020 `sp_getapplock('ingestion-'+documentId)` 真實併發互斥行為 [integration]
- Given：同一文件之兩個重抽請求近乎同時送達 `ingestion-worker`
- When：兩者皆嘗試認領
- Then：僅一方認領成功，另一方等待或安全略過（驗證 architecture-spec §5.7 互斥鎖之真實 DB 行為，回應 OQ-F030-03）
- 對應 AC / 錯誤碼：OQ-F030-03

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 換 .xls 或編輯內容觸發 F028/F029 重跑 | TS-001, TS-004, TS-015 |
| AC2 | 新版索引成功後檢索僅含最新有效版本 | TS-002, TS-003 |
| AC3 | 狀態切換僅更新 status metadata，不重抽 | TS-005～008 |
| AC4 | 重抽失敗保留舊版，不落入完全無索引 | TS-011～014 |
| AC5 | 失效切回有效，重新納入有效檢索（無需重抽） | TS-009, TS-010 |
| 架構決策（narrowing/widening 時效性） | 同步 vs 最終一致之對照 | TS-007, TS-010 |
| 防呆（spec 未明文延伸） | 未知文件/併發觸發/冪等性 | TS-016～018 |

## 開放設計問題

- **OQ-F030-01（`ReindexTriggerPort` 實際接線責任未定案，`[BLOCKING]`，本 feature 最核心之未收斂缺口）**：本測試設計定義並測試了 `IngestionModule` 側之 `ReindexTriggerPort` 介面實作，但**誰、以及何種機制**實際呼叫此介面（`documents.service.ts` 之 `setStatus()`／未來 `update()` 方法內部直接呼叫？抑或改為發送領域事件如 `@nestjs/event-emitter` 之 `DocumentStatusChangedEvent`，由 `IngestionModule` 訂閱？）完全未定案。worktree-guide 建議「先以介面/事件匯流排接、避免直接改 documents.service」，但：
  1. 若採**直接呼叫**（`setStatus()` 內新增 `await this.reindexTrigger.onStatusChanged(id, status)`），需要修改 `documents.service.ts`——這正是 worktree-guide 想避免的跨線耦合，且該檔案屬 doc-edit worktree 擁有範圍，本 worktree 無權變更。
  2. 若採**事件匯流排**（`@nestjs/event-emitter` 或類似），需要 `documents.service.ts` 在 `setStatus()` 成功後 `emit('document.status-changed', {documentId, newStatus})`——**仍然需要修改 `documents.service.ts`** 以加入 emit 呼叫，只是耦合形式從「直接呼叫介面方法」變成「發送事件」，本質上並未消除跨線協調需求，只是降低了耦合的緊密程度（呼叫方不需 import `IngestionModule`，只需 import 一個共用的事件常數）。
  3. 技術棧已定案「不引入訊息中介」（architecture-spec §8.2），若採 in-process 事件匯流排（`EventEmitter2`），需確認其**同步性**是否滿足 narrowing 方向之「同步或近同步」要求（`EventEmitter2` 預設同步觸發監聽器，若監聽器內部邏輯是同步的則可滿足；但若 `IngestionModule` 之 `onStatusChanged` 實作本身內部又丟給非同步佇列處理，則違反 §5.8 之安全關鍵時效要求）。

  **本 worktree 建議**（供 architect 裁定，非定案）：F011/F012 之 worktree 在各自服務方法成功後，同步呼叫一個極輕量、無需 import `IngestionModule` 具體實作的共用介面（如 `ReindexNotifier` token，經 NestJS DI 注入，`IngestionModule` 提供其實作綁定），比「發 domain event 由訂閱端非同步消費」更能滿足 narrowing 同步性要求，且耦合面僅限於一個抽象介面 token，非具體模組。此建議**需與 architecture-spec.md 之後續修訂或下一輪 architect review 確認**，本測試設計之 TS-001～010 對此保持中立（皆以 `FakeReindexCaller` 直接呼叫介面方法模擬，不驗證接線本身）。

- **OQ-F030-02（未知文件觸發之精確錯誤碼未定案）**：TS-F030-016 之防呆情境，spec 全文未定義此邊界（正常業務流程下不應發生，因觸發來源皆從已存在文件的操作而來），是否需要正式錯誤碼或僅內部日誌記錄需與 architect 確認。

- **OQ-F030-03（併發/連續觸發之序列化策略未定案，中風險）**：architecture-spec §5.7 已為 `ingestion-worker` 之 job 認領設計 `sp_getapplock('ingestion-'+documentId)` 互斥鎖，但該鎖保護的是「同一 job 不被多個 worker 重複認領」，並非「同一文件短時間內收到多次觸發事件時，是否應合併/序列化/拒絕重複請求」——這是 `enqueueIndexing()` 呼叫端（`IngestionModule`，非 `ingestion-worker`）的責任，兩者屬管線不同層次。TS-F030-017 標記此為待補情境；建議之預設假設（供未來校準）：連續觸發應**合併為單一待處理 job**（第二次觸發若偵測到已有 `pending`/`running` 之同文件 job，則不重複 INSERT，僅更新既有 job 之 `triggerType`/`enqueuedAt`），而非序列化執行兩次完整重抽（浪費運算、且第一次的結果會被第二次立即覆蓋，無意義）。

- **OQ-F030-04（`DOC_USING_DEPT` 變更未被 F030 spec 列為觸發來源，但 architecture-spec 明確要求同步，範疇缺口）**：architecture-spec.md §4.3 一致性矩陣明確列出「`DOCUMENT_CHUNK.usingDeptIds` ←→ `DOC_USING_DEPT`（widening：新增使用部門）」與其反向 narrowing（移除使用部門）皆須依方向性同步更新 chunk metadata——但 F030 spec 全文（Preconditions／Main Flow／Alternative Flows）僅列舉三種觸發來源（`F027` 換 .xls、`F011` 內容編輯、`F012` 狀態切換），**完全未提及「使用部門變更」（F014，制定組織/使用部門編輯，非本 worktree 範圍）作為第四種觸發來源**。若使用部門異動（如某文件新增/移除一個使用部門）不觸發任何 chunk metadata 更新，`DOCUMENT_CHUNK.usingDeptIds` 將與 `DOC_USING_DEPT` 逐漸飄移不同步，narrowing 方向（移除使用部門後仍可被該部門使用者檢索到）將構成實質的 NFR-009 安全違規。**此為 F030 spec 本身之範疇缺口**，非本測試設計可獨自解決——建議：(1) 更新 F030 spec 之 Preconditions／Main Flow，將「使用部門變更（F014）」正式列為第四種觸發來源，比照狀態切換走同一輕量分支（僅更新 `usingDeptIds` metadata，不重抽內文）；(2) `ReindexTriggerPort` 介面應相應擴充 `onUsingDeptChanged(documentId, newUsingDeptIds)` 方法。本測試設計之 Test Scenarios **未包含**此觸發來源的測試（因 spec 未定義），待 spec 補上後應立即補充對應 TS，列為本 feature 之已知遺留缺口。
