---
type: implementation-log
feature_id: F040
feature_name: 循環子分類（Lifecycle Subcategory）
status: complete
last_updated: 2026-08-07
---

# F040: 循環子分類 — Implementation Log

> 本輪為 Uncle-Bob 約束環模式：測試（環）由 `ring-author`（test-generator）於實作前獨立撰寫，
> 本 agent **僅撰寫 production code**，未新增／修改／刪除任何測試檔。
> 環中發現之缺陷一律以爭議申訴送交 `ring-author` 裁決（見「環爭議與裁決」節）。

## Test Results Summary

### 環（本輪新增之約束檔）

| 檔案 | 對應 AC | 結果 |
|---|---|---|
| `backend/src/lifecycle/lifecycle-subcategory.spec.ts` | AC-01～AC-20、AC-34～AC-36 | PASS |
| `backend/src/lifecycle/lifecycle-subcategory.service.spec.ts` | AC-03、AC-07～AC-20、AC-32 | PASS |
| `backend/src/documents/lifecycle-selection.spec.ts` | AC-24～AC-27（INV-4 判定式） | PASS |
| `backend/src/documents/document-lifecycle-selection.service.spec.ts` | AC-24～AC-27、AC-32～AC-33 | PASS |
| `frontend/src/domain/lifecycle-subcategory.test.ts` | AC-01～AC-06、AC-21～AC-23、AC-30～AC-31 | PASS |
| `frontend/src/domain/cycle-codes.test.ts` | AC-28／AC-29（不受影響型 regression guard） | PASS |
| `frontend/src/pages/LifecycleListPage.subcategory.test.tsx` | F007 AC-S1～AC-S8、AC-30 | PASS |
| `frontend/src/pages/DocumentCreatePage.subcategory.test.tsx` | F010 AC-S1～AC-S4、AC-21～AC-24、AC-31 | PASS |
| `frontend/src/pages/DocumentEditPage.subcategory.test.tsx` | F011 AC-S1～AC-S3、AC-26、AC-33 | PASS |
| `frontend/src/pages/DocumentListPage.subcategory.test.tsx` | F017 AC-S1／AC-S2、AC-30／AC-31 | PASS |

### 四道機器閘門（實跑數字）

| 閘門 | 指令 | 結果 |
|---|---|---|
| backend 單元 | `cd backend && npm test` | **116 suites / 1440 tests 全綠**（基線 112/1365 → +4 suites／+75 tests） |
| backend 型別 | `cd backend && npm run build` | **0 error**（`nest build`，`tsconfig.build.json` 排除 `**/*spec.ts`） |
| frontend 單元 | `cd frontend && npm test` | **48 files / 664 tests 全綠**（基線 576 ＋新增 88） |
| frontend 型別 | `cd frontend && npm run typecheck` | **0 error** |

> 上表數字以 **team-lead 於 2026-08-08 之獨立機器判定**為準（本 agent 自跑之最後一次為 662 tests，
> 差額為 `ring-author` 於裁決 #3 拆條後之新增，不影響結論）。

**零測試碼佐證**：`git diff --name-only` 之測試檔僅 `DocumentCreatePage.test.tsx`／`DocumentEditPage.test.tsx`
（`ring-author` 於本 agent 啟動前既有之修改）與 `DocumentListPage.test.tsx`（`ring-author` 回應爭議 #2 所修，
diff 內容為其自行加註之 `lifecycleId: 'lc2'` fixture 修正）。本 agent 未新增／修改／刪除任何測試檔或 `docs/specs/**`
（`implementation-log/` 除外）。

> ⚠ 風險 G-F040-14（`pdf-burner.spec.ts` 118s／`lifecycle-change-diff.service.spec.ts` 175s 可能因新增 spec 之
> worker 負載被推過 timeout）**未發生**：backend 全量 54s 完成，兩檔皆綠。

## Files Changed

### Backend — 新增

