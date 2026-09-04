---
type: implementation-log
feature_id: F043
feature_name: 業務/功能類別管理（後端）
status: complete
last_updated: 2026-09-04
---

# F043: 業務/功能類別管理 — 後端實作紀錄

> 範圍＝**僅後端**（`backend/`）。前端（`frontend/`）由另一位實作者負責，其紀錄見
> [`F043-impl.md`](F043-impl.md)。
> ⚠ **檔名說明**：本輪前後端並行，兩棒次同時寫入 `F043-impl.md` 而發生覆寫；為不破壞對方之
> 紀錄，後端另立本檔。若 lead 決定合併為單一檔案，本檔內容可整段併入。
>
> 約束環由 test-generator（`ring-be`）於實作前 blind-to-implementation 撰寫，本 agent
> **僅撰寫 production code，未新增／修改／弱化／刪除任何測試檔**；環之缺陷一律以申訴送交
> `ring-be` 裁決（見〈環爭議與裁決〉節）。
>
> 🟢 **三支 migration 已對 dev 真庫實跑並以 `SELECT` 覆核**（2026-09-03，網路恢復後），
> 六張表、兩組唯一索引、FK CASCADE、`AUDIT_LOG` 兩個新欄皆已驗證存在；INV-B1 之
> MSSQL 多重 NULL 語意亦以真庫探針證實（見〈真庫實跑證據〉）。
> ⚠ 仍**未做**之部分（不得視為已完成）見文末〈未兌現項目〉——主要為**瀏覽器實機煙霧測試**
> 與 `/public/*` 代理白名單覆核。

## 實跑證據（2026-09-03，含候選排除修正後之最終數字）

```
cd backend && npx tsc --noEmit             → 0 error（exit 0）
cd backend && npx jest --maxWorkers=4      → Test Suites: 217 passed, 217 total
                                             Tests:       3402 passed, 3402 total
cd backend && npm run test:int             → Test Suites:  24 passed,  24 total
                                             Tests:        204 passed, 204 total
RED 基線（lead 實跑）                       → 21 suites 全紅，皆 TS2307 找不到模組
```

🔴 **`test:int` 必須序列跑**（`test/jest-int.json` 已釘 `maxWorkers: 1`）：
以 `--maxWorkers=2` 覆蓋會讓 **15 個 suite 一起紅**，但逐一單跑全部通過——共用真庫之跨 spec
資料互相干擾，不是程式缺陷。派工單建議之 `-- --maxWorkers=2` 於本 repo 之整合層**不適用**。

## 2026-09-03 候選排除修正（使用者實機揪出之真缺陷）

**現象**：同兩份文件掛到兩個不同節點後，任一節點抽屜之「已掛載」顯示 **4 筆**（應為 2 筆，
兩份各出現兩次）；畫布徽章「掛載 2 份文件」正確。DB 恰 4 列（2 節點 × 2 文件）、無重複列
⇒ **資料層無誤**。

**根因（接縫）**：候選查詢**不知道「本節點」是誰**——這是 `AC-20` 原始契約
（`listCandidates(query)` 完全不收任何節點／類別參數）之副作用：為了徹底杜絕「以循環過濾」，
連「排除已掛載於本節點者」這個**完全正交**的維度也被一併排除了。前端 `NodeDrawer` 又以
`[...mounted, ...candidates]` 合併，那個互斥前提只在 F009 之單一掛載模型下成立，M:N 不成立。
🔴 **兩側單元測試都看不到**：各自的 fixture 把兩份清單造成互斥。

**修正**（三處，皆為 additive）：

| 落點 | 改動 |
|---|---|
| `business-category-docs.store.ts` | `listCandidateDocs` 查詢新增**選填**鍵 `excludeDocumentIds?: string[]` |
| `business-category-docs.service.ts` | `listCandidates(businessCategoryId, nodeId, query)`；內部呼叫既有 `listNodeMountedDocs()` 取本節點掛載 id 作為排除集 |
| `typeorm-business-category-docs.store.ts` | SQL 層 `d.id NOT IN (...)`。⚠ **參數上限之處置見本檔〈一項對 lead 指示之技術更正〉**——切批在單一 statement 內幫不上忙，真正的界限來自語意上界。空陣列 → **完全不加條件**（`NOT IN ()` 在 SQL 中非法，語意上也不該排除任何東西） |

🔒 **三條不變式皆已由環驗證**（`business-category-docs-candidates.service.spec.ts`，最終 15/15）：
① 候選**仍不以 `lifecycleId` 過濾**（`excludeDocumentIds` 是一組文件 id，與循環維度正交；
store 查詢型別上仍**不存在**任何循環相關鍵，`AC-20` 之 int-test 亦保持綠）；
② **不誤殺**——掛在**同類別其他節點**或**其他類別**之文件**仍是候選**（`AC-21`／`AC-22` 之
M:N 核心，誤殺即把模型悄悄改回單一歸屬）；
③ 排除集為空時**行為與修正前完全相同**。

📌 **立條理由**：依 `AC-24`，把已掛載於本節點的文件列為候選 ⇒ 使用者點下去**必然**回 409
`BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED`。**提供一個必然失敗的動作**正是本 repo 反覆修過的
死動作形狀（F024 匯出鈕同型）。

## 2026-09-03 候選統計修正（同日第二個實機缺陷：`lifecycleCount`）

**現象**：抽屜候選區文案顯示「候選＝全部 ICSOP 文件（共 **22** 份，分屬 **1** 個相異循環）」，
真庫 `SELECT COUNT(*) FROM ICSOP_DOCUMENT` ＝ **591**。

**根因**：候選查詢有分頁（`.take(pageSize)`），前端以**當前頁長度**冒充總數、以**當前頁**推導
相異循環數。後端當時只回 `total`（其實已是全集）而未回循環數，前端只好自己算。

🔴 **嚴重性不只是數字錯**：那句文案的用途是**反證候選未被循環過濾**，而它算出的「分屬 **1** 個
相異循環」看起來正好像**被循環過濾了**——一句用來反證的文案變成了**正證**。這是比「數字不準」
更壞的一種錯：它讓一個未被違反的 AC 看起來像被違反了。

**修正**：`listCandidateDocs` 回傳新增**必填** `lifecycleCount`（＝過濾後、**未分頁**全集之
`COUNT(DISTINCT lifecycleId)`）；service 透傳；controller 併為 `candidateLifecycleCount`。

