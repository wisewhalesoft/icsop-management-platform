---
type: implementation-log
worktree: public-seams (feature/public-seams)
features: [F019, F026, F018]
status: complete
last_updated: 2026-07-24
test_design: docs/specs/test-design/public-seams-test-design.md
---

# public-seams 實作紀錄：DOC_USING_DEPT 消費端接線 + 使用表單自訂名稱

## 0. 測試結果總覽

| 套件 | 基準（本輪前） | 完成後 | 差異 |
|---|---|---|---|
| backend `npx jest` | 909 測 / 82 suites | **941 測 / 84 suites** | +32 測 / +2 suites |
| frontend `npx vitest run` | 218 測 / 33 files | **236 測 / 34 files** | +18 測 / +1 file |
| `npx tsc --noEmit`（backend / frontend） | 淨 | **皆淨** | — |

整合測試 `backend/test/int/public-documents.itest.ts` **已備未跑**（依交辦：`npm run test:int`
由 orchestrator 於合併後序列執行）。該檔已單獨過 `tsc --noEmit`（backend `tsconfig.json` 之
`include` 僅 `src/**/*`，故主 typecheck 不涵蓋 `test/`，本輪以單檔 tsc 補驗）。
**本輪無新增 migration**（`DOC_USING_DEPT` 由 `1722556800000-doc-org-multivalue.ts` 既有）。

## 1. 各接縫（seam）實作內容

### 1.1 共用純邏輯：`isWithinSubtree`（F026 ／ F019 置頂 ／ F019 部門篩選 三處共用）

`backend/src/org-sync/org-hierarchy.ts` 新增：

```
isWithinSubtree(scopeCode, targetCode): boolean
```

`scopeCode` 之有效前綴（`deriveCodePrefix`，去尾端連續 0）為 `targetCode` 之前綴即為真；
Root（`00000` → 空前綴）對任何 target 皆為真（全公司涵蓋）。三處消費**僅參數角色互換**：

| 消費情境 | 呼叫方式 |
|---|---|
| F019 部門篩選（`matchesDeptFilter`） | `isWithinSubtree(選定篩選單位, 文件使用部門)` |
| F019 置頂（`isPinned`） | `isWithinSubtree(文件使用部門, 使用者部門)` |
| F026「使用部門相符性」AC | 同置頂 |

`matchesDeptFilter` 一併改為呼叫此函式（行為完全不變，僅去除手寫的 `deriveCodePrefix`+`startsWith`
重複，落實 F026 spec §9.1「三者不得各自訂定不同展開規則」）。既有 `TS-F019-006~011` 全數續綠。

### 1.2 F019 置頂語意修正（子樹祖先鏈，取代 OQ-F019-03）

`isPinned` 由「使用部門集合精確含使用者部門」改為「文件之**任一**使用部門為使用者部門之
**祖先或自身**」。文件掛部層 `JA000` 者對掛處室 `JAC00` 之使用者置頂；掛 Root `00000`（全公司）
者對所有人置頂；同部兄弟處室不置頂；掛比使用者更細之單位不置頂；使用者無部門一律不置頂。

### 1.3 F019 真實 `DOC_USING_DEPT` 讀取路徑

`backend/src/public/typeorm-public-documents.store.ts` 移除寫死之 `usingDeptIds: []`，改為
**分離查詢 + JS 端分組**（非 SQL 1:N JOIN）：文件列取回後，以去重 `docIds` 單次
`DocUsingDept.find({ where: { documentId: In(docIds) } })`，再由新匯出之純函式
`groupUsingDeptIds(rows)` 組 `Map<documentId, orgCode[]>`。理由：

1. 1:N JOIN 會使 `ICSOP_DOCUMENT` 列重複展開（需 DISTINCT/GROUP_CONCAT 才不膨脹筆數）；
2. 與同檔既有 `lifecycleName` 解析手法一致（單次 `In()` + Map）；
3. 分組邏輯不需 `DataSource` → **unit 可測**，不必整段推給 [integration]。

無使用部門列之文件仍保留於清單（`usingDeptIds: []`），語意等同 LEFT JOIN。
`groupUsingDeptIds` **刻意不去重**：`UQ_DOC_USING_DEPT_doc_org` 唯一索引已是唯一性防線，
純函式再做防禦性去重只會掩蓋資料異常（設計 §8 待決項，本輪定案為「不去重」並以測試釘住）。

### 1.4 F018 使用表單自訂名稱

