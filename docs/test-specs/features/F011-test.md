---
type: test-design-feature
feature_id: F011
feature_name: 編輯 ICSOP 文件與版本對照
priority: P0-MVP
related_spec: docs/specs/features/F011-edit-with-comparison.md
last_updated: 2026-07-23
status: draft
---

# F011 — 編輯 ICSOP 文件與版本對照 · Test Design
> source: docs/specs/features/F011-edit-with-comparison.md · worktree: doc-edit · 2026-07-22

## 範圍聲明（列已被現有 *.spec 覆蓋、不重設之基線）

F011 於 `feature-status.md` 標記**完全未做**（⬜）：無 `PATCH /admin/documents/:id`、無 `DocumentStore.update()`、無編輯頁、無新舊值對照、無編輯側編號唯一性排除自身之可達路徑。本檔為新起點設計，但下列**相鄰**邏輯已由既有測試覆蓋，本檔不重新設計、直接依賴：

- `backend/src/documents/document-rules.spec.ts`：`isNumberAvailable(documentNumber, holders, selfId)` 純函式已含 **selfId 排除自身**案例（`'編輯排除自身：維持原值不視為衝突'`）。F011 的 `update()` 只需**正確呼叫**此既有純函式並傳入 `selfId=id`，不重新設計判定邏輯本身。
- `backend/src/documents/document-field-write.spec.ts`：`classifyFields`/`canWriteField` 之角色×欄位純判定（WRITABLE/IGNORE/FORBIDDEN 三值）已逐欄覆蓋，本檔不重新設計該判定表，僅設計 F011 端點如何**使用**其結果（含下述 nodeId 特例，見「開放設計問題」）。
- `backend/src/documents/documents.service.spec.ts`：`create()`（F010/F026/F013 建立側）、`setStatus()`（F012）、`listDocuments()`（F017 基礎）已覆蓋，非本檔範圍。
- `backend/src/documents/document-status.spec.ts`、`display-status.spec.ts`：狀態純函式已覆蓋。

本檔聚焦：`DocumentsService.update()`（新方法）＋ `DocumentsController` 之 `PATCH :id`（新路由）之串接邏輯、對照顯示所需之單筆讀取、cancel 語意（前端）、UUID 不變、不留歷史、node 唯讀＋跳畫布、編輯側編號唯一性排除自身的**端到端**可達性、以及編輯路徑的 DB 併發衝突映射（與 F013 共用，交叉引用該檔）。

## 測試策略（unit＝假 store；需真 DB＝[integration] 序列化暫不自動化）

- **unit**：延伸 `documents.service.spec.ts` 之 `FakeStore` 風格，新增 `update(id, patch): Promise<DocumentView>`（`DocumentStore` 介面目前僅有 `updateStatus`，無通用 `update`，此為 F011 必要之介面擴充，非測試設計本身之發明——供 tdd-developer 參考起點）。`FakeStore.update` 直接覆寫 `this.docs` 對應列並回傳新值，供斷言「覆蓋、UUID 不變、不留歷史陣列」。
- 併發衝突之「service 端錯誤映射邏輯」以 unit 驗證（mock `store.update` 拋出**形似** TypeORM `QueryFailedError` 之物件），真實 MSSQL filtered unique index 於雙交易下實際觸發之行為標記 `[integration]`（詳見 F013-test.md，本檔僅交叉引用，不重複設計）。
- 前端：`DocumentEditPage`（尚不存在）之元件測試比照 `frontend/src/pages/DocumentCreatePage.tsx` 與其測試風格（vitest + RTL），mock 尚待新增之 `getDocument(id)`／`updateDocument(id, body)` endpoints。
- **[integration]**：真實 DB 之併發（見 F013-test.md TS-F013-004/005）、AuditWriter／變更歷程實際落地（依 OQ-F011-04 定案後才可設計，本檔暫列骨架）。

## Test Scenarios

### 讀取與對照顯示

