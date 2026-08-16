# F037／F038 變更歷程兩 tab 匯出（CSV）測試設計

> 建立：2026-08-16，由 **test-generator（Lane L5，缺失／變更 delta #16）**。
> 權威＝`docs/specs/features/F037-document-change-history.md#export-delta`、
> `docs/specs/features/F038-lifecycle-tree-change-history.md#export-delta`、
> `docs/specs/error-handling.md#export`、`architecture-spec.md §10.4`、
> `prototypes/23-change-history.html`。
>
> 📌 **兩 tab 各自匯出、不合併**（`OQ-D18-17`）——欄位結構完全不同，合併必產生大量空欄。

## 一、涵蓋範圍

| Feature | AC | 主題 |
|---|---|---|
| F037 | `AC-D1`～`AC-D10` | ICSOP 程序書 tab 之匯出（欄位層 old/new，八欄） |
| F038 | `AC-D1`／`AC-D2`／`AC-D3`／`AC-D4`／`AC-D5`／`AC-D6` | 循環樹狀圖 tab 之匯出（DAG 結構事件，五欄）＋ diff 樹不支援雙擊 |

## 二、AC ↔ 約束對照

| AC | 約束檔案 | 層級 |
|---|---|---|
| F037 `AC-D1` 範圍＝全部事件、列序時間新到舊 | `backend/src/change-history/change-history-export.service.spec.ts` | unit |
| F037 `AC-D2` ①BOM ②逐字表頭 ③RFC 4180 ④逐欄位一列 | 同上 ＋ `backend/src/storage/csv-export.spec.ts` | unit |
| F037 `AC-D3` 上限 10,000／10,001 → 400 | 同上 | unit |
| F037 `AC-D4` 檔名 `document_change_history_{YYYYMMDD}_{HHmmss}.csv` | 同上（固定 `Date` 注入，逐字斷言） | unit |
| F037 `AC-D5` 權限 403 | `change-history-export.routes.spec.ts`（route metadata ＋ `canPerform` 逐角色） | unit |
| F037 `AC-D6` 記一筆 `CHANGE_LOG_VIEW`／稽核失敗不阻斷 | `change-history-export.service.spec.ts` | unit |
| F037 `AC-D7` 空結果僅表頭 | 同上 | unit |
| F037 `AC-D8` 🔒 F024 不外溢 | `change-history-export.routes.spec.ts`（靜態檔案斷言） | unit（靜態） |
| F037 `AC-D9` CSV 注入前綴（書名／舊值／新值） | `change-history-export.service.spec.ts` ＋ `csv-export.spec.ts` | unit |
| F037 `AC-D10` `exportDoc` id ＋ 逐字回饋 | `frontend/src/pages/ChangeHistoryPage.export.test.tsx` | component |
| F038 `AC-D1` 兩獨立控制項、各自匯出 | `ChangeHistoryPage.export.test.tsx` ＋ `change-history-export.service.spec.ts`（表頭互異） | component／unit |
| F038 `AC-D2` ①BOM ②五欄逐字表頭 ④`循環別`＝join 取當前值經 `lifecycleDisplayName` | `change-history-export.service.spec.ts` | unit |
| F038 `AC-D3` diff 樹**不支援節點雙擊** | `frontend/src/pages/ChangeHistoryPage.watermark.test.tsx`（雙擊後 dialog 數不變、`getNodeDrawer` 未被呼叫） | component |
| F038 `AC-D4` 檔名／`LIFECYCLE_CHANGELOG_VIEW`／上限／空結果 | `change-history-export.service.spec.ts` | unit |
| F038 `AC-D5` CSV 注入前綴（變更摘要／循環別） | 同上 | unit |
| F038 `AC-D6` `exportTree` id ＋ 逐字回饋 | `ChangeHistoryPage.export.test.tsx` | component |

## 三、🔴 §10.4 ④／§10.16 D2：COUNT 下推之可執行約束

兩張變更日誌表 append-only、單調成長；`listAll()` 為**無上限全表載入**，是本 delta 中唯一有真實
OOM 風險之處（本 repo 已於 F024 踩過同型坑）。約束以三條斷言鎖住：

1. 超限時 **`countByFilters` 呼叫 1 次、任何取列方法 0 次**（「不產生任何檔案」之強化版：連 SELECT 都不做）。
2. **正常路徑亦不得呼叫 `listAll()`**。← ⚠ **此條不可協商**（其餘兩條之方法名可經 mailbox 申訴調整）。
3. 取列時 `take === 10001`（competition 第二道，`TOP 10001`）。

## 四、由本環所訂、可經 mailbox 申訴之契約

| 項目 | 本環所訂 | 依據 |
|---|---|---|
| store 新方法 | `countByFilters(filters)`／`listByFilters(filters, take)`（兩 store 同名） | §10.4 ④ 只規定「COUNT 下推 ＋ TOP 10001」，未定名 |
| service 新方法 | `exportChanges(filters, actor) → { csv: Buffer; fileName: string }` | §10.4 只定端點與檔名 scope |
| F038 循環名解析 | `LifecycleChangeHistoryService` 第 4 建構參數＝`{ findDisplayNamesByIds(ids) }` | F038 `AC-D2` ④ 要求 join 取當前值；鏡射既有 `DocumentNameLookup.findNamesByIds` |
| 前端 helper | `exportDocumentChanges(filters)`／`exportLifecycleChanges(filters)` | 鏡射既有 `getDocumentChanges`／`getLifecycleChanges` |

🔒 **逐字文案、DOM id（`exportDoc`／`exportTree`）、表頭字串、錯誤碼、上限值、檔名 scope 由 AC 直接指定，不可協商。**

## 五、🔴 spec 未涵蓋、本環刻意不臆造者

| 編號 | 項目 |
|---|---|
| `G-L5-02` | F037 `AC-D2` 之 `變更欄位` 欄，其值為屬性名（`documentName`）或畫面所見中文標籤（`程序書書名`）**未定**；prototype 23 之 demo 資料用中文標籤，但該對照表目前只存在於前端。測試僅斷言「非空」。 |
| `G-L5-03` | 同上之 `來源` 欄（`CONTENT`／`STATUS`／`META` vs `編輯`／`狀態切換`）。 |
| `G-L5-04` | F038 `AC-D2` 之 `變更類型` 欄（`NODE_ADDED` vs 中文標籤）。 |
| `G-L5-05` | 三處 `時間` 欄之字面格式（是否 `YYYY-MM-DD HH:mm:ss`、是否附 `(UTC+8)`）未入 AC。 |

## 六、🔴 路由順序陷阱（spec 未寫，本環主動加）

`@Controller('admin/change-history')` 已存在 `@Get('documents/:documentId')`。Nest 依**宣告順序**比對，
若 `documents/export` 宣告在其後，`GET /admin/change-history/documents/export` 會被參數路由吃掉
（`:documentId = 'export'`），回一份「文件 id 為 export」之**空變更清單、HTTP 200、無任何錯誤**——
前端會拿到 JSON 而非 CSV。`lifecycles/export` 同理。
載體：`change-history-export.routes.spec.ts` 之兩條「路由順序」斷言。
