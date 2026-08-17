# F011: 編輯 ICSOP 文件與版本對照
Priority: P0-MVP | Status: 🟡 實作（unit 綠；編輯頁欄位對照/取消/儲存＋F014 多值編輯側持久化（doc-seams）；int 已寫未跑，見 implementation-logs/doc-seams-impl.md）｜**循環子分類 delta：🟢 APPROVED（2026-08-07 人類閘門通過，含 4 項裁決）** | Last Updated: 2026-08-07
Epic/Story: E04 / US-031

> **2026-08-07 additive delta**：「所屬循環（循環別）」之編輯改為**兩段式**選取（名稱 → 子分類），並影響新舊值對照之顯示字串。規則權威＝[F040](F040-lifecycle-subcategory.md)；本檔僅加編輯路徑之 AC delta，既有條款一律不變。
> **🔵 2026-08-16 additive delta（使用者裁決；缺失／變更 delta 第 10／11 項）**：① 編輯頁 topbar 動作區新增「返回」鈕（回 `/admin/documents`）；② **「版次」輸入互動語意正式定義**——輸入時不即時補零、失焦（blur）補零至兩位、儲存值恆為 `{YY}'{NN}`，且**建立頁與編輯頁收斂為同一元件**。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta），與既有 `AC-S#` 批次區隔。
> ⚠ **第 ② 項由 `BUG-IMPL` 升級為 `GAP-SPEC`**：既有 AC「Given 修改版次送出, When 儲存, Then 清單顯示新版次、UUID 不變」**僅規範儲存結果、未規範輸入互動**；OQ-D18-15 之裁決引入了新的輸入語意（blur 補零），故必須補 AC，否則 test-generator 建不出對應之環。麵包屑可點之橫切規範見 [F002](F002-role-based-routing.md#home-breadcrumb-delta) `AC-D6`／`AC-D7`。

## Description
編輯既有文件時，每個可編輯欄位並列顯示「目前值」與「輸入中新值」對照；儲存以新值覆蓋原記錄，不留歷史版本，UUID 不變。「所屬節點」欄位在編輯頁**唯讀顯示**目前節點並提供跳轉至畫布（改節點須經 F009）。

當前版本對照涵蓋所有可編輯欄位，以 [data-model.md 19 欄權威定義](../data-model.md#document-entity) 為準；欄位調整後含 **制定公司、制定部門、制定室別、內容摘要、版次（`{YY}'{NN}`，如 `26'01`）、公告日期**（原「當責部門」移除、「發布日期」改名「公告日期」、「人為版本號」改名「版次」；當責室長-主要/次要與使用部門保留）。

## Preconditions
- 文件已存在（F010）；操作者對欄位具寫入權（F026）。

## Main Flow
1. 開啟編輯頁 → 每個可編輯欄位顯示「目前值 / 新值」對照，變更欄位視覺標示。
2. 修改欄位（唯讀欄位如系統 UUID、所屬節點不可進入編輯狀態）。
3. 送出儲存 → 以新值覆蓋，不產生歷史版本檔，UUID 維持不變。
4. 觸發稽核記錄。

## Alternative Flows
- 「所屬節點」欄位：唯讀顯示目前節點，點擊可跳轉至 DAG 畫布（F009）改派。
- **返回清單（2026-08-16）**：編輯頁 topbar 動作區提供「返回」鈕，點擊即離開編輯頁回到後台文件清單（`/admin/documents`）；其行為等同「取消編輯」——不送出、不寫入（AC-D1）。

## Edge Cases
- 取消編輯或離開頁面：原資料不受影響，重開編輯頁欄位為編輯前原值（未被中間輸入污染）。
- 修改後編號違反唯一性：依 F013 阻擋，原資料不受影響。
- **版次序號欄輸入 `0`**（2026-08-16）：輸入框顯示 `0`（**不即時補零為 `00`**）；失焦後顯示 `00`。**現行實作於此處卡死於 `00`，即使用者所述「想輸入 01/02 但畫面無法反應」之成因**（AC-D3）。
- **版次序號欄失焦時為空字串**：不補零、維持空，並依既有必填/驗證規則處理（不得補為 `00`，AC-D4）。
- **版次年度欄**：同一「不即時補零、blur 補零至兩位」規則（AC-D2）。

## Postconditions
- 文件為覆蓋後之當前版本，無歷史版本檔，UUID 不變。

## Acceptance Criteria
- Given 開啟編輯頁, When 載入, Then 每個可編輯欄位皆呈現「目前值/新值」對照。
- Given 修改欄位並確認, When 送出, Then 以新值覆蓋、不留歷史、UUID 不變。
- Given 修改後尚未送出, When 取消或離開, Then 原資料不受影響，欄位維持編輯前狀態。
- Given 修改版次送出, When 儲存, Then 清單顯示新版次、UUID 不變。
- Given 修改後編號違反唯一性, When 送出, Then 依 F013 阻擋，原資料不變。

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**（**2026-08-07 人類閘門裁決 1 收斂**）：Given 編輯頁將「所屬循環」改選為底下設有子分類之名稱, When 僅選定名稱（第一段）、未選子分類（第二段）即按儲存, Then **前端** `resolveLifecycleSelection` 回 `{ ok: false, code: 'LIFECYCLE_SUBCATEGORY_REQUIRED' }` 並阻擋送出，**原文件資料完全不變**。<br>⚠ **後端側**：`LIFECYCLE_SUBCATEGORY_REQUIRED` 僅於 payload **帶有**之 `lifecycleId` 在其名稱下非合法唯一解時觸發（INV-2 髒資料，[F040](F040-lifecycle-subcategory.md) AC-25／AC-26）；編輯 payload **未帶** `lifecycleId` 者依既有三態語意視為「不修改該欄位」，**不觸發本碼**。本次**不新增 `lifecycleName` payload 欄位**。
- **AC-S2**：Given 文件原屬「銷售及收款循環（消金）」, When 改選為「銷售及收款循環（企金）」並送出, Then 儲存成功、`lifecycleId` 更新為後者之 id；「所屬循環」之新舊值對照顯示為「銷售及收款循環（消金）」→「銷售及收款循環（企金）」（兩側字串皆由 `lifecycleDisplayName` 產生，含子分類，使變更可辨識）。
- **AC-S3**：Given 文件原屬一個無子分類之循環且未改動該欄位, When 開啟編輯頁, Then 該欄目前值顯示為該循環之 `name`（不含括號），且不呈現子分類層、不因缺子分類而阻擋儲存（向後相容，[F040](F040-lifecycle-subcategory.md) AC-33）。

### 編輯頁返回鈕與版次輸入互動 delta（🔵 2026-08-16 使用者裁決；缺失／變更 delta 第 10／11 項） {#back-edition-delta}

> 前提裁決：**OQ-D18-15**＝輸入不即時補零／blur 補零至兩位／儲存恆為 `{YY}'{NN}`／建立頁與編輯頁收斂為同一元件。版次之資料型別權威＝[data-model 第 10 欄](../data-model.md#document-entity)（**兩段式字串，非數字**），本 delta **不改變該格式定義**。

- **AC-D1**（返回鈕）：Given ICSOPAdmin 位於文件編輯頁, When 檢視 topbar 動作區, Then 存在一個無障礙名稱為 `返回` 之按鈕（icon 鍵 `arrow-left`，比照 `prototypes/22-lifecycle-tree-preview.html` 之既有慣例）；When 點擊該鈕, Then 導向 `/admin/documents`，且**該次編輯之未送出變更一律不寫入**（文件記錄逐欄與進入編輯頁前相同）。
- **AC-D2**（輸入時不補零）：Given 版次欄之「年度」與「序號」兩個輸入框皆為空, When 於序號框依序鍵入 `0`、`1`, Then 每次擊鍵後該輸入框之 `value` 依序為 `"0"`、`"01"`（**擊鍵過程中不得自動補零、不得截斷**）；年度框同規則（鍵入 `2`、`6` → `"2"`、`"26"`）。
- **AC-D3**（blur 補零至兩位）：Given 序號框之值為 `"1"`, When 該框失焦（blur）, Then 其 `value` 變為 `"01"`；Given 值為 `"01"`, When 失焦, Then 維持 `"01"`（冪等）；年度框同規則（`"6"` → `"06"`）。
- **AC-D4**（blur 空值不補零）：Given 序號框之值為 `""`（或僅空白）, When 失焦, Then 其 `value` 維持 `""`，**不得**變為 `"00"`。
- **AC-D5**（長度上限）：Given 序號框已有兩位數字, When 再鍵入第三個字元, Then 該輸入框之 `value` 維持兩位（超出部分被拒），年度框同。
- **AC-D6**（儲存值格式）：Given 年度框 `"26"`、序號框 `"1"`, When 送出儲存, Then 持久化之 `edition` 恰為 `26'01`（blur 補零後之兩位值，以半形單引號 `'` 分隔）；清單（[F017](F017-backend-document-list.md) 第 10 欄）顯示同一字串。
- **AC-D7**（🔴 建立頁與編輯頁收斂為同一元件；**2026-08-16 驗證載體釐清**）：<br>**① 行為層（兩層皆適用，含 prototype）**：Given 版次輸入互動已實作, When 對 [F010](F010-create-document.md) 建立頁與本 feature 編輯頁**各執行一次** `AC-D2`～`AC-D6` 之全部案例, Then **兩頁之結果逐案完全相同**。<br>**② 結構層（🔴 驗證載體＝前端程式碼，不適用於 prototype）**：Given React 前端實作完成, When 檢視兩頁之原始碼, Then 兩者**`import` 並渲染同一個共用版次輸入 component**（同一模組之單一 export、同一組 props 契約）；**專案中不存在第二份版次輸入之補零/截斷邏輯**。<br>⚠ **② 在 static prototype 上不可字面滿足**——`14-document-create.html` 與 `15-document-edit.html` 為兩個獨立 HTML 檔、無模組系統，其至多只能做到 ① 之「行為逐案相同」（designer 已據此於兩檔同步補上 `onEditionBlur()`）。**test-generator 不得對 prototype 斷言「同一 component」**；② 之斷言對象一律為 `frontend/src/**` 之程式碼結構。<br>⚠ **本條為防漂移之硬要求**：現況為建立頁（獨立 `edYear`／`edSeq` state，行為正確）與編輯頁（自已補零之 `draft.edition` 反解，行為錯誤）各寫一份；僅修編輯頁而不收斂，下一輪必再度漂移——**故 ① 綠燈不足以滿足本條，② 為獨立且必要之要求**。
- **AC-D8**（🔒 既有儲存語意回歸鎖定）：Given AC-D2～AC-D7 實作完成, When 執行既有 AC「Given 修改版次送出, When 儲存, Then 清單顯示新版次、UUID 不變」, Then 維持綠燈；`edition` 之 [data-model](../data-model.md#document-entity) 格式定義（`{YY}'{NN}`）**未變更**，既有 `26'01` 之存量資料不需回填、不需 migration。

- **AC-D9**（🔴 版次輸入之選擇器契約；**2026-08-16 補訂**，權威＝`prototypes/14-document-create.html`／`15-document-edit.html`）：Given 建立頁或編輯頁渲染完成, When 檢視版次欄, Then 存在兩個輸入框，其 `aria-label` **逐字**分別為 `版次年度` 與 `版次序號`；兩者 `maxlength="2"`、`inputmode="numeric"`、placeholder 分別為 `YY` 與 `NN`。<br>📌 **本條之存在理由**：`AC-D2`～`AC-D6` 全數以「年度框」「序號框」指稱兩個輸入，但**未定義任何可供測試選取之掛鉤**；本輪約束環為簡化版（僅 jest/vitest、無 fidelity 測試）⇒ 選擇器未入 AC，test-generator 只能自行臆造。兩頁之 `aria-label` **必須相同**（`AC-D7` ① 之行為逐案相同以此為前提）。
## Error Scenarios
- 唯讀欄位寫入：見 [error-handling.md#permission](../error-handling.md#permission)（`FIELD_WRITE_FORBIDDEN`）。
- 編號重複：見 [error-handling.md#document](../error-handling.md#document)。
- **循環子分類未選定（2026-08-07）**：見 [error-handling.md#lifecycle-subcategory](../error-handling.md#lifecycle-subcategory)（`LIFECYCLE_SUBCATEGORY_REQUIRED`）。

## Related
- Data: [ICSOP_DOCUMENT](../data-model.md#document-entity)
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（兩段式選取、對照顯示字串）
- Depends on: [F010](F010-create-document.md)（**版次輸入元件由兩頁共用，AC-D7**）; 節點改派見 [F009](F009-node-drawer-maintenance.md)
- Related: [F026 角色×欄位矩陣](F026-role-field-matrix.md)；麵包屑可點之橫切規範見 [F002](F002-role-based-routing.md#home-breadcrumb-delta)
- **2026-08-16 使用者裁決**: OQ-D18-15（版次輸入語意）、OQ-D18-21（麵包屑，規範落於 F002）。見 [§編輯頁返回鈕與版次輸入互動 delta](#back-edition-delta)。