#### TS-F011-001 開啟編輯頁載入既有文件供對照 [unit]
- Given：文件已存在（`id=d1`，任意角色可讀）
- When：編輯頁呼叫單筆讀取（介面形狀待 OQ-F011-01 定案，暫以 `getDocument(id)` 表示）
- Then：回傳之值即為目前值，供前端每個可編輯欄位並列「目前值」與初始「新值」（新值＝目前值副本）
- 對應 AC / 錯誤碼：AC1

#### TS-F011-002 讀取不存在之文件 id → DOCUMENT_NOT_FOUND [unit]
- Given：`id` 不存在
- When：呼叫單筆讀取
- Then：回 404 `DOCUMENT_NOT_FOUND`（比照既有 `setStatus` 之 not-found 慣例）
- 對應 AC / 錯誤碼：`DOCUMENT_NOT_FOUND`（既有慣例延伸，非原 AC 逐字）

### 儲存＝覆蓋、不留歷史、UUID 不變

#### TS-F011-003 ICSOPAdmin 修改可寫欄位並送出 → 以新值覆蓋 [unit]
- Given：ICSOPAdmin、文件 `id=d1` 現值 `documentName='舊名'`
- When：`svc.update('ICSOPAdmin', 'd1', { documentName: '新名' })`
- Then：`store.update` 被呼叫一次，`d1.documentName` 更新為 `'新名'`；回傳值 `id` 仍為 `'d1'`
- 對應 AC / 錯誤碼：AC2

#### TS-F011-004 送出 payload 含 `id` → 忽略、不覆蓋路徑參數之 UUID [unit]
- Given：ICSOPAdmin、payload 內含 `id: 'attacker-supplied'`
- When：呼叫 `update('ICSOPAdmin', 'd1', { id: 'attacker-supplied', documentName: '新名' })`
- Then：`id` 被靜默忽略（比照 `create()` 對系統 UUID 之既有慣例，`classifyFields` 之 `SYSTEM_GENERATED`→IGNORE）；實際更新之列仍為路徑參數 `'d1'`，UUID 未被改變
- 對應 AC / 錯誤碼：AC2「UUID 不變」／既有 `FIELD_KEY_BY_PROP.id → SYSTEM_UUID`（IGNORE）規則延伸

#### TS-F011-005 更新不產生任何歷史/版本副本 [unit]
- Given：ICSOPAdmin、文件已存在
- When：連續 2 次修改並送出（`documentName` 改兩次）
- Then：`store.update` 被呼叫 2 次、`store.create` 未被額外呼叫；`FakeStore.docs` 中僅有 1 筆對應 `d1` 的記錄，無歷史陣列或第二筆記錄產生
- 對應 AC / 錯誤碼：AC2「不留歷史」／Postconditions

#### TS-F011-006 修改版次送出後，後續清單查詢反映新版次、UUID 不變 [unit]
- Given：文件 `edition="26'01"`
- When：`update(..., { edition: "26'02" })` 後呼叫 `listDocuments({})`
- Then：清單項目中 `id` 仍為原 UUID、`edition` 為 `"26'02"`
- 對應 AC / 錯誤碼：AC4

### 唯讀欄位／欄位面 enforcement

#### TS-F011-007 非 ICSOPAdmin 呼叫 update → FIELD_WRITE_FORBIDDEN [unit]
- Given：`roleCode='Supervisor'`
- When：`update('Supervisor', 'd1', { documentName: '新名' })`
- Then：拒絕，回 403 `FIELD_WRITE_FORBIDDEN`；`store.update` 未被呼叫、原資料不受影響
- 對應 AC / 錯誤碼：Error Scenarios / `FIELD_WRITE_FORBIDDEN`（F026）

