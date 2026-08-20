# Feature Status Tracker（功能完成度追蹤）

> **這是全專案「功能是否真正完成」的唯一彙總視圖（single source of truth）。**
> 每個 Fxxx 在此有一列，狀態以嚴格 Definition of Done 判定。功能規格散在 `features/Fxxx-*.md`，
> 各檔 `Status:` 行是局部狀態；**本檔負責把它們攤在一頁、並以「端到端可達」把關**，避免「有 commit、有按鈕就當作完成」。
>
> Product: ICSOP 文件管理平台 · 稽核基準：**2026-07-22**（初審 `e6045d9` → Wave 1 `4af5a02` → Wave 2 `8d5f35d`）· 對照 [spec-index.md](spec-index.md)

---

## Definition of Done（完成的定義）

一個功能標為 **✅ 已完成-已驗證**，必須同時滿足：

1. **AC 覆蓋** — 規格 `## Acceptance Criteria` 的每條主線，都有對應測試（後端 `*.spec.ts` / 前端 `*.test.tsx`）。
2. **端到端可達** — 已 wire 進 module/route，且**存在一條真實路徑實際行使它**。
   - 反例（本次揪出的經典失效）：F003 可以「建立帳號」，但建立出的帳號**無法登入**（建立時未寫 `email`，而唯一登入途徑用 email 比對；帳密登入端點又不存在）。端點存在 ≠ 功能可用 → 判 **部分**，不是完成。
3. **稽核/副作用落地**（若 AC 要求） — 例如「記錄稽核」需真的寫入。目前全站無 `AUDIT_LOG`，故所有「記錄稽核」條款一律未達成。

未達上述者，依實況標 `部分 / 進行中 / 未開始`。

## 狀態列舉

| 標記 | 意義 |
|---|---|
| ✅ 已完成-已驗證 | AC 覆蓋 ＋ 端到端可達 ＋ 副作用落地 |
| 🟡 部分 | 核心可用但有明確缺口（AC 未全覆蓋／某路徑不可達／副作用未落地） |
| 🔵 進行中 | 有骨架但尚無法端到端達成任何 AC |
| ⬜ 未開始 | 無實作（或僅權限鍵/欄位鍵佔位） |

`P`＝優先級（P0-MVP/P1/P2）；`Ph`＝規劃階段（Phase 1/2/3）。Phase 2/3 未開始屬「規劃上本就晚做」，非落後。

---

## 總覽

| 狀態 | 數量 | 功能 |
|---|---|---|
| ✅ 已完成-已驗證 | **27** | F001 F002 F003 F004 F005 F006 F007 F008 F009 F010 F011 F012 F013 F014 F015 F016 F017 F018 F019 F020 F023 F024 F025 F026 F036 F037 F038 |
| 🟡 部分 | **9** | F021 F022 F027 F028 F029 F030 F031 **F040 F041** |
| 🔵 進行中 | **0** | — |
| ⬜ 未開始 | **5** | F032 F033 F034 F035 **F039** |
| | **41** | |