- Service 新增 `USAGE_FORM_NAME_MAX_LENGTH = 400`（＝`USAGE_FORM_POOL.name` 之 `nvarchar(400)`）
  與純函式 `resolveUsageFormName(name, fileName)`：trim 後採用；未提供／空字串／純空白 →
  fallback 檔名；長度超限 → `BadRequestException('USAGE_FORM_NAME_TOO_LONG: …')`（400）。
  **長度於 trim 後量測**（前後空白不佔配額）。
- `uploadForm(session, file, name?)` 於格式/大小驗證後套用；`createFromFile` 改收已解析之 name。
- `uploadForms`（批次）與 `overwriteForm`（覆蓋）**刻意不接受** `name`：prototype 19 之
  `fileInput` 無 `multiple`、`doOverwrite` 亦無改名欄位，強行設計將無 UI 驗收依據。
  批次各檔仍經 `resolveUsageFormName(undefined, f.fileName)`（使超長檔名同樣得到明確錯誤碼）。
- Controller `upload()` 新增 `@Body('name') name?: string`，**僅單檔分支**轉發。
- 前端 `uploadUsageForms(files, name?)`：`files.length===1` 且 trim 後非空才 `fd.append('name', …)`。
- 前端 `UsageFormManagementPage.submitUpload()` 改為 `uploadUsageForms([uploadFile], uploadName.trim())`
  ——UI 早已有「表單名稱 *」欄位、已驗證、已顯示於成功訊息，**唯獨未真正送出**，此即本次修的 bug。

### 1.5 前端 prototype 保真修正（`prototypes/03-public-list.html`）

- **置頂區標題**（prototype 第 79 行）：`您部門相關文件 · <span class="text-slate-400 font-normal">營運管理部 / 審查室</span>`
  ——補上缺少的「· {使用者部門路徑}」後綴，class 與既有「其他文件 · 依編號降冪」同構。
- **頁首列**（prototype 第 32-33 行）：由僅顯示葉節點名稱（「審查室」）改為完整路徑
  （「營運管理部 / 審查室」）。新增 `data-testid="topbar-user"` 供測試界定範圍。
- 兩處共用新純函式 `frontend/src/domain/org-path.ts` 之 `buildOrgPath(units, orgCode)`。

**路徑取值規則（OQ-PS-03 定案：以伺服器提供之 `descFull` 為來源，不由前端沿 `parentCode` 自組）**
——沿用 `upstream-hr-source-contract.md` §8.2/§8.3，即 F020 浮水印之同一套算法，全站不出現
第二套「組織全名」邏輯：

- **部** ＝ 部層（`LEFT(CODE,2)+'000'`）之 `descFull`，fallback 本部層 → Root；
- **處/室** ＝ 自身 `name`（← `DESC_CHI`，以 `/` 分段）之**最末段**，僅 SECTION/SUBSECTION 有值
  （課層使用者顯示課名，略過中間處層）；
- 兩段以 ` / ` 相接、空欄收合、**捨本部層** → 與 prototype 逐字相符、且與本專案三級組織模型
  （公司 / 部 / 處室）一致。

> ⚠ 為何不能直接把 `descFull` 當路徑印出：契約 §8.2 明載 `DESC_FULL` 為**串接全名**
> （「營運管理部審查室」）**無分隔符不可拆**；有分段語意的是 `DESC_CHI`。故「部」段取
> 部層那一列的 `DESC_FULL`、「處/室」段取自身 `DESC_CHI` 末段，才是可還原 prototype 之組法。
> 此轉換已由 `org-path.test.ts` 8 個案例逐項釘住（含課層略過處層、fallback 鏈、全無 descFull、
> 查無組織列、無 orgCode 等分支），不留給偶然。

Fallback：組織清單尚未載入／`getOrgUnits()` 失敗回退空陣列 → 顯示 `orgCode` 本身
（不顯示 `undefined`、不崩潰）；使用者無 `orgCode` → 兩處皆不渲染部門段。

### 1.6 圖示註冊缺漏（順帶修正，屬本次修改區塊）

`PublicListPage.tsx` 早已使用 `<Icon name="pin">`（置頂區）與 `<Icon name="list">`（其他文件區）
——對應 prototype 第 78 / 87 行之 `data-lucide="pin"` / `data-lucide="list"`——但兩者**皆未註冊**於
`frontend/src/components/Icon.tsx`，依 `Icon` 實作會**靜默回傳 `null`**（開發模式僅 console.warn）。
本輪於註冊表補上 `pin: Pin`、`list: List`。此為與置頂區標題同一段版面之 prototype 保真缺漏。

