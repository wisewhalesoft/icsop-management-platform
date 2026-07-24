---
type: test-design-feature
covers: [F010, F012, F037]
related_spec:
  - docs/specs/features/F010-create-document.md
  - docs/specs/features/F012-document-status-toggle.md
  - docs/specs/features/F037-document-change-history.md
worktree: doc-changelog (feature/doc-changelog)
priority: P0-MVP（F010／F012）／P1（F037）
last_updated: 2026-07-24
status: draft
---

# doc-changelog 測試設計：文件建立稽核事件 ＋ 狀態切換原因 ＋ 變更歷程交易邊界

> ID 命名慣例：本文件所有新設計案例一律以 `TS-DCL-` 開頭（DCL = doc-changelog），與既有
> `backend/src/documents/documents.service.spec.ts`（`TS-F011-*`／`TS-F012-*`／`TS-B-*`／`TS-C-*`）、
> `backend/src/documents/documents-controller.spec.ts`（`TS-F012-006/007`）之編號**不重疊、不覆寫**，
> 僅以交叉引用註記取代/補強關係。**例外**：TS-F012-008 之「reason 仍不承載」斷言與本次新契約直接矛盾，
> 於 §2.4 明示取代（非交叉引用）。

## 0. 範圍聲明（已被現有測試覆蓋、不重新設計之基線）

以下既有測試已覆蓋，本檔**不重新設計**，僅在必要處交叉引用：

- `backend/src/change-history/document-change-log-publisher.spec.ts`：`buildDocumentChangeLogRows` 之
  CONTENT/STATUS 逐 delta 產生列、無變更不產生列、缺操作者/編號快照落 null；`DocumentChangeLogPublisher.publish`
  之 append 呼叫與空事件不呼叫 append。本檔僅**擴充**此函式（加入 `reason` 傳遞、CREATE changeType 通過性），
  不重寫既有斷言。
- `backend/src/documents/status-reason.spec.ts`：`normalizeReason` 之 trim／空字串／純空白／undefined／null
  正規化規則，逐案例已覆蓋，本檔不重工。
- `backend/src/documents/documents.service.spec.ts`：
  - `describe('DocumentsService.update（F011 編輯＋版本對照＋F013 編輯側編號）')`：CONTENT 事件之欄位層
    before/after diff、操作者/編號快照、無實際變更不落地——本檔不重新設計 F011 側。
  - `describe('DocumentsService.setStatus 切換原因＋STATUS 事件（F012）')` 之 TS-F012-001~004（reason 接受/正規化
    使狀態切換仍成功）、TS-F012-008 之 STATUS 事件基本形狀（documentId/changeType/changedFields/changes/
    actor快照/occurredAt）**除 reason 屬性斷言外**皆保留有效，本檔僅擴充/取代 reason 相關部分（見 §2.4）。
- `backend/src/documents/documents-controller.spec.ts`：`TS-F012-006/007`（controller→`svc.setStatus(id,status,
  reason,actor)` 之 reason／actor 貫穿）、F011 update 貫穿。本檔新增 create() 之等效貫穿測試（現況缺）。
- `backend/src/documents/composite-document-change-publisher.spec.ts`：`CompositeDocumentChangePublisher` 逐
  訂閱者 try/catch、任一訂閱者失敗不影響其他訂閱者、不上拋至呼叫端——此為 §3（同一交易邊界）現況之關鍵佐證，
  本檔交叉引用、不重工。
- `frontend/src/pages/ChangeHistoryPage.test.tsx`：程序書 tab 基本渲染／展開稽核／RBAC 封鎖／循環 tab，本檔僅
  擴充 CREATE 顯示與 reason 顯示兩項新行為。

本檔聚焦三個縫隙（對應任務 A–C）＋前端（D）＋整合測試（E）：

| 縫隙 | 一句話 | 主要異動檔案（生產碼，供 tdd-developer 對照；本檔僅設計測試） |
|---|---|---|
| A | F010 建立稽核事件 | `backend/src/documents/document-change-event.ts`（新純函式＋型別擴充）、`documents.service.ts::create()`、`documents.controller.ts::create()` |
| B | F012 切換原因持久化 | `backend/src/database/migrations/`（新 migration）、`document-change-log.entity.ts`、`document-change-log.store.ts`、`typeorm-document-change-log.store.ts`、`document-change-log-publisher.ts`、`documents.service.ts::setStatus()` |
| C | F037 同一交易邊界 | **架構決策，本檔不預先實作**；見 §3 選項陳列 |
| D | 前端：切換原因 UI＋變更歷程顯示 | `DocumentEditPage.tsx`（prototype 15 對齊）、`ChangeHistoryPage.tsx`、`frontend/src/api/endpoints.ts`／`types.ts` |
| E | 整合測試 | `backend/test/int/changehistory.itest.ts`（擴充，非新檔——已具 DOCUMENT_CHANGE_LOG 專屬清理） |

---

## 1. (A) F010 建立稽核事件 — `changeType='CREATE'`

### 1.1 契約設計

**現況查證**（對照原始碼，非假設）：`DocumentsService.create()` 目前 `return await this.store.create(input);`
後**未呼叫 `this.publisher.publish(...)`**——F010 Main Flow 第 7 步「觸發稽核記錄（建立動作）」完全未實作。
`DocumentsController.create()` 亦未帶入 `actorOf(req)`（對照 `update()`/`setStatus()` 皆已貫穿操作者快照）。

**設計決策：CREATE 事件之 `changes` payload 採「逐欄位 new-value 列」（Option 1），而非「單一無 diff 之
標記列」（Option 2）。理由：**

1. **與既有 schema 零違和、免新增特例**：`DocumentChangeLogRow` 現為「一列＝一欄位之 before/after」模型
   （`field`/`oldValue`/`newValue` 皆單值，非陣列）。「標記列」需要一個 sentinel `field`（如 `'__CREATE__'`）
   佔用該欄位語意，且 `oldValue`/`newValue` 皆為 null 或塞入非欄位值的摘要字串，破壞既有「`field` 為真實
   文件屬性名」之不變量（下游 F026 `FIELD_KEY_BY_PROP` 對映、前端 `fieldLabel()` 皆假設如此）。
2. **與前端既有聚合渲染天然相容**：`ChangeHistoryPage.tsx::groupDoc()` 已將同文件/同操作者/60 秒內事件聚合
   顯示為「N 項欄位變更」；逐欄位列的 CREATE 事件會被此既有邏輯正確聚合為「建立時 N 項欄位」，不需新增
   聚合特例。
3. **可回答「此欄位的值何時首次被設定」**：逐欄位列使 `field` 篩選（既有 `DocumentChangeFilters.field`）
   對建立事件同樣有效，維持查詢語意一致（例："篩選 field=documentName" 應同時查到建立時的初始值與日後編輯
   之異動，而非漏掉建立那一筆）。
4. **代價（已知、非阻擋）**：欄位數多的建立會產生較多列（如 4 必填 + 6 個選填皆填 = 10 列）；但因
   `groupDoc()` 聚合顯示，UI 端不會顯得雜亂，僅 DB 列數增加（可接受，`DOCUMENT_CHANGE_LOG` 本為 append-only
   稽核表，設計上即預期隨使用量增長）。

**新純函式**（放於 `document-change-event.ts`，與既有 `toFieldValueString` 同檔，供獨立單元測試）：

```
buildCreateChangeDeltas(fields: Record<string, unknown>): DocumentFieldDelta[]
```

- 逐 `Object.entries(fields)`：`null`/`undefined` → 略過（欄位未填，非「變更」）；空陣列（`secondaryChiefIds:
  []`／`usingDeptIds: []`）→ 略過（同語意：「未提供次要室長」不是一個值得記錄的「新值」）；其餘 →
  `{ field: k, oldValue: null, newValue: toFieldValueString(v) }`（重用既有純函式，Date→ISO、陣列→JSON）。
- 純函式、無 IO，呼叫端固定傳入 `create()` 中已正規化完成之 `input`（`CreateDocumentInput`，非原始 payload；
  已排除系統欄位如 UUID，因 `classifyFields` 於更早步驟已將其歸類為 `ignored` 並自 `clean` 剔除）。

**`documents.service.ts::create()` 異動**：

- 新增第三參數 `actor?: DocumentActor`（比照 `update()`/`setStatus()` 既有簽章慣例）。
- 現有 `try { return await this.store.create(input); } catch...` 改為捕捉 `created` 後**不立即 return**，
  於 try/catch 區塊**外**（即 F013 併發保險映射完成後）呼叫 `this.publisher.publish({ documentId: created.id,
  changeType: 'CREATE', changedFields: Object.keys(input 中非空欄位), changes: buildCreateChangeDeltas(input),
  documentNumber: created.documentNumber, actorId/actorName/actorEmployeeNo: 取自 actor, occurredAt: new
  Date() })`，再回傳 `created`。**publish 呼叫刻意置於 F013 唯一鍵違反映射之後**——建立失敗（重複編號/欄位
  權限）不應產生任何變更事件（比照 `update()`/`setStatus()` 既有「失敗不發事件」慣例）。