**SQL 為單一往返**（`typeorm-business-category-docs.store.ts`）：
`filtered` CTE（套 keyword／exclude、未分頁）→ `stats` CTE 聚合 `COUNT(*)` 與
`COUNT(DISTINCT lifecycleId)` → `paged` CTE 才套 `OFFSET/FETCH`，兩者以 `LEFT JOIN` 相接。
- ⚠ **刻意不用 `COUNT(*) OVER ()` 視窗函式**：視窗值只存在於**回傳的列**上，該頁為空
  （0 筆結果或頁碼超出末頁）時一列都沒有 ⇒ 統計值一併消失、只能謊報 0。
  `stats` 為無 `GROUP BY` 之聚合、**恆回一列**，`LEFT JOIN` 保證結果至少一列。
- ⚠ **刻意不用 `getManyAndCount()`**：它本身即兩趟（SELECT ＋ COUNT），再加一趟 DISTINCT 就是三趟。
- `ICSOP_DOCUMENT.lifecycleId` 為 **NOT NULL** ⇒ `COUNT(DISTINCT ...)` 與環之 `new Set(...).size`
  語意一致，不因 NULL 而分歧。

**🔴 真庫驗證（單元測試以 fake store，證明不了這段 SQL）**：
```
GROUND_TRUTH  SELECT COUNT(*), COUNT(DISTINCT lifecycleId) FROM ICSOP_DOCUMENT → 591 / 14
page1        items=20  total=591  lifecycleCount=14   ✅ 與 ground truth 相符
page2        items=20  total=591  lifecycleCount=14   ✅ 換頁不變
page9999     items= 0  total=591  lifecycleCount=14   ✅ 空頁仍正確（視窗函式寫法在此會謊報 0）
exclude×3              total=588                       ✅ 排除後遞減
keyword 逐一比對 ground truth：作業 591/14、授信 4/2、管理 92/10、ZZZ 0/0  ✅ 四組全 MATCH
```
（`作業` 命中全部 591 份係因每份程序書書名皆含該詞，非篩選失效——已以 ground truth 對照確認。）
探針用完即刪，未留測試資料。

### ⚠ 一項對 lead 指示之技術更正（已回報）
派工單與我上一輪都以 `chunkByParamBudget` 切 `NOT IN`，**但那在此幫不上忙**：MSSQL 2100 參數
上限是**每個 statement** 的，把一個 `NOT IN` 拆成多個 `AND` 相接之 `NOT IN` 仍在同一 statement、
參數總量不變。真正的界限來自語意——排除清單是「**單一節點**已掛載之相異文件」，上界為
`ICSOP_DOCUMENT` 總筆數（今日 591），且 `(nodeId, documentId)` 有唯一鍵故無重複列
⇒ 今日結構上不可能逼近 2100。故改為單一 `NOT IN` 並就地標記觸發條件：
🔴 **若日後文件總數逼近 ~2000**，須改以 `nodeId` 直接 `NOT EXISTS` 關聯 `BUSINESS_CATEGORY_DOC`
（參數量恆為 1、與掛載數無關），但那需把 `nodeId` 加入本方法簽章，屬契約變更，本輪不做。

## 真庫實跑證據（2026-09-03，dev SOP DB）

```
npm run migration:run → No migrations are pending（三支已落地）

sys.tables LIKE 'BUSINESS_CATEGORY%'
  → BUSINESS_CATEGORY, BUSINESS_CATEGORY_CHANGE_LOG, BUSINESS_CATEGORY_DOC,
    BUSINESS_CATEGORY_EDGE, BUSINESS_CATEGORY_NODE, BUSINESS_CATEGORY_SNAPSHOT  （六張，全部存在）

唯一索引（is_unique=1）
  → UQ_BUSINESS_CATEGORY_name_subcategory        cols = name,subcategory     ✅ INV-B1
  → UQ_BUSINESS_CATEGORY_DOC_node_document       cols = nodeId,documentId    ✅ INV-B6
  → UQ_BUSINESS_CATEGORY_SNAPSHOT_changeLogId    cols = changeLogId          ✅ 1:1 回指
  （🔒 **不存在** (businessCategoryId,documentId) 或單獨 (documentId) 之唯一鍵，INV-B6 之反面成立）

sys.foreign_keys
  → FK_BUSINESS_CATEGORY_DOC_document : BUSINESS_CATEGORY_DOC → ICSOP_DOCUMENT, onDelete = CASCADE  ✅ 決策 E8
  （🔒 恰一條；nodeId／businessCategoryId／sourceNodeId／targetNodeId 皆無 DB FK，符合決策 E8）

AUDIT_LOG 新欄 → businessCategoryId (nullable), nodeId (nullable)  ✅ 決策 E3
```

**§14.10 盲區 #1 已以真庫探針消除**（單元測試原理上證明不了）：
同名 ＋ `subcategory = NULL` 之第二筆 INSERT → **被 DB 擋下，`number = 2601`**
（MSSQL 於 UNIQUE INDEX 視多個 NULL 為**相等**，恰符「同名之無子分類列至多一筆」之 INV-B1）；
同名 ＋ 具體子分類 → **允許**（INV-B1 只擋同一組合，未過度限縮）。探針用完即刪，未留測試資料。

## 既有 int-test 過期（🟢 已由測試作者修正；非本 feature 造成，舉證留存供追溯）

`test/int/lifecycle-changelog.itest.ts` 之 **TS-LCC-E-006**：
「Supervisor 對 F036 `tree-preview/download` → 200」曾實得 **403**。
**本節之舉證促成該條期望值更新，現已全綠**（最終 `test:int` 為 24/24、204/204）。

**歸因（三項皆為 `git` 可驗之事實，非推測）**：
1. `git show HEAD:backend/src/rbac/function-matrix.ts` → `LIFECYCLE_MANAGEMENT` 於 **HEAD 即為**
   `row('READ','CRUD','NONE','NONE','NONE')`（主管＝`NONE`），由 commit
   **`880fcb5 feat(rbac): 循環管理自主管權限移除（唯讀 → 無）`** 於本輪**之前**落地。
2. 該斷言之三個輸入 `lifecycle-preview.controller.ts`／`role-permission.guard.ts`／
   該 int-test 檔本身，`git diff HEAD` 皆為 **UNCHANGED**。
3. 我對 `function-matrix.ts` 之**唯一**改動是新增 `BUSINESS_CATEGORY_MANAGEMENT` 一列
   （`git diff HEAD` 僅一行 `+`），未觸及 `LIFECYCLE_MANAGEMENT`。

⇒ 該測試在 `880fcb5` 當下即已過期，只是**當時 DB 不可達、無人跑得到**。
F042/F043 之文件本身已預告此連帶效果（`function-matrix.ts` 就地註解：
「⚠ 本格同時是 F036 循環樹狀圖預覽之閘門 ⇒ 主管自本輪起亦不可預覽樹狀圖」）。
🔴 **本 agent 未修該測試**——依紀律交由測試作者更新期望值（主管應為 403），現已完成。

