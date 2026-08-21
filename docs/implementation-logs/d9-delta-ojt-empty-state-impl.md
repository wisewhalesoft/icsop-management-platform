---
type: implementation-log
feature_id: D9-delta 補正（F016 `#ojt-role-open-delta` 之後續；AC 編號待 spec-writer 回填）
feature_name: OJT「尚未上傳」空狀態上傳入口 —— 修「第一份 OJT 永遠傳不上去」
branch: main（HEAD `01d8b26`；`feat/d9-defect-delta` 已併入，見 §六 (a)）
status: complete（本檔約束環 33/33 綠；frontend 全量 88 檔 1337 案全綠）
last_updated: 2026-08-21
---

# OJT 空狀態上傳入口 —— 實作紀錄（impl-fe，補正段）

> **角色邊界**：Uncle-Bob 約束環模式。約束環由 `ring-fe2` 對實作全盲撰寫並定版於 `01d8b26`；
> 本人**只寫 production code，全程未建立、修改、弱化或跳過任何測試檔**——
> `git diff --stat` 之兩個檔案皆為 production code，零測試檔異動、零 `docs/**` 異動（本檔除外）、
> 零 `prototypes/**` 異動、零 `backend/**` 異動。本輪**無測試爭議**，故未向 `ring-fe2` 提出任何申訴。

## 一、缺陷與根因

使用者實測揪出：主管／部門窗口在文件唯讀頁**可以取代既有 OJT**，但該文件**尚無任何 OJT** 時
畫面上沒有任何上傳入口 ⇒ 第一份 OJT 永遠傳不上去。

根因是「附件清單缺者不列」與「上傳鈕掛在 OJT 那一列上」兩個各自合理的決定交會出的死角：
`attachments.map(...)` 只渲染伺服器回傳之附件紀錄（`DocumentReadonlyPage.tsx` 原 `:266` 註解
逐字為「缺者不列」），而 `data-ojt-upload` 只長在 `writable = a.kind === 'ojt' && ojtWritable`
之列模板裡 —— 沒有 OJT 紀錄就沒有那一列，沒有那一列就沒有入口。

## 二、實跑數字（皆為本人親跑）

### 動手前（基線，`01d8b26` 之上未改任何檔案）
```
單檔  npx vitest run src/pages/DocumentReadonlyPage.test.tsx
      →  33 案：8 紅 / 25 綠
全量  npx vitest run
      →  88 檔：1 紅 / 87 綠　　1336 案：8 紅 / 1328 綠
```

### 交付時
```
單檔  npx vitest run src/pages/DocumentReadonlyPage.test.tsx
      →  33 案全綠（Duration 2.07s）
全量  npx vitest run
      →  88 檔全綠　　1337 案全綠 / 0 紅（Duration 42.21s）
型別  npx tsc --noEmit → 無輸出，exit 0
```

> **案數 1336 → 1337（+1）之來源已查明，非測試檔異動**：`src/components/Icon.registry.test.tsx:87`
> 以 `it.each([...used.keys()].sort())` **動態**為「頁面原始碼中出現過的每一個圖示名稱」各生一案。
> 本次於 production code 新增 `<Icon name="file-plus">` 之使用 ⇒ 該守門測試自動多生一案
> 「圖示 file-plus 已註冊且可渲染」並通過。此為守門測試對本次註冊之正向驗證，非額外測試。
> **基線 1336 係本人 `git stash` 後重跑實測所得**（與 lead 交接讀數一致），非推算。

## 三、改動檔案（皆為 production code）

| 檔案 | 異動 | 說明 |
|------|------|------|
| `frontend/src/pages/DocumentReadonlyPage.tsx` | modified | 新增 `OjtEmptyRow` 空狀態列元件、三則逐字文案常數、`withOjtEmptyRow()` 插列純函式、`ojtAbsent` 判定；既有 OJT 檔案列之上傳鈕補 `data-ojt-upload-mode="replace"` |
| `frontend/src/components/Icon.tsx` | modified | 註冊 `'file-plus': FilePlus`（prototype 空狀態列之圖示為 `file-plus`，registry 原僅有 `file-plus-2`；未註冊之名稱會**靜默渲染為 null**） |

## 四、與 prototype 之逐項對照（權威＝`prototypes/16-document-readonly.html`，`724532e`）