- **不**在 try/catch 內包住 `publish()`：`store.create()` 之錯誤映射（409 對應）與 `publish()` 之錯誤處理
  為兩件事；`publish()` 呼叫的是 fan-out 之 `CompositeDocumentChangePublisher`（見 §3），其本身已對每個
  訂閱者做 try/catch 吞錯，`DocumentsService` 層不需重複包裹。

**`DocumentChangedEvent.changeType` 型別**自 `'CONTENT' | 'STATUS' | 'META'` 擴充為
`'CONTENT' | 'STATUS' | 'META' | 'CREATE'`（純 TS 型別擴充；DB 欄位 `changeType varchar(20)` 已容納
`'CREATE'` 6 字元，無需 migration）。

**`documents.controller.ts::create()` 異動**：新增 `@Req() req: RequestWithSession` 參數，呼叫
`this.svc.create(req.sessionUser?.roleCode, body ?? {}, actorOf(req))`（`actorOf` 已存在，直接重用）。

**⚠ 回歸風險（fan-out 副作用）**：`DOCUMENT_CHANGE_PUBLISHER` 現綁定為 `CompositeDocumentChangePublisher(
[DocumentChangeLogPublisher, OrgChangeAlertAutoResolveSubscriber])`（`documents.module.ts`）。
`OrgChangeAlertAutoResolveSubscriber.publish()` 不依 `changeType` 過濾，僅依 `event.changes[].field` 是否命中
`FIELD_KEY_BY_PROP`（`draftingCompanyId`／`draftingDeptId`／`draftingSectionId`／`primaryChiefId`／
`secondaryChiefIds`／`usingDeptIds`）決定是否呼叫 `autoResolveFromDocumentChange`。**本次新增 CREATE 事件若
於建立時填了任一制定組織/室長欄位，該事件會抵達此訂閱者**。經查 `autoResolveFromDocumentChange()` 內部以
`store.findPendingByDocument(documentId)` 查詢——**剛建立的文件不可能有指向它的既存 `ORG_CHANGE_ALERT` 列**
（提示只在既存文件之組織參照因上游同步變成過期後才產生），故此路徑必為安全 no-op；仍需一則回歸測試鎖定
此結論（見 TS-DCL-A-012），避免未來變更悄悄破壞此假設。

### 1.2 測試案例（unit — 新純函式，`backend/src/documents/document-change-event.spec.ts`；**若無此檔則新建**，
比照既有 `toFieldValueString` 未獨立成檔之情況，亦可併入既有 `documents.service.spec.ts` 頂部；下方以獨立
檔案為預設建議）

#### TS-DCL-A-001 4 必填皆有值 → 各自一列，`oldValue` 皆為 null
- **Given**：`{ lifecycleId:'lc1', status:'active', documentNumber:'N-1', documentName:'車輛分期進件作業' }`
- **When**：`buildCreateChangeDeltas(fields)`
- **Then**：回傳陣列長度 4；每列 `oldValue===null`；`newValue` 分別為 `'lc1'`/`'active'`/`'N-1'`/`'車輛分期進件作業'`
- **AC**：F010 Main Flow 第 7 步（gap-derived，原 spec 無逐字 AC，來源為 Main Flow 條文本身）
- **檔案**：`backend/src/documents/document-change-event.spec.ts`

#### TS-DCL-A-002 選填欄位為 `null`/`undefined` → 略過、不產生列
- **Given**：4 必填 + `draftingCompanyId: null, primaryChiefId: undefined`
- **When**：`buildCreateChangeDeltas(fields)`
- **Then**：回傳陣列長度仍為 4（不含 `draftingCompanyId`/`primaryChiefId`）
- **AC**：§1.1 契約設計「略過未填欄位」（gap-derived）
- **檔案**：同上

#### TS-DCL-A-003 `secondaryChiefIds`/`usingDeptIds` 為空陣列 → 略過、不產生噪音列
- **Given**：4 必填 + `secondaryChiefIds: [], usingDeptIds: []`
- **When**：`buildCreateChangeDeltas(fields)`
- **Then**：回傳陣列長度仍為 4
- **AC**：§1.1「空陣列＝未提供，非新值」（gap-derived，防噪音設計）
- **檔案**：同上

#### TS-DCL-A-004 `secondaryChiefIds` 非空陣列 → JSON 字串化落為 `newValue`
- **Given**：4 必填 + `secondaryChiefIds: ['20053', '20541']`
- **When**：`buildCreateChangeDeltas(fields)`
- **Then**：含一列 `{ field:'secondaryChiefIds', oldValue:null, newValue:'["20053","20541"]' }`
- **AC**：重用 `toFieldValueString` 既有陣列 JSON 化規則（回歸防護）
- **檔案**：同上

#### TS-DCL-A-005 `announcedDate`（Date 型別）→ ISO 字串化
- **Given**：4 必填 + `announcedDate: new Date('2026-01-01T00:00:00Z')`
- **When**：`buildCreateChangeDeltas(fields)`
- **Then**：含一列 `{ field:'announcedDate', oldValue:null, newValue:'2026-01-01T00:00:00.000Z' }`
- **AC**：重用 `toFieldValueString` 既有 Date→ISO 規則（回歸防護）
- **檔案**：同上

### 1.3 測試案例（unit — `DocumentsService.create` 整合，`backend/src/documents/documents.service.spec.ts`，
新增 `describe('DocumentsService.create 建立稽核事件（A）')`，注入 `FakePublisher`）

#### TS-DCL-A-006 建立成功 → 發出 `changeType='CREATE'` 事件，`documentId` 為新建 UUID
- **Given**：`store = new FakeStore()`、`pub = new FakePublisher()`、`svc = new DocumentsService(store, pub)`
- **When**：`const doc = await svc.create('ICSOPAdmin', { ...CORE }, { accountId:'acc-1', name:'李慧玲',
  employeeNo:'20233' })`
- **Then**：`pub.events` 長度 1；`pub.events[0].documentId === doc.id`；`changeType === 'CREATE'`；
  `documentNumber === doc.documentNumber`；`actorId==='acc-1'`／`actorName==='李慧玲'`／`actorEmployeeNo==='20233'`；
  `occurredAt instanceof Date`
- **AC**：F010 Main Flow 第 7 步（gap-derived）
- **檔案**：`backend/src/documents/documents.service.spec.ts`

#### TS-DCL-A-007 事件 `changes` 內容與 4 必填一致（與 §1.2 純函式行為一致，服務層整合驗證）
- **Given**：同上，僅送 4 必填（`CORE`，無任何選填）
- **When**：`svc.create('ICSOPAdmin', { ...CORE }, actor)`
- **Then**：`pub.events[0].changes` 長度 4，`expect.arrayContaining([{field:'lifecycleId',oldValue:null,
  newValue:'lc1'}, {field:'status',...}, {field:'documentNumber',...}, {field:'documentName',...}])`（不斷言
  順序，僅斷言集合內容——`Object.entries` 順序非本測試關注點）
- **AC**：同上
- **檔案**：同上

#### TS-DCL-A-008 建立含選填制定組織/室長/使用部門 → 事件涵蓋全部已填欄位
- **Given**：`CORE` + `draftingCompanyId:'org-co', primaryChiefId:'20053', secondaryChiefIds:['20541'],
  usingDeptIds:['A2000']`
- **When**：`svc.create('ICSOPAdmin', payload, actor)`
- **Then**：`pub.events[0].changes` 長度 8（4 必填 + 4 已填選填），含
  `{field:'secondaryChiefIds', newValue:'["20541"]'}`
- **AC**：F014 create-side 之建立稽核延伸（gap-derived）
- **檔案**：同上

#### TS-DCL-A-009 建立失敗（重複編號 409）→ 不發出事件
- **Given**：`holders` 中已存在同編號之有效文件
- **When**：`await expect(svc.create('ICSOPAdmin', {...CORE}, actor)).rejects.toThrow('DOCUMENT_NUMBER_DUPLICATE')`
- **Then**：`pub.events` 長度 0
- **AC**：既有「失敗不發事件」慣例之建立側延伸（gap-derived，回歸防護）
- **檔案**：同上