## 2. 檔案異動清單

| 檔案 | 類型 | 內容 |
|---|---|---|
| `backend/src/org-sync/org-hierarchy.ts` | modified | 新增 `isWithinSubtree` |
| `backend/src/org-sync/org-hierarchy.spec.ts` | modified | 新增 `TS-PS-ORG-001~007` |
| `backend/src/public/public-list.ts` | modified | `isPinned` 改子樹語意；`matchesDeptFilter` 改用共用 predicate |
| `backend/src/public/public-list.spec.ts` | modified | **改寫** `TS-F019-005` → `TS-PS-F019-001~007` |
| `backend/src/public/typeorm-public-documents.store.ts` | modified | 真實 `DOC_USING_DEPT` 分離查詢＋匯出 `groupUsingDeptIds` |
| `backend/src/public/typeorm-public-documents.store.spec.ts` | new | `TS-PS-F019-STORE-001~005` ＋ 查無 key 之邊界 |
| `backend/src/usage-forms/usage-forms.service.ts` | modified | `USAGE_FORM_NAME_MAX_LENGTH`／`resolveUsageFormName`／`uploadForm(name?)` |
| `backend/src/usage-forms/usage-forms.service.spec.ts` | modified | 新增 `TS-PS-F018-001~009`（含 007b/009b） |
| `backend/src/usage-forms/usage-forms.controller.ts` | modified | `@Body('name')`，僅單檔分支轉發 |
| `backend/src/usage-forms/usage-forms.controller.spec.ts` | new | `TS-PS-F018-010/010b/010c`（轉發契約） |
| `backend/test/int/public-documents.itest.ts` | new | `TS-PS-INT-001~009`（未跑，待 orchestrator） |
| `frontend/src/domain/org-path.ts` | new | `buildOrgPath` / `deriveSectionName` / `departmentCodeCandidates` |
| `frontend/src/domain/org-path.test.ts` | new | `TS-PS-PATH-001~008` |
| `frontend/src/pages/PublicListPage.tsx` | modified | 頁首/置頂標題部門路徑；`data-testid="topbar-user"` |
| `frontend/src/pages/PublicListPage.test.tsx` | modified | 新增 `TS-PS-FE-001~004`；fixture 補 `descFull` |
| `frontend/src/components/Icon.tsx` | modified | 註冊 `pin` / `list` |
| `frontend/src/api/endpoints.ts` | modified | `uploadUsageForms(files, name?)` |
| `frontend/src/api/endpoints.test.ts` | modified | 新增 `TS-PS-F018-FE-005~007` |
| `frontend/src/pages/UsageFormManagementPage.tsx` | modified | `submitUpload` 送出表單名稱 |
| `frontend/src/pages/UsageFormManagementPage.test.tsx` | modified | **改寫** `TS-F018-001` → `TS-PS-F018-FE-001`；新增 FE-002~004 |
| `docs/specs/features/F018/F019/F026-*.md` | modified | 僅 `Status:` 行 |

## 3. 既有測試之改寫（逐項理由）

1. **`backend/src/public/public-list.spec.ts` `TS-F019-005`（原斷言 `isPinned(JA000 文件, JAC00 使用者) === false`）**
   → 改寫為 `TS-PS-F019-001`（期望 `true`）。原斷言固化的是 `OQ-F019-03`「暫依 spec 字面採精確集合
   成員比對」之**暫定假設**，與 `prototypes/03-public-list.html` 第 137-140 行 `USER_SCOPE` 祖先鏈
   實作、以及 `F026-role-field-matrix.md` 之逐字 AC 相牴觸。人類已裁定採子樹祖先鏈，故此為
   「測試編碼了錯誤假設」之情形，屬**應當改寫**而非削弱。原案例之另一半（自身層級相符 → 置頂）
   保留為 `TS-PS-F019-002`，且新增兄弟不相符（`TS-PS-F019-007`）確保子樹展開未過度放寬。

2. **`frontend/src/pages/UsageFormManagementPage.test.tsx:132`（原 `toHaveBeenCalledWith([file])`）**
   → 改寫為 `toHaveBeenCalledWith([file], '放款覆核表.xlsx')`。原斷言逐字鎖定本次要修的 bug 本身
   （名稱未隨 multipart 送出），修復後新舊斷言必然互斥。前半段（名稱自動帶入檔名）原樣保留。

