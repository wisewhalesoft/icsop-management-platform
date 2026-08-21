---
type: implementation-log
feature_id: D9-delta（F018 主體 ＋ F020／F024／F026 之收尾；AC-N# 批次）
feature_name: 2026-08-20 缺失／變更 delta —— frontend 線（impl-fe2 段，收尾）
branch: feat/d9-defect-delta
status: complete（frontend 約束環全綠）
last_updated: 2026-08-21
---

# D9 delta · frontend 線 —— impl-fe2 實作紀錄（接手收尾）

> **本檔與 [`d9-delta-frontend-impl-fe.md`](d9-delta-frontend-impl-fe.md) 為同一條 frontend 線之上下半場。**
> `impl-fe` 之 session 因額度中途中止（成果＝`d9a05f3`），本人（`impl-fe2`）接手其 §五所列之未完成項。
> 兩檔請併讀：AC 對照與盲區處置**不重複抄錄**，本檔只記錄 impl-fe2 段。
>
> **角色邊界**：Uncle-Bob 約束環模式。約束環由 `ring-fe` 對實作全盲撰寫並定版；本人
> **只寫 production code，全程未建立、修改、弱化或跳過任何測試檔**（`e79e087` 之 13 個檔案
> 皆為 production code，零測試檔異動）。三則測試爭議一律走 mailbox 交 `ring-fe` 裁定（見 §四）。

> 📌 **本檔落點之選擇**：lead 授權時指向 `/tdd` 檔案結構所載之 `docs/specs/implementation-log/`，
> 並要求先查現行慣例。查證結果——`docs/implementation-logs/`（39 檔，含 `F018-impl.md`）為本 repo
> 之實際慣例，且**同一 delta 之上半場 `d9-delta-frontend-impl-fe.md` 已落在此處**；
> `docs/specs/implementation-log/` 僅 4 檔。為使同一 delta 之兩份紀錄相鄰可讀，本檔沿用前者。

## 一、實跑數字

### 接手時之基線（本人親跑，未改任何檔案前）
```
88 檔 →  80 綠 /  8 紅　　1282 通過 /  11 失敗 / 1293 總數
```
> lead 交接時之讀數為「9 檔 / 12 案紅」。差異之一案即 `DashboardHome`——本人在**動手前**先跑一次
> 乾淨基準即為綠，其後三次全量重跑亦全綠，判定為並行負載下之非決定性假紅（見 §六 (a)）。

### 交付時（本人親跑，`ring-fe` 之 `fcc375b` 之上）
```
88 檔 →  88 綠 /  0 紅　　1327 通過 /   0 失敗 / 1327 總數　　Duration 53s
npx tsc --noEmit → 無輸出（乾淨）
```
> 案數 1293 → 1327（+34）之組成：兩個新頁測試檔由「整檔載入失敗、0 案」轉為可執行（+33），
> 加上 `ring-fe` 修正申訴 #3 時把附錄負向案改寫為 pdf／非 pdf 兩態（+1）。

| 測試檔 | 案數 | 狀態 |
|---|---|---|
| `src/pages/UsageFormCreatePage.test.tsx` | 17 | PASS（原：整檔 FAIL，模組不存在） |
| `src/pages/UsageFormEditPage.test.tsx` | 16 | PASS（原：整檔 FAIL，模組不存在） |
| `src/pages/UsageFormManagementPage.test.tsx` | 14 | PASS |
| `src/pages/UsageFormManagementPage.formNumber.test.tsx` | 11 | PASS |
| `src/pages/PermissionMatrixPage.test.tsx` | 13 | PASS |
| `src/pages/AccessHistoryPage.test.tsx` | 18 | PASS |
| `src/pages/AppendixManagementPage.export.test.tsx` | 12 | PASS |
| `src/api/endpoint-contract.test.ts` | 74 | PASS |

## 二、Scenario / AC 對照（impl-fe2 段）

| AC | 內容 | 落點 | 狀態 |
|---|---|---|---|
| `AC-N41` | 新增／編輯由 modal 改為**獨立路由整頁**（無 `role="dialog"`） | `UsageFormCreatePage.tsx`／`UsageFormEditPage.tsx`／`App.tsx` | PASS |
| `AC-N42` ①②③④ | `PageHeader` breadcrumb＋頁標題；儲存／取消投遞 topbar；三區塊標題逐字；取消導回不寫入 | 兩新頁 | PASS |
| `AC-N43` | 🔒 仍為單一動作一次送出（不出現「已建立但無檔案」中間態） | `UsageFormCreatePage.tsx` | PASS |
| `AC-N44` | 編號唯一性沿用既有機制；409／400 逐字錯誤訊息；`#upNumber`／`#enNumber` 之 `maxlength`／placeholder | `domain/usage-form-number.ts` ＋ 兩新頁 | PASS |
| `AC-N45` | 制定部門多選、任意層級、0 筆合法、去重、依 `orgCode` 昇冪回填 | `components/DraftingDeptPicker.tsx` | PASS |
| `AC-N46` | 🔴 純 metadata，不接進任何子樹／RBAC 判定 | 全線未觸碰 `isWithinSubtree`／`isDocVisibleToViewer`／`isUsingDeptMatched` | PASS（負向，見 §五 (c)） |
| `AC-N47` | 清單新增「制定部門」欄（表頭 7→8 欄）、`data-drafting-dept`、0 筆逐字「—」 | `UsageFormManagementPage.tsx` | PASS |
| `AC-N48` ①② | 列內動作改名逐字「編輯」、保留 `data-edit-number`／icon `hash`、導頁；`editNumberModal` 自此不存在；欄位層三 id 保留；說明句就地改寫 | 清單頁＋`UsageFormEditPage.tsx` | PASS |
| `AC-N49` | 🔒 儲存 metadata 不觸發覆蓋確認 dialog、不碰檔案 | `UsageFormEditPage.tsx`（body 只送兩鍵） | PASS |
| `AC-N77` | topbar `data-create-usage-form`，可見文字與 `aria-label` 皆逐字「新增表單」 | `UsageFormManagementPage.tsx` | PASS |
| `AC-N78` ①②③ | 三區塊序號徽章 1／2／3；`data-drafting-dept-chip`；0 筆之 `data-drafting-dept-empty` 逐字 | 兩新頁＋picker | PASS |
| `AC-N79` ①②③ | `data-file-readonly` 逐字「唯讀」；換檔引導句三片段；🔴 原型專用切換器**不得出現** | `UsageFormEditPage.tsx` | PASS |
| `AC-N22` 之顯示鏡射 | `FIELD_DISPLAY` 之 OJT 列同步為兩格「可寫」（anti-drift） | `PermissionMatrixPage.tsx` | PASS |
| `AC-N53` | 上傳事件之類型／操作類型標籤 | `AccessHistoryPage.tsx`（impl-fe 已實作，本段僅經申訴 #1 使斷言與 prototype 對齊） | PASS |
| `AC-N20` | 後台附錄頁渲染 `data-wm-note` | `AppendixManagementPage.tsx`（impl-fe 已實作，本段僅經申訴 #3 反轉過時負向案） | PASS |
| 契約層 | 前端呼叫之 URL 必須對應後端某條 route | `api/endpoints.ts` | PASS |