> **🔴 2026-08-20 缺失／變更 delta（9 項）——規格層完成、實作尚未開始**（branch `feat/d9-defect-delta`；人類閘門已逐題裁決 `OQ-D9-01`～`OQ-D9-27` 全數定案，見 [open-questions §D9](open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)）。**AC 前綴＝`AC-N#`（`AC-N1`～`AC-N65`，共 65 條）**，分佈：[F020](features/F020-watermark.md) 21｜[F026](features/F026-role-field-matrix.md) 6｜[F016](features/F016-pdf-ojt-attachment.md) 8｜[F025](features/F025-role-function-matrix.md) 1｜[F017](features/F017-backend-document-list.md) 4｜[F018](features/F018-usage-form-management.md) 9｜[F023](features/F023-audit-logging.md) 3｜[F024](features/F024-access-history-query.md) 3｜[F039](features/F039-appendix-management.md) 3｜[F021](features/F021-rwd-responsive.md) 4｜[F019](features/F019-public-list-browsing.md)／[F041](features/F041-user-subtype-business-scope.md)／[F033](features/F033-permission-aware-retrieval.md) 各 1（純回歸鎖定）。
> 🔴 **本批推翻兩項既有明文定案**：① **`OQ-D9-08` 全面推翻 `OQ-FM-01`／`OQ-D18-01`** ⇒ **後台四條下載端點一律燒錄＋寫稽核、無例外角色**（2026-08-16 明確裁定不做之 #12／#13／#15 本輪全數採納）；② **`OQ-D9-19` 推翻 [F026](features/F026-role-field-matrix.md) 頂部定案** ⇒ **僅「OJT 簽到表」一欄**對主管／部門窗口開放寫入。
> 🔴 **對既有 ✅ 功能之影響（本批為本專案首次「大規模反轉既有已驗收行為」）**：[F020](features/F020-watermark.md)／[F018](features/F018-usage-form-management.md)／[F026](features/F026-role-field-matrix.md)／[F039](features/F039-appendix-management.md) 之**既有 AC 有 5 條被就地推翻並反轉期望值**（`F020 AC-D3`／`AC-D4`／`AC-D7` ④、`F018 AC-D13`／`AC-D23`、`F039 AC-D3`），**原條文皆逐字保留供追溯**。⇒ 四者之狀態於實作完成前**維持 ✅**（既有測試仍為當前 main 之真實描述），但**實作時必有既有測試轉紅，此為預期、非回歸**。
> 🔴 **交 test-generator 之硬性 handoff**：`docs/specs/test-design/field-matrix-test-design.md` 之 **`TS-FM-001`／`TS-FM-002`「此服務完全不具備燒錄能力」基準線必須反向重寫**（該文件原標註之「不得反向重寫」**隨 `OQ-D9-08` 失效**）；**須就地改寫為新行為之背書、不得刪除**（比照 `AC-F17` 之既有處置慣例）。另 `OQ-D9-14` 之緩解要求「建環時先盤點受字級調整影響之既有斷言並回報」——**spec-writer 已預先盤點＝0 條**（唯一之字級斷言 `PublicViewerPage.test.tsx:58` 屬浮水印 inline `fontSize`、不在範圍）。
> **schema**：[data-model v1.7](data-model.md#usage-form-drafting-dept) 新增 **`USAGE_FORM_DRAFTING_DEPT`**（**本輪唯一需 migration 者** ⇒ ⚠ **寫完必須對真 SOP DB 實跑**）；`AUDIT_LOG` 兩項 additive 擴充（`actionType='ATTACHMENT_UPLOAD'` ＋ 後台下載開始寫入）**皆不需 migration**。[error-handling v1.9](error-handling.md#d9-delta)：**零新增錯誤碼**。
> ✅ **2026-08-20 同日第二輪：`OQ-D9-28`～`OQ-D9-33` 六題已全數裁決**，`[ASSUMPTION]` 全部解除。**AC 區間擴為 `AC-N1`～`AC-N70`（共 70 條）**：新增 `AC-N66`～`AC-N68`（[F020](features/F020-watermark.md#d9-watermark-delta)）與 `AC-N69`／`AC-N70`（[F024](features/F024-access-history-query.md#d9-audit-view-delta)）；就地修訂 `AC-N1`／`AC-N2`／`AC-N6`／`AC-N7`／`AC-N20`／`AC-N50`／`AC-N53`／`AC-N62` 共 8 條。
> 🔴 **兩題由使用者親自推翻 spec-writer 原案**：① **`OQ-D9-31`** ＝對比度門檻 **3:1 → ≥ 1.7:1**、定稿值 `#334155` @ **`0.30`**（實算 ≈ 1.716:1；原 `0.57` 逐字保留）；② **`OQ-D9-32`** ＝ `/pdf` 改燒錄（採納）**＋ 前台檢視器 DOM 疊加層移除**（推翻雙層保留）。
> 🔴 **`OQ-D9-32` 之範圍界線（實作最易做錯）**：移除**僅限 `PublicViewerPage`**；**`ChangeHistoryPage`／`LifecycleTreePreviewPage` 必須保留疊加層並照樣加深**（`AC-N66` 正向／`AC-N7` 負向雙向斷言）——該兩頁渲染 HTML、無內容層可燒錄，疊加層是其唯一浮水印載體。
> 🔴 **第二輪新增之「失去載體」清單（test-generator 必讀，須就地改寫為新行為之背書、不得刪除）**：① [F020](features/F020-watermark.md) 既有 AC「檢視器載入 → 疊加浮水印顯示…」與「檢視器疊加／PDF 燒錄／稽核快照三者一致」**兩條已就地標失效並指定新載體**（`AC-N6` 之 `burnPdf` spy ＋ `AC-N67` 之格式字幕；三層式契約新載體＝`pdf-burner.ts` 之 `toDisplayLines`，`AC-N68`）；② `frontend/src/pages/PublicViewerPage.test.tsx:58`（`fontSize === '14px'`）**必然轉紅**——⚠ **此更正推翻了第一輪「字級 delta 衝擊 0 條」之盤點結論：D9 整批之實際衝擊為 1 條，成因是 `OQ-D9-32` 而非字級 delta**（[F021](features/F021-rwd-responsive.md#d9-typography-delta) 已就地更正）。
> ✅ **`OQ-D9-29` 精確化之連帶**：`AUDIT_LOG` 新增**第 8 個 `targetType`「`DOCUMENT_ATTACHMENT`」**（additive、**仍不需 migration**），F024 新增**第四種類型篩選值「上傳」**（`AC-N69` 同時斷言「選『文件』看不到」與「選『上傳』看得到」——**排除與篩出是兩件事，必須各自斷言**）。
> ✅ **2026-08-20 第三輪（ui-ux-designer 完成 prototype 傳播、`823b5ac`）**：**`OQ-D9-35` 定案**（`AC-N69` 之「恰為四個」自相矛盾 → 改為「類型值恰為四種；共 5 個 `option`」）；🔴 **overview §A.6.7 之 12 項「prototype 已有載體、卻無 AC」轉為 `AC-N71`～`AC-N82`**；**列內動作「編輯編號」→「編輯」**（lead 文案裁決）；**追認 designer 三項超範圍改動**（`15`／`17`／`00`）。**`AC-N` 區間擴為 `AC-N1`～`AC-N82`（82 條）。**
> 🔴 **第三輪之兩個「假綠」攔截（test-generator 必讀）**：① **`offsetParent === null` 不得作為 vitest 斷言**——jsdom 不做版面計算，該值對所有元素恆為 `null`，斷言**恆真而無鑑別力**；`15` 之 `.ojt-write` 隔離改以 **class 指派互斥 ＋ `data-*` 掛鉤**斷言（`AC-N25` 第三輪擴充／`AC-N76`）。② **`19b` 之 `[data-prototype-demo]`／`#demoForm` 記錄切換器不得移植進實作**（`AC-N79` ③ 之負向斷言）——否則使用者可在編輯頁任意切換到別人的表單。
> **⚠ 待 lead 覆核（不阻塞）**：新增 `OQ-D9-34`——`OQ-D9-29` 未指定達成手段，spec-writer 裁量選定「新增 `targetType` ＋ 第四種類型值」，替代手段與否決理由已登錄。

> **2026-08-11 F041 一般使用者子分類實作落地（Uncle-Bob 約束環模式，⬜→🟡）**：環由 `test-generator` 於實作前獨立撰寫、`tdd-implementation` 僅寫 production code。**四道機器閘門全綠（由 lead 親自實跑、非採信回報）**：backend `tsc --noEmit` exit 0、backend jest **117 suites／1505 tests**（基線 1440 ＋新增 65）、frontend `tsc --noEmit` exit 0、frontend vitest **56 files／722 tests**（基線 664 ＋新增 58）。**migration 已對真 SOP DB 實跑**：`migration:show` 顯示 `[X] 29 AccountUserSubtype1723766400000`；探針證據＝既有 **1119 列 backfill 為 `'other'`**、不帶欄位之 INSERT 落 `'other'`（DEFAULT 生效）、`'Business'`（大寫）被 `CHECK` 約束拒絕（INV-1 於 DB 層成立）。**契約遵循**：173 個測試檔於實作期間 **zero byte 變動**、無 `.skip`／`.only`；1 件測試爭議循 author↔runner 通道由 test-generator 裁決並自行修正（純新增 15 行，未弱化 `toEqual`）。tally 由 ✅27 🟡8 🔵0 ⬜6（41）改為 **✅27 🟡9 🔵0 ⬜5（41）**。
> **⚠ 標 🟡 而非 ✅ 之理由（DoD 第 ② 條「端到端可達」未滿足）**：**尚未部署**——`icsop-backend`（部署前名為 `icsop-management-platform-backend-1`）仍跑舊 dist，需重建 image 後 F041 才在瀏覽器生效（欄位為 additive ＋ 有 `DEFAULT 'other'`，舊碼不會炸，但**功能尚未生效**）。且本輪依使用者指示採**簡易版 ring**（僅 jest／vitest，**跳過 Playwright e2e／Stryker mutation／dependency-cruiser**），亦**未做瀏覽器煙霧測試**——依本 repo 反覆踩過的教訓（2026-07-25 Chrome MCP 煙霧測試曾揪出 3 個「只有真瀏覽器會踩」的部署／代理層 bug，單元全綠完全測不到），此缺口必須明講。另 AC-39（[F033](features/F033-permission-aware-retrieval.md) RAG）為 Phase 3 ripple、規格明文本輪不驗收。比照 [F040](features/F040-lifecycle-subcategory.md) 同樣情形標 🟡 之先例。
> **🔴 2026-08-17 使用者回報 6 項缺失，全數修復（branch `fix/frontstage-filters-and-download-ux`，未併 main）**：① 前台清單「當責室長」下拉顯示**員編**、② 「循環別」下拉顯示 **lifecycle UUID**（兩者皆為**與既有權威漂移**——`prototypes/03-public-list.html:319` 之選項本就是姓名、F019 `AC-S2` 補註明文「`lifecycleDisplayName` 之組字由後端提供」；成因為 `filterOptions()` 只解析三組組織欄位，根因早記於 `risks-and-gaps` `G-L3-03`「人員姓名解析接縫未指定」，該缺口如期兌現為線上缺失 → 新增 F019 `AC-D5` label 解析義務、`G-L3-03` 關閉）；③ 前台詳情移除「當責室長-次要」欄（新增 F019 `AC-D15`，對外 DTO 一併收斂）；④ 樹狀圖預覽返回鈕硬寫 `/admin/lifecycles`，自文件清單進入者被丟到循環管理頁（→ F036 `AC-D3a`～`AC-D3d`）；⑤⑥ 後台下載 PDF 出現 Chrome **「偵測到危險網站」**紅底攔截頁（`window.open(sasUrl)` 是對 `*.blob.core.windows.net` 的 top-level 導覽）。
> **④ 經兩輪裁決**：第一版僅「返回鈕依 `?from=` 導覽」，由使用者當場指出仍然不對——預覽頁是 `window.open` 開出的**獨立分頁**，在其中導覽回清單會留下**與來源一模一樣的第二個清單分頁**，且每看一次樹狀圖就多一個（且比修正前更糟：原本的孤兒分頁至少顯示循環管理頁，一眼看得出是另一頁）。定案改為**具名分頁重用**（連開 N 個循環，分頁數恆為 2）＋**離開＝關閉本分頁**（露出原本那個仍保有 13 項篩選的清單分頁；後台清單之篩選／排序／頁碼皆為 component state，導覽離開即全部重置）。`?from=` 退居 fallback（直連進入／關閉被拒）。<br>🔴 **真實 Chrome 實測驗證了兩個 jsdom 測不到的機制**：① 帶 `noopener`／`noreferrer` 會使**具名 target 完全失效**（連開三次得到三個獨立分頁——正是使用者回報的症狀），因 HTML 規格於 noopener 為真時把 target 當 `_blank`；② `window.close()` 即使在 `history.length=4`（切換過多次循環）仍可成功關閉。另實作期揪出 `window.opener` 在 jsdom 為 `undefined` 而非 `null`，`!== null` 恆真會讓所有「直連」案跑進 popup 分支（已改真值判定）。
> **⑤⑥ 之修法需人類裁決並已核可**：牴觸 F020 `AC-D3a`「後台維持既有 SAS 核發」，改為**後台四條端點一律代理串流**（attachments／usage-form 文件內／usage-form 池／appendix 池，無一例外——留任何一條就是留一個仍會跳攔截頁的入口）；`AC-D3a`／architecture-spec §5.2 已同步修訂為 v1.6b。🔒 **F020 `AC-D4` 之後台 RAW 硬邊界一格未動**（不燒錄、`burnPdf` spy 恆 0、不寫稽核），且測試改寫後**鎖得更緊**：原本驗「SAS URL 字串沒被動過」（只證明沒動 URL），現改驗「回傳位元組逐位元組等於 Blob 原件」。順帶關閉三項既有缺陷：SAS 直連使檔名退化為 `<uuid>.pdf`（blobPath 末段為 `randomUUID()`）、後台 toast「已寫入稽核 DOWNLOAD」**為假**（後台從不寫調閱稽核）、Content-Type 判定表三份逐字重複之私有實作併入 `storage/content-disposition`。
> **閘門**：backend `tsc` exit 0 ＋ jest **147 suites／1971 tests**、frontend `tsc` exit 0 ＋ vitest **82 files／1166 tests**、`npm run test:int` **vs 真 SOP ＋ 真實 Azure Blob**。int 層新增「參照存在但 blob 不存在 → 404」一案——該路徑**在改為代理串流前不可能存在**（核發 SAS 不需要 blob 存在，「參照指向空氣」一直照樣回 200）。⚠ **尚未部署、未做瀏覽器煙霧測試**；⑤⑥ 之攔截頁屬「只有真瀏覽器會踩」之類別，**單元與整合皆無法證明它消失**，須於 testicsop 實機點過下載才算驗收。
> ⚠ **既有 6 筆 int 紅燈與本輪無關**（已於 `main` 對照確認同樣紅）：`public-documents.itest.ts` 5 筆為 2026-08-16 delta 遺留（該 commit 未觸及 `backend/test/int/`，仍斷言已移除之 `usingDeptIds`／`usingDeptNames` 與 `deptCode` 篩選）、`access-history.itest.ts` `TS-AQ-INT-012` 1 筆為合成 `orgCode` 現會解析出 `和潤本部` 而非 `null`（`Z9*` 於 `ORG_UNIT` 確認無殘留，指向 2026-08-15 org-path 收斂之行為變更）。兩者皆需各自 delta 的擁有者裁決，本輪不代為改寫。
> **🔴 2026-08-18 使用者回報體驗缺失（後台文件清單第 12 欄「連結點程序書」把整列上下拉伸），已修**：原實作為 `flex-wrap` ＋每連結一顆 pill，欄寬僅容一顆（等寬字編號約 110px）⇒ **一個連結換一行**，多連結之列被拉伸成 5～6 行高、清單無法掃視。實測應用 DB 591 筆之分佈：0 個 586 筆／1 個 2 筆／2 個 1 筆／5 個 1 筆／6 個 1 筆（長尾，正式匯入後只會更長）。
> **兩項使用者提案之裁決**：① 「以 hover 顯示書名取代編號」**不採**——中文書名長度不定會再度拉伸，且編號才是對照／篩選之鍵值（且現況本就是「編號可見、書名在 `title`」）；② 「多本以 `…` 表示」**採**，但**不得**是純 `…`＋hover：這些 pill **是動作**（點擊＝下載該連結點程序書之 PDF），純 tooltip 會使被摺疊者無法點擊、鍵盤到不了、觸控看不到＝**功能消失**。定案＝第一顆 pill ＋ **可點的 `+{N−1}` 按鈕**，點擊**就地展開**列出全部（`編號 · 書名 · 下載鈕`）；展開狀態逐列獨立、鍵為 `documentId`；`連結點程序書` 篩選命中者排第一顆（否則看不出這列為何被篩出）。視覺語彙沿用同表「當責室長」既有之 `+N` 徽章，未引入新元件。
> **不用浮層之理由**（實作前先確認）：表格外層為 `overflow-x-auto` ＋ `rounded-xl overflow-hidden`，popover／dropdown 會被裁切。
> **落地**：`prototypes/13-document-list.html`（權威，先改）→ [F017](features/F017-backend-document-list.md) §連結點程序書欄摺疊 delta **`AC-E1`～`AC-E9`**（新前綴 `AC-E#`，與 `AC-S#`／`AC-D#` 不重號；`AC-D9` 之回歸鎖定同步縮減範圍為「第 12 欄以外之 13 欄」）→ `frontend/src/pages/DocumentListPage.tsx`（新增 module 級 `LinkCell`）→ 測試 `DocumentListPage.linkCell.test.tsx`（11 案）＋ 改寫既有 `TS-D-020`（原斷言「多連結→多個 pill」正是缺失本身）。
> **閘門**：frontend `tsc --noEmit` exit 0、frontend vitest **83 files／1179 tests 全綠**（含新增 11 案）。prototype 以**真實 Chrome 量測**驗收：收合態 15 列一律 **57px 等高**、展開列 169px 且**其他列不變**、焦點回到同一顆 toggle、以第 6 個連結篩選時它被排到唯一可見的第一顆。
> ⚠ **React 頁尚未做真瀏覽器煙霧測試**（需登入態；jsdom 不做版面計算，量不到列高，故 `AC-E1` 於單元層以其**成因**斷言：不得 `flex-wrap`、須 `whitespace-nowrap`、N ≥ 2 只渲染一顆 pill）。亦**尚未部署**至 testicsop。

> **🔴 2026-08-11 後續：上述「簡易 ring 無 fidelity」之風險已實際兌現。** 使用者於實際環境發現帳號清單「角色」欄未渲染子分類徽章——**本輪第一個逃出約束環的真實缺陷**。
> 根因為 **AC 未覆蓋 prototype 檔頭已明列之項目**（環只依 AC 建，AC 沒寫到就不存在）＋ **無 fidelity 測試**（唯一不依賴 AC 完整性的防線缺席）。
> spec 層已補 [F041 §F2 AC-41～AC-46](features/F041-user-subtype-business-scope.md#f2-fidelity-gap) 並同步 4 條 delta；同類掃描另揪出 4 處同類缺口（含權限矩陣頁註記橫幅完全未實作）。完整教訓與可推廣結論見 [§F041 升 ✅ 待辦](#f041-to-done) 之「已知教訓」節。實作細節見 [implementation-log/F041-impl.md](implementation-log/F041-impl.md)；升 ✅ 之可執行清單見 [§F041 升 ✅ 待辦](#f041-to-done)。
> **🟢 2026-08-11 新增 F041 一般使用者子分類——業務／其他（E08 US-072 主＋E06 US-057 從），規格已通過人類閘門（12 項全數裁決）**：規格層完成（[F041](features/F041-user-subtype-business-scope.md) **AC-01～AC-40** ＋ data-model v1.5 `ACCOUNT.userSubtype` ＋ error-handling v1.3 `#dept-restriction`〔**不新增錯誤碼**，已收斂為 404 單案〕＋ F019／F020／F025／F026／F003 之 **23 條** `AC-U#` delta〔7/5/3/3/5〕＋ F033 釐清段 ＋ `prototypes/03-public-list.html` 三 persona 與 `#scopeNotice`）。**12 項中 11 項照草案；唯一實質新增＝AC-40／F019 `AC-U7`**（前台清單頂部範圍說明句於業務視角換專屬文案，孤兒帳號沿用同一句）。tally 由 ✅27 🟡8 🔵0 ⬜5（40）改為 **✅27 🟡8 🔵0 ⬜6（41）**。
> ⚠ **本需求為本專案首個「限縮既有可見範圍」之變更**（既往皆為 additive）。既有 ✅ 之 F019／F020／F025／F026／F003 之**既有 AC 全數未動**，其狀態**維持 ✅**；`AC-U#` delta 之實況待實作後於各列更新。
> **兩項最具後果之裁決**：① `OQ-E08-10` → **不記錄拒絕稽核** ⇒ 本需求**完全不觸及稽核子系統**（`AUDIT_LOG` 不動、F023／F024 不需 delta、nfr 不需覆核）；② `OQ-E06-03` → **拒絕回 404 `DOCUMENT_NOT_FOUND`**（非 403）⇒ **本系統首度出現「刻意隱藏資源存在性」之例外**，已明確接受其與「越權一律 403」全域慣例之不一致，且**不自動推廣**至其他越權場景。
> ⚠ **AC-33 與 AC-40 是兩件不同的字串，實作與建環時不得混為一談**：AC-33＝查無結果之**空狀態**文案 `查無符合結果`（逐字、**不分支**）；AC-40＝清單頂部之**範圍說明句**（`#scopeNotice`，**依 viewer 分支**）。業務使用者查無結果時兩者同時出現。

> **2026-08-08 F040 循環子分類實作落地（Uncle-Bob 約束環模式，⬜→🟡）**：環由 `test-generator` 於實作前獨立撰寫、`tdd-implementation` 僅寫 production code（**零測試碼**，4 次爭議全以申訴由環作者裁決）。**四道機器閘門全綠**：backend jest **116 suites／1440 tests**（基線 1365 ＋新增 75）、backend build exit 0、frontend vitest **48 files／664 tests**（基線 576 ＋新增 88）、frontend typecheck exit 0。**migration 已對真 SOP DB 實跑**：`LifecycleSubcategory1723680000000` 單一交易 COMMIT 成功，前置盤點同名重複列 **0 筆**（不需人工裁定）；真庫覆核 `subcategory` 欄、`IX_LIFECYCLE_name_subcategory`、`FK_ICSOP_DOCUMENT_lifecycle` 皆存在（**G-F040-01 結案**）。**唯一索引語意實測**（交易內實插後 ROLLBACK）：`(N,NULL)` 第二筆被拒（證實 MSSQL 視多 NULL 相等＝INV-1 於 DB 層成立）、`(N,消金)`／`(N,企金)` 皆成功、`(N,消金)` 重複被拒、ROLLBACK 後殘留 0 筆。tally 由 ✅27 🟡7 🔵0 ⬜6 改為 **✅27 🟡8 🔵0 ⬜5（40）**。
> **⚠ 標 🟡 而非 ✅ 之理由（DoD 第 ① 條未滿足）**：本輪依使用者指示採**簡易版 ring**（僅 jest/vitest，跳過 Playwright fidelity／Stryker mutation／dependency-cruiser），故 **6 條 AC-S delta 未被任何測試覆蓋**：F008-S1、F009-S1、F019-S1／S2、F036-S1／S3、F038-S1。⚠ 進一步查核發現，這 6 條**並非全部「已實作但未驗證」**——其中 **4 條實際尚未實作**（見下方各列註記與 F040 列）。顯示規則本身（`lifecycleDisplayName`）已由純函式測試釘死，缺的是「該頁確實呼叫它」之機器證明。另見 [risks-and-gaps.md](../test-specs/risks-and-gaps.md) **G-F040-15**（頁 13 之 AC-31 斷言不具完全辨識性：INV-1 使 displayName 於池內單射，displayName-keying 與 id-keying 行為恆等，已列為補 Stryker 時之優先標的）。
>
> **2026-08-07 新增 F040 循環子分類（E03，橫切）** 🟢 **APPROVED（2026-08-07 人類閘門通過）**：規格層完成（[F040](features/F040-lifecycle-subcategory.md) AC-01～AC-36 ＋ data-model v1.4 `LIFECYCLE.subcategory`＋INV-1/2/3＋MSSQL 唯一索引實作前置檢查 ＋ error-handling v1.2 三錯誤碼 ＋ F007/F010/F011/F017/F019/F008/F009/F036/F038 之 28 條 AC delta），**規格已於 2026-08-07 通過人類閘門（含 4 項裁決：不新增 `lifecycleName` payload 欄位／OQ-E03-10 定案／示範子分類統一為 消金·企金·子公司／F010 AC-S4 兩段式補字），可進入實作**。⚠ 本需求為 **additive 欄位**，既有 9 個 ✅ 功能（F007–F011、F017、F019、F036、F038）之狀態**維持 ✅**（其既有 AC 全數未動）；各檔子分類 delta 之實況已於 2026-08-08 逐列更新。

> **2026-08-06 新增 F039 附錄管理（E10）**：規格層完成（stories → [F039](features/F039-appendix-management.md) AC-01～AC-34 ＋ data-model `APPENDIX_POOL`/`DOC_APPENDIX` ＋ error-handling 4 錯誤碼 ＋ F025「附錄管理」功能列／F026「附錄（多）」欄位列），**實作為 ⬜ 未開始**。tally 由 ✅27 🟡7 🔵0 ⬜4（38）改為 **✅27 🟡7 🔵0 ⬜5（39）**。⬜ 現含 Phase 3 RAG F032–F035 ＋ Phase 1 之 F039。

> **2026-07-24 可建功能三線平行 worktree（lifecycle-changelog／orgsync-alerts／hardening）併回 main、int-verified**（test-spec 先＋審核閘門定案 2 決策＋瀏覽器煙霧測試先行）：先以真 SOP 啟動全系統＋瀏覽器實走（登入→建立→編輯→狀態切換含原因→前台檢視→組織異動→調閱歷程，零 JS 錯誤、RBAC 徽章正確、F024 分頁/上色修正實見效），再開三線。① **lifecycle-changelog（F038）** — `LIFECYCLE_SNAPSHOT` 交易一致快照（§5.9 原子，人類定案；F008/F009 DAG 結構寫入＋事件＋快照同交易、以選填 `runStructuralChange` capability 使既有 fake 零改動、rollback 單測把關）＋完整新舊重建＋diff＋雙頁 PDF 燒錄＋前端新舊並列 modal（proto 23，取代舊「複用 F036 單頁」）；② **orgsync-alerts（F005）** — 兩類警示沿用 `ORG_CHANGE_ALERT`（人類定案 OQ-E02-08b，dedup 以 loginId 不以 EMPNO、資料不一致不停用）＋修二值 alertKind 缺陷；③ **hardening** — F001 帳密登入節流（`AUTH_TOO_MANY_ATTEMPTS` 429，自動過期非鎖定）＋F020 燒錄計時 int（warm≈249ms≪3s）＋確認 login 預填為瀏覽器 autofill 非缺陷。**審核閘門 2 決策**：F038 原子/F037 記為 §5.9 例外、F005 沿用 ORG_CHANGE_ALERT。**合流**：§5.9 補 F037 best-effort 例外、錯誤碼 AUTH_TOO_MANY_ATTEMPTS/LIFECYCLE_CHANGE_LOG_NOT_FOUND 集中補入；int 揪出 F038 itest 未插 Supervisor 帳號（401 vs 403）已修。**→ F001 F005 F020 F038 🟡→✅（4 升）**。backend **1243 單元＋88 int（15 suites vs SOP）**、frontend **410**、tsc 淨、22 migration 落 SOP。**tally ✅27 🟡7 🔵0 ⬜4**。🟡 僅剩 F021/F022（RWD/彈窗＝瀏覽器人工）＋F027-F031（RAG 管線 backend）；非 RAG、非瀏覽器人工功能全數 ✅。

> **2026-07-24 獨立 🟡 收尾三線平行 worktree（doc-changelog／audit-query／field-matrix）併回 main、int-verified**（test-spec 先＋審核閘門定案 3 決策）：① doc-changelog — F010 建立事件（`changeType='CREATE'`＋actor 貫穿）、F012 切換原因 reason（migration 落 SOP）折入 `update()` 共用 `applyStatusTransition`（切回有效一律重驗 F013、與 setStatus 不分歧）、F037 交易邊界＝best-effort（**人類定案**）、AC36 reason 顯示（補 proto 23 缺口）、targetName 填充；② audit-query — F024 查詢下推 SQL（`queryPage` 取代全表載入 JS 過濾之潛在 OOM）＋`IX_AUDIT_LOG_targetType_occurredAt`（落 SOP）＋前端分頁/pill/chevron 修；③ field-matrix — F026 AC5-9 覆蓋＋**後台下載 RAW 不燒錄（人類定案 OQ-FM-01）**、修正 AC6 誤述。**審核閘門 3 決策**：F037 邊界=best-effort、F012 折入 update()、後台下載維持 RAW。**合流**：Icon 守門測試持續把關、targetName 跨線耦合（doc-changelog 寫、audit-query 讀 int 驗）如期解。**→ F010 F012 F024 F026 F037 🟡→✅（5 升）**。backend **1131 單元＋68 int（12 suites vs SOP）**、frontend **390**、tsc 淨、20 migration 落 SOP。**tally ✅23 🟡11 🔵0 ⬜4**。非 RAG 🟡 僅剩 F001（登出即撤/節流，需 infra）、F005（資料不一致告警）、F020（PDF<3s 計時）、F021/F022（RWD/彈窗＝瀏覽器人工）、F038（快照架構 OQ-E07-05）。

> **2026-07-24 縫隙收斂三線平行 worktree（doc-seams／public-seams／f006-alerts）併回 main**（皆嚴格遵 prototype，test-spec 先）：**doc-seams** 附件列表端點＋編輯側多值持久化（delete-then-insert replace-set 單一交易）＋清單「檔案/連結」兩欄後端富化（批次注入不 N+1）＋harness FK 清理補洞；**public-seams** F019 真讀 `DOC_USING_DEPT`＋**置頂語義定案改子樹祖先鏈**（`isWithinSubtree` 共用；推翻 OQ-F019-03 精確比對，改寫既有綠測）＋F018 自訂表單名（`USAGE_FORM_NAME_TOO_LONG`）＋prototype 03 標籤修復；**f006-alerts** 最後一個非 RAG 功能——`ORG_CHANGE_ALERT`＋三訊號提示產生＋§7.3 掛已關閉部門＋dedup＋Route A/B＋KPI＋prototype 09 三頁籤（2 migration 落 SOP、DDL 對真庫驗證）。**合流集中修正**：F026 兩線各推進一半（編輯路徑 enforcement＋子樹判定）合併、documents.module composite publisher fan-out 手動調和、Icon 守門測試揪 10 枚靜默失效圖示、**編輯 diff 改正規化字面比對杜絕多值幽靈變更**（F037 幽靈日誌／F006 誤自動解除）。**→ F006 ⬜→✅；F011 F014 F016 F017 F018 F019 🟡→✅（6 升）；F020/F026 縮小缺口留 🟡**。backend **1080 單元＋47 int（11 suites vs SOP＋真 Blob）**、frontend **374**、tsc 全淨。19 migration 落 SOP。**僅剩 ⬜4：F032-F035（Phase 3 RAG Q&A，待 pgvector/embedding/LLM）**——非 RAG 功能全數 ✅ 或 🟡（無 ⬜）。
>
> **2026-07-23 前端三線平行 worktree（doc-frontend／usageform／changehistory）併回 main**（皆嚴格遵 prototype）：**doc-frontend** E04 UI 完成——F011 編輯頁＋新舊值 diff（proto 15）、F017 清單 14 欄/9 篩選/分頁/名稱解析（proto 13）、F015 連結 UI、F010/F016 STEP4 附件上傳（proto 14）、F016 唯讀頁（proto 16）；**usageform** F018 管理頁（proto 19）＋**F036/F020 CJK 燒錄字型**（Noto Sans TC/OFL＋fontkit，真中文可燒）；**changehistory** F037 程序書變更歷程（DOCUMENT_CHANGE_LOG 綁真 publisher 持久化 diff＋頁 proto 23）＋F038 樹狀圖變更歷程（部分，快照重建待架構定案 OQ-E07-05）。**→ F015、F036 升 ✅；F037/F038 ⬜→🟡**；F011/F016/F017/F018 前端完成（仍有 edit 多值/附件清單端點/清單2欄資料/自訂表單名 等後端小缺留 🟡）。**🔴 整合又揪 bug**：usage-form int FK 違反（測試建文件用假 lifecycleId）→ 補建 marker 循環。backend **909 單元＋18 int（8 suites）**、frontend **218**、tsc 全淨。**僅剩 ⬜5**：F006（組織異動提示）＋F032-F035（Phase 3 RAG Q&A，待 pgvector/embedding/LLM）。

> **2026-07-22 Wave 1 平行 worktree**（3 分支併回 main、unit-green）：F023/F024（audit）、F016/F018/F027（storage）⬜→🟡；F001 途徑B＋F003 閉環推進。backend 500／frontend 119。
> **2026-07-22 Wave 2 平行 worktree**（org-foundation ＋ doc-edit/public/rag，4 分支併回 main、unit-green）：**org-foundation**（ACCOUNT 即在職員工目錄→名稱解析、ORG 讀取端點、DESC_FULL、session 擴充；權威來源 [upstream-person-org-source.md]，參考 portalapp-sp）解鎖名稱/身分。**10 功能 ⬜→🟡**：F011 F015（doc-edit）、F019 F020 F021 F022（public）、F028 F029 F030 F031（rag）；F012/F013/F017 補強。backend **816** 測、frontend **143** 測、tsc 全淨。
>
> **2026-07-22 整合階段 ②（真 SOP 自動化整合測試 `npm run test:int`）**：載具啟動完整 AppModule 接真 SOP、鑄 session、marker 清理。**5 場景綠**——**F003 死鏈閉合經真往返驗證**（建立手動帳號→`POST /auth/login`→`/auth/me`）＋錯誤密碼 401；F010 建立→F011 `GET/PATCH /:id` 編輯→F017 清單→**F013 重複編號 409（真 filtered unique index）**；F024 查詢 200。**→ F003、F013 升 ✅**（其餘 F001途徑B/F010/F011/F017/F024 後端流程 int-verified，但仍有 logout/STEP3-4/前端/匯出 等缺口留 🟡）。**🔴 整合實測發現**：F023 `AUDIT_LOG` best-effort `REVOKE` 對 role 授權之 app 登入**無效** → **目前非 append-only 強制**（UPDATE 可成功），需改 `DENY UPDATE,DELETE`／觸發器；已以 `it.failing` 記錄。
>
> **2026-07-23 地基三線平行 worktree（F014 org／storage Blob／lifecycle-e03）併回 main、int-verified**：**F023 append-only 改觸發器強制**（DENY 被 owner 繞過 → INSTEAD OF UPDATE,DELETE，int-verified）；**F014 制定組織/當責室長 create-side**（DOC_SECONDARY_CHIEF/DOC_USING_DEPT 表＋STEP3 表單，migration 落 SOP，int-verified）；**真 AzureBlobStore**（SAS＋multipart，真 dev Blob roundtrip int-verified）＋usage-forms→真 AuditWriter；**F036 樹狀圖預覽＋浮水印＋稽核**＋**F007 收尾**（導向畫布/刪除稽核）。**🔴 整合又揪一 bug**：`AUDIT_LOG.accountId` 為 uniqueidentifier 但 session 只帶 loginId → **所有稽核寫入 Invalid GUID 失敗**（unit 假 store 測不到）；修法 ACCOUNT.id 貫穿 session（→SessionUser.accountId）。**→ F007、F023 升 ✅；F014 🔵→🟡（create-side done）；F036 ⬜→🟡**。backend **864** 單元＋**test:int 6 suites/13 綠**、frontend 171、tsc 全淨。
>
> **2026-07-22 整合階段 ①（app-DB 落地＋啟動驗證）**：**12 個 migration 全數對真 SOP app DB 執行成功**（含 AUDIT_LOG/附件/DOC_SOURCE_XLS/USAGE_FORM/DOCUMENT_LINK/ORG_DESCFULL/INDEX_RUN/DOCUMENT_CHUNK＋F013 篩選唯一索引）。**整個 Wave 1+2 合併系統成功對 SOP 啟動**（`Nest application successfully started`；所有路由掛載；**real TypeORM stores** 皆接真庫：audit/documents+links/attachments(meta)/usage-forms/xls-source(meta)/org-directory/public）；HTTP smoke：守門 401、OIDC 登入 302（含 PKCE）。**仍為 fake**：ingestion/rag（FakeChunk/IndexRun/VectorStore，待 pgvector＋embedding 選型 OQ-E09-02）、Blob（FakeBlobStore，待 Azure 憑證）。**升 ✅ 尚缺**：各 feature AC 之逐流程 e2e（真人 UI 登入或自動化整合測試）——本階段已證「系統可對真庫啟動且路由/守門/DB store 皆接真」，個別流程驗證為下一步。

**P0-MVP 尚未完成者（優先盯）**：F001 F003 F005 F007 F010 F012 F013 F016 F017 F019 F020 F023 F024 F026 F027 F028 F029 F030 F036，以及 Phase 3 之 F032 F033 F034 F035，**與 F041（規格 🟢 APPROVED、實作 🟡 unit-green＋migration 已落真庫，**待重建 image 部署＋瀏覽器實測**，見 [§F041 升 ✅ 待辦](#f041-to-done)）**。

---

## 逐功能狀態

### E01 驗證與帳號
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F001 | 雙軌驗證登入與 Session | P0 | 1 | ✅ 已完成-已驗證 | 途徑 A（OIDC）端到端＋途徑 B 帳密登入 int-verified vs SOP（`POST /auth/login` by loginId、統一 `AUTH_INVALID_CREDENTIALS`、build→login→`/auth/me` 真往返，瀏覽器實測登入成功）；**帳密登入節流已補**（`LoginThrottleService` 60s 視窗、同帳號 5／同 IP 20 → 429 `AUTH_TOO_MANY_ATTEMPTS`，自動過期非持久鎖定、不洩漏帳號存在性）。殘留：登出非「即時撤銷」（無狀態 JWT，需 denylist infra，OQ 待資安政策）＋部署需設 `trust proxy`（IP 軸） |
| F002 | 登入後角色分流導向 | P0 | 1 | ✅ 已完成-已驗證 | 邊界：session 有效但 roleCode=undefined 不會導回登入頁（低風險） |
| F003 | 帳號與角色指派管理 | P0 | 1 | ✅ 已完成-已驗證 | 死鏈閉合＋**int-verified vs SOP**（建立手動帳號→`POST /auth/login`→`/auth/me` 真往返過；錯誤密碼 401）；CRUD/角色指派 unit-covered＋AccountManagementPage |

### E02 組織同步
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F004 | 組織資料同步（排程＋手動） | P0 | 1 | ✅ 已完成-已驗證 | OQ-E02-02 失敗重試＋通知刻意延後（cron 僅 try/catch 記 log）；公司主檔 VW_HRCOMF 未同步。**2026-08-12 擴充**：新增第 4 來源 `VW_PERSONAL_JOB` → `JOB_TITLE` 對照主檔＋白名單 11→12 欄（`JOBTITLEID`），供帳號清單「職位」欄（migration `1723852800000` 落 SOP）；對照攝入為**非阻斷**（取回失敗僅記警告，不使帳號同步失敗）＋同鍵去重（防 UQ 違反拖垮整筆交易）；新增 `fullResync` 旗標（`SYNC_FULL_RESYNC=1 npm run sync:once`）——**加欄後回填不會自然發生**（帳號為增量同步，既有列不被取回；此為 `descFull` 可自然回填之反例）。**已實跑落地**：全量 2,772 筆 → 更新 1,113，職稱覆蓋 **1,115/1,115（100%）**，二次執行 0 異動（冪等） |
| F005 | 離職者自動停用帳號 | P0 | 1 | ✅ 已完成-已驗證 | 停用→即時撤銷＋消失比例中止保護；**兩類警示沿用 `ORG_CHANGE_ALERT`（人類定案 OQ-E02-08b）**：`DATA_INCONSISTENCY`（EMPSTS='A' 但 RESIGNDT 過去日，**不自動停用**）＋`ACCOUNT_DISAPPEARED`（單帳號消失低於閾值）；純函式偵測＋產生器接線＋dedup 以 loginId（migration `accountLoginId` 落 SOP）；修二值 alertKind 缺陷（writeAudit／AlertCard），int-verified |
| F006 | 組織異動影響提示與異動後台 | P1 | 1/2 | ✅ 已完成-已驗證 | `ORG_CHANGE_ALERT` 單表＋alertKind 判別（2 migration 落 SOP）；提示產生三訊號＋§7.3 掛已關閉部門＋dedup（服務層＋filtered unique index，**int-verified**：重複 key→UQ 違反、resolved 後同 key 可再插）；Route A 自動解除／Route B 手動；`monthly-summary` KPI；prototype 09 三頁籤重建＋導向 F014 編輯；不覆寫文件/不停用帳號（有 AC）。殘：CLOSED_DEPT_PERSON 卡無 prototype 變體（沿用同殼渲染）、KPI 計數 vs 徽章 OQ-F006-04 待產品確認、上游無**職級**欄以 managerEmpNo 換手為替身（OQ-E02-07 待上游；⚠ 該 OQ 已於 2026-08-12 拆分——**職稱**部分＝`OQ-E02-07b` 上游本就具備、已實作，本項僅餘職級） |

### E03 循環與 DAG
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F007 | 循環池 CRUD | P0 | 1 | ✅ 已完成-已驗證 | 核心 CRUD＋刪除保護；**建立後導向 DAG 畫布**＋**刪除記錄稽核**（AuditWriter LIFECYCLE_DELETE）已補；建立/刪除 int-verified vs SOP<br>**F040 子分類 delta AC-S1～AC-S8：已實作、已機器驗證**（服務層唯一性 INV-1/INV-2 含停用列＋清單顯示/搜尋比對顯示名稱＋modal 子分類欄與兩錯誤提示；`lifecycle-subcategory.service.spec.ts`／`LifecycleListPage.subcategory.test.tsx`） |
| F008 | DAG 節點與連線維護（含防環） | P0 | 1 | ✅ 已完成-已驗證 | 交易內成環再驗＝權威；僅服務層假 store 測、無整合測（碼正確）<br>**F040 子分類 delta：AC-S1 尚未實作**（DAG 畫布頁首標題/麵包屑仍以 `DagCanvasPage.tsx:127` 之 `?.name` 取值，未經 `lifecycleDisplayName`）；**AC-S2 之 `LIFECYCLE_CHANGE_LOG.lifecycleName` 快照欄於現行 schema 不存在**（該表無此欄），顯示規則已由純函式測試釘死但持久化欄位待裁決。兩者皆無測試覆蓋，見 [F040](features/F040-lifecycle-subcategory.md) |
| F009 | 節點抽屜維護與文件過濾警示 | P0 | 1 | ✅ 已完成-已驗證 | 邊界：雙管理員同時掛載無樂觀鎖（last-write-wins）；前端多筆存檔為非交易連續 API<br>**F040 子分類 delta AC-S1 尚未實作**（節點抽屜「僅顯示所屬循環＝…」過濾提示之 `cycleName` 由 `DagCanvasPage.tsx:127` 傳入，同上未經 `lifecycleDisplayName`；候選過濾鍵本就為 `lifecycleId`，該半已符合）。無測試覆蓋 |
| F036 | 循環樹狀圖預覽（唯讀＋浮水印） | P0 | 1 | ✅ 已完成-已驗證 | 唯讀檢視器（proto 22）＋伺服端浮水印（**CJK 字型已解**：Noto Sans TC＋fontkit）＋角色可見性＋循環切換＋下游高亮＋VIEW/DOWNLOAD/PRINT 稽核（LIFECYCLE_VIEW int-verified）。F017 詳情入口為跨線小接。**F040 子分類 delta（2026-08-08 實況，皆無測試覆蓋）**：**AC-S1 頁首標題＝已實作**（後端 `lifecycle-preview.service.ts` 之 `requireLifecycle` 回傳 `lifecycleDisplayName`，前端 `data.lifecycle.name` 直接沿用）、**AC-S1 頂部循環切換器選項＝尚未實作**（`LifecycleTreePreviewPage.tsx:191` 仍 `{c.name}`，來自 `getLifecycles()` 之裸名稱，同名不同子分類無法區分）；**AC-S2 稽核名稱快照＝已實作**（同上 `requireLifecycle`，`AUDIT_LOG.lifecycleName` 含子分類）；**AC-S3 第二入口＝已符合**（`DocumentListPage` 本就以 `window.open('/lifecycles/${d.lifecycleId}/tree')` 帶 `lifecycleId`，非循環代碼）。見 [F040](features/F040-lifecycle-subcategory.md) |
| F040 | **循環子分類（橫切）** | P0 | 1 | 🟡 部分 | **核心全數落地並經機器驗證**：`LIFECYCLE.subcategory`（`nvarchar(100) NULL`）＋`IX_LIFECYCLE_name_subcategory` **已對真 SOP DB 實跑**（`LifecycleSubcategory1723680000000`，前置盤點重複列 0 筆；唯一索引語意實測證實 MSSQL 視多 NULL 相等＝INV-1 於 DB 層成立）；前後端各一份 `normalizeSubcategory`／`lifecycleDisplayName`（後端另 `checkLifecycleUniqueness`、前端另 `resolveLifecycleSelection`／`lifecycleNameOptions`／`subcategoriesOf`／`lifecycleSelectOptions`）；三錯誤碼＋固定驗證順序①②③；INV-4 選取有效性（`assertLifecycleSelectable`，後端唯一觸發＝AC-25）；F007 modal 子分類欄＋兩錯誤提示、F010/F011 兩段式選取、F017 清單/篩選、F019 前台顯示/篩選皆已接。實作日誌見 [F040-impl.md](implementation-log/F040-impl.md)。<br>**缺口（為何非 ✅）**：DoD ① 未滿足——本輪採**簡易版 ring**（僅 jest/vitest，跳過 Playwright fidelity／Stryker／dep-cruiser），**6 條 AC-S delta 無測試覆蓋**（F008-S1、F009-S1、F019-S1/S2、F036-S1/S3、F038-S1）。其中 **4 條經查核為「尚未實作」**（非僅未驗證）：**F008-S1／F009-S1**（`DagCanvasPage.tsx:127` 仍以 `?.name` 取名並傳給 NodeDrawer 過濾提示）、**F036-S1 之切換器選項**（`LifecycleTreePreviewPage.tsx:191` 仍 `{c.name}`；同頁標題已走後端 displayName）、**F038-S1**（`ChangeHistoryPage.tsx:555/611` 仍 `?.name`）。另 **AC-34／F008-S2／F038-S2 之 `LIFECYCLE_CHANGE_LOG.lifecycleName` 快照欄於現行 schema 不存在**（該表無此欄；顯示規則已由純函式測試釘死），屬規格↔schema 落差，待 spec-writer／architect 裁決。另見 [risks-and-gaps.md](../test-specs/risks-and-gaps.md) G-F040-15 |

### E04 ICSOP 文件
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F010 | 建立 ICSOP 文件 | P0 | 1 | ✅ 已完成-已驗證 | STEP1–4 前端（proto 14）＋int-verified 建立；STEP3/4 多值/附件/連結入 `CreateDocumentInput`；**建立稽核（Main Flow 7）落地**：`changeType='CREATE'` 逐填寫欄一列（`buildCreateChangeDeltas`，oldValue=null）＋actor 貫穿，於 409/欄位權限閘門後才發，int-verified（`changehistory.itest`）。`.xls` 原件掛載屬 F027 面（RAG）<br>**F040 子分類 delta AC-S1～AC-S5：已實作、已機器驗證**（兩段式選取 `#f_cycleName`／`#subWrap`＋`#f_cycleSub`／`#subErr`，payload 恆僅 `lifecycleId`；後端 AC-25 唯一觸發＋AC-24 缺漏維持 `DOCUMENT_REQUIRED_FIELD_MISSING`） |
| F011 | 編輯 ICSOP 文件與版本對照 | P0 | 1 | ✅ 已完成-已驗證 | backend `GET`/`PATCH /:id`、編輯排除 nodeId、版本 diff（正規化字面比對，無多值幽靈變更）、覆蓋不留歷史、編輯側唯一性排除自身、`DocumentChangedEvent`；**前端編輯頁（proto 15，逐欄 目前值/新值 diff＋revert）＋編輯側多值持久化**，**int-verified vs SOP**<br>**F040 子分類 delta AC-S1～AC-S3：已實作、已機器驗證**（`#lc_name`／`#lc_subWrap`／`#lc_sub`；「目前值」對照側經 `lifecycleDisplayName`；未帶 `lifecycleId` 之三態語意不觸發本碼） |
| F012 | 文件狀態切換 | P0 | 1 | ✅ 已完成-已驗證 | 切換＋**切回有效一律重驗編號唯一性**（結果狀態=有效即驗，補原 update() 僅 patch 含 documentNumber 才驗之缺口）；**OQ-E04-02「切換原因」端到端持久化**（reason nvarchar(500)，migration 落 SOP）＋STATUS 變更事件＋操作者快照；狀態經共用 `applyStatusTransition` 折入 `update()`（與 setStatus 不分歧），int-verified |
| F013 | 文件編號唯一性管理 | P0 | 1 | ✅ 已完成-已驗證 | 建立唯一性經**真 filtered unique index int-verified vs SOP**（dup→409）；編輯側排除自身＋mssql 2601/2627→409 於 F011 路徑 unit-covered |
| F014 | 制定組織與當責室長設定 | P0 | 1 | ✅ 已完成-已驗證 | create-side＋**edit-side 皆 int-verified vs SOP**：三級下拉（`OrgDirectoryService`）＋當責室長主/次（`NameResolution`＋managerEmpNo 預設）＋使用部門；編輯側 `'key' in clean` 三態（未帶=不動／`[]`=清空／有值=取代）＋store delete-then-insert replace-set（單一交易），`DOC_SECONDARY_CHIEF`/`DOC_USING_DEPT` 真實列替換（`f014.itest`） |
| F015 | 文件連結點管理 | P1 | 1 | ✅ 已完成-已驗證 | `DOCUMENT_LINK` 全鏈＋批次入 PATCH＋`GET :id/links`＋目標存在性驗證＋**前端連結 UI（chips＋combobox，proto 14/15）**；backend int-verified |
| F016 | PDF 與 OJT 附件上傳 | P0 | 1 | ✅ 已完成-已驗證 | Blob 抽象＋**真 Azure Blob（SAS）**、`DOCUMENT_ATTACHMENT`、兩層授權、格式白名單≤50MB、單份覆蓋、受控下載；**`GET /admin/documents/:id/attachments` 列表端點（404 vs 200 [] 區辨）＋前端上傳 UI（proto 14 STEP4）＋編輯/唯讀頁既有附件顯示（proto 15/16）**；上傳→列表→下載往返 **int-verified vs SOP＋真 Blob**（`attachments.itest`） |
| F017 | 後台文件清單與搜尋 | P0 | 1 | ✅ 已完成-已驗證 | backend 多篩選/排序/**真分頁**（`{items,total,…}`）＋**室長/組織名稱解析**＋衍生狀態篩選；**「檔案」「連結點程序書」兩欄後端富化**（`ATTACHMENT_STORE`/`DOCUMENT_LINK_STORE` store-token 批次注入，恆 3 次查詢不 N+1、過 `chunkByParamBudget` 避 MSSQL 2100 上限）＋前端清單頁（proto 13，14 欄／9 combobox），**int-verified vs SOP**（`documents.itest`）<br>**F040 子分類 delta AC-S1／AC-S2：已實作、已機器驗證**（清單「循環別」欄 `[data-cycle-cell]` 由後端以 `lifecycleDisplayName` 組合；篩選選項值與篩選鍵改為 `lifecycleId`，同名不同子分類可分別篩選） |

### E05 使用表單
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F018 | 使用表單管理 | P1 | 1 | ✅ 已完成-已驗證 | `USAGE_FORM_POOL`＋`DOC_USAGE_FORM` 多對多、上傳/覆蓋（引用≥2 警示）/移除（`USAGE_FORM_IN_USE`）、**真 AuditWriter 下載稽核**、管理頁（proto 19）＋`/admin/usage-forms/overview`；**自訂表單名稱持久化**（`resolveUsageFormName`：trim→退回檔名→>400 拋 `USAGE_FORM_NAME_TOO_LONG`，僅單檔路徑），**int-verified vs SOP**（`usage-form-pool.itest`） |

### E06 前台瀏覽
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F019 | 前台清單瀏覽（排序/搜尋/篩選） | P0 | 1 | ✅ 已完成-已驗證 | `/public/documents`（強制已公告、關鍵字、AND 篩選、置頂、分頁）＋`PublicListPage`＋名稱解析；**TypeORM store 真讀 `DOC_USING_DEPT`**（分離查詢＋JS 分組不膨脹）；**置頂語義定案改子樹祖先鏈**（`isWithinSubtree`，與 F026 共用；OQ-F019-03 定案，推翻精確比對）；置頂/部門子樹篩選 **int-verified vs SOP**（`public-documents.itest`）<br>**F040 子分類 delta AC-S1／AC-S2：已實作、但未經機器驗證**（後端 `typeorm-public-documents.store.ts` 清單與詳情皆改由 `lifecycleDisplayName` 組合，前後台字串一致；前台篩選選項值本就為 `lifecycleId`、label 隨之含子分類）。本輪簡易版 ring 未含前台 e2e，故無測試覆蓋 |
| F020 | 文件浮水印（疊加＋燒錄） | P0 | 1 | ✅ 已完成-已驗證 | 快照組裝（公司全稱/DESC_FULL/最細單位/空欄收合）、`WatermarkService`＋VIEW/DOWNLOAD/PRINT＋`AuditWriter`、`pdf-lib` 燒錄＋**CJK 字型**（Noto Sans TC＋fontkit）、檢視器頁、`DOC_USING_DEPT` 讀取；**真 PDF 燒錄計時 int-verified**（`watermark-burn-timing.itest`：暖機後 warm≈249ms／cold≈131ms，遠低於 3s NFR；門檻 8s 回歸絆線）。正式代表量 P95 壓測仍後續 NFR 驗收 |
| F021 | RWD 響應式版面 | P1 | 1 | 🟡 部分 | unit-green：響應式標記＋resize 狀態保持。剩：斷點/觸控/無橫捲等幾何 AC＝`[integration]`/人工（jsdom 無法驗） |
| F022 | 後台開啟前台瀏覽頁 | P2 | 2 | 🟡 部分 | unit-green：AppShell 改 `window.open(_blank)`＋彈窗被擋 fallback、保留後台分頁、接真前台頁。剩：瀏覽器彈窗行為＝`[integration]` |

### E07 稽核與變更歷程
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F023 | 稽核軌跡記錄 | P0 | 1 | ✅ 已完成-已驗證 | `AuditWriter` 契約（5 targetType，下游 import）＋outbox 補償；**append-only 觸發器強制＋int-verified**（INSTEAD OF UPDATE/DELETE 阻擋，對 owner 亦生效）；**寫入路徑 int-verified**（usage-form DOWNLOAD／lifecycle VIEW 稽核落地）；usage-forms 已接真 AuditWriter；accountId 貫穿 session 修正（int 揪出） |
| F024 | 文件調閱歷程查詢後台 | P0 | 1 | ✅ 已完成-已驗證 | 查詢頁＋篩選/RBAC/30天預設/匯出/展開；**查詢下推 SQL**（`AuditStore.queryPage`：targetType IN＋occurredAt 半開區間＋LIKE ESCAPE＋ORDER＋OFFSET/FETCH＋COUNT，取代原全表載入 JS 過濾之潛在 OOM）＋**`IX_AUDIT_LOG_targetType_occurredAt`**（migration 落 SOP）；前端補分頁/pill 上色/chevron 修；**12 int 案 vs 真 AUDIT_LOG（含跨年 datetime2、targetName 顯示）**。P95 正式壓測（k6/JMeter 代表量）仍為後續 NFR 驗收 |
| F037 | 程序書變更歷程（欄位 Diff） | P1 | 1 | ✅ 已完成-已驗證 | `DOCUMENT_CHANGE_LOG` 綁真 publisher 持久化 before/after（F011 編輯／F012 狀態／**F010 建立 CREATE 事件**）＋查詢頁（proto 23，含「切換原因」顯示）＋`CHANGE_LOG_VIEW` 稽核＋`targetName` 填充；**「同一交易」邊界＝best-effort（人類定案，非缺口）**、建立事件已實作，int-verified |
| F038 | 循環樹狀圖變更歷程 | P1 | 1 | ✅ 已完成-已驗證 | `LIFECYCLE_CHANGE_LOG`＋DAG 結構事件＋查詢＋稽核；**`LIFECYCLE_SNAPSHOT` 交易一致快照（§5.9 原子，人類定案；F008/F009 結構寫入＋事件＋快照同交易、rollback 單測把關）＋完整新舊重建＋diff（add/rm/amber）＋雙頁 PDF 燒錄下載＋前端新舊並列 modal（proto 23）**；migration `1723161600000` 落 SOP，int-verified vs SOP。§C.4 RBAC 不對稱以專測鎖定<br>**F040 子分類 delta：AC-S1 尚未實作**（本頁「循環別」查詢下拉仍以 `ChangeHistoryPage.tsx:555/611` 之 `?.name` 顯示，未經 `lifecycleDisplayName`；下載 PDF 標題與稽核已走後端 `lifecycle-change-diff.service.ts` 之顯示名稱）；**AC-S2 之 `lifecycleName` 快照欄同 F008-S2 於 schema 不存在**。無測試覆蓋 |

### E08 權限矩陣
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F025 | 角色×功能權限矩陣 | P0 | 1 | ✅ 已完成-已驗證 | 機制完整並掛於實端點；數列對應功能尚無實體端點（使用表單/文件索引/調閱歷程/變更歷程/系統參數），該列 enforcement 未於實路由行使 |
| F026 | 角色×欄位權限矩陣 | P0 | 1 | ✅ 已完成-已驗證 | 欄位寫入拒絕**建立＋編輯兩路徑**（含多值欄 all-or-nothing）；**使用部門子樹前綴判定**（共用 `isWithinSubtree`，與 F019 共用，AC8/9 覆蓋）；**附件/使用表單下載權限**（AC6 角色×動作覆蓋：主管/部門窗口可下載、取代被拒 `PERMISSION_DENIED`）。**AC5-6 浮水印釐清（人類定案 OQ-FM-01）**：後台下載＝原始檔（管理存取 SAS，不燒錄），燒錄/稽核僅前台檢視器路徑（F020）；.xlsx 無 PDF 浮水印可燒 |
| F041 | 一般使用者子分類——業務／其他 | P0 | 1 | 🟡 部分 | 規格 🟢 APPROVED（2026-08-11 人類閘門，12 項全數裁決）；**實作 unit-green 且 migration 已落真 SOP DB**：`ACCOUNT.userSubtype`（`NOT NULL DEFAULT 'other'`＋`CHECK`，migration `29 AccountUserSubtype1723766400000` 已 `[X]`，1119 列 backfill `'other'`）、四純函式（`normalizeUserSubtype`／`isDeptScopedViewer`／`isUsingDeptMatched`／`isDocVisibleToViewer`）、`buildPublicList`／`PublicDocumentDetailService`／`WatermarkService` 四入口接 viewer、前端 `userSubtypeLabel`／`isSubtypeApplicable`／`SCOPE_NOTICE_*`＋`#scopeNotice`＋帳號管理 modal 子分類選擇器。**重用既有 `isWithinSubtree`**（INV-4）；**不觸及稽核子系統**（OQ-E08-10）；**拒絕回 404 非 403**（OQ-E06-03）。<br>**🔴 未達 ✅ 之缺口（DoD ②「端到端可達」）**：① **未部署**——backend 容器仍跑舊 dist，功能在瀏覽器尚未生效；② **本輪簡易版 ring**——無 Playwright e2e／Stryker／dep-cruiser，**且未做瀏覽器煙霧測試**（本 repo 已有前例證明此層會漏掉部署/代理 bug）；③ AC-39（F033 RAG）為 Phase 3 ripple、規格明文不驗收；④ `findCurrentByLogin()`／`TypeOrmDocMeta.getDocMeta()` 兩個 DB-touching adapter 無 `.spec.ts`（**test-generator 掃描時提報之既有缺口，非本輪引入**）；<br>⑤ **🔴 2026-08-11 已知缺陷（本輪第一個逃出約束環者）**：帳號清單「角色」欄與編輯 modal「目前角色」**未渲染子分類徽章**，由使用者於實際環境肉眼發現。**根因＝AC 未覆蓋 prototype 已明列之項目 ＋ 簡易 ring 無 fidelity 測試無法偵測漂移**（63 條 AC 全綠、1505＋722 測試全過仍出貨）。spec 層已補 [AC-41～AC-46](features/F041-user-subtype-business-scope.md#f2-fidelity-gap)＋4 條 delta；**實作與環尚未跟上**。<br>**→ 升 ✅ 的可執行清單與完整教訓見下方 [§F041 升 ✅ 待辦](#f041-to-done)** |

### E09 RAG／AI 問答
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F027 | .xls 原件保存（RAG 來源） | P0 | 1 | 🟡 部分 | backend unit-green：`DOC_SOURCE_XLS`、.xls 上傳（覆蓋不留版本）、模板驗證 v1（5 表名集合＋每表旗標→`XLS_TEMPLATE_INVALID`，OQ-E09-04 待更多樣本校準）。剩：真 Blob/DB、.xls 二進位解析＝`[integration]` |
| F028 | .xls 模板感知抽取與清洗 | P0 | 1 | 🟡 部分 | unit-green：五表模板 parser（fixture）＋清洗＋合併儲存格重組＋`EXTRACTION_FAILED`＋`INDEX_RUN` stage=extract。剩：**真 .xls 二進位解析**＝`[integration]` |
| F029 | 章/節 chunking、metadata、向量索引 | P0 | 1 | 🟡 部分 | unit-green：節 chunker＋8 metadata＋`FakeEmbedder`＋`DOCUMENT_CHUNK`/`VECTOR_EMBEDDING` 綱要＋metadata 過濾＋失敗不留半索引。剩：**embedding 模型/維度（OQ-E09-02）**＋真 pgvector＝`[integration]` |
| F030 | 改版重抽與重建索引、舊版排除 | P0 | 1 | 🟡 部分 | unit-green：`ReindexTriggerPort`（接 `DocumentChangedEvent`）＋內容/狀態分支＋保舊索引＋`REINDEX_FAILED`。剩：**Publisher→Reindex 接線**、`DOC_USING_DEPT` 觸發、真索引＝`[integration]` |
| F031 | 管理端提取結果與重新索引狀態 | P1 | 1 | 🟡 部分 | unit-green：`DocIndexPage`（取代 placeholder）＋overview/status/chunks/reindex 端點＋三態＋RBAC。剩：真 chunk/index 資料＝`[integration]` |
| F032 | 前台自然語言問答與引用來源 | P0 | 3 | ⬜ 未開始 | 無 QA 端點/RAG 編排；`/public` placeholder；Phase 3 |
| F033 | 權限感知檢索（已公告＋使用部門） | P0 | 3 | ⬜ 未開始 | 無檢索層 metadata 過濾下推 pgvector；Phase 3 |
| F034 | 問答稽核與 AI 導引浮水印/稽核 | P0 | 3 | ⬜ 未開始 | 無 `QA_LOG`；依賴 F032 及 F020/F023/F024；Phase 3 |
| F035 | 防幻覺護欄與無結果處理 | P0 | 3 | ⬜ 未開始 | 無生成層/LLM 整合/引用強制/拒答；Phase 3 |

### E10 附錄管理
| ID | 功能 | P | Ph | 狀態 | 關鍵缺口 / 為何未達 Done |
|----|------|---|----|------|--------------------------|
| F039 | 附錄管理（附錄池＋關聯排序） | P1 | 1 | ⬜ 未開始 | 規格已定稿（[F039](features/F039-appendix-management.md)，AC-01～AC-34 涵蓋 US-100/101/102 全部 AC）；**無任何實作**：`APPENDIX_POOL`／`DOC_APPENDIX` 未建表、`FileCategory='APPENDIX'` 未加、功能鍵「附錄管理」與欄位鍵「附錄」未入 RBAC 矩陣、`AUDIT_LOG` 之 `APPENDIX` targetType＋`appendixId` 欄未擴充、端點與前端頁面皆未建。prototype 僅有 24（管理頁），建立/編輯/唯讀/前台詳情之附錄區塊待 ui-ux-designer 傳播 |

---

## F041 升 ✅ 待辦（可執行清單） {#f041-to-done}

> F041 之 unit 層與 DB 層已完成（117/1505 backend、56/722 frontend、migration `[X] 29` 落真 SOP DB、173 測試檔 zero byte 變動）。
> 以下五項為**升 ✅ 前必須完成者**，順序有依賴關係——①→② 為前置，③ 需在 ② 之後才有意義；**⓪ 為 2026-08-11 新增、可與 ①② 並行**。

### 🔴 已知教訓：本輪第一個「逃出約束環」的真實缺陷（2026-08-11）

> **缺陷**：帳號管理清單之「角色」欄對一般使用者**未渲染子分類徽章**（`AS30005` 於 DB 正確為 `roleCode='User'`／`userSubtype='business'`／`status='active'`，`AccountView` 亦已含 `userSubtype`，純屬前端漏渲染）。
> 「編輯帳號」modal 之「目前角色」有**同一**漏渲染。由**使用者在實際環境肉眼發現**，非任何自動化關卡攔下。
>
> **根因（兩層，缺一不成災）**：
> 1. **AC 未覆蓋 prototype 已明列之項目。** `prototypes/08-account-management.html` 檔頭明列**三項**已套用內容（①指派角色 modal 選擇器 ②清單「角色」欄子分類徽章 ③編輯 modal「目前角色」顯示子分類），
>    但 [F041](features/F041-user-subtype-business-scope.md) §F 只有 AC-31／32／33／40、[F003](features/F003-account-role-management.md) 只有 AC-U1～AC-U5——**②③ 從未被寫成任何一條 AC**。
>    test-generator 對實作全盲、**只依 AC 建環**，因此環裡根本沒有這兩項。**AC 沒寫到的東西，環不會長出來。**
> 2. **簡易 ring 無 fidelity 測試，無法偵測 prototype↔實作漂移。** 本輪依使用者指示採簡易版（僅 jest／vitest），
>    而 Playwright **fidelity 測試正是專抓這類漂移的那一環**——它比對的是「畫面 vs prototype」，不依賴 AC 是否寫全。
>    兩層防線同時缺席，結果：**63 條 AC 全綠、backend 1505 ＋ frontend 722 測試全過，缺陷照樣出貨。**
>
> **已採行之修補（spec 層，2026-08-11）**：新增 [F041 §F2 AC-41～AC-46](features/F041-user-subtype-business-scope.md#f2-fidelity-gap)（不重編既有 AC，避免破壞 `docs/test-specs/features/F041-test.md` 之 AC↔測試對照），
> 並同步立 delta：[F003](features/F003-account-role-management.md) `AC-U6`～`AC-U9`、[F025](features/F025-role-function-matrix.md) `AC-U4`、[F019](features/F019-public-list-browsing.md) `AC-U8`。
> 同類掃描（4 份 prototype 逐項比對檔頭清單與內文 F041 區塊）另揪出 4 處同類缺口，一併補入——詳見 ⓪。
>
> **可推廣之結論（勿只當成 F041 個案）**：
> - **prototype 檔頭的「本檔已套用」清單，是 AC 覆蓋率的檢查表。** 每一項都必須指得出一條 AC；指不出來就是缺口，且該缺口**不會**被任何全綠的測試數字反映出來。spec-writer 收尾時應逐項對帳。
> - **AC 全綠 ≠ 規格被滿足**，只等於「被寫成 AC 的那部分被滿足」。測試數量（1505／722）對未覆蓋項目**零證據力**。
> - **fidelity/e2e 不是「有餘力再補」的裝飾。** 它是唯一不依賴 AC 完整性的防線：AC 可能寫漏，prototype 比對不會。跳過它，等於把整條防線押在「spec-writer 沒寫漏」這個單點上——本次即為該單點失效之實例。

| # | 動作 | 具體內容 | 為何必要 |
|---|---|---|---|
| **⓪** | **實作 AC-41～AC-46（2026-08-11 新增之 6 條）** | 皆為**前端呈現面**、皆可由 vitest 斷言：<br>**AC-41** 帳號清單「角色」欄之子分類徽章（`roleCode==='User'` 才附加；其餘 4 種角色即使 `userSubtype='business'` 也不顯示，樣本＝persona `20088 陳彥廷`）——**即本次外流缺陷本身**；<br>**AC-42** 「編輯帳號」modal 之「目前角色」同一組合（應與清單**共用同一元件**）；<br>**AC-43** 指派角色 modal 子分類選擇器之**預選值**（含「非 User 帳號改選 User 時預選其保留值」＝AC-36「舊設定復活」之唯一 UI 可觀測面）；<br>**AC-44** 子分類選項之 `SUBTYPE_DESC` 逐字說明（須以具名常數持有）；<br>**AC-45** 權限矩陣頁之 F041 註記橫幅（prototype 18 檔頭所稱「本檔唯一變更」，**目前完全未實作**）；<br>**AC-46** 前台詳情 404 畫面（單一 not-found 狀態、三種成因不可區分、逐字文案與 prototype 04 對齊、DOM 不得殘留任何文件欄位）⚠ 此條**會變更一個既有畫面之文案**（現行 `文件可能尚未公告或已下架。` ＋ `inbox` 圖示 ＋ 無錯誤碼列，皆與 prototype 不符） | AC-41／AC-42 是已出貨缺陷；AC-45 是同類掃描揪出之**第二個未實作項**；AC-43／AC-44／AC-46 目前部分實作、部分漂移，且**全部無測試保護** |
| **①** | **重建 backend image** | 容器 `icsop-backend`（部署前名為 `icsop-management-platform-backend-1`）仍跑舊 dist。需重新 build 並取代（既有慣例：容器內只有 `dist`，比照 [F040](features/F040-lifecycle-subcategory.md) 落地前例）。⚠ 欄位為 additive ＋ `DEFAULT 'other'`，舊 dist **不會炸**，但 F041 全部行為**尚未生效** | DoD ②「端到端可達」——端點存在 ≠ 功能可用 |
| **②** | **部署並確認服務起得來** | 重啟後確認 Nest 正常啟動、路由掛載、`/public/documents` 與 `/public/documents/:id/view` 等既有端點無回歸 | 部署本身即為本 repo 屢次踩雷之處 |
| **③** | **瀏覽器實測兩種 persona（＋孤兒）** | 以真瀏覽器分別以 **業務**／**其他** 子分類帳號登入前台，逐項核對：<br>(a) 清單筆數與 `total` 差異（業務只見使用部門相符者）；<br>(b) 頂部 `#scopeNotice` 說明句逐字正確且**兩種 persona 不同**（AC-40）；<br>(c) 查無結果時**空狀態仍為 `查無符合結果`**、且**頂部說明句同時仍在**（AC-33 vs AC-40 不得互相取代）；<br>(d) 直連他部門文件之詳情 URL → **404、且畫面不洩漏文件編號/書名**（AC-21）；<br>(e) 檢視器／下載／列印他部門文件 → 拒絕、**無 PDF 位元組**（AC-25／AC-26）；<br>(f) **孤兒帳號**（`orgCode` 空）→ 清單為空、說明句沿用業務句、無「帳號異常」字樣（AC-12／AC-40）；<br>(g) 帳號管理 modal：角色選「一般使用者」才出現子分類選擇器（AC-32） | 本輪**簡易版 ring 無 Playwright、亦未做瀏覽器煙霧測試**。2026-07-25 之 Chrome MCP 煙霧測試曾揪出 3 個「只有真瀏覽器會踩」的部署／代理層 bug（nginx/vite 代理白名單、viewer PDF iframe 之 Accept 撞 SPA bypass、裸 `/admin` 絕對轉址掉 port），**單元全綠完全測不到** |
| **④** | **補 e2e（Playwright）＋ fidelity 測試** | 將 ③ 之 (a)～(g) 固化為自動化 e2e；**另須補 fidelity 測試**（畫面 ↔ prototype 逐項比對），至少涵蓋 `03-public-list.html`／`04-public-document-detail.html`／`08-account-management.html`／`18-permission-matrix.html` 四頁之 F041 區塊。建環工具見 `ring-setup` skill | 人工實測一次無法防回歸。**更關鍵：fidelity 是唯一不依賴 AC 完整性的防線**——本輪之外流缺陷正是「AC 沒寫到 ⇒ 環裡沒有 ⇒ 全綠出貨」，⓪ 補 AC 只修好了**這一次**已知的 6 項，fidelity 才防得住**下一次**沒想到的那一項 |

**不阻擋升 ✅ 者（明確排除）**：
- **AC-39**（[F033](features/F033-permission-aware-retrieval.md) RAG 之未來下限保證）——Phase 3 ripple，[F041](features/F041-user-subtype-business-scope.md) 規格明文本輪不驗收。
- **Stryker mutation／dependency-cruiser**——本輪由使用者指定跳過；屬全專案性的 ring 補強，非 F041 專屬缺口。

**既有缺口（本輪提報、非 F041 引入，另案處理）**：`findCurrentByLogin()` 與 `TypeOrmDocMeta.getDocMeta()` 兩個 DB-touching adapter 無 `.spec.ts`（test-generator 建環掃描時發現）。建議併入下次 int 測試線一併補齊。

---

## 跨功能缺失的地基（一建、多功能解鎖）

這些是「多個功能卡在同一塊未建地基」的根因，優先處理 CP 值最高：

1. ✅→🟡 **`AUDIT_LOG` 稽核基礎（F023）** — **共用 `AuditWriter` 契約與不可變 store 已 unit-green 併入 main**；下游 F005/F007/F012/F020/F034/F037/F038 可直接 import。剩 DB REVOKE 強制＋migration＋usage-forms 佔位改接（整合階段）。
2. 🟡 **Blob／檔案上傳層** — **`BlobStore` 抽象＋FakeBlobStore＋附件/表單/來源實體已 unit-green 併入 main**（F016/F018/F027 backend）。剩真 Azure Blob 接線＋前端 UI＋migration:run（整合階段）。
3. 🟡→ **組織／人員讀取端點（org-foundation，已併 main）** — **ACCOUNT 即在職員工目錄**（同 VW_HPMUSER/AS/EMPSTS='A'）→ 不另建 PERSON；`NameResolutionService`＋`OrgDirectoryService`（tree/subtree/search）＋DESC_FULL＋session 擴充皆 unit-green。**解鎖 F017 室長名、F019 部門篩選、F020 公司/部門名**。剩 F014（制定組織下拉接線＋當責室長寫入）、F006、F026 子樹判定接上此地基（＋真 DB）。權威來源 `upstream-person-org-source.md`。
4. 🟡 **帳密登入途徑 B（F001/F003 閉環）** — **已 unit-green 併入 main**。定案：登入識別鍵＝**loginId**（非 email）；`POST /auth/login` 驗 `createManual` 寫入的 `passwordHash`。剩 build→login 真 DB 往返驗證（整合階段）。
5. 🟡 **RAG 管線（F027→F028→F029→F030→F031）** — **F027/F028/F029/F030/F031 backend 皆 unit-green 併入 main**（fixture/FakeEmbedder/fake vector store）。剩 **embedding 模型/維度（OQ-E09-02）**、真 .xls 解析、真 pgvector upsert/查詢、`DocumentChangePublisher→ReindexService` 接線＝整合階段；F032–F035 Q&A（Phase 3）仍 greenfield。

---

## 這個追蹤機制怎麼維持不腐化

1. **同 commit 更新狀態** — 任何實作/變更某功能的 commit，**同時**更新本檔該列狀態與缺口，以及該 `features/Fxxx-*.md` 的 `Status:` 行。PR/commit 描述引用 F 編號。
2. **DoD 為合併門檻** — 標 ✅ 前自問三條（AC 測試覆蓋？端到端可達？副作用落地？）。任一不過 → 標 🟡 並寫明缺口，不得標完成。
3. **每個 epic 收尾跑一次對帳** — 用本次同樣的 spec↔code 稽核（可平行子代理）重跑該 epic，更新狀態；避免「以為做完、其實有洞」。
4. **缺口即 backlog** — 「關鍵缺口」欄即待辦來源；「跨功能地基」為排序依據（先解阻擋最多者）。

---

_稽核方法：對 38 個 `features/Fxxx-*.md` 的 Acceptance Criteria 逐條 ↔ `backend/src`、`frontend/src`、測試檔交叉核對，並以「端到端可達」嚴格判定。基準 main：初審 `e6045d9` → Wave 1/2 → 整合①②③ → 地基三線 → 前端三線 → 縫隙收斂三線 → 獨立🟡收尾三線 → 可建功能三線。測試：**backend 1243 單元＋88 整合（`npm run test:int`，15 suites vs SOP＋真 Blob）／frontend 410**，tsc 全淨。22 migration 落 SOP。狀態：**✅27 🟡7 🔵0 ⬜4**（⬜ 僅剩 Phase 3 RAG F032-F035；🟡 僅剩 F021/F022（RWD/彈窗＝瀏覽器人工驗）＋F027-F031（RAG 管線 backend，卡 pgvector/embedding/LLM）；**非 RAG、非瀏覽器人工之功能已全數 ✅**）。（2026-07-24）_

_2026-08-06 增修：新增 **F039 附錄管理**（E10，規格層完成、實作 ⬜ 未開始），功能總數 38 → **39**，狀態 **✅27 🟡7 🔵0 ⬜5**。上表其餘各列之狀態與缺口未重新稽核，仍以 2026-07-24 基準為準。_

_2026-08-07 增修：新增 **F040 循環子分類**（E03 橫切，規格 **🟢 APPROVED — 2026-08-07 人類閘門通過含 4 項裁決**、當時實作 ⬜ 未開始；**已於 2026-08-08 落地，見下則增修**），功能總數 39 → **40**，狀態 **✅27 🟡7 🔵0 ⬜6**。本需求為 `LIFECYCLE` 之 **additive 欄位**，不改既有欄位、不改既有 ICSOP 文件編號規則；F007／F010／F011／F017／F019／F008／F009／F036／F038 之既有 AC 全數未動，各檔僅新增 `### 循環子分類 delta` 段落（共 28 條 AC）。上表其餘各列之狀態與缺口未重新稽核，仍以 2026-07-24 基準為準。_

_2026-08-08 增修：**F040 循環子分類實作落地 ⬜→🟡**，功能總數維持 **40**，狀態 **✅27 🟡8 🔵0 ⬜5**。Uncle-Bob 約束環模式（環由 `test-generator` 先寫、`tdd-implementation` 零測試碼）；四道機器閘門全綠（backend **116 suites／1440 tests**、backend build exit 0、frontend **48 files／664 tests**、frontend typecheck exit 0），migration `LifecycleSubcategory1723680000000` **已對真 SOP DB 實跑 COMMIT**（前置盤點重複列 0 筆；唯一索引語意實測通過），23 migration 落 SOP。**未標 ✅ 之理由**：本輪採簡易版 ring（僅 jest/vitest），6 條 AC-S delta 無測試覆蓋，且其中 **4 條經查核為尚未實作**（F008-S1、F009-S1、F036-S1 之切換器選項、F038-S1 —— 皆為「頁面仍以裸 `name` 顯示循環」之同一族缺口，共 3 個檔 4 處呼叫點）；另 `LIFECYCLE_CHANGE_LOG.lifecycleName` 快照欄於現行 schema 不存在（AC-34／F008-S2／F038-S2），屬規格↔schema 落差，待裁決。關聯 9 檔（F007–F011、F017、F019、F036、F038）之既有 AC 全數未動、狀態維持 ✅，其子分類 delta 實況已逐列註記。上表其餘各列之狀態與缺口未重新稽核，仍以 2026-07-24 基準為準。_