#### TS-DCL-A-010 建立失敗（`FIELD_WRITE_FORBIDDEN`）→ 不發出事件
- **Given**：`svc.create('Supervisor', { ...CORE, draftingCompanyId:'x' }, actor)`（非 ICSOPAdmin 寫制定組織）
- **When/Then**：拋 `FIELD_WRITE_FORBIDDEN`；`pub.events` 長度 0
- **AC**：同上
- **檔案**：同上

#### TS-DCL-A-011 未提供 `actor`（服務端直呼，無操作者快照）→ 事件 actor 欄皆 null，不拋錯
- **Given**：`svc.create('ICSOPAdmin', { ...CORE })`（省略第三參數）
- **When/Then**：建立成功；`pub.events[0].actorId===null`／`actorName===null`／`actorEmployeeNo===null`
- **AC**：向下相容防護（gap-derived，比照 `update()`/`setStatus()` 既有選填 actor 慣例）
- **檔案**：同上

#### TS-DCL-A-012（回歸防護，fan-out 安全性）建立事件抵達 `OrgChangeAlertAutoResolveSubscriber` → 安全 no-op
- **Given**：以真實 `CompositeDocumentChangePublisher([DocumentChangeLogPublisher(fakeLogStore),
  OrgChangeAlertAutoResolveSubscriber(fakeAlertSvc)])` 組裝（比照 `composite-document-change-publisher.spec.ts`
  既有組裝手法）、`svc = new DocumentsService(store, composite)`；建立含 `draftingCompanyId` 之文件
- **When**：`svc.create('ICSOPAdmin', { ...CORE, draftingCompanyId:'org-co' })`
- **Then**：`fakeAlertSvc.autoResolveFromDocumentChange` 若被呼叫，因 `findPendingByDocument(新documentId)`
  必為空陣列（文件剛建立，不可能有既存提示參照它）→ 不拋錯、不解除任何列；`fakeLogStore` 正確收到 CREATE
  之 append 列
- **AC**：gap-derived（cross-cutting fan-out 回歸防護，防止未來變更誤判 CREATE 為「編輯」而產生非預期副作用）
- **檔案**：同上（或獨立 `backend/src/documents/create-event-fanout.spec.ts`，視 tdd-developer 偏好）

### 1.4 測試案例（unit — controller 貫穿，`backend/src/documents/documents-controller.spec.ts`，
擴充既有 `describe('DocumentsController body 貫穿')`）

#### TS-DCL-A-013 `ctrl.create(req, body)` → `svc.create(roleCode, body, actor)` 參數正確貫穿
- **Given**：`svc.create = jest.fn()`；`req.sessionUser = { roleCode:'ICSOPAdmin', accountId:'acc-1',
  name:'李慧玲', employeeNo:'20233' }`
- **When**：`ctrl.create(req, { ...CORE })`
- **Then**：`svc.create` 以 `('ICSOPAdmin', { ...CORE }, { accountId:'acc-1', name:'李慧玲',
  employeeNo:'20233' })` 被呼叫（比照既有 `update()`/`setStatus()` 貫穿測試手法）
- **AC**：gap-derived（controller-service 契約回歸防護）
- **檔案**：`backend/src/documents/documents-controller.spec.ts`

### 1.5 整合測試（`[integration]`，見 §5 之 TS-DCL-E-001~003、TS-DCL-E-007）

---

## 2. (B) F012 切換原因持久化 — `reason` 欄位貫穿

### 2.1 現況與待取代測試

**現況查證**：`documents.service.ts::setStatus()` 已接收 `reason` 參數並呼叫 `normalizeReason(reason)`，但
結果以 `void normalizeReason(reason);` **丟棄**——原因被接收、正規化，卻無任何持久化去處。既有測試
`documents.service.spec.ts` 之 `TS-F012-008` 明確斷言 `expect(pub.events[0]).not.toHaveProperty('reason')`，
逐字編碼此「尚無持久化 sink」之舊契約，**本檔設計取代之**（非交叉引用；行為將反轉為「reason 應出現在事件
上」）。`DOCUMENT_CHANGE_LOG` 資料表（migration `1722643200000-document-change-log.ts`）目前**無 `reason`
欄位**，`DocumentChangeLogRow`／`DocumentChangeLog` entity／`buildDocumentChangeLogRows` 亦然。

### 2.2 契約設計

**新 migration**（下一保留時間戳 `1722988800000`，避開既有最高值 `1722902400000`；檔名建議
`1722988800000-document-change-log-reason.ts`）：

```sql
ALTER TABLE [DOCUMENT_CHANGE_LOG] ADD [reason] nvarchar(500) NULL;
```

- `nvarchar(500)`：spec 與 prototype 15（`<input type="text">`，無 `maxlength` 屬性）皆未定義長度上限；
  比照同表既有 `documentNumber varchar(100)`／`actorName nvarchar(30)` 之量級選一個保守但夠用的值（見
  §6 開放問題「reason 長度上限未經 spec 定義」，非阻擋）。
- `down()`：`ALTER TABLE [DOCUMENT_CHANGE_LOG] DROP COLUMN [reason]`。
- 不影響既有 `REVOKE UPDATE, DELETE` 授權（表層授權不因新增欄位而失效，ADD COLUMN 不需重新 REVOKE）。

**`document-change-log.entity.ts`**：新增 `@Column({ type: 'nvarchar', length: 500, nullable: true }) reason!:
string | null;`

**`document-change-log.store.ts`**：`DocumentChangeLogRow` 新增 `reason: string | null`。

**`typeorm-document-change-log.store.ts`**：`toRow()` 新增 `reason: e.reason`；`append()` 之 `insert()` 因
直接 spread rows 物件，無需額外異動（新增鍵會自動落地，前提是呼叫端已帶入該鍵）。

**`document-change-event.ts`**：`DocumentChangedEvent` 新增 `reason?: string | null`（事件層級、非逐 delta；
語意上僅 `changeType==='STATUS'` 時有意義，其餘 changeType 恆為 `undefined`）。

**`document-change-log-publisher.ts::buildDocumentChangeLogRows()`**：`rows` 之 `map()` 新增
`reason: event.reason ?? null`（套用至該事件產生之**所有**列——STATUS 事件現況恆為 1 列，故 1:1 對應；
CONTENT/CREATE 事件之 `event.reason` 恆為 `undefined` → 落 `null`，防禦性、不影響現有行為）。

**`documents.service.ts::setStatus()`**：移除 `void normalizeReason(reason);` 之丟棄寫法，改為
`const normalizedReason = normalizeReason(reason);`，並於 `publisher.publish({...})` 呼叫中加入
`reason: normalizedReason ?? null`。

**⚠ 邊界（既有邏輯自然涵蓋，非新增分支）**：狀態未實際改變時（`oldStatus === status`），`deltas` 為
`[]` → `buildDocumentChangeLogRows` 回傳 `[]`（既有測試「無欄位變更事件 → 不呼叫 append」已鎖定此行為）
→ 縱使填了 `reason`，因無列可承載，該次 reason 隨之被捨棄、不落地。此與 F037 Edge Case「開啟編輯頁但未
實際變更任何欄位即儲存：不產生任何變更日誌」同一哲學延伸，設計為**預期行為**而非缺陷，見 TS-DCL-B-007
明確鎖定。

### 2.3 測試案例（unit — 純函式擴充，`backend/src/change-history/document-change-log-publisher.spec.ts`，
新增案例、不修改既有既存案例）

#### TS-DCL-B-001 STATUS 事件含 `reason` → 產生列之 `reason` 正確落地
- **Given**：`{ documentId:'doc-2', changeType:'STATUS', changes:[{field:'status',oldValue:'active',
  newValue:'void'}], reason:'依法規更新', occurredAt: at, documentNumber:'N-9' }`
- **When**：`buildDocumentChangeLogRows(event)`
- **Then**：`rows[0].reason === '依法規更新'`
- **AC**：F012 AC「原因隨該次狀態變更事件一併記錄於變更歷程」（逐字對應）
- **檔案**：`backend/src/change-history/document-change-log-publisher.spec.ts`

#### TS-DCL-B-002 事件未帶 `reason`（`undefined`）→ 產生列之 `reason` 為 `null`
- **Given**：`contentEvent()`（既有 fixture，無 `reason` 屬性）
- **When**：`buildDocumentChangeLogRows(event)`
- **Then**：`rows[0].reason === null`（`rows[1].reason` 亦同）
- **AC**：F012 AC「未填『切換原因』…變更歷程之原因欄留空」（逐字對應，經 CONTENT 事件驗證恆為 null 之防禦分支）
- **檔案**：同上