## 三、改動檔案（commit `e79e087`，皆為 production code）

| 檔案 | 類型 | 說明 |
|---|---|---|
| `frontend/src/pages/UsageFormCreatePage.tsx` | new | 新增使用表單整頁（權威＝`prototypes/19a-usage-form-create.html`） |
| `frontend/src/pages/UsageFormEditPage.tsx` | new | 編輯使用表單整頁（權威＝`prototypes/19b-usage-form-edit.html`） |
| `frontend/src/components/DraftingDeptPicker.tsx` | new | 制定部門多選（chips＋combobox）＋`orgPathLabel()`＋`normalizeDeptCodes()` |
| `frontend/src/components/UsageFormFormatBadge.tsx` | new | 格式徽章（自清單頁抽出，三頁共用） |
| `frontend/src/domain/usage-form-number.ts` | new | 編號之 placeholder／maxlength／兩則逐字錯誤訊息／`normalizeFormNumber()`／`errorCodeOf()` |
| `frontend/src/domain/usage-form-format.ts` | new | `classifyFormat`／`detectAllowedFmt`／`formatSize`＋兩則檔案錯誤逐字訊息 |
| `frontend/src/pages/UsageFormManagementPage.tsx` | modified | **-380/+189**：移除兩個 modal；加制定部門欄；topbar 改「新增表單」＋導頁；列內動作改「編輯」＋導頁並前移至 prototype 19 之位置；colSpan 7→8；載入 `/org-units` 解析部門名 |
| `frontend/src/api/endpoints.ts` | modified | `updateUsageFormNumber` → `updateUsageForm`（`PATCH /admin/usage-forms/:formId`）；`uploadUsageForms` 加第 4 參數 `draftingDeptCodes` |
| `frontend/src/api/types.ts` | modified | `UsageFormPoolItem.draftingDeptCodes?: string[]`（選填 additive） |
| `frontend/src/App.tsx` | modified | 兩條新路由 `usage-forms/new`／`usage-forms/:formId/edit` |
| `frontend/src/components/PageHeader.tsx` | modified | 頁標題節點 `div` → `h1`（見 §五 (a)） |
| `frontend/src/pages/PermissionMatrixPage.tsx` | modified | `FIELD_DISPLAY` 之 OJT 列同步為 `['唯讀','可寫','可寫','可寫','唯讀']` |
| `frontend/src/pages/AccessHistoryPage.tsx` | modified | `clearQuery` 之 `setKind('')` → `setKind(KIND_ALL)`（見 §五 (f)） |

## 四、向 `ring-fe` 提出之申訴（三則，全數成立並由 `ring-fe` 於 `fcc375b` 修正）