| File Path | Change Type | Description |
|---|---|---|
| `backend/src/lifecycle/lifecycle-subcategory.ts` | new | 純決策層權威實作：`normalizeSubcategory`／`lifecycleDisplayName`／`checkLifecycleUniqueness`＋`LifecycleIdentity`／`LifecycleUniquenessViolation` |
| `backend/src/documents/lifecycle-selection.ts` | new | INV-4 判定：`isLifecycleSelectable`／`assertLifecycleSelectable`（400 `LIFECYCLE_SUBCATEGORY_REQUIRED`） |
| `backend/src/database/migrations/1723680000000-lifecycle-subcategory.ts` | new | 加欄＋`(name, subcategory)` 唯一索引（見「Migration」節） |

### Backend — 修改

| File Path | Change Type | Description |
|---|---|---|
| `backend/src/lifecycle/lifecycle.store.ts` | modified | `LifecycleView`／`CreateLifecycleInput`／`UpdateLifecyclePatch` 各加**選用** `subcategory`（patch 為三態：`undefined`＝不修改、`null`＝清空、字串＝設定） |
| `backend/src/lifecycle/lifecycle.service.ts` | modified | `createLifecycle`／`updateLifecycle` 接受並正規化 `subcategory`；以全池（含 `inactive`）判定 INV-1／INV-2，違反時拋 400／409 且**不呼叫 store**；刪除稽核之名稱快照改用 `lifecycleDisplayName` |
| `backend/src/lifecycle/lifecycle.controller.ts` | modified | POST／PATCH body 接受 `subcategory`（PATCH 保持三態，未帶鍵即不修改） |
| `backend/src/lifecycle/typeorm-lifecycle.store.ts` | modified | `toView` 帶出 `subcategory`（讀取端 `?? null` 保險）、`create` 落地 `subcategory` |
| `backend/src/database/entities/lifecycle.entity.ts` | modified | 新增 `subcategory nvarchar(100) NULL` |
| `backend/src/documents/documents.store.ts` | modified | `DocumentStore` 新增**選用**成員 `listLifecycleIdentities?()`（既有 fake／實作不受影響） |
| `backend/src/documents/documents.service.ts` | modified | `create`／`update` 於既有必填檢查**之後**呼叫 `assertLifecycleSelection`；`update` 於 patch 未帶 `lifecycleId` 時跳過（三態語意） |
| `backend/src/documents/typeorm-documents.store.ts` | modified | 實作 `listLifecycleIdentities()`；清單 `lifecycleName` 改由 `lifecycleDisplayName` 組合（F017 AC-S1） |
| `backend/src/public/typeorm-public-documents.store.ts` | modified | 前台清單／詳情之 `lifecycleName` 同改為 `lifecycleDisplayName`（F019 AC-S1：前後台字串完全一致） |
| `backend/src/lifecycle/lifecycle-preview.service.ts` | modified | `requireLifecycle` 回傳顯示名稱 → 頁首標題與 `AUDIT_LOG.lifecycleName` 快照含子分類（F036 AC-S1／AC-S2） |
| `backend/src/lifecycle/lifecycle-change-diff.service.ts` | modified | `resolveLifecycle` 同上（F038 AC-S2）；循環已刪除者維持既有佔位字串 |
| `backend/src/ingestion/typeorm-index-meta.ts` | modified | `resolveLifecycleNames` 改用 `lifecycleDisplayName`（AC-30 單一顯示來源） |

### Frontend — 新增

| File Path | Change Type | Description |
|---|---|---|
| `frontend/src/domain/lifecycle-subcategory.ts` | new | 前端純函式：`normalizeSubcategory`／`lifecycleDisplayName`／`resolveLifecycleSelection`／`lifecycleNameOptions`／`subcategoriesOf`／`lifecycleSelectOptions` |

### Frontend — 修改