#### TS-DCL-B-003 STATUS 事件 `reason` 顯式為 `null` → 落地為 `null`（非字串 `'null'`）
- **Given**：STATUS 事件、`reason: null`
- **When**：`buildDocumentChangeLogRows(event)`
- **Then**：`rows[0].reason === null`（型別為 `null`，非 `'null'` 字串）
- **AC**：邊界防護（gap-derived）
- **檔案**：同上

### 2.4 測試案例（unit — `DocumentsService.setStatus` 擴充，`documents.service.spec.ts`，於既有
`describe('DocumentsService.setStatus 切換原因＋STATUS 事件（F012）')` 內新增案例；**取代** TS-F012-008 之
`not.toHaveProperty('reason')` 斷言片段）

#### TS-DCL-B-004（取代 TS-F012-008 之 reason 斷言部分）切換並填原因 → 事件 `reason` 承載正規化後之值
- **Given**：`d = store.seedDoc({ status:'active', documentNumber:'N-9' })`
- **When**：`svc.setStatus(d.id, 'inactive', '  依法規更新  ', { accountId:'acc-1', name:'李慧玲',
  employeeNo:'20233' })`
- **Then**：`pub.events[0].reason === '依法規更新'`（已 trim，重用 `normalizeReason`）；其餘既有斷言
  （`documentId`/`changeType`/`changedFields`/`changes`/`actor*`/`occurredAt`）維持不變
- **AC**：F012 AC「切換狀態時填寫『切換原因』…原因隨該次狀態變更事件一併記錄」（逐字對應）
- **檔案**：`backend/src/documents/documents.service.spec.ts`

#### TS-DCL-B-005 未填原因 → 事件 `reason` 為 `undefined`（未帶鍵，非空字串）
- **Given**：`svc.setStatus(d.id, 'inactive')`（省略 reason 參數）
- **When/Then**：`pub.events[0].reason === undefined`（`normalizeReason(undefined) === undefined`）
- **AC**：F012 AC「未填『切換原因』…切換仍成功，變更歷程之原因欄留空」（逐字對應，事件層級表現）
- **檔案**：同上

#### TS-DCL-B-006 原因為空白字串 → 視同未填（事件 `reason` 為 `undefined`）
- **Given**：`svc.setStatus(d.id, 'inactive', '   ')`
- **When/Then**：`pub.events[0].reason === undefined`
- **AC**：同上（延伸既有 TS-F012-003/004 正規化行為至事件層級）
- **檔案**：同上

#### TS-DCL-B-007（邊界鎖定）狀態未實際改變（送出相同狀態）且填原因 → 不發出任何日誌列（含 reason 隨之捨棄）
- **Given**：`d = store.seedDoc({ status:'active' })`
- **When**：`svc.setStatus(d.id, 'active', '這個原因不會被記錄', actor)`
- **Then**：`pub.events` 長度 1（事件仍發出，比照既有行為），但 `pub.events[0].changes` 為 `[]`；
  經 `buildDocumentChangeLogRows` 轉換後產生 0 列（於 §5 整合測試以真實 DB 驗證「查無此次 reason」，
  此處單元測試僅鎖定 service 層之 `changes` 為空）
- **AC**：F037 Edge Case「未實際變更任何欄位即儲存：不產生任何變更日誌」之狀態切換延伸（gap-derived，
  防止「reason 有填就該被記」之直覺誤判——本設計刻意選擇與既有「無變更不記」哲學一致，見 §2.2 說明；
  **此設計選擇本身非阻擋性但建議產品確認**，見 §6）
- **檔案**：同上

### 2.5 測試案例（frontend/controller 貫穿）— 交叉引用，不重工

`TS-F012-006`/`TS-F012-007`（`documents-controller.spec.ts`）已驗證 controller→`svc.setStatus(id, status,
reason, actor)` 之 reason 貫穿，**本次無需修改**（controller 早已正確傳遞 reason，缺口純粹在 service 層
「收到後丟棄」，已於 §2.4 補上）。

### 2.6 整合測試（`[integration]`，見 §5 之 TS-DCL-E-004~005）

---

## 3. (C) F037「同一交易」邊界 — 選項陳列（🔴 需人類/架構師裁定，本檔不預先實作）

### 3.1 現況查證（非假設，逐項對照原始碼）

1. **文件寫入與事件發布為兩個獨立階段，非同一 DB 交易**：`typeorm-documents.store.ts::create()`／`update()`
   皆以 `ds.transaction(async (m) => {...})` 包住「文件本體 + F014 多值列」；但 `DocumentsService` 呼叫
   `store.create()`/`store.update()`/`store.updateStatus()` **成功返回後**，才另外呼叫
   `this.publisher.publish(...)`——此為第二個、獨立的資料庫寫入（`DocumentChangeLogPublisher.publish()` →
   `store.append()` → `ds.getRepository(DocumentChangeLog).insert(...)`），**不共用**第一階段的交易。
   （本任務新增之 CREATE 事件、reason 持久化，皆沿用此既有兩階段結構，不改變邊界本身。）
2. **失敗容錯現況並非「無保護」，而是已有 fan-out 層級的 best-effort 吞錯**：`DOCUMENT_CHANGE_PUBLISHER`
   實際綁定為 `CompositeDocumentChangePublisher`（`documents.module.ts`），其 `publish()` 對每個訂閱者
   （`DocumentChangeLogPublisher`、`OrgChangeAlertAutoResolveSubscriber`）**逐一 try/catch**，任一訂閱者
   拋錯僅記 log、不上拋至 `DocumentsService`（既有 `composite-document-change-publisher.spec.ts` 已覆蓋）。
   **這代表「若變更日誌寫入失敗，文件寫入仍已成功提交，且 HTTP 回應仍為成功」——即現況事實上已經是
   §3.2 選項 C（Best-effort，非同步／盡力而為）的具體實現，只是沒有 outbox 補償重試機制**（不同於
   `AuditWriterService` 既有替 `CHANGE_LOG_VIEW`（讀取稽核）建置的 Outbox 補償）。

此查證結果直接對應 F037 spec 之殘留條文：「變更日誌寫入與來源交易一致性：變更日誌宜與來源功能…之儲存
交易同步（同一交易或緊接觸發），避免非同步造成不同步——**確切交易邊界屬架構決策（待 system-architect）**」。

### 3.2 選項陳列（trade-off，供裁決；本檔不預先選定）

**選項 1：完全交易化（文件寫入 + 變更日誌寫入同一 DB 交易）**
- 作法：`DocumentStore`／`DocumentChangeLogStore` 介面需擴充為可接受外部 `EntityManager`（或
  `DocumentsService` 改注入 `AppDataSource` 自行開交易，將 store 呼叫與 `publisher.publish()` 皆納入同一
  `ds.transaction(async (m) => {...})`）。
- 保證：文件列與其對應變更日誌列「同進退」——變更日誌永不遺漏一筆已提交的文件異動。
- 成本：`DocumentStore`/`DocumentChangeLogStore`/`DocumentChangePublisher` 三者介面需打通交易上下文
  （目前皆為「各自 `init()` 自己的連線」之獨立介面，無交易穿透機制）；`CompositeDocumentChangePublisher`
  之「訂閱者互不影響」語意與「同一交易」互斥（若 `OrgChangeAlertAutoResolveSubscriber` 拋錯，交易語意下
  應該回滾文件寫入嗎？這會使一個非核心的提示自動解除功能意外擋下文件儲存——**與 F006 spec 既有明文
  「非阻斷、任何失敗僅記 log，不上拋至 DocumentsService.update()」直接衝突**，故選項 1 若採納，範圍應
  僅限 `DocumentChangeLogPublisher` 一個訂閱者納入交易，`OrgChangeAlertAutoResolveSubscriber` 仍維持
  fan-out 外的 best-effort——這使「同一交易」的邊界進一步複雜化，需架構師定義精確範圍）。
- 失敗語意：變更日誌寫入失敗 → 整筆文件建立/編輯/狀態切換**全部回滾**，使用者會看到操作失敗（即使文件
  本體寫入原可成功）。對稽核完整性最嚴格，但可能造成「因附屬子系統故障導致核心操作無法進行」的體感。

**選項 2：兩階段、盡力而為、無補償（維持現況原樣）**
- 作法：不變更現有結構——文件寫入獨立交易提交，之後 `CompositeDocumentChangePublisher` fan-out 呼叫，
  各訂閱者各自 try/catch 吞錯。
- 保證：無（若變更日誌寫入失敗，該筆異動的稽核軌跡永久遺漏，且系統不會有任何重試或告警機制）。
- 成本：零額外實作。風險：**F037 為稽核/合規功能，「稽核軌跡可能無聲遺漏且無從察覺」對稽核可信度是實質
  風險**，宜至少加告警（現況僅 `logger.error`，未接 alert/monitoring）。