| # | 爭點 | 舉證形狀 | ring-fe 裁定 |
|---|---|---|---|
| 1 | `AC-N53` 之 `within(row).getByText('附件上傳')` 與同檔既有 `TS-AQ-FE-001` 之 `getByText('DOWNLOAD · 下載')`（且該元素本身帶顏色 class）互斥 | **窮舉三種 pill DOM 形狀**：①標籤為 pill 直屬文字（＝`prototypes/17:315` 之 `${act} · ${lbl}` 逐字形狀）→ B 綠 A 紅；②標籤包進子元素 → A 綠但 pill 之 `getNodeText` 變 `"DOWNLOAD · "`、B 紅；③依 actionType 分支結構 → 兩者皆綠但**無任何 AC 授權**。另舉 `AC-N53` 之規格文字本身為**對映函式層級**（`actionTypeLabel(...) === '附件上傳'`），未要求該標籤在 DOM 中自成節點 | 成立 → 改為 `getByText('ATTACHMENT_UPLOAD · 附件上傳')`，明文不走 ③ |
| 2 | `TS-D18-062` 之 `within(row).getByText('—')`（單數）被同檔 `AC-N47` 新欄連坐 | fixture `uf3` 之 `formNumber` 為 `null` **且**無 `draftingDeptCodes` ⇒ 同一 `<tr>` 內必然出現兩個 `—`。兩條 AC（`AC-D15①`／`AC-N47`）都明訂 0 值顯示 U+2014，且 `AC-N47` 明訂該欄置於「表單名稱」之後 ⇒ **結構上必然**多重命中，非產品缺陷 | 成立 → 先取 `[data-form-number]` 容器再於其內找文字 |
| 4 | `proxy-coverage.test.ts` 之「兩份設定彼此一致」把**靜態檔 location** 誤算為 API 代理前綴 | 該斷言之排除清單硬寫死單一字面 `.filter((p) => p !== 'assets')`；新增之 `location /pdfjs/`（純 `try_files $uri =404`、**無 `proxy_pass`**）因而被算進代理前綴而與 vite 的 8 個 proxy key 不等。`pdfjs` 與 `assets` 同性質：dev 端由 Vite 靜態服務 `public/pdfjs/`，**加進 vite proxy 反而會讓 dev 的 pdf.js 去打後端 :3000 拿 cmap 而 404** ⇒ 該斷言現行形狀等於「禁止 nginx 再新增任何靜態檔 location」，而那並非它要守的東西 | 成立 → 採本人建議之 ②：改為具名 `STATIC_LOCATIONS` 常數（比照既有 `NOT_PROXIED` 逃生口，須附理由），並**加碼一條反腐爛守衛**（清單項目必須確實存在於 `nginx.conf`）。`18cd385` |
| 3 | `AppendixManagementPage.export.test.tsx` 之「後台**不得**渲染 `data-wm-note`」前提已失效 | 前提源自 `OQ-FM-01`，已被 `OQ-D9-08`／`OQ-D9-33`／`F020 AC-N20` 全面推翻；**環內互斥可直接舉證**——同 feature 之 `AppendixManagementPage.test.tsx:83`／`:96` 正面要求每列帶 `data-wm-note` 且文案逐字，兩案不可能同時綠於同一份 DOM | 成立 → 就地反轉為 `AC-N20` 正面斷言（pdf／非 pdf 兩態），原案全文逐字保留於註解 |

> 📌 三則皆為「**環內兩條斷言互斥**」或「**前提已被人類裁決推翻**」——即可**逐格窮舉舉證**之型，
> 而非「我覺得測試太嚴」。本人未因任何一則而修改測試或放寬產品行為；申訴期間先實作
> **可綠之那一側**（＝spec／prototype 所要求者），不空等裁決。

## 五、刻意偏離 prototype 之項目與可舉證理由（**本輪最需留存之紀錄**）

> 本 repo 之硬性要求為「prototype 是版面權威，嚴格照做、不自創」。以下 5 項為刻意偏離，逐項附理由。
> 判準取自 F018 spec 之「🔴 prototype 載體之權威化」節：該節**明文挑選**哪些 prototype 掛鉤與文案
> 取得權威（`AC-N77`／`AC-N78`／`AC-N79`），並自陳「未入 AC 之掛鉤與文案，環要嘛不建約束、要嘛自行
> 臆造斷言，兩者皆為缺陷」——**即 spec 自己承認「prototype 有、但未入 AC」之元素不具約束力**。

### (a) 🔴 `19b` 底部「AC-N49 副作用邊界之明示」說明框**未移植**
- **形狀**：`19b` 於三個區塊之後另有一個灰底說明框，內容為
  「儲存只更新 **表單編號** 與 **制定部門** 兩項 metadata：`blobPath / format / size / name / uploadedBy / uploadedAt`
  六欄逐欄不變、Blob 位元組未被讀取亦未被寫入、與文件之全部關聯不變，且**不會**觸發 `USAGE_FORM_OVERWRITE_SHARED`。」
- **不可移植之可舉證理由**：`AC-N79②` 要求「表單檔案」區塊之換檔引導句**含逐字字串
  `USAGE_FORM_OVERWRITE_SHARED`」，環以 `screen.getByText(/USAGE_FORM_OVERWRITE_SHARED/)`（**單數**）驗之。
  該底部說明框內亦有同一字串之 `<span class="mono">` ⇒ **必然兩處命中**、該案必紅。
  DTL 之 `getNodeText` 只串直屬 text node，因此**不存在**「保留該框又只有一處命中」之 DOM 形狀
  （把字串拆進更深層子元素只會讓命中元素換人，數量不變）。
- **正當性**：該框未被 `AC-N77`～`AC-N79` 任何一條賦予權威；其內容（六個資料欄名、Blob 位元組讀寫）
  是寫給規格覆核者看的開發者語彙，非終端使用者所需。相對地 `AC-N79②` 是明文 AC。
- ⚠ **對照**：`19a` 頂部之同類說明框（「純版面搬遷…單一動作一次送出…後端建立端點之語意、欄位名與
  錯誤碼逐字不變」）**有逐字移植**——它不與任何斷言衝突。偏離僅限可舉證衝突之該一框。

### (b) `19a` 之「檔案大小上限 20 MB」＋「示範值」徽章 → 用實際上限 **50 MB**、不移植徽章
prototype 該行自帶 `<span class="...">示範值</span>` 標記，即 designer 自陳非權威值。實際上限由後端
`file-rules` 與既有 `endpoints.ts` 註解所載之 `FILE_SIZE_EXCEEDED（50MB）` 決定。