#### TS-F011-008 payload 含系統 UUID 以外之唯讀欄位（如非 ICSOPAdmin 之場景已由 TS-007 涵蓋；此處驗證 ICSOPAdmin 對 `nodeId` 之特例） [unit]
- Given：ICSOPAdmin、payload 含 `nodeId: 'other-node'`
- When：呼叫 `update`
- Then：**依 OQ-F011-02 定案前無法斷言精確結果**——見「開放設計問題」。本場景暫以「不得使 `store.update` 實際寫入變更後的 `nodeId`」為唯一可確定之斷言（不論走 IGNORE 靜默忽略或 FORBIDDEN 阻擋兩條候選路徑之何者，`nodeId` 皆不應被本端點改變）
- 對應 AC / 錯誤碼：Alternative Flows「所屬節點唯讀顯示」／F026「所屬節點…僅經 F009 節點抽屜」

### 取消／離開不污染（前端）

#### TS-F011-009 修改後點擊取消 → 未呼叫更新端點、欄位回復原值 [unit-前端]
- Given：編輯頁已載入 `documentName='原名'`，使用者輸入為 `'草稿名'`
- When：點擊「取消」
- Then：`updateDocument` 未被呼叫；畫面欄位顯示回復為 `'原名'`（非殘留 `'草稿名'`）
- 對應 AC / 錯誤碼：AC3

#### TS-F011-010 修改後離開頁面未送出、重新進入編輯頁 → 顯示編輯前原值 [unit-前端]
- Given：使用者修改欄位但未點儲存即導航離開，再重新進入同一文件編輯頁
- When：編輯頁重新掛載並重新呼叫單筆讀取
- Then：欄位顯示之「目前值」與「新值」初始皆為伺服器端原值（草稿為前端局部 state，未曾送出，伺服器資料未變，重新讀取自然拿回原值）
- 對應 AC / 錯誤碼：Edge Cases「取消編輯或離開頁面」

### 編輯側編號唯一性排除自身（F013 端到端串接）

#### TS-F011-011 編輯未變更編號（維持原值）送出 → 不視為衝突 [unit]
- Given：文件 `id=d1, documentNumber='N-100', status='active'`；`store.holders` 含 `{id:'d1', documentNumber:'N-100', status:'active'}`（自身）
- When：`update('ICSOPAdmin', 'd1', { documentNumber: 'N-100' })`（未變更）
- Then：成功；`isNumberAvailable('N-100', holders, 'd1')` 排除自身後判定可用
- 對應 AC / 錯誤碼：AC「編輯未變更編號…不視為衝突」

#### TS-F011-012 編輯改為他筆「有效」已用編號 → 阻擋 [unit]
- Given：`store.holders` 含 `{id:'other', documentNumber:'N-200', status:'active'}`
- When：`update('ICSOPAdmin', 'd1', { documentNumber: 'N-200' })`
- Then：拒絕，回 409 `DOCUMENT_NUMBER_DUPLICATE`；`store.update` 未被呼叫、`d1` 原編號不變
- 對應 AC / 錯誤碼：F011 AC「修改後編號違反唯一性…阻擋，原資料不受影響」／F013

#### TS-F011-013 編輯改為他筆「作廢」已用編號 → 阻擋（作廢仍佔用） [unit]
- Given：`holders` 含 `{id:'other', documentNumber:'N-300', status:'void'}`
- When：`update('ICSOPAdmin', 'd1', { documentNumber: 'N-300' })`
- Then：拒絕，回 409 `DOCUMENT_NUMBER_DUPLICATE`
- 對應 AC / 錯誤碼：F013 AC「作廢仍佔用」

#### TS-F011-014 編輯改為僅被「失效」文件占用之編號 → 允許 [unit]
- Given：`holders` 含 `{id:'other', documentNumber:'N-400', status:'inactive'}`
- When：`update('ICSOPAdmin', 'd1', { documentNumber: 'N-400' })`
- Then：成功；`d1.documentNumber` 更新為 `'N-400'`
- 對應 AC / 錯誤碼：F013 AC「失效編號釋出可重用」