| prototype | 實作 | 一致性 |
|-----------|------|--------|
| `rows.splice(1,0,ojtEmptyRow())` —— 插在 ICSOP PDF 之後＝OJT 原本列序位置 | `withOjtEmptyRow(rows, row, attachments.length)`；空狀態下 `attachments` 只含非 OJT 紀錄，有 ICSOP PDF 時該長度恰為 `1`，與 prototype 字面索引相同 | ✅ 兩態列序／列數一致 |
| 上傳入口僅由 `canWriteOjt()` 決定，未另寫白名單 | `writable={ojtWritable}`，而 `ojtWritable = canWriteOjt(role)`（判定單一權威仍為 `FIELD_MATRIX`） | ✅ 同源，無新白名單 |
| SysAdmin／User：**DOM 直接不產生**上傳元素 | `{writable && (<label …>)}` 條件渲染，非 CSS 隱藏 | ✅ |
| `尚未上傳 OJT 實體簽到表`（三角色共用）／`上傳第一份`／`上傳第一份 OJT 實體簽到表`（`aria-label`＝`title`） | `OJT_EMPTY_TEXT`／`OJT_UPLOAD_FIRST_TEXT`／`OJT_UPLOAD_FIRST_ARIA` 具名常數，逐字照抄 | ✅ |
| 掛鉤 `data-ojt-empty`／`data-ojt-empty-text`／`data-ojt-upload-mode`（兩顆鈕皆有，值域恰二） | 空狀態列 `create`；既有 OJT 列補上 `replace` | ✅ 值域恰二 |
| 空狀態列**刻意不帶** `data-wm-note`、無下載鈕 | 未渲染任一者 | ✅（TS-D-013「無下載鈕」之既有斷言亦因此仍成立） |
| 空狀態列仍帶 `data-attachment-kind="ojt"`、可寫時帶 `data-writable-attachment`、徽章逐字 `可上傳／覆蓋` | 同左；不可寫時帶 `data-readonly-attachment` ＋逐字 `唯讀` | ✅ |
| 虛線外框＋可寫時 primary 淡底（`border-dashed` / `border-primary-300 bg-primary-50/40`）、圖示 `file-plus`（可寫 `text-primary-500`／否則 `text-slate-300`） | 逐字照抄 class | ✅ |
| 首次上傳**不問**「覆蓋既有？」二次確認 | 走既有 `onUploadOjt`，該路徑本就無二次確認 ⇒ 空狀態自然不問 | ✅（另見 §五 (b)） |

## 五、「不得開一個洞、鬆一片牆」之守恆檢查（`AC-N24`／`AC-N25`）

實作上把回歸鎖定交給**結構**而非紀律：空狀態列與檔案列共用同一個 `ojtWritable`（＝
`canWriteOjt(role)`），沒有第二處角色判定可以走樣；且空狀態列本身照樣帶 kind／可寫／唯讀三組掛鉤。
環的實跑結果（33/33）已逐項驗證：

- 兩態下對 Supervisor／DeptContact／ICSOPAdmin 之 `[data-writable-attachment]` 恰 1 個，且其列 `kind==='ojt'`；
- 兩態下對 SysAdmin 恰 0 個、`[data-ojt-upload]` 恰 0 個，空狀態列仍以 `[data-readonly-attachment]` 呈現；
- `[data-attachment-kind]:not([data-ojt-empty])` 之每一列（`icsop_pdf`／`usageform`／`appendix`）皆帶 `data-readonly-attachment`；
- 有 OJT 時不同時出現 `data-ojt-empty`（兩態互斥），且該態上傳鈕之 `aria-label`／mode 維持 `上傳／取代 OJT 實體簽到表`／`replace`。

## 六、如實揭露（未做、或與交辦措辭有出入者）

**(a) branch 名稱與交辦不同 —— 未自行切換。** 交辦指定 `feat/d9-defect-delta`，但工作副本現在 `main`
（`01d8b26`，較 `origin/main` 領先 2 個 commit），而 `feat/d9-defect-delta` 停在 `a59ad71`＝`main` 之祖先。
**本次所依據之兩個 commit（prototype `724532e`、約束環 `01d8b26`）都只存在於 `main`**，切到該 branch
反而看不到環。故在 `main` 上實作，未擅自切換或建立 branch；commit／branch 之處置交由 lead 決定。

**(b) 既有 OJT 之「取代」目前並無二次確認 —— 本次未新增。** prototype `openOjtConfirm()` 有二次確認，
但 production 之 `onUploadOjt` 自始就沒有（本頁原無 confirm modal 元件，prototype `:411` 註解亦自陳
「原型用之簡化二次確認（實作以既有 confirm modal 元件承接；本頁原無 confirm 元件）」）。
本次缺陷是「空狀態沒有入口」，補確認框屬**另一項行為變更**：環未涵蓋、無 AC、亦不在交辦範圍內，
擅自加上等於在無測試背書下改動既有寫入路徑。**現況：兩態皆不問確認**（交辦所述「首次不問」已成立，
「取代仍要問」則是既有落差、非本次造成）。若要償還，建議另開一項並先由 `ring-fe2` 立環。

**(c) 空狀態上傳入口實作為 `<label>`＋隱藏 `<input type="file">`，而非 prototype 之 `<button onclick>`。**
prototype 為靜態原型，其 `uploadOjt()` 是模擬；React 端要真的叫出檔案選擇器需要 `<input type="file">`。
**此非本次新增之偏離**——既有「上傳／取代」鈕早已是同一形狀（`DocumentReadonlyPage.tsx` 原 `:507`），
本次僅維持兩態一致。視覺 class 與 `aria-label`／`title`／可見文字逐字照抄 prototype 之按鈕。

**(d) 未跑 e2e／mutation／metric gate。** 交辦只要求 frontend vitest 單檔＋全量＋`tsc`，三者皆已跑並如上列數字。