📌 **可複用之教訓**：一個 feature 的人類裁決常連帶改到**別的 feature 的閘門格值**；若當下真庫
不可達，該處的既有測試會**靜默過期**到下次連線才爆。整合層出現與本 feature 無關之紅燈時，
先跑 `git show HEAD:<設定檔>`／`git diff HEAD -- <斷言的每個輸入>` 三步舉證再回報，
不要先懷疑自己、更不要自己改測試。

## Test Results Summary（環之逐檔對應）

| 代號 | 環檔（皆由 `ring-be` 撰寫） | 對應 AC | 結果 |
|---|---|---|---|
| BE-01 | `business-categories/business-category-subcategory.spec.ts` | AC-03／AC-05～AC-11／AC-13／AC-14（＋AC-04 型別層、AC-10 值域封閉窮舉） | PASS |
| BE-02 | `business-categories/business-category.service.spec.ts` | AC-01～AC-04／AC-11～AC-14 | PASS |
| BE-03 | `business-categories/business-category.controller.spec.ts` | AC-45／AC-46 | PASS |
| BE-04 | `business-categories/business-category-dag.service.spec.ts` | AC-15～AC-19（＋決策 E2 之 `classifyEdge` spy） | PASS |
| BE-05 | `business-categories/business-category-dag.controller.spec.ts` | AC-45／AC-46 | PASS |
| BE-06 | `business-categories/business-category-docs.service.spec.ts` | AC-21～AC-27／AC-29～AC-31（§丙 核心差異；AC-20／AC-28 已遷出至 BE-31） | PASS |
| BE-31 | `business-categories/business-category-docs-candidates.service.spec.ts` | AC-20／AC-28 ＋ 2026-09-03 兩個實機缺陷（候選排除三半鑑別、`lifecycleCount` 全集 vs 當前頁） | PASS |
| BE-07 | `business-categories/business-category-docs.controller.spec.ts` | AC-37／AC-45／AC-46 | PASS |
| BE-08 | `business-categories/business-category-preview.controller.spec.ts` | AC-32～AC-37／AC-53 ①／AC-54 ① | PASS |
| BE-09 | `business-categories/business-category-change-diff.controller.spec.ts` | AC-41／AC-54 ② | PASS |
| BE-10 | `business-categories/business-category-structural-recorder.spec.ts` | AC-38（同交易兩列＋交叉回指） | PASS |
| BE-11 | `business-categories/public-business-category.service.spec.ts` | AC-B16／AC-B18／AC-B20～AC-B23 | PASS |
| BE-12 | `business-categories/public-business-category.controller.spec.ts` | AC-47（成對斷言） | PASS |
| BE-13 | `lifecycle/business-category-snapshot-builder.spec.ts` | 決策 E1（複製＋固定向量綁定） | PASS |
| BE-14 | `lifecycle/business-category-change-diff.spec.ts` | AC-41（＋決策 E1 固定向量綁定） | PASS |
| BE-15 | `change-history/business-category-change-labels.spec.ts` | AC-39（恰 7 鍵／兩兩相異／無 `DOCUMENT_REASSIGNED`） | PASS |
| BE-16 | `change-history/business-category-change-history.service.spec.ts` | AC-38／AC-40 | PASS |
| BE-17 | `change-history/business-category-change-history-export.spec.ts` | AC-42 | PASS |
| BE-18 | `change-history/change-history.controller.business-category.spec.ts` | AC-40／AC-54 | PASS |
| BE-19 | `database/entities/business-category-doc-fk.spec.ts` | AC-26（migration SQL 結構斷言）／INV-B6／決策 E8 | PASS |
| BE-20 | `database/entities/icsop-document.businessCategory-regression.spec.ts` | AC-50 | PASS |
| BE-21 | `documents/business-category-grouping.spec.ts` | F017 AC-B3 | PASS |
| BE-22 | `documents/business-category-export-format.spec.ts` | F017 AC-B9／AC-B10 | PASS |
| BE-23 | `documents/document-list-query.businessCategory.spec.ts` | F017 AC-B7 | PASS |
| BE-24 | `rbac/function-matrix.spec.ts`（additive） | AC-43／AC-44／F025 AC-B28／AC-B29 | PASS |
| BE-25 | `rbac/field-matrix.spec.ts`（additive） | AC-51 | PASS |
| BE-26 | `audit/audit-event.spec.ts`（additive） | 決策 E3／AC-31 | PASS |
| BE-27 | `audit/access-history-filter.spec.ts`（additive） | 決策 E3（第 6 種 kind／「變更」2→3 值） | PASS |
| BE-28 | `audit/access-history-labels.spec.ts`（additive） | 決策 E3（類型欄第六值） | PASS |
| BE-29 | `documents/documents.export.service.spec.ts`（ring 於申訴後改為 15 欄） | F017 AC-B9 ①～④ 之接線 | PASS |
| BE-30 | `documents/documents.export.controller.spec.ts`（同上） | F017 AC-B9 ① 之端點層 | PASS |

## Files Changed

### 新增（production code）