#### TS-F011-015 併發：兩筆編輯同時改為同一新編號 → service 層錯誤映射 [unit]
- Given：`store.update` 於第二次呼叫時模擬拋出**形似**驅動層唯一鍵違反之錯誤物件
- When：`update('ICSOPAdmin', 'd1', { documentNumber: 'N-500' })`
- Then：service 攔截並映射為 409 `DOCUMENT_NUMBER_DUPLICATE`（不洩漏原始 DB 錯誤訊息）；精確判斷式與真實 DB 之驗證見 **F013-test.md TS-F013-002/004**（交叉引用，本檔不重複設計）
- 對應 AC / 錯誤碼：F013 Edge Cases「併發：兩位管理員同時編輯…僅一筆成功」

### 所屬節點：唯讀顯示＋跳畫布

#### TS-F011-016 編輯頁載入時「所屬節點」為唯讀顯示 [unit-前端]
- Given：文件 `nodeId` 非 null，對應節點名稱可解析（或至少可顯示 `nodeId`／占位）
- When：編輯頁渲染
- Then：所屬節點欄位以唯讀元件呈現（非可編輯 input/select），旁有「前往畫布改派」之連結/按鈕
- 對應 AC / 錯誤碼：Alternative Flows

#### TS-F011-017 點擊「前往畫布改派」→ 導向 DAG 畫布並帶入所屬循環/節點定位 [unit-前端]
- Given：同上
- When：點擊該按鈕
- Then：觸發導覽（新分頁或路由跳轉）至 DAG 畫布頁面，附帶足以定位該節點之參數（循環代碼／節點 id，介面形狀待前端路由定案）
- 對應 AC / 錯誤碼：Alternative Flows「點擊可跳轉至 DAG 畫布（F009）改派」

#### TS-F011-018 未指派節點（`nodeId=null`）時之唯讀顯示 [unit-前端]
- Given：文件 `nodeId=null`
- When：編輯頁渲染
- Then：所屬節點欄位顯示「未指派」等空狀態，仍為唯讀（不因空值而變成可編輯）
- 對應 AC / 錯誤碼：Alternative Flows／data-model「可為未指派」

### 必填與非法狀態（編輯側延伸自既有建立側規則）

#### TS-F011-019 編輯將必填欄位清空 → DOCUMENT_REQUIRED_FIELD_MISSING [unit]
- Given：ICSOPAdmin
- When：`update('ICSOPAdmin', 'd1', { documentName: '' })`
- Then：拒絕，回 400 `DOCUMENT_REQUIRED_FIELD_MISSING`；原資料不受影響
- 對應 AC / 錯誤碼：既有 `missingRequired` 規則延伸至編輯路徑（`document-rules.spec.ts` 僅測建立側，本場景驗證同一純函式於 `update()` 亦被呼叫）

#### TS-F011-020 編輯將狀態改為非法值 → DOCUMENT_STATUS_INVALID [unit]
- Given：ICSOPAdmin
- When：`update('ICSOPAdmin', 'd1', { status: 'frozen' })`
- Then：拒絕，回 400 `DOCUMENT_STATUS_INVALID`
- 對應 AC / 錯誤碼：既有 `isValidStatus` 規則延伸至編輯路徑

### 路由層 RBAC 掛載正確性

#### TS-F011-021 `PATCH /admin/documents/:id` 正確掛載 `RequirePermission(ICSOP_DOCUMENT_MANAGEMENT, 'write')` [unit]
- Given：比照 `role-permission.guard.spec.ts` 之 `ctxFor` 手法，改用真實 `DocumentsController.update` handler
- When：以 `Reflector` 讀取該 handler 之 metadata
- Then：`functionKey=ICSOP_DOCUMENT_MANAGEMENT`、`action='write'`（新路由必須正確裝飾，否則會落入無防護或錯誤動作之閘門，此為新端點上線前之最低防線）
- 對應 AC / 錯誤碼：F025／既有 guard 機制之正確套用（非既有測試涵蓋範圍，因該路由本身尚不存在）

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 每個可編輯欄位呈現「目前值/新值」對照 | TS-001, TS-002 |
| AC2 | 送出以新值覆蓋、不留歷史、UUID 不變 | TS-003, TS-004, TS-005 |
| AC3 | 取消或離開，原資料不受影響、欄位回復編輯前狀態 | TS-009, TS-010 |
| AC4 | 修改版次送出後清單顯示新版次、UUID 不變 | TS-006 |
| AC5 | 修改後編號違反唯一性 → 依 F013 阻擋、原資料不變 | TS-012, TS-013, TS-015 |
| Error：`FIELD_WRITE_FORBIDDEN` | 唯讀欄位寫入 | TS-007, TS-008 |
| Error：`DOCUMENT_NUMBER_DUPLICATE` | 編號重複（含併發） | TS-012, TS-013, TS-015 |
| F013 編輯排除自身 | 維持原值不視為衝突／改為釋出編號允許 | TS-011, TS-014 |
| Alternative Flows | 所屬節點唯讀＋跳畫布 | TS-016, TS-017, TS-018 |
| 既有建立側規則延伸 | 必填缺漏／狀態非法 | TS-019, TS-020 |
| 路由防護（gap-derived，非原 spec AC 條文，源自新端點上線前之最低防線） | `PATCH :id` 正確 RBAC 掛載 | TS-021 |

