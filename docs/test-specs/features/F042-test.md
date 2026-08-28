---
type: test-design-feature
feature_id: F042
feature_name: OJT 進度管理
priority: P1
related_spec: docs/specs/features/F042-ojt-progress-management.md
last_updated: 2026-08-28
status: draft
---

# F042 — OJT 進度管理 · Test Design（Phase A 骨架）
> source: docs/specs/features/F042-ojt-progress-management.md · E11 US-103／104／105 · 2026-08-27

> ✅ **2026-08-28 人類閘門：16 題 OQ 全數裁決** ⇒ 本檔原「依 `OQ-E11-xx`」之測試方向**已全數收斂為定值**，`AC-01`～`AC-29` **絕大多數可立即建環**。
> ✅ **2026-08-28 三方回填完成、規格側凍結** ⇒ **原兩類「不得建環」之項目已全部解除**：
> ① **`prototypes/13`／`25`／`04` 等已由 ux-ojt 依裁決改版**，三態 icon 鍵與全部逐字文案已定稿；
> ② **`OQ-E11-17`～`OQ-E11-20` 已由 lead 覆核結案**（3 核可、1 否決）⇒ 本檔已無 `[ASSUMPTION]` 建環項。
> ✅ **`prototypes/17` 亦已定稿**（第五類型值 `OJT 場次`／標籤 `場次登記`／`場次刪除`）。
> 🔴 **建環前必讀 [F042 §prototype 25 §7](../../specs/features/F042-ojt-progress-management.md#prototype-25-dom-contract)**：該節原為 12 項「未裁決、不得建環」清單，**已於 2026-08-28 依裁決重寫為 7-A（12 項解除）＋7-B（3 項保留）**——⚠ **若讀到舊版而照表跳過那 12 項，會漏掉本 feature 的核心行為**。
> 🔴 **2026-08-28 Phase A+B 後另有一輪實機修正（`OQ-E11-21`）：TAB1 區一逐筆表之節流** ⇒ 見 **[§三-2](#三-2-2026-08-28-節流修正oq-e11-21之測試方向與預期轉紅)**。⚠ **該輪之轉紅打在本 feature 自己剛寫的測試上**（`ojt-progress.summary.spec.ts`／`OjtProgressPage.test.tsx`），與 §三 之「既有 feature 轉紅」不同批，**不得混為一談**。
> 🔴 **仍不得建環之 3 項（`§7-B`）**：① ~~**區三筆數上限**~~ ✅ **2026-08-28 已解除、可建環**（ux-fix 定稿：`RECENT_MAX_ROWS` ＝ **8**、排序＝最近一次訓練日期由新至舊、`[data-recent-truncation]`；條文＝`AC-16` ①～⑧／`AC-28` ⑱）——📝 原因逐字保留：`07` 只裁窗口天數，prototype 之「不設上限」為 designer 裁量；② **側選單新項之位置**（設計裁量，`AC-27` 只鎖「恰新增一項」不鎖位置）；③ 🔴 **日期錯誤碼字面之跨檔衝突**——見下。
> ✅ **原錯誤碼字面衝突已解決**：ux-ojt 已將 `prototypes/25` 改為 **`OJT_TRAINING_DATE_FUTURE`**（原 `_IN_FUTURE` 留 `OLD>` 追溯），並加了一條**常設斷言**——把畫面上每個 `CODE · 4xx` 字面自動對照 `error-handling.md`，未定義即紅，另有反向哨兵確保 `_IN_FUTURE` 兩邊皆不存在。目前 5 碼全數對得上。
> 🔴 **建環時之取值職權分工（務必分開取）**：
> | 取什麼 | 權威 |
> |---|---|
> | **錯誤碼字面**（`OJT_*`） | [error-handling #ojt-progress](../../specs/error-handling.md#ojt-progress) |
> | **使用者訊息逐字** | [F042 §prototype 25 §6 ⑬](../../specs/features/F042-ojt-progress-management.md#prototype-25-dom-contract)（＝`prototypes/25`） |
>
> ✅ **error-handling 之「使用者訊息」欄已由 sa-ojt 整欄移除**（2026-08-28），該表現僅留「錯誤碼｜HTTP｜觸發情境｜依據」⇒ **已無任何佔位字可供誤抄**，F042 §6 ⑬ 為訊息文案之唯一來源。<br>📌 **移除而非填值之理由**：若兩處各放一份逐字句，就變成兩份文案要同步——**同一組文案兩處各打一份即為分歧起點**（本批已因錯誤碼字面吃過一次虧）。
> 🔴 **為未定值臆造斷言，就是本 repo 已反覆記取之「建出規格從未授權之約束」**（見 [F016](../../specs/features/F016-pdf-ojt-attachment.md) §prototype 載體之權威化前言）。
> **本檔之作用有三**：① 標示哪些 AC 可立即建環、哪些仍等 prototype；② **預先盤點既有測試之轉紅範圍**（`OQ-D9-14` 之緩解要求已成本 repo 慣例：**建環時先盤點、不得事後才發現**）；③ 記錄本批特有之**假綠陷阱**。

## 一、測試策略（草案）

- **unit（backend jest）**：以 `FakeOjtSessionStore`（記憶體 `Map`，記錄新增／查詢呼叫參數）＋既有 `FakeBlobStore` 驅動場次服務之純邏輯——列粒度、累加語意、完成判定、角色解析、驗證順序。比照 [F016-test](F016-test.md) 之既有 Fake 風格。
- **unit（frontend vitest）**：TAB1／TAB2 之渲染與互動、文件表單側之唯讀衍生呈現與**負向斷言**（上傳入口不存在）。
- **[integration]（`npm run test:int`，vs 真 SOP DB ＋ 真 Azure Blob）**：⚠ **本 feature 有兩處只有整合層測得到者**——① **`hasOjt` 之批次查詢次數**（`AC-J15` ⑤ 之 N+1 紅線，單元層以 Fake store 計數可近似，但真 SQL 之往返數只有 int 層算得準）；② **場次與 `DOC_USING_DEPT` 之外鍵行為**（`AC-25`，依 `OQ-E11-02` 之刪除策略）。
- ⚠ **本輪之約束環預期為簡化版**（僅 backend jest ＋ frontend vitest，無 Playwright fidelity／Stryker／dep-cruiser）⇒ **AC 是唯一防線**，`AC-28` 之 DOM 契約若未於棒 4 後回寫，本 feature 之前端項目**將完全無約束**（[F041](../../specs/features/F041-user-subtype-business-scope.md#f2-fidelity-gap) 帳號徽章缺陷之同型風險）。

## 二、AC ↔ 測試方向對照（`AC-01`～`AC-29`）

### 甲、可於 OQ 裁決後**立即**建環者（期望值已明確，僅待前置裁決）

| AC | 測試方向 | 層級 | 阻塞於 |
|---|---|---|---|
| `AC-01` | 使用單位含上下層關係（`JA000` ＋ `JAC00`）之文件 ⇒ **恰 2 列**；🔴 **負向**：本路徑不呼叫 `isWithinSubtree`（以 spy 斷言呼叫次數 0） | unit(be) | — **可立即建環** |
| `AC-02` | 同一列連續登記 2 筆 ⇒ 場次數 2、第 1 筆檔案仍可取；🔴 **負向**：不存在以 `type='OJT_SIGNIN'` 為鍵之 upsert／replace 路徑 | unit(be) | — **可立即建環** |
| `AC-03` | 場次數 0／1／2 三案 ⇒ 未完成／已完成／已完成 | unit(be) | — |
| `AC-04` | 🔴 **三值**：3/3 完成 ⇒ `全部完成`；2/3 ⇒ `部分完成`；0/3 ⇒ `未完成`；🔴 **空有效使用單位集合 ⇒ `未完成`**（明文覆寫 `every([])===true`）。⚠ **以概念名建環、顯示字面待 prototype 13** | unit(be) | — **可立即建環**（06=B 已定；僅顯示字面待 `13`） |
| `AC-05` | 三種可寫角色（`ICSOPAdmin`／`Supervisor`／`DeptContact`）各自登記成功（2xx） | unit(be) | — **可立即建環**（05=A 定值） |
| `AC-06` | SysAdmin 讀取兩分頁 200＋可下載簽到表；寫入型端點（新增／刪除）403 `PERMISSION_DENIED` | unit(be) | — **可立即建環** |
| `AC-07` | `User`（`business`／`other` 兩子分類）皆 403；側選單不呈現 | unit(be)＋unit(fe) | — **可立即建環** |
| `AC-19` | 🔴 **`ICSOPAdmin` 刪除成功＋寫 `OJT_SESSION_DELETE`**；🔴 **`Supervisor`／`DeptContact` 呼叫刪除端點 ⇒ 403**（**必須實際呼叫端點斷言，不得只驗矩陣格值**——`受限CRUD` 之 `write` 對兩者為允許，擋不住刪除）；`SysAdmin` ⇒ 403 | unit(be) | — **可立即建環**（04=A／05=A 定值） |
| `AC-20` | 🔴 **負向**：路由表中**不存在**場次更新端點（`PATCH`／`PUT`）；前端場次明細列 `queryBy` 編輯控制項 === `null` | unit(be)＋unit(fe) | — **可立即建環**（16=B 定值） |
| `AC-23` | 建立頁 STEP4 之 OJT 上傳卡**已移除**、改為 `[data-ojt-create-hint]` 提示卡（🔒 **不是 `<button>`**） | unit(fe) | — **可立即建環**（08=A；逐字文案 ux-ojt 已定稿） |
| `AC-27` | `FUNCTION_MATRIX` 功能鍵集合**恰 +1**＝`OJT 進度管理`；五格逐字 `唯讀`／`CRUD`／`受限CRUD`／`受限CRUD`／`無`；既有 13 列 × 5 欄（65 格）逐格不變 | unit(be)＋unit(fe) | — **可立即建環**（05=A 定值） |
| `AC-08` | 無職掌交集之 Supervisor 登記成功；🔴 **負向**：路徑上無任何子樹檢查（spy `isWithinSubtree` 次數 0） | unit(be) | — **可立即建環**（沿用 `OQ-D9-21`） |
| `AC-22` | 三種角色各自渲染編輯頁與唯讀頁 ⇒ `[data-ojt-upload]` 與 `[data-writable-attachment]` **各 0 個** | unit(fe) | — **可立即建環**（負向斷言不需 prototype） |
| `AC-29` | 四組既有判定式之測試重跑全綠且期望值未改（`isWithinSubtree` `TS-PS-ORG-001`～`006`、F041 四純函式、F033、F019） | unit(be) | — **可立即建環** |

### 乙、✅ 裁決後已有定值、可建環者（原「待裁決」欄）

| AC | 裁決 | 建環形狀（定值） |
|---|---|---|
| `AC-09` | **09=A** | 日期**必填**（缺 ⇒ 拒）／**不可晚於伺服器當日**（**當日合法**）／**單檔**；🔴 **驗證失敗 ⇒ 場次 0 筆、Blob 寫入 0 次、稽核 0 筆**（all-or-nothing）；⚠ **必含跨日邊界案**（當日 23:59 與次日 00:00）——時區為本 repo 前科（2026-08-15 `useUTC`）。<br>🔴 **錯誤碼取 [error-handling](../../specs/error-handling.md#ojt-progress) 之 `OJT_TRAINING_DATE_REQUIRED`／`OJT_TRAINING_DATE_FUTURE`**——⚠ **不得**自 `prototypes/25` 取 `OJT_TRAINING_DATE_IN_FUTURE`（多一個 `IN_`，見檔頭之衝突說明） |
| `AC-10` | **10=A** | 允許 `pdf`／`jpg`／`jpeg`／`png`、上限 **50MB**；錯誤碼沿用 `FILE_FORMAT_NOT_ALLOWED`／`FILE_SIZE_EXCEEDED`（**零新增**）；Blob 路徑逐字 `documents/{documentId}/ojt/{orgCode}/{uuid}.{ext}` |
| `AC-13` | **15=A ＋ 06=B** | 篩選**恰 2 個**（單位搜尋＋完成狀態）。<br>✅ **本列已隨 `OQ-E11-18` 之覆核收斂為定值（見下方乙-2 表），此欄原文已過期**：完成狀態比對**列自身**，**恰三選項**（`所有完成狀態`／`已完成`／`尚未完成`），**不含「部分完成」**；四值詞彙屬**文件層**，載體在 TAB1 區一逐筆表（`data-doc-ojt-state`）與 `prototypes/13`，與本列刻意不同、不得互相對齊。<br>📝 **原文（裁決前之裁量案）逐字保留供追溯**：🔵 其適用對象＝`[ASSUMPTION]`（`OQ-E11-18`）——採「該列所屬**文件**之整體狀態」；⚠ 若改採「列自身」，「部分完成」恆空 ⇒ 該案例會由「應有結果」翻為「應為空」——**該裁量案已於覆核中被否決，此推論未成立**。 |
| `AC-14` | **07=B** | 單一總覽比率＝已完成有效列 ÷ 有效列總數；**有效＝排除裁撤單位（03=B）＋排除孤兒列（02=C）**；0% 非錯誤；🔴 **分母為零 ⇒ 專屬提示，不得為 `NaN`／`0%`／`100%`**（三者各建一案，`NaN%` 是最易漏的一個）。🔵 呈現粒度為 `[ASSUMPTION]`（`OQ-E11-20`） |
| `AC-15` | **07=B** | rollup 至**部層**；某部 3 列全完成 ⇒ 100%；🔴 **必須斷言「進度列總數不因 rollup 而改變」**（防回頭把 `AC-01` 的列展開——只驗 rollup 結果正確**看起來仍合理**，抓不到這個形狀）；🔒 `isWithinSubtree` 之既有測試期望值不得改。🔵 本部層單位之歸組為 `[ASSUMPTION]`（`OQ-E11-20`） |
| `AC-16` | **07=B** | 窗口＝**最近 30 天（含當日）**；🔴 **PII 負向斷言**（不含姓名／`employeeNo`）**不隨任何裁決改變、可最先建** |
| `AC-17` | **03=B** | 🔴 **分子與分母同時排除**（**兩者各建一案**：只排分母 ⇒ 比率 >100%；只排分子 ⇒ 永遠補不齊）；🔒 **TAB2 仍呈現、仍可新增場次**（統計排除 ≠ 操作禁止，需一條正向案防範圍擴大） |
| `AC-18` | **13=B** | 稽核**恰 1 筆**；`actionType` 逐字 **`OJT_SESSION_UPLOAD`**；**含 `orgCode`**；`watermarkSnapshot=null`；🔴 **三種角色一律寫入**（三案，**含 `ICSOPAdmin`**——`AC-N32` 之不對稱已作廢，照抄舊行為會轉紅）。🔵 `targetType` 為 `[ASSUMPTION]`（`OQ-E11-17`） |
| `AC-24` | **14=A** | 前台詳情頁**唯讀顯示**已完成單位清單（單位／日期層級）；🔴 **不含個人**（同 `AC-16` 之負向形狀）；🔒 仍受 F041 可見性限縮。⚠ **前台 prototype 尚未改版** ⇒ 逐字文案待補 |
| `AC-25` | **02=C** | 移除使用部門後：場次**不物理刪除**、Blob **不刪**、落 `orphanedAt`、**自統計完全排除**、稽核仍可回溯（**五項各建一案**）；**外鍵行為須 int 層**。🔵 **重新掛回是否復活＝`[ASSUMPTION]`（`OQ-E11-19`）** |
| `AC-26` | **01=C** | 遷移為 **1:1 所有權轉移**（`INSERT OJT_SESSION` ＋ `DELETE` 舊列同交易，`blobPath` 沿用不搬移，`trainingDate = DATE(uploadedAt)`）；遷移後 **`DOCUMENT_ATTACHMENT` 無任何 `OJT_SIGNIN` 列**。<br>🔴 **底線斷言（不隨覆核改變）**：遷移**不得**使任一單位由「未完成」變為「已完成」而無對應之場次事實；🔒 **待歸位項不計入 `AC-14` 分母、不入 TAB2 列數、不受篩選影響、不使任何單位判定為已完成**。<br>🔴 **歸位之三種失敗必須各建一案、不得合流**：已被他人歸位 ⇒ **409 `OJT_SESSION_ALREADY_ASSIGNED`**／整筆不存在 ⇒ **404 `OJT_SESSION_NOT_FOUND`**／單位非使用部門 ⇒ **400 `OJT_ORG_NOT_USING_DEPT`**。⚠ **409 是多人並行清理舊資料時最可能發生者**（先送出者成功、後者撞上）——回成 404 會讓操作者以為資料被刪而去追查。<br>⚠ **`prototypes/25` 無 404 之可操作示範**（待歸位項只因成功歸位而離開清單）⇒ **該分支之驗證落在後端，不得期待畫面載體** |

### 乙-2、✅ `OQ-E11-17`～`OQ-E11-20` 覆核結果（2026-08-28）——**全部可建環**

| AC | 覆核定案 | 建環形狀 |
|---|---|---|
| `AC-18`／F024 `AC-J23` | 🟢 **核可**：`targetType='OJT_SESSION'`；F024 類型值**五種**、控制項 **6 個 `option`** | 斷言值集合大小；🔒 逐字第五值待 `prototypes/17` |
| `AC-13` | 🔴 **裁量案否決 ⇒ TAB2 比對「列自身」、恰三選項**（`所有完成狀態`／`已完成`／`尚未完成`） | ⚠ **「部分完成」之 TAB2 案例整條移除**；四值案例改建於 **TAB1 區一逐筆表**（`data-doc-ojt-state`）與 `prototypes/13` |
| `AC-25` | 🟢 **核可**：重掛回 ⇒ 清除 `orphanedAt`、場次復活 | 🔴 **另建一條不變式偵測案**：以「`orphanedAt` 有值但 `orgCode` 仍在集合內」之人工不一致 fixture 驅動顯示層 ⇒ 應依**集合**判定為非孤兒（防下游把顯示綁死在旗標上） |
| `AC-14` | 🔴 **裁量案否決 ⇒ 維持 prototype：總覽比率 ＋ 依文件逐筆表兩者皆有** | 兩者各建一案；⚠ **兩者分母口徑刻意不同**（逐筆表用 `AC-04` 不套 `isActive`；總覽比率排除裁撤與孤兒）——**須有一案明文鎖住此差異**，否則下一位讀者會把它當 bug 修成一致 |
| `AC-15` | 🟢 **核可**：本部層／公司層單位**自成一組、不排除** | 以「使用單位為本部層 orgCode」之 fixture 建案 |

### 丙、✅ prototype 逐字已定稿（原「待 prototype 13」欄）

| AC | 定稿值 | 說明 |
|---|---|---|
| `AC-04`／[F017](../../specs/features/F017-backend-document-list.md) `AC-J13` | icon `file-check-2`／**`file-minus-2`（新鍵）**／`file-x-2`；文字 **`已全部完成`／`部分完成`／`尚未開始`**；`data-has-ojt` ＝ **`"all"｜"partial"｜"none"`** | 🔴 **`"true"`／`"false"` 不保留**——舊值域斷言會**配對 0 個元素而大聲失敗，這是刻意設計**：若讓 `"true"` 兼指 `all`，既有斷言會繼續通過但語意已悄悄變窄＝假綠。**必須有一條測試明文鎖住新值域。**<br>⚠ **既有 `有 OJT`／`無 OJT` 期望值必然轉紅**（三個字面全換） |
| [F017](../../specs/features/F017-backend-document-list.md) `AC-J14` | 篩選四值 **`全部`／`已全部完成`／`部分完成`／`尚未開始`** | 🔴 **與 TAB2 之三值刻意不同**（`AC-13`）——四值屬文件層、三值屬列層，**不得互相對齊** |
| F024 `AC-J22`／`AC-J23` | ✅ **全部定稿**：第五類型值 **`OJT 場次`**（置於既有四者之後，四者字面與順序不動）；`OJT_SESSION_UPLOAD`→**`場次登記`**、`OJT_SESSION_DELETE`→**`場次刪除`**；值集合＝**五種／6 個 `option`** | 🔴 **`AC-N69` ① 之「恰四種／5 個 option」已就地推翻**，既有斷言必然轉紅（預期）。<br>🔴 **兩標籤互異須獨立斷言**，不得只驗字面——字面日後若改，互異性才是要保住的。<br>🔴 **使用單位不新增欄位**，承載於「對象名稱／說明」欄文字（如 `OJT 場次登記（營運管理部 / 審查室 · 訓練日期 2026-06-18）`）⇒ **另建一案：可被既有文件搜尋框搜到**。<br>🔴 **`NON_WATERMARK_ACTIONS` 須含兩個新 `actionType`**——斷言該集合**恰含**目前全部無快照之動作；漏列者畫面會對它顯示不存在的浮水印欄位。<br>🔒 **`prototypes/17` 兩筆示範列不得當 mock 清掉**：舊 `ATTACHMENT_UPLOAD` 列（append-only、歷史不滅）＋新事件列中之 `ICSOPAdmin`（角色不對稱不延續之畫面載體） |

> ✅ **反之，[F042 §prototype 25 §6](../../specs/features/F042-ojt-progress-management.md#prototype-25-dom-contract) 之逐字值已定稿、可直接建環**（分頁／三區標題／兩態徽章／新增場次鈕／表單 label 與三條錯誤文案／四種空狀態／SysAdmin 唯讀橫幅／唯讀衍生四項）；§8 之 `AC-22` 負向斷言**逐字可照抄**。

### 丁、✅ prototype 25 已定稿、可直接建環者（原「待 prototype」欄）

| AC | 狀態 | 說明 |
|---|---|---|
| `AC-11`／`AC-12` | ✅ **可建環** | 分組結構掛鉤、展開互動、**四種空狀態逐字文案**皆已定稿（§1／§3／§6）；⚠ **四種空狀態互不相同、不得混用**（列展開／時間窗口／篩選無結果／全域無進度列） |
| `AC-16` | ✅ **可建環** | 🔴 **PII 負向斷言不隨任何裁決改變**（硬性防線）⇒ **最先建**；窗口 30 天已定值 |
| `AC-21` | ✅ **可建環** | 唯讀衍生徽章／空狀態／說明句／導覽連結四項逐字已定稿，🔒 **`15`＝`16` 兩檔逐字相同** |
| `AC-22` | ✅ **可建環** | §8 之**六條負向 ＋ `16` 三條回歸鎖定 ＋ `15` 三條最易誤刪項**逐字可照抄；**四種角色 × 兩檔 × `16` 之兩態**皆須成立 |
| `AC-28` | ✅ **全部可建環**（📝 本列原記「🟡 部分：⑦刪除場次／⑧完成狀態四選項／⑨待指派工作台**三項待 ux-ojt 補**」，**已過期**——原文保留於此供追溯） | ⚠ **原文之編號亦已不對應**：AC-28 現行之 ⑦＝文件層三態、⑧＝刪除場次、⑨＝待歸位區。**①～⑮ 皆由 ux-ojt 於 2026-08-28 三輪內定稿完畢**（⑪～⑮ 為第三輪補），**⑯⑰⑱ 為 2026-08-28 節流／版面修正新增**（見 §三-2）。🔴 **照舊版跳過 ⑦～⑨ 會漏掉刪除場次、待歸位工作台與文件層三態三組核心行為。** |

## 三、🔴 預期轉紅清單（既有測試之衝擊盤點）

> **本節之作用**：`OQ-D9-14` 之緩解要求已成本 repo 慣例——**建環時先盤點受影響之既有斷言，不得事後才發現**。
> ⚠ **以下為 Phase A 之「檔案層級」盤點**（依 spec 之反轉範圍推導，**未實際執行測試**）；**逐案數量須由 test-generator 於建環時實測補齊**。
> 🔒 **全部轉紅皆為 delta 之預期、非回歸**：一律**就地改寫為新行為之背書、不得刪除**（比照 `AC-F17`／D9 批之既有處置慣例）。

### 甲、backend

| 檔案 | 預期轉紅範圍 | 依據 |
|---|---|---|
| `backend/src/attachments/attachments-controller-routes.spec.ts` | OJT 上傳端點之路由與角色案（`AC-N28`／`AC-N33`／`AC-N34`） | `OQ-E11-11`；🔒 **ICSOP PDF 之案必須保留**（`AC-J5`） |
| `backend/src/attachments/attachments.service.spec.ts` | OJT 之**覆蓋**語意案（重傳即取代） | `AC-J1`（反轉為累加） |
| `backend/src/rbac/field-matrix.spec.ts` | `OJT 簽到表` × `Supervisor`／`DeptContact` 之「可寫」案（`AC-N22`／`AC-N23`）**期望值反轉為唯讀**；全組合 **38 案 → 40 案**；⚠ **須一併驗 outcome 分類為 `FORBIDDEN`**（非 `IGNORE`） | `AC-J7`～`AC-J9`（12=A） |
| `backend/src/documents/documents.service.spec.ts` | `hasOjt` 之計算來源（現為附件存在性）**＋其型別由 `boolean` 改為三值** | `AC-J12`（06=B） |
| `backend/src/documents/document-list-query.ts` 之相關 spec | `OJT` 篩選由**三值改四值**；⚠ **既有 fixture（「文件 A 有 `OJT_SIGNIN` 附件」）不再可建構**，須以三筆文件（全完成／部分／全未）重寫 | `AC-J14`（06=B） |
| `backend/src/storage/file-rules.spec.ts` | ✅ **不受影響**（10=A 沿用既有格式與 50MB） | `AC-10` |
| `backend/src/audit/*`（`AC-N50`／`AC-N52` 之落列與標籤） | `AC-N50` **整條作廢**；`AC-N52` **後半（角色不對稱）整條作廢**——⚠ **`ICSOPAdmin` 不寫稽核之既有斷言會轉紅，這是預期**；`access-history-labels.ts` 兩份對照表**新增**兩個 `actionType`（🔒 **既有 `ATTACHMENT_UPLOAD` 之對照不得移除**——append-only，歷史列仍須渲染） | `AC-J19`～`AC-J24`（13=B） |
| `backend/src/attachments/attachments-controller-routes.spec.ts`（第二處） | 🔴 **舊 OJT 端點之全部案例**——11=A 移除路由 ⇒ 其 2xx／403 案皆須改為 **404**（五種角色各一案） | `AC-J2`（11=A） |
| `backend/src/public/public-attachment-download.routes.spec.ts` | ✅ **不受影響**（01=C 保留 `OJT_SIGNIN` 列舉值供 legacy，下載路徑不變） | `AC-26` |

### 乙、frontend

| 檔案 | 預期轉紅範圍 | 依據 |
|---|---|---|
| `frontend/src/domain/field-matrix.test.ts` | OJT 欄之角色格值與 outcome 分類 | `AC-J7`／`AC-J8` |
| `frontend/src/pages/DocumentReadonlyPage.test.tsx` | `AC-N74` 三條文案之分支斷言；`AC-N75` 之 `[data-writable-attachment]` **恰 1 個** ⇒ **恰 0 個** | `AC-J4`／`AC-J11` |
| `frontend/src/pages/DocumentEditPage.test.tsx` | `AC-N76` 之 `.ojt-write` 隔離、`[data-ojt-exception]` 徽章、`[data-attachment-write="ojt"]`（三條逐元素 ⇒ **2 條**） | `AC-J10`／`AC-J11` ⑤ |
| `frontend/src/pages/DocumentCreatePage.test.tsx` | 建立頁 OJT 上傳卡（`:854` `上傳 OJT 簽到表（1 份）`）**移除**、改斷言提示卡 | `AC-23`（08=A） |
| `frontend/src/pages/DocumentListPage.test.tsx`／`DocumentListPage.filterDelta.test.tsx` | 🔴 第 1 欄**兩態改三態**（`AC-N38`／`AC-N39`）＋ `OJT` **三值改四值**（`AC-D5`／`AC-D10`）；⚠ **逐字值待 `prototypes/13` 改版** | `AC-J13`／`AC-J14`（06=B） |
| `frontend/src/pages/AccessHistoryPage.test.tsx` | 新增兩個 `actionType` 之標籤與類型篩選；🔒 **既有 `ATTACHMENT_UPLOAD` 之案不得刪**（歷史列）；🔵 第五類型值待 `prototypes/17` | `AC-J22`～`AC-J24`（13=B） |
| `frontend/src/pages/PublicDocumentDetailPage.test.tsx` 三檔 | 🔴 **會轉紅**（14=A 前台唯讀顯示已完成單位清單）；✅ `prototypes/04` 已改版，掛鉤 `[data-ojt-derived]` 等已定稿。<br>🔴 **另須新增負向案**：前台**不得**有任何 OJT 場次檔下載入口 | `AC-24`（14=A） |
| `frontend/src/pages/PublicDocumentDetailPage.watermark.test.tsx` | 🔴 **[F020](../../specs/features/F020-watermark.md) `AC-D2` 之定位點失效**：`此格式不支援浮水印` 在**附件區**之載體（OJT jpg 分支）隨 `04` 移除 OJT 項而消失 ⇒ 以附件區定位該文案之斷言必然轉紅。<br>⚠ **那是定位點失效、不是文案作廢**——**須就地改寫為以「使用表單區／附錄區之 `.xlsx` 列」定位，不得刪除該斷言** | [F020](../../specs/features/F020-watermark.md#ojt-frontstage-note-delta) `AC-J26` |
| `frontend/src/pages/PermissionMatrixPage.test.tsx` | 功能矩陣列數 **13 ⇒ 14**（新列格值 `唯讀`／`CRUD`／`受限CRUD`／`受限CRUD`／`無`）；✅ **其 anti-drift 斷言（`:211`）不受影響**——12=A 裁定 OJT 列為 `FORBIDDEN`（唯讀）而非 `IGNORE`，`系統 UUID` 列一格未動 | `AC-J16`／`AC-J7` |

### 丙、integration

| 檔案 | 預期轉紅範圍 | 依據 |
|---|---|---|
| `backend/test/int/attachments.itest.ts` | 🔴 **OJT 上傳→列表→下載之往返案必然轉紅**（11=A 端點回 404）；ICSOP PDF 之往返案**不受影響、不得一併刪除** | `AC-J2`（11=A） |

### 丁、🔴 **不得「順手一併刪除」之三處（建環時最易做錯）**

1. **`AC-N76` ④ 之三列表格只得縮為 2 列**——`xls`／`icsop_pdf` 兩列與 OJT 無關，是 lead 於 2026-08-20 第四輪特別授權，用來擋「有人把 `.write-only` 整個刪掉」（集合式斷言在該情況下**仍全綠**）。見 [F026](../../specs/features/F026-role-field-matrix.md#ojt-field-retire-delta) `AC-J11` ⑤。
2. **`AC-N33`（ICSOP PDF 上傳仍拒）之測試必須保留**——其**理由基礎**隨 `AC-N28` 作廢而消失，但**期望值從未被任何裁決推翻**。見 [F016](../../specs/features/F016-pdf-ojt-attachment.md#ojt-progress-supersede-delta) `AC-J5`。
3. **`AC-N52` 前半（既有稽核回歸鎖定）逐字續為有效**——VIEW／DOWNLOAD／PRINT 三類前台紀錄、append-only、補償佇列**一字不變**；**只有其角色不對稱子句整條作廢**（13=B）。見 [F023](../../specs/features/F023-audit-logging.md#ojt-progress-audit-delta) `AC-J21` ②③。
4. **F024 之 `ATTACHMENT_UPLOAD` 標籤對照與其「上傳」類型對映不得移除**——`AUDIT_LOG` 為 **append-only**，2026-08-20～E11 上線期間之歷史列**永久存在**且本頁仍須渲染。⚠ **這是最容易「順手清乾淨」而使歷史列渲染成空白之處**。見 [F024](../../specs/features/F024-access-history-query.md#ojt-progress-audit-view-delta) `AC-J22`。
5. **`OQ-E01-09` 之既有落差不得順手償還**——它活在 **ICSOP PDF 上傳路徑**（`POST …/attachments/icsop-pdf`）上，與本 delta 無關；把它一併接上稽核是**範圍擴大**，屬另案。見 [F023](../../specs/features/F023-audit-logging.md#ojt-progress-audit-delta) `AC-J21` 之 🔒 段。

### 戊、🔴 **兩個假綠陷阱（本批特有）**

1. **`.ojt-write` 集合互斥斷言退化為恆真**：OJT 鈕移除後 `.ojt-write` 恆為空集合，**空集合與任何集合之交集皆為空** ⇒ `AC-N25` 第三輪擴充 ③ 之斷言**恆真而無鑑別力**。與本 repo 已明文禁止之 `offsetParent === null` 同型。**該斷言須整段作廢，不得留著當綠燈。**（[F026](../../specs/features/F026-role-field-matrix.md#ojt-field-retire-delta) `AC-J10`）
2. **`hasOjt` 之 N+1 退化在單元層看不見**：以 Fake store 驅動時，逐列查詢與批次查詢**回傳結果完全相同**，只有呼叫次數不同。**必須以「查詢呼叫次數不隨列數成長」為斷言標的**（1 筆 vs 50 筆文件之呼叫次數相等），否則本條紅線形同虛設。（[F017](../../specs/features/F017-backend-document-list.md#ojt-derived-semantics-delta) `AC-J15` ⑤；棒 3 已以 2 次批次查詢之 `OjtCompletionReader` port 回應）
3. **🔴 `AC-19` 之「不可刪除」不能靠矩陣格值驗證**：功能矩陣對 `Supervisor`／`DeptContact` 為 `受限CRUD`，`canPerform(role, …, 'write')` 對其**回傳允許** ⇒ **只驗矩陣格值會全綠，但刪除其實沒被擋住**。**必須以兩角色實際呼叫刪除端點斷言 403**。（05=A 明文「刪除限 ICSOPAdmin **於端點層**把關」）
4. **🔴 `AC-15` 只驗 rollup 結果正確會漏掉「列被展開」**：若實作在**列產生階段**就把 `JA000` 展開成三個處室列，rollup 之部層數字**看起來仍然合理**，但 TAB2 會多出兩列從未被指定的單位。**必須另建一條「進度列總數不因 rollup 而改變」之斷言**。（`AC-01` × `AC-15` 之階段區隔）
5. **🔴 `AC-14` 分母為零之 `NaN`**：`0/0` 在 JS 為 `NaN`，直接渲染成 `NaN%`；退化為 `0%` 與「全部未完成」無從分辨、退化為 `100%` 會謊報。**三種錯誤形狀各建一案**。
6. **🔴 `data-has-ojt` 舊值域斷言之假綠**：若實作保留 `"true"`／`"false"` 並讓 `"true"` 兼指 `all`，既有斷言**繼續全綠**，但其語意已由「有 OJT」悄悄變窄為「全部完成」。**新值域（`all`／`partial`／`none`）必須有一條明文斷言**——ux-ojt 已刻意讓舊值域配對 0 個元素以求「大聲失敗」，測試側不得反過來遷就舊值域。
7. **🔴 顯示邏輯綁 `orphanedAt` 旗標之假綠**：孤兒之權威判準是 **`orgCode ∉ 當下使用部門集合`**，`orphanedAt` 只是**時點記錄**。綁旗標者在不變式維護正常時**完全正確、測試全綠**；一旦某條 `usingDeptIds` patch 路徑漏跑那兩道 `UPDATE`，就會靜默顯示錯誤狀態。**須以「人工不一致 fixture」建案**（見 §二 乙-2 `AC-25`）。
8. **🔴 `AC-14` 兩個數字口徑不同被「修成一致」**：TAB1 區一同時有總覽比率（排除裁撤與孤兒）與逐筆表（`AC-04`，不套 `isActive`）——**兩者對同一批資料會給出不同數字，這是刻意的**。**須有一案明文鎖住此差異**，否則下一位讀者會判為 bug 並統一口徑，而那會同時破壞 `AC-04` 或 `AC-17` 其中之一。

## 三-2、🔴 2026-08-28 節流修正（`OQ-E11-21`）之測試方向與預期轉紅

> **本節之性質**：F042 **Phase A+B 完成並提交後**，使用者實機檢視所回報之缺陷之定稿。**與 §一～§三 之開工前盤點不同**——此處之轉紅是**對本 feature 自己剛寫的測試**造成的。
> **範圍為三項**：**甲**＝TAB1 **區一**逐筆表之節流（backend＋frontend）｜**乙**＝其前端呈現與 `AC-28` ⑰ 版面契約｜**乙-2**＝TAB1 **區三**「最近完成」之同型節流（**純前端，backend 形狀不變**）。
> 🔒 **規格權威**：[F042 `AC-14`](../../specs/features/F042-ojt-progress-management.md)（區一：節流七項 ＋ 四道負向鎖定）／`AC-16`（區三：節流八項）／`AC-28` ⑯⑰⑱／[§架構設計 一-2](../../specs/features/F042-ojt-progress-management.md#architecture)（端點契約 ＋ 區三「形狀不動」之對照決策）／[§prototype 25 §2·§6](../../specs/features/F042-ojt-progress-management.md#prototype-25-dom-contract)（區一 7 組 ＋ 區三 1 組新掛鉤與全部新逐字）。**逐字值一律自 §6 取，不得自行改寫字面。**
> 🔴 **兩區刻意不同、不得互相對齊之四點**（照搬即為缺陷）：上限 **15 vs 8**／**有 vs 無**捲軸／**有 vs 無**顯示範圍控制項／截斷句**有 vs 無**名詞變體。

### 甲、測試方向（backend jest）

| 標的 | 建環形狀 |
|---|---|
| `docScope` 三值 × 切片 | 三值各請求一次；`incomplete` ⇒ `items` 全為 `state !== 'all'`；`completed` ⇒ 全為 `state === 'all'`；`all` ⇒ 不過濾 |
| `docScope` 正規化 | **缺值** ⇒ `docCoverage.scope === 'incomplete'`；**未知值**（如 `?docScope=bogus`）⇒ 同樣為 `'incomplete'`。🔴 **必須斷言回應之 `scope` 回聲**——只驗「沒有 500」等於沒驗到正規化 |
| 上限與排序 | 母體 > 15 之 fixture ⇒ `items.length === 15`；🔴 **逐對斷言排序**：`items` 之覆蓋率**非遞減**、同率者 `documentNumber` 昇冪；🔒 `totalUnits === 0` 之文件視為 **0%**（排在最前） |
| 🔴 **排序在過濾之後、截斷之前** | 建一組「高覆蓋率文件在資料寫入順序上排最前」之 fixture ⇒ 若實作先截斷再排序，`items` 會含被排序規則排除者。**只驗「有 15 筆」抓不到這個形狀** |
| 四條不變式 | `shown === items.length`／`shown <= maxRows`／`incompleteTotal === byState.partial + byState.none`／`byState.all + partial + none === totalDocuments` |
| 🔴 **計數恆取自完整母體** | 三種 `docScope` 各請求一次 ⇒ `totalDocuments`／`byState`／`incompleteTotal` **三組值完全相同**；且 `coverage.numerator`／`denominator`／`excludedInactive`／`excludedOrphaned`、`deptRollup` 各組 `totalUnits` 之合計、`recentSessions` **亦完全相同**。⚠ **這是本輪最容易寫錯之處**（把上限套進統計 ⇒ 覆蓋率變成「前 15 份的覆蓋率」） |
| `hidden` 之值 | `hidden === 該 scope 完整母體筆數 − shown`，且恆 ≥ 0；母體 ≤ 15 之範圍 ⇒ `hidden === 0` |
| 🔒 **口徑分歧鎖定（`AC-14` 母體口徑鎖）** | 含裁撤單位之文件 ⇒ 其 `totalUnits` **含該裁撤單位**（不套 `isActive`），而 `coverage.denominator` **不含**該列 ⇒ **各文件 `totalUnits` 之合計 ＞ `coverage.denominator`，差額恰為裁撤列數**。**須有一案明文鎖住此差異**，否則下一位讀者會判為 bug 並統一口徑。<br>🔴 **兩個方向各建一案**（ux-fix 已對兩者各做注入驗證）：① 把 `isActive` 過濾**套回**逐筆表；② **反向**把 KPI 改成不過濾 |
| 🔴 **孤兒「天然不成列」而非被過濾** | 建一組「某 `orgCode` 已自 `DOC_USING_DEPT` 移除、但其場次仍在」之 fixture ⇒ 該列**不出現**於 `docCoverage.items`、亦**不計入** `totalUnits`。🔒 **實作不應為此加一道 `orphaned` 過濾**（列由 `DOC_USING_DEPT` 驅動，加了會讓下一位讀者以為孤兒本來會混進來）。⚠ **誤把孤兒算進去時它會把分子與分母一起灌大**（原型注入：`d1` 由 `2 / 3` 變 `3 / 4`）——**只驗覆蓋率百分比看起來合理抓不到**，須斷言 `totalUnits`／`completedUnits` 兩者 |

### 乙、測試方向（frontend vitest）

| 標的 | 建環形狀 |
|---|---|
| 顯示範圍控制項 | `[data-doc-coverage-scope]` 之 `option` **恰 3 個**，值與可見文字逐字＝§6 ⑯；**預設選中 `incomplete`**；其 `aria-label` 逐字 |
| 🔴 **切換＝重新請求** | 切換 `[data-doc-coverage-scope]` ⇒ 斷言**發出一次帶新 `docScope` 之 `GET /admin/ojt-progress/summary`**。⚠ **不得**以「畫面列數變了」代替——客端切換也會讓列數變（那正是要禁止的實作） |
| 摘要行五片段 | 🔴 **逐掛鉤斷言**：`[data-doc-coverage-total]`（✅ 2026-08-28 ux-fix 已補之專屬掛鉤，📝 原記「取第一個子 `<span>`」已過期）、`[data-doc-coverage-stat="all\|partial\|none"]` 三者、`[data-doc-coverage-incomplete]`。🔴 **明文禁止**對 `[data-doc-coverage-summary]` 之整行 `textContent` 下逐字斷言——各 `<span>` 之 `textContent` **之間無空白字元**（間距來自 CSS `gap-x-4`），整行串接後之期望值既對不上、也不可讀 |
| 🔴 **`-total` 不得跟著切片走** | `[data-doc-coverage-total]` 屬性值在**三種 `docScope` 下必須完全相同**（＝母體）。⚠ ux-fix 之注入驗證：改成 `shown.length` 後三種範圍分別變成 **15／13／15**——**每個單一畫面上的數字看起來都合理，只有跨範圍比較才看得出來**。🔒 **與 `[data-doc-coverage-shown]` 成對斷言**（`total` ＝母體、`shown` ＝這張表現在畫了幾列） |
| 🔴 **口徑說明行為必要載體** | `[data-doc-coverage-basis-note]` **必須存在**且逐字＝§6 ⑯；⚠ **這不是文案測試**——它是「同頁兩個分母刻意不同」唯一的畫面承載點（各文件 `totalUnits` 合計 vs KPI 進度列數必然差一個裁撤列數，現行語料 57 vs 56）。ux-fix 已對「移除口徑說明行」做過注入驗證。🔒 **負向**：本行內 `data-doc-ojt-state-chip` 掛鉤數為 **0** |
| 🔴 **三態文案不得以整區 `textContent` 斷言** | 一律釘 `[data-doc-coverage-row="{編號}"] [data-doc-ojt-state-chip]`／`[data-doc-ojt-state]` **逐元素**（既有 `OjtProgressPage.test.tsx:186-193` 已是正確形狀，可沿用） |
| 截斷告知 | `hidden > 0` ⇒ `[data-doc-coverage-truncation]` 存在、`data-doc-coverage-hidden` 屬性值＝`hidden`；**逐字含三要素**（份數／排序規則句／完整清單去哪看），三個名詞變體各建一案。<br>🔴 **負向案**：`hidden === 0`（範圍 `completed`）⇒ `querySelectorAll('[data-doc-coverage-truncation]').length === 0`。**必須驗「不進 DOM」而非 `toBeVisible()` 之否定**——CSS 隱藏會使此斷言退化為假綠（與本 repo 已明文禁止之 `offsetParent === null` 同型） |
| 🔴 **上限 15 不得於前端硬寫** | 以 `maxRows: 15` 與 **`maxRows: 3`** 兩組 fixture 驅動 ⇒ 截斷句中之數字**跟著回應變**。⚠ 只用 15 一組，硬寫版本與正確版本**兩者皆綠** |
| 範圍空狀態 | `[data-doc-coverage-empty="incomplete"]`／`="completed"` 兩句逐字（🔒 **以 fixture 驅動**——prototype 之語料下兩者皆不可達）＋共用補充提示一句；🔴 **與 `="no-docs"` 之全域空狀態互不相同**，且範圍空狀態**不得**帶「進度列從哪裡來」那句 |
| 導向 TAB2 入口 | `[data-doc-coverage-more]` **恆存在**（截斷與未截斷兩態各一案）；點擊後 ⇒ 切至 TAB2 ＋ 完成狀態 select 值為 `尚未完成` ＋ **單位關鍵字被清空**。🔒 **負向**：TAB2 篩選項仍**恰兩項**、完成狀態仍**恰三個 `option`**（`AC-13` 未動） |
| 捲軸容器 | `role="region"` ＋ `aria-label` 逐字 ＋ `tabindex="0"`（WCAG 2.1.1；🔴 **`tabindex` 缺失只在鍵盤操作時才看得出來，須明文斷言**） |
| `AC-28` ⑰ 版面契約 | 唯讀 bar 掛在 `AppShell` 之 `TopbarBanner` 插槽（`<header>` 內）、分頁列掛在 `BelowTopbar`（`</header>` 之後、`<main>` 之前）。🔒 **負向**：`OrgSyncPage`／`PermissionMatrixPage` 之分頁列**仍在 `<main>` 內部**（防「新插槽好用就全部改用」之範圍擴大） |

### 乙-2、測試方向：**區三「最近完成」之節流**（`AC-16` ①～⑧／`AC-28` ⑱）

> ✅ **2026-08-28 ux-fix 定稿並凍結 prototype ⇒ 可建環**（§7-B 第 ① 項之排除已解除）。
> 🔴 **不得把區一的形狀照搬過來**：兩區之上限、有無捲軸、有無範圍控制項、截斷句有無名詞變體**四點皆刻意不同**（`AC-28` ⑱）。

| 標的 | 建環形狀 |
|---|---|
| 上限與筆數 | 母體 > 8 之 fixture ⇒ `[data-recent-row]` **恰 8 個** |
| 🔴 **「保留的是最新 8 筆」（獨立於筆數之方向斷言）** | `[data-recent-date]` 之序列必須**非遞增**，且**首尾兩筆之 `[data-recent-row]` 為預期值**。⚠ **這是本區最重要的一條**：ux-fix 已實跑注入——把 `slice(0,N)` 換成 `slice(-N)`（取**最舊** 8 筆）時**筆數斷言仍全綠**，只有方向斷言會紅。**只驗「恰 8 筆」擋不住取錯哪 8 筆。**<br>📌 現行 fixture 之序列＝`2026-08-27, 2026-08-25, 2026-08-22, 2026-08-20, 2026-08-18, 2026-08-14, 2026-08-12, 2026-08-08`；首／尾之 `data-recent-row` ＝ `d24__DAA00`／`d30__BJA00` |
| 🔴 **排序在切片之前** | 建一組「最舊者在資料順序上排最前」之 fixture ⇒ 若實作先切片再排序，會變成「隨機 8 筆裡最新的那幾筆」，而截斷句宣稱的是「最近的 8 筆」 |
| 截斷告知 | `[data-recent-truncation]` 存在、`data-recent-total` ＝ **30 天窗口內母體筆數**（**非**渲染筆數）、`data-recent-hidden` ＝未列出筆數；逐字＝§6 ⑱（三要素齊備）。<br>🔴 **末句逐字鎖**：必須斷言末句為「…請至「OJT 資料清單」分頁**展開該進度列檢視**。」，**不得**接受「查看完整清單」之類改寫 |
| 🔴 **未截斷之負向案** | 母體 ≤ 8 之 fixture ⇒ `querySelectorAll('[data-recent-truncation]').length === 0`。**必須驗「不進 DOM」而非 `toBeVisible()` 之否定**；⚠ **宿主 `<div id="recentTruncation">` 仍在**（其 `innerHTML` 為空字串）⇒ **不得**以「宿主不存在」為斷言標的 |
| 🔒 **四條既有規則不因上限而放寬**（各建一案） | ① 窗口仍為 **30 天**（把窗口改大 ⇒ `data-recent-total` 應變，可作注入驗證）；② **PII 硬防線**——本區 `textContent` 不含任何上傳者姓名／員編（🔴 沿用 `AC-16` 之既有負向斷言，**最先建**）；③ **孤兒列不進本區**（即使其日期落在窗口內——**這是規則、不是 fixture 巧合**）；④ **不排除裁撤單位**（本區是事實列表、非覆蓋率分母，需一條正向案防範圍擴大） |
| 🔒 **負向：本區無捲軸、無範圍控制項** | 區三容器內**不得**出現 `role="region"` 捲軸容器，亦**不得**出現任何 `select`／篩選控制項（防「區一有就順手補一個」） |
| 🔴 **同日多筆之順序不得斷言** | `AC-16` ⑦：排序鍵僅為日期、**無 tie-break** ⇒ 同日相對順序不具決定性。**對同日順序建斷言＝建出規格從未授權之約束。**（📌 截斷句於同日並列時仍為真，無需改寫規則） |

> 📌 **建環時之語料事實（ux-fix 提供，供對帳用，不必寫成斷言）**：為讓截斷預設可見，ux-fix 是**改 5 筆既有場次的日期**把它們移進窗口，**沒有新增場次** ⇒ **KPI／區一／區二／TAB2 之計數一格未變**（同批舊斷言 5.1–5.8 維持原值可作佐證）；**唯一需更新之舊斷言是區三列數 7 → 8**。⚠ 若你發現其他計數也對不上，那不是語料變動，**是真的有東西壞了**。

### 丙、🔴 預期轉紅清單（**本 feature 自己這批測試**）

> 🔒 **全部轉紅皆為本次修正之預期、非回歸**：一律**就地改寫為新形狀之背書、不得刪除**（比照 `AC-F17`／D9 批之既有處置慣例）。
> ⚠ **以下為檔案層級盤點**（依定稿推導）；**逐案數量須由 test-generator 於建環時實測補齊**。

| 檔案 | 預期轉紅範圍 | 依據 |
|---|---|---|
| `backend/src/ojt-progress/ojt-progress.service.ts` | `OjtSummary.docCoverage` 之型別 **`OjtDocCoverageRow[]` → 物件**；`getSummary()` 需接 `docScope` 參數並產生切片與完整母體計數 | §架構設計 一-2 |
| `backend/src/ojt-progress/ojt-progress.summary.spec.ts` | 🔴 **全部以陣列形態斷言 `docCoverage` 者必然轉紅**（`toHaveLength`／`docCoverage[0]`，現於 `:93`／`:94`／`:108`／`:109`／`:227`）⇒ 改為 `docCoverage.items`；🔒 **`:227` 之「逐筆表不受 `isActive` 過濾」一案務必保留**——它正是口徑分歧之鎖 | §架構設計 一-2 |
| `backend/src/ojt-progress/ojt-progress.test-support.ts` | `docCoverage` 之 Fake／builder 形狀（`:95`） | 同上 |
| `backend/src/ojt-progress/ojt-progress.controller.ts`／`ojt-progress.controller-routes.spec.ts` | `summary` 端點新增查詢參數 `docScope` 與其正規化（含未知值） | `AC-14` ① |
| `frontend/src/api/types.ts`（`:1112`）／`frontend/src/api/endpoints.ts`（`:1242`） | 回應型別與其註解（陣列 → 物件；新增 `docScope` 查詢參數） | §架構設計 一-2 |
| `frontend/src/pages/OjtProgressPage.tsx` | 逐筆表改為受限切片渲染 ＋ 顯示範圍控制項 ＋ 摘要行（含 `[data-doc-coverage-total]`）＋ 截斷告知 ＋ 空狀態 ＋ 捲軸容器 ＋ 導向入口 ＋ **口徑說明行 `[data-doc-coverage-basis-note]`**（**9 組**新掛鉤；📝 原記 7 組，ux-fix 二輪收斂後增為 9） | `AC-14`／`AC-28` ⑯ |
| **（無）backend 之 `docCoverage` 母體** | ✅ **不受影響、無轉紅**——`getSummary()` 之 `docCoverage` 走 `aggregated`（不套 `isActive`）、`coverage` 走 `aggregated.filter(a => a.active)`，**本就與正文一致**；2026-08-28 之口徑收斂是**改 prototype 去對齊正文**，不是改正文或後端。🔒 **`ojt-progress.summary.spec.ts:227` 之既有斷言不得改期望值** | `AC-14` 母體口徑鎖 |
| `frontend/src/pages/OjtProgressPage.test.tsx` | 🔴 **`summaryFixture`／`docCoverageRow` 兩個 helper 之形狀必改**（`:59`／`:70`／`:77`／`:178`-`:181`／`:204`）；🔒 **`:186`-`:193` 之逐元素三態斷言為正確形狀、保留**；⚠ **`:204` 之分母為零案**（`docCoverage: []`）須改為新形狀且**維持其三種錯誤形狀（`NaN`／`0%`／`100%`）之案例** | `AC-14`／`AC-28` ⑯ |
| `frontend/src/components/AppShell.tsx`／`PageHeader.tsx` 之既有測試 | 兩個新 portal 插槽（`TopbarBanner`／`BelowTopbar`）之掛載點；🔒 **既有 `TopbarActions`／`PageHeader` 之斷言不得改期望值** | `AC-28` ⑰ |
| `frontend/src/pages/OjtProgressPage.tsx`／`.test.tsx`（**區三**） | 區三改為**取前 8 筆 ＋ 截斷告知**；🔒 **後端 `recentSessions` 形狀不變**（上限為純呈現層切片，見 §一-2 末段）⇒ **backend 側無轉紅**。⚠ **既有區三之列數斷言 7 → 8 為唯一需更新之舊斷言**（語料是「改既有場次日期移進窗口」，**非新增場次**）；🔒 **`AC-16` 之既有 PII 負向斷言不得改動、亦不得刪除** | `AC-16`／`AC-28` ⑱ |

### 丁、🔴 本輪特有之假綠陷阱（承 §三 戊，續編）

9. **🔴 上限被套進統計而測試全綠**：只驗「`items` 恰 15 筆」與「覆蓋率是個數字」時，**把上限套進統計之錯誤實作一樣全綠**——它算出來的仍是一個合理的百分比，只是分母變成 15。**必須以「三種 `docScope` 之統計欄位完全相同」為斷言標的**（§三-2 甲）。
10. **🔴 二值化之退化在「功能測試」下看不見**：若有人日後把顯示範圍簡化為二值，逐筆表**仍能正常渲染、截斷告知仍會出現、所有既有斷言仍綠**——失去的只是 `已全部完成` 晶片之可達性與截斷之負向斷言之鑑別力。**必須有一條測試明文斷言 `option` 恰 3 個且值域為 `incomplete`／`completed`／`all`**，並有一條「範圍 `completed` 下截斷告知不存在」之負向案。
11. **🔴 截斷上限硬寫於前端**：只用 `maxRows: 15` 一組 fixture 時，「讀回應」與「硬寫 15」**兩種實作皆綠**。**必須以第二組 `maxRows`（如 3）驗證數字跟著回應變。**
12. **🔴 摘要行整行 `textContent` 斷言**：`[data-doc-coverage-summary]` 之整行串接**恆含**三個狀態字面 ⇒ 以整區 `textContent` 驗三態**恆真、對「列有沒有真的畫出來」零鑑別力**；且各 `<span>` 之間**無空白字元**，整行逐字斷言本身也對不上。**一律逐掛鉤／逐元素斷言。**
13. **🔴 客端切換之假綠**：以「切換後畫面列數改變」為斷言時，**先取 600 列再於客端過濾**之實作同樣通過——那正是本次要消除的形狀。**斷言標的必須是「發出一次帶新 `docScope` 的請求」。**
14. **🔴 截斷告知以 CSS 隱藏**：`toBeVisible()` 之否定、`offsetParent === null` 一類斷言在 jsdom 下不可靠且會放行 CSS 隱藏實作。**斷言必須是 `querySelectorAll(...).length === 0`（完全不進 DOM）。**⚠ 區三另有一個陷阱：宿主 `<div id="recentTruncation">` **未截斷時仍在**（`innerHTML` 為空字串）⇒ **不得**以「宿主不存在」為斷言標的。
15. **🔴 區三「取錯哪 8 筆」之筆數假綠（ux-fix 已實跑注入證實）**：把 `slice(0,N)` 換成 `slice(-N)`（取**最舊** 8 筆）時，**筆數斷言全綠**，只有 `[data-recent-date]` 之非遞增序列與首尾列斷言會紅。⇒ **「保留的是最新 N 筆」必須是一條獨立於筆數之方向斷言**（`AC-16` ⑤）。📌 **本形狀可推廣到任何 top-N**：驗了「幾筆」不等於驗了「哪幾筆」。
16. **🔴 區三之同日順序被過度斷言**：排序鍵僅為日期、**無 tie-break** ⇒ 同日相對順序不具決定性；對它建斷言＝**建出規格從未授權之約束**，且會在資料順序改變時無故轉紅（`AC-16` ⑦）。
17. **🔴 母體計數跟著切片走（本輪最容易靜默壞掉的一項，ux-fix 實跑證實）**：把 `totalDocuments`／`[data-doc-coverage-total]` 誤接成 `shown.length` 時，三種範圍分別顯示 **15／13／15**——**每個單一畫面上的數字看起來都完全合理**，只有**跨範圍比較**才看得出來。⇒ **`totalDocuments`／`byState`／`incompleteTotal` 必須以「三種 `docScope` 各跑一次、值完全相同」建環**（34／13／21），單看一個範圍的斷言擋不住。
18. **🔴 兩個分母被「修成一致」而測試仍綠**：逐筆表 `totalUnits` 含裁撤單位、KPI `denominator` 排除 ⇒ 合計必然差一個裁撤列數（57 vs 56）。若有人把任一邊改成另一邊，**該邊自己的斷言仍會綠**（數字內部一致），只有跨口徑的比較案會紅。⇒ **兩個方向各建一案**（套回 isActive／反向拿掉 isActive），並斷言 `[data-doc-coverage-basis-note]` 存在——**那行說明是這條規則在畫面上的唯一承載點，被刪掉就沒有人知道差 1 是刻意的**。
19. **🔴 把「孤兒不進分母」實作成一道過濾**：後端之列由 `DOC_USING_DEPT` 驅動 ⇒ 孤兒**天然不成列**，加一道 `orphaned` 過濾雖不改變結果，卻會讓下一位讀者以為孤兒本來會混進來而去「維護」它。⚠ **真正要防的是反向**：誤把孤兒算進分母時，它會把**分子與分母一起**灌大（`d1` 由 `2 / 3` 變 `3 / 4`）⇒ **覆蓋率百分比看起來仍合理**，須斷言 `totalUnits`／`completedUnits` 兩者而非只驗百分比。
20. **🔴 把區一的形狀照搬到區三**：兩區之上限（15 vs 8）、有無捲軸、有無顯示範圍控制項、截斷句有無名詞變體**四點皆刻意不同**（`AC-28` ⑱）。⚠ **「同一形狀之缺陷」不等於「同一組定值」**——照搬會建出四條與 prototype 不符的斷言。

## 四、開放設計問題（交回 lead／棒 3）

1. **場次實體之命名與是否物化進度列**：`OJT_SESSION` 為建議名；`OJT_PROGRESS_ROW` 可能無需獨立資料表（可由 `DOC_USING_DEPT` 推導）——由 system-architect 於棒 3 裁量。測試之 Fake store 形狀依其定案。
2. **`AC-J15` ⑤ 之可測 seam**：「查詢呼叫次數」需要 store 層有可 spy 之接縫；若實作把聚合寫在 SQL 內而 store 只暴露一個方法，單元層仍測得到次數，但**真 SQL 之 join 成本只有 int 層看得出來**——建議兩層各建一案。
3. **`AC-16` 之 PII 斷言範圍**：本檔建議以「區塊 `textContent` 不含姓名與 `employeeNo`」為形狀；⚠ 若儀表板日後加入「上傳者」欄位（TAB2 明細已允許呈現），兩者之界線須重新畫——**已於 [F042](../../specs/features/F042-ojt-progress-management.md) `AC-16` 明文「TAB2 明細得呈現、TAB1 聚合不得，兩者刻意不同、不得互相對齊」**。

## Related

- Spec: [F042](../../specs/features/F042-ojt-progress-management.md)（`AC-01`～`AC-29` ＋ [§既有行為反轉總表](../../specs/features/F042-ojt-progress-management.md#reversal-table)）
- Delta 落點: [F016](../../specs/features/F016-pdf-ojt-attachment.md#ojt-progress-supersede-delta)｜[F026](../../specs/features/F026-role-field-matrix.md#ojt-field-retire-delta)｜[F017](../../specs/features/F017-backend-document-list.md#ojt-derived-semantics-delta)｜[F025](../../specs/features/F025-role-function-matrix.md#ojt-progress-function-key-delta)｜[F023](../../specs/features/F023-audit-logging.md#ojt-progress-audit-delta)｜[F024](../../specs/features/F024-access-history-query.md#ojt-progress-audit-view-delta)
- OQ: [open-questions §E11](../../specs/open-questions.md#e11-2026-08-27)（`OQ-E11-01`～`OQ-E11-16`）
- 既有測試設計參照: [F016-test](F016-test.md)（附件之 Fake 風格）｜[F017-test](F017-test.md)（清單欄位與篩選）｜[F024-test](F024-test.md)（稽核查詢與匯出）｜[F026-test](F026-test.md)（欄位矩陣逐格）