### (c) `19a`／`19b` 之原型專用控制項 → 未移植
- `19a` 之 `[data-prototype-demo]` 示範選檔三顆鈕（`放款覆核表.xlsx`／`對保通知書.pdf`／`作業說明.docx（不支援）`）
- `19b` 之 `[data-prototype-demo]` 容器與 `#demoForm` 記錄切換器
`AC-N79③` 明文禁止後者（「會讓任何使用者在編輯頁任意切換到別人的表單」），並已由環之負向斷言鎖定；
前者為同型腳手架，一併不移植。

### (d) 檔案選擇器由 prototype 之 `<button onclick="fileInput.click()">` 改為 `<label>` 包 `<input type="file">`
沿用本 repo 既有 F018 上傳 modal 之既有 pattern。視覺完全相同（label 套用同一組 dashed 樣式），
可及性較佳（原生 label→control 關聯，不需 ref 轉呼叫），且使 `getByLabelText('選擇檔案')` 經
`aria-label` 命中隱藏 input。

### (e) 🔴 兩個「—」儲存格：把 `title`／配色 class 從 prototype 的內層 `<span>` **移到帶掛鉤的 `<td>`**
> **這是可推廣的測試／DOM 接縫知識，是本輪最值得留給下一輪的一條。**

- **prototype 形狀**（`prototypes/19-usage-form-management.html:322`，`data-form-number` 於 `:320` 同型）：
  `<td class="px-4 py-3" data-drafting-dept><span class="text-slate-300" title="此表單未指定制定部門">—</span></td>`
- **問題**：環以 `getByText('—', { selector: '[data-drafting-dept]' })` 定位。DTL 的 `selector` **只過濾
  「被文字命中的那個元素本身」，不看祖先**；而 `getNodeText(node)` 只串接**直屬** text node。
  ⇒ `<span>` 有文字但無掛鉤、`<td>` 有掛鉤但直屬文字為空 ⇒ **0 命中**，照抄 prototype 必紅。
- **修法**（屬實作端、非申訴）：把 `text-slate-300` 與 `title` 一併移到 `<td>`，文字直接放 `<td>`。
  視覺完全相同（配色 class 作用於同一塊儲存格）。
  ```tsx
  <td className="px-4 py-3 text-slate-300" data-drafting-dept title="此表單未指定制定部門">—</td>
  ```
- ⚠ **只改該分支**：`data-form-number` 之**有值**分支維持內層 `<span className="mono">`——`TS-D18-061`
  斷言的正是該 span 之 class（`cell.className` 含 `mono`）；一併上移會使該案轉紅。
  無值分支則同樣把 `data-form-number`／文字／`title` 三者收到同一個 `<td>`。
- 📌 與申訴 #2 之關係：`ring-fe` 修 `TS-D18-062` 時第一版寫 `{ selector: '[data-form-number]' }` 仍紅，
  查 DOM 後才改為「先 `row.querySelector('[data-form-number]')` 取容器、再 `within(...)` 找文字」。
  **兩種寫法在「掛鉤與文字同元素」之實作下皆綠**；本人採同元素形狀，兩側因而一致。

### (f) `PageHeader` 之頁標題由 `<div>` 改為 `<h1>`（非偏離 prototype，而是**回歸** prototype）
所有 admin prototype 之 topbar 皆為 `<h1 class="font-semibold text-slate-900 text-sm truncate">`
（見 `19a`／`19b` 等各頁 `<header>`），而 React 共用元件原為 `<div>` ⇒ 任何
`getByRole('heading', { name: 頁標題 })` 在 19 個後台頁上都找不到。
- **未在頁面內另加 `<h1>`**：那會與 topbar 標題重複顯示，是為過斷言而造的假結構。
- **blast radius 已查證**：全 repo 僅 `PublicListPage.test.tsx` 使用 heading 查詢，而該頁**不使用**
  `PageHeader`；`PageHeader.breadcrumb.test.tsx`／`.callers.test.tsx` 不斷言標籤名。class 逐字不變。

## 六、其他實作取捨與如實登錄

### (a) `DashboardHome` 之紅：判定為併發假紅，非 D9 漣漪
lead 交接時列為待查項。本人**在動手前先跑一次乾淨基準**（尚未改任何檔案）即為綠，其後三次全量
重跑亦全綠；未改該頁或其相依檔案。lead 亦確認其讀數取自多 agent 併發寫檔期間（耗時 380s vs 正常 70–100s）。

**同型事件於本段再現一次並已歸因**：某次全量跑出現 `DocumentCreatePage.test.tsx > AC-22` 紅，
且該檔耗時 **39s**（單獨跑 6.5s）——當時與 `ring-fe` 之 vitest 併跑，worker 互搶 CPU 觸發預設
`testTimeout`。單獨重跑 28/28 綠；ring-fe 收工後之乾淨全量跑 88/88 全綠。
> 🔴 **教訓（下一輪照做）**：本 repo 前端全量跑在併發負載下會有偶發假紅。
> **看到單一案例紅時先單獨重跑該檔再下結論**，不要據此改產品碼。

### (b) 錯誤碼判定**不用** `instanceof ApiError`
環之 fixture 為 `Object.assign(new Error('duplicate'), { code: 'USAGE_FORM_NUMBER_DUPLICATE' })`
——**不是** `ApiError` 實例。既有 `editNumberErrorMessage()` 以 `instanceof ApiError` 判斷，會直接落到
「未預期錯誤」分支，使 `AC-N44` 之逐字訊息永遠不顯示。新的 `errorCodeOf()` 改以**結構取值**
（`'code' in e` 且為 string），同時涵蓋 `ApiError` 與一般物件。