## 開放設計問題（阻擋實作前需定案）

- **OQ-F011-01（阻擋）：是否需要新增 `GET /admin/documents/:id` 單筆讀取端點？** 目前後端僅有清單端點（`GET /admin/documents`）與 `DocumentStore.findById`（服務內部已用於 `setStatus`，未對外暴露）。編輯頁載入對照畫面（AC1）需要單筆文件資料——若採「僅由清單列點擊進入、以路由 state／記憶體傳遞已載入之 `DocumentListItem`」則可不新增端點，但直接以 URL 進入編輯頁（重新整理、分享連結）將無法還原資料。兩者影響前端路由設計與是否需要新 controller 方法，建議新增 `GET :id`（與既有 `findById` 對齊）以支援直接連結，但需 architect 定案。

- **OQ-F011-02（阻擋，重要，證據衝突）：`nodeId` 在編輯端點的處理方式與現有 `field-matrix.ts` 判定矛盾。**
  - 證據 A（`backend/src/rbac/field-matrix.ts` `FIELD_MATRIX[FieldKey.NODE]`）：對 `ICSOPAdmin` 回傳 `'WRITABLE'`，無法區分「透過哪個端點」寫入；若 F011 的 `PATCH :id` 直接複用 `classifyFields`，`nodeId` 會被判定為可寫並實際寫入。
  - 證據 B（`docs/specs/features/F026-role-field-matrix.md` 第 25 列 + 第 4 行註解）：明文「所屬節點…可寫（**僅經 F009 節點抽屜**）」——即 ICSOPAdmin 對此欄位的可寫性**綁定特定入口**，非任意端點皆可寫；`F011-edit-with-comparison.md` 本身亦明寫「所屬節點…**唯讀顯示**…不可進入編輯狀態」。
  - **兩者矛盾**：`field-matrix.ts` 目前的三值模型（WRITABLE/IGNORE/FORBIDDEN）不具備「入口限定」概念，無法單靠 `canWriteField(role, key)` 表達「此角色可寫，但僅限特定端點」。需 architect 決定：(a) 在 F011 端點對 `nodeId` **另立一份白名單**，於 `classifyFields` 分類結果之外強制排除/忽略此鍵（不論其回傳 WRITABLE 與否）；或 (b) 擴充 `FieldWriteOutcome` 為第四值（如 `ENTRY_RESTRICTED`）並由呼叫端傳入目前端點識別碼。此決策同時影響 TS-F011-008 之精確斷言（目前僅能斷言「不生效」，無法斷言確切錯誤碼/靜默忽略）。
  - 品質風險：若未定案即實作，最可能的預設行為（直接複用 `classifyFields`）會**違反 spec 明文之節點唯讀規則**，形成可被 API 直接繞過 UI 限制的安全/資料完整性缺口。