除上述兩處外，**未刪除、未放寬任何既有測試**；`matchesDeptFilter` 之既有 6 案例、F018 既有 30 餘案例
全數原樣續綠。

## 4. 相對測試設計之調整（及理由）

1. **`TS-PS-ORG-007` 期望值改寫**。設計標題寫「target 為非法輸入 → 拋 `RangeError`」，但同案例
   內文與 §8 `OQ-PS-04` 之建議恰好相反（「建議比照現狀，僅 `scopeCode` 防呆」）——兩者互斥。
   本輪採 `OQ-PS-04` 之建議（與既有 `matchesDeptFilter` 不對 `item.usingDeptIds` 逐一防呆之慣例
   一致：篩選條件為外部輸入須防呆，使用部門代碼為已落 DB 之內部資料則信任），並將案例改寫為
   **明確釘住此不對稱**：`isWithinSubtree('X', 'JAC00')` 拋 `INVALID_ORG_CODE`；
   `isWithinSubtree('JAC00', 'X')` 回 `false` 不拋錯。
2. **新增 `TS-PS-F018-010/010b/010c`（controller 轉發契約）**。設計 §4.1 明訂 controller 行為
   （單檔轉發 / 批次不轉發），但未給對應案例；`usage-forms` 原本亦無 controller spec。補此 3 案
   以免「service 正確但 controller 未接線」之縫隙無測試把關。
3. **新增 `TS-PS-F018-007b`（trim 後量測長度）與 `TS-PS-F018-009b`（RBAC 先於名稱驗證）**。
   設計未指定「400 字上限於 trim 前或後量測」與「名稱驗證是否可能繞過權限閘門」，兩者皆為實作
   必然要選邊的行為，補測試釘住。
4. **`TS-PS-PATH-001~008`（前端路徑轉換）為設計外新增測試檔**。設計 §5.2 僅將 `buildOrgPath`
   列為建議並把斷言放在 `PublicListPage.test.tsx`；依人類裁決「寫一個測試釘住該轉換，不留給偶然」，
   另立純函式測試檔逐項覆蓋分支（設計原有之 `TS-PS-FE-001/002/003` 仍原樣落在 `PublicListPage.test.tsx`，
   並補 `TS-PS-FE-004` 無部門使用者）。
5. **`TS-PS-INT-005` 之 `total` 比較法**。設計要求「`total` 與有部門使用者相同」；因整合測試跑在
   真 SOP 庫（既有非 marker 文件亦計入 `total`），實作改為**同一輪內兩次查詢互比 `total`** 並另行
   斷言 marker 文件筆數為 5，語意等價且不受真庫既有資料量影響。整合測試查詢一律帶
   `pageSize=5000`，避免 marker 文件落到第 2 頁而誤判。
6. **整合測試以 `POST /admin/documents` 建立 marker 文件**（而非設計 §6.2 之直接 repo 插入）。
   如此同時走真實**寫入**路徑（`DOC_USING_DEPT` 落地）與**讀取**路徑，`announcedDate` 亦由 API 寫入；
   FK 鏈仍為 `LIFECYCLE`（先建）→ `ICSOP_DOCUMENT` → `DOC_USING_DEPT`，marker 前綴不變，
   harness `cleanupMarkers()` 原樣涵蓋。
7. **`TS-PS-INT-010` 未寫成自動化案例**（依交辦），改以 §5 之程式碼審查結論記錄。

## 5. `TS-PS-INT-010`（分離查詢不產生 N+1）— 程式碼審查結論

`TypeOrmPublicDocumentStore.listCandidates()` 全程僅發出**三次**查詢，且與文件筆數無關：

1. `ICSOP_DOCUMENT` 一次（`createQueryBuilder` + `take(5000)`）；
2. `LIFECYCLE` 一次（`In(去重 lcIds)`，`lcIds.length === 0` 時完全跳過）；
3. `DOC_USING_DEPT` 一次（`In(docIds)`，`docIds.length === 0` 時完全跳過）。

方法體內**無任何迴圈內查詢**：`groupUsingDeptIds` 與最終 `docs.map(...)` 皆為純記憶體運算，
不接觸 `DataSource`。故查詢次數為 O(1)、非 O(n)，N+1 不成立。
另注意 `In(docIds)` 於 MSSQL 會展開為參數清單，受 **2100 參數上限**約束；本 store 之
`take(5000)` 理論上可使 `docIds` 超過該上限。現況 ICSOP 文件規模（corpus ≈ 598 份）距離
2100 尚遠，故本輪不加分批；**若日後文件數逼近 2000，需於此處改為 chunk 後多次查詢**——已於
程式註解外另記於本節，供後續維護者注意。