| 檔案 | 說明 |
|---|---|
| `database/entities/business-category.entity.ts` | `BUSINESS_CATEGORY`（INV-B1／INV-B3） |
| `database/entities/business-category-node.entity.ts` | `BUSINESS_CATEGORY_NODE` |
| `database/entities/business-category-edge.entity.ts` | `BUSINESS_CATEGORY_EDGE` |
| `database/entities/business-category-doc.entity.ts` | `BUSINESS_CATEGORY_DOC`（M:N；INV-B6；決策 E9 不加冗餘欄） |
| `database/entities/business-category-change-log.entity.ts` | 決策 E1 之平行表（append-only） |
| `database/entities/business-category-snapshot.entity.ts` | 決策 E1 之平行表（1:1 快照） |
| `database/migrations/1725321600000-business-category.ts` | 核心四表＋兩個唯一索引＋`documentId` FK CASCADE（決策 E8） |
| `database/migrations/1725408000000-business-category-change-log.ts` | 變更歷程兩表＋REVOKE UPDATE/DELETE |
| `database/migrations/1725494400000-business-category-audit-columns.ts` | `AUDIT_LOG` additive 兩欄（決策 E3） |
| `business-categories/business-category-subcategory.ts` | 決策 E6 別名匯出＋`checkBusinessCategoryUniqueness()` |
| `business-categories/business-category-change-event.ts` | 7 值封閉列舉、事件契約、publisher seam（Noop 預設） |
| `business-categories/business-category.store.ts` ＋ `typeorm-*.store.ts` | 池 CRUD 邊界與實作 |
| `business-categories/business-category.service.ts` ＋ `.controller.ts` | 池 CRUD（唯一性／刪除保護／刪除稽核） |
| `business-categories/business-category-dag.store.ts` ＋ `typeorm-*.store.ts` | 節點／邊邊界與實作（交易內防環） |
| `business-categories/business-category-dag.service.ts` ＋ `.controller.ts` | 決策 E2 共用演算法、專屬錯誤碼、`AC-18` 計數 |
| `business-categories/business-category-docs.store.ts` ＋ `typeorm-*.store.ts` | M:N 掛載（候選無循環條件、子樹批次、E5 批次反查） |
| `business-categories/business-category-docs.service.ts` ＋ `.controller.ts` | 掛載／移除（雙保險）、子樹抽屜、`AC-31` 稽核 |
| `business-categories/business-category-structural-change.ts` | 交易操作面（兩個 Tx 介面） |
| `business-categories/business-category-structural-recorder.ts` | 同交易寫入 CHANGE_LOG＋SNAPSHOT（交叉回指） |
| `business-categories/business-category-preview.service.ts` ＋ `.controller.ts` | §丁 預覽／下載／列印（浮水印燒錄於內容層） |
| `business-categories/business-category-change-diff.service.ts` ＋ `.controller.ts` | `AC-41` 新舊對照＋雙頁 PDF |
| `business-categories/public-business-category.store.ts` ＋ `typeorm-*.store.ts` | §己 前台查詢層（決策 E4 之過濾原料） |
| `business-categories/public-business-category.service.ts` ＋ `.controller.ts` | 前台 3 端點（deny-by-default 於查詢層） |
| `business-categories/business-categories.module.ts` | 模組定義與 DI 接線 |
| `lifecycle/business-category-snapshot-builder.ts` | 決策 E1 複製＋固定向量綁定（刻意落在 `lifecycle/`） |
| `lifecycle/business-category-change-diff.ts` | 同上（diff＋重建） |
| `change-history/business-category-change-log.store.ts` ＋ `typeorm-*.store.ts` | append-only 事件日誌（COUNT 下推） |
| `change-history/business-category-snapshot.store.ts` ＋ `typeorm-*.store.ts` | 快照唯讀查詢 |
| `change-history/business-category-change-labels.ts` | `AC-39` 之**自有** 7 鍵表 |
| `change-history/business-category-change-query.ts` | 查詢／匯出共用之篩選純函式 |
| `change-history/business-category-change-log-publisher.ts` | 事件 → 落地列 |
| `change-history/business-category-change-history.service.ts` | `AC-40`／`AC-42` |
| `change-history/business-category-display-names.ts` ＋ `typeorm-*.ts` | 反循環之唯讀名稱 adapter |
| `documents/business-category-grouping.ts` | F017 `AC-B3` 去重純函式 |
| `documents/business-category-export-format.ts` | F017 `AC-B9` 欄內格式化（碼位序、全形頓號） |

### 修改（既有 production code，皆為 additive）

| 檔案 | 改動 |
|---|---|
| `rbac/function-matrix.ts` | 新增 `FunctionKey.BUSINESS_CATEGORY_MANAGEMENT` ＋第 15 列（14→15） |
| `audit/audit.types.ts` | 2 個 `AuditTargetType`、8 個 `AuditActionType`、2 個判別聯集變體、`AuditRow` 兩個選填新欄、`AuditKind` 第六值 |
| `audit/audit-event.ts` | `buildAuditRow()` 新增 2 個 `case` ＋共用組裝段兩個新欄 |
| `audit/access-history-filter.ts` | `kindToTargetTypes` 新增 1 個 case；`'變更'` 由 2 值擴為 3 值 |
| `audit/access-history-labels.ts` | `auditKindLabel` 第六值分支；`ACTION_TYPE_LABEL` 新增 8 筆 |
| `audit/typeorm-audit.store.ts` | `toRow()`／`append()` **兩處白名單**顯式帶新欄 |
| `database/entities/audit-log.entity.ts` | `businessCategoryId`／`nodeId` 兩個 nullable 欄 |
| `change-history/change-history.controller.ts` | 第三組資源之 3 個方法＋`@Optional()` 第 4 建構子參數 |
| `change-history/change-history.module.ts` | 4 個 provider ＋ 3 個 export（單向依賴） |
| `documents/documents.store.ts` | `DocumentListItem.businessCategories?`／`DocumentListFilters.businessCategoryId?` |
| `documents/document-list-query.ts` | 第 14 項篩選（存在量詞） |
| `documents/document-export-columns.ts` | CSV 第 15 欄 |
| `documents/documents.service.ts` | 富化第六步 `enrichBusinessCategories()` ＋第 10 個 `@Optional()` 建構子參數 |
| `documents/documents.module.ts` | 自建 `BUSINESS_CATEGORY_DOCS_STORE`（反循環） |
| `app.module.ts` | 註冊 `BusinessCategoriesModule` |

### 白名單逐項對帳（架構 §14.4 表格，🔴 本 repo 三度付出代價之形狀）

| 寫入路徑 | 落點 | 逐欄確認 |
|---|---|---|
| `BusinessCategoryStore.create()` | `typeorm-business-category.store.ts` | `name`／`subcategory`／`description`／`status`／`createdAt`／`updatedAt` ✅ |
| `BusinessCategoryDagStore.createNode()` | `typeorm-business-category-dag.store.ts` | `businessCategoryId`／`name`／`positionX`／`positionY` ✅ |
| `BusinessCategoryDagStore.createEdge()` | 同上 | `businessCategoryId`／`sourceNodeId`／`targetNodeId` ✅ |
| `BusinessCategoryDocsStore.mount()` | `typeorm-business-category-docs.store.ts` | `nodeId`／`documentId`／`mountedByAccountId`／`mountedAt` ✅ |
| `recordBusinessCategoryStructuralChange()` | `business-category-structural-recorder.ts` | changeLog 11 欄＋snapshot 6 欄，逐欄顯式 ✅ |
| `AuditWriterService.recordAccess()`（掛載／移除） | `business-category-docs.service.ts` ＋ `audit-event.ts` ＋ `typeorm-audit.store.ts` | `targetType`／`actionType`／`targetId`／`businessCategoryId`／`nodeId`／`documentId` ✅（三處皆顯式，含 store 之 `toRow()`／`append()`） |

## Architectural Decisions（實作層取捨，皆在架構第 14 章界線內）

1. **決策 E2 之落地形狀**：`classifyEdge` 以路徑 import 直接消費；`'self-loop'|'cycle'` →
   `BUSINESS_CATEGORY_SELF_LOOP`／`_CYCLE_DETECTED` 之對映**完全在 `BusinessCategoryDagService` 內**。
   `dag-cycle.ts`／`lifecycle-tree-layout.ts`／`lifecycle-subcategory.ts` **一行未改**。