| File Path | Change Type | Description |
|---|---|---|
| `frontend/src/api/types.ts` | modified | `LifecycleView` 加選用 `subcategory` |
| `frontend/src/api/endpoints.ts` | modified | `createLifecycle`／`updateLifecycle` payload 帶 `subcategory`（trim 後空值送 `null`） |
| `frontend/src/pages/LifecycleListPage.tsx` | modified | 列以 `[data-lifecycle-name]` 呈現顯示名稱；搜尋比對顯示名稱、placeholder 改為「搜尋循環名稱／子分類…」（**aria-label 維持 `搜尋循環名稱`**）；modal 加 `#lcSub`（含 prototype 逐字說明）與**條件式渲染**之 `#lcDupErr`／`#lcConflictErr` |
| `frontend/src/pages/DocumentCreatePage.tsx` | modified | 兩段式選取 `#f_cycleName`／`#subWrap`＋`#f_cycleSub`／`#subErr`（第二段為條件式渲染）；送出前以 `resolveLifecycleSelection` 解析為單一 `lifecycleId`；補回 prototype 14 之 `#numPrefix`／`#numCode` |
| `frontend/src/pages/DocumentEditPage.tsx` | modified | 兩段式選取 `#lc_name`／`#lc_subWrap`／`#lc_sub`／`#lc_subErr`；「目前值」對照側改用 `lifecycleDisplayName`；「還原」連同兩段狀態一併復原 |
| `frontend/src/pages/DocumentListPage.tsx` | modified | 循環別 cell 加 `[data-cycle-cell]`；篩選選項 value 改為 `lifecycleId`、label 為顯示名稱，篩選鍵同改 `lifecycleId`（F017 AC-S2／AC-31） |

## Architectural Decisions

1. **後端純函式與前端純函式各一份**：本專案無前後端共用 package，故 `normalizeSubcategory`／`lifecycleDisplayName`
   於 `backend/src/lifecycle/lifecycle-subcategory.ts` 與 `frontend/src/domain/lifecycle-subcategory.ts` 各實作一次，
   兩者各自被環約束，語意逐字一致。此為既有專案結構之必然，非重複實作之疏漏。

2. **`documents` → `lifecycle` 之型別依賴**：`DocumentStore.listLifecycleIdentities?()` 之型別取自
   `../lifecycle/lifecycle-subcategory`。該模組為**純型別＋純函式**（無 Nest module／無 DI），不構成模組循環相依。

3. **循環池 seam 採「選用成員」**：`listLifecycleIdentities?()` 宣告為 optional，未提供時服務層視為無池資料並**略過**
   INV-4 判定。此設計使既有數十個手建 `DocumentStore` fake 完全不受影響，且不會誤擋既有流程。

4. **驗證順序之落點**：`createLifecycle` 先做名稱必填（既有行為、可免去對池之查詢），再查全池判 INV-1／INV-2。
   `updateLifecycle` 僅於 patch 觸及身分欄位（`name` 或 `subcategory`）時才重驗，且比對「套用 patch 後之結果」並排除自身列——
   避免僅改說明之編輯被誤擋（AC-15）。

5. **前端不做唯一性預先比對**：唯一性比對範圍涵蓋停用列，唯後端持有全池權威。前端 modal 僅做名稱必填（順序 ①），
   `#lcDupErr`／`#lcConflictErr` 一律由後端 409 回應驅動。

6. **顯示名稱之單一來源（AC-30）**：後端於「資料組裝路徑」組合 `lifecycleName`（清單 store／前台 store／快照／稽核），
   前端不再自行串接子分類。`DocumentListItem.lifecycleName` 因此是**已組合之顯示字串**。

## G-F040-01 之處置（規格缺口）

**情境**：payload 之 `lifecycleId` 有值但**池中查無此列**。AC-24 管「缺漏」、AC-27 管「存在」，兩者之間未定義。

**處置**：`isLifecycleSelectable` 於查無所指列時回傳 `true`（＝本判定**不裁決**、視為通過），
`assertLifecycleSelectable` 因此不拋出。

**理由**（最小驚訝原則）：