### (c) 逐字文案抽為共用模組，避免三頁漂移
`AC-N44`／`AC-N48` 明訂新增頁與編輯頁之 placeholder、`maxlength`、兩則錯誤訊息**逐字相同、不另造**。
三處各寫一份字面字串時「兩條 AC 各自綠燈但字串可獨立漂移」（本 repo 已於「上傳 modal ↔ 編號 modal」
踩過同一形狀），故抽為 `domain/usage-form-number.ts` 單一來源。

### (d) 制定部門之純 metadata 邊界（`AC-N46`）如何在實作上結構性成立
`DraftingDeptPicker` **只回報選取集合**，不接受任何權限相關輸入、不做子樹展開；
頁面把該集合原樣送出。全線未觸碰 `isWithinSubtree`／`isDocVisibleToViewer`／`isUsingDeptMatched`
三個純函式（`git show` 可證三檔未在 `e79e087` 內）。清單頁之名稱解析走既有 `/org-units`＋
`orgPathLabel()`（沿 `parentCode` 上溯），與權限判定無交集。

### (e) 端點對齊：`PATCH /admin/usage-forms/:formId/number` → `PATCH /admin/usage-forms/:formId`
後端線已完成該擴大（`usage-forms.controller.ts` 之 `@Patch('admin/usage-forms/:formId')`），
`endpoint-contract.test.ts` 為跨線契約之唯一機器閘門。前端移除 `updateUsageFormNumber`、
改為 `updateUsageForm(formId, { formNumber?, draftingDeptCodes? })`。
- 回傳型別**刻意宣告為 `Promise<void>`**：後端雖回 200＋更新後之列，但其形狀為 `UsageFormRecord`
  （不含 `docCount`／`documents`），與清單列 `UsageFormPoolItem` 不同；宣告它會誘使呼叫端就地拿它
  更新畫面而型別悄悄不符。編輯頁儲存成功後導回清單並重查。
- `draftingDeptCodes` 隨既有 multipart 以 **JSON 陣列字串**送出（architecture-spec §11.10(b) 之逐字形狀），
  且 **0 筆時不送該欄**——後端以「未帶鍵 ≠ 帶空陣列」區分「不動」與「顯式清空」。

### (f) `AccessHistoryPage.clearQuery` 之既有破口（lead 已核可修正、不 revert）
`AC-N69` 把類型哨兵由 `''` 改為 `KIND_ALL='全部'` 時，`clearQuery()` 之 `setKind('')` 未同步改。
後果有二：`tsc --noEmit` 本就紅（`''` 不在 `AuditKind | typeof KIND_ALL` 值域內）；且按「清除」後
`<select>` 落到**無任何 option 相符**之空白狀態。已改為 `setKind(KIND_ALL)`。

### (g) 代理設定：**零改動，已逐條核對**
- 兩條新路由為**純前端 SPA 路由**，落於既有 `location /admin/`（`nginx.conf:55`）與
  `vite.config.ts` 之 `/admin` proxy 規則下，**不對應任何新的後端路徑字面**。
- 後端 PATCH 路徑雖變，仍在 `/admin/` 前綴內；nginx 依路徑而非 method 分流，無影響。
- 清單頁新增之 `getOrgUnits()` 呼叫：`/org-units` **已在** `vite.config.ts:48` 與 `nginx.conf:118`
  白名單內（2026-07-25 瀏覽器煙霧測試之修正已在 main），不需新增規則。
- `proxy-coverage.test.ts` 與 `endpoint-contract.test.ts` 皆綠可佐證。

## 七、未涵蓋項（如實登錄，交還 lead）

| # | 項目 | 現況 |
|---|---|---|
| 1 | **兩個新頁之瀏覽器煙霧測試** | 未做。vitest 全為 jsdom＋`vi.mock('../api/endpoints')`，**從未真的打到後端**。需真人驗：`/admin/usage-forms/new` 建立一筆（含編號與制定部門）→ 清單該列「制定部門」欄顯示**組織名稱**而非裸 `orgCode`；`/admin/usage-forms/:id/edit` 回填後儲存 → 該列六欄不變。~~硬重新整理（非 SPA 導覽）兩條新路由亦須回 SPA 而非 404~~ ✅ **此子項已實證**，見 §八 (c) |
| 2 | **制定部門名稱解析之真實資料** | 清單頁與兩新頁之標籤皆由 `/org-units` 解析；解析失敗時**優雅降級為顯示 `orgCode`**（不顯示 undefined、不阻斷清單）。此降級路徑在單元測試中恆被走到（環未 mock `getOrgUnits`），**但「解析成功」之路徑從未被機器驗證** |
| 3 | ~~`prototypes/18-permission-matrix.html` 之 OJT 列落後~~ ✅ **已解決** | 交付時該行仍為舊值 `['唯讀','可寫','唯讀','唯讀','唯讀']`，未隨 `OQ-D9-19/20/24` 更新；本人依 `FIELD_MATRIX`（`AC-N22` 之權威）而非依過時 prototype 改前端 `FIELD_DISPLAY`，並如實提報「程式與 prototype 不一致」而**未自行修改 `prototypes/**`**。lead 派回 designer 後已於 `f36b51e` 補正為 `['唯讀','可寫','可寫','可寫','唯讀']`（`:230`），兩側現已一致 |
| 4 | 前後端 `FIELD_MATRIX` 兩份鏡射之交叉比對 | 沿 impl-fe 段之盲區 #24：兩側測試各自對各自檔案斷言，**無自動化交叉比對**。本段只動前端**顯示**鏡射（`FIELD_DISPLAY`），未動 `domain/field-matrix.ts` |
| 5 | `.xls` 上傳鈕仍為 `disabled` | 沿 impl-fe 段 §六(e)②之登錄，本段未觸碰。**請勿因該案綠燈而認為 `.xls` 上傳可用** |
| 6 | backend 線之實作日誌 | `impl-be` 因額度中止未寫；lead 已表明另行處理，非本人範圍 |