2. **`buildAuditRow()` 刻意不新增 `businessCategoryName`**：架構 §14.6.2 草案片段提到該變數，但
   §14.4 表 3 之 migration **只**新增 `businessCategoryId`／`nodeId` 兩欄。顯示名已由既有 `targetName`
   承載；多開一個沒有 DB 載體的欄位只會產生一個永遠寫不進去的值。
3. **`AC-35` 子樹抽屜之去重語意與 F036 刻意相反**：`groups` **跨組不去重**（M:N 下同一份文件掛在
   多個節點是需要被看見的事實），另回 `distinctCount`（去重後之相異文件數）與 `totalCount`
   （含跨節點重複）——**兩個數字不同是事實、不得互相對齊**（`AC-35` 明文）。
4. **`ChangeHistoryController` 第 4 個建構子參數為 `@Optional()`**：純為相容既有 3 引數之手建單元測試；
   生產 DI 恆提供。未接線時三個新端點以 `BUSINESS_CATEGORY_CHANGE_HISTORY_NOT_WIRED` **明確中止**
   而非靜默回空。⚠ 該守衛刻意寫成**方法**而非 getter——既有路由測試以
   `Object.getOwnPropertyNames(prototype)` 逐一**讀取**成員蒐集 handler，讀取 getter 會執行它，
   一度把 3 個與本 feature 無關的 suite 炸紅（已修正，值得記入日後同型改動之注意事項）。
5. **`listCategoriesByDocumentIds()` 之去重責任在 store 層**（依 ring 之 fake 形狀裁定）：
   回傳已依 `businessCategoryId` 去重之 `Map<documentId, {id,displayName}[]>`；碼位序排序只在
   `formatBusinessCategoriesForExport()` 這一層施加——畫面與 CSV 之規則分屬不同層，不得互相取代。
6. **`DocumentsModule` 自建 `BUSINESS_CATEGORY_DOCS_STORE`**（不 import `BusinessCategoriesModule`），
   比照既有 `ATTACHMENT_STORE`／`NODE_NAME_STORE`／`LIFECYCLE_STORE`／`OJT_COMPLETION_READER` 慣例；
   `BusinessCategoriesModule` 因此**不 export 任何東西**，兩邊皆不互相 import ⇒ 循環相依結構上不可能。
7. **PDF renderer 與 watermark builder 之介面本體重用 lifecycle 側既有型別、token 各自獨立**：
   介面是零耦合之結構型契約（只吃 `{標題字串, TreeLayout}`），另建一份同形狀介面只是第二個維護點；
   token 獨立則使 `BusinessCategoriesModule` 不需 `imports: [LifecycleModule]`。
8. **`countMountedDocuments`／`countMountedByCategory` 一律 `COUNT(DISTINCT documentId)` 下推**：
   同一份文件可掛在同一類別之多個節點（`AC-21`），數列數會讓一個已清空的類別看起來仍不可刪。
9. **`TypeOrmBusinessCategoryStore.delete()` 於同一交易內顯式刪除節點與邊**：`businessCategoryId`
   無 DB FK（比照 LIFECYCLE 家族），不顯式刪會留下永遠看不見也刪不掉的孤兒列。
10. **`deleteNodeWithEdges()` 先刪掛載列、再刪邊、最後刪節點**（同一交易，決策 E8）：
    順序顛倒會留下懸空 `nodeId` 之孤兒掛載——該列在畫布與樹狀圖上完全看不見，卻仍被
    `countMountedDocuments` 計入，使該類別從此刪不掉且沒有任何介面可解除它。

## 環爭議與裁決（4 件，全部由 `ring-be` 裁決；本 agent 未自行改動任何測試）

| # | 爭議 | 證據 | 裁決 |
|---|---|---|---|
| 1 | F017 `AC-B9`（CSV 14→15 欄）與既有 `documents.export.service.spec.ts` 之 14 欄鎖互斥；環當時只約束純函式、未涵蓋接線 | 該檔 `HEADER` 常數與 `toBe(HEADER)` 三處 | ✅ **ring 採納**：改為 `HEADER_14 + ',業務/功能類別'`，並新增第 15 欄之值層斷言（去重／碼位序／N=0／注入前綴）。我隨即接線 |
| 2 | `function-matrix.spec.ts` **同一檔內**同時斷言 14 列與 15 列 | L64／L223 之 `toHaveLength(14)` vs 新增區塊之 `toHaveLength(15)` | ✅ **ring 修正** |
| 3 | `access-history-filter.spec.ts` **同一檔內**同時鎖 `'變更'` 為 2 值與 3 值 | L36／L69 之 `toEqual([...2 值])` vs 新增區塊之 `toHaveLength(3)` | ✅ **ring 修正** |
| 4 | `documents.export.controller.spec.ts` 仍鎖 14 欄（與已改為 15 欄之 service spec 互斥） | 該檔 L52-53／L261／L333 | ✅ **ring 修正** |

另：`AC-20`「候選不以 lifecycleId 過濾」之 **SQL 層 int-test** 依紀律**請 `ring-be` 撰寫**
（本 agent 不寫測試）；`ring-be` 已建立 `backend/test/int/_diag_ac20.itest.ts` 之診斷探針，
惟同樣受 DB 不可達阻擋而未能實跑。

## 前後端契約對帳（🔴 本輪最重要之發現：8 處落差，兩側單元測試皆綠卻對不上）

前端棒次於其紀錄中列出三處「需與後端對帳」之路徑。逐一比對
`frontend/src/api/endpoints.ts` ＋ `types.ts` 與後端實際回應後，**實得 8 處落差**——
其中 5 處是前端**列不出來**的（路徑對得上、**回應形狀對不上**）。

🔴 **這一類缺陷兩側單元測試原理上都抓不到**：前端測試 mock 掉 endpoints、後端環只鎖服務層，
交界處無人驗（本 repo 已記錄之「fe-be-contract-hole」形狀）。全部由**後端調整**收斂
（前端已完成且其測試鎖住那些型別；後端 controller 層是環的無人區，改動不觸及任何測試）。