- 本 feature 之錯誤碼 `LIFECYCLE_SUBCATEGORY_REQUIRED` 依 AC-25 明訂只有**一種**觸發情境（所指列 `subcategory` 為 `null`
  且同名下另有具子分類之列）。「查無此列」不符該判定式，回本碼會直接違反「後端唯一觸發情境」之明文。
- 「找不到資源」在本 codebase 已有既有處置路徑（`ICSOP_DOCUMENT.lifecycleId` 對 `LIFECYCLE` 之 DB 外鍵完整性；
  以及各服務既有之 404 慣例）。讓本判定沉默通過即等同「沿用既有處置」，不改變任何既有行為。
- **不發明新錯誤碼**（依交辦明文）。

環對此情境之斷言（`lifecycle-selection.spec.ts` 行 83-94）為容忍式（若拋出則不得含本碼），本實作因根本不拋而成立。

**`ring-author` 覆核通過**，並提出一個閉合條件：本處置把「查無此列」情境之 INV-4 保證**外移到 DB 層**，
故該情境唯一的攔截點是 `ICSOP_DOCUMENT.lifecycleId → LIFECYCLE.id` 之外鍵約束。

**已確認該 FK 存在**（`backend/src/database/migrations/1721865600000-icsop-document.ts`）：

```sql
CONSTRAINT [FK_ICSOP_DOCUMENT_lifecycle] FOREIGN KEY ([lifecycleId]) REFERENCES [LIFECYCLE]([id])
```

該 migration 檔頭亦已載明其設計意圖：「NO ACTION：刪循環有文件時，app 層先以 `LIFECYCLE_HAS_DOCUMENTS` 擋，
**FK 為第二道防線**；不 cascade，避免刪循環誤刪文件」。
⇒ **INV-4 於「查無此列」情境完全閉合**，不需升級為 spec-writer 議題。

## 環爭議與裁決（我曾想改但未改之測試）

依鐵律，以下四項我**一律未自行修改測試**，全部以 `SendMessage` 送交 `ring-author` 裁決；四項皆經其修正後生效。

| # | 檔案 | 我提報之問題 | 裁決結果 |
|---|---|---|---|
| 1 | `backend/src/documents/document-lifecycle-selection.service.spec.ts` | (a) 8 處 `as CreateDocumentInput` cast 方向相反——`create()` 之 payload 型別為 `Record<string, unknown>`，interface 無隱含 index signature 故不可指派；要讓 cast 通過只能替 `CreateDocumentInput` 加 index signature 或改 type alias，會摧毀既有 excess-property 檢查。(b) 2 處 `updated.documentName`／`updated.lifecycleId`——`update()` 依 F011 回傳 `DocumentUpdateResult{document, changes}`，非 `DocumentView` | `ring-author` 已修（拿掉 cast、改取 `.document`） |
| 2 | `frontend/src/pages/DocumentListPage.test.tsx`（既有檔） | fixture 之 `doc()` 工廠把 `lifecycleId: 'lc'` 寫死，兩筆 DOCS 僅覆寫 `lifecycleName` → 同一 `lifecycleId` 對應兩個名稱，屬 production 不可達狀態。與 AC-31「選項值＝`lifecycleId`」互斥（窮舉不到任何實作能同時滿足） | `ring-author` 已修（第二筆補 `lifecycleId`）；本實作維持 AC-31 之 `lifecycleId` 鍵 |
| 3 | `frontend/src/pages/DocumentEditPage.subcategory.test.tsx` | 「未改動該欄位即儲存」以 `expect(updateDocument).toHaveBeenCalled()` 代理「未被阻擋」，但既有 `hasScalar` 守衛（`git show HEAD:` 證實早於 F040 存在）在空 patch 時刻意不發請求。唯一能滿足之 production 改法（移除守衛）**有害**：空 patch 會使 TypeORM `update({id}, {})` 拋 `UpdateValuesMissingError`，等同把「開啟編輯頁直接按儲存」變成 500 | 成立（`ring-author` 認定為其 over-specification：F011 AC-S3 只要求「不被阻擋」，未要求「必須發出請求」）。已修，且**同時採用**建議 (a)＋(b)：保留原情境改驗「未被阻擋」，另**新增**一條驗「改動其他欄位後 patch 不帶 `lifecycleId` 鍵」——與後端 AC-26 三態語意對稱。淨結果為**環變強** |
| 4 | `frontend` 三個新測試檔之型別瑕疵（`within` 未使用 ×2、`viewOn` 缺四個 `DocumentView` 必填欄） | 使 `npm run typecheck` 閘門為紅。特別確認**不應**把 `api/types.ts` 之 `draftingCompanyId` 等改為 optional 來遷就——該宣告忠實鏡射後端（`toView` 一律填值） | `ring-author` 已修（並自陳其 RED gate 只跑 `npm test`、未跑 `typecheck`，故型別層問題在建環階段隱形） |

