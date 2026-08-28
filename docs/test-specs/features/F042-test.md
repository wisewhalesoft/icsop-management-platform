---
type: test-design-feature
feature_id: F042
feature_name: OJT 進度管理
priority: P1
related_spec: docs/specs/features/F042-ojt-progress-management.md
last_updated: 2026-08-27
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
> 🔴 **仍不得建環之 3 項（`§7-B`）**：① **區三筆數上限**（`07` 只裁窗口天數，prototype 之「不設上限」為 designer 裁量）；② **側選單新項之位置**（設計裁量，`AC-27` 只鎖「恰新增一項」不鎖位置）；③ 🔴 **日期錯誤碼字面之跨檔衝突**——見下。
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
| `AC-28` | 🟡 **部分** | ①～⑥ 已定稿；⚠ **⑦「刪除場次」動作、⑧ 完成狀態四選項、⑨ 待指派工作台**三項待 ux-ojt 補（皆為裁決後新增之需求） |

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

## 四、開放設計問題（交回 lead／棒 3）

1. **場次實體之命名與是否物化進度列**：`OJT_SESSION` 為建議名；`OJT_PROGRESS_ROW` 可能無需獨立資料表（可由 `DOC_USING_DEPT` 推導）——由 system-architect 於棒 3 裁量。測試之 Fake store 形狀依其定案。
2. **`AC-J15` ⑤ 之可測 seam**：「查詢呼叫次數」需要 store 層有可 spy 之接縫；若實作把聚合寫在 SQL 內而 store 只暴露一個方法，單元層仍測得到次數，但**真 SQL 之 join 成本只有 int 層看得出來**——建議兩層各建一案。
3. **`AC-16` 之 PII 斷言範圍**：本檔建議以「區塊 `textContent` 不含姓名與 `employeeNo`」為形狀；⚠ 若儀表板日後加入「上傳者」欄位（TAB2 明細已允許呈現），兩者之界線須重新畫——**已於 [F042](../../specs/features/F042-ojt-progress-management.md) `AC-16` 明文「TAB2 明細得呈現、TAB1 聚合不得，兩者刻意不同、不得互相對齊」**。

## Related

- Spec: [F042](../../specs/features/F042-ojt-progress-management.md)（`AC-01`～`AC-29` ＋ [§既有行為反轉總表](../../specs/features/F042-ojt-progress-management.md#reversal-table)）
- Delta 落點: [F016](../../specs/features/F016-pdf-ojt-attachment.md#ojt-progress-supersede-delta)｜[F026](../../specs/features/F026-role-field-matrix.md#ojt-field-retire-delta)｜[F017](../../specs/features/F017-backend-document-list.md#ojt-derived-semantics-delta)｜[F025](../../specs/features/F025-role-function-matrix.md#ojt-progress-function-key-delta)｜[F023](../../specs/features/F023-audit-logging.md#ojt-progress-audit-delta)｜[F024](../../specs/features/F024-access-history-query.md#ojt-progress-audit-view-delta)
- OQ: [open-questions §E11](../../specs/open-questions.md#e11-2026-08-27)（`OQ-E11-01`～`OQ-E11-16`）
- 既有測試設計參照: [F016-test](F016-test.md)（附件之 Fake 風格）｜[F017-test](F017-test.md)（清單欄位與篩選）｜[F024-test](F024-test.md)（稽核查詢與匯出）｜[F026-test](F026-test.md)（欄位矩陣逐格）