**選項 3：兩階段、盡力而為、有補償（比照既有 `AuditWriterService` Outbox 模式）**
- 作法：維持兩階段結構，但 `DocumentChangeLogPublisher.publish()` 寫入失敗時，不僅記 log，另寫入一個
  outbox 佇列（比照 `AUDIT_LOG` 既有 Outbox 機制），由排程重試補寫，直到成功或達重試上限告警。
- 保證：最終一致（eventually consistent）——短暫遺漏可容忍，但不會永久遺漏（除非重試耗盡）。
- 成本：需新增 outbox 資料表/排程（`AuditWriterService` 已有可參考的既有實作模式，非從零設計）；查詢
  `DOCUMENT_CHANGE_LOG` 時可能短暫看不到剛發生的異動（reader 需知悉此最終一致性窗口，F037 spec 目前未
  明文此可接受延遲上限）。

### 3.3 本檔立場：不預先選定，但設計測試以「現況鎖定」+「裁決後參數化」雙軌並行

**現況鎖定測試**（不依賴裁決結果，鎖定「本次改動未意外破壞既有 fan-out 容錯」）：

#### TS-DCL-C-001（現況回歸鎖定）CREATE/STATUS 事件之 `DocumentChangeLogPublisher` 訂閱者拋錯 → 不影響
  `DocumentsService.create()`/`setStatus()` 之回傳，亦不影響其他訂閱者
- **Given**：`composite = new CompositeDocumentChangePublisher([throwingLogPublisher, fakeAlertSub])`
  （`throwingLogPublisher.publish()` 恆拋錯）、`svc = new DocumentsService(store, composite)`
- **When**：`await svc.create('ICSOPAdmin', { ...CORE }, actor)`
- **Then**：不拋錯（`CompositeDocumentChangePublisher` 已吞錯）；回傳值為正常建立之 `DocumentView`；
  `fakeAlertSub.publish` 仍被呼叫（另一訂閱者不受影響）
- **AC**：既有 `composite-document-change-publisher.spec.ts` 精神之 CREATE/STATUS 事件延伸（回歸防護，
  確保本次新增 changeType 不會意外繞過既有容錯層）
- **檔案**：`backend/src/documents/documents.service.spec.ts`（或
  `backend/src/documents/create-event-fanout.spec.ts`，同 TS-DCL-A-012 檔案）

#### TS-DCL-C-002（現況行為存證，非新驗收條件）現況下變更日誌寫入失敗時，文件寫入已提交、無法復原
- 此案例**不設計為可執行的 jest 測項**，而是設計文件對「現況風險」的書面存證：若 §3.2 選項 2（維持現況）
  被採納，`DOCUMENT_CHANGE_LOG` 可能出現「文件確實已建立/編輯/切換，但查無對應變更日誌列」之落差，且
  系統無任何機制偵測此落差。**建議**：若最終選定選項 2，至少應比照 F023 既有 `AuditWriter` 之 outbox
  精神，新增一則「compensating query」（例如比對 `ICSOP_DOCUMENT.updatedAt` 與 `DOCUMENT_CHANGE_LOG`
  最新列時間，兩者長期不同步時告警）——此為**建議**、非本次任務阻擋範圍。

**裁決後參數化測試骨架**（🔴 待選定選項後才可具體化，先列出「若選 X，需新增/修改哪些測試」供 tdd-developer
於裁決當下快速展開）：

- **若選選項 1（完全交易化）**：需新增
  `{ruling:atomic} TS-DCL-C-101 變更日誌寫入拋錯（模擬 store.append 失敗）→ 文件建立/編輯亦一併回滾（DB
  查無該文件列）`；並需**修改**既有「訂閱者拋錯不影響其他訂閱者」之 Composite 測試精神（選項 1 若僅將
  `DocumentChangeLogPublisher` 納入交易、`OrgChangeAlertAutoResolveSubscriber` 仍 fan-out best-effort，
  則需新增測試區分兩種訂閱者的不同失敗語意）。
- **若選選項 3（Outbox 補償）**：需新增
  `{ruling:outbox} TS-DCL-C-102 變更日誌寫入失敗 → 落地至 outbox 佇列` +
  `{ruling:outbox} TS-DCL-C-103 outbox 排程重試成功 → 補寫入 DOCUMENT_CHANGE_LOG，原文件不受影響` +
  `{ruling:outbox} TS-DCL-C-104 outbox 重試達上限 → 告警（比照既有 AuditWriter outbox 之等效機制，若有）`。
- **若選選項 2（維持現況）**：**無需新增測試**（TS-DCL-C-001 已鎖定現況行為），但建議在 `risks-and-gaps`
  性質的文件中正式記錄此已知風險（非本檔範圍——本檔非 test-designer 主產出的 risks-and-gaps.md，而是
  test-index 之延伸；此建議轉呈人類裁定時一併說明）。

---

## 4. (D) 前端 — 切換原因 UI（prototype 15）＋變更歷程顯示（CREATE／reason）

### 4.1 Prototype 對齊查證

**狀態切換控制項唯一歸屬 `prototypes/15-document-edit.html`**（非 `13-document-list.html`——僅顯示唯讀
狀態徽章與篩選；非 `16-document-readonly.html`——僅顯示唯讀狀態徽章，皆無切換控制項）。Prototype 15
markup（§L107-121）確認：
- 狀態控制項為 segmented button（`#statusSeg`，非 `<select>`），三態「有效/失效/作廢」。
- **原因輸入框確實存在**（`#statusReasonWrap` 內 `#statusReason`，`type="text"`，`placeholder="例：內容已過時、
  依法規更新、由新版取代…"`），**且僅於狀態實際變更時才顯示**（`rw.classList.toggle('hidden',!changed)`），
  未變更則隱藏（不佔版面、不誤導使用者以為原因永遠必填）。
- Label 逐字：「切換原因 **（選填）**」；下方提示逐字：「非必填；若填寫將一併記入變更歷程（F037「文件狀態」
  事件）。」
- 切「作廢」時 prototype 有一個額外確認對話框（`openConfirm('切換為「作廢」？'...)`）——**此為既有缺口，
  非本次任務範圍**，見 §6 附帶記錄（非阻擋，供 tdd-developer 選擇是否順手補上）。
- `saveAll()` 儲存成功後 `reasonEl.value=''`（清空原因框）；`cancelAll()` 亦清空。

**現行 React 實作查證**（`frontend/src/pages/DocumentEditPage.tsx`）：
- 已有狀態 segmented 控制項（§L493-517），markup 與 prototype 15 一致。
- **完全沒有原因輸入框**（`grep reason` 於全檔案無任何匹配）——此為本任務要補上的核心 UI 缺口，**方向與
  prototype 一致（原型有此欄位，現行程式碼缺）**，非「新增偏離 prototype 之欄位」。

### 4.2 🔴 架構發現（需與 §3 一併裁定）：狀態切換的「真實呼叫路徑」與後端 F012 專用端點不一致

**現況查證**（非本任務新增之問題，但直接決定 §4.3 測試如何落筆，故獨立標出）：

- 後端存在**專用**端點 `PATCH /admin/documents/:id/status` → `DocumentsService.setStatus()`（F013 切回有效
  重驗編號唯一性、`changeType='STATUS'` 事件）；前端 `frontend/src/api/endpoints.ts::setDocumentStatus(id,
  status)` 對應此端點，**但全專案 `grep -rn "setDocumentStatus" frontend/src/` 除定義外零呼叫點**——此
  API function 目前是死碼。
- 實際上，`DocumentEditPage.tsx::save()` 將 `status` 併入一般欄位 `patch` 物件（`if (changed('status'))
  patch.status = draft.status;`），單一呼叫 `updateDocument(id, patch)` → 後端 `PATCH /admin/documents/:id`
  → `DocumentsService.update()`（`changeType='CONTENT'`，**非** `'STATUS'`）。
- **此路徑差異造成兩個可驗證的行為落差**：
  1. `update()` 之 F013 重驗僅在 `'documentNumber' in clean` 時觸發（§L~294）；`setStatus()` 則是
     `if (status === 'active')` 恆觸發，**與是否同時變更編號無關**。因此：**若使用者僅切換狀態為「有效」
     （未同時改編號），經現行 UI（走 `update()`）不會觸發 F012 AC6「切回有效重驗編號唯一性」——此 AC
     實質上並未被目前唯一的真實呼叫路徑覆蓋**（僅被未使用的 `setStatus()`/專用端點覆蓋）。
  2. 若 reason 依 §2 設計僅接在 `setStatus()` 路徑上，則透過現行 UI 走 `update()` 送出的狀態切換**完全
     無法承載 reason**（因為 `update()` 對 reason 一無所知，`update()` 現行程式碼亦未讀取 `payload.reason`）。