## 6. 需 orchestrator 於共用凍結文件集中套用之異動

以下三份為平行 track 凍結之共用文件，本輪**未修改**，請 orchestrator 統一套用：

### 6.1 `docs/specs/error-handling.md` — 新增一列

依既有表格欄位格式（條件式具名錯誤碼為本專案慣例，如 `LIFECYCLE_NAME_REQUIRED`、
`DOCUMENT_REQUIRED_FIELD_MISSING`、`FILE_SIZE_EXCEEDED`）新增：

| 錯誤碼 | HTTP | 情境 | 使用者訊息（建議） |
|---|---|---|---|
| `USAGE_FORM_NAME_TOO_LONG` | 400 | 使用表單名稱 trim 後超過 400 字元（`USAGE_FORM_POOL.name` 為 `nvarchar(400)`） | 表單名稱長度上限為 400 字元 |

（實際拋出訊息：`USAGE_FORM_NAME_TOO_LONG: 表單名稱長度上限為 400 字元`，
出處 `backend/src/usage-forms/usage-forms.service.ts` `resolveUsageFormName`。）

### 6.2 `docs/specs/data-model.md` 第 245 行 — 措辭修正（純文件漂移）

現行文字為 `DOC_USING_DEPT：(documentId, orgUnitId)`，但實際持久化實體
`backend/src/database/entities/doc-using-dept.entity.ts` 為 **`(documentId, orgCode)`**
（`varchar(10)` 業務鍵，非 FK UUID；唯一索引亦名為 `UQ_DOC_USING_DEPT_doc_org`）。
建議改為 `DOC_USING_DEPT：(documentId, orgCode)`。本輪一律以實體為權威實作，不受此文字影響。

### 6.3 `docs/specs/feature-status.md` — 三列更新

| 功能 | 建議狀態 | 建議備註（要點） |
|---|---|---|
| **F019** 前台清單瀏覽 | 🟡 → 可評估升 ✅（待 `test:int` 綠） | `DOC_USING_DEPT` 讀取端已接線（分離查詢＋JS 分組，1:N 不膨脹、0 筆列不消失）；**置頂語意定案改子樹祖先鏈**（推翻 OQ-F019-03）；前台頁首/置頂標題補部門路徑（prototype 03 保真）；`pin`/`list` 圖示補註冊；int 已備未跑 |
| **F026** 角色×欄位權限矩陣 | ⬜/Draft → 🟡 | 缺口「使用部門子樹前綴 `orgCode LIKE 'prefix%'` 判定」**已落地**為共用純函式 `isWithinSubtree`，兩條 AC 由 `TS-PS-ORG-002/004` 覆蓋；剩附件/浮水印相關 AC |
| **F018** 使用表單管理 | 維持 ✅/Implemented，備註補一句 | 新增上傳自訂名稱 `name`（multipart 選填、trim、fallback 檔名、上限 400 字＝`USAGE_FORM_NAME_TOO_LONG`；批次/覆蓋刻意不接受） |

另請一併協調 `docs/test-specs/features/F019-test.md` 之 **OQ-F019-03**：標記為
「已由 public-seams 依 prototype 03 + F026 AC 證據推翻，改採 (b) 子樹祖先鏈」。
該檔非本 worktree 所管，故未修改。

## 7. 無法逐項還原之 prototype 細節

無。本輪觸及之 prototype 元素（03 第 32-33 行頁首、第 78-79 行置頂區標題與圖示；
19 之上傳 modal 表單名稱欄與 `submitUpload` 命名語意）皆已逐字/逐結構還原。

兩點刻意保留既有差異（**非本輪缺口，且均為既有已審決之取捨**，於此記錄以免被誤判為新漂移）：

- prototype **19** 之上傳 modal 檔案大小上限標示為「20 MB」並自帶「示範值」徽章，React 頁沿用
  後端權威之 **50 MB**（`MAX_FILE_SIZE_BYTES`）——prototype 該處已自標為示範值。
- prototype 03 之狀態下拉為「狀態：有效」，React 頁為 disabled 之「狀態：已公告」——
  F019 spec 已定案前台僅顯示「已公告」且狀態篩選為裝飾性 no-op（OQ-F019-04），既有實作正確。