### 已知環強度缺口（`ring-author` 記錄，不阻塞本次交付）

- **G-F040-15**：`DocumentListPage`（頁 13）為自訂 combobox，`option.value` 不可直接觀察，
  故環對 AC-31「篩選值須為 `lifecycleId`」**不具完全可辨識性**——由 INV-1 可推得 `lifecycleDisplayName` 於池內為單射，
  因此 displayName-keying 與 id-keying 之篩選結果恆等，行為測試無法區分（惟 name-keying 仍會被抓到）。
  本實作**採 `lifecycleId` 為鍵**（AC-31 明文）。此缺口由本 agent 主動提報，`ring-author` 決定不追加 DOM 掛鉤
  （避免在實作完成後追加新 production 契約），列為日後補 Stryker mutation 時之優先標的。
  頁 14／15 為原生 `<select>`，AC-31 之字面形式已被逐字斷言（`['lc1','lc10','lc11']`）完全鎖死。

### 附帶處置兩則

1. **`DocumentCreatePage.tsx` 補回 prototype 14 之 `#numPrefix`／`<span id="numCode">`
   —— ⚠ 此為「既有 fidelity 落差之修復」，非 F040 新增功能**（`ring-author` 要求於本 log 標記，以利後續稽核辨識此改動為何出現在本 commit）。

   成因：環之 `getByText(/ICSOP-SRC-/)` 為單數查詢；既有 React 把循環代碼**直接內嵌**於說明段落
   （`前綴「ICSOP-{code}-」依所屬循環…`），因 `{code}` 亦為該 `<p>` 之**直屬 text node**，
   `getNodeText` 串接後同樣含 `ICSOP-SRC-`，與真正的前綴 `<span>` 撞成兩個命中。
   prototype 14 行 148 原本就把代碼包在獨立 span（`前綴「ICSOP-<span id="numCode">—</span>-」…`），
   其 JS 亦同時操作 `#numPrefix` 與 `#numCode` 兩個節點。補齊後 `<p>` 自身不再是前綴字串之來源，單一命中。
   `ring-author` 覆核：方向正確（把 production 拉回 prototype），斷言不改。

2. **toast 文案：一度改為不碰撞措辭，經裁決後已還原為 prototype 逐字**。

   我原先將 toast 改為「尚未選定具體子分類，無法建立／儲存」以避開環之單數查詢多命中。
   `ring-author` **駁回**：prototype 14／15 之內嵌提示與 toast **共用同一句話**（prototype 15 行 519／行 803），
   是已裁決之設計；為了讓測試查詢過關而改動使用者可見文案，正是本環要防的 drift。
   裁決結果：**環改為 `getAllByText`，production 還原**。
   兩頁 toast 現皆為 prototype 逐字之「此循環名稱底下設有子分類，請選擇具體子分類後再送出」。
   ⇒ **本次實作對 prototype 無任何刻意偏離。**

## Migration