**兩個選項（🔴 需人類裁定，與 §3 之交易邊界問題同源——皆源自「prototype 之單一『儲存』按鈕一次送出整份
表單」與「後端拆成 update()/setStatus() 兩個獨立端點/changeType」之設計張力）**：

- **選項 A（維持雙端點；前端改為條件式雙請求）**：`DocumentEditPage.tsx::save()` 偵測 `changed('status')`
  時，將 `status` 自一般 `patch` 中抽出，改為**額外**呼叫擴充後的 `setDocumentStatus(id, status, reason)`
  （與其他純量欄位的 `updateDocument()` 分開送出，兩次 PATCH）。優點：完整重用既有 `setStatus()` 之 F013
  邏輯與 `changeType='STATUS'` 語意，變更成本侷限於前端＋`setDocumentStatus` API 簽章。缺點：一次「儲存」
  點擊在後端產生**兩個獨立、非原子**的 HTTP 請求——若狀態 PATCH 成功但內容 PATCH 失敗（或反之），使用者
  會看到「部分儲存」的不一致狀態，需額外設計失敗回饋 UX（見 TS-DCL-D-010）。
- **選項 B（收斂為單一端點；`update()` 內建狀態切換語意）**：`update()` 改為：當 `'status' in clean` 且
  新值為 `'active'`，**不論** `documentNumber` 是否同時變更，皆觸發 F013 重驗；並讓 `update()` 之 payload
  接受可選 `reason` 欄位，當 `changedFields` 含 `'status'` 時，於同一次 `publisher.publish()` 呼叫（或改為
  該次操作發出**兩個**事件：其餘欄位一個 `CONTENT` 事件、`status` 一個 `STATUS` 事件，兩者共用同一次
  HTTP 請求與同一個 DB 交易）承載 `reason`。優點：與 prototype/現行 UX（單一「儲存」＝單一原子請求）完全
  一致，不引入部分失敗風險。缺點：`update()` 職責變複雜（一次呼叫可能同時發出兩種 `changeType` 事件）；
  `setStatus()`/`PATCH :id/status` 專用端點形同被架空（是否正式棄用，或保留給未來其他呼叫方，需一併決定）。

**本檔立場**：§4.3 之前端測試**以選項 A 為預設撰寫假設**（因為這是任務指示明確要求的路徑——
「controller → setStatus() → 事件 → DOCUMENT_CHANGE_LOG」——且 §2 之後端契約已針對 `setStatus()` 完整
設計），並於每個依賴此假設的測項標註 `{ruling: endpoint}`；同時在 §4.3 末列出「若改採選項 B，這些測項
的 Given/When/Then 需如何改寫」之對照，供裁決後快速调整，不需整份重寫。

### 4.3 測試案例（unit — `frontend/src/pages/DocumentEditPage.test.tsx`）

#### TS-DCL-D-001 狀態未變更時 → 不顯示原因輸入框（比照 prototype `statusReasonWrap` 預設 hidden）
- **Given**：`mockAuth('ICSOPAdmin')`，頁面載入、未觸碰狀態控制項
- **When**：頁面渲染
- **Then**：`screen.queryByLabelText('切換原因')`（或等效 `queryByPlaceholderText`）為 `null`
- **AC**：F012 spec Main Flow「僅於狀態實際變更時顯示」延伸（gap-derived，prototype 逐字行為）
- **檔案**：`frontend/src/pages/DocumentEditPage.test.tsx`

#### TS-DCL-D-002 點選不同狀態按鈕後 → 顯示原因輸入框，label／placeholder 逐字比照 prototype
- **Given**：同上
- **When**：點擊狀態 segmented 中與現值不同之按鈕（如現值「有效」→ 點「失效」）
- **Then**：出現 label 含「切換原因」與「（選填）」；`placeholder` 含「內容已過時」等 prototype 逐字範例文案
- **AC**：F012 spec「可選填『切換原因』」（逐字對應，prototype 忠實度）
- **檔案**：同上

#### TS-DCL-D-003 選回原狀態（revert）→ 原因輸入框重新隱藏且既有輸入被清空
- **Given**：已切換狀態並填入原因文字
- **When**：再次點擊回到原始狀態值之按鈕
- **Then**：原因輸入框隱藏；若之後再次切換為其他不同狀態，輸入框為空（不殘留先前打過的字）
- **AC**：gap-derived（prototype `paintStatus()` 之 `changed` 判定延伸；避免「殘留原因文字」誤導）
- **檔案**：同上

#### TS-DCL-D-004 `{ruling: endpoint}` 填寫原因並儲存（僅狀態變更，無其他欄位變更）→ 呼叫擴充後之
  `setDocumentStatus(id, status, reason)`
- **Given**：僅切換狀態、填原因「依法規更新」，其餘欄位未變更
- **When**：點擊「儲存」
- **Then**：`setDocumentStatus` 以 `(id, 'inactive', '依法規更新')` 被呼叫；`updateDocument` **不**被呼叫
  （因無其他純量欄位變更，比照現行「`hasScalar` 為 false 則不呼叫 `updateDocument`」之既有邏輯延伸）
- **AC**：§4.2 選項 A 假設下之核心驗收（gap-derived，**若裁定選項 B，改為**：`updateDocument` 以
  `expect.objectContaining({ status:'inactive', reason:'依法規更新' })` 被呼叫，`setDocumentStatus`
  不被呼叫）
- **檔案**：同上

#### TS-DCL-D-005 `{ruling: endpoint}` 未填原因儲存 → `setDocumentStatus(id, status, undefined)` 或不帶
  reason 鍵（依最終 API 簽章設計為準，斷言至少不傳出非 `undefined`/空字串以外的值）
- **Given**：僅切換狀態，原因欄留空
- **When**：儲存
- **Then**：`setDocumentStatus` 呼叫之第三參數為 `undefined`（或省略）
- **AC**：F012 AC「未填『切換原因』…切換仍成功」（逐字對應，前端呼叫層級）
- **檔案**：同上

#### TS-DCL-D-006 儲存成功後 → 原因輸入框清空（比照 prototype `reasonEl.value=''`）
- **Given**：已填原因並成功儲存
- **When**：儲存完成
- **Then**：原因輸入框值為空字串（若欄位因狀態已同步「已儲存＝現值」而重新隱藏，視為滿足此條件的等效
  呈現，即不殘留舊原因文字）
- **AC**：prototype 逐字行為（gap-derived）
- **檔案**：同上

#### TS-DCL-D-007 取消變更（`cancelAll`）→ 原因輸入框清空
- **Given**：已填原因，尚未儲存
- **When**：點擊「取消」
- **Then**：狀態回復原值、原因輸入框清空
- **AC**：prototype 逐字行為（gap-derived）
- **檔案**：同上

#### TS-DCL-D-008 唯讀角色（Supervisor）→ 狀態按鈕 disabled，且不顯示原因輸入框
- **Given**：`mockAuth('Supervisor')`
- **When**：頁面渲染
- **Then**：狀態按鈕 `disabled` 為真（既有行為）；即使程式邏輯上狀態「已變更」亦不顯示原因輸入框（唯讀
  角色不應被引導填寫一個送不出去的欄位）
- **AC**：F026「主管…唯讀」之延伸（gap-derived）
- **檔案**：同上

#### TS-DCL-D-009 `{ruling: endpoint}` 同時變更其他欄位（如書名）與狀態＋原因 → 分別呼叫
  `updateDocument`（不含 status）與 `setDocumentStatus`（含 reason）
- **Given**：修改 `documentName` 且切換狀態、填原因
- **When**：儲存
- **Then**：`updateDocument` 呼叫之 payload **不含** `status` 鍵（已被抽出至另一請求）；`setDocumentStatus`
  另以正確參數被呼叫；兩者皆完成後顯示統一的「已儲存」提示（非兩則分開的 toast，避免使用者誤以為是兩次
  獨立操作）
- **AC**：§4.2 選項 A 假設下之核心驗收（gap-derived，**若裁定選項 B，此測項連同 TS-DCL-D-004 一併改寫為
  單一 `updateDocument` 呼叫涵蓋所有欄位**）
- **檔案**：同上

#### TS-DCL-D-010 `{ruling: endpoint}` 部分失敗：狀態 PATCH 失敗但內容 PATCH 已成功 → 顯示部分成功之錯誤
  訊息，不誤導為「全部失敗」
- **Given**：同 TS-DCL-D-009 情境，`setDocumentStatus` mock 拋出錯誤、`updateDocument` mock 成功
- **When**：儲存
- **Then**：畫面顯示訊息區分「書名已更新，但狀態切換失敗：{錯誤訊息}」或等效之部分成功提示（**具體文案
  待 UI 設計/人類確認，本測項僅斷言不得顯示與現況矛盾的「全部失敗」或「全部成功」訊息**）