## 八、部署面：`frontend/nginx.conf` 缺 `/pdfjs/` 規則（lead 指派之 NEW work，已修並實證）

> 🔴 **這是「閘門全綠但部署會靜默壞掉」的一格**——與上一輪 `@pdf-lib/fontkit` 短 loca 截斷
> （使用者親自發現、lead 誤判為已修）同一形狀。單元測試永遠抓不到：vitest 以
> `vi.mock('pdfjs-dist')` 執行，**從未真的下載任何 `.bcmap`**。

### (a) 缺陷形狀
`nginx.conf` 原本沒有 `/pdfjs/` 之 location，故落入最後的 SPA fallback：
```nginx
location / { try_files $uri $uri/ /index.html; }
```
檔案**存在**時 `try_files $uri` 先命中真檔，所以**正常路徑看起來完全正常**；
**缺檔時**則回 `200` ＋ `index.html`。pdf.js 於是收到一份 `Content-Type: text/html` 的「cmap」——
**它不拋錯，只會靜默缺字**（中文變空白／方塊）。`/assets/` 寫 `try_files $uri =404` 正是為了這件事。

### (b) 修正
於 `/assets/` 之前新增（`nginx.conf`）：
```nginx
location /pdfjs/ {
  try_files $uri =404;
}
```
⚠ **刻意不下 `immutable` 長快取**（與 `/assets/` 之唯一差異）：本目錄檔名由 pdfjs-dist 版本決定、
**不含內容雜湊**，升版後同名檔內容會變，`immutable` 會讓瀏覽器整年不回頭檢查而卡在舊版；
改以預設 `Last-Modified`／`ETag` 重新驗證（304，pdf.js 每份文件通常只取 1～2 個 bcmap）。

### (c) 🔴 實證（**不是結構推論**）——以拋棄式 nginx 容器做 A／B 對照
以 `nginx:alpine` 掛載**真實的** `nginx.conf` 與一個最小 doc root（`index.html` ＋ 一個真的
`UniGB-UCS2-H.bcmap` ＋ 一個真的 `FoxitFixed.pfb`）起兩個容器：`:8098` 掛 **`git show HEAD:` 之修正前**
設定、`:8099` 掛**修正後**設定。另起一個 `--network-alias backend` 的容器讓 `proxy_pass` 之上游名稱可解析
（否則 nginx 於載入設定時即因 `host not found in upstream` 拒絕啟動）。

| 請求 | 修正前 `:8098` | 修正後 `:8099` |
|---|---|---|
| `/pdfjs/cmaps/NOPE.bcmap`（缺檔） | 🔴 **`200` `text/html` 98 bytes ＝ SPA index.html** | ✅ `404`（nginx 404 頁，153 bytes） |
| `/pdfjs/standard_fonts/NOPE.pfb`（缺檔） | 🔴 **`200` `text/html` 98 bytes** | ✅ `404` |
| `/pdfjs/cmaps/UniGB-UCS2-H.bcmap`（真檔） | `200` `application/octet-stream` 43366 bytes | `200` `application/octet-stream` **43366 bytes**（位元組數與來源檔相同） |
| `/pdfjs/standard_fonts/FoxitFixed.pfb`（真檔） | — | `200` `application/octet-stream` 17597 bytes |

**回歸對照（修正後 `:8099`，證明沒有誤攔既有行為）**

| 請求 | 結果 | 意義 |
|---|---|---|
| `/assets/nope.js` | `404` | 既有 `=404` 規則未受影響 |
| `/admin/documents/abc`（`Accept: text/html`） | `200` SPA shell | Accept-based SPA bypass 未受影響 |
| `/admin/usage-forms/new`（`Accept: text/html`） | `200` SPA shell | **本 delta 新增路由之硬重新整理可用** |
| `/admin/usage-forms/uf1/edit`（`Accept: text/html`） | `200` SPA shell | 同上（含路由參數） |
| `/admin/usage-forms/overview`（`Accept: application/json`） | `502` | 確實走了 `proxy_pass`（驗證環境之 `backend` 別名容器只聽 80 非 3000，故 502 為預期）——**重點是沒有回 200 index.html** |
| `/org-units`（`Accept: application/json`） | `502` | 同上 |
| `/some/spa/route`（`Accept: text/html`） | `200` SPA shell | SPA fallback 本身未被破壞 |

驗證後三個拋棄式容器與該 network 已刪除；**正式 stack（`icsop-frontend`／`icsop-backend`／`icsop-pgvector`）全程未觸碰**（驗證前後皆 `Up 12 hours (healthy)`）。

### (d) 🔴 對「正在跑的 dev 容器」之實地探測——同一形狀已在真實環境成立
```
docker exec icsop-frontend grep -c pdfjs /etc/nginx/conf.d/default.conf   → 0
docker exec icsop-frontend ls /usr/share/nginx/html/pdfjs                 → No such file or directory
curl http://127.0.0.1:5173/pdfjs/cmaps/UniGB-UCS2-H.bcmap  → HTTP 200  text/html  764 bytes
curl http://127.0.0.1:5173/assets/nope.js                  → HTTP 404
```
該容器為**本 delta 之前**所建（`Up 12 hours`），dist 內根本沒有 `pdfjs/` 目錄 ⇒ 連**真實檔名**的 cmap
都回 `200 text/html`。`/assets/nope.js` 同時回 `404` 是最好的對照組：**同一台 nginx、同一份設定，
差別只在有沒有那條 `=404` 規則**。