- **OQ-F011-03：`documentNumber` 與 `lifecycleId` 之前綴耦合在編輯路徑是否由後端強制？** `prototypes/15-document-edit.html`（`syncNumberPrefix()`）與既有已實作的 `DocumentCreatePage.tsx`（`cycleCodeOf`）皆顯示：編號格式為 `ICSOP-<循環代碼>-<後段>`，前端在**建立**頁面會依所選循環自動重算前綴。編輯頁若同樣允許修改「所屬循環（循環別）」，變更循環是否應（a）後端自動重算 `documentNumber` 前綴並以重算後之完整編號做唯一性比對，或（b）僅前端 UI 提示、後端仍把 `documentNumber` 視為不透明字串、不做任何自動重算（使用者需自行同步修改後段）？兩者影響 TS-F011-012～015 之 given 條件是否需要額外模擬「連動改變 lifecycleId 導致 documentNumber 隱含變更」的情境，目前本檔僅設計「documentNumber 單獨變更」之案例，尚未涵蓋此耦合情境。

- **OQ-F011-04（阻擋，與 F012 共用，定義於 F012-test.md）：F011 AC「觸發稽核記錄」之落地機制未定。** 現有 `AuditWriter`（F023 D 契約，`backend/src/audit/audit.types.ts`）之 `AuditAccessEvent` 僅涵蓋「調閱」類事件（`VIEW`/`DOWNLOAD`/`PRINT`/`CHANGE_LOG_VIEW`…），**沒有**表達「欄位異動 diff」（誰、何時、改了什麼欄位、新舊值）的 targetType/actionType；真正該落地之處為 `DOCUMENT_CHANGE_LOG`（F037，本 wave 明確排除，`feature-status.md` 標記「無 `DOCUMENT_CHANGE_LOG`；來源交易（F011/F012…）未發變更事件」）。故本 wave 的 `update()` 目前**無法**真正寫入任何可查詢之變更歷程。完整分析與候選方案見 **F012-test.md OQ-F012-01**（主定義處），本檔僅交叉引用；F011 之影響為 AC4「觸發稽核記錄」暫時**不可驗收**，建議標記為已知缺口而非隱性略過。

- **OQ-F011-05（與 F015 共用，定義於 F015-test.md）：「文件連結點」是否併入本端點之 payload（單一 `links: string[]` 陣列欄位隨整批儲存送出），或由 F015 之獨立端點各自即時新增/移除？** `F026-role-field-matrix.md` 對「文件連結點」僅標「可寫」（無入口限定註記，不同於所屬節點），且 prototype 15 的連結點 UI 是嵌在同一編輯頁、隨「儲存」整批送出（非點擊當下即時呼叫 API）。完整分析見 **F015-test.md「開放設計問題」首條**，本檔僅提示此端點之 payload 形狀可能因此決策而需要（或不需要）容納 `links` 鍵。

---

## 🔵 2026-08-16 缺失／變更 delta — 編輯頁返回鈕與版次輸入互動（`AC-D1`～`AC-D9`，lane **L4**）