**檔名**：`backend/src/database/migrations/1723680000000-lifecycle-subcategory.ts`
（class `LifecycleSubcategory1723680000000`；migrations 以 glob 載入，無需另行註冊）

**SQL 摘要**：

```sql
-- up（對應 F040「實作前置檢查」表之步驟 3、4）
ALTER TABLE [LIFECYCLE] ADD [subcategory] nvarchar(100) NULL;
CREATE UNIQUE INDEX [IX_LIFECYCLE_name_subcategory] ON [LIFECYCLE] ([name], [subcategory]);

-- down
DROP INDEX [IX_LIFECYCLE_name_subcategory] ON [LIFECYCLE];
ALTER TABLE [LIFECYCLE] DROP COLUMN [subcategory];
```

**設計要點**：

- MSSQL 之 `UNIQUE INDEX` **視多個 NULL 為相等**（與 ANSI 相反）。此語意對 INV-1 恰好正確：
  同一名稱之「無子分類」列只能存在一筆，故**不需**篩選索引。
- migration 內**刻意不做任何 try/catch 吞錯或條件略過**：若 IX 建立失敗（既有同名重複列未清理），
  錯誤直接拋出並中止整個 migration。靜默略過索引會使 INV-1 僅剩服務層單保險。
- 既有列全部落在 `NULL`（＝無子分類），**無 backfill 需求**，語意上向後相容（AC-32／AC-33／AC-35）。

### 真 SOP DB 實跑結果（2026-08-08，由 team-lead 執行）

| 項目 | 結果 |
|---|---|
| 前置盤點（步驟 1） | `SELECT name, COUNT(*) … HAVING COUNT(*)>1` → **0 筆**，**不需人工裁定**（步驟 2 跳過） |
| migration 執行 | `LifecycleSubcategory1723680000000` **單一交易 COMMIT 成功** |
| 真庫覆核 | `LIFECYCLE.subcategory` 欄已存在、`IX_LIFECYCLE_name_subcategory` 已存在、`FK_ICSOP_DOCUMENT_lifecycle` 已存在（**G-F040-01 結案**） |

**唯一索引語意實測**（交易內實插後 ROLLBACK，不留殘料）：

| 案例 | 預期 | 實測 |
|---|---|---|
| `(N, NULL)` 第二筆 | 被拒 | ✅ 被拒 —— **證實 MSSQL 視多個 NULL 為相等，INV-1 於 DB 層成立** |
| `(N, 消金)`／`(N, 企金)` | 皆成功 | ✅ 皆成功（同名不同子分類為獨立列） |
| `(N, 消金)` 重複 | 被拒 | ✅ 被拒 |
| ROLLBACK 後 | 殘留 0 筆 | ✅ 0 筆 |

⇒ 本 migration 檔頭所述之 MSSQL NULL 語意假設**已由真庫實證**，非僅文件推論。

**為何本 agent 未自行執行**：依交辦明文，**未執行 `npm run migration:run`**。
F040 步驟 1、2 之前置盤點與重複列裁定屬**人類決策**（規格明訂「嚴禁自動合併」——合併會改變既有文件之
`lifecycleId` 參照與 DAG 歸屬），需由 ICSOP 管理員逐筆處置後才可建立唯一索引。
執行前之盤點指令（應為 0 筆）已寫入 migration 檔頭註解：

```sql
SELECT name, COUNT(*) AS c FROM [LIFECYCLE] GROUP BY name HAVING COUNT(*) > 1
```

## Blocking Issues

無阻塞。四道機器閘門全綠、環未經任何弱化、migration 已對真庫實跑成功。

### ⚠ 未竟項（2026-08-08 更新追蹤器時查核發現，**已使 F040 判為 🟡 而非 ✅**）

`ring-author` 提報 6 條 AC-S delta 無測試覆蓋（本輪採簡易版 ring，跳過 Playwright fidelity／Stryker／dep-cruiser）。
本 agent 逐一查核原始碼後發現：**這 6 條並非全部「已實作但未驗證」——其中 4 條實際尚未實作**。
兩者性質不同，故如實分列：