- **AC**：§3／§4.2 non-atomicity 之直接後果（gap-derived，**此測項之必要性完全取決於選項 A 是否被採納**——
  若選項 B（單一原子請求），此測項連同其部分失敗語意一併消失，不再需要）
- **檔案**：同上

### 4.4 測試案例（unit — `frontend/src/pages/ChangeHistoryPage.test.tsx`，CREATE 顯示 + reason 顯示）

#### TS-DCL-D-011 `changeType='CREATE'` 事件 → `CHANGE_SOURCE` 顯示「建立」標籤
- **Given**：`getDocumentChanges` mock 回傳含 `changeType:'CREATE', field:'documentName', oldValue:null,
  newValue:'車輛分期進件作業'` 之列
- **When**：程序書 tab 渲染
- **Then**：該筆事件之來源標籤顯示「建立」（需先擴充 `CHANGE_SOURCE` 常數新增 `CREATE: '建立'`，現況缺）
- **AC**：F010 建立稽核之查詢面延伸（gap-derived）
- **檔案**：`frontend/src/pages/ChangeHistoryPage.test.tsx`

#### TS-DCL-D-012 同文件同時間之多筆 CREATE 事件 → 沿用既有 60 秒聚合邏輯顯示「N 項欄位變更」
- **Given**：`getDocumentChanges` mock 回傳同文件同操作者同時刻之 4 筆 `changeType:'CREATE'` 列
  （對應 4 必填欄位）
- **When**：渲染
- **Then**：聚合為一組，摘要文字含「4 項欄位變更」（重用既有 `groupDoc()` 邏輯，不需新增聚合特例，
  回歸防護：本測項驗證此重用確實生效）
- **AC**：§1.1 契約設計理由 2（gap-derived）
- **檔案**：同上

#### TS-DCL-D-013 `changeType='STATUS'` 事件含 `reason` → 額外顯示「切換原因：{reason}」
- **Given**：`getDocumentChanges` mock 回傳 `{ changeType:'STATUS', field:'status', oldValue:'active',
  newValue:'inactive', reason:'依法規更新' }`
- **When**：展開該筆事件（或直接於清單列呈現，視既有 UI 是否需展開，比照現行 before/after 呈現位置）
- **Then**：畫面顯示「切換原因：依法規更新」（需先擴充 `DocumentChangeView` 型別新增 `reason?: string |
  null` 並於渲染處新增此行，**prototype 23 未涵蓋此顯示元素**，見 §6 明確標註為對 prototype 的必要擴增）
- **AC**：F012 AC「原因…可於變更歷程檢視」（逐字對應）
- **檔案**：同上

#### TS-DCL-D-014 `reason` 為 `null`/`undefined`（未填原因之狀態切換）→ 不顯示原因列（非顯示空字串或
  「（空）」）
- **Given**：同上但 `reason: null`
- **When**：渲染
- **Then**：不出現「切換原因：」該行（與其餘 before/after 欄位「無值顯示（空）」之既有慣例刻意不同——
  「未填原因」與「欄位新值為空」語意不同，不應誤用同一套「（空）」文案）
- **AC**：F012 AC「未填…變更歷程之原因欄留空」（逐字對應，UI 呈現面）
- **檔案**：同上

---

## 5. (E) 整合測試（`*.itest.ts`，`backend/test/int/`，`npm run test:int`）

**檔案選擇**：擴充既有 `backend/test/int/changehistory.itest.ts`（**非新檔**）——該檔已具備
`DOCUMENT_CHANGE_LOG` 之 marker 專屬清理（`afterAll` 中 `DELETE FROM [DOCUMENT_CHANGE_LOG] WHERE
[documentNumber] LIKE 'ZZINT-%'`，因該表無 FK 不隨 `harness.ts::cleanupMarkers()` 連動），沿用其既有
lifecycle/marker 設置，不重開檔案（比照 doc-seams 對 `f014.itest.ts` 之擴充慣例）。

### TS-DCL-E-001 建立文件（4 必填 + 部分選填）→ `DOCUMENT_CHANGE_LOG` 落數列 `changeType='CREATE'`
- **Given**：`bootIntApp()`、既有 marker 循環
- **When**：`POST /admin/documents`，`{ lifecycleId, status:'active', documentNumber:num,
  documentName:'ZZINT 建立稽核', contentSummary:'測試摘要', edition:"26'01" }`
- **Then**：狀態 201；直查 `SELECT [field],[oldValue],[newValue],[changeType],[actorId] FROM
  [DOCUMENT_CHANGE_LOG] WHERE [documentId]=@0`：至少 6 列（4 必填 + `contentSummary` + `edition`），
  全部 `changeType='CREATE'`，全部 `oldValue IS NULL`；`documentName` 列之 `newValue='ZZINT 建立稽核'`；
  `actorId` 為建立者（marker 管理員）之 `ACCOUNT.id`
- **AC**：F010 Main Flow 第 7 步（gap-derived），真實 MSSQL 落地驗證（非 unit FakeStore 可驗證之範疇）
- **檔案**：`backend/test/int/changehistory.itest.ts`

### TS-DCL-E-002 建立時僅填 4 必填（無任何選填）→ 僅落 4 列，無空值噪音列
- **Given**：`POST /admin/documents`，僅 `{ lifecycleId, status, documentNumber, documentName }`
- **When**：查 `DOCUMENT_CHANGE_LOG WHERE documentId=@0`
- **Then**：恰好 4 列（`lifecycleId`/`status`/`documentNumber`/`documentName`），無
  `draftingCompanyId`/`primaryChiefId`/`secondaryChiefIds` 等未填欄位之列
- **AC**：§1.1「略過未填欄位」之真實 DB 驗證
- **檔案**：同上

### TS-DCL-E-003 建立事件可經 `GET /admin/change-history/documents?doc=...` 查得
- **Given**：延續 TS-DCL-E-001 建立之文件
- **When**：`GET /admin/change-history/documents?doc={num}`
- **Then**：200；`items` 中含 `changeType==='CREATE'` 且 `field==='documentName'` 之列
- **AC**：F037 AC「顯示與 F024 相同模式之查詢介面…回傳符合之變更事件清單」之 CREATE 事件延伸
- **檔案**：同上

### TS-DCL-E-004 狀態切換（經專用端點，帶 `reason`）→ `reason` 真實落地於 `DOCUMENT_CHANGE_LOG`
- **Given**：延續上述文件（現況 `active`）
- **When**：`PATCH /admin/documents/{id}/status`，`{ status:'inactive', reason:'內容已過時，改用新版' }`
  （**直接呼叫 F012 專用端點**，不透過 DocumentEditPage 前端路徑——後端契約驗證與 §4.2 之前端接線裁決
  脫鉤，確保無論最終前端走哪個選項，此後端契約本身正確）
- **Then**：狀態碼 200/204；直查 `SELECT [field],[oldValue],[newValue],[reason],[changeType] FROM
  [DOCUMENT_CHANGE_LOG] WHERE [documentId]=@0 AND [field]='status' ORDER BY [occurredAt] DESC`：最新一列
  `oldValue='active'`、`newValue='inactive'`、`reason='內容已過時，改用新版'`、`changeType='STATUS'`
- **AC**：F012 AC「原因隨該次狀態變更事件一併記錄於變更歷程（F037）並可於變更歷程檢視」（逐字對應，
  真實 DB 落地）
- **檔案**：同上

### TS-DCL-E-005 狀態切換未帶 `reason` → `DOCUMENT_CHANGE_LOG.reason` 為 `NULL`
- **Given**：同上文件
- **When**：`PATCH /admin/documents/{id}/status`，`{ status:'void' }`（無 reason 鍵）
- **Then**：對應列 `reason IS NULL`
- **AC**：F012 AC「未填『切換原因』…變更歷程之原因欄留空」（逐字對應，真實 DB 落地）
- **檔案**：同上

### TS-DCL-E-006 展開檢視（`GET :documentId`）回應含 `reason` 欄位
- **Given**：延續 TS-DCL-E-004
- **When**：`GET /admin/change-history/documents/{documentId}`
- **Then**：200；`items` 中對應列含 `reason:'內容已過時，改用新版'`（非被端點/DTO 意外過濾掉——現況查證
  `DocumentChangeHistoryService`/`ChangeHistoryController` 皆未做欄位白名單過濾，新增欄位應自動貫穿，
  此測項即為鎖定此「零額外程式碼即可貫穿」之假設）
- **AC**：F037 AC「逐時間新到舊呈現各次變更事件」之 reason 延伸
- **檔案**：同上