> 權威＝[F011 §編輯頁返回鈕與版次輸入互動 delta](../../specs/features/F011-edit-with-comparison.md#back-edition-delta)
> ＋ [architecture-spec §10.15 #16（topbar portal 之 inline fallback 盲區）／#17（`aria-label` 之 jsdom 近似）](../../specs/architecture-spec.md#ch10-defect-delta)
> ＋ `prototypes/14-document-create.html`、`prototypes/15-document-edit.html`。
> 本輪約束環為**簡化版**（僅 jest／vitest，無 Playwright fidelity、無 Stryker、無 metric gate）。

### 覆蓋對照表

| AC | 主張 | 測試載體 |
|---|---|---|
| `AC-D1` | topbar 動作區有無障礙名稱 `返回` 之鈕；點擊導向 `/admin/documents`；未送出變更不寫入 | `DocumentEditPage.edition.test.tsx` `TS-F011-D1-001`～`003`。🔴 `001` **提供 `TopbarSlotsContext`**，使 portal 注入路徑實際被執行——§10.15 #16 明示未包 `AppShell` 之元件測試命中的是 inline fallback，**不算驗到 AC 所述位置** |
| `AC-D2` | 擊鍵過程不補零、不截斷（`0` → `"0"`；再 `1` → `"01"`） | 編輯頁 `TS-F011-D2-001`／`002`／`003`（反解回歸）；建立頁鏡射 `DocumentCreatePage.edition.test.tsx` `TS-F010-D2-001`／`002` |
| `AC-D3` | blur 補零至兩位、冪等 | 編輯頁 `TS-F011-D3-001`／`002`；建立頁 `TS-F010-D3-001`／`002`。⚠ **反巧合綠**：兩處皆先斷言 blur **之前**未補零，否則「每次擊鍵即補零」之現行 bug 會使本案假綠 |
| `AC-D4` | blur 時為空 → 維持 `""`，不得為 `"00"` | 編輯頁 `TS-F011-D4-001`；建立頁 `TS-F010-D4-001` |
| `AC-D5` | 長度上限兩位 | 編輯頁 `TS-F011-D5-001`；建立頁 `TS-F010-D5-001` |
| `AC-D6` | 儲存值恆為 `{YY}'{NN}` | 編輯頁 `TS-F011-D6-001`（`updateDocument`）；建立頁 `TS-F010-D6-001`（`createDocument`）＋既有 `DocumentCreatePage.test.tsx`「版次 YY 與 NN 組出 26'01 隨送出」 |
| `AC-D7` ① 行為層 | 兩頁逐案結果相同 | 上列 `AC-D2`～`AC-D6` 之編輯頁／建立頁**成對**案例（編號一一對應：`TS-F011-D#-###` ↔ `TS-F010-D#-###`） |
| `AC-D7` ② 結構層 | 兩頁 import 並渲染**同一** component；專案中無第二份補零／截斷邏輯 | `DocumentEditPage.editionShared.test.tsx` `TS-F011-D7-001`～`005`（原始碼靜態文字斷言，手法比照 §10.15 #1 之 Dockerfile 靜態斷言） |
| `AC-D8` | 🔒 既有儲存語意回歸（UUID 不變、既有端點） | `DocumentEditPage.edition.test.tsx` `TS-F011-D8-001`（**設計上從一開始即綠**） |
| `AC-D9` | 選擇器契約：`aria-label` ＝ `版次年度`／`版次序號`、`maxlength=2`、`inputmode=numeric`、placeholder `YY`／`NN` | 編輯頁 `TS-F011-D9-001`／`002`；建立頁 `TS-F010-D9-001`／`002`（**兩頁同一組值**，`AC-D7` ① 以此為前提） |

### 本輪由 test-generator 釘下之新契約（spec 未規定，供 tdd-implementation 對齊）

| 項目 | 契約 |
|---|---|
| 共用元件路徑 | `frontend/src/components/EditionInput.tsx` 之具名匯出 `EditionInput`（`AC-D7` ② 只要求「同一模組之單一 export」、未指名路徑；本環指定之，可申訴） |
| 建議 props | `{ defaultValue?: string \| null; onChange: (edition: string) => void; disabled?: boolean }`；`defaultValue` **僅作初始值**，🔴 不得於每次 render 自已補零之字串反解（`prototypes/15-document-edit.html:541` 明文：那正是「卡死於 00」之成因） |
| `onChange` 之輸出 | 兩段皆有值時發出 `{YY}'{NN}`（blur 補零後之兩位值），否則 `''` |

### 未涵蓋（本環刻意不做）

- **AC-D1 之「不寫入」在真實導航下之行為**：`TS-F011-D1-003` 以 `updateDocument` 未被呼叫代表「不寫入」，屬前端層事實；「資料庫記錄逐欄與進入編輯頁前相同」需容器內實跑（見 `risks-and-gaps` 乙類）。
- **§10.15 #17**：`aria-label` 之 accessible name 於 jsdom 為近似計算。本環之 AC 皆以**直接 `aria-label`** 滿足（`TS-F011-D9-001` 同時斷言屬性值本身），避免落入 `aria-labelledby` ＋ `title` 之近似邊緣。