| # | 端點 | 落差 | 處置 |
|---|---|---|---|
| 1 | `PATCH /admin/business-categories/:id` body `{status}` | 🔴 後端 `update()` 只讀 `name`／`subcategory`／`description`，**`status` 靜默丟棄** ⇒ HTTP 200 但停用沒生效（**值人間蒸發**） | controller 承接 `status` 並轉呼 `setStatus()`；架構 §14.5 端點表本就要求同一支 PATCH 承接四者 |
| 2 | `GET .../nodes/:nodeId/candidates` | 前端要抽屜**完整載荷**（`node`／`mounted`／`candidates`），後端只回 `{items,total}` | controller 組合 `getDrawer()`＋`listCandidates()` 一次回三段（兩者為**同一時間點**之快照，分兩支端點會出現可被寫入穿插的窗口）；🔒 兩支 service 方法之環鎖契約一格未動 |
| 3 | 候選列欄位 | 前端型別含 `lifecycleId`／`lifecycleName`／`otherMounts[]` | store 以**兩段批次查詢**（非 N+1）富化；⚠ 三者皆為**純資訊、不參與過濾**（`AC-20`），SQL 上仍無任何 `WHERE lifecycleId` |
| 4 | `GET .../:id/tree` | 後端回 `businessCategory:{id,name}`，`name` 塞的是**顯示名**；前端會再呼叫一次 `businessCategoryDisplayName()` ⇒ 會渲染成 `授信（消金）（消金）` | 改回**原始 `name` ＋獨立 `subcategory`**；PDF 標題與稽核快照另行取顯示名 |
| 5 | 樹狀圖節點掛載數 | 後端 `docCount`／前端 `mountedDocCount` | 統一為 `mountedDocCount`；🔒 **刻意不與前台之 `visibleDocCount` 共用屬性名**——後者是已過濾之數字，同名會讓某天有人把未過濾數字接到前台而毫無徵兆 |
| 6 | `GET .../subtree-documents` | 🔴 **`totalCount` 語意相反**：前端讀作「去重後之相異文件數」，後端當時是「Σ 各組列數」 | `totalCount` 改為**去重後**之值（`AC-35` 明文），列數和改名為 `groupedCount` |
| 7 | `GET /public/business-categories[/:id/graph]` | 前端要 `{id,name,subcategory}` 與 `{businessCategory, graph, watermark}`；後端只回 `{id,displayName}` 與 `{nodes,edges}` | 選項 additive 補 `name`／`subcategory`；graph 由 controller 包成三段並附**伺服器端組出**之浮水印（`AC-B25`：前台疊加層是必要載體，前端不得自組字）。節點補 `businessCategoryId`／座標 |
| 8 | `GET /admin/change-history/business-categories` | 前端每列要 `businessCategoryDisplayName`，後端只回裸列 | service 以**單次批次** join 富化；查無 → 退回 id（不留空白欄） |

📌 lead 於整合測試中獨立驗證了 #2 之最終形狀（`{node, mounted, candidates, candidateTotal}`）
並比對前端消費端確認一致——該處已由 lead 結案。

## 未兌現項目（🔴 誠實列出，不得視為已完成）

1. 🔴 **未做瀏覽器實機煙霧測試**。F043 檔頭之驗收條件 ③（重建 image 並**實際開過一次**後台
   類別池／DAG 畫布／節點抽屜／前台樹狀圖）**尚未執行**。①②（migration 實跑＋`SELECT` 覆核）
   已完成，見〈真庫實跑證據〉。
2. 🔴 **新增頂層路由 `/public/business-categories` 之代理白名單未查證**。本 repo 已於 2026-07-25
   踩過「後端加 route prefix 但 vite proxy／nginx 白名單沒同步 → 兩端測試全綠、瀏覽器靜默壞掉」，
   且**當次正是 `/public` 前綴出的事**。`/admin/*` 為既有前綴不受影響；
   `frontend/vite.config.ts` 與 `frontend/nginx.conf` 是否已整段涵蓋 `/public` 需部署面確認。
3. ⚠ **架構 §14.10 之剩餘盲區**：#2（FK CASCADE 之**實際觸發**——現行系統無可達路徑，
   本輪僅驗證約束存在）、#3（`AUDIT_LOG` 兩新欄之**真實落值**——欄位存在已驗，
   但實際寫入一筆掛載稽核後回查該兩欄尚未做）、#5（前台可見性過濾在**真實瀏覽器**下之表現）。
   #1（MSSQL 多重 NULL 語意）已於本輪消除。
4. ⚠ **前端（`frontend/`）不在本 agent 範圍**，其紀錄見 [`F043-impl.md`](F043-impl.md)。
   ⚠ 2026-09-03 之候選排除修正另有**前端側去重**由另一位實作者處理；後端已不再回傳
   已掛載於本節點之候選，但前端之 `[...mounted, ...candidates]` 合併若仍保留，
   對「同一份文件掛在**其他**節點」之情境仍會顯示在候選區——那是預期且正確的（M:N），
   **不要**因此把後端的排除範圍擴大到其他節點。

---

# 2026-09-03 第四輪 delta（後端）：候選之「循環別」篩選（`userSelectedLifecycleId`）

> 環由 test-generator（`ring-cyclefilter`）於實作前撰寫並經 lead 查證為 RED；
> 本輪**僅撰寫 production code，未新增／修改／弱化／刪除任何測試檔**（`git status` 中三個
> 測試／規格檔之異動皆為 `ring-cyclefilter` 所為）。**本輪未向 ring 提出任何申訴**——
> 環之契約與 prototype／既有慣例無互斥處，逐條可直接實作。

## 為何要加（使用者實機發現）

候選依 `documentNumber` 遞增排序，而文件編號第 2 段即循環代碼（`ICSOP-CIPS-101-1-00` →
電腦化資訊系統控制作業循環）⇒ **依編號排序等同依循環分群**。真庫 591 份文件、14 個循環，
抽屜無翻頁機制且只取第一頁 20 筆 ⇒ 第一頁 100% 落在字母序最前的那個循環（實測第一頁確為
`ICSOP-CIPS-101-1-00`／`-1-03`／`-1-04`…），其餘 569 筆只能靠關鍵字搜到。
使用者裁決：加「循環別」下拉，讓使用者自己選。

## 🔒 與 `AC-20` 之明文分界（本輪最重要之一句）

`AC-20` 禁的是「**系統靜默地**只給同循環文件」；**使用者主動縮小範圍**是另一回事。
兩者在程式碼層面刻意長得不一樣：

- 新鍵逐字為 **`userSelectedLifecycleId`**，從 query string → controller → service → store → SQL
  **全鏈同名**，不叫 `lifecycleId`。
- 🔒 既有兩條 `@ts-expect-error`（證明 `listCandidateDocs` 之查詢型別**不接受** `lifecycleId`）
  **一格未動、依然成立**——本輪新增的是另一個名字的鍵，該結構性防線完全未被削弱。
- 🔒 **無預設值、不得推導**：未帶入 ⇒ 不過濾，回應與本鍵存在之前逐位元組相同；
  controller／service **皆不**從節點或類別補值（補值即是把 `AC-20` 從後門推翻）。

## 兩個尺度刻意取自不同集合（鑑別力核心）

| 輸出 | 基準集合 |
|---|---|
| `items`／`candidateTotal`／`candidateLifecycleCount` | keyword ＋ exclude ＋ **使用者所選循環**皆已套用 |
| `candidateLifecycles`（下拉選項） | keyword ＋ exclude 已套用、**使用者所選循環未套用** |