### TS-DCL-E-007（回歸防護，fan-out 安全性，真實 DB 驗證 TS-DCL-A-012 之整合層對應）建立文件（含制定
  公司欄位）→ 不誤生成/誤解除任何 `ORG_CHANGE_ALERT` 列
- **Given**：`POST /admin/documents`，`{ ...必填, draftingCompanyId: <既存合法 orgCode> }`
- **When**：查 `SELECT COUNT(*) AS n FROM [ORG_CHANGE_ALERT] WHERE [documentId]=@0`
- **Then**：`n === 0`（建立不應觸發任何提示新增或解除——提示僅由既存文件之組織同步事件觸發，見 F006 spec）
- **AC**：gap-derived（cross-cutting fan-out 真實 DB 回歸防護）
- **檔案**：同上

---

## 6. 已識別但非本任務範圍之附帶發現（供 tdd-developer/人類參考，非阻擋）

1. **prototype 15「切作廢」確認對話框缺失**：現行 `DocumentEditPage.tsx` 之狀態按鈕點擊直接切換，未比照
   prototype 15 `pickStatus()` 對「作廢」目標值彈出確認對話框（「切換為『作廢』？作廢後前台將立即隱藏此
   文件…」）。與本任務之「原因欄位」缺口相鄰但獨立，建議一併排入本次或下次前端補強範圍。
2. **`ChangeHistoryPage.tsx::FIELD_LABEL`** 缺 `lifecycleId` 之中文對照（CREATE 事件會產生此欄位之列，
   目前會 fallback 顯示原始屬性名 `lifecycleId` 而非「所屬循環」/「循環別」）。低優先、易修，非阻擋。
3. **`reason` 欄位長度上限未經 spec/prototype 定義**：§2.2 選用 `nvarchar(500)` 為設計預設值，若使用者
   輸入超長文字，MSSQL 預設行為為擲出截斷錯誤（非靜默截斷）。本檔未設計對應之驗證/錯誤碼測試，因
   spec/error-handling.md 皆無此錯誤碼定義（不可自行杜撰新錯誤碼）。建議：若人類確認需要長度防護，
   應先於 error-handling.md（凍結中）新增對應條文，才可設計測試。

---

## 7. AC → TS 覆蓋對照表

| AC / 來源 | 內容摘要 | 對應 TS |
|---|---|---|
| F010 Main Flow 第 7 步「觸發稽核記錄（建立動作）」 | 建立即發 CREATE 事件並落地 | TS-DCL-A-001~013, TS-DCL-E-001~003 |
| F012 AC「切換時填原因…記錄於變更歷程並可檢視」 | reason 端到端持久化 | TS-DCL-B-001~007, TS-DCL-D-004,013, TS-DCL-E-004,006 |
| F012 AC「未填原因…原因欄留空」 | reason 未填 → null | TS-DCL-B-002,005~006, TS-DCL-D-005,014, TS-DCL-E-005 |
| F012 AC「切回有效重驗編號唯一性」 | F013 revalidation on switch-to-active | 既有 `TS-F012-*`（不重工）；**惟其於現行前端真實路徑（`update()`）是否被觸發，屬 §4.2 開放問題，本檔標記風險、未新增測項** |
| F037 spec「變更事件由文件寫入型功能同步產生」殘留「建立事件（架構定案）」 | CREATE 事件形狀 | §1.1 契約設計 + TS-DCL-A-001~013 |
| F037 spec「確切交易邊界屬架構決策（待 system-architect）」 | 同一交易 vs 兩階段 | §3 全節（🔴 不預先實作，現況鎖定 TS-DCL-C-001） |
| F037 Edge Case「未實際變更任何欄位即儲存：不產生任何變更日誌」 | 狀態未變仍不落地（reason 隨之捨棄） | TS-DCL-B-007 |
| prototype 15 逐字：原因欄僅於變更時顯示/清空/label/placeholder | UI 忠實度 | TS-DCL-D-001~003,006~007 |
| gap-derived：fan-out 副作用回歸（F006 訂閱者） | CREATE 事件不誤觸發提示解除 | TS-DCL-A-012, TS-DCL-E-007 |
| gap-derived：現況兩階段容錯佐證 | Composite 吞錯不影響主流程 | TS-DCL-C-001（交叉引用既有 composite spec） |

---

## 8. 測試層級與檔案總覽

| 層級 | 檔案 | 新增/擴充 | 案例數 |
|---|---|---|---|
| unit | `backend/src/documents/document-change-event.spec.ts` | **新檔**（或併入既有檔，視 tdd-developer 偏好） | 5（TS-DCL-A-001~005） |
| unit | `backend/src/documents/documents.service.spec.ts`（create 側） | 擴充 | 7（TS-DCL-A-006~012） |
| unit | `backend/src/documents/documents-controller.spec.ts` | 擴充 | 1（TS-DCL-A-013） |
| unit | `backend/src/change-history/document-change-log-publisher.spec.ts` | 擴充 | 3（TS-DCL-B-001~003） |
| unit | `backend/src/documents/documents.service.spec.ts`（setStatus 側） | 擴充 | 4（TS-DCL-B-004~007） |
| unit | `backend/src/documents/documents.service.spec.ts`（fan-out 回歸） | 擴充 | 1（TS-DCL-C-001） |
| frontend | `frontend/src/pages/DocumentEditPage.test.tsx` | 擴充 | 10（TS-DCL-D-001~010） |
| frontend | `frontend/src/pages/ChangeHistoryPage.test.tsx` | 擴充 | 4（TS-DCL-D-011~014） |
| integration | `backend/test/int/changehistory.itest.ts` | 擴充（非新檔） | 7（TS-DCL-E-001~007） |
| **合計** | | | **42** |

（unit 21＋frontend 14＋integration 7；另有 §3.3「裁決後參數化」骨架 4 項，不計入合計，待裁決後展開）

---

## 9. 待人類裁定事項（Open Questions）

1. **🔴【阻擋，需架構師/人類裁定】F037 同一交易邊界（§3）**：選項 1（完全交易化）／選項 2（維持現況、
   兩階段 best-effort、無補償）／選項 3（兩階段 + Outbox 補償）。**現況已查明並非「無保護」**——
   `CompositeDocumentChangePublisher` 已對每個訂閱者做 try/catch 吞錯，等同選項 2 之具體實現，只是無
   補償重試。裁決會直接決定 §3.3「裁決後參數化」的哪一組測項需要展開。

2. **🔴【阻擋，需人類裁定，與 #1 同源】狀態切換之真實呼叫路徑（§4.2）**：專用端點 `PATCH :id/status`
   （`setStatus()`，已含正確的 F013 revalidation 與 `changeType='STATUS'`）目前**未被任何前端呼叫**——
   `DocumentEditPage.tsx` 實際透過一般 `PATCH :id`（`update()`）送出狀態變更，該路徑**不會**在僅切換
   狀態（未同時改編號）時觸發 F013 重驗，且完全無 reason 承載能力。選項 A（前端改為條件式雙請求，
   重用專用端點）／選項 B（收斂邏輯進 `update()`，事實上棄用專用端點）。本檔 §4.3 之測項已預設選項 A
   撰寫並標記 `{ruling: endpoint}`，內附選項 B 之改寫對照。**此問題若不裁定，F012 AC「切回有效重驗編號
   唯一性」在現行真實路徑上可能持續處於未覆蓋狀態，即使 §2 之後端 reason 契約本身正確無誤。**

3. **🟡【建議，非阻擋】`DOCUMENT_CHANGE_LOG.reason` 長度上限**：本檔設計預設 `nvarchar(500)`，spec/
   prototype 皆無明文長度限制，亦無對應錯誤碼可依循（error-handling.md 凍結中，未列 reason 過長之錯誤
   碼）。建議至少由產品確認是否需要前端 `maxlength` 軟限制（不需後端錯誤碼，僅 UI 層防呆）。

4. **🟢【低優先、非阻擋】prototype 15「切作廢」確認對話框**、**`FIELD_LABEL` 缺 `lifecycleId` 中文對照**：
   見 §6，與本任務核心缺口相鄰但獨立，建議一併排入或另案處理。

5. **需新增之 migration（依 §2.2）**：`backend/src/database/migrations/1722988800000-document-change-log-
   reason.ts`——`ALTER TABLE [DOCUMENT_CHANGE_LOG] ADD [reason] nvarchar(500) NULL`。時間戳依任務指示採
   下一保留值 `1722988800000`（高於既有最高值 `1722902400000`），**本檔僅設計、未實際建立此 migration
   檔案**（依任務指示不執行 `migration:run`，交由 tdd-developer 依此規格建立）。
