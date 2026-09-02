# F017: 後台文件清單與搜尋
Priority: P0-MVP | Status: 🟡 實作（unit 綠；14 欄清單＋9 篩選＋排序分頁；**「檔案」與「連結點程序書」兩欄之後端富化與前端渲染已補**（doc-seams，批次注入不 N+1）；int 已寫未跑，見 implementation-logs/doc-seams-impl.md）｜**循環子分類顯示 delta：🟢 APPROVED（2026-08-07）**｜**連結點程序書欄摺疊 delta：🟢 APPROVED（2026-08-18 使用者裁決，AC-E1～AC-E9）**｜**連結點無 PDF 事前標示 delta：🟢 APPROVED（2026-08-27 使用者裁決，AC-E10～AC-E14；已實作）**｜**清單匯出（CSV）delta：🟢 APPROVED（2026-08-31 使用者裁決，`AC-X1`～`AC-X17`；規格層完成、實作未開始）** | Last Updated: 2026-08-31
Epic/Story: E04 / US-037

> **2026-08-07 additive delta**：第 14 欄「循環別」之顯示與其可搜尋下拉之選項，須反映循環子分類。規則權威＝[F040](F040-lifecycle-subcategory.md)；欄位數、篩選數與既有條款皆不變。
> **🔴 2026-08-16 CHANGE delta（使用者裁決；缺失／變更 delta 第 9 項）——篩選由 9 項改為 13 項且順序全面重排**：新增 `公告日期`（區間）／`附錄`／`使用表單`／`OJT` 四項，並將 13 項之順序改為使用者原文之逐字順序。**清單 14 欄之欄位集合、順序與顯示規則一律不變**。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta），與既有 `AC-S#` 批次區隔、不重號。
> **🔴 2026-08-18 CHANGE delta（使用者體驗缺失回報）——第 12 欄「連結點程序書」改為恆一行高之摺疊呈現**：多連結之列原被上下拉伸至 5～6 行高、清單無法掃視。新行為＝只顯示第一顆 pill ＋ 可點的 `+{N−1}` 徽章、點擊就地展開；**編號仍為可見文字、書名仍只在 tooltip**；`連結點程序書` 篩選命中者排第一顆。**14 欄之欄位集合與順序、13 項篩選之比對語意、統計卡／排序／分頁一律不變。** 逐條見 [§連結點程序書欄摺疊 delta](#link-cell-collapse-delta)（`AC-E1`～`AC-E9`）。
> **🔵 2026-08-20 additive delta（使用者裁決；缺失／變更 delta 第 9 項）——清單最左新增「OJT」圖示欄**：清單由 14 欄改為 **15 欄**，新增之圖示欄置於**最左**（第 1 欄，`制定公司` 之前），依既有 `hasOjt` 布林值呈現兩種視覺狀態。**資料層已就緒**（`backend/src/documents/documents.store.ts:135-142` 之 `hasOjt?: boolean` 已於同一次批次查詢取得、`frontend/src/api/types.ts:196-197` 已有型別），**不需新增後端欄位或查詢**。**本 delta 之 AC 編號採 `AC-N#`**（N＝2026-08-20 defect delta），與既有 `AC-S#`／`AC-D#`／`AC-E#` 區隔、不重號。逐條見 [§OJT 圖示欄 delta](#ojt-icon-column-delta)（`AC-N37`～`AC-N40`）。
> ⚠ **另含兩處既有語意之擴充**：① `程序書書名內`（使用者原文之「內」字）＝等值下拉 ＋ contains 輸入之**雙行為**（OQ-D18-12）；② `當責室長` 比對範圍由**僅主要**擴為**主要∪次要**（OQ-D18-08，與 [F019](F019-public-list-browsing.md) `AC-D7` 為同一語意之兩處斷言，**不得只改一處**）。
> **🔵 2026-08-21 additive delta（使用者裁決；三項裁決第 3 項）——節點子樹 deep link 篩選**：`GET /admin/documents` 新增 `nodeSubtreeId` 篩選參數（**恆與 `lifecycleId` 成對**），語意＝同一循環且掛載節點 ∈ 該節點子樹；本頁以**可清除的 chip** 呈現。**本 delta 之 AC 編號採 `AC-T#`**（`AC-T40`～`AC-T48`），權威見 [§節點子樹篩選（deep link）delta](#subtree-filter-delta)。
> 🔒 **子樹為第 14 個篩選來源但不進那 13 項**——`AC-D1`／`AC-D2`／`AC-D9`／`AC-D10`／`AC-N40` ② 逐字續為有效；本 delta 僅**就地擴充 `AC-D8`**（清除全部篩選須連 chip 一起清）。上游入口＝[F036](F036-lifecycle-tree-preview.md#subtree-drawer-delta) 之子樹抽屜導向鈕。
> **🔴 2026-08-27 缺失 delta（使用者回報：「在清單頁點擊下載連結點程序書時，出現無法下載的問題」）——連結點無 PDF 之事前標示**：實測查證後判定**下載機制本身沒有壞**，壞的是第 12 欄把每個連結點一律畫成可下載的按鈕，而多數目標根本沒有上傳 ICSOP PDF（591 份中僅 7 份有）。新行為＝後端補 `targetHasPdf`、無 PDF 者改以**無檔案態**（`file-x-2` ＋ 灰，仍可點可 focus）事前標示、點擊之提示改為說明原因。**摺疊行為（`AC-E1`～`AC-E6`／`AC-E8`）、下載路徑（`AC-E7`）、欄位集合與 13 項篩選一律不變。** 逐條見 [§連結點無 PDF 事前標示 delta](#link-no-pdf-delta)（`AC-E10`～`AC-E14`）。
> 🔴 **2026-09-02 delta（人類裁決）——「樹狀圖」欄對主管／部門窗口不進 DOM**：使用者原文「ICSOP 文件管理：樹狀圖欄位，對主管/部門窗口隱藏」。<br>🔒 **判定源自 `LIFECYCLE_MANAGEMENT read`（該欄之真正閘門，[F036](F036-lifecycle-tree-preview.md) 預覽端點所用），不得寫成角色清單**——主管於同日之 [F025](F025-role-function-matrix.md) delta 由 `唯讀` 改為 `無`，部門窗口本就是 `無`。寫成角色清單雖然此刻等價，但下次矩陣一動就會與真正的授權分家，那正是「畫面上有一顆一定會 403 的按鈕」的成因（**部門窗口先前即為此狀態，本輪一併修掉**）。<br>🔴 **表頭 `<th>` 與列 `<td>` 必須同進退**：只隱藏其中一邊會使整張表**錯位一格**，而「按鈕不見了」這條斷言對錯位**完全無感** ⇒ 建環須以「表頭欄數 == 每列儲存格數」鎖住。<br>🔒 **其餘 14 欄之集合與順序、13 項篩選、統計卡／排序／分頁一律不變**；**CSV 匯出之 14 欄一字未動**——匯出本就不含「樹狀圖」（見下方 delta），故本輪對匯出**零漣漪**，不得順手改成「依角色輸出不同欄數」。

> **🔵 2026-08-31 additive delta（使用者裁決）——文件管理清單新增「匯出（CSV）」**：使用者原文「ICSOP 文件管理：比照使用表單管理/附錄管理，新增匯出功能。」本頁 topbar 動作區新增「匯出」鈕，將**當前篩選之全部結果**（非當前頁）輸出為 CSV。**欄位＝畫面 15 欄去掉「樹狀圖」＝14 欄**（使用者裁決；樹狀圖欄只是導覽圖示、無資料值可落地，比照 [F039](F039-appendix-management.md#export-delta) `AC-D6` 之「操作欄不匯出」）。**15 欄之欄位集合與順序、13 項篩選、子樹 chip、統計卡／排序／分頁一律不變**——本 delta **只加一顆鈕與一支端點，不動畫面上任何既有物件**。逐條見 [§清單匯出（CSV）delta](#export-delta)（`AC-X1`～`AC-X17`）。**本 delta 之 AC 編號採 `AC-X#`**（與 [F018](F018-usage-form-management.md#name-and-export-column-delta)／[F039](F039-appendix-management.md#name-and-export-column-delta) 之同型匯出 delta 呼應），與本檔既有 `AC-S#`／`AC-D#`／`AC-E#`／`AC-J#`／`AC-N#`／`AC-T#`／`AC-U3` 區隔、不重號（⚠ 本檔另有一處交叉引用之 `AC-F17` 屬 [F024](F024-access-history-query.md) 之 AC 空間，非本檔所有）。
> 🔴 **「匯出範圍如何攜帶」之原設想已於 2026-08-31 由 lead 實測後撤回**（原設想＝比照 [F018](F018-usage-form-management.md#name-and-export-column-delta) `AC-X7` 送 13 項篩選之逐字查詢參數）：本頁為**客端篩選模型**——13 項篩選全部在瀏覽器端施加、前後端之篩選語言不同構（顯示名稱 vs id／代碼）、其中兩項後端根本沒有參數、另三項在前端是「先取 id 集合再交集」。⇒ **`AC-X11` 只鎖可觀察之列集合與列序**（列集合＝篩選＋chip 套用後之全部列、列序＝畫面當前排序、CSV 一一對應同序）。四項查證事實與被撤回之原表述逐字保留於 `AC-X11`。
> ✅ **`OQ-X-01` 已於 2026-08-31 由 system-architect 定案＝乙案**：**`POST /admin/documents/export`**，body 恰兩鍵 **`{ documentIds: string[]; linkTargetId?: string }`**，**後端完全不重跑任何篩選與排序**，14 欄值層 100% 由後端解析（權威＝`architecture-spec.md` §13 決策 D1～D4）。[§Interface Contract](#interface-contract) 之方法、路徑與兩個鍵名皆已回填。
> 🔒 **本 delta 不新增任何錯誤碼**（`AC-X16` ⑨ 逐字有效）：畸形 body 沿用**既有** `VALIDATION_ERROR`（`AC-X17` ①）。⚠ 同日曾短暫改為新增碼 `EXPORT_IDS_INVALID`，已由 lead 撤回；被撤回之該案與架構初稿之「視同空陣列 → 200 ＋ 僅表頭列」兩者之否決理由，逐字保留於 `AC-X17`。
> 🔴 **時區鐵則（`AC-X7`／`AC-X8`）**：`toTaipei()` **只用於格式化輸出、一律不用於比較**——`狀態` 欄之「今日」基準恆為 `new Date()`，對其套 `toTaipei()` 會在台北 00:00–08:00 之窗口使 CSV 與畫面互相矛盾，**而固定時鐘之 fixture 完全測不到**。

## Description
後台以分頁清單檢視所有 ICSOP 文件，頂部呈現 3 張統計卡，提供 **13 個**篩選（其中 10 項為可搜尋下拉，另有公告日期區間、程序書書名內之雙行為欄、OJT 三值下拉）與依編號/公告日期排序。<br>📝 **2026-08-16 使用者裁決推翻，理由：使用者明列 13 項篩選條件（缺失 delta 第 9 項）**——原條文為「提供 **9 個**可搜尋下拉篩選」。清單顯示 14 欄（UI 顯示標籤，實體名維持「ICSOP 文件」）。狀態欄依「公告日期」衍生顯示（已公告/進度中/失效/作廢，見 F012）。與前台清單邏輯不同：**後台不套用「使用部門置頂」規則**，預設依最後更新時間或編號排序。未指派節點文件明顯標示。19 欄位權威定義見 [data-model.md](../data-model.md#document-entity)。

## Preconditions
- 操作者具後台文件管理存取權（F025；系統管理員/主管/部門窗口唯讀，ICSOPAdmin 可寫）。

## Main Flow
1. 進入後台清單頁 → 頂部顯示 3 張統計卡：程序書數量（總數）、已公告（衍生數）、進度中（衍生數）。
2. 分頁呈現清單，由左至右 **15 欄**（🔴 **2026-08-20 就地改寫，原為 14 欄**；新增之第 1 欄「OJT」圖示欄為本次唯一變動，其餘 14 欄之集合、相對順序與顯示規則逐項不變）：
   0. **OJT**（圖示欄，依 `hasOjt` 兩態呈現；`AC-N37`～`AC-N39`，2026-08-20 delta）
   1. 制定公司
   2. 制定部門
   3. 制定室別
   4. 當責室長（顯示「當責室長-主要」，次要以 tooltip/次列呈現）
   5. 狀態（徽章：已公告／進度中／失效／作廢，依公告日期衍生）
   6. 檔案（ICSOP PDF，下載鈕/圖示）
   7. 樹狀圖圖示（點擊開啟 [F036 循環樹狀圖預覽](F036-lifecycle-tree-preview.md)，帶入該文件所屬循環 `?cycle=<code>`）
   8. 程序書編號（documentNumber，等寬字）
   9. 程序書書名（documentName）
   10. 版次（edition，如 `26'01`，等寬字）
   11. 內容摘要（contentSummary，可截斷 + title 顯示全文）
   12. 連結點程序書（文件連結點，下載鈕/圖示；0..*）——**恆一行高之摺疊呈現**：0 個＝`—`／1 個＝單顆 pill／N ≥ 2＝第一顆 pill ＋ 可點的 `+{N−1}` 徽章，點擊就地展開列出全部（`AC-E1`～`AC-E5`，2026-08-18 delta）
   13. 公告日期（announcedDate）
   14. 循環別（lifecycleId 名稱）
3. 關鍵字查詢（程序書編號/程序書書名）→ 僅顯示符合結果。
4. 套用 **13 個**篩選（順序由左至右／由上而下逐字為）：**制定公司、制定部門、制定室別、當責室長、狀態、程序書編號、程序書書名內、公告日期、連結點程序書、附錄、使用表單、OJT、循環別** → 清單即時更新。<br>📝 **2026-08-16 使用者裁決推翻，理由：使用者逐字指定 13 項篩選與其順序**——原條文為「套用 **9 個**可搜尋下拉（combobox 可輸入過濾）篩選：**循環別、狀態、程序書編號、程序書書名、制定部門、制定室別、當責室長、制定公司、連結點程序書**」。9 項全數保留（其中「程序書書名」改名為「程序書書名內」並擴充語意），新增 4 項，順序全面重排。<br>各項之比對語意逐項定義見 [AC-D2](#filter-13-delta)。
5. 依程序書編號/公告日期排序 → 清單即時更新。
6. 點擊某列「樹狀圖圖示」→ 開啟 [F036 循環樹狀圖預覽](F036-lifecycle-tree-preview.md)（新頁 `22-lifecycle-tree-preview.html?cycle=<該文件所屬循環代碼>`），以該文件所屬循環為預選之唯讀 DAG；可視範圍依 F036／F025「循環管理」唯讀規則（主管對循環管理為**全公司唯讀**，雙入口一致、無 403 落差，OQ-E08-03 已定案；DeptContact／User 無此權限）。

## Alternative Flows
- 依 F026 決定各角色可見欄位；唯讀角色顯示唯讀 banner。
- 統計卡與狀態徽章之「已公告/進度中」計數與顯示採 F012 衍生規則（有效＋公告日期≤今日＝已公告、有效＋公告日期>今日＝進度中）。

## Edge Cases
- 查無符合結果：顯示空狀態，非錯誤。
- **公告日期區間僅填單邊**（2026-08-16）：僅填起日＝該日（含）之後全部；僅填迄日＝該日（含）之前全部；兩端皆空＝不施加限制。**非錯誤**。
- **公告日期起日晚於迄日**：交集為空、顯示空狀態，**非錯誤**、不回錯誤碼。
- **公告日期為 null 之文件**（未填公告日期／進度中）：套用任一端之日期區間時**一律排除**（不得誤入結果）。
- **「程序書書名內」同時具備選取值與輸入值**：以**選取值（等值）優先**；使用者手動清除選取後所留之輸入文字始生效為 contains。
- **「附錄」／「使用表單」篩選之選項為空**（池中無任何附錄／表單）：下拉呈現空選項清單，非錯誤。
- **「使用表單」選項之顯示字串**：`{編號} {名稱}`（編號與名稱間一個半形空格）；`formNumber` 為 `null` 者**僅顯示名稱**（不得出現前導空格或 `null`）。選項值恆為 `formId`（[F018](F018-usage-form-management.md) `AC-D8`）。
- 存在「未指派節點」文件：以明顯標示（警示圖示）呈現；其「樹狀圖圖示」仍可開啟該文件**所屬循環**之 F036 預覽（文件所屬循環為建立時必填，僅尚未定位於特定節點）。
- 內容摘要過長：清單截斷顯示，滑鼠停留（title）顯示全文。
- 文件無連結點程序書（0 筆）：該欄留空或顯示「—」。
- **文件恰有 1 個連結點程序書**（2026-08-18）：顯示單顆 pill，**不得**出現 `+0` 或任何摺疊徽章（`AC-E1`）。
- **文件有 N ≥ 2 個連結點程序書**：收合態只見第一顆；其餘經 `+{N−1}` 展開後可見且**每一個都可點擊下載**——不得有任何目標僅存在於 tooltip 而無法觸發（`AC-E3`／`AC-E4`）。
- **展開某列後改變篩選／換頁**：展開狀態以列身分（`documentId`）為鍵，不得落到其他列上；該列若已不在結果集中則自然不呈現，**非錯誤**（`AC-E5`）。
- **`連結點程序書` 篩選命中之連結非該列之第一筆**：改以命中者為收合態唯一可見之第一顆，其餘順序不變（`AC-E6`）。

## Postconditions
- 管理員可定位需維護文件並掌握文件池狀態（含程序書數量/已公告/進度中總覽）。

## Acceptance Criteria
- Given 進入清單頁, When 載入, Then 頂部顯示 3 張統計卡（程序書數量/已公告/進度中），清單分頁顯示 **15 欄**。<br>📝 **2026-08-20 就地改寫（`OQ-D9-25` 選項 A）**：原條文為「清單分頁顯示 **14 欄**」；新增最左之「OJT」圖示欄後為 15 欄。原數值逐字保留於此供追溯。
- Given 輸入既存程序書編號或書名關鍵字, When 查詢, Then 僅回傳符合結果。
- Given 套用「制定部門+狀態」複合篩選, When 條件套用, Then 清單反映交集結果。
- Given 於 制定公司／制定部門／制定室別／當責室長／程序書編號／程序書書名內／連結點程序書／附錄／使用表單／循環別 任一可搜尋下拉輸入關鍵字, When 過濾, Then 下拉選項即時縮小並可選取。<br>📝 **2026-08-16 使用者裁決推翻，理由：篩選由 9 項改為 13 項且順序重排**——原條文列舉為「循環別/狀態/程序書編號/程序書書名/制定部門/制定室別/當責室長/制定公司/連結點程序書」共 9 項。本條改列**具 combobox 語意之 10 項**；`狀態` 與 `OJT` 為固定值下拉（非 combobox）、`公告日期` 為區間輸入（非下拉），三者不適用本條。
- Given 有效文件, When 呈現狀態欄, Then 依公告日期衍生顯示「已公告」（≤今日）或「進度中」（>今日），失效/作廢照原樣顯示。
- Given 點擊某列樹狀圖圖示, When 觸發, Then 開啟 [F036](F036-lifecycle-tree-preview.md) 循環樹狀圖預覽（帶入該文件所屬循環 `?cycle=<code>`）。
- Given 查詢無符合關鍵字, When 查詢, Then 顯示空狀態而非錯誤。
- Given 清單含未指派節點文件, When 呈現, Then 正確顯示警示標示。

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**：Given 某文件所屬循環為「銷售及收款循環（消金）」, When 清單第 14 欄「循環別」呈現, Then 顯示字串恰為 `銷售及收款循環（消金）`（由 `lifecycleDisplayName` 產生，全形括號無空白）；Given 所屬循環無子分類, Then 顯示恰為 `銷售及收款循環`（不含括號）。
- **AC-S2**：Given 池中有「銷售及收款循環（消金）」與「銷售及收款循環（企金）」, When 展開「循環別」可搜尋下拉, Then 呈現**兩個相異選項**（各以 `lifecycleDisplayName` 顯示），選項值為各自 `lifecycleId`（**非** `name` 字串）；When 選定其中一項, Then 清單僅回傳該具體循環之文件，不含同名另一子分類之文件。

### 篩選 9 → 13 項 delta（🔴 2026-08-16 使用者裁決；缺失／變更 delta 第 9 項） {#filter-13-delta}

> 前提裁決：**OQ-D18-10**＝「附錄」「使用表單」為可搜尋下拉選具體某一份、「OJT」為三值（全部／有／無）；**OQ-D18-11**＝公告日期為區間；**OQ-D18-12**＝「程序書書名內」＝等值下拉＋contains 輸入雙行為（含 `%`／`_`／`'` 跳脫）；**OQ-D18-08**＝當責室長比對＝主要∪次要；**OQ-D18-13**＝桌面多列 grid 自動換行、行動沿用底部 sheet、提供「清除全部篩選」（版面細節由 ui-ux-designer 定稿）。

- **AC-D1**（篩選器組成與順序）：Given 進入後台文件清單頁, When 檢視篩選區, Then 其篩選控制項**恰為 13 個**，且順序（桌面：由左至右、逐列換行；行動 sheet：由上而下）逐字為 `制定公司`／`制定部門`／`制定室別`／`當責室長`／`狀態`／`程序書編號`／`程序書書名內`／`公告日期`／`連結點程序書`／`附錄`／`使用表單`／`OJT`／`循環別`；各控制項之無障礙名稱即為上列逐字字串。
- **AC-D2**（各項比對語意）：Given 已選定某篩選值, When 後端執行查詢, Then 依下表比對；未提供者不施加限制；多項並用為 **AND**。

  | # | 篩選 | 控制項型態 | 比對鍵與語意 |
  |---|---|---|---|
  | 1 | `制定公司` | 可搜尋下拉 | `draftingCompanyId` 等值（既有） |
  | 2 | `制定部門` | 可搜尋下拉 | `draftingDeptId` 等值（既有） |
  | 3 | `制定室別` | 可搜尋下拉 | `draftingSectionId` 等值（既有） |
  | 4 | `當責室長` | 可搜尋下拉 | **`primaryChiefId` ∪ `secondaryChiefIds` 命中任一即納入**（🔴 語意擴充，見 AC-D7） |
  | 5 | `狀態` | 固定值下拉 | 衍生顯示值（`已公告`／`進度中`／`失效`／`作廢`）；既有語意不變 |
  | 6 | `程序書編號` | 可搜尋下拉 | `documentNumber` 等值（既有） |
  | 7 | `程序書書名內` | 可搜尋下拉 ＋ 可自由輸入 | **雙行為**：選取某選項→`documentName` **等值**；未選取而直接輸入文字→`documentName` **contains、不分大小寫**（見 AC-D3） |
  | 8 | `公告日期` | 起／迄兩個日期輸入 | `announcedDate` **閉區間**（含起日、含迄日）；兩端皆可留空；`announcedDate` 為 `null` 者於任一端有值時一律排除 |
  | 9 | `連結點程序書` | 可搜尋下拉 | 擁有指向該目標文件之 `DOCUMENT_LINK` 者（既有 `linkTargetId` 語意不變） |
  | 10 | `附錄` | 可搜尋下拉 | 選具體一份附錄（值＝`appendixId`）；納入條件＝該文件之 `DOC_APPENDIX` 含該 `appendixId` |
  | 11 | `使用表單` | 可搜尋下拉 | 選具體一份使用表單（值＝`formId`）；納入條件＝該文件之 `DOC_USAGE_FORM` 含該 `formId`；**選項 label ＝ `{編號} {名稱}`，無編號者僅名稱** |
  | 12 | `OJT` | 固定值下拉（三值） | `全部`（不施加限制，預設）／`有 OJT`（存在 `DOCUMENT_ATTACHMENT.type='OJT_SIGNIN'`）／`無 OJT`（不存在） |
  | 13 | `循環別` | 可搜尋下拉 | `lifecycleId` 等值；顯示以 `lifecycleDisplayName`（既有 AC-S2 不變） |

  - 🔴 **[2026-08-27 E11] 上表第 12 列（`OJT` 篩選）之比對語意已被 `OQ-E11-06`／[F042](F042-ojt-progress-management.md) `AC-04` 改寫**——比對鍵不再是「存在 `DOCUMENT_ATTACHMENT.type='OJT_SIGNIN'`」，改為衍生自「該文件之全部使用單位是否皆已完成」之聚合值，見 [§OJT 衍生語意 delta](#ojt-derived-semantics-delta) `AC-J12`／`AC-J14`。**上表原文逐字保留。** ⚠ 三值或四值（是否新增「部分完成」）依 `OQ-E11-06` 裁決，**本輪未定**。
- **AC-D3**（「程序書書名內」雙行為與跳脫）：Given 池中有書名 `車輛分期進件作業` 與 `機車分期進件作業` 兩份文件, When 於 `程序書書名內` **選取**「車輛分期進件作業」, Then 僅回傳該一筆（等值）；When 改為**僅輸入** `進件` 而未選取任何選項, Then 兩筆皆回傳（contains）；When 輸入 `進件作業` 之大小寫混合形式（如含英數時之 `AbC`）, Then 比對不分大小寫。<br>Given 輸入字串含 `%`、`_` 或 `'`, When 送出, Then 於 SQL `LIKE` 路徑正確跳脫——`%` 與 `_` **以字面比對**（不作萬用字元）、`'` 不造成錯誤或注入；查詢正常回傳（比照 [F019](F019-public-list-browsing.md) 既有跳脫要求）。
- **AC-D4**（公告日期區間邊界）：Given 三筆文件之 `announcedDate` 分別為 `2026-01-01`／`2026-01-15`／`2026-02-01`、另一筆為 `null`, When 以區間 `2026-01-01` ～ `2026-01-15` 查詢, Then 恰回傳前兩筆（**兩端皆含**）；When 僅填起日 `2026-01-15`, Then 回傳後兩筆；When 僅填迄日 `2026-01-15`, Then 回傳前兩筆；四種情形下 `announcedDate = null` 之該筆**皆不回傳**。
- **AC-D5**（OJT 三值）：Given 文件 A 有 `OJT_SIGNIN` 附件、文件 B 無, When `OJT = 全部`, Then A、B 皆回傳；When `OJT = 有 OJT`, Then 僅 A；When `OJT = 無 OJT`, Then 僅 B。
  - 🔴 **[2026-08-27 E11] `AC-D5` 之三值語意已被 `OQ-E11-06` 改寫**（A 案＝三值保留、字面改為「全部／全部完成／未全部完成」語意；B 案＝**反轉為四值**、新增「部分完成」），見 [§OJT 衍生語意 delta](#ojt-derived-semantics-delta) `AC-J14`。**原條文逐字保留於上。** ⚠ 其 Given 之 fixture 形狀（「文件 A **有** `OJT_SIGNIN` 附件」）於新模型下**不再可建構**——改以「文件 A 之全部使用單位皆已完成」表述。
- **AC-D6**（附錄／使用表單選具體一份）：Given 附錄 X 被文件 A、B 引用、附錄 Y 僅被 C 引用, When `附錄 = X`, Then 回傳 A、B 且不含 C；使用表單同構（以 `formId` 比對）。
- **AC-D7**（🔴 當責室長主要∪次要；與前台一致）：Given 文件 A（`primaryChiefId='E001'`、`secondaryChiefIds=[]`）與文件 B（`primaryChiefId='E009'`、`secondaryChiefIds=['E001']`）, When 以 `當責室長 = E001` 篩選, Then **A 與 B 皆回傳**。<br>📝 **2026-08-16 使用者裁決推翻既有實作語意，理由：OQ-D18-08 要求前後台兩處語意一致**——spec-writer 於 2026-08-16 實地核對 `backend/src/documents/document-list-query.ts:57`（`filters.primaryChiefId !== r.primaryChiefId`）與 `frontend/src/pages/DocumentListPage.tsx:170`（`d.primaryChiefName ?? d.primaryChiefId`），確認**後台現況僅比對主要室長**。本條將其擴為主要∪次要（**嚴格超集**：既有「以主要室長篩選能找到該文件」之期望值不反轉，僅新增次要命中之情形）。與 [F019](F019-public-list-browsing.md) `AC-D7` 為同一語意之兩處斷言，**必須同批實作、不得只改一處**。<br>下拉選項清單相應改為「全體文件之 `primaryChiefId` ∪ `secondaryChiefIds`」之 distinct。
- **AC-D8**（清除全部篩選；🔴 **2026-08-21 就地擴充**）：Given 已套用任意數量之篩選, When 點擊「清除全部篩選」, Then **13 項篩選、關鍵字與節點子樹 chip 三者同時清空**（含自網址移除 `lifecycleId`／`nodeSubtreeId` 兩參數）、清單回復未篩選狀態與預設排序、分頁回第 1 頁。
  <br>📝 **OLD>「13 項篩選與關鍵字同時清空」**（未涵蓋 chip）。<br>🔴 **擴充理由**：按鈕字面是「清除全部篩選」，清完卻仍有一條 chip 在縮小結果集，**畫面與文字自相矛盾**。<br>⚠ **反向不成立**——chip 自己的 ✕ **只**清 chip、不動那 13 項與關鍵字（清除之**方向性不對稱**，見 `AC-T46`）。
- **AC-D9**（🔒 清單欄位回歸鎖定）<br>📝 **2026-08-18 範圍縮減**：本條之「各欄顯示規則逐項不變」自該日起**排除第 12 欄「連結點程序書」**（改為摺疊呈現，權威＝`AC-E1`～`AC-E9`）；其餘 13 欄仍逐項鎖定。<br>📝 **2026-08-20 範圍再次縮減**：本條之「**欄位集合**」自該日起改讀為「**既有 14 欄之集合與其相對順序**」——最左新增之「OJT」圖示欄為 `OQ-D9-25`（選項 A）核可之 additive 變更，**不視為違反本條**（權威＝`AC-N37`～`AC-N40`）。**除該新增欄外，欄位集合仍不得增減、既有 14 欄之相對順序仍不得變動。**<br>Given 本 delta 實作完成, When 檢視清單, Then **既有 14 欄之欄位集合、其由左至右之相對順序與各欄顯示規則逐項與本 delta 導入前相同**——本 delta **僅動篩選、不動欄位**；3 張統計卡、排序與分頁行為亦不變；既有 AC 與 `AC-S1`／`AC-S2` 維持綠燈。

- **AC-D10**（🔴 篩選區之逐字文案與選擇器契約；**2026-08-16 補訂**，權威＝`prototypes/13-document-list.html`）：Given 後台文件清單頁渲染完成, When 檢視篩選區, Then 下列文案與選擇器**逐字成立**——
  | 項目 | 逐字值 | 說明 |
  |---|---|---|
  | 篩選區容器 | DOM id `filterBar` | 桌面多列 grid 之容器 |
  | 各 combobox 輸入框 | DOM id `cbD_{key}_input`；`role="combobox"`、`aria-label` ＝該篩選之逐字 label | `{key}` 為該篩選之鍵 |
  | 各 combobox 清除鈕 | DOM id `cbD_{key}_clear`；`aria-label` ＝ `清除{label}`（如 `清除制定公司`） | 僅於該篩選有值時可見 |
  | 一般 combobox 之 placeholder | `全部` | 除 `程序書書名內` 外之九項 |
  | `程序書書名內` 之 placeholder | `全部（或直接輸入部分書名）` | 使 `AC-D3` 之雙行為在 UI 上可見 |
  | `狀態` 下拉之預設選項 | `全部` | ＝不施加限制 |
  | `OJT` 下拉之三選項 | `全部`／`有 OJT`／`無 OJT` | 同 `AC-D2` 第 12 列與 `AC-D5` |
  | `公告日期` 兩輸入 | `aria-label` 分別為 `公告日期 起日`／`公告日期 迄日`；DOM id `cbD_date_from`／`cbD_date_to`；外層 `role="group"` 且 `aria-label` ＝ `公告日期` | `type="date"` |
  | 清除全部篩選鈕 | 可見文字 `清除全部篩選` | 桌面與行動 sheet 各一 |
  | 行動底部 sheet | 標題 `篩選條件`；主要動作鈕 `套用`；關閉鈕 `aria-label` ＝ `關閉篩選` | < md 斷點 |

  📌 **本條之存在理由**：`AC-D1`～`AC-D9` 只規範**行為與順序**，未定義任何**文案與選擇器**。本輪之約束環為簡化版（僅 jest/vitest、無 Playwright fidelity）⇒ **AC 是唯一防線**；未入 AC 之選擇器，test-generator 只能自行臆造，測出來之物與畫面對不上。本 repo 已於 F041 帳號清單角色徽章吃過同一形狀之虧（prototype 有寫、AC 漏寫、缺陷因此逃出約束環）。

  - 🔴 **[2026-08-28 E11] 上表「`OJT` 下拉之三選項」列已改為四選項**（`OQ-E11-06`→**B**），第四選項之逐字值以 `prototypes/13-document-list.html` 為權威（⚠ **該 prototype 尚未改版**），見 [§OJT 衍生語意 delta](#ojt-derived-semantics-delta) `AC-J14`。📌 **本項為 spec-writer 追加登記**——`AC-D5` 改四值而本表之三選項不動，兩條會直接互相矛盾。**上表其餘 11 列逐字不變。**

### 連結點程序書欄摺疊 delta（🔴 2026-08-18 使用者體驗缺失；權威＝`prototypes/13-document-list.html` 檔頭 2026-08-18 區塊 ①～⑨） {#link-cell-collapse-delta}

> **缺失原文**（使用者回報）：「文件清單，當連結點程序書有多份時，會造成畫面排版被嚴重上下拉伸。是否應考慮用 hover 顯示連結點程序書名稱取代程序書編號直接顯示在清單上，另外多本時是否應該用 … 來表示，而非完整呈現每一本在清單上？」
> **成因**：第 12 欄原為 `flex-wrap` ＋每連結一顆 pill，欄寬僅容一顆（等寬字編號約 110px）⇒ 一個連結換一行，5～6 個連結之列被拉伸成 5～6 行高。實測資料庫 591 筆分佈：0 個 586 筆／1 個 2 筆／2 個 1 筆／5 個 1 筆／6 個 1 筆。
> **裁決**（2026-08-18 人類核可）：① **不**採「以書名取代編號」——中文書名長度不定會再度拉伸，且編號才是對照／篩選之鍵值；維持「編號可見、書名 hover」。② 採「多筆摺疊」，但**不得**是純 `…`＋hover——這些 pill **是動作**（點擊＝下載該連結點程序書之 PDF），純 tooltip 會使被摺疊者無法點擊、鍵盤到不了、觸控看不到＝功能消失；故摺疊入口必須是**可點的 `+N` 按鈕**。
> **本 delta 之 AC 編號採 `AC-E#`**（E＝2026-08-18 ergonomics delta），與既有 `AC-S#`／`AC-D#` 區隔、不重號。

- **AC-E1**（三態與恆一行高）：Given 後台文件清單已載入, When 檢視第 12 欄「連結點程序書」之收合態, Then 該格**恆為一行高**（容器為單行 flex ＋ `whitespace-nowrap`，**不得**使用 `flex-wrap`），且依連結數呈現三態——**0 個**＝逐字 `—`（`<span class="text-slate-300">—</span>`，既有行為不變）／**1 個**＝單顆 pill 且**不出現** `+N` 徽章／**N ≥ 2**＝**只顯示第一顆 pill** ＋ 一顆 `+{N−1}` 徽章。Given 同頁存在 0／1／2／6 個連結之列, When 量測各列高度, Then 收合態各列高度**彼此相等**（連結數不影響列高）。
- **AC-E2**（pill 之可見文字與 tooltip）：Given 某連結之目標為 `{編號} {書名}`, When 呈現收合態之 pill, Then 其**可見文字恰為編號**（不含書名），其 `title` 逐字為 `下載連結點程序書：{編號} {書名}`（既有逐字字串不變）。
- **AC-E3**（`+N` 為真按鈕）：Given 某列有 N ≥ 2 個連結, When 呈現 `+{N−1}` 徽章, Then 其為 `<button>`（可 focus、可鍵盤 Enter／Space 觸發、可觸控），**非**僅具 hover tooltip 之 `<span>`；其 `title` 逐字為 `其餘 {N−1} 個：{編號}、{編號}…`（僅編號、以全形頓號分隔、順序同展開後第 2 列起），其 `aria-label` 逐字為 `展開其餘 {N−1} 個連結點程序書`，並帶 `aria-expanded="false"`。
- **AC-E4**（就地展開、非浮層）：Given 收合態之 `+N`, When 點擊（或以鍵盤觸發）, Then **該列就地展開**（in-place），該格改為逐列列出**全部 N 個**連結（含第一顆），每列逐字結構為 `編號 · 書名 · 下載鈕`；第一列尾端之「收合」鈕與 `+N` 為**同一顆 toggle**（`aria-expanded="true"`、`aria-label` 逐字 `收合連結點程序書`），再次觸發即回到收合態。<br>🔴 **不得**改以 popover／dropdown 浮層實作：表格外層為 `overflow-x-auto` ＋ `rounded-xl overflow-hidden`，絕對定位浮層會被裁切。
- **AC-E5**（展開狀態逐列獨立且不錯位）：Given 展開列 A, When 檢視同頁其他列, Then 其餘各列維持收合態之一行高（展開只影響被觸發的那一列），且**可同時展開多列**。Given 已展開列 A, When 改變任一篩選、清除全部篩選或換頁而重繪清單, Then 展開狀態**不得**落到其他列上——狀態鍵須為**列身分**（prototype 為文件編號 `d.num`、實作為 `documentId`），**不得**為列索引。
- **AC-E6**（篩選命中者排第一顆）：Given `連結點程序書` 篩選已選定某目標文件、某列因擁有指向該目標之連結而入選, When 呈現該列收合態, Then **命中的那一筆排為第一顆**（＝收合態唯一可見的那顆），其餘依原順序接續於 `+N` 之內。<br>🔒 本條**只改顯示順序**：`連結點程序書` 篩選之**比對語意本身完全不變**（既有 `linkTargetId` 語意，見 `AC-D2` 第 9 列）。
- **AC-E7**（下載路徑不變）：Given 收合態之 pill 或展開態任一列之下載鈕, When 點擊, Then 一律走**既有受控（稽核）下載路徑**——取目標文件之附件清單 → 取其 `ICSOP_PDF` → 同一支代理串流下載端點（[F020](F020-watermark.md#front-burn-scope-delta) `AC-D3a` 後台側；⚠ **2026-08-20 起該端點亦燒錄浮水印**，見 [F020 §backend-burn-delta](F020-watermark.md#backend-burn-delta) `AC-N14`）〔📝 本連結原誤指不存在之 `F020-watermark-viewer.md`，2026-08-20 順手更正，語意未變〕；**不得**新增第二條下載路徑，浮水印與否仍由伺服器端決定、前端不帶旗標。目標文件無 ICSOP PDF／取用失敗時，以既有錯誤提示（toast）呈現且不崩潰。<br>📝 **2026-08-27 就地精確化**：本條末句之「目標文件無 ICSOP PDF」自該日起**只涵蓋 `targetHasPdf` 未知（缺鍵）或載入後才失效之殘餘情形**——已知無 PDF 者於**點擊之前**即以無檔案態呈現、且點擊之提示須說明原因，權威＝[§連結點無 PDF 事前標示 delta](#link-no-pdf-delta)（`AC-E10`～`AC-E13`）。**下載路徑本身逐字不變**（本條前半全文續為有效）。
- **AC-E8**（DOM 契約；供約束環定位，權威＝prototype）：Given 第 12 欄渲染完成, When 檢視 DOM, Then 下列屬性逐字成立——收合態／展開態之容器帶 `data-link-cell`、`data-link-count="{N}"`、`data-link-expanded="false|true"`；toggle 鈕帶 `data-link-toggle="{列身分鍵}"`；展開態每一連結列帶 `data-link-item`。<br>📌 **本條之存在理由**：同 `AC-D10`——本輪約束環為簡化版（僅 vitest／jest，Playwright 僅驗表頭），未入 AC 之選擇器只能由 test-generator 臆造，測出來之物會與畫面對不上。
- **AC-E9**（🔒 回歸鎖定）：Given 本 delta 實作完成, When 檢視清單, Then **14 欄之欄位集合與由左至右順序不變**、**第 12 欄以外之 13 欄顯示規則逐項不變**、3 張統計卡／13 項篩選（含各項比對語意）／排序／分頁行為一律不變；既有 AC 與 `AC-S1`／`AC-S2`／`AC-D1`～`AC-D10` 除 `AC-D9` 就「第 12 欄顯示規則」一項之範圍外，全數維持綠燈。<br>📝 **2026-08-20 範圍縮減**：本條之「14 欄之欄位集合與由左至右順序不變」自該日起同 `AC-D9` 改讀為「**既有 14 欄**之集合與其**相對**順序不變」——最左新增之「OJT」圖示欄不視為違反（`OQ-D9-25` 選項 A，權威＝`AC-N37`～`AC-N40`）。

### 連結點無 PDF 事前標示 delta（🔴 2026-08-27 使用者回報缺失；權威＝`prototypes/13-document-list.html` 檔頭 2026-08-27 區塊 ⑩～⑬） {#link-no-pdf-delta}

> **缺失原文**（使用者回報）：「ICSOP 文件管理：在清單頁點擊下載連結點程序書時，出現無法下載的問題」。
> **成因（2026-08-27 dev 環境實測查證，非推測）**：下載機制**本身沒有壞**——對已上傳 ICSOP PDF 之目標實跑兩段流程（`GET /admin/documents/{id}/attachments` → `GET /documents/attachments/download`）回 `200`／`application/pdf`／2,144,214 bytes（已燒錄浮水印）。真正失敗的是**目標文件根本沒有上傳 ICSOP PDF**：附件清單回 `[]` ⇒ 前端走到「找不到 `ICSOP_PDF`」分支，只丟一句沒有原因的 `無法下載「{編號} {書名}」`。實測資料：591 份程序書僅 **7 份**有 ICSOP PDF；15 筆連結中 **11 筆**之目標無 PDF；5 個有連結的列裡有 **3 列**之「收合態唯一看得到的那顆 pill」一點就失敗。
> **判定**：這不是下載端點的缺陷，而是**第 12 欄承諾了它多數時候做不到的事**——清單回應（`DocumentLinkView`）從未帶過「目標有沒有 PDF」，所以 UI 無從事前標示，使用者只能點下去才知道，而且知道的還只是「無法下載」四個字。同頁「檔案」欄早有正確前例：沒有 PDF 就顯示 `—`，不畫下載鈕。
> **裁決**（2026-08-27 使用者核可，選項＝「事前標示＋說明原因」）：① 後端補 `targetHasPdf`；② 無 PDF 之連結點改為**無檔案態**（仍可點、可 focus）；③ 點擊之提示改為說明原因。**不**改變 pill 之動作語意（維持「下載」，不改成「前往該文件」），亦不動下載路徑。
> **本 delta 之 AC 編號沿用 `AC-E#` 序列**（接於 `AC-E9` 之後，自 `AC-E10` 起），與 `AC-S#`／`AC-D#`／`AC-N#`／`AC-T#` 區隔、不重號。

- **AC-E10**（後端補「目標有無 ICSOP PDF」）：Given 後台清單 `GET /admin/documents` 與 `GET /admin/documents/:id/links` 之回應, When 檢視其 `links[]` 元素, Then 每個元素帶 `targetHasPdf`：目標文件**有** `ICSOP_PDF` 附件 → `true`；**無** → `false`。<br>🔴 **不得引入 N+1**：本欄須以**固定次數**之批次查詢取得（手法同 `hasOjt` 之 `findManyByType` 批次），往返數與列數／連結數無關——與 `AC-N40` 之效能前提同一條紅線。<br>⚠ **`undefined` ≠ `false`**：附件來源不可用（未注入 attachmentStore）時**須省略本鍵**（＝未知），**不得**降級寫成 `false`。此處刻意與同檔 `hasOjt` 之「缺鍵視同 `false`」相反，理由見 `AC-E12`。
- **AC-E11**（無檔案態之呈現與可操作性）：Given 某連結點之 `targetHasPdf === false`, When 呈現其收合態 pill 或展開態之按鈕, Then ① 圖示為 `file-x-2`、文字色為 `text-slate-400`（沿用同頁「無 OJT」之既有語彙，**不得**引入新圖示或新色票）；② 其 `title` 逐字為 `連結點程序書：{編號} {書名}（尚未上傳 ICSOP PDF，無法下載）`；③ **仍為真正的 `<button>`**——可 focus、可鍵盤 Enter／Space 觸發、可觸控，且**不得**帶 `disabled`、**不得**改成 `<span>`；④ 點擊時**不呼叫**任何附件或下載端點，只顯示逐字為 `「{編號} {書名}」尚未上傳 ICSOP PDF，無法下載` 之 toast。<br>📌 **③ 之存在理由**：F024 匯出鈕已就同一件事裁定過——`disabled` 的鈕不能 focus、讀不到 tooltip、觸控裝置上按了毫無反應，使用者只會覺得「壞了」，而不是「這份還沒上傳」。事前提示**不得**以 `disabled` 實作。
- **AC-E12**（未知一律當成有 PDF）：Given 某連結點之 `targetHasPdf` 為 `undefined`（缺鍵；舊版回應或附件來源不可用）, When 呈現該連結點, Then 其外觀與行為**逐字等同 `true`**（既有可下載之 pill／下載鈕，`title` 仍為 `下載連結點程序書：{編號} {書名}`），點擊仍走 `AC-E7` 之既有下載路徑；若該路徑最終取不到 PDF，其 toast 亦須為 `AC-E11` ④ 之逐字說明字串（不再是泛用之「無法下載」）。<br>📌 **本條之存在理由**：猜錯的代價不對稱。把「其實下載得到」的連結點標成不可下載是**新製造**的缺失（使用者從此不會去點）；把「其實沒有」的畫成可下載，最壞只是退回本 delta 前的行為，而且點下去仍有說明。
- **AC-E13**（DOM 契約；供約束環定位，權威＝prototype）：Given 第 12 欄渲染完成, When 檢視 DOM, Then 無檔案態之按鈕帶 `data-link-no-pdf`；`targetHasPdf` 為 `true` 或 `undefined` 之按鈕**不得**帶此屬性。<br>📌 **本條之存在理由**：同 `AC-D10`／`AC-E8`／`AC-N39`。
- **AC-E14**（🔒 回歸鎖定）：Given 本 delta 實作完成, When 檢視清單, Then ① **15 欄之欄位集合與由左至右順序逐字不變**；② 第 12 欄之**三態、恆一行高、`+N` 摺疊、就地展開、逐列獨立之展開狀態、篩選命中者排第一顆**（`AC-E1`～`AC-E6`）與 `AC-E8` 之 DOM 契約**逐項不變**——本 delta **只換 pill／下載鈕之兩種樣態，不動摺疊行為**；特別是**無檔案態之列高須與有 PDF 之列完全相等**（`AC-E1` 之恆一行高不因新樣態而破）；③ `AC-E7` 之下載路徑（附件清單 → `ICSOP_PDF` → 同一支代理串流端點）逐字不變，**不得**新增第二條下載路徑；④ 13 項篩選（含 `連結點程序書` 之比對語意）／3 張統計卡／排序／分頁行為一律不變；⑤ 🔴 回應形狀之既有欄位逐字不變——`targetHasPdf` 為 `DocumentLinkView` 之 **additive 選填欄**，既有消費者忽略未知欄位即可。

### OJT 圖示欄 delta（🔵 2026-08-20 使用者裁決；缺失／變更 delta 第 9 項） {#ojt-icon-column-delta}


> 前提裁決（逐題紀錄見 [open-questions §D9](../open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)）：
> **`OQ-D9-25`→選項 A**（清單**新增獨立欄**置於最左；表格已有 `overflow-x-auto` 可吸收欄寬）〔lead 預設〕｜
> **`OQ-D9-26`→選項 A**（沿用既有 OJT 篩選下拉之字面 `有 OJT`／`無 OJT` 作為 `title`／`aria-label`，圖示以兩種視覺狀態呈現）〔lead 預設〕。
>
> 📌 **純前端顯示變更**：資料已就緒（`hasOjt`），**不新增後端欄位、不新增查詢、不改變任何 API 契約**。
> 📌 **逐字文案與 DOM 掛鉤由 spec-writer 定稿，ui-ux-designer 逐字照抄**（比照 [F018](F018-usage-form-management.md#edit-number-action) 之既有慣例；本輪為簡化版約束環＝僅 jest／vitest，未入 AC 之選擇器 test-generator 只能臆造）。

- **AC-N37**（欄位存在與位置）：Given 後台 ICSOP 文件清單頁載入完成, When 檢視表頭, Then **第 1 個 `<th>`（最左）之可見文字逐字為 `OJT`**，其後接續之 14 個表頭依序為 `制定公司`／`制定部門`／`制定室別`／`當責室長`／`狀態`／`檔案`／`樹狀圖`／`程序書編號`／`程序書書名`／`版次`／`內容摘要`／`連結點程序書`／`公告日期`／`循環別`（＝既有 14 欄，順序不變）；表頭總數為 **15**。
  - 🔵 **[2026-08-27 E11] `AC-N37` 維持有效、不反轉**——[F042](F042-ojt-progress-management.md) **只改本欄之值從哪裡來，不改欄位之存在與位置**；15 欄之集合與順序逐字不變（回歸鎖定重申見 [§OJT 衍生語意 delta](#ojt-derived-semantics-delta) `AC-J15`）。
- **AC-N38**（🔴 三態渲染與逐字無障礙文案）：Given 同頁存在三列文件，其 `hasOjt` 分別為 `true`、`false` 與**缺鍵**（`undefined`）, When 渲染各列之 OJT 儲存格, Then——
  - ① `hasOjt === true` → 圖示 icon 鍵為 **`file-check-2`**，其 `title` 與 `aria-label` **皆逐字為 `有 OJT`**；
  - ② `hasOjt === false` → 圖示 icon 鍵為 **`file-x-2`**，其 `title` 與 `aria-label` **皆逐字為 `無 OJT`**；
  - ③ `hasOjt === undefined`（後端未回該鍵）→ **視同 `false`**，渲染與 ② **完全相同**（`file-x-2` ＋ `無 OJT`）——見 `documents.store.ts:135-138` 之既有註解（缺鍵＝無 OJT）；**不得**渲染為空白、`—`、`null` 或第三種視覺狀態。
  - 📌 **兩態之字面值刻意逐字沿用既有 OJT 篩選下拉之選項文字**（`AC-D2` 第 12 列與 `AC-D5` 之 `有 OJT`／`無 OJT`），使畫面上「篩選出來的東西」與「欄位顯示的東西」用同一組詞；**不得**另造 `已上傳`／`未上傳` 之類新詞。
  - 📌 **兩態之視覺區別（顏色／填色）屬設計裁量、不入 AC**；本條只約束「icon 鍵不同 ＋ 無障礙名稱不同」此二可觀測事實。
  - 📌 **2026-08-20 第三輪明文歸類（來源＝`docs/ui-ux-design-overview.md` §A.6.7）**：ui-ux-designer 為容納本欄而調整之**欄寬數值**——OJT 欄 `min-w-[56px]`、檔案欄 `min-w-[160px]`、表格 `min-w-[1560px]` → **`min-w-[1724px]`**——**經 spec-writer 判定為設計裁量，刻意不入 AC**。<br>**理由**：① 它們是**版面調校數值**而非行為契約，與本節既有之「顏色／填色不入 AC」同類；② 若入 AC，任何一次欄寬微調都會使測試轉紅，而該轉紅**不指向任何缺陷**（高噪訊比之脆弱斷言）；③ 真正需要保護的性質是「新增欄不得造成橫向截斷」，而該性質已由 `OQ-D9-25` 之前提裁決（表格已有 `overflow-x-auto` 可吸收欄寬）與 `AC-N40` 之欄位集合鎖定共同涵蓋。<br>⚠ **本註記之目的是讓「不入 AC」成為一個有紀錄的決定**，而非讓該項目在 §A.6.7 與規格之間靜默消失。
  - 🔴 **[2026-08-27 E11] `AC-N38` 之計算來源已被 [F042](F042-ojt-progress-management.md) `AC-04` 改寫**，見 [§OJT 衍生語意 delta](#ojt-derived-semantics-delta) `AC-J12`／`AC-J13`。⚠ **③「`undefined` 視同 `false`、不得渲染第三種視覺狀態」於 `OQ-E11-06` B 案下被推翻**（需新增「部分完成」態之 icon 鍵與逐字文案，**TBD by prototype 13**）；A 案下 ①②③ 之外觀與文案**逐字不變**，變的只有底層布林值怎麼算出來。**原條文逐字保留於上。**
- **AC-N39**（DOM 契約；供約束環定位，權威＝`prototypes/13-document-list.html`）：Given 第 1 欄渲染完成, When 檢視 DOM, Then 下列屬性**逐字成立**——該儲存格帶 `data-ojt-cell`，並帶 `data-has-ojt="true"`（`hasOjt === true`）或 `data-has-ojt="false"`（`false` 與 `undefined` 兩種輸入**皆為 `"false"`**）。<br>📌 **本條之存在理由**：同 `AC-D10`／`AC-E8`——本輪約束環為簡化版（僅 vitest／jest），未入 AC 之選擇器只能由 test-generator 臆造，測出來之物會與畫面對不上。
  - 🔴 **[2026-08-28 E11] `AC-N39` 之 `data-has-ojt` 值域由二值擴為三值**（`OQ-E11-06`→**B**），三個逐字字面以 `prototypes/13-document-list.html` 為權威（⚠ **該 prototype 尚未改版，test-generator 不得臆造**），見 [§OJT 衍生語意 delta](#ojt-derived-semantics-delta) `AC-J13`。🔒 **掛鉤名 `data-ojt-cell`／`data-has-ojt` 兩者逐字不變。**
- **AC-N40**（🔒 回歸鎖定）：Given 本 delta 實作完成, When 檢視清單, Then ① **既有 14 欄之欄位集合、相對順序與各欄顯示規則逐項不變**（新增欄位僅插入於最左，`AC-D9`／`AC-E9` 之範圍已就地縮減）；② **13 項篩選之組成、順序與各項比對語意逐字不變**——特別是既有「OJT」篩選下拉（`AC-D2` 第 12 列、`AC-D5`、`AC-D10` 之三選項 `全部`／`有 OJT`／`無 OJT`）**一字不動**，本 delta **只加顯示欄、不動篩選**；③ 3 張統計卡／排序／分頁行為不變；④ 既有 AC 與 `AC-S1`／`AC-S2`／`AC-D1`～`AC-D10`／`AC-E1`～`AC-E9` 全數維持綠燈（除 `AC-D9`／`AC-E9` 就「欄位集合」一項之已宣告範圍縮減外）。<br>⚠ **不得新增任何後端查詢**：`hasOjt` 於既有批次查詢中已取得（`documents.store.ts:135-142`），本 delta 若引入第 4 次查詢或 N+1，即違反 [NFR-001](../nfr.md#performance) 與 `AC-D9` 之既有效能前提。
  - 🔴 **[2026-08-27 E11] `AC-N40` ② 之「既有 OJT 篩選下拉一字不動」子句已失效**（篩選之比對語意必然隨 [F042](F042-ojt-progress-management.md) `AC-04` 改變），見 [§OJT 衍生語意 delta](#ojt-derived-semantics-delta) `AC-J14`。🔒 **①③④ 與末段之「不得新增任何後端查詢／不得引入 N+1」效能紅線逐字續為有效**——⚠ **`hasOjt` 改為跨 `DOC_USING_DEPT` × 場次之聚合後，正是最容易在此處退化為 N+1 之處**，見 [§OJT 衍生語意 delta](#ojt-derived-semantics-delta) `AC-J15`。

### OJT 衍生語意 delta（🔴 2026-08-27 E11；權威＝[F042](F042-ojt-progress-management.md)） {#ojt-derived-semantics-delta}

> **本節之性質**：本頁之 `OJT` 圖示欄（`AC-N37`～`AC-N40`）與 `OJT` 篩選（`AC-D2` 第 12 列／`AC-D5`／`AC-D10`）**外觀與位置不變**，**變的是底層那個布林值怎麼算出來**——
> 由「該文件是否有 1 份 `OJT_SIGNIN` 附件」（單一附件存在性）改為「**該文件之全部使用單位是否皆已完成 OJT**」（跨 `DOC_USING_DEPT` × 場次之聚合衍生值，[F042](F042-ojt-progress-management.md) `AC-04`）。
> **本 delta 之 AC 編號採 `AC-J#`**（配發表見 [F042 §庚](F042-ojt-progress-management.md#reversal-table)；🔴 **禁止續編 `AC-N77` 以後**）。
> ✅ **2026-08-28 人類閘門：`OQ-E11-06`→**B**（四值含「**部分完成**」：**清單第 1 欄圖示三態 ＋ 篩選四值**）。本節之 A／B 分支已全數收斂。
> 🔴 **`AC-N38` ③「不得渲染第三種視覺狀態」自此被明確推翻**；`AC-N39` 之 `data-has-ojt` **值域由二值擴為三值**（掛鉤名不變）；`AC-D5`／`AC-D10` 由三值改**四值**。
> 🔴 **第三態之 icon 鍵與三／四個逐字文案，權威＝`prototypes/13-document-list.html`**——⚠ **ux-ojt 本輪之 `13` 版面一字未動**（其依 (A) 案作業），**現須改版**；在其定稿前，test-generator **不得**臆造字面。逐項見 [F042 §待同步清單 乙-2](F042-ojt-progress-management.md#post-decision-sync)。
> 📌 **逐條反轉之單一真相來源＝[F042 §既有行為反轉總表](F042-ojt-progress-management.md#reversal-table) 丙節**；本節為其落點，不得與之分歧。

- **AC-J12**（🔴 `hasOjt` 之計算來源改為衍生、**型別由布林改為三值**）：Given 文件 `D1` 之**有效**使用單位為 3 個, When 後端計算清單回應之 OJT 狀態欄, Then 其值**恆等於** [F042](F042-ojt-progress-management.md) `AC-04` 之判定結果——3 個皆完成 ⇒ **`全部完成`**；1–2 個完成 ⇒ **`部分完成`**；0 個完成 ⇒ **`未完成`**；有效使用單位集合為**空** ⇒ **`未完成`**（[F042](F042-ojt-progress-management.md) Edge Cases 第 1 條之明文覆寫）。<br>✅ **回應形狀之型別與欄位名已定案（sa-ojt）**：`DocumentListItem.hasOjt`（`boolean`，`frontend/src/api/types.ts:196-197`／`backend/src/documents/documents.store.ts:135-142`）**改名為 `ojtStatus`**、型別改為三值聯集 **`'all' | 'partial' | 'none'`**。<br>🔴 **改名之理由（非命名美學，是真值強制風險）**：`has` 前綴在三值字串下會使 `if (item.hasOjt)` 對 **`'partial'` 與 `'all'` 同為 truthy**，兩種狀態靜默合流——與本 repo 已記錄之 `every([])` 恆真、`hasOjt === undefined` 視同 `false` 屬同一類陷阱。<br>📌 **`AC-T45` 之「一致性優先於字面精確性」先例於此不適用**：該先例之前提是**型別未變**；本次型別由 `boolean` 換成三值聯集，既有消費者本就須逐一改，「維持舊名可省遷移成本」之論點不成立。<br>🔒 **顯示逐字值（`已全部完成`／`部分完成`／`尚未開始`）與 `data-has-ojt` 之值域（`all`／`partial`／`none`）以 `prototypes/13` 為權威**（ux-ojt 已改版）。<br>🔒 **本值與 [F042](F042-ojt-progress-management.md) `AC-21` 之「已完成單位清單」必須共用同一套判定**，**不得**於清單端另寫一份聚合邏輯。<br>📌 **可測形狀（防第二套邏輯）**：對同一批 fixture，斷言「清單回應之 `hasOjt`」與「文件詳情之已完成單位清單長度 === 使用單位總數」**逐案一致**——比照 [F026](F026-role-field-matrix.md) `AC-U3` 之「兩函式對同一輸入逐案相等」既有慣例。
- **AC-J13**（🔴 清單第 1 欄之**三態**渲染與 DOM 契約——`AC-N38`／`AC-N39` 之處置；`OQ-E11-06`→**B** 定值）：Given 清單已載入, When 渲染 OJT 儲存格, Then ——① **恰三種視覺狀態**（`全部完成`／`部分完成`／`未完成`），各有其 icon 鍵與**互異**之 `title`／`aria-label`；② `data-ojt-cell` 與 `data-has-ojt` **掛鉤名逐字不變**，`data-has-ojt` 之**值域由二值擴為三值**。<br>🔴 **`AC-N38` ③ 之「不得渲染第三種視覺狀態」已被明確推翻。**<br>✅ **逐字定稿（ux-ojt，`prototypes/13` 已改版）**——<br>
  | 狀態 | icon 鍵 | 可見文字＝`title`＝`aria-label` | `data-has-ojt` |
  |---|---|---|---|
  | 全部完成 | `file-check-2`（emerald-600） | **`已全部完成`** | **`"all"`** |
  | 部分完成 | **`file-minus-2`**（amber-500，**本 delta 新增之 icon 鍵**） | **`部分完成`** | **`"partial"`** |
  | 尚未開始 | `file-x-2`（slate-300） | **`尚未開始`** | **`"none"`** |

  🔴 **`data-has-ojt` 之值域完全改換，`"true"`／`"false"` 不保留**（`AC-N39` 之二值就此作廢）。<br>　⚠ **舊值域之既有斷言會因此配對到 0 個元素而「大聲失敗」——這是刻意設計，不是副作用**：若保留 `"true"`／`"false"` 並讓 `"true"` 兼指 `all`，既有斷言會**繼續通過**，但其語意已從「有 OJT」悄悄變窄為「全部完成」＝**假綠**。**讓它爆掉，比讓它靜默改變意思安全。**<br>　📌 **本子條為 ux-ojt 明確要求入 AC 之項目**，理由如上。<br>🔴 **既有兩態字面 `有 OJT`／`無 OJT` 未被沿用**：`有 OJT` 在三值語意下已不精確（「部分完成」也算「有」）⇒ 三個字面**全部換新**。⚠ **既有測試中之 `有 OJT`／`無 OJT` 期望值必然轉紅，此為預期**。<br>⚠ **`undefined`（缺鍵）視同 `none`**（最保守值）——刻意與同表 `targetHasPdf` 之「`undefined` ≠ `false`」（`AC-E12`）相反，該既有不一致**已於 `AC-E12` 明文說明理由（猜錯代價不對稱），不得順手統一**。<br>🔒 **`AC-N38` ③ 之另一半逐字續為有效、未被推翻**：缺鍵**不得**渲染為**空白**、`—` 或 `null`——本 delta 改變的**只有**其落點（由「視同 `false`」改為「視同 `none`」），該禁令本身不動。<br>　⚠ **`AC-N38` ③ 是一條複合子句**（「視同 false」＋「不得空白／`—`／`null`」），**只有前半被 `OQ-E11-06`→B 推翻**；整條作廢會連帶撤掉一個仍然有效的防線（ux-ojt 已於 `prototypes/13` 保留該行為，**資料位元組完全未動、僅改其後之註解**）。
- **AC-J14**（🔴 `OJT` 篩選改**四值**——`AC-D2` 第 12 列／`AC-D5`／`AC-D10` 之改寫；`OQ-E11-06`→**B** 定值）：Given 使用者選定 `OJT` 篩選值, When 後端執行查詢, Then 其選項**恰為 4 個**，逐字為 **`全部`**（不施加限制，預設）／**`已全部完成`**／**`部分完成`**／**`尚未開始`**（✅ ux-ojt 已定稿於 `prototypes/13`），各自回傳對應之文件集合。<br>🔒 **`AC-D10` 之「`OJT` 下拉之三選項」列相應改為四選項**（其餘 11 列逐字不變）。<br>🔒 **13 項篩選之組成、順序與其餘 12 項之比對語意逐字不變**（`AC-D1`／`AC-D2` 之另 12 列）——本 delta **只動 `OJT` 一項**。<br>🔒 **`OJT` 之預設值 `全部` 仍不計入「已套用篩選」之判定**（`AC-T47` 之既有規則不變）。<br>🔴 **既有測試之 fixture 必然轉紅且無法就地沿用**：`AC-D5` 之 Given（「文件 A **有** `OJT_SIGNIN` 附件、文件 B 無」）在新模型下**不再可建構**，須改以「文件 A 之全部有效使用單位皆已完成／文件 B 部分完成／文件 C 全未完成」**三筆** fixture 重寫（四值中三個非 `全部` 之值各需一個可命中之案例）。**此為預期之轉紅，非回歸；須就地改寫為新行為之背書、不得刪除**（比照 `AC-F17` 之既有處置慣例）。<br>🔴 **TAB2 之「完成狀態」篩選（[F042](F042-ojt-progress-management.md) `AC-13`）刻意與本條之四值不同**（`OQ-E11-18` 覆核定案）：TAB2 之列為 `documentId × orgCode`、**本質二值**，其篩選為**三選項**（`所有完成狀態`／`已完成`／`尚未完成`，取自 `AC-03` 之列徽章逐字）。<br>　📌 **四值屬「文件層」**（本條與 TAB1 區一之逐筆表 `data-doc-ojt-state`，兩者**共用同一組常數**）；**三值屬「列層」**。<br>　⚠ **兩軸刻意分離、不得互相對齊**——把「部分完成」放進 TAB2 會是一個**永遠選不出任何結果的死選項**（列自身沒有這個狀態）；反之把 TAB2 之三值套到本條，則失去「找出部分完成之文件」此一主要用途。
- **AC-J15**（🔒 回歸鎖定 ＋ 🔴 **效能紅線**）：Given 本 delta 實作完成, When 檢視清單, Then ① **15 欄之欄位集合與由左至右順序逐字不變**（`AC-N37`／`AC-D9`／`AC-E9`／`AC-E14` ①／`AC-N40` ①／`AC-T48` ① 全數維持綠燈）；② **13 項篩選之組成與順序逐字不變**，僅 `OJT` 一項之比對語意改變（`AC-D1` 不變）；③ 3 張統計卡／排序／分頁／空狀態行為不變；④ 第 12 欄之摺疊與無檔案態行為（`AC-E1`～`AC-E14`）**一律不變**。<br>🔴 **⑤ 效能紅線（本條之核心，不得省略）**：`hasOjt` 須以**固定次數之批次查詢**取得，**往返數與列數／使用單位數／場次數無關**——手法比照既有 `hasOjt`（`documents.store.ts:135-142`，於既有批次查詢中一次取得）與 `targetHasPdf`（`AC-E10` 之 `findManyByType` 批次）。<br>⚠ **本條是本 delta 最可能靜默退化之處**：原本只需查一張 `DOCUMENT_ATTACHMENT`，改為需要「每份文件之全部使用單位 × 各單位之場次數」之聚合——**最直覺的寫法就是逐列查一次，即 N+1**。違反者同時違反 [NFR-001](../nfr.md#performance)、`AC-N40` 末段與 `AC-E10` 之同一條紅線。<br>📌 **可測形狀**：以 50 筆文件 × 各 3 個使用單位之 fixture 驅動清單查詢, Then store 之查詢呼叫次數**與 1 筆文件時相同**（固定值，不隨列數成長）。

### 節點子樹篩選（deep link）delta（🔴 2026-08-21 使用者裁決；三項裁決第 3 項） {#subtree-filter-delta}

> **裁決逐字（人類，2026-08-21）**：[F036](F036-lifecycle-tree-preview.md) 之子樹抽屜新增導向鈕，導向 `/admin/documents?lifecycleId=..&nodeSubtreeId=..`，**後端新增子樹篩選參數**；本頁以**可清除的 chip** 呈現。
> **本 delta 之 AC 編號採 `AC-T#`**（T ＝ 2026-08-21 三項裁決；**跨三檔不重號**——`AC-T1`～`AC-T5` 屬 [F020](F020-watermark.md#line-height-delta)，`AC-T10`～`AC-T27` 屬 [F036](F036-lifecycle-tree-preview.md#subtree-drawer-delta)，`AC-T40`～`AC-T48` 屬本檔）。
> **權威＝ `docs/ui-ux-design-overview.md` §A.7.2／§A.7.3 ＋ `prototypes/13-document-list.html`**（已由 ui-ux-designer 傳播並經 lead 逐項驗收）。
> 🔒 **子樹為第 14 個篩選來源，但不進那 13 項**：`AC-D1`（13 項之組成與順序）／`AC-D2`（比對語意表）／`AC-D10`（篩選區文案與選擇器）／`AC-D9` ／`AC-N40` ② **逐字續為有效，本 delta 一字未動**——子樹以**獨立 chip** 承載，不新增第 14 個篩選控制項。
> 🔴 **本 delta 就地擴充 `AC-D8`**（清除全部篩選須連 chip 一起清），見該條。
> ⚠ **本輪之約束環為簡化版（僅 vitest／jest 單元＋元件測試，無 Playwright fidelity、無 e2e）**：以下每條 AC 皆須能於 jsdom／jest 斷死。

#### 後端：`nodeSubtreeId` 篩選參數

- **AC-T40**（參數語意）：Given `GET /admin/documents` 之查詢字串同時帶 `lifecycleId` 與 `nodeSubtreeId`（兩者皆能解析，見 `AC-T41`）, When 後端執行查詢, Then 僅回傳**同時滿足**下列兩條件之文件——① 其所屬循環 ＝ 該 `lifecycleId`；② 其**掛載節點 ∈ 以 `nodeSubtreeId` 為根之子樹**（該節點本身 ＋ 沿 parent→child 方向可達之全部後代，與 [F036](F036-lifecycle-tree-preview.md#subtree-drawer-delta) `AC-T14` 之 `descendants` **同語意**）。
  1. **未指派節點者（掛載節點為 `null`）一律排除**——它不屬於任何節點，自然不屬於任何子樹。📌 **實作上由 SQL `IN` 對 `NULL` 恆不匹配之語意自動滿足**，**不需**額外 `AND nodeId IS NOT NULL`（`architecture-spec.md` §12.3）；但**測試仍須存在**（以「有一筆未指派節點之文件」之 fixture 斷言其不出現）——這條的綠燈來自 SQL 語意而非防呆碼，正因如此更需要一條斷言把它釘住。
  2. 與既有 13 項篩選、關鍵字之關係為 **AND**（本條件僅縮小結果集，不放寬）。
  3. 套用後**分頁回第 1 頁**；3 張統計卡之數字依**篩選後**結果集衍生（既有規則不變）。
  4. 🔴 **子樹走訪之歸屬與落點（2026-08-21 就地補完；`architecture-spec.md` §12.1 決策 C1 ＋ §12.3 決策 C3）**：走訪使用**後端那一份** `descendants(edges, startId)`（`backend/src/lifecycle/lifecycle-tree-layout.ts`），其語意由 [F036 `AC-T28`](F036-lifecycle-tree-preview.md#subtree-drawer-delta) 之 F1–F5 固定向量釘死；解析結果以**已展開之節點 id 陣列**（`DocumentListFilters.nodeIdIn`，選填）下推為單一 SQL `IN` 條件。⚠ **store 不知道、也不需要知道這是「子樹」**——對它而言只是又一個 id 清單篩選（比照既有 `linkTargetId` 樣板）；圖走訪屬 service 層職責，**不得**混入 store。
  5. 🔴 **篩選條件與 `AC-T45` 之描述子必須來自同一次解析呼叫**：同一個解析函式回傳「`nodeIds` ＋ 描述子」或 `null`；成功 ⇒ 兩者同時設定，失敗 ⇒ 兩者同時不設定。**不得**存在兩條各自判斷「這個 `nodeSubtreeId` 解析得出來嗎」的路徑。<br>**斷言形狀**：對解析成功之案例，斷言「結果集已縮小」**且** `subtreeFilter !== null`；對 `AC-T41` 四種失敗案例，斷言「結果集等同未帶參數」**且** `subtreeFilter === null`——**兩件事必須寫在同一個案例裡**，分開寫就驗不到「篩選生效但描述子算錯」這一類分岔。
  <br>🔴 **禁止斷言「兩頁筆數相等」**：`prototypes/22` 與 `prototypes/13` 是**兩份獨立 mock 語料**，本輪刻意不對齊（`docs/ui-ux-design-overview.md` §A.7.6 ②：`lc1`／`a1` 之子樹在 `22` 為 8 份、跳到 `13` 只有 4 筆）。**AC 只鎖篩選語意**（同 `lifecycleId` 且掛載節點 ∈ 子樹）；斷言具體筆數相等鎖的是 mock 資料而非行為。**測試請以自備 fixture 驗語意**（例：子樹外之文件不出現、子樹內之文件全部出現、未指派節點者不出現）。
- **AC-T41**（🔴 兩參數恆成對；殘缺或無法解析 ⇒ **靜默 no-op**）：Given 下列任一情形——① 只帶 `lifecycleId`；② 只帶 `nodeSubtreeId`；③ `lifecycleId` 不存在／查無此循環；④ `nodeSubtreeId` 不屬於該 `lifecycleId` 之節點集合——, When 請求送出, Then **完全不施加子樹篩選**（回應等同於未帶該兩參數之請求）、**不回錯誤**（HTTP 仍為 `200`，**非** `400`／`404`）、且前端**不顯示 chip**。
  <br>📌 **理由（設計裁量，本條明文鎖定）**：deep link 是機器產生的；殘缺參數只可能來自手改網址或過期連結，對使用者跳錯誤訊息沒有意義。
  <br>⚠ **no-op ≠ 回 0 筆**：情形 ③④ 之期望是**回傳未篩選之完整清單**，不是空結果。此為最容易寫反的一條，請對四種情形**各建一個案例**，且每個案例**同時**斷言 `subtreeFilter === null`（`AC-T40` ⑤）。
  <br>🔒 `nodeSubtreeId` **不影響權限**：本頁既有之角色可視範圍（[F025](F025-role-function-matrix.md)「ICSOP 文件管理」）逐字不變；子樹篩選只縮小結果集，**不得**成為看見原本看不見之文件的途徑。
- **AC-T42**（🔒 `lifecycleId` 不寫入既有「循環別」篩選）：Given 帶兩參數進入本頁, When 檢視第 13 項篩選「循環別」之控制項, Then 其值**仍為未選取（`全部`）**，`AC-D10` 之 combobox 契約逐字不變。
  <br>📌 **理由**：若把 `lifecycleId` 灌進「循環別」，清 chip 時就得決定要不要連帶清掉使用者自己選的循環別——兩個來源會糾纏。**兩者互不寫入**，`AC-T46` 之方向性不對稱才成立。
- **AC-T43**（🔴 子樹解析為**後端**職責；前端不得自行走訪）：Given 前端取得兩個 URL 參數, When 發出清單請求, Then 前端**原樣**把兩參數帶上（`GET /admin/documents?lifecycleId=…&nodeSubtreeId=…&page=1`），**不得**於前端展開子樹。
  <br>🔴 **前端不得存在任何 DAG 鏡像表或子樹走訪**（`prototypes/13` 之 `NODE_DAG` 為**原型專用**，已於該檔明文標註「實作不得移植」）：前端若自己走訪一次，就會出現與 [F036](F036-lifecycle-tree-preview.md#subtree-drawer-delta) `AC-T14` **同型的分家**——樹狀圖說 7 個節點、清單按 6 個節點篩。**斷言形狀**：前端送出之請求參數逐字相符（`fetch`／API client 之 spy），且前端模組**不匯出**任何子樹走訪函式。<br>⚠ **本條與 [F036 `AC-T14`](F036-lifecycle-tree-preview.md#subtree-drawer-delta) ① 之修訂不衝突**：`AC-T14` ① 之「不得存在第二份」限**單一執行環境內**，後端依決策 C1 另有一份 `descendants()`（供本檔 `AC-T40` ④ 之篩選與 F036 之子樹端點**兩個呼叫端共用**）。**本條禁止的是「前端」再走訪一次**——前端唯一持有的子樹語意是醒目標示用的 `descendants()`，它**不得**被用來決定要送什麼參數或過濾清單結果。

#### 前端：chip 之呈現與清除

- **AC-T44**（chip 之逐字文案與選擇器契約；權威＝§A.7.2／§A.7.3）：Given 兩參數已由後端成功解析, When 本頁渲染完成, Then 下列**逐字成立**——
  | 掛鉤 | 逐字值／語意 |
  |---|---|
  | `#subtreeChipBar` | chip 列容器，位於篩選區與清單之間 |
  | `[data-subtree-chip]` | chip 本體（pill），**恰 1 個** |
  | `[data-subtree-chip-text]` | 逐字 `循環：{循環顯示名稱} · 節點子樹：{節點名稱}`（`循環：` 後**無空白**；`·` 兩側**各一個半形空格**）。🔴 **兩個代入值分別取自回應之 `subtreeFilter.lifecycleName` 與 `subtreeFilter.nodeName`**（`AC-T45`）——`lifecycleName` 之值即 `lifecycleDisplayName()` 之輸出，含子分類時為 `名稱（子分類）`（[F040](F040-lifecycle-subcategory.md) `AC-S1` 不變）；前端**不得**自行組字或另行查名 |
  | `nodeName` 為 `null` 時之 `{節點名稱}` | **`[ASSUMPTION]`** 逐字代入 `未命名節點`（沿用本專案既有慣例——`LifecycleTreePreviewPage` 之節點 `aria-label` 已為 `節點 ${n.name ?? '未命名節點'}`）。⚠ **此文案未經人類裁決**，見 [OQ-T3-08](../open-questions.md#t3-2026-08-21) |
  | `[data-subtree-chip-clear]` | chip 之 ✕ 清除鈕，`<button type="button">`，`aria-label` ＝ `title` ＝ 逐字 `清除節點子樹篩選` |

  🔴 **未套用時 chip 之整段內容不得存在於 DOM**：`queryBy` `[data-subtree-chip]` 為 `null`（**不得**以 `hidden` class／`display:none` 保留 chip 本體）。理由與 [F036 `AC-T18`](F036-lifecycle-tree-preview.md#subtree-drawer-delta) 相同——jsdom 不做版面計算，以 CSS 隱藏保留會讓「查無」與「隱藏」無法區分。
  <br>📝 **原型以 `#subtreeChipBar` 之 `hidden`／`flex` class 切換為靜態 HTML 之等價手段**（`prototypes/13:234, 460-461`）；**實作端採條件渲染**，此為兩種載體之必然差異，非文案或行為差異。
  <br>⚠ **chip 右側之說明文字 `由循環樹狀圖預覽帶入` 為設計裁量、刻意不入 AC**（純輔助說明，非行為載體；ui-ux-designer 已於 §A.7.2 第 12 列自行標明）。
- **AC-T45**（🔴 chip 之顯示與其內容以**後端解析結果**為準）：Given 前端無法自行解析子樹（`AC-T43`）, When 決定是否顯示 chip 及其文案中之 `{循環顯示名稱}`／`{節點名稱}`, Then 兩者皆取自**後端於清單回應中回傳之子樹描述子**；描述子為 `null`／缺席時 **chip 不渲染**（即 `AC-T41` 之 no-op 於畫面上的呈現）。
  <br>🔴 **描述子之具體契約（2026-08-21 就地補完；權威＝`architecture-spec.md` §12.3 決策 C3，`OQ-T3-04` 已結案）**——📝 本條前一版為「欄位名、巢狀位置＝system-architect 定，本 AC 只鎖來源與不渲染兩件事」，該留白已由 C3 填實：

  | 項目 | 契約 |
  |---|---|
  | 落點 | `GET /admin/documents` 回應之**頂層**（既有 `{items, total, page, pageSize, hasNext}` 之第 6 個欄位，**additive**） |
  | 欄位 | `subtreeFilter: { lifecycleId: string; lifecycleName: string; nodeId: string; nodeName: string \| null } \| null` |
  | 🔴 顯式 key | **恆為顯式 key，不省略**——不適用時值為 `null`。⚠ 前端仍須對「`null`」與「缺席」**兩種情形一視同仁**防禦性判斷（`AC-T41` 之 no-op 於畫面上即「chip 不渲染」） |
  | 🔴 `lifecycleName` 之值 | **`lifecycleDisplayName()` 之輸出**（含子分類格式 `名稱（子分類）`，[F040](F040-lifecycle-subcategory.md) `AC-S1`），**非** `LIFECYCLE.name` 原始值。斷言請以「有子分類之循環」建案例，期望值為 `名稱（子分類）` |
  | 🔴 欄位名為何不叫 `lifecycleDisplayName` | 既有 `DocumentListItem.lifecycleName` **已是同一概念之命名先例**（其值即 `lifecycleDisplayName()` 之輸出）；同一份回應內若一個叫 `lifecycleName`、另一個語意相同的叫 `lifecycleDisplayName`，會製造「這兩個名字所指是否不同」之無謂疑惑。**一致性優先於字面精確性**（§12.3） |
  | `nodeName` 之 `null` | 如實延續既有 `NodeInfo.name` 之 `string \| null` 型別；`null` 時 chip 文案之 `{節點名稱}` 呈現規則見 [OQ-T3-08](../open-questions.md#t3-2026-08-21)（**未命名節點**之逐字文案未經裁決，本輪標為 `[ASSUMPTION]`） |

  <br>🔴 **`subtreeFilter` 與篩選條件必須來自同一次解析**（見 `AC-T40` ④）：這是防止「篩選生效但描述子算錯」或「描述子有值但篩選沒施加」兩種分岔的關鍵——**不得**有兩條各自判斷「這個 `nodeSubtreeId` 到底解析得出來嗎」的路徑。
  <br>📌 **為何不讓前端自行查名稱**：另外呼叫循環／節點端點取名稱，等於製造第二個「這個 nodeId 到底屬不屬於這個循環」的判斷點——與 `AC-T43` 同一個分家風險。
- **AC-T46**（🔴 **清除之方向性不對稱**——兩個方向必須各建一案）：Given 已套用子樹 chip **且**使用者另外自行選了任一項既有篩選（如 `狀態 = 已公告`）, When——
  1. 點擊 `[data-subtree-chip-clear]`（chip 之 ✕）, Then **只清 chip**：chip 自 DOM 消失、網址上之 `lifecycleId`／`nodeSubtreeId` 兩參數被移除、**使用者自選之 `狀態 = 已公告` 仍然生效且其控制項仍顯示該值**；分頁回第 1 頁。
  2. 點擊「清除全部篩選」, Then **13 項篩選、關鍵字與 chip 三者同時清空**（`AC-D8` 已就地擴充），網址參數亦一併移除。
  <br>🔴 **不對稱是刻意的，不是遺漏**：chip 是「使用者從樹狀圖帶進來的一個外部條件」，清掉它不該連帶丟棄使用者在本頁自己下的功夫；而「清除全部篩選」四個字若留下一條仍在縮小結果集的 chip，畫面與按鈕字面自相矛盾。**兩個方向若只測一個，反向錯誤不會被發現。**
- **AC-T47**（chip 納入「已套用篩選」之判定）：Given 僅套用子樹 chip、13 項篩選與關鍵字皆為空, When 檢視頁面, Then 「清除全部篩選」按鈕**可見**（`AC-D10` 之逐字 `清除全部篩選` 不變），行動版之篩選紅點亦顯示。
  <br>📌 **`OJT` 之預設值 `全部` 仍不計入該判定**（既有規則不變）。
- **AC-T48**（🔒 回歸鎖定）：Given 本 delta 實作完成, When 檢視清單, Then ① **15 欄之欄位集合與由左至右順序逐字不變**（`AC-D9`／`AC-E9`／`AC-N40` ①）；② **13 項篩選之組成、順序與比對語意逐字不變**（`AC-D1`／`AC-D2`／`AC-N40` ②）；③ 篩選區之文案與選擇器契約（`AC-D10`）逐字不變；④ 3 張統計卡、排序、分頁、空狀態 `查無符合結果` 之行為不變；⑤ 未帶兩參數時，本頁之呈現與行為與本 delta 導入前**完全相同**（含首屏**不得**先閃一次未篩選之完整清單——子樹狀態須於首次渲染前決定）；⑥ 🔴 **回應形狀之既有五個頂層欄位 `items`／`total`／`page`／`pageSize`／`hasNext` 逐字不變**——`subtreeFilter` 為 **additive 第 6 欄**，既有消費者忽略未知欄位即可（本專案前端以具名欄位存取，非嚴格 schema 驗證）。**不得**把 `subtreeFilter` 塞進 `items` 之元素或改動任何既有欄位之型別。

### 清單匯出（CSV）delta（🔵 2026-08-31 使用者裁決；比照 [F018](F018-usage-form-management.md#name-and-export-column-delta)／[F039](F039-appendix-management.md#export-delta) 兩處匯出） {#export-delta}

> **使用者原文**：「ICSOP 文件管理：比照使用表單管理/附錄管理，新增匯出功能。」
> **前提裁決（使用者，2026-08-31）**：匯出欄位＝**畫面 15 欄去掉「樹狀圖」＝14 欄**（表頭逐字見 `AC-X1` ②）。**理由**＝「樹狀圖」欄只是**導覽圖示**（點擊跳至 [F036](F036-lifecycle-tree-preview.md) 循環樹狀圖預覽），**無資料值可落地**——比照 [F039](F039-appendix-management.md#export-delta) `AC-D6` ② 之「操作欄不匯出」。
> **規則權威＝[error-handling.md#export](../error-handling.md#export)**：該節之適用範圍自本日起由**三處**（F037／F038／F039）＋F024 之**四處**擴為**五處**，本處為第五處。🔒 **既有四處之規則與逐字文案一字不改**——本處向共用規則對齊，不得反過來。
> **產生器權威＝`backend/src/storage/csv-export.ts`**（`toCsvBuffer`／BOM／CRLF／RFC 4180／注入前綴／`assertExportRowLimit`／`EXPORT_ROW_LIMIT`／`exportFileName`／`formatExportTimestamp`／`joinLinkedDocumentNumbers`／`toTaipei`）——**只用、不改、不分岔出第二份產生器**。
> 🔒 **本 delta 不動**：15 欄之欄位集合與順序、13 項篩選之組成／順序／比對語意、節點子樹 chip、3 張統計卡、排序、分頁、空狀態、第 12 欄之摺疊與無檔案態，一律逐字不變（`AC-X16`）。

#### CSV 格式與欄位

- **AC-X1**（🔴 CSV 格式與**十四欄**逐字表頭）：Given 匯出成功, When 檢視檔案位元組, Then ——
  - ① 其位元組**以 UTF-8 BOM（`EF BB BF`）開頭**（缺失即為 Excel 開啟中文亂碼之經典成因）；
  - ② 第 1 列為表頭，其欄位由左至右**逐字**為 `OJT,制定公司,制定部門,制定室別,當責室長,狀態,檔案,程序書編號,程序書書名,版次,內容摘要,連結點程序書,公告日期,循環別`（**14 欄**）；
  - ③ 欄值含 `,`／`"`／換行時以雙引號包覆並將內部 `"` 逸出為 `""`（RFC 4180）；⚠ **內容摘要為最可能觸發本規則之欄**（自由文字，可含逗號與換行）；
  - ④ 表頭列與每一資料列（**含最末一列**）之終止符皆為 **CRLF（`\r\n`）**；
  - ⑤ **資料列序＝畫面當前排序**（`AC-X11` ② 之列序不變式），與畫面第 1 頁至最末頁由上而下之順序相同。
  - 🔴 **兩處與畫面之刻意差異，逐條明列**（皆為使用者裁決或既有慣例，**非疏漏**）：<br>　**(a)「樹狀圖」欄不匯出**——畫面第 8 欄為導覽圖示，無資料值（使用者 2026-08-31 裁決；同型於 F039 `AC-D6` ② 之「操作」欄）。<br>　**(b) 畫面之「當責室長 +N」於 CSV 展開為完整清單**——畫面因欄寬只顯示主要室長＋`+{N}` 徽章（次要姓名僅在 `title` tooltip），CSV 為**存查用途**故必須把 tooltip 內容展開（逐字規則見 `AC-X5`）。
  - 🔒 **表頭列不套用注入前綴**（`AC-X2` ③ 之範圍限定），故 ② 之逐字斷言不受注入防護影響。

- **AC-X2**（🔴 值層通則）：Given 匯出成功, When 檢視任一資料列之任一儲存格, Then ——
  - ① **`null`／`undefined` 一律輸出空儲存格**，**不得**輸出字面 `null`／`undefined`；
  - ② **畫面顯示 `—`（U+2014）之空值欄，CSV 一律輸出空儲存格**——`—` 是畫面的空值佔位符而非資料，落到 CSV 會被試算表當成一個資料值（**沿用** [F024](F024-access-history-query.md#export-fix-delta) `AC-F15` ③ 與 [F039](F039-appendix-management.md#name-and-export-column-delta) `AC-X2` 之既有裁決，**不另立規則**）。適用於 `制定公司`／`制定部門`／`制定室別`／`當責室長`／`檔案`／`版次`／`內容摘要`／`連結點程序書`／`公告日期`／`循環別` 十欄；
  - ③ **CSV 注入前綴**：值之**第一個字元**為 `=`／`+`／`-`／`@`／Tab（`\t`）／CR（`\r`）者，於最前面加一個半形單引號 `'`，**再**套用 ② 之 RFC 4180 包覆逸出（順序不可顛倒）；**表頭列不適用**。<br>⚠ **對值層斷言之影響（test-generator 必讀）**：本項使「CSV 儲存格值 ＝ 畫面所見字串」**不再恆成立**——以該六種字元開頭者相差一個前導 `'`。`AC-X3` 之各欄期望值一律讀作「畫面所見字串**經本項轉換後**之結果」；不以該六種字元開頭者，轉換為恆等（絕大多數案例）。<br>📌 **本頁之真實注入面**：`程序書書名`／`內容摘要`／`版次` 皆為 ICSOPAdmin 可自由輸入之字串。<br>📌 **可測性註記（2026-08-31，ui-ux-designer 回報 prototype 無可達載體）**：本條之驗證載體在**函式／元件層**，**不得**要求 `prototypes/13-document-list.html` 或畫面上存在示範列。現行 591 份程序書中**無任一筆**以該六種字元開頭，補一列示範資料會改動既有 combobox 之值域，牴觸 `AC-X16` ②（13 項篩選之組成與值域逐字不變）——該理由經 spec-writer 覆核為正當。**斷言方式**：直接對 CSV 產生器餵入以 `=`／`+`／`-`／`@`／Tab／CR 開頭之欄值，驗其輸出帶前導 `'`。
  - ④ **不得**於任何儲存格輸出圖示、徽章或按鈕之痕跡——`程序書編號` 欄之「尚未指派節點」警示圖示（`alert-triangle`）與 `程序書書名` 欄之「編輯」鉛筆鈕**皆不落地**（它們是畫面元件，不是值）。

- **AC-X3**（🔴 十四欄之值層語意；**逐欄逐字**）：Given 某文件之清單列, When 產生其 CSV 資料列, Then 各欄之值恰為下表所列（欄序同 `AC-X1` ②）——

  | # | 表頭 | 值 | 來源欄位 | 空值 |
  |---|---|---|---|---|
  | 1 | `OJT` | 文件層三值之**畫面所見中文標籤**（`已全部完成`／`部分完成`／`尚未開始`），見 `AC-X4` | `DocumentListItem.ojtStatus` | 缺鍵（`undefined`）→ **`尚未開始`**（**非**空儲存格） |
  | 2 | `制定公司` | 公司主檔全稱，與畫面該欄逐字相同 | `draftingCompanyName` | `null` → 空儲存格 |
  | 3 | `制定部門` | 部門名稱，與畫面該欄逐字相同 | `draftingDeptName` | `null` → 空儲存格 |
  | 4 | `制定室別` | 室別名稱，與畫面該欄逐字相同 | `draftingSectionName` | `null` → 空儲存格 |
  | 5 | `當責室長` | **主要 ∪ 次要**姓名，以**全形頓號 `、`** 相接，見 `AC-X5` | `primaryChiefName`／`primaryChiefId`／`secondaryChiefNames` | 皆無 → 空儲存格 |
  | 6 | `狀態` | **衍生顯示標籤**（`已公告`／`進度中`／`失效`／`作廢`），見 `AC-X7` | `deriveDisplayStatus()` ＋ `DISPLAY_LABEL` | 恆有值 |
  | 7 | `檔案` | 該文件自身之 **ICSOP PDF 檔名**（與畫面下載鈕 `title` 之 `下載 {fileName}` 同一個 `{fileName}`），見下方 ✅ 覆核註記 | `icsopPdfFileName` | 無附件 → 空儲存格 |
  | 8 | `程序書編號` | `documentNumber` 原值 | `documentNumber` | 必填，恆非空 |
  | 9 | `程序書書名` | `documentName` 原值 | `documentName` | 必填，恆非空 |
  | 10 | `版次` | `edition` 原值（如 `26'01`） | `edition` | `null` → 空儲存格 |
  | 11 | `內容摘要` | **全文，不截斷**（畫面之 `truncate` 為 CSS 視覺截斷，其 DOM 文字與 `title` 本即全文 ⇒ **不構成值層差異**） | `contentSummary` | `null` → 空儲存格 |
  | 12 | `連結點程序書` | 各連結點目標之 `documentNumber`，以**半形分號 `;`** 相接，見 `AC-X6` | `links[].targetNumber` | 0 筆 → 空儲存格（**非** `—`、**非** `0`） |
  | 13 | `公告日期` | `YYYY-MM-DD`（UTC+8），見 `AC-X8` | `announcedDate` | `null` → 空儲存格 |
  | 14 | `循環別` | 循環顯示名（含子分類時為 `名稱（子分類）`），與畫面該欄逐字相同 | `lifecycleName`（＝ `lifecycleDisplayName()` 之輸出，`AC-S1` 不變） | `null` → 空儲存格 |

  🔒 **本表不新增任何後端欄位**——十四欄之值**全部**取自既有之 `DocumentListItem` 型別（`backend/src/documents/documents.store.ts`），本 delta **不擴充該型別、不擴充 `GET /admin/documents` 之回應形狀**。
  - ✅ **第 7 欄「檔案」之覆核結論（2026-08-31 定稿；architecture-spec §13.7 交回項 ③ 已結案）**：值為 **`icsopPdfFileName`（檔名字串）**，**非** `有`／空白之二值。**依據**：使用者親自確認之範例資料列，該欄逐字為 **`ICSOP-001_v3.pdf`**——是檔名，不是有無旗標。<br>📝 **被否決之替代選項逐字保留供追溯**：「輸出 `有`／空白之二值」（architecture-spec §13.7 ③ 所列之 alternative）。**否決理由**：使用者之範例已直接排除它；且畫面該格之下載鈕 `title` 本即為 `下載 {fileName}`，檔名才是該格承載之資訊，二值會使匯出比畫面更貧乏。<br>⚠ **畫面該格無可見文字（只有一顆圖示鈕）**，故本欄是全表**唯一**「CSV 值取自畫面元素之 `title` 而非其可見文字」者——此為刻意，理由如上。
  - 🔴 **十四欄全部由後端解析，本 delta 前端不新增任何顯示規則**（architecture-spec §13.3）——**不得**由前端把畫面上算好的字串塞進請求，那會使匯出與清單成為兩條各自可漂移的路徑。

- **AC-X4**（🔴 `OJT` 欄之三值中文標籤 ＋ 兩份對照表逐字相同）：Given 三份文件之 `ojtStatus` 分別為 `'all'`／`'partial'`／`'none'`, When 匯出, Then 其 `OJT` 欄之值**逐字**為 `已全部完成`／`部分完成`／`尚未開始`；Given `ojtStatus` 缺鍵（`undefined`）, Then 為 **`尚未開始`**（＝ `none`，與 `AC-J13` 之「缺鍵視同 `none`」同一條規則，**不得**輸出空儲存格）。
  - 🔴 **對照表之單一權威為 `frontend/src/domain/ojt-status-view.ts`**（`AC-J13` 已定稿），惟本 repo **前後端為兩個獨立 TS 專案、無共用 package** ⇒ 「只有一份」在本輪**架構上不可達**（[error-handling.md#export](../error-handling.md#export) 值層通則之既有註記）。**本輪之機器可驗約束為「兩份逐字相同」**：後端新增之三值→中文標籤對照表，其三個字面與 `ojt-status-view.ts` 之 `VIEWS[*].text` **逐字相同**。<br>📌 **沿用既有處置，不創新模式**：同 `watermarkLines()`（architecture-spec §10.14）與 `change-labels.ts`（[F038](F038-lifecycle-tree-change-history.md#export-delta) `AC-D7` ④）之兩份並存＋逐字相同不變式。<br>✅ **落點已定案（`OQ-X-02` 結案；architecture-spec §13.3 (i)）**：後端 `export const OJT_STATUS_LABEL: Record<OjtCompletionStatus, string>` 落於 **`backend/src/documents/ojt-completion.reader.ts`**——與 `OjtCompletionStatus` 型別及 `deriveOjtStatus()` **同檔**，該檔已是全站唯一之三值判定點。<br>📝 **spec-writer 原建議「與 `csv-export.ts` 同層之純模組」已被取代**，理由（採納）：判定與其標籤放同一檔，使「新增第四種狀態」這件事在**一個檔案內**就撞到兩處，而分置兩檔時只會撞到一處。<br>🔒 **值域恰 3 個且封閉**——**不得**於後端引入第四個鍵（`OQ-E11-22` 已明文鎖定 `ojtStatusView()`／`OJT_DOC_STATE` 不得新增第四鍵，本表與其為同一組三值）。<br>🔴 **綁定之斷言形狀**：兩端各對**同一組 3 列固定向量**斷言——後端 `OJT_STATUS_LABEL[s]`、前端 `ojtStatusView(s).text`；值域封閉故該向量即完整列舉，任一端漂移即該端自己紅燈。
  - 🔴 **不得輸出列舉代碼**：`all`／`partial`／`none` **不得**出現於 CSV（[error-handling.md#export](../error-handling.md#export) 值層通則：「列舉／代碼欄一律輸出畫面所見之中文標籤」）。
  - 🔒 **`data-has-ojt` 之三值域（`all`／`partial`／`none`）為 DOM 掛鉤、非顯示值**，兩者不得混用（`AC-J13`）。

- **AC-X5**（🔴 `當責室長` 欄＝主要 ∪ 次要，全形頓號相接）：Given 某文件之 `primaryChiefName = '王小明'`、`secondaryChiefNames = ['李大華','張三']`, When 匯出, Then 該欄之值**逐字**為 `王小明、李大華、張三`（**全形頓號 `、`**，前後**無空白**）；順序為**主要在前、次要依既有陣列順序在後**。
  - Given `primaryChiefName` 為 `null` 而 `primaryChiefId = 'E001'`, Then 主要位置以**員編** `E001` 代入（**與畫面 `primaryChiefName ?? primaryChiefId` 之 fallback 完全相同**）；Given 兩者皆為 `null` 且無次要, Then 為**空儲存格**。<br>📌 **可測性註記（2026-08-31，ui-ux-designer 回報 prototype 無可達載體）**：本條之驗證載體在**函式／元件層**，**不得**要求 `prototypes/13-document-list.html` 或畫面上存在示範列。現行資料中**無任一筆**姓名解析失敗之列（fallback 分支在真實資料上不可達），補一列示範資料會改動既有 combobox 之值域，牴觸 `AC-X16` ②（13 項篩選之組成與值域逐字不變）——該理由經 spec-writer 覆核為正當。**斷言方式**：以 `primaryChiefName = null` 之 fixture 直接驅動欄值函式。
  - Given 同一姓名同時出現於主要與次要, Then **去重**（與畫面 `chiefValues()` 之 `uniq` 同一規則），該姓名只出現一次。
  - 🔴 **分隔符恆為全形頓號 `、`，且明文禁止使用半形逗號 `,`**：<br>　① **禁用逗號之理由（不得省略）**——逗號會觸發 RFC 4180 之引號包覆與逸出，使該格在原始 CSV 文字中被雙引號包住，**欄內逗號與欄間逗號在肉眼上無從分辨**；而本欄之用途正是讓人一眼看出這份文件由哪幾位室長當責。理由與 `csv-export.ts` 之 `LINKED_DOC_NUMBER_SEPARATOR` 既有裁決**逐字相同**（[F039](F039-appendix-management.md#name-and-export-column-delta) `AC-X2`）。<br>　② **為何是頓號而非分號**——本欄之畫面既有載體即以 `、` 相接（`title="次要：{names.join('、')}"`），值層對齊畫面；`連結點程序書` 欄用半形分號則是為了與**編號**之字面不混淆（`AC-X6`）。<br>　🔒 **兩欄之分隔符不同為刻意，不得統一**；兩者皆非逗號亦為刻意。
  - ✅ **本條為 architecture-spec §13.7 交回項 ② 之定稿**：該章只裁定「後端解析、來源＝`primaryChiefName ?? primaryChiefId` ＋ `secondaryChiefNames[]`」，逐字規則屬本 AC；本條之四項（主要∪次要／全形頓號／去重／員編 fallback）與該章之建議一致，**採納並就此定案**。
  - 📌 **本欄之匯出值恆為畫面之嚴格超集**（畫面收合為 `王小明 +2`）——理由已載於 `AC-X1` ⑤ (b)。

- **AC-X6**（🔴 `連結點程序書` 欄＝共用 `joinLinkedDocumentNumbers()`）：Given 某文件關聯 N 個連結點, When 匯出, Then 該欄之值為該 N 個目標之 `documentNumber`，以**半形分號 `;`** 相接（前後**無空白**）；N=0 → **空儲存格**（**非** `—`、**非** `0`）。
  - 🔴 **必須共用** `backend/src/storage/csv-export.ts` 之既有 `joinLinkedDocumentNumbers()` 與 `LINKED_DOC_NUMBER_SEPARATOR`——[F018](F018-usage-form-management.md#name-and-export-column-delta) `AC-X2` 與 [F039](F039-appendix-management.md#name-and-export-column-delta) `AC-X2` 已明訂「兩處匯出不得各寫一份」，**本處為第三處**；各寫一份必然於分隔符或空值呈現上漂移。
  - **順序＝畫面該儲存格展開後所見之順序**：未套用 `連結點程序書` 篩選時＝ `links[]` 之既有順序；已套用時＝**命中者排第一顆**、其餘順序不變（穩定排序，兩段內部各自維持原相對順序；`AC-E6` 之既有語意）。<br>✅ **落點已定案**（architecture-spec §13.3 (ii)）：後端純函式 `orderLinksForExport(links, 命中之目標文件 id?)` 落於 `backend/src/documents/` 之獨立純函式檔；未提供命中值或無命中 → **原樣回傳**。<br>🔴 **可測形狀（防第二套排序邏輯）**：對同一組 `(links, 命中之目標文件 id)` 輸入，前端 `orderedLinks()` 與後端 `orderLinksForExport()` **逐案輸出相等**（比照 [F026](F026-role-field-matrix.md) `AC-U3`、本檔 `AC-J12` 之既有慣例）。
  - 🔴 **前端須就此改動一處（行為恆等之抽出，約 6 行）**：目前該排序是 `LinkCell` **內部之 inline `useMemo`**（`frontend/src/pages/DocumentListPage.tsx:1000-1006`），**未匯出、沒有可斷言的對象**。⇒ 須**行為恆等**抽出為 `DocumentListPage.tsx` 匯出之**純函式** `orderedLinks(links, filterLink)`，由 `LinkCell` 呼叫。**行為一字不改**，故既有渲染測試不預期轉紅。
  - 📝 **被推翻之原句逐字保留供追溯**：`OLD>` 「**前端側之等價斷言已存在**——`frontend/src/pages/DocumentListPage.linkCell.test.tsx:317`（`F017 AC-E6：連結點程序書 篩選命中者排第一顆`）…**前端不需為本 delta 改動任何程式。**」
  - 🔴 **推翻理由（spec-writer 實地覆核，與 lead 裁決一致）——原句與本條自己的可測形狀互相矛盾**：`linkCell.test.tsx:317` 之斷言層級是**渲染後之 DOM**（`cell.textContent` 含某編號、`cell.dataset.linkCount === '6'`、toggle 之 `+5` 與 `title`），**不是函式輸出** ⇒ **無法與後端函式「逐案輸出相等」**。以它充當前端側綁定，等於宣稱一條**根本比對不起來**的不變式。
  - 🔒 **不抽的代價**：後端 `orderLinksForExport()` 將**沒有任何前端側綁定**，兩份排序規則漂移時**無人攔**（architecture-spec §13.5 #5 已明文警告）。
  - 📌 **同 delta 內已有先例**：ui-ux-designer 於 prototype 即以同一手法把 13 項篩選抽為 `filteredRows()`，使渲染與匯出**共用同一份判定** ⇒ 不變式**由結構成立**，而非兩份實作碰巧一致。
  - 🔒 **抽出之範圍嚴格限於「把既有 `useMemo` 之內容原樣搬進一個具名匯出函式」**：`LinkCell` 之渲染、`AC-E1`～`AC-E14` 之全部行為、`data-*` 掛鉤逐字不變（`AC-X16` ④）。<br>⚠ **承認一個張力並明文接受**：畫面**收合態**只顯示第一顆 pill ＋ `+N`，CSV 則輸出全部 N 個編號 ⇒ 本欄之比較基準是**展開態**——與 `joinLinkedDocumentNumbers()` 既有明文（「列內順序＝管理頁**展開列**所見之順序」）及 F018／F039 之基準**一致**，非本頁特例。<br>🔒 **該命中值僅供欄內排序，不得被用於任何篩選判定**（後端在本 delta 中不重跑任何篩選，`AC-X11`）。
  - 🔴 **目標查無編號者不計入**：`targetNumber === null` 之連結點（目標已刪除）**跳過**，**不得**輸出空字串而產生 `;;` 或前／後綴分號。<br>📌 **可測性註記（2026-08-31，ui-ux-designer 回報 prototype 無可達載體）**：本條之驗證載體在**函式／元件層**，**不得**要求 `prototypes/13-document-list.html` 或畫面上存在示範列。現行 15 筆連結之目標**全部存在**（`targetNumber === null` 於真實資料上不可達），補一列示範資料會改動既有 combobox 之值域，牴觸 `AC-X16` ②（13 項篩選之組成與值域逐字不變）——該理由經 spec-writer 覆核為正當。**斷言方式**：以含 `targetNumber: null` 成員之 `links` 陣列直接驅動 `joinLinkedDocumentNumbers()`／排序函式。
  - 🔒 **不輸出書名、不輸出 `targetHasPdf`**——畫面該格之可見文字本即只有編號（`AC-E2`：書名只在 tooltip），值層對齊畫面。

- **AC-X7**（🔴 `狀態` 欄＝衍生顯示標籤，非儲存值）：Given 三份文件之 `status`／`announcedDate` 分別為（`active`／昨日）、（`active`／明日）、（`inactive`／任意）, When 匯出, Then 其 `狀態` 欄之值**逐字**為 `已公告`／`進度中`／`失效`；`status = 'void'` → `作廢`。
  - 🔴 **不得輸出儲存值** `active`／`inactive`／`void`（[error-handling.md#export](../error-handling.md#export) 值層通則）。
  - **判定必須共用** `backend/src/documents/display-status.ts` 之 `deriveDisplayStatus()` ＋ `DISPLAY_LABEL`（該模組已為前後端各自之權威來源），**不得**於匯出路徑另寫一份 if/else。
  - 🔴 **「今日」之基準＝ `new Date()`，明文禁止對其套用 `toTaipei()`**（**本條為逐字禁令，不得改寫**）：<br>　**理由**：`deriveDisplayStatus()` 比較的是 **`getTime()`（絕對瞬間）**，**與行程時區無關** ⇒ `today` 只需是「現在」這個時間點，**不需要、也不可以**做任何時區位移。<br>　**若誤對 `today` 套 `toTaipei()`**（＝把「現在」硬推後 8 小時），則**台北時間 00:00–08:00 這個窗口內**，公告日期為「今天」之文件會被算成 `已公告`，而**畫面同時說 `進度中`** ⇒ 同一份文件，CSV 與畫面**互相矛盾**。<br>　⚠ **固定時鐘之 fixture 完全測不到**：測試只要把 `now` 釘在台北 08:00 之後（絕大多數人寫測試時的直覺值），兩種寫法**結果相同、測試全綠**。這與本 repo 2026-08-14／15 之 MSSQL 時區 bug 是**同一類錯誤**（讀寫對稱故容器一路正確、天真測試兩種設定都會過）。<br>　🔒 **可測形狀**：以**釘死於台北時間 00:00–08:00 之間**的 `now`（例如 UTC `2026-06-09T17:00:00Z` ＝台北 `2026-06-10 01:00`）＋ `announcedDate = 2026-06-10` 建案例，斷言 `狀態` 欄為 **`進度中`**（若實作對 `today` 套了 `toTaipei()`，此案例會得到 `已公告` 而紅燈）。
  - 🔴 **本 delta 之時區鐵則（一句話，涵蓋全部十四欄）**：**`toTaipei()` 只用於「格式化輸出」（`公告日期` 欄之 `YYYY-MM-DD`，`AC-X8`），一律不用於「比較」**（本欄之 `today` 判定）。**兩者不得混用。**

- **AC-X8**（🔴 `公告日期` 欄＝`YYYY-MM-DD`，**不附時分秒**）：Given 某文件之 `announcedDate` 於 UTC+8 為 `2026-06-10`, When 匯出, Then 該欄之值**逐字**為 `2026-06-10`；`null` → 空儲存格。
  - ✅ **落點已定案（2026-08-31 lead 裁決；🔴 兩案皆不採，走第三條）**：**直接沿用既有 `formatExportTimestamp()` 並取其前 10 字元**——**不新增 `formatExportDate()`**，`backend/src/storage/csv-export.ts` **一行未改**。
    - 📝 **被否決之兩案，逐字保留供追溯**：`OLD>` ① spec-writer 案——「後端新增 `export function formatExportDate(value): string`，落於 `backend/src/storage/csv-export.ts`；此為對該檔之 **additive export**，`AC-X16` ⑦ 已就地放行」；`OLD>` ② architecture 案——依 `AC-X16` ⑦ 之**放寬前**字面否決該函式，但未給出替代之取值途徑。
    - 🔴 **僵局之成因（值得記下）**：兩份文件**各自引用對方的舊版本**——本 AC 為了容納 `formatExportDate()` 而放寬了 `AC-X16` ⑦，architecture 卻依 `AC-X16` ⑦ 放寬**前**的字面否決該函式。**兩邊都不是錯的，只是看的是不同時刻的同一條鎖。**
    - ✅ **第三條同時滿足三件事**：① `AC-X16` ⑦ 得以**回到未放寬之嚴格字面**（`csv-export.ts` 未被修改）；② **不產生第二份 `toTaipei()` 位移**——那正是當初放寬所要防的東西，如今由「根本不新增函式」直接達成，比放寬更強；③ 與下方之可觀察等式**本來就是同一個式子**，約束環無須改寫。
  - **可驗證之等式（本條之驗證形狀）**：該儲存格 **＝ `formatExportTimestamp(announcedDate).slice(0, 10)`**。`null`／空值 → `formatExportTimestamp()` 既有行為回空字串，`.slice(0,10)` 仍為空字串 ⇒ **空儲存格**（與 `AC-X3` 第 13 列一致，無須額外分支）。🔴 **不得**使用 `toLocaleDateString`／`toLocaleString('zh-TW')`、亦**不得**對 ISO 字串直接 `.slice(0,10)`——後者於 UTC 16:00 之後會**差一天**，且該錯誤在開發機（UTC+8）與容器（UTC）會各自呈現不同結果**而兩邊測試都會綠**（本 repo 2026-08-14／15 MSSQL 時區 bug 之同一形狀）。
  - ⚠ **本條與 [F039](F039-appendix-management.md#export-delta) `AC-D13` ③ 之「上傳時間拆到秒」刻意不同，此差異經 spec-writer 判定並在此明列理由**：F039 之 `uploadedAt` 是**時間戳**（每次覆蓋皆更新，日期粒度不足以區分同日多次覆蓋）；本欄之 `announcedDate` 是**日期欄**（[data-model](../data-model.md#document-entity) 之粒度即為日），畫面本身亦只呈現日期，**補上 `00:00:00` 等於憑空捏造不存在的精確度**。⇒ **維持 `YYYY-MM-DD`**，與 [error-handling.md#export](../error-handling.md#export) 之「時間戳欄一律 `YYYY-MM-DD HH:mm:ss`」不衝突（本欄非時間戳欄）。

#### 匯出動作、權限與端點

- **AC-X9**（🔴 匯出鈕之位置、逐字文案與選擇器）：Given 任一**可進入本頁**之角色（`AC-X10`）載入後台文件清單頁, When 檢視 **topbar 動作區**（`PageHeader` 之 children，admin shell 版面契約＝頁面動作鈕一律在 topbar 右側）, Then 存在一顆按鈕，其**可見文字**與 **`aria-label`** 皆**逐字**為 `匯出`、**`title` 逐字**為 `匯出程序書清單（CSV）`、**icon 鍵**為 `download`；其**位置在「建立程序書」鈕之前（左側）**（比照 `prototypes/24-appendix-management.html` 之「匯出」在「上傳附錄」之左）。
  - 🔴 **該鈕非 write-only**：Given 角色為 SysAdmin／Supervisor／DeptContact（三者對本頁皆為**唯讀**）, When 渲染, Then 該鈕**仍存在且可觸發**——**不得**套用 `.write-only`／`canWrite` 條件式渲染。<br>📌 **理由**：匯出屬**讀取類動作**（[error-handling.md#export](../error-handling.md#export) 之權限段落已明訂「唯讀角色允許匯出」；同 [F039](F039-appendix-management.md#export-delta) `AC-D4`／[F018](F018-usage-form-management.md#name-and-export-column-delta) `AC-X6`）。
  - **逐字斷言**：`getByLabelText('匯出')` 於 ICSOPAdmin **與** SysAdmin／Supervisor／DeptContact 四種角色下**皆非 `null`**；`queryByText('建立程序書')` 僅於 ICSOPAdmin 下非 `null`（**既有 `canWrite` 行為不變**）。
  - 🔒 **本頁既有之唯讀 banner、統計卡、篩選卡一律不動**——本 delta 只在 topbar 加一顆鈕。

- **AC-X10**（🔴 權限：誰可匯出、誰 403）：Given [F025](F025-role-function-matrix.md) 之 `ICSOP 文件管理` 列（**逐格不變**：系統管理員 `唯讀`／ICSOP 管理員 `CRUD`／主管 `唯讀`／部門窗口 `唯讀`／一般使用者 `無`；🔴 **已對程式碼覆核**：`backend/src/rbac/function-matrix.ts:114` 之 `row('READ','CRUD','READ','READ','NONE')`，其參數順序由同檔 `:74-80` 之 `row()` 宣告釘死為**系統管理員／ICSOP管理員／主管／部門窗口／一般使用者**，與 F025 表格欄序及 `:97` 之文件註解三者一致）, When 各角色呼叫匯出端點, Then ——
  - **ICSOPAdmin／SysAdmin／Supervisor／DeptContact 四者皆允許**（`'read'` 閘門本即通過）；
  - **User（一般使用者）** → **403 `PERMISSION_DENIED`**（路由層，比照本頁清單端點之既有行為）。
  - 🔴 **閘門必須為功能 `ICSOP文件管理`（`FunctionKey.ICSOP_DOCUMENT_MANAGEMENT`）之 `'read'`，不得改為 `'write'`**——本矩陣對 SysAdmin／Supervisor／DeptContact 皆為**唯讀**，改成 `'write'` 會使**三種角色連匯出都不能用**；而若為了讓它通過而改矩陣格值為 CRUD，等同**把整個文件管理模組對三者開放寫入**。**兩種改法皆為回歸，不是整理**（逐字沿用 [F025](F025-role-function-matrix.md) `AC-N36` 之既有論證形狀）。<br>🔴 **本條在本 delta 特別容易被違反，因為 `OQ-X-01` 已定案採 `POST`**（`@RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')`）：「POST ⇒ write」是直覺反射——**HTTP 方法不決定閘門**，`RolePermissionGuard` 只看 `@RequirePermission` 之**第二個引數**，而該引數**恆為 `'read'`**。<br>📌 **POST 於此不代表狀態變更**：本端點**無任何副作用**（不寫稽核、不寫任何資料表），與 `AppendicesService.exportPool()`／`UsageFormsService.exportPool()` 完全同型（兩者亦只呼叫 `assertCanRead()`）；採 POST 純為「查詢對象集合放不進 URL」（`AC-X11`）。**相同 body 產生相同位元組**（除檔名內之時間戳外），重送不產生額外效果。
  - 🔴 **本頁之可匯出角色集合與 [F018](F018-usage-form-management.md#name-and-export-column-delta) `AC-X6`／[F039](F039-appendix-management.md#export-delta) `AC-D4` 刻意不同**（那兩頁只有 ICSOPAdmin＋SysAdmin——`function-matrix.ts:115-116` 之 `USAGE_FORM_MANAGEMENT`／`APPENDIX_MANAGEMENT` 皆為 `row('READ','CRUD','NONE','NONE','NONE')`，Supervisor／DeptContact 於該兩頁本就 403）——差異來自 F025 矩陣既有之列值，**非本 delta 之裁量**，**不得**為了「多處一致」而收緊本頁。<br>🔴 **明文禁止照抄** [F039](F039-appendix-management.md#export-delta) `AC-D4` 之句子「Given 角色為 Supervisor／DeptContact／User 直接呼叫匯出端點, Then 回 403 `PERMISSION_DENIED`」——**該句在本 feature 是錯的**（本頁 Supervisor 與 DeptContact 皆有 `READ`）。同型 delta 之措辭可照抄，**矩陣事實不可照抄**。
  - **不寫稽核**：匯出**不寫入 `AUDIT_LOG`**（管理存取，比照本頁既有查詢與 [F039](F039-appendix-management.md#export-delta) 附錄池匯出）；[F023](F023-audit-logging.md)／[F024](F024-access-history-query.md) **不需 delta**、`actionType`／`targetType` 列舉**不新增任何值**。

- **AC-X11**（🔴 匯出範圍＝**當前篩選之全部結果**；**本條只鎖可觀察行為，機制不入 AC**）：Given 文件池共 591 筆、每頁 50 筆且目前位於第 1 頁、已套用任意組合之篩選使符合者為 80 筆, When 點擊匯出, Then 產生之 CSV **恰含 80 筆資料列**（＋1 列表頭），**非**當前頁之 50 筆；Given 未套用任何篩選, Then 含全部 591 筆。
  - 🔴 **本條之三項不變式（無論端點形狀走哪一案皆成立，這才是本 delta 真正要鎖的東西）**：<br>　① **列集合**＝畫面**當前 13 項篩選 ＋ 節點子樹 chip** 套用後之**全部列**（＝畫面「共 {N} 筆」所計數之同一集合），**非**當前頁之 50 筆；<br>　② **列序**＝畫面當前排序（`sortBy`／`sortDir` 套用後、由第 1 頁至最末頁由上而下之順序）；<br>　③ CSV 資料列與該集合**一一對應、同序、不多不少**（`AC-X1` ⑤）。
  - ✅ **機制已定案（`OQ-X-01` → 乙案；architecture-spec §13 決策 D1～D4）**：前端把**畫面當前結果之文件 id 清單**（＝ `DocumentListPage.tsx` 之 `filtered.map(d => d.id)`，**不是** `pageRows`、**不是** `all`）連同**選填之連結點命中值**送給後端；🔴 **後端完全不重跑任何篩選、不重跑任何排序**。端點形狀見 [§Interface Contract](#interface-contract)。
  - 🔴 **可測形狀（三條，互不可替代；防的是三種不同的假綠）**：
    - **① 送對了集合**（前端）：spy 匯出 API，斷言其所收之 id 陣列**逐字等於** `filtered.map(d => d.id)`。<br>⚠ **fixture 必須使 `filtered`／`pageRows`／`all` 三者相異**（至少 3 頁資料 ＋ 一項生效之篩選）——**單頁無篩選之 fixture 下該斷言對三者皆成立＝零鑑別力之假綠**。
    - **② 保住了順序**（後端）：以 store fake **刻意回傳與請求相反之順序**，斷言 CSV 資料列順序 ＝ 請求之 `documentIds` 順序。<br>⚠ **fake 若依序回傳，「有沒有重排」完全測不出來**——fake **必須主動打亂**。<br>📌 **可測性註記（2026-08-31，ui-ux-designer 回報 prototype 無可達載體）**：本項之驗證載體在 **service／函式層**（store fake ＋ CSV 位元組），**不得**要求 `prototypes/13-document-list.html` 或畫面上示範「排序後之匯出」——prototype 之排序為靜態版面示意、不驅動任何匯出路徑，補示範列亦會改動既有值域而牴觸 `AC-X16` ②。前端側只需斷言「送出之陣列逐字等於 `filtered.map(d => d.id)`」（本 AC ①），**排序正確與否由後端向量負責**。
    - **③ 每格的值對**（後端）：以**單一列 fixture**、14 欄各給一個有鑑別力之值（`ojtStatus='partial'`／`draftingSectionName=null`／`secondaryChiefNames` 非空／`announcedDate` 跨日邊界／`contentSummary` 長於畫面截斷寬度／`links` 三筆且命中第三筆／`icsopPdfFileName=null`），斷言 14 個儲存格逐字。
    - 📌 **①② 是在證明「結構保證沒被實作破壞」，③ 才是在建立保證**——只寫 ③ 會讓「送錯陣列」與「忘了重排」**全綠通過**。
  - 🔴 **「列集合相同」為結構保證、且其缺口方向安全**：後端只輸出 id ∈ 請求清單之列 ⇒ **CSV 多出畫面沒有的列在結構上不可能**；唯一缺口為「載入清單與按下匯出之間該文件被刪」⇒ **CSV ⊆ 畫面**（該列靜默略過，`AC-X17` ④）。
  - 🔴 **下列五項為端點之恆定約束**：① 閘門為功能 `ICSOP文件管理` **`read`**（`AC-X10`）；② **不寫稽核**；③ 上限 10,000（`AC-X12`）；④ 檔名 `documents_{YYYYMMDD}_{HHmmss}.csv`（`AC-X13`）；⑤ 回應 body 必須為 `toCsvBuffer()` 之 **Buffer**（`res.send(buffer)`，**不得** `res.send(string)`——會讓 Express 自行決定編碼，BOM 悄悄壞掉而測試仍可能綠，`csv-export.ts` 檔頭之明文警告）。
  - 📝 **被撤回之原表述，逐字保留供追溯**（lead 2026-08-31 原信第 4 點，已由 lead 於同日實測後自行撤回；`OQ-X-01` 之甲案即其形式化，已被架構裁決否決）：<br>　OLD> 「**匯出範圍＝當前篩選之全部結果（非當前頁）**：須明列**全部 13 項篩選 ＋ 節點子樹 `nodeSubtreeId`／`lifecycleId`** 之逐字參數鍵名皆須帶入，且未套用者不得送空字串。」
  - 🔴 **撤回理由（spec-writer 與 lead 各自獨立實地查證，結論一致；四項事實）**：<br>　**(a) 本頁 13 項篩選全部在瀏覽器端施加**——`DocumentListPage.tsx:230` 只以 `{ pageSize: 2000, ...subtreeParams }` 取一次完整工作集進 `all` state，13 項篩選、關鍵字與排序皆於 `filtered` 之 `useMemo`（`:483-517`）客端運算；後端只收到 `pageSize` 與子樹兩參數。<br>　**(b) 前後端之篩選語言不同構**——前端以**顯示名稱**比對（`draftingCompanyName`／`draftingDeptName`／`draftingSectionName`／`chiefValues()` 之姓名／`statusValue()` 之衍生標籤，`:487-499`），後端以 **id／代碼**比對（`companyCode`／`draftingDeptId`／`draftingSectionId`／`primaryChiefId`，`documents.controller.ts:47-84`＋`document-list-query.ts`）。**兩者不是同一個篩選，不能只靠改參數名對接**；且同一部門名稱可對應多家公司之不同 `orgCode`（跨公司同名不同單位），單值代碼參數會**靜默漏列**。<br>　**(c) 兩項後端根本沒有參數**——`公告日期` 閉區間（前端 `:501-506`）與 `程序書書名內` 之 **contains** 雙行為（`document-list-query.ts:54` 之 `documentName` 為**等值**，contains 只存在於前端 `:493`）。<br>　**(d) 三項篩選在前端是「先取 id 集合再交集」**——`連結點程序書`／`附錄`／`使用表單` 各自另發一支 `getDocuments({linkTargetId|appendixId|formId})` 取回文件 id 集合，再於客端交集（`:246-303`），**不是單次查詢內的條件**。<br>　⇒ 若照原表述逐字寫成「由後端重跑同一組篩選」，會產生**端到端不可達之規格**：實作端只能二選一——在後端**重寫一套名稱式篩選**（兩套語意必然漂移，且單元測試兩邊各自為真、交集無人驗＝本 repo [F024](F024-access-history-query.md#export-fix-delta) 匯出鈕已踩過之假綠形狀），或**悄悄只帶部分參數**（＝本檔 `AC-D2` 第 10／11 列附錄／表單篩選漏映射、端到端靜默無作用那個坑之重演）。**故本 AC 只鎖可觀察之列集合與列序，機制交由架構裁決。**
  - ⚠ **已知邊界（既有缺口，非本 delta 造成）**：畫面本身以 `LOAD_SIZE = 2000`（`DocumentListPage.tsx:51`）取工作集，文件總數若超過 2,000，**清單頁本身即已截斷**（統計卡、篩選、排序、分頁全部只看那 2,000 筆）；本 delta 之三項不變式仍成立——匯出**恆等於畫面所見**，不多也不少，**不引入新的不一致**。該既有限制登錄為 [open-questions.md](../open-questions.md#x-2026-08-31) `OQ-X-03`，**本 delta 明確不修**。

- **AC-X12**（🔴 匯出筆數上限）：Given 符合當前篩選之結果為 **10,001** 筆, When 匯出, Then 回 **400 `EXPORT_ROW_LIMIT_EXCEEDED`**（訊息含**實際筆數**與上限值 10,000 並提示縮小條件），**不產生任何檔案、不回傳部分結果**；Given 恰為 **10,000** 筆, Then 匯出成功（**邊界值含**）。
  - **必須共用** `csv-export.ts` 之 `assertExportRowLimit()`，且**必須單點執行**（該函式之訊息已把實際筆數排在上限值之前，供前端 `countFromLimitError()` 取第一個數字）。
  - 🔴 **檢查點＝後端、id 清單之長度、任何 DB 查詢之前**（architecture-spec §13.2 ④）。<br>📌 **這相對 [F018](F018-usage-form-management.md#name-and-export-column-delta) `AC-X8`／[F039](F039-appendix-management.md#export-delta) `AC-D8`（於篩選後檢查 `rows.length`）是檢查點前移，但語意完全相同**——在本裁決下該長度**即是**符合條件之筆數，不需要先查再數。🔒 **不得有第二處檢查。**
  - 🔴 **前端不得執行本檢查**：前端**得**（比照 [F024](F024-access-history-query.md#export-fix-delta) `AC-F19`）於結果數超過上限時顯示**事前提示文字**，但那是**提示**、**不是檢查**——**不得因此擋下請求、不得 `disabled` 匯出鈕**。「提示」與「執行檢查」一旦合流，後端之錯誤路徑就再也跑不到，**本 AC 也就永遠測不到真的**。
  - 🔴 **可測性註記（不得省略；test-generator 必讀）**：`LOAD_SIZE = 2000`（`DocumentListPage.tsx:51`）< `EXPORT_ROW_LIMIT = 10000` ⇒ 本 AC 之錯誤路徑**在本頁結構上不可達**。**本 AC 只能以「直接呼叫端點／service」之方式驗證，不得經由畫面觸發**——經畫面驅動的測試會寫成一條**永遠跑不到卻恆綠**的測試。<br>⚠ **另一條會使本路徑不可達的東西在後端**：`backend/src/main.ts` 之 body-parser 預設上限為 **100 KB**，而 10,000 個 id 之請求約 **400 KB** ⇒ 未提高上限時，請求會在 body-parser 就被擋成 **413**，`assertExportRowLimit()` 成為**不可達程式碼**，而**兩端單元測試都會綠**（controller 單測直接呼叫方法，body-parser 不在路徑上）。✅ **處置已定案（`OQ-X-04`；2026-08-31 第二輪，lead 退回全域方案後改裁）＝只對匯出路徑放寬**：`NestFactory.create(AppModule, { bodyParser: false })` ＋ `app.use('/admin/documents/export', json({ limit: '1mb' }))` ＋ `app.use(json())` ＋ `app.use(urlencoded({ extended: true }))`（**順序不可顛倒**）⇒ **全站其餘 JSON endpoint 之 payload 面維持框架預設 100 KB、一格未放寬**。
  - 🔴 **第三條同型陷阱（architecture 實跑揪出，2026-08-31；本條為其規格側登錄）**：**只掛路由範圍 parser 而未同時設 `bodyParser: false`，會讓全站其餘 JSON 路由之 `req.body` 變成 `undefined`**——Nest 之 `isMiddlewareApplied()` 係按**函式名** `jsonParser` 比對，見到自行掛載者即**不再掛上內建 parser**，於是連 48 bytes 的請求都 500。⚠ **且兩端單元測試全綠**（controller 單測直接呼叫方法，body-parser 根本不在路徑上）。<br>🔒 **三條陷阱同屬一類**：不放寬上限 → `assertExportRowLimit()` 不可達；只放寬全域 → 範圍過大（已被 lead 退回）；只掛路由 parser 而不關內建 → **全站 POST／PATCH 全壞**。**三者皆只能以真環境 smoke 兌現**（architecture-spec §13.5 #1 #2），本輪環原理上測不到。

- **AC-X13**（空結果與檔名）：Given 當前篩選之結果為 **0 筆**（畫面呈現空狀態 `查無符合結果`）, When 點擊匯出, Then 回 **200** 並產生**僅含表頭列**之 CSV（**非錯誤、非空檔**）——即 `AC-X1` ② 之十四欄表頭 ＋ 一個 CRLF。<br>Given 匯出成功, When 檢視 `Content-Disposition` 之 `filename`, Then 其形狀為 **`documents_{YYYYMMDD}_{HHmmss}.csv`**（伺服器時間，**UTC+8**，共用 `exportFileName('documents', now)`）；`Content-Type` 為 `text/csv; charset=utf-8`。<br>📌 **scope 字面為 `documents`**，與既有 `appendices`／`usage-forms` 及變更歷程各 scope 並列、不重複。
  - 🔴 **0 筆時匯出鈕仍可按、不得事前擋下**：**不得**以 `disabled` 阻止（[F024](F024-access-history-query.md#export-fix-delta) 匯出鈕已就同一件事裁定過——`disabled` 的鈕不能 focus、讀不到 tooltip、觸控裝置上按了毫無反應，使用者只會覺得「壞了」）。**得到一份只有表頭的檔案是誠實的。**

- **AC-X14**（🔴 使用者可見回饋之逐字文案）：Given 匯出成功, When 檢視回饋, Then 其文字**以逐字片段 `已匯出程序書清單（CSV，UTF-8 BOM）` 起始**（其後可附筆數等資訊，該部分不逐字約束）。<br>Given 符合筆數超過上限, When 檢視錯誤回饋, Then ① 其文字**含逐字片段** `符合條件之筆數為 {N} 筆，超過匯出上限 10000 筆，請縮小篩選條件`（`{N}` 為實際筆數，取自 `countFromLimitError()`）；② 字串 **`EXPORT_ROW_LIMIT_EXCEEDED · 400`**（＝既有共用常數 `EXPORT_LIMIT_BADGE`）出現於**同一個回饋容器內**。<br>Given 其他錯誤, Then 回饋逐字為 `匯出失敗：{code}`（沿用 [F018](F018-usage-form-management.md#name-and-export-column-delta) `AC-X10`／[F039](F039-appendix-management.md#export-delta) `AC-D12` 之既有句式）。
  - 🔴 **量詞／限定詞之裁定＝「筆數」＋「篩選條件」（與 [F039](F039-appendix-management.md#export-delta)／[F018](F018-usage-form-management.md#name-and-export-column-delta) 同型，與 [F037](F037-document-change-history.md#export-delta)／[F038](F038-lifecycle-tree-change-history.md#export-delta) 之「事件」＋「查詢條件」刻意不同）**。**理由（spec-writer 裁定，不得省略）**：① 本頁之計數單位在**畫面上已逐字寫著「共 {N} 筆」**（篩選卡右側）與統計卡「程序書數量（總數）」——回饋若改口說「事件」，與使用者眼前的字對不上；② 本頁之縮小手段就叫「**篩選**條件」（篩選卡標題逐字 `篩選條件`、按鈕逐字 `清除全部篩選`），而 F037／F038 之對應載體是「查詢」；③ 本頁與附錄／表單池同為**篩選式清單**，三者同型。<br>🔒 **五處匯出之回饋句不得互相對齊為同一句**（各自之量詞與限定詞為刻意差異）。
  - **匯出鈕之下載途徑**：必須走 `downloadViaBlob()` 之等價路徑（`fetch` → `Blob` → 程式化 `<a download>`），**不得**用 `window.open`／`<a href>`——後者之導覽式請求會送 `Accept: text/html` 而撞上 SPA fallback，使用者**靜默**拿到一個副檔名 `.csv`、內容是 app shell 的檔案（`frontend/src/api/download-blob.ts` 檔頭之明文禁令，本 repo 2026-07-25 已踩過同型 bug）。✅ **本端點採 `POST`（`OQ-X-01` 已定案）** ⇒ `downloadViaBlob()` **新增第三個選填參數**（`init?: { method?; body? }`，**additive**——既有全部呼叫端只傳兩個參數，`init` 為 `undefined` 時行為**逐字不變**）；有 `body` 時於**同一次** `fetch` 加上 `method: 'POST'` 與 `Content-Type: application/json`，🔒 **`Accept: application/octet-stream` 維持不變**。<br>🔴 **明文禁止另寫一份 `postDownloadViaBlob()`**：那會把 `download-blob.ts` 之三條防線各複製一份——(i) `Accept` 不得為 `text/html`、(ii) 檔名優先取 `Content-Disposition`、(iii) 錯誤走 `extractDownloadError()` ＋ `notifySessionLost()`——**三者各多一個漂移點**。

- **AC-X17**（🔴 請求驗證與**檢查順序**；🔒 **全部沿用既有錯誤碼，本 delta 不新增任何碼**）：Given 呼叫匯出端點, When 後端處理請求, Then **依下表之順序**判定（**順序即實作順序，不可顛倒**）——

  | 序 | 條件 | 結果 |
  |---|---|---|
  | ① | `documentIds` **缺席**／**非陣列**／**任一成員非字串** | **400 `VALIDATION_ERROR`**（**既有錯誤碼，非新增**），**整批拒絕**、**不產生任何檔案、不執行任何 DB 查詢** |
  | ② | `documentIds.length` **> 10,000** | **400 `EXPORT_ROW_LIMIT_EXCEEDED`**（訊息由**既有** `assertExportRowLimit(documentIds.length)` 產生，`{N}` 內插實際筆數且**排在上限值之前**；`AC-X12`） |
  | ③ | `documentIds.length` **=== 0** | **200**，回傳**僅含表頭列**之 CSV（非錯誤、非空檔；`AC-X13`） |
  | ④ | 某 id 於 DB 已不存在（載入清單與按下匯出之間被刪除） | **靜默略過該列**，其餘照常輸出——**不回 404、不中止整份匯出**；CSV 資料列數 ＝ `documentIds.length` − 查無筆數 |

  - 🔴 **① 沿用既有 `VALIDATION_ERROR`，本 delta 不新增任何錯誤碼**（`AC-X16` ⑨ 逐字續為有效、**未開任何例外**）。**依據**：`VALIDATION_ERROR` 為既有實作常數，語意即「請求 body 不合法」，且 **`DocumentsController.setStatus()` 已在同一個 controller 內使用之**（`documents.controller.ts` 之 `throw new BadRequestException('VALIDATION_ERROR')`）⇒ 同 controller、同語意、零新增碼、零 AC 例外，且錯誤仍可定位。
  - 🔴 **① 必須回一個明確之錯誤，不得靜默通過**：<br>　📝 **被否決之替代方案，逐字保留供追溯**：`OLD>` 「`body.ids` 缺席／非陣列 → **視同空陣列**（→ 走 ③，200 ＋ 僅表頭列）」（architecture-spec §13.2 ④ 第 1 列之修訂稿）。<br>　**否決理由（lead 2026-08-31 裁決）**：畸形 body 會退化成一份**看似成功**的僅表頭 CSV——「請求壞掉」與「0 筆符合」產生**逐位元組相同**之輸出 ⇒ **沒有任何測試能區分兩者**，使用者拿到檔案卻沒有任何訊號說它是壞的，而真正的病灶（前端送錯 body）**對兩端單元測試完全隱形**。這正是本 repo 反覆付出代價的靜默失敗形狀（`AC-D2` 第 10／11 列附錄／表單篩選漏映射端到端無作用、`AC-E10` 之「`undefined` ≠ `false`」、migration 白名單漏欄致「值人間蒸發」皆屬同一類）。<br>　📝 **另一被撤回之方案，逐字保留供追溯**：`OLD>` 「**400 `EXPORT_IDS_INVALID`**（🆕 本 delta 新增之錯誤碼）」。**撤回理由**：新增碼與 `AC-X16` ⑨ 相衝，而該鎖**無需為此開例外**——既有 `VALIDATION_ERROR` 已完全滿足需求。
  - 🔴 **① 之型別驗證必須先於 ② 之長度上限（本條最有價值處，與錯誤碼字面無關）**：長度檢查以「`documentIds` 是陣列」為前提，順序顛倒會對非陣列輸入取 `.length` 而得到 `undefined`，`undefined > 10000` **比較恆為偽** ⇒ **驗證靜默通過**，畸形請求一路走到組 CSV。
  - 🔴 **成員非字串一律整批拒絕，明文禁止靜默 `typeof` 過濾**（2026-08-31 lead 裁決）：<br>　📝 **被否決之替代方案，逐字保留供追溯**：`OLD>` 「`documentIds` 之**成員非字串** → 以 `typeof === 'string'` **過濾**該成員，**不整批拒絕**、**不回錯誤**」（architecture-spec §13.2 ④ 之表述，spec-writer 亦曾一度以「已知殘留風險」接受之）。<br>　**否決理由**：被過濾之成員會使 CSV 列數比預期短，而該現象與 ④ 之「該文件已被刪除」**在輸出上完全無從區辨** ⇒ 又一個「壞掉」與「正常」長得一模一樣的靜默失敗，與 ① 所要防的是**同一件事**。既然已為缺席／非陣列建了一條會出聲的路徑，把成員層的同類錯誤導向同一條路徑**沒有額外成本**，卻少一個看不見的洞。<br>　📌 **代價確實極小**：本端點之唯一呼叫端是我方前端，`documentIds` 來自 `filtered.map(d => d.id)`（型別上恆為 `string`）⇒ 正常路徑**永遠不會**觸發本項；它只在前端送錯時出現，而那正是我們最需要它出聲的時候。
  - **邊界**：`documentIds` 成員**重複**時，依請求順序輸出且**僅輸出一次**（取首次出現之位置）；成員為**空字串**為合法字串 ⇒ **不觸發 ①**，而落入 ④ 之查無並被靜默略過。
  - 🔒 **① 不適用於 `linkTargetId`**：該鍵為**選填**，缺席、為空字串或指向不存在之文件時**一律不視為錯誤**——其唯一用途是欄內排序，無命中即原樣回傳（`AC-X6`）。**不得**為它新增任何錯誤碼或驗證分支。

#### 效能與回歸鎖定

- **AC-X15**（🔴 效能：名稱解析與連結點富化不得 N+1）：Given 匯出 591 筆文件, When 量測 store／name-resolver 之查詢呼叫次數, Then 其次數**與匯出筆數無關**（固定值，與匯出 1 筆時相同）——匯出必須沿用 `DocumentsService.listDocuments()` 之**既有批次注入路徑**：依序呼叫**與清單完全相同**之五個既有私有方法 `enrichNames` → `enrichSecondaryChiefs` → `enrichIcsopPdf` → `enrichOjt` → `enrichLinks`（各為固定次數之批次查詢），**不得**逐列查詢、**不得**新增第二條富化路徑。
  - 📌 **建議（非必須）**：把該五行抽為私有 `enrichListItems(items)` 供清單與匯出兩處呼叫，使「匯出的值一定是清單的值」由**同一段程式碼**保證而非由紀律保證。⚠ 若實跑後既有 `documents.service.spec.ts` 因此轉紅，**正確處置是放棄抽取、於匯出路徑逐一呼叫同樣五個方法**（保證仍在，只是由紀律承擔）。
  - ✅ **讀取路徑已定案（architecture-spec §13.3；四步，順序不可顛倒）**：① **取工作集**——`store.list({ pageSize: EXPORT_ROW_LIMIT })`，**不帶任何篩選**（本 delta 之匯出為 load-all）；② **交集**——以請求之 id 建 `Set`，自工作集取命中者，查無之 id 直接略過（`AC-X17` ④）；③ **重排**——以 `Map<id, item>` 依請求之 id **原序**重排；④ **富化**——對**重排後之列**（非整個工作集）依序呼叫上列五個既有 enrich。<br>🔒 **`DocumentStore` 介面一格未動**：**不新增任何 store 方法、不新增任何 `DocumentListFilters` 欄位** ⇒ `list()`／`applyDocumentQuery()` 一行未改（`AC-X16` ②⑤）。<br>📝 **spec-writer 初稿之讀取路徑已作廢，逐字保留供追溯**：`OLD>` 「`DocumentStore` 新增**選填**成員 `findListItemsByIds?(ids)`；TypeORM 實作以 `chunkByParamBudget(keys, 1, 1000)` 切批以避開 MSSQL 2,100 參數硬上限」。**採納修訂之理由**：load-all ＋ 記憶體交集使 `DocumentStore` **完全不需改動**，比「新增選填成員」更強地滿足零漣漪；且步驟 ① 為**單一**查詢，不存在參數上限問題。
  - 🔴 **步驟 ① 之 `pageSize` 取 `EXPORT_ROW_LIMIT`（10,000）而非 `LOAD_SIZE`（2,000）**：使匯出之載入天花板**不低於**畫面之載入天花板，`AC-X11` 之「匯出恆等於畫面所見、不多也不少」在畫面自身被 `LOAD_SIZE` 截斷時**仍成立**（`OQ-X-03` 之既有缺口不因匯出而擴大）。
  - 🔴 **列序由服務層以請求之 id 原序重排**（`Map<id, item>`），**不得**沿用 store 或 DB 之回傳順序——那是本裁決全部價值之所在（`AC-X11` 可測形狀 ②）。
  - 📌 **本 delta 之匯出為 load-all**（文件為有界集合，正式站約 591 份），此為**刻意**——`AC-X11` 之範圍即「當前篩選之全部結果」，分批串流反而使「一次交易內之一致快照」變複雜而無實益。
  - ⚠ **最可能靜默退化之處**：`enrichOjt` 之三值聚合（跨 `DOC_USING_DEPT` × 場次）與 `enrichLinks` 之三次批次查詢——**逐列查一次是最直覺的寫法，即 N+1**，同時違反 [NFR-001](../nfr.md#performance)、`AC-J15` ⑤ 與 `AC-E10` 之同一條紅線。
  - 🔴 **名稱解析必須依公司分組批次**（`documents.service.ts` 之既有處置）：員編僅在單一公司內唯一，混批解析會把某公司員工的姓名誤植到另一公司的文件列上——匯出是**存查用途**，該錯誤落到 CSV 後會被當成事實。

- **AC-X16**（🔒 **零漣漪回歸鎖定**）：Given 本 delta 實作完成, When 檢視系統, Then 下列**全數維持綠燈、期望值一字未改**——
  - ① **本頁 15 欄之欄位集合、由左至右順序與各欄顯示規則逐字不變**（`AC-N37`／`AC-D9`／`AC-E9`／`AC-E14` ①／`AC-N40` ①／`AC-T48` ①／`AC-J15` ①）；**特別是「樹狀圖」欄仍存在於畫面**——它只是不匯出（`AC-X1` ⑤ (a)），**不得**被順手移除；
  - ② **13 項篩選之組成、順序、比對語意與 `AC-D10` 之文案／選擇器契約逐字不變**（`AC-D1`／`AC-D2`／`AC-D3`／`AC-D4`／`AC-D6`／`AC-D7`／`AC-J14`）——本 delta **不新增任何篩選控制項、不改任何既有控制項之值域**；
  - ③ **節點子樹 chip 之全部行為不變**（`AC-T40`～`AC-T48`，含 `AC-T46` 之清除方向性不對稱）；**「清除全部篩選」不因新增匯出鈕而改變其涵蓋範圍**；
  - ④ **3 張統計卡、排序、分頁、空狀態 `查無符合結果`、第 12 欄之摺疊與無檔案態（`AC-E1`～`AC-E14`）一律不變**；
  - ⑤ **`GET /admin/documents` 之回應形狀與六個頂層欄位（`items`／`total`／`page`／`pageSize`／`hasNext`／`subtreeFilter`）逐字不變**——本 delta **不擴充 `DocumentListItem`、不新增任何後端查詢參數**；且 **`applyDocumentQuery()`／`DocumentListFilters`／`typeorm-documents.store.ts` 之篩選段落一行未改**（後端不重跑篩選，`AC-X11`）。<br>🔒 **`DocumentStore` 介面亦一格未動**——匯出以 `store.list({ pageSize: EXPORT_ROW_LIMIT })` 取工作集後於記憶體交集，**不新增任何 store 方法**（`AC-X15`）。
  - ⑥ **[F018](F018-usage-form-management.md#name-and-export-column-delta)（`AC-X4`～`AC-X10`）／[F039](F039-appendix-management.md#export-delta)（`AC-D4`～`AC-D13`）／[F024](F024-access-history-query.md#export-fix-delta)（`AC-F1`～`AC-F19`）／[F037](F037-document-change-history.md#export-delta)／[F038](F038-lifecycle-tree-change-history.md#export-delta) 之匯出行為一字不變**——含其表頭、欄集、檔名 scope、回饋句式與權限；
  - ⑦ 🔒 **`backend/src/storage/csv-export.ts` 未被修改**（`git diff` 於該檔為空）——本 delta 只**呼叫**其既有匯出函式（`toCsvBuffer`／`assertExportRowLimit`／`exportFileName`／`joinLinkedDocumentNumbers`／`formatExportTimestamp`／`toTaipei`／`EXPORT_ROW_LIMIT`／`LINKED_DOC_NUMBER_SEPARATOR`），**不新增亦不改動該檔之任何 export**；**不得**為本頁分岔出第二份 CSV 產生器；**全庫 grep 不得出現第二個 BOM 常數、第二份注入前綴表、第二個 `EXPORT_ROW_LIMIT` 字面值**（[F039](F039-appendix-management.md#export-delta) `AC-D10` 之既有負向鎖定）。<br>📝 **本項曾於同日短暫放寬為「既有函式行為一字未改 ＋ 唯一改動為 `formatExportDate()` 之 additive export」，已由 lead 裁決恢復為上列嚴格字面**，兩次轉折逐字保留供追溯。<br>🔴 **恢復之依據（本項因此比放寬前更強，而非只是回到原點）**：放寬之目的是避免「該函式被另置一檔 ⇒ 兩份 `toTaipei()` 位移各自漂移」；改採 **`formatExportTimestamp(announcedDate).slice(0, 10)`**（`AC-X8`）後**根本不新增任何函式**，該風險由**結構**消滅而非由放寬容納。<br>✅ **已有機器鎖守住**：`documents.export.zero-ripple.spec.ts` 之負向鎖——`csv-export.ts` **不得**匯出 `formatExportDate`、全庫 `backend/src` **不得**出現第二份落點。
  - ⑧ **[F025](F025-role-function-matrix.md) 功能矩陣逐格不變、[F026](F026-role-field-matrix.md) 欄位矩陣逐格不變**——匯出沿用既有 `ICSOP 文件管理` 功能列，**不新增任何矩陣列**（`AC-X10`）；
  - ⑨ **不新增任何錯誤碼**——`EXPORT_ROW_LIMIT_EXCEEDED`／`VALIDATION_ERROR`／`PERMISSION_DENIED` **三者皆為既有碼且語意不變**（`AC-X17`）。<br>📝 **本項曾於同日短暫被推翻（改為「恰新增一個錯誤碼 `EXPORT_IDS_INVALID`」），已由 lead 撤回並復原為原字面**，往返過程逐字保留供追溯。<br>🔴 **復原之依據（本項因此比先前更強，而非只是回到原點）**：乙案之請求 body 確實需要一個明確之驗證失敗代碼，但**該需求由既有 `VALIDATION_ERROR` 完全滿足**——它是既有實作常數、語意即「請求 body 不合法」，且 `DocumentsController.setStatus()` 已在同一個 controller 內使用之。⇒ **「需要明確錯誤」與「不新增錯誤碼」兩者並不衝突**，先前之推翻建立在「非新增不可」這個未經查證的前提上。<br>🔒 **本項自此為硬鎖**：本 delta **不得**新增任何錯誤碼；若日後出現既有碼確實無法表達之情形，須先證明**全部既有碼皆不適用**再談例外。
  - ⑩ **必須觸及之既有程式路徑恰三處，三者皆為 additive 或行為恆等，且既有測試皆不預期轉紅**：<br>　(i) `backend/src/main.ts` 之 bootstrap（`bodyParser: false` ＋ 自行掛回全域 parser ＋ **僅對 `/admin/documents/export` 放寬至 `1mb`**；`OQ-X-04` 已定案，**全站其餘 endpoint 之 payload 面一格未動**；`bootstrap()` 無單元測試，DI smoke 走 `AppModule` 不經 `main.ts`）；<br>　(ii) `frontend/src/api/download-blob.ts` 之第三個**選填**參數（`AC-X14`；`init` 為 `undefined` 時**既有全部呼叫端行為逐字不變**）；<br>　(iii) `frontend/src/pages/DocumentListPage.tsx` 之 **`orderedLinks()` 行為恆等抽出**（`AC-X6`；把 `LinkCell` 內既有 inline `useMemo` 原樣搬進一個具名匯出純函式，**輸出一字不變** ⇒ 既有渲染測試全綠）。<br>　**除此三處與新增檔外，不得觸及任何既有程式路徑。**<br>📝 **本項曾寫為「恰兩處」（缺 (iii)），已於同日就地更正**——(iii) 係因 `AC-X6` 之可測形狀需要一個**可斷言的前端對象**而必要，逐字理由見 `AC-X6`。<br>📝 **另一度列入之第三處已隨讀取路徑改版而消失，逐字保留供追溯**：`OLD>` 「`DocumentStore` 之**選填**成員（既有 fake 不實作亦通過型別檢查）」——現行讀取路徑為 load-all ＋ 記憶體交集，**`DocumentStore` 介面一格未動**（`AC-X15`）。

## Interface Contract（端點） {#interface-contract}

> ⚠ **本檔歷來無完整端點表**（清單之行為與資料契約以 Main Flow ＋ AC 描述，端點形狀由 system-architect 決定）。本節**僅登錄 2026-08-31 匯出 delta 所新增之單一端點**，不追溯補齊既有端點；`GET /admin/documents`／`GET /admin/documents/:id`／`:id/links`／`:id/ojt-completion` 等既有端點之形狀維持現況、不受本節影響。

> ✅ **`OQ-X-01` 已於 2026-08-31 由 system-architect 定案（採乙案）**，本表之「方法」與「路徑」兩格已回填；權威＝`architecture-spec.md` §13（決策 D1～D4）。

| 方法 | 路徑 | 權限閘門 | 語意與回應 |
|---|---|---|---|
| **POST** | `/admin/documents/export` | 功能 `ICSOP文件管理`（`FunctionKey.ICSOP_DOCUMENT_MANAGEMENT`）**`read`** | **（2026-08-31 新增）** 匯出後台文件清單為 CSV。**範圍＝畫面當前 13 項篩選 ＋ 節點子樹 chip 套用後之全部列**（非當前頁），**列序＝畫面當前排序**（`AC-X11` 之三項不變式）。回 `Content-Type: text/csv; charset=utf-8` ＋ `Content-Disposition: attachment; filename="documents_{YYYYMMDD}_{HHmmss}.csv"`（`AC-X13`），body 為 `toCsvBuffer()` 之 **Buffer**。驗證與檢查順序見 `AC-X17`（`VALIDATION_ERROR`（型別）→ `EXPORT_ROW_LIMIT_EXCEEDED`（長度）→ 0 筆僅表頭 → 查無靜默略過）。**不寫稽核**（`AC-X10`）。十四欄之表頭與各欄之值見 `AC-X1`／`AC-X3`。 |

**Request body — ✅ 恰兩鍵，逐字鍵名已定案**：`{ documentIds: string[]; linkTargetId?: string }`

| # | 逐字鍵名 | 必填 | 型別 | 說明 |
|---|---|---|---|---|
| 1 | **`documentIds`** | ✅ | `string[]` | ＝畫面 `filtered` 之逐列 id（13 項篩選 ＋ 子樹 chip 施加後、排序後、**分頁前**）。**順序即 CSV 列序**（`AC-X11` ②）。🔴 **不是 `pageRows`、不是 `all`** |
| 2 | **`linkTargetId`** | ⬜ 選填 | `string` | ＝畫面 `filters.link` 之值。**唯一用途＝第 12 欄之欄內順序**（`AC-E6` 命中者排第一顆，`AC-X6`）；未套用該篩選時省略。🔒 **不得被用於任何篩選判定** |

- ✅ **鍵名定案為 `documentIds`／`linkTargetId`**（逐字同 architecture-spec §13.2 ③ 之 `documentIds: string[]`，該章為本契約之權威）。<br>📝 **被否決之字面逐字保留供追溯**：`OLD>` `ids`（架構初稿與 lead 2026-08-31 轉交文所用；spec-writer 完工回報則一度用過 `documentIds`——**三份文件曾同時存在兩種寫法**，本次收斂為單一字面）。<br>**否決理由（已由 spec-writer 實地查證，非採信）**：① **本 repo 之 wire 層 id 鍵一律 entity-qualified**（`linkTargetId`／`appendixId`／`formId`／`nodeIdIn`／`secondaryChiefIds`／`usingDeptIds`／`targetDocumentId`…），全庫 `backend/src` 與 `frontend/src` grep **無任何裸 `documentIds` 作為 DTO／查詢鍵之前例**（僅見於一個前端測試檔之 fixture 物件字面量，非契約）；② **同一個 body 內之 `linkTargetId` 本身也是一個文件 id**，裸 `documentIds` 與它並置時讀者無從判斷兩者是不是同一種東西；③ `documentIds` 於 `backend/src` 已有既有用例（如 `findSecondaryChiefsByDocumentIds(documentIds)`）。
- 🔒 **語意契約**：恰兩鍵、`documentIds` 必填且順序即列序、`linkTargetId` 選填且僅供排序——**多送任何一個篩選鍵即違反本契約**（多一個篩選鍵，就等於在後端開了一扇「也許該重跑一下篩選」的門，而那正是本裁決要關掉的東西）。
- **驗證**：`documentIds` 缺席／非陣列 → **400 `VALIDATION_ERROR`**（既有碼）；**任一成員非字串亦同**（整批拒絕，🔴 禁止靜默 `typeof` 過濾）；`linkTargetId` 無論何值**皆不觸發驗證錯誤**。逐列見 `AC-X17`。
- 🔴 **閘門為 `'read'`，`POST` 不改變此事**（`AC-X10`）：`RolePermissionGuard` 只看 `@RequirePermission` 之**第二個引數**。改成 `'write'` 會讓 **SysAdmin／Supervisor／DeptContact 三種唯讀角色連匯出都不能用**。
- 🔴 **為何是 POST 而非 GET**（architecture-spec §13.2 ①，前兩條為硬性）：① **URL 容量**——上限 10,000 個 36 字元 uniqueidentifier ＋ 分隔符 ≈ **370 KB**，而 nginx `large_client_header_buffers` 預設 `4 8k`、本站前門（`infra/edge/*.conf`）與前端 nginx（`frontend/nginx.conf`）皆未調高 ⇒ 414／400，且錯誤訊息與「匯出」毫無關聯；即使以今日 591 份計亦已達 **≈ 22 KB**，早已超出預設 header 預算，**無任何編碼能把 10,000 個相異 UUID 壓進可用之 URL 長度**。② **語意誠實**——body 是「查詢對象集合」，POST 於此表達的是「查詢太大，放不進 URL」。③ **無副作用**——不寫稽核、不寫任何資料表，與 `AppendicesService.exportPool()`／`UsageFormsService.exportPool()` 完全同型。
- 📝 **路由遮蔽風險：本裁決採 POST，故該風險不適用**（architecture-spec §13.2 ②）。<br>**被推翻之前提逐字保留供追溯**：OLD> 「🔴 若改採 `GET`，該路由**必須宣告於 `@Get(':id')` 之前**（`export` 為固定段，參數路由先宣告會把它吃成 `:id`）」。<br>**推翻依據**：`DocumentsController` 現有路由為 `@Get()`／`@Get(':id')`／`@Get(':id/links')`／`@Get(':id/ojt-completion')`／`@Post()`／`@Patch(':id')`／`@Patch(':id/status')` ⇒ **無任何 `@Post(':id')` 單段參數路由**，`@Post('export')` 今日**不可能**被遮蔽（`@Post()` 為零段路由，與單段之 `export` 不同構）。<br>🔴 **仍應遵守之紀律（面向未來，非今日之修復）**：`@Post('export')` **緊接 `@Post()` 之後**宣告；**日後若有人新增 `@Post(':id')` 系列路由，必須宣告於 `@Post('export')` 之後**。此紀律須以註解就地記錄於 controller（比照 `usage-forms.controller.ts:91-95` 之既有明文）。
- 🔴 **body-parser 上限（✅ 已定案，`OQ-X-04`）**：`backend/src/main.ts` 現行沿用 `body-parser` 預設之 **100 KB** JSON 上限，而 10,000 筆之 body ≈ **400 KB**、2,000 筆（`LOAD_SIZE` 天花板）≈ **80 KB（僅餘 20% 餘裕）** ⇒ 不放寬則 `assertExportRowLimit()` 成為**不可達程式碼**（請求先被擋成 413，而兩端單元測試都會綠）。**裁決＝只對本端點路徑放寬至 `1mb`**（`app.use('/admin/documents/export', json({ limit: '1mb' }))`），**全站其餘 endpoint 維持預設 100 KB**。<br>📝 **被 lead 退回之原案逐字保留供追溯**：`OLD>` 「於 `main.ts` 顯式提高**全域** JSON body 上限至 `1mb`」——退回理由＝全站 payload 面放寬 10 倍以服務單一端點，範圍與收益不成比例。<br>⚠ **掛載路徑是字面 URL path、非 Nest 路由** ⇒ 不跟隨 `setGlobalPrefix()`；且 `bodyParser: false` 後**必須自行掛回**全域 `json`／`urlencoded`（順序不可顛倒）。此為 bootstrap 結構變更，其回歸**完全落在部署前 smoke**（本輪環原理上測不到，architecture-spec §13.5 #1 #2）。
- 🔒 **無論如何**：`GET /admin/documents` 之端點、參數與回應形狀**逐字不變**（`AC-X16` ⑤）；`backend/src/storage/csv-export.ts` **一行未改**——本端點只呼叫其既有匯出函式，`公告日期` 欄取 `formatExportTimestamp(announcedDate).slice(0, 10)`（`AC-X8`／`AC-X16` ⑦）。

## Error Scenarios
- 空結果/搜尋跳脫：見 [error-handling.md#public](../error-handling.md#public)。分頁效能見 [NFR-001](../nfr.md#performance)。
- **子樹參數殘缺／無法解析**：**不視為錯誤**——靜默 no-op、HTTP `200`、不顯示 chip（`AC-T41`）；不寫任何稽核、不產生錯誤碼。
- **匯出（2026-08-31 delta）**：規則權威＝[error-handling.md#export](../error-handling.md#export)（五處匯出共用）。🔴 **不新增任何錯誤碼**——下列三者**皆為既有碼**（`AC-X16` ⑨）。**檢查順序＝ `AC-X17` 之逐列表，不可顛倒。**

  | 錯誤碼 | HTTP | 觸發情境 |
  |---|---|---|
  | `VALIDATION_ERROR` | 400 | **既有碼**（`DocumentsController.setStatus()` 已在用，同 controller 同語意）。匯出請求之 **`documentIds` 缺席／非陣列／任一成員非字串**（整批拒絕）；**不產生任何檔案、不執行任何 DB 查詢**（`AC-X17` ①）。📝 **被撤回之 `OLD>` `EXPORT_IDS_INVALID`（新增碼）** 與 **`OLD>` 「視同空陣列 → 200 ＋ 僅表頭列」** 兩案之否決理由見 `AC-X17` |
  | `EXPORT_ROW_LIMIT_EXCEEDED` | 400 | **既有共用碼**。匯出筆數 **> 10,000**；**不產生任何檔案、不回傳部分結果**；恰 10,000 通過（`AC-X12`／`AC-X17` ②）。使用者可見文案見 `AC-X14` |
  | `PERMISSION_DENIED` | 403 | **既有碼**。**一般使用者（User）** 呼叫匯出端點（路由層；ICSOPAdmin／SysAdmin／Supervisor／DeptContact 四者皆允許，`AC-X10`） |

  🔒 **不產生錯誤碼之三種情形**（`AC-X17` ③④、`AC-X6`）：`documentIds.length` 為 0（回 200 僅表頭）、某 id 查無（靜默略過）、`linkTargetId` 缺席或無命中（原樣排序）。

## Related
- Data: [ICSOP_DOCUMENT（19 欄位）](../data-model.md#document-entity)
- Depends on: [F010](F010-create-document.md), [F012](F012-document-status-toggle.md)（狀態衍生）, [F014](F014-accountable-dept-chief.md)（制定組織/當責室長）, [F016](F016-pdf-ojt-attachment.md)（檔案下載）
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（`lifecycleDisplayName` 顯示規則、篩選值＝`lifecycleId`）
- Related: 樹狀圖預覽（第二入口）見 [F036](F036-lifecycle-tree-preview.md)；DAG 資料見 [F008](F008-dag-node-edge.md)/[F009](F009-node-drawer-maintenance.md)；連結點見 [F015](F015-document-cross-link.md)
- **2026-08-21 使用者裁決（三項裁決第 3 項）**: 節點子樹 deep link 篩選（`AC-T40`～`AC-T48`）。上游＝[F036 子樹抽屜之導向鈕](F036-lifecycle-tree-preview.md#subtree-drawer-delta)；傳播紀錄＝`docs/ui-ux-design-overview.md` §A.7。<br>✅ **system-architect 已定案（2026-08-21，`architecture-spec.md` 第 12 章 C1／C3）**：① 子樹走訪＝後端 `descendants()`（`backend/src/lifecycle/lifecycle-tree-layout.ts`，**非**遞迴 CTE——純記憶體圖走訪，語意由 [F036 `AC-T28`](F036-lifecycle-tree-preview.md#subtree-drawer-delta) 之 F1–F5 向量釘死），解析置於 **service 層**、以 `DocumentListFilters.nodeIdIn`（選填）下推為單一 SQL `IN`，**store 不承擔圖走訪**；② 描述子契約＝頂層 `subtreeFilter`（`AC-T45` 已補完）；③ 下推順序與 `linkTargetId` 之既有樣板同構，未新增效能顧慮。
- 對比前台: [F019](F019-public-list-browsing.md)（後台不套用部門置頂；**「當責室長」比對語意兩處必須一致，見 `AC-D7`**）
- **2026-08-20 使用者裁決（D9 delta）**: `OQ-D9-25`（新增獨立欄置於最左）／`OQ-D9-26`（沿用 `有 OJT`／`無 OJT` 字面）。見 [§OJT 圖示欄 delta](#ojt-icon-column-delta)。**⚠ 待 ui-ux-designer**：`prototypes/13-document-list.html` 表頭最左新增 `OJT` 欄並依 `AC-N38`／`AC-N39` 逐字實作兩態圖示與 DOM 掛鉤。
- **2026-08-16 使用者裁決**: OQ-D18-08／10／11／12／13（見 [§篩選 9 → 13 項 delta](#filter-13-delta)）。新增篩選之資料來源：[F039](F039-appendix-management.md)（附錄）、[F018](F018-usage-form-management.md)（使用表單，含 `formNumber` 顯示字串）、[F016](F016-pdf-ojt-attachment.md)（OJT）。
- **2026-08-31 使用者裁決（清單匯出 CSV）**: 匯出欄位＝**畫面 15 欄去掉「樹狀圖」＝14 欄**。見 [§清單匯出（CSV）delta](#export-delta)（`AC-X1`～`AC-X17`）＋ [§Interface Contract](#interface-contract)。共用規則權威＝[error-handling.md#export](../error-handling.md#export)（v1.9 起為**五處**）；產生器＝`backend/src/storage/csv-export.ts`（**只用不改**）；同型兩處＝[F018](F018-usage-form-management.md#name-and-export-column-delta) `AC-X4`～`AC-X10`／[F039](F039-appendix-management.md#export-delta) `AC-D4`～`AC-D13`。
  - **⚠ 待 ui-ux-designer（本 delta 新增）**：`prototypes/13-document-list.html` 之 topbar 動作區新增「匯出」鈕——可見文字與 `aria-label` 逐字 `匯出`、`title` 逐字 `匯出程序書清單（CSV）`、icon 鍵 `download`、**置於 `建立程序書` 鈕之左**、**不得**加 `.write-only`（`AC-X9`）。版型逐字樣板＝`prototypes/24-appendix-management.html:86`。
  - ✅ **system-architect 已定案（2026-08-31，`architecture-spec.md` §13 決策 D1～D4）**：① `OQ-X-01` → **乙案**（`POST /admin/documents/export`，body 恰兩鍵，後端不重跑篩選與排序）；② `OQ-X-02` → OJT 三值標籤表落於 `backend/src/documents/ojt-completion.reader.ts`（與 `deriveOjtStatus()` 同檔，`AC-X4`）；③ 連結點排序純函式 `orderLinksForExport()` 落於 `backend/src/documents/`（`AC-X6`；🔴 **前端須配套抽出 `orderedLinks()` 為匯出純函式**，否則本條之「逐案輸出相等」沒有可斷言對象）；④ 讀取路徑＝load-all ＋ 記憶體交集 ＋ 依請求順序重排，**`DocumentStore` 介面一格未動**（`AC-X15`）；⑤ `downloadViaBlob()` 新增第三個選填參數（`AC-X14`）；⑥ `公告日期` 欄之取值＝既有 `formatExportTimestamp().slice(0, 10)`，**不新增 `formatExportDate()`**、`csv-export.ts` 一行未改（`AC-X8`，2026-08-31 lead 就地改裁）。
  - ✅ **body 鍵名已定案為 `documentIds`／`linkTargetId`**（`OQ-X-01` 之殘留項結案，逐字同 architecture-spec §13.2 ③；裸 `ids` 不採——全庫無裸 `ids` 作為 wire 鍵之前例，理由見 [§Interface Contract](#interface-contract)）。**規格側全檔已無第二種寫法。**
  - ✅ **畸形 body 之處置已由 lead 裁決（2026-08-31）＝既有 `VALIDATION_ERROR`**：兩個被否決之方案——架構初稿之「視同空陣列 → 200 ＋ 僅表頭列」（靜默失敗）與短暫採用之新增碼 `EXPORT_IDS_INVALID`（與 `AC-X16` ⑨ 相衝且非必要）——其字面與否決理由逐字保留於 `AC-X17`。⇒ **architecture-spec §13.2 ④ 第 1 列、§13.6 之被否決清單、[open-questions §✅ 裁決](../open-questions.md#x-arch-decisions) 三處須同步改為 `VALIDATION_ERROR`**（該三處非 spec-writer 所有）。
  - ✅ **`AC-X7` 之「今日」基準已依 architecture-spec §13.7 交回項覆核並改寫**：`new Date()`，**明文禁止對其套用 `toTaipei()`**；含台北 00:00–08:00 窗口之可測形狀（`AC-X7`）。
  - **🔴 待 lead 核准**：`backend/src/main.ts` 之 body-parser JSON 上限 100 KB → 1 MB（`OQ-X-04`）——**不核准則 `AC-X12` 之上限錯誤路徑成為不可達程式碼，而兩端單元測試都會綠**。
- **待 system-architect（本 delta 新增）**：① 13 項篩選之後端下推策略（現況為前端於完整工作集上客端篩選＋`linkTargetId` 例外查詢；新增之附錄／使用表單／OJT／日期區間是否一併下推至 SQL，關乎 [NFR-001](../nfr.md#performance)）；② 「當責室長」主要∪次要之 `DOC_SECONDARY_CHIEF` join 策略（須與 [F019](F019-public-list-browsing.md) `AC-D7` 共用同一實作）；③ 篩選選項來源端點（後台無可見性過濾義務，與前台 [F019](F019-public-list-browsing.md) `AC-D5` 之端點是否共用）。