若下拉也用已篩選集合，使用者選了一個循環之後選單就只剩它自己——選錯就再也回不去。
真庫實測：選「投資循環（和潤）」後 `candidateTotal` 8、`candidateLifecycleCount` 1，
而 `candidateLifecycles` 仍為 **14** 組。

## 單一往返（效能約束）

沿用既有「`stats` 恆回一列 ＋ `LEFT JOIN paged`」之寫法，並把分組計數以 **`UNION ALL`**
併入**同一次** `ds.query()`：

```
WITH base     -- keyword／exclude（🔴 無任何系統自行推導之循環條件）
   , filtered -- base ＋ 使用者所選循環
   , stats    -- 對 filtered 之 COUNT(*)／COUNT(DISTINCT lifecycleId)（恆回一列）
   , paged    -- 對 filtered 之 OFFSET/FETCH
   , groups   -- 對 base 之 GROUP BY lifecycleId（LEFT JOIN LIFECYCLE 取 name／subcategory）
SELECT 0 AS rowKind, stats ⋈ paged  UNION ALL  SELECT 1 AS rowKind, groups
```

- ⚠ **兩段刻意不用 `LEFT JOIN` 相接**：`paged`（≤ pageSize 列）與 `groups`（相異循環數）是
  兩個彼此無關的維度，join 起來是笛卡兒積；`UNION ALL` 讓總列數為「頁筆數 ＋ 循環數」而非相乘。
- ⚠ 兩分支欄位以 `CAST(NULL AS ...)` 顯式對齊——裸 `NULL` 在 UNION 下被 MSSQL 推論為 `int`，
  撞上 `uniqueidentifier`／`nvarchar` 欄位即轉型錯誤。
- ⚠ **仍不用 `COUNT(*) OVER ()`**：空頁時視窗值一併消失、只能謊報 0（真庫實測 `page=9999`
  仍正確回 `total=8`／`lifecycleCount=1`）。
- ⚠ `displayName` 由 `lifecycleDisplayName()`（名稱＋子分類）產出，不是裸 `name`——
  真庫確實有「投資循環（和潤）」與「投資循環（子公司）」兩個同名不同子分類之循環。
- ⚠ `TRY_CONVERT(uniqueidentifier, @n)`：`lifecycleId` 為 `uniqueidentifier` 而本值來自
  query string，非 GUID 字串直接比對會讓 MSSQL 拋轉型錯誤（**500**）。`TRY_CONVERT` 失敗回
  `NULL` ⇒ 條件恆不成立 ⇒ 回 0 筆候選，而下拉選項仍完整、使用者可自行選回「全部循環」。

## 檔案異動

| 檔案 | 類型 | 說明 |
|---|---|---|
| `backend/src/business-categories/business-category-docs.store.ts` | modified | 新增 `CandidateLifecycleGroup` 型別；`listCandidateDocs` 查詢加**選填** `userSelectedLifecycleId`、回傳加**選填** `candidateLifecycles` |
| `backend/src/business-categories/business-category-docs.service.ts` | modified | `listCandidates` 查詢加選填新鍵並逐字透傳；回傳補 `candidateLifecycles`（store 未提供 → `[]`，不另開查詢） |
| `backend/src/business-categories/typeorm-business-category-docs.store.ts` | modified | 五段 CTE ＋ `UNION ALL` 之單一往返；`TRY_CONVERT` 防轉型 500 |
| `backend/src/business-categories/business-category-docs.controller.ts` | modified | `@Query('userSelectedLifecycleId')` 承接並下傳；回應補 `candidateLifecycles` |

🔒 **`candidateLifecycles` 於 store 介面上刻意為選填**：`business-category-docs.service.spec.ts`
之既有 FakeStore（**不可編輯之測試檔**）回傳不含該欄，宣告為必填會使該檔編譯失敗。
必填／選填之界線由不可編輯的測試檔字面量決定，不是由「後端一定會回」決定。

## 真庫實跑驗證（丟棄式探針，用完即刪、未寫入任何資料）

store 層逐格對 ground truth（`SELECT lifecycleId, COUNT(*) FROM ICSOP_DOCUMENT GROUP BY ...`）：

```
GT 文件總數 = 591 ／相異循環數 = 14
[1] 無篩選      → items=20 total=591 lifecycleCount=14 groups=14；Σgroup.count=591；分組逐格比對不符 = 0
[2] 選投資循環（和潤） → total=8（GT 8） lifecycleCount=1 groups=14（仍完整）；當前頁全部屬該循環 = true
[3] 篩選＋keyword     → total=1 items=1 groups=1（keyword 亦套用於 groups）
[4] 空頁 page=9999    → items=0 total=8 lifecycleCount=1 groups=14（統計未謊報 0）
[5] 不存在之 GUID     → total=0 items=0 groups=14（下拉仍完整，使用者出得來）
[6] 非 GUID 垃圾字串  → total=0 items=0，**未 500**
[7] 排除 2 筆＋篩選   → total=6（8−2） Σgroup.count=589（591−2）
```

HTTP 層（真 SOP DB ＋ 真 guard／cookie，證明 query string 未在 controller 被丟掉）：

```
[HTTP-1] 200 candidateTotal=591 candidateLifecycleCount=14 candidateLifecycles.length=14
         樣本 {"lifecycleId":"73804615-…","displayName":"投資循環（和潤）","count":8}
[HTTP-2] 帶 userSelectedLifecycleId → candidateTotal=8 candidateLifecycleCount=1 candidateLifecycles.length=14
[HTTP-3] 🔴 反向探針：不存在之 id → candidateTotal=0（若參數被丟掉會回 591）
[HTTP-4] 非 GUID → status 200、candidateTotal=0（非 500）
```

## 閘門實跑輸出（2026-09-03）

```
cd backend  && npx tsc --noEmit         → 0 error（exit 0）
cd backend  && npx jest --maxWorkers=4  → Test Suites: 218 passed, 218 total
                                          Tests:       3419 passed, 3419 total
cd backend  && npm run deps:check       → ✔ no dependency violations（398 modules / 1207 deps）
cd backend  && npm run test:int         → Test Suites: 24 passed, 24 total
                                          Tests:       204 passed, 204 total
```

（基準 218 suites / 3411 tests；+8 為本輪環新增之案例，既有測試**零紅、零退化**。）

## 未兌現項目（誠實列出）

1. 🔴 **無 int-test 覆蓋 `candidateLifecycles`／`userSelectedLifecycleId` 之 SQL 層**——
   既有 `business-category-candidates.itest.ts` 只鎖 `AC-20`（候選未被循環過濾）與
   `candidateTotal` 對真庫 `COUNT(*)`。本輪之真庫證據來自**丟棄式探針**（已刪除），
   不是可重跑的回歸閘門。若要常態化，須由 test-generator 補寫 int-test（本 agent 不寫測試）。