| AC-S | 實作 | 測試覆蓋 | 依據 |
|---|---|---|---|
| F008-S1（DAG 畫布頁首標題/麵包屑） | **尚未實作** | 無 | `frontend/src/pages/DagCanvasPage.tsx:127` 仍 `ls.find(...)?.name`，未經 `lifecycleDisplayName` |
| F009-S1（節點抽屜過濾提示） | **尚未實作** | 無 | 其 `cycleName` 由 `DagCanvasPage.tsx:127` 同一處傳入（`NodeDrawer.tsx:256` 渲染）；候選過濾鍵本就為 `lifecycleId`，該半已符合 |
| F036-S1（頁首標題） | 已實作 | 無 | 後端 `lifecycle-preview.service.ts` `requireLifecycle` 回 displayName，前端沿用 |
| F036-S1（頂部循環切換器選項） | **尚未實作** | 無 | `LifecycleTreePreviewPage.tsx:191` 仍 `{c.name}`（來自 `getLifecycles()` 裸名稱），同名不同子分類無法區分 |
| F036-S3（第二入口帶 `lifecycleId`） | 已符合（既有行為） | 無 | `DocumentListPage` 本就 `window.open('/lifecycles/${d.lifecycleId}/tree')` |
| F038-S1（變更歷程「循環別」下拉） | **尚未實作** | 無 | `ChangeHistoryPage.tsx:555／611` 仍 `?.name` |
| F019-S1／S2（前台顯示與篩選） | 已實作 | 無 | 後端 `typeorm-public-documents.store.ts` 組 displayName；`PublicListPage.tsx:86-90` 選項本就 `(lifecycleId, lifecycleName)`，value 即 `lifecycleId` |

**4 條未實作者屬同一族缺口**（「頁面仍以裸 `name` 顯示循環名」），集中於 **3 個檔、4 處呼叫點**：
`DagCanvasPage.tsx:127`（同時供 F008-S1 與 F009-S1）、`LifecycleTreePreviewPage.tsx:191`、`ChangeHistoryPage.tsx:555/611`。
本 agent **刻意未逕行補上**：本輪交辦範圍為更新追蹤器（文件），且該 4 處無對應約束環；
依 Uncle-Bob 紀律，production code 應在環先行之後才寫，測試由 `ring-author` 撰寫。**是否納入本次 commit 前補完，屬 team-lead 之範圍決策。**

### 規格 ↔ schema 落差（需上游裁決，非實作缺陷）

**AC-34／F008-S2／F038-S2** 要求「寫入 `LIFECYCLE_CHANGE_LOG` 時，其 `lifecycleName` 快照值為 `lifecycleDisplayName` 之輸出」，
但 `backend/src/database/entities/lifecycle-change-log.entity.ts` 之 `LIFECYCLE_CHANGE_LOG` **並無 `lifecycleName` 欄**
（該表欄位為 `lifecycleId`／`changeType`／`summary`／`oldValue`／`newValue`／`nodeId`／`actor*`／`occurredAt`／`snapshotId`）。
`change-history/lifecycle-change-history.service.ts:44` 之 `lifecycleName` 參數是寫往 **`AUDIT_LOG`** 的 `targetNumber`／`targetName`，非本表。
⇒ 該 AC 所指之持久化欄位目前不存在；顯示規則本身已由純函式測試（`lifecycle-subcategory.spec.ts` §I）釘死。
**建議交 spec-writer／system-architect 裁決**：加欄位，或將 AC 改為「由 `lifecycleId` 即時解析」（後者會失去快照語意，與 AC-36 相衝）。

### 其他（不阻塞）

- OQ-E03-11（`subcategory` 長度上限與是否需專屬錯誤碼）現採 `nvarchar(100)` 同 `name`，超長沿用 `name` 之既有處置。
- G-F040-15（頁 13 之 AC-31 斷言不具完全辨識性），見上節。