### (e) ⚠ 生效條件（交還 lead）
`frontend/Dockerfile:11` 為 `COPY nginx.conf /etc/nginx/conf.d/default.conf`——設定檔是**烘進 image** 的，
`docker-compose.yml` 之 `frontend` 服務**沒有掛載 volume**。故本修正與 `dist/pdfjs/` 資產
**都必須重建 image 才會生效**。
🔴 且依本 repo 既有教訓：`docker compose up -d --build` **只換 image 不換容器**（會印 `Running` 而非
`Recreated`），須 `--force-recreate`，否則會對著舊碼做驗收。**本人未執行任何重建**（不動共用 stack）。

### (f) 申訴 #4（`proxy-coverage.test.ts`）
新增 location 使該檔之「兩份設定彼此一致」轉紅——**已走 mailbox 申訴、未自行修改測試**，
`ring-fe` 核實成立並於 `18cd385` 改為具名 `STATIC_LOCATIONS` 常數＋反腐爛守衛。詳見 §四 第 4 列。

## 九、部署面（二）：`.mjs` 無 MIME 對映 ⇒ 前台檢視器整個掛掉（使用者實測揪出）

> 🔴 **本輪第二個「四道驗證全綠、真瀏覽器一開就死」的缺陷，且是使用者親自發現的。**
> 與 §八 的 `/pdfjs/` 是**不同路徑、不同機制**——§八 是「資源取得不到時被 SPA 吃掉」，
> 本節是「資源**取得得到**、但**不能被瀏覽器當成模組執行**」。

### (a) 症狀與根因
使用者於真瀏覽器開前台檢視器：
```
載入失敗 · Setting up fake worker failed:
"Failed to fetch dynamically imported module:
 http://localhost:5173/assets/pdf.worker-BgryrOlp.mjs"
```
實測（對正在跑的容器，唯讀）：

| 觀測 | 值 |
|---|---|
| 容器內檔案 | **存在**，`/usr/share/nginx/html/assets/pdf.worker-BgryrOlp.mjs`，2,209,730 bytes |
| nginx 版本 | `nginx/1.31.2` |
| `grep -w mjs /etc/nginx/mime.types` | **命中 0**（無 `.mjs` 對映） |
| `/assets/pdf.worker-*.mjs` 之回應 | `200` **`application/octet-stream`** |
| 對照：一般 `/assets/index-*.js` | `200` `application/javascript` |

**根因**：nginx 的 `mime.types` 沒有 `.mjs`，落到 `default_type`＝`application/octet-stream`；
而瀏覽器對 **ES module 有嚴格 MIME 檢查——非 JavaScript MIME 的模組一律拒絕執行**。
pdf.js 的 worker 由 Vite 以 `?url` 打包（`PublicViewerPage.tsx:4`）並以 module 型 Worker 載入，正中此規則。
⇒ 症狀是「Failed to fetch dynamically imported module」而**不是 404**——**檔案明明在、還回 200**，
所以任何「檔案有沒有進 image」「HTTP 是不是 200」的檢查都會說一切正常。

### (b) 🔴 為什麼四道驗證全部放它過去（**比修法本身更值得記**）

| 驗證 | 為何抓不到 |
|---|---|
| 前端單元測試（vitest） | `vi.mock('pdfjs-dist')` ⇒ **根本不碰真 worker**，結構上不可能抓到 |
| `npm run build` ＋ `verify-pdfjs-assets.mjs` | 只驗 `dist/pdfjs/` 之 cmaps／fonts **數量**；不驗 `dist/assets/` 的 worker，**更不驗 MIME** |
| 本人 §八 之 A／B 容器實測 | 驗的是 `/pdfjs/` 的**缺檔 404 與真檔位元組數**——結論都對，但那是**另一條路徑**；`.mjs` 不在該路徑上 |
| lead 之正式容器驗證 | 看到 cmap 為 `application/octet-stream` 並判定正常——**對 cmap 而言確實正常**（它走 `fetch` 取 ArrayBuffer，不受 module MIME 規則管），未意識到 worker 是 `.mjs` 且受**另一套**規則管 |

🔴 **共同盲點（一句話）**：
> **「資源取得得到」與「資源能被瀏覽器當成它該有的型別使用」是兩件事。**
> 盲區表 `#18` 原本只關了前半（檔案有沒有進產物、拿不拿得到）；後半（`Content-Type` 是否
> 滿足**該載入方式**的規則）**從未被任何一道閘門檢查過**。

📌 這與本輪一路抓到的是同一族：**斷言瞄準的東西，不是它名字所指的東西**。
「資產已部署」聽起來涵蓋「資產可用」，實際上只涵蓋「資產存在」。

### (c) 修正
於 `location /assets/` **之前**新增（`frontend/nginx.conf`）：
```nginx
location ~ ^/assets/.+\.mjs$ {
  types { text/javascript mjs; }
  expires 1y;
  add_header Cache-Control "public, immutable";
  try_files $uri =404;
}
```
⚠ **為何是獨立 regex location，而不是在 `server` 層加 `types`**：nginx 的 `types` 是**區塊型指令**，
在某層宣告即**「取代」而非「附加」**該層繼承來的整份對映表。（此非引述文件，而是**實測結論**，見 (d)。）
⚠ regex location 優先於 prefix location ⇒ 本區塊**取代** `/assets/` 對 `.mjs` 的處理，
故必須**自行複製** immutable 長快取，否則 worker 會悄悄失去快取。
（`.mjs` 檔名含內容雜湊，`immutable` 對它安全——與 `/pdfjs/` 那組**非**雜湊檔名不同，見 §八 (b)。）