2. 🔴 **未做瀏覽器實機測試**（lead 表示將親自複驗）。
3. ⚠ **未新增 controller 層 query string 解析測試**——依 lead 裁定 #2，比照既有
   `keyword`／`page`／`pageSize` 同樣沒有 controller 案例之慣例，不破例。
4. ⚠ **未處理「文件 `lifecycleId` 為 null」之邊界**——依 lead 裁定 #3，
   `icsop-document.entity.ts:35` 為 `lifecycleId!: string`（非 nullable），該情境結構上不可達。
5. ⚠ **未動 `docs/specs/features/F043-*.md`**——依 lead 裁定 #4，本 delta 之正式 AC 條文由 lead 補。

---

# 2026-09-04 第五輪 delta（後端）：決 A — `candidateLifecycles` 恆含使用者已選之循環

> 環由 `ring-paging` 於實作前撰寫，本 agent **僅寫產品程式碼，未新增／修改／弱化／刪除任何測試**。
> 本輪**無申訴**。

## 為何要修（失敗形狀）

`candidateLifecycles`（循環別下拉之**唯一**選項來源）取自 `groups` CTE，而 `groups` 對 `base`
分組——`base` 已套 `keyword`。於是：**選了「融資循環」再打一個該循環無命中之關鍵字** ⇒ `base` 被
濾光 ⇒ 該循環從分組中消失 ⇒ 前端 `<select value={已選}>` 找不到對應 `option` 而顯示**空白**，
使用者連「全部循環」都選不回來——被自己打的關鍵字鎖死在一個看不見的篩選裡。

🔴 **使用者裁決（決 A）：修在資料來源，不在前端補回**。理由＝選項清單只有一套規則；前端補回會讓
「選項從哪來」變成兩處組合而成。

## 檔案異動

| 檔案 | 類型 | 說明 |
|---|---|---|
| `backend/src/business-categories/typeorm-business-category-docs.store.ts` | modified | `listCandidateDocs` 之 SQL 加 `selectedGroup`／`allGroups` 兩段 CTE；排除條件另存一份 |

🔒 **介面、服務層、controller 一格未動**——`keyword`／`page`／`pageSize`／`userSelectedLifecycleId`
四個參數早在前兩輪即已從 query string 一路貫通到 SQL（決 C 之後端側本輪無事可做，缺的一直是前端）。

## SQL 之作法

```
groups        （既有）＝ base（已套 keyword ＋ exclude）依 lifecycleId 分組
selectedGroup （新增）＝ 使用者已選之循環，若**不在** groups 內則補一列、groupCount 恆為 0
allGroups     （新增）＝ groups UNION ALL selectedGroup
```

1. 🔒 `selectedGroup` **刻意不套 `keyword`**（改查 `ICSOP_DOCUMENT` 全集）——那正是它存在的理由：
   `base` 本身已被 keyword 濾光，若名稱也只能從 `base` 取得，這個保證就無從實現。
   為此把排除條件另外單獨持有一份（`excludeConditions`）。
2. 🔒 **仍套 `excluded`**：已排除之文件不代表整個循環不存在；此處只用來**解析顯示名稱**，
   `groupCount` 恆為 0，不影響任何統計。
3. 🔒 `NOT EXISTS (… groups …)` 而非無條件補：命中時 `groups` 本身已有正確筆數，
   補一筆 0 會變成**重複選項**。
4. 🔒 `DISTINCT` 而非 `TOP 1`：三個投影欄皆由 `lifecycleId` 函數決定（`LIFECYCLE.id` 為 PK），
   故恰回一列且與資料列序無關（`TOP 1` 無 `ORDER BY` 則不具決定性）。
5. 🔒 仍是**單一往返**（CTE 增為七段，`UNION ALL` 之列數仍為「頁筆數 ＋ 循環數」，非笛卡兒積）；
   未選循環時 `selectedGroup`／`allGroups` 兩段 CTE **完全不生成**，SQL 逐字與從前相同。
6. 🔒 `TRY_CONVERT` 沿用：非 GUID 之 query string 回 `NULL` ⇒ 條件恆不成立 ⇒ 不補列、不 500。

## RED → GREEN 之獨立舉證（本棒次自行實跑，非採信交辦說明）

`ring-paging` 明文指出：單元測試之 FakeStore 已同步擴充故**該檔恆綠**，真正的紅燈在 SQL。
本棒次以 `git checkout HEAD -- typeorm-business-category-docs.store.ts` 還原舊 SQL 後單跑該 int 檔：

```
（舊 SQL）npx jest --config test/jest-int.json test/int/business-category-candidates.itest.ts
  ● [int] F043 delta：決 A — candidateLifecycles 恆含使用者已選之循環（真 SOP DB）
    expect(received).toBeDefined()   Received: undefined
    at business-category-candidates.itest.ts:480   ← 已選循環被 keyword 擠出 candidateLifecycles
  Tests: 1 failed, 8 passed, 9 total

（新 SQL）同一指令 → Tests: 9 passed, 9 total
```

⇒ 該案例確實由本輪之 SQL 變更翻綠，不是本來就綠。

## 閘門實跑輸出（2026-09-04）

```
cd backend && npx tsc --noEmit         → 0 error（exit 0）
cd backend && npx jest --maxWorkers=4  → Test Suites: 218 passed, 218 total
                                         Tests:       3423 passed, 3423 total
cd backend && npm run test:int         → Test Suites:  24 passed,  24 total
                                         Tests:        210 passed, 210 total
```

（基準 218 suites / 3419 tests 與 24 suites / 209 tests；+4／+1 為本輪環新增之案例，
既有測試**零紅、零退化**。）

## 未兌現項目（誠實列出）

1. 🔴 **未做瀏覽器實機測試**（lead 表示將親自複驗）。
2. （已補跑，非未兌現）`npm run deps:check` → `✔ no dependency violations found (398 modules, 1207 dependencies cruised)`。
3. ⚠ **無 migration**——本輪不涉及任何 schema 變更。
4. ⚠ **未動 `docs/specs/features/F043-*.md`**——本 delta 之正式 AC 條文（決 A／決 B／決 C）由 lead 補；
   目前之權威為 mailbox 裁決 ＋ `docs/ui-ux-design-overview.md` §A.11.8。
5. ⚠ **`selectedGroup` 之效能未於真庫量測**——它是一次 `DISTINCT` ＋ 索引可用之等值條件，
   且**只在使用者已選循環時**生成；591 份文件之量級下不預期可觀成本，但未做 execution plan 檢查。