### (d) 實證：三向對照（拋棄式容器，同一份 doc root）
`:8101` 掛 `git show HEAD:` 之修正前設定；`:8102` 掛本次修正；
`:8103` 掛**刻意寫錯的危險變體**（把 `types { text/javascript mjs; }` 放在 `server` 層）——
第三欄的用途是**把 (c) 那段「會取代整份對映表」的主張從斷言變成實測**。

| 資源 | before（HEAD） | **after（本次修正）** | danger（`server` 層 `types`） |
|---|---|---|---|
| `/assets/pdf.worker-*.mjs` | 🔴 `application/octet-stream` | ✅ **`text/javascript`** | `text/javascript` |
| `/assets/index-*.js` | `application/javascript` | ✅ 不變 | 🔴 **`application/octet-stream`** |
| `/assets/index-*.css` | `text/css` | ✅ 不變 | 🔴 **`application/octet-stream`** |
| `/index.html` | `text/html` | ✅ 不變 | 🔴 **`application/octet-stream`** |
| `/pdfjs/cmaps/*.bcmap` | `application/octet-stream` | 不變（見 (e)） | `application/octet-stream` |

⇒ 危險變體會把 **html／js／css 全部打回 `application/octet-stream`**，整站崩潰——
所以「在 `server` 層加一行 `types` 就好」是錯的，本修正的 location 範圍限縮是必要的、非過度設計。

**快取未退化**（`.mjs` 之 `Cache-Control`，before／after 逐字相同）：
```
max-age=31536000
public, immutable
```

### (e) 第 3 點掃描結果：還有沒有別的副檔名同型？

`dist/` 內全部副檔名：`bcmap`(168)／`pfb`(10)／`ttf`(4)／`html`(2)／`mjs`(1)／`js`(1)／`css`(1)。
`nginx/1.31.2` 之 `mime.types` 對映情況與實測 `Content-Type`：

| 副檔名 | mime.types | 實際回應 | 載入方式 | 是否受嚴格 MIME 檢查 | 判定 |
|---|---|---|---|---|---|
| `.mjs` | **無** | ~~octet-stream~~ → `text/javascript` | `new Worker(url, { type:'module' })` | 🔴 **是**（ES module） | **已修** |
| `.js` | 有 | `application/javascript` | classic script | 是，但已正確 | OK |
| `.css` | 有 | `text/css` | `<link rel=stylesheet>` | 是，但已正確 | OK |
| `.bcmap` | 無 | `application/octet-stream` | pdf.js `fetch` → ArrayBuffer | **否** | 可接受 |
| `.pfb` | 無 | `application/octet-stream` | pdf.js `fetch` → ArrayBuffer | **否** | 可接受 |
| `.ttf` | 無 | `application/octet-stream` | 位於 `pdfjs/standard_fonts/`，亦由 pdf.js `fetch` 取用，**非** CSS `@font-face` | **否** | 可接受 |
| `.wasm` | **有**（`application/wasm`） | — | — | 是（`instantiateStreaming`） | **不適用**：已查 `pdfjs-dist@4.10.38` **不含任何 `.wasm`**（`find … -name "*.wasm"` 無輸出）；且 nginx 本來就有正確對映 |

📌 **不確定的部分如實登錄**：`.bcmap`／`.pfb`／`.ttf` 現況為 `application/octet-stream`，
**依目前的載入方式（`fetch` 取 ArrayBuffer）不會出問題**，故本輪**不改**（避免擴大範圍）。
⚠ 但若日後有人加上 `X-Content-Type-Options: nosniff`，或改以 CSS `@font-face` 載入那批 `.ttf`，
`octet-stream` 就會變成問題。若要一併正名，成本極低（同一 regex location 手法）——**交還 lead 決定**。

### (f) 測試影響：**無**
`proxy-coverage.test.ts` 之 `nginxProxyPrefixes()` 取 location 字面第一段，
`location ~ ^/assets/.+\.mjs$` → 解析為 `assets`，而 `assets` 已在 `STATIC_LOCATIONS` 內
⇒ 不影響一致性比對。**實跑**：該檔 22/22 綠；全量 88 檔／1330 案全綠、`tsc --noEmit` 乾淨。
（本次**未**動任何測試檔，亦無需申訴。）

### (g) ⚠ 生效條件與尚未驗到的一步
同 §八 (e)：`nginx.conf` 烘進 image ⇒ **必須重建 frontend image 並 `--force-recreate`** 才生效。
lead 指示本輪**先不重建**（使用者環境），故上述 after 欄位全部來自**拋棄式容器掛載工作區設定**之實測，
**尚未**在正式容器上覆核。重建後應以一行覆核：
```
curl -s -o /dev/null -w "%{http_code} %{content_type}
" http://localhost:5173/assets/pdf.worker-*.mjs
# 期望：200 text/javascript（修正前為 200 application/octet-stream）
```
📌 **同時修正 §八 (d) 之一處觀測**：該節所記「dev 容器 dist 內無 `pdfjs/` 目錄」係**重建前**之狀態；
lead 已於 `2026-08-21T01:25` 重建該容器，現況為 `pdfjs/cmaps` 168 檔、`standard_fonts` 10 檔皆在，
且 `/pdfjs/` 之 `=404` 規則已生效（`grep -c "location /pdfjs/"` → 1）。`.mjs` 之修正則尚未進 image。
