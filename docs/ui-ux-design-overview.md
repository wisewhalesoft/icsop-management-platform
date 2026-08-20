---
title: ICSOP 文件管理平台 — UI/UX 設計總覽
project: ICSOP Document Management Platform
version: 1.5 (Phase 0 — 設計總覽；2026-08-20 D9 缺失／變更 delta 9 項傳播完成)
date: 2026-08-20
author: UI/UX Designer (Claude)
status: 🟢 APPROVED（全檔；v1.2 及以前 2026-08-07 通過，v1.3／v1.4 之 F041 段落 2026-08-11 通過，**v1.5 之 D9 段落 2026-08-20 人類閘門逐題裁決後傳播**）
covers: F001–F041 (E01–E10 ＋ F040／F041 橫切)
---

# ICSOP 文件管理平台 — UI/UX 設計總覽

> 本文件為 **Phase 0 設計總覽（單一真實來源）**，於任何 prototype HTML 產出前先行定案。
> 本輪**僅**產出本檔；`/prototypes/*.html` 與 `/design/*` 於使用者確認本總覽後之下一輪才建立。
>
> **v1.1（2026-08-06）併入 E10 附錄管理（F039）**：新增 Phase H 與 `24-appendix-management.html`（合計 25 檔）；附錄傳播至 `14`／`15`（可搜尋多選＋**上移／下移**有序清單，見 §6.17）、`16`／`04`（依 `sortOrder` 呈現＋「無附錄」空狀態）、`18`（功能列「附錄管理」＋欄位列「附錄（多）」，欄位數 19→**20**）、`07`（sidebar ＋儀表板卡）、`02`（角色職掌文案）；後台側選單「附錄管理」已同步至**全部 16 個內嵌 `const MENU` 之 prototype**（§9 驗證項 8）。OQ-E10-01 之 UI 裁定見 §附錄 A.1。
>
> **🟢 v1.3／v1.4 併入 F041 一般使用者子分類「業務／其他」（2026-08-10 草擬 → **2026-08-11 人類閘門通過，12 項裁決全數下達**）**：一般使用者（`roleCode='User'`）再細分為 **業務**（`userSubtype='business'`）／**其他**（`'other'`），業務者前台**僅可見「使用部門相符（子樹展開）」之已公告文件**。**不新增檔案**（共維持 25 檔），以最小增量改 **4 個既有 prototype**：`08`（指派角色 modal 之子分類選擇器＋角色欄子分類徽章）、`03`（業務視角之可見性過濾＋示範視角切換器＋**業務專屬頂部說明句**）、`04`（直連拒絕面板，**定稿為 404 `DOCUMENT_NOT_FOUND`**）、`18`（註記橫幅；**矩陣逐格不變、不新增第 6 欄**）。共用規則見 **§6.20**；**12 項裁決紀錄與「當初若改選其他選項會如何」之追溯對照見附錄 A.3**；驗證見 §9 第 11 項。
>
> **v1.4（2026-08-11）之唯一實質變更**＝`03` 頂部說明句於**業務視角換為專屬文案**（人類採納本 agent 於附錄 A.3.3 第 1 條之提報）。逐字內容見 **§6.20 (d)** 與 **附錄 A.3.3 第 1 條**，**下游 test-generator 會逐字斷言**。空狀態文案**未變**——仍為 `查無符合結果` 逐字、不因子分類分支（OQ-E08-07 4c 裁決 A）。`05` 檢視器**未改檔**（理由見附錄 A.3.2 第 9 條）；`17-access-history` 亦**未改檔**（OQ-E08-10 裁決 A：不記錄拒絕稽核）。
>
> **🔴 v1.5（2026-08-20）併入 D9 缺失／變更 delta（9 項）——人類閘門 `OQ-D9-01`～`OQ-D9-34` 全數已裁決**：
> ① **浮水印全域加深**（`AC-N1`／`AC-N2`）＝**`#334155` @ `opacity 0.30`**（有效色 `rgb(193.8,198.0,204.0)`、與白底對比度 **≈ 1.716:1** ≥ 門檻 1.70）——**定稿值逐字照抄，不得自行挑近似色**；載體自 5 處減為 **4 處**（`22`／`23` 之 DOM 疊加 ＋ PDF 燒錄 ＋ prototype 權威）。
> ② 🔴 **前台檢視器 `05` 改自繪 canvas**（`AC-N4`）＋ **DOM 疊加層整段移除**（`AC-N7`）＋ **縮放改為依倍率重新渲染**（`AC-N8`／`AC-N9`）。**`22`／`23` 之疊加層必須保留**（`AC-N66`）——那兩頁渲染 HTML、沒有內容層可燒錄。**`05` 之下載／列印鈕與頁尾格式字幕保留**（`AC-N5`／`AC-N67`）。
> ③ **浮水印公司名稱改用簡稱**（`AC-N10`～`AC-N13`）＝`和潤企業`；🔒 帳號管理／`GET /companies`／`17` 調閱歷程之「公司」欄**仍為全稱**、逐字不動。
> ④ 🔴 **後台四類下載一律燒錄＋一律寫稽核、無例外角色**（`AC-N14`～`AC-N18`；`OQ-FM-01`／`OQ-D18-01` 正式失效）⇒ **後台各檔案列亦渲染 `data-wm-note`**（`AC-N20`）：`13`／`15`／`16`／`19`／`24`。
> ⑤ **前台字級整體上移一階**（`AC-N59`～`AC-N62`；僅 `03`／`04`／`05` 三頁）：`text-sm`→`text-base`、`text-xs`→`text-sm`；🔒 **後台與 `00` 之字級 tokens 表逐字不動**（前後台字級自此永久分歧，`00` 已加註說明）。
> ⑥ 🔴 **OJT 簽到表破例**（`AC-N22`～`AC-N35`）：主管／部門窗口對 **OJT 一欄**可上傳／覆蓋，**其餘 19 欄與另兩類附件＋附錄仍唯讀**（`AC-N24`／`AC-N25`＝本輪最重要之回歸鎖定）；系統管理員維持唯讀（`AC-N26`）。落點＝`16`（主入口）＋`15`（一致化）。
> ⑦ **使用表單新增／編輯整頁化**（`AC-N41`～`AC-N49`）：**新增 2 檔** `19a-usage-form-create.html`／`19b-usage-form-edit.html`（命名沿用 `17a-*` 之前例），`19` 之兩個 modal 移除；清單新增「制定部門」欄（`AC-N47`）。**合計 28 個 prototype 檔**（📌 更正：`17a` 於 2026-08-18 加入時未計入，故本輪一併校正）。
> ⑧ **`13` 最左新增「OJT」圖示欄**（`AC-N37`～`AC-N40`），清單 14 欄 → **15 欄**。
> ⑨ **`17` 新增第四種類型篩選值「上傳」**（`AC-N53`／`AC-N69`／`AC-N70`）。
> **本 agent 之裁量、逐字文案定稿與新提報之 `OQ-D9-35` 見附錄 A.6。**
>
> **v1.2（2026-08-07）併入 F040 循環子分類（🟢 APPROVED — 2026-08-07 人類閘門通過）**：循環新增**非必填** `subcategory`，循環之業務身分改為 `(name, subcategory)` 組合。**不新增檔案**（共維持 25 檔），以最小增量傳播至 11 個既有 prototype：結構性變更＝`10`（子分類欄位＋兩個新錯誤提示）、`14`／`15`（「所屬循環」改**兩段式**選取）；顯示/取值變更＝`13`／`03`／`04`／`16`／`11`／`12`／`22`／`23`（一律經 `lifecycleDisplayName`；所有循環下拉之選項值由名稱字串改為 `lifecycleId`）。共用規則見 **§6.19**；驗證見 §9 第 10 項。**ICSOP 文件編號不受影響**——第 2 段循環代碼仍僅依循環名稱查表（同名不同子分類代碼相同）。

---

## 1. Context（背景與目的）

### 1.1 專案背景
公司現行 ICSOP（Instruction / Control / Standard Operating Procedure）文件管理分散、缺乏統一瀏覽入口、身分追溯與流程結構化。本平台建立單一系統：讓一般同仁以 **RWD 前台**瀏覽/搜尋/下載/列印文件（含身分浮水印與稽核追蹤），並讓管理者以「循環（Life Cycle）DAG」結構維護文件、帳號、權限與組織同步。

### 1.2 已完成之上游交付（本設計之輸入）
| 交付物 | 位置 | 狀態 |
|--------|------|------|
| Spec 索引 | `docs/specs/spec-index.md` | Draft v1.0 |
| 產品總覽 / 使用者故事總覽 | `docs/specs/overview.md`、`docs/stories/overview.md` | Draft |
| 41 份 Feature 規格 | `docs/specs/features/F001–F041-*.md` | Draft（`F039` 附錄管理 2026-08-06；`F040` **循環子分類** 2026-08-07，🟢 APPROVED（2026-08-07 人類閘門通過）；`F041` **一般使用者子分類** 2026-08-10 草擬，**🟢 2026-08-11 人類閘門通過（12 項裁決；spec 檔本身之狀態標記由 spec-writer 收尾）**） |
| 資料模型（20 欄位權威定義；含 F039「附錄」、F040 `LIFECYCLE.subcategory` 與 INV-1～INV-3） | `docs/specs/data-model.md` | Draft |
| 非功能需求（RWD 斷點、浮水印格式） | `docs/specs/nfr.md` | Draft |
| 錯誤處理（錯誤碼 ↔ 訊息契約） | `docs/specs/error-handling.md` | Draft |
| 系統架構（路由/RBAC/浮水印管線） | `docs/specs/architecture-spec.md` | Draft |
| 流程圖 | `docs/specs/diagrams/*.mmd` | Draft |

### 1.3 本設計目的
1. 將 41 個 feature 的互動需求轉為**可於瀏覽器直接預覽**的高擬真互動原型。
2. 建立一套涵蓋**前台 RWD（行動優先）**與**管理後台（桌機優先）**的一致設計系統與 token。
3. 對 spec 中標示「待 UI/UX 定義」之開放問題（尤其浮水印視覺樣式 OQ-NFR007a/b）提出可驗證的設計提案。
4. 讓前端工程（React + TS）能以原型為視覺與互動契約落地。

---

## 2. 設計決策（Design Decisions）

| 決策項 | 選擇 | Rationale（理由） |
|--------|------|-------------------|
| **色彩模式** | Light mode（單一），本輪不做 dark mode | 企業內部合規/文件系統以可讀性與列印一致性為先；WCAG AA 對比在淺色底最易穩定達標；與稽核/浮水印呈現需求相符。dark mode 列為未來擴充。 |
| **元件風格** | shadcn/ui 風格的簡潔企業級（Tailwind utility、圓角 `rounded-md`、細邊框 `border-slate-200`、克制陰影） | 前端技術棧為 React + TS，shadcn 風格可 1:1 對應落地；中性、專業、低裝飾，符合合規系統氣質。 |
| **主色（品牌色）** | 柔和淡藍/periwinkle，anchor `#98B6E4`，衍生深階 `#365C97`（按鈕/連結，白字對比 6.7:1）；**背景以白色 `#FFFFFF` 為主**，層次處用極淺中性 `#F8FAFC`(slate-50) | 使用者指定之品牌配色（定案）。`#98B6E4` 偏亮不可直接當按鈕底配白字，故建立 tonal ramp：淺階作淡底/選中/chip、anchor 作次要強調與 focus ring/DAG 選中邊、**深階 `#365C97`/`#2A4A7E` 供需白字的主要按鈕/連結**（AA ✅）。**背景已由米白改為白色**：大面積以白為主，僅於區塊分隔/表頭/DAG 畫布底/前台清單底用 `#F8FAFC` 提供層次，卡片/表格/輸入維持白底以維可讀性。與 emerald（有效）/amber（失效）/rose（作廢）狀態色仍有足夠色相區隔。 |
| **Icon set** | Lucide（CDN `lucide@latest`） | 對應前端 `lucide-react`，線性風格與 shadcn 一致，CDN 可 self-contained 載入。 |
| **語言 / 字體** | zh-TW；`Inter`（拉丁/數字）+ `Noto Sans TC`（中文） | 已定案 zh-TW；Inter+Noto Sans TC 為中英混排最佳穩定組合，數字/編號可讀性佳（文件編號、員工編號密集）。 |
| **前台 viewport 策略** | **行動優先 RWD**；斷點 360 / 768 / 1024 / 1440，觸控目標 ≥44×44px | 依 NFR-005 AC2/AC3；一般使用者多在行動裝置查閱 SOP，故 mobile-first。 |
| **後台 viewport 策略** | **桌機優先**，基準 1440px、最小 1280px；DAG 畫布桌機為主（≥1024px 可用、平板/手機降級唯讀提示） | 依 NFR-005 AC4；後台為密集表格/矩陣/DAG 畫布，桌機操作為主。 |
| **登入雙軌呈現** | 登入頁主體為「管理員帳密表單」；另置「透過公司入口（上游 SSO）登入」按鈕代表上游簽章途徑 | 上游簽章實為 system-to-system POST（非人工填表，見 architecture §5.3）；以 SSO 按鈕在 UI 上具象化該途徑，不誤導使用者手填簽章。 |
| **角色分流** | 一般使用者登入後**直接進前台**；其餘 4 角色先顯示「前台 / 後台」選擇卡；後台選單依 F025 逐角色裁切 | 依 F002 定案。 |
| **RBAC 呈現手法** | 每頁頂部置「角色模擬器」下拉（5 角色），以 `body[data-role]` + CSS 顯示/隱藏切換選單與欄位唯讀態 | 讓單一原型即可演示 5 角色的功能矩陣（F025）與欄位矩陣（F026），便於審查；前端落地時改由後端矩陣驅動（前端非唯一防線）。 |
| **表單策略** | 失焦即時驗證 + 送出時錯誤彙整；必填以 `*` 標示；錯誤訊息一律採 error-handling.md 的 zh-TW 契約文案；編輯採「目前值 / 新值」並列對照 | 依 F011（版本對照）、error-handling（錯誤碼→訊息）。 |
| **破壞性/高風險操作** | 一律二次確認對話框（刪除節點、移除表單、角色降級、文件改派、狀態切換為作廢） | 依 F003/F008/F009/F012/F018 之二次確認要求。 |
| **非同步回饋** | Toast（成功/失敗）+ 進行中狀態（立即同步輪詢、DAG 儲存、上傳）；稽核寫入失敗不阻斷瀏覽 | 依 F004（輪詢自動更新）、F023（非阻斷）。 |
| **浮水印視覺（已確認 OQ-NFR007a/b ✅）** | 對角 45°、平鋪重複、opacity ≈ 0.12、字級 14px、色 `slate-500`；文字＝`員工編號-姓名-公司名稱-部門-處/室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-YYYY-MM-DD HH:mm:ss (UTC+8)`（含固定機密聲明；呈現時該聲明另起一行獨立顯示） | 使用者已確認採納此樣式與時間格式。檢視器疊加、PDF 燒錄、稽核快照三者字串**完全一致**。 |

---

## 3. 色彩系統（Color System）

以 CSS custom properties + Tailwind config 提供；所有前景/背景組合以 WCAG 2.1 AA（正文 ≥4.5:1、大字/UI ≥3:1）為底線驗證。

### 3.1 品牌與中性（periwinkle tonal ramp，白底為主）
主色由使用者指定 anchor `#98B6E4` 衍生 8 階；**背景 anchor 為白色 `#FFFFFF`**，層次用極淺中性 `#F8FAFC`(slate-50)。深階供需白字之互動元件（AA ✅）。

| Token | Hex | 用途 | 對比（白字/深字） |
|-------|-----|------|-------------------|
| `primary-50` | `#F3F7FC` | 最淺頁面/資訊卡淡底 | — |
| `primary-100` | `#EAF1FA` | 選中列、chip、diff 變更欄位底、hover 淡底 | — |
| `primary-200` | `#CFDFF3` | 品牌淡邊框、DAG 選中節點外環 ring | — |
| `primary-300` · **anchor** | `#98B6E4` | 次要強調、focus ring、徽章、connector hover、DAG 暫存連線 | 深字 8.5:1 ✅ |
| `primary-400` | `#6E96D4` | 中階、漸層中段 | — |
| `primary-500` | `#4A72AE` | 較深強調、次要連結 | 白字 4.9:1 ✅ |
| `primary-600` | `#365C97` | **主要按鈕/連結/focus ring、DAG 選中節點邊、狀態切換 active** | 白字 6.7:1 ✅ |
| `primary-700` | `#2A4A7E` | 按鈕 hover/active、品牌漸層深端 | 白字 8.8:1 ✅ |
| `surface`（背景 anchor） | `#FFFFFF` | 頁面/後台/前台大面積背景、sidebar、topbar、卡片、表格、輸入、drawer | 正文 slate-700 12.6:1 ✅ |
| `--slate-50` | `#F8FAFC` | 層次用途：區塊分隔、表頭底、**DAG 畫布工作區底（點陣格線 `#E2E8F0`）**、前台清單底 | — |
| `--slate-100` | `#F1F5F9` | 分隔區、disabled 底 | — |
| `--slate-200` | `#E2E8F0` | 邊框、divider | — |
| `--slate-500` | `#64748B` | 次要文字、icon、浮水印文字 | — |
| `--slate-700` | `#334155` | 主要正文 | — |
| `--slate-900` | `#0F172A` | 標題、強調文字 | — |

### 3.2 文件狀態（F012：有效 / 失效 / 作廢）
| 狀態 | 文字/邊框 | 底色 | Hex | 用途 |
|------|-----------|------|-----|------|
| 有效（active） | `--status-active` | 淡綠 | 文字 `#047857` / 底 `#D1FAE5` | 前台可見、狀態徽章 |
| 失效（inactive） | `--status-inactive` | 淡琥珀 | 文字 `#B45309` / 底 `#FEF3C7` | 後台可見、前台隱藏 |
| 作廢（void） | `--status-void` | 淡紅 | 文字 `#B91C1C` / 底 `#FEE2E2` | 後台可見、前台隱藏 |

### 3.3 語意色（回饋）
| Token | Hex | 用途 |
|-------|-----|------|
| `--success` | `#059669` | 成功 toast、同步成功、就緒 |
| `--warning` | `#D97706` | 警示（未指派節點、組織異動待確認、防環提示） |
| `--danger` | `#DC2626` | 錯誤 toast、成環拒絕、刪除確認 |
| `--info` | `#365C97` | 資訊提示、進行中（對齊主色深階） |

### 3.4 角色徽章（5 固定角色，配合 RBAC 模擬器）
| 角色 code | 名稱 | 徽章色 | Icon（Lucide） |
|-----------|------|--------|----------------|
| `SysAdmin` | 系統管理員 | Indigo `#4338CA`（改自舊藍，避免與新主色同色系） | `shield-check` |
| `ICSOPAdmin` | ICSOP 管理員 | Violet `#7C3AED` | `file-cog` |
| `Supervisor` | 主管 | Cyan `#0891B2` | `user-cog` |
| `DeptContact` | 部門窗口 | Slate `#475569` | `contact` |
| `User` | 一般使用者 | Gray `#64748B` | `user` |

> 主色為 periwinkle 藍，故 SysAdmin 徽章由舊 `#2563EB` 改為 indigo `#4338CA`，與主色維持色相區隔；其餘 4 角色色相（violet/cyan/slate/gray）與主色本即區隔，保留。

### 3.5 其他情境色
| 情境 | Token / 值 | 用途 |
|------|-----------|------|
| 帳號來源徽章 | 手動 `manual` = Slate `#F1F5F9/#475569`；上游 `upstream` = Tailwind Blue（`bg-blue-50/text-blue-700`，維持與 periwinkle 主色可辨的鮮明藍） | F003 帳號清單 |
| 同步狀態 | running（藍 pulse）/ success（綠）/ failed（紅） | F004/F006 同步儀表板 |
| 組織異動提示 | pending = Amber `#FEF3C7/#B45309`；resolved = Emerald `#D1FAE5/#047857` | F006 待確認清單 |
| 稽核操作類型 | VIEW = Slate / DOWNLOAD = Blue / PRINT = Violet | F024 調閱歷程 |
| DAG 節點 | 一般（白底 slate 邊）/ 選中（`#365C97` primary 邊 + `#CFDFF3` 外環）/ 已掛文件（左側 emerald 條）/ 未命名（虛線邊）；畫布底＝slate-50 + 點陣格線 | F008/F009 |
| 浮水印 | 🔴 **`#334155` @ opacity `0.30`**，對角 45° 平鋪、14px（2026-08-20 `AC-N1`／`AC-N2` 定稿；有效色 `rgb(193.8,198.0,204.0)`、與白底對比度 **≈ 1.716:1** ≥ 門檻 `1.70`）<br>📝 被推翻之原值逐字保留：`slate-500`（`#64748B`）@ opacity `0.12` | F020（**定稿值，逐字照抄不得自行挑近似色**；色彩中性不受品牌換色影響）<br>🔒 載體＝4 處：`22`／`23` 之 DOM 疊加、PDF 燒錄內容層、prototype 權威；**`05` 之 DOM 疊加層已整段移除**（`AC-N7`），其浮水印改由內容層燒錄承載（`AC-N6`） |

---

## 4. 檔案結構（規劃 — 本輪僅規劃不建立）

所有 prototype 皆為 self-contained HTML（Tailwind CDN + Lucide CDN + Google Fonts），可獨立於瀏覽器開啟、無 build step。

> **後台頁一律內嵌 admin shell 側邊選單框架（定案）**：`07-admin-shell` 為框架定義來源（左側邊選單 + topbar + 麵包屑 + 角色模擬器 + 使用者/登出 + F022 開新視窗前台）。所有後台內容頁（`08–18`，含已產出的 `11 / 12 / 15`）一律包在此框架內：左側邊選單常駐、依 §7.1 矩陣逐角色裁切、當前功能區高亮（循環管理 / 文件管理…）。**DAG 畫布（11/12）之側邊選單可收合為 icon 軌**（預設收合以取得最大畫布寬度，topbar 保留展開鈕與麵包屑）。前台頁（`01/03/04/05/06`）**不**套後台側邊選單，使用自身頂部導覽（行動優先）。

```
prototypes/
├── 00-design-system.html         # 設計系統文件：tokens/色彩/字級/元件/狀態總覽（跨切基礎）
│
│  ── Phase A：登入與分流（RWD，行動友善） ──
├── 01-login.html                 # F001 雙軌登入（帳密 + 上游 SSO 按鈕）+ Session 逾時模態
├── 02-role-landing.html          # F002 登入後「前台 / 後台」選擇卡（4 管理角色）
│
│  ── Phase B：前台 RWD 瀏覽（行動優先） ──
├── 03-public-list.html           # F019 前台清單（部門置頂/編號降冪/搜尋/篩選/僅已公告）+ F021 RWD
├── 04-public-document-detail.html# F019 詳情（19 欄位唯讀呈現）+ F015 連結點 + F018 使用表單下載
├── 05-public-viewer-watermark.html# F020 檢視器（🔴 2026-08-20 起＝**自繪 canvas**、浮水印燒錄於內容層、**無 DOM 疊加層**、縮放重新渲染、單頁翻頁）+ F021 手機檢視器
├── 06-rwd-showcase.html          # F021 三斷點（桌機/平板/手機）並排展示 + 觸控目標規範
│
│  ── Phase C：後台框架、帳號、組織同步（桌機優先） ──
├── 07-admin-shell.html           # F002 後台外框：依角色裁切之側邊選單 + topbar + 角色模擬器 + F022 開新視窗前台
├── 08-account-management.html    # F003 帳號 CRUD/角色指派/來源篩選 + F005 離職停用徽章 + 降級二次確認
├── 09-org-sync-management.html   # F004 同步總覽/立即同步/進行中輪詢 + F006 同步歷史 + 待確認異動頁籤
│
│  ── Phase D：循環池與 DAG 畫布 ──
├── 10-lifecycle-list.html        # F007 循環池 CRUD 清單（名稱/狀態/節點數/更新時間、刪除保護）
├── 11-dag-canvas.html            # F008 DAG 畫布（上到下、多 parent/child、箭頭、增刪節點、拖曳、防環提示）
├── 12-node-drawer.html           # F009 節點抽屜（名稱編輯 + 候選文件過濾 + 已掛他節點警示二次確認 + 空狀態）
│
│  ── Phase E：ICSOP 文件管理 ──
├── 13-document-list.html         # F017 後台文件清單（分頁/搜尋/部門+狀態+循環篩選/未指派節點警示/排序）
├── 14-document-create.html       # F010 建立文件（必填+UUID 唯讀+預設有效）+ F013 編號唯一 + F014 當責 + F016 附件
├── 15-document-edit.html         # F011 版本對照（目前值/新值 diff）+ F012 狀態切換 + F014/F015/F016/F018 + F026 欄位唯讀
├── 16-document-readonly.html     # F026 主管/部門窗口唯讀檢視（全欄位唯讀、附件僅下載、所屬節點跳轉）
│
│  ── Phase F：稽核與權限矩陣 ──
├── 17-access-history.html        # F024 調閱歷程查詢（人員/文件/時間、角色範圍限縮、展開明細含浮水印快照）
├── 18-permission-matrix.html     # F025 角色×功能 + F026 角色×欄位 雙矩陣管理畫面（分頁）
├── 19-usage-form-management.html # F018 使用表單池管理（查詢/制定部門欄/關聯文件數/覆蓋/移除保護）— 新增與編輯已整頁化至 19a／19b
├── 19a-usage-form-create.html    # 🔴 F018 AC-N41～AC-N47：新增使用表單**獨立整頁**（表單檔案／基本資訊／制定部門三區塊；動作鈕在 topbar；單一動作一次送出）
├── 19b-usage-form-edit.html      # 🔴 F018 AC-N48：編輯使用表單**獨立整頁**（範圍＝表單編號＋制定部門；檔案與名稱不可於本頁變更）
│
│  ── Phase G：AI 智慧問答（RAG · E09） ──
├── 20-public-qa.html             # F032/F033/F034/F035 前台智慧問答（NL 輸入 + 生成答案 + 可跳轉引用 + 權限/防幻覺/稽核護欄）— 前台頁
├── 21-document-index-management.html # F027–F031 後台文件索引管理（.xls 原件 + chunk 提取預覽 + 索引狀態/重新索引）— 後台頁
├── 22-lifecycle-tree-preview.html # F036 循環樹狀圖預覽（唯讀 viewer + 45° 浮水印 + 循環切換 + 直角箭頭 + 點節點標示下游）— 由 10/13 開啟
├── 23-change-history.html         # F037/F038 文件變更歷程（**獨立後台功能**，獨立側選單；兩 tab：ICSOP 程序書欄位 before/after diff／循環樹狀圖新舊版預覽+下載燒錄浮水印）— 僅 SysAdmin/ICSOPAdmin
│
│  ── Phase H：附錄管理（E10） ──
└── 24-appendix-management.html   # F039 附錄池管理（多檔上傳/覆蓋警示/移除保護/關聯文件展開）— 排序於 14/15 排定
```

合計 **28 個 prototype 檔（`00`–`24` 共 25 檔 ＋ `17a` ＋ `19a` ＋ `19b`）**。📌 **計數更正**：`17a-access-history-export-limit-hint.html` 於 2026-08-18 加入時未更新本節計數（當時仍寫 25），本輪一併校正。<br>📌 `17a-access-history-export-limit-hint.html` 與 `19a`／`19b` 為既有主頁之衍生頁，沿用「主編號＋字母後綴」之既有命名慣例。

---

## 5. 執行順序與內容（Execution Order & Content）

### Phase A — 登入與分流（基礎入口）
| 檔案 | 涵蓋 Feature / Story | 關鍵 UI 元素 |
|------|----------------------|--------------|
| `00-design-system.html` | 跨切（所有 F） | 色彩/字級/間距 token 表、按鈕/輸入/徽章/表格/toast/對話框/分頁元件與各狀態、圖示對照、浮水印樣式示意 |
| `01-login.html` | F001（US-001/002/004） | 帳密表單（含錯誤統一訊息 `AUTH_INVALID_CREDENTIALS`）、「透過公司入口（上游 SSO）登入」按鈕、密碼顯示切換、Session 逾時模態（`AUTH_SESSION_EXPIRED` → 導回登入） |
| `02-role-landing.html` | F002（US-003） | 「前台瀏覽 / 管理後台」兩張選擇卡、角色徽章、依角色顯示（User 不進此頁、直達前台之說明） |

### Phase B — 前台 RWD 瀏覽（行動優先）
| 檔案 | 涵蓋 Feature / Story | 關鍵 UI 元素 |
|------|----------------------|--------------|
| `03-public-list.html` | F019（US-050/051/052）、F021 | 搜尋列（編號+名稱）、部門/狀態/循環篩選（行動改底部 sheet）、**使用部門置頂區 + 其餘依編號降冪**、清單卡（編號/名稱/制定部門/使用部門/狀態徽章/公告日期/內容摘要）、僅顯示「已公告」（有效且公告日期已過）、查無結果空狀態、清除篩選、分頁 |
| `04-public-document-detail.html` | F019 詳情、F015、F018、F039 | 20 欄位唯讀資訊區（含「附錄」列＝「N 份（見下方）」／無附錄時「無附錄」）、關聯**使用表單**清單（個別下載）、**附錄** section（比照使用表單版型：標題列＋「下載將寫入稽核」＋逐筆下載鈕；**依 `sortOrder` 遞增並顯示 1..N 序號徽章**；空狀態「無附錄」；下載 toast 明示 `targetType=APPENDIX`＋**不燒錄浮水印**）、**連結點**清單（跳目標文件、標示目標狀態）、下載/列印/檢視按鈕 |
| `05-public-viewer-watermark.html` | F020（US-053/054）、F021 | PDF 檢視器 + **對角平鋪浮水印疊加**、下載/列印觸發（顯示「伺服器端燒錄」說明）、未登入攔截導回登入、手機可縮放/捲動檢視器、浮水印格式字串展示 |
| `06-rwd-showcase.html` | F021（US-055） | 桌機 1440 / 平板 768 / 手機 375 三框並排、清單→單欄卡片重排、觸控目標 ≥44px 標註、360px 無水平捲動示意 |

### Phase C — 後台框架、帳號、組織同步（桌機優先）
| 檔案 | 涵蓋 Feature / Story | 關鍵 UI 元素 |
|------|----------------------|--------------|
| `07-admin-shell.html` | F002、F022、F025（選單裁切） | 左側功能選單（**依角色動態顯示**，見 §6.9）、topbar（使用者/角色徽章/角色模擬器/登出）、麵包屑、「瀏覽文件網頁（開新視窗）」入口（F022）、Session 逾時提示 |
| `08-account-management.html` | F003（US-005/006）、F005 | 帳號分頁清單（來源/角色/狀態徽章）、來源+角色+狀態篩選、建立手動帳號 modal（帳號/初始密碼/角色）、角色指派（5 固定角色）、停用 + **管理→一般降級二次確認**、離職自動停用徽章（`disableReason=departed`） |
| `09-org-sync-management.html` | F004（US-010/011）、F006（US-013/014）、F005 | **同步狀態總覽卡**（最近時間/觸發方式/結果/異動筆數）+「立即同步」按鈕 → 進行中（輪詢/pulse）→ 自動更新；三頁籤：`同步歷史`（分頁、失敗展開錯誤）、`待確認異動`（pending 清單、跳當責設定編輯）、`總覽`；`SYNC_IN_PROGRESS` 提示 |

### Phase D — 循環池與 DAG 畫布（核心互動）
| 檔案 | 涵蓋 Feature / Story | 關鍵 UI 元素 |
|------|----------------------|--------------|
| `10-lifecycle-list.html` | F007（US-020）、**F040** | 循環清單（名稱/狀態/節點數/最後更新）、新增/編輯（名稱必填 `LIFECYCLE_NAME_REQUIRED`）、停用切換、**刪除保護**（有文件掛載→`LIFECYCLE_HAS_DOCUMENTS` 僅允停用）、進入畫布連結、**子分類（非必填）欄位**＋清單以 `lifecycleDisplayName` 呈現＋搜尋比對顯示名稱＋`LIFECYCLE_DUPLICATE`／`LIFECYCLE_SUBCATEGORY_CONFLICT` 兩錯誤提示（見 §6.19） |
| `11-dag-canvas.html` | F008（US-021/022） | **上到下 DAG 畫布**：節點卡（可拖曳、持久化座標）、箭頭有向邊（parent→child）、新增/刪除節點（刪除→連動移除邊+已掛文件二次確認）、拖曳連線、**防環**：即時提示 + 送出後 `DAG_CYCLE_DETECTED`/`DAG_SELF_LOOP` toast、多 parent/多 child 呈現、mini-map/縮放、平板/手機降級提示 |
| `12-node-drawer.html` | F009（US-023/024） | 點節點 → **右側 drawer**：節點名稱編輯（即時更新畫布）、目前掛載文件清單、候選清單（**僅本循環**過濾）、選未掛載→直接掛載、選**已掛他節點**→警示（附原節點名）+ `NODE_DOC_ALREADY_ASSIGNED` 二次確認改派、**空候選空狀態**、未確認即存擋下、關閉送出 |

### Phase E — ICSOP 文件管理
| 檔案 | 涵蓋 Feature / Story | 關鍵 UI 元素 |
|------|----------------------|--------------|
| `13-document-list.html` | F017（US-037） | **14 欄清單**（制定公司/制定部門/制定室別/當責室長/狀態/檔案/樹狀圖圖示/程序書編號/程序書書名/版次/內容摘要/連結點程序書/公告日期/循環別）、**頂部 3 統計卡**（程序書數量/已公告/進度中）、**9 個可搜尋下拉篩選**（循環別/狀態/程序書編號/程序書書名/制定部門/制定室別/當責室長/制定公司/連結點程序書）、**樹狀圖圖示**點擊開所屬節點循環預覽、**狀態衍生**（已公告/進度中/失效/作廢徽章）、**未指派節點警示圖示**、依編號/公告日期排序、查無結果空狀態、（後台**不**套用部門置頂）、**「循環別」欄與其下拉以 `lifecycleDisplayName` 呈現、選項值＝`lifecycleId`**（F040，見 §6.19） |
| `14-document-create.html` | F010（US-030）、F013、F014、F016 | 必填表單（編號/名稱/制定公司/制定部門/制定室別/主要室長/使用部門/版次/內容摘要/公告日期/所屬循環）、UUID 唯讀、預設狀態「有效」、**編號唯一性即時驗證** `DOCUMENT_NUMBER_DUPLICATE`、**制定三級聯動**（選室別帶入部門/公司）、當責次要室長多選、使用部門多選（組織階層下拉、排除離職）、附件上傳（ICSOP PDF 1 / OJT 1）、**「所屬循環」兩段式選取（名稱 → 子分類）**（F040，見 §6.19）、`所屬節點=未指派` 提示、**使用表單**可搜尋多選、**附錄**可搜尋多選＋**有序已選清單（上移／下移，無拖曳）**（F039；新選取者加末位、送出時依畫面順序寫入 `sortOrder` 1..N） |
| `15-document-edit.html` | F011（US-031）、F012、F014、F015、F016、F018、F026、F039 | **附錄 section**（自附錄池可搜尋多選；已選清單為**有序清單＋上移／下移**、首筆停用上移／末筆停用下移、無拖曳；解除其中一筆後其餘相對順序不變並重編為連續 1..N；「已變更」pill 併入變更計數；唯讀角色僅見順序、控制項隱藏）、**目前值 / 新值 並列對照**（變更欄位 diff highlight；「所屬循環」為**兩段式選取**且新舊值兩側皆含子分類，F040 見 §6.19）、覆蓋儲存（UUID 不變）、**狀態切換**（有效/失效/作廢，作廢二次確認）、**所屬節點唯讀 + 跳畫布**、連結點增刪、附件覆蓋、**使用表單管理面板**（多檔上傳/移除二次確認、格式 `FILE_FORMAT_NOT_ALLOWED`）、依 F026 欄位唯讀、取消不污染原值 |
| `16-document-readonly.html` | F026（US-071）、F025、F039 | 主管/部門窗口視角：全 20 欄位唯讀呈現、附件「僅下載」（ICSOP PDF 燒錄浮水印）、**附錄列**（比照使用表單列，依 `sortOrder` 遞增並帶 1..N 序號徽章；無附錄時顯示「無附錄」；下載 toast 明示不燒錄浮水印、後台管理端存取不寫調閱稽核）、上傳/編輯入口不顯示、所屬節點可跳轉檢視、寫入 API 被拒之 `FIELD_WRITE_FORBIDDEN` 說明 |

### Phase F — 稽核與權限矩陣
| 檔案 | 涵蓋 Feature / Story | 關鍵 UI 元素 |
|------|----------------------|--------------|
| `17-access-history.html` | F024（US-061）、F023 | 查詢列（人員[姓名/員編] + 文件[編號/名稱] + 時間區間任意組合）、`QUERY_CONDITION_REQUIRED`/近 30 天預設、結果分頁（人員/員編/公司/部門/室別/角色/文件/操作類型/時間，新到舊）、**角色限縮**（僅 SysAdmin／ICSOPAdmin 可存取；主管／部門窗口／一般使用者無此頁）、展開單筆明細含**浮水印快照**、匯出（CSV/Excel 草案） |
| `18-permission-matrix.html` | F025（US-070）、F026（US-071）、F039 | 兩頁籤：`角色×功能`（13 功能 × 5 角色：CRUD/唯讀/無，含「**附錄管理**」列＝唯讀/CRUD/無/無/無）、`角色×欄位`（20 欄位 × 5 角色：可寫/唯讀/無，含「**附錄（多）**」列，比照「使用表單（多）」並註記 `sortOrder` 由 14/15 排定）、定案項標示（主管/窗口皆唯讀、SysAdmin 對文件欄位無寫入）、草案待審註記（OQ-E08-02） |

### Phase G — AI 智慧問答（RAG · E09）
| 檔案 | 涵蓋 Feature / Story | 關鍵 UI 元素 |
|------|----------------------|--------------|
| `20-public-qa.html` | F032（US-095）、F033（US-096）、F034（US-097）、F035（US-098） | **前台頁**（前台頂部導覽、RWD、王小明·營管部）：顯著自然語言問答輸入框 + 送出、建議問題 chips、生成中/空狀態；答案卡 + **可跳轉引用來源卡**（ICSOP 編號＋文件名稱＋章/節 → 04 詳情 / 05 檢視器）；**權限提示**（僅檢索已公告＋使用部門相符）；**防幻覺護欄**（無依據→明確拒答不虛構、低信心→標示信心不足附最接近來源）；稽核/浮水印提示（QA_LOG、經 AI 導引檢視/下載仍套浮水印＋稽核 `source=AI_QA`） |
| `21-document-index-management.html` | F027（US-090）、F028（US-091）、F029（US-092）、F030（US-093）、F031（US-094） | **後台 admin shell**（`CURRENT_MODULE=docindex`、李慧玲、ICSOPAdmin CRUD/主管唯讀/其餘封鎖）：索引狀態總覽卡 + 清單（編號/名稱、**.xls 原件** 有無、**索引狀態** 未建立/建置中/成功/失敗＝INDEX_RUN、chunk 數、最後索引時間）；**檢視提取結果** modal（依章/節列 chunk：章節標題＋內文 snippet＋metadata 使用部門/狀態/版本/頁次，示意已清洗頁首頁尾/簽核/空白）；**重新索引** 建置中→成功、一筆失敗示範（`XLS_TEMPLATE_INVALID`）；主要示範 `ICSOP-CIPS-102-1-01` |

### Phase H — 附錄管理（E10）
| 檔案 | 涵蓋 Feature / Story | 關鍵 UI 元素 |
|------|----------------------|--------------|
| `24-appendix-management.html` | F039（US-100/US-101/US-102） | **後台 admin shell**（`CURRENT_MODULE=appendix`、李慧玲、ICSOPAdmin CRUD／SysAdmin 唯讀 banner `FIELD_WRITE_FORBIDDEN`／其餘封鎖 `PERMISSION_DENIED`）：附錄池清單（附錄名稱/格式/大小/上傳者＋上傳時間/**關聯文件數**/操作）＋關鍵字搜尋＋格式篩選（excel/pdf）；**展開關聯文件**（文件編號＋名稱＋跳轉）；**上傳 modal**＝多檔選取＋名稱**選填**（單檔才顯示、選檔自動預填檔名、留空 fallback 檔名、上限 400 字元 `APPENDIX_NAME_TOO_LONG`），多檔隱藏名稱欄並顯示「先全部驗證再全部建立」說明（`FILE_FORMAT_NOT_ALLOWED`／`FILE_SIZE_EXCEEDED` 整批擋下）；**覆蓋 modal**＝先選新檔並驗證格式／大小（400 優先於 409），再依關聯文件數分流（**≥2** → `APPENDIX_OVERWRITE_SHARED · 409` 警示＋引用文件清單＋二次確認；**≤1** → 一般覆蓋確認、不出現跨文件警示）；**移除保護**（≥1 → `APPENDIX_IN_USE · 409` 二次確認並一併解除關聯；＝0 → 一般確認）；目標不存在 → `APPENDIX_NOT_FOUND · 404` |

---

## 6. 共用 UI 模式（Shared UI Patterns）

| # | 模式 | 規則 |
|---|------|------|
| 6.1 | **前台導覽（行動優先）** | 桌機頂部橫向；手機收合為漢堡選單；搜尋列常駐；篩選在手機改為底部 sheet（bottom sheet）。觸控目標 ≥44×44px。 |
| 6.2 | **後台導覽（桌機）** | 固定左側 sidebar（功能區依角色裁切，見 6.9）+ 固定 topbar（56px，含角色模擬器）+ 麵包屑；主內容區可捲動，body 不橫捲。 |
| 6.3 | **表單驗證** | 必填 `*`；失焦即時驗證 + 送出時錯誤彙整置頂；欄位級錯誤紅框 + 訊息；錯誤文案一律取自 `error-handling.md` 契約（如 `文件編號已存在`、`必填欄位未填寫`）。 |
| 6.4 | **確認對話（Confirm Dialog）** | 破壞性/高風險操作二次確認：刪除節點（含掛載文件警告）、移除使用表單、角色降級、文件改派（`NODE_DOC_ALREADY_ASSIGNED` 附原節點名）、狀態切為作廢、刪除循環。危險動作按鈕用 `--danger`。 |
| 6.5 | **Toast 通知** | 右上角；success/error/info 三型；自動 3–5 秒消失；用於儲存成功、同步結果、上傳、防環拒絕、稽核非阻斷提示。 |
| 6.6 | **密碼欄** | 顯示/隱藏切換（`eye`/`eye-off`）；建立帳號時顯示強度提示（初始密碼）；不回填、不明碼顯示既有密碼。 |
| 6.7 | **分頁（Pagination）** | 後端權威分頁；每頁 50 筆（NFR-001）；顯示總筆數 + 頁碼；排序切換維持分頁一致；空結果顯示空狀態而非空白。 |
| 6.8 | **Drawer（右側抽屜）** | 節點抽屜（F009）為主要用途：由右滑入、遮罩、ESC/點遮罩關閉、關閉即送出、含未儲存變更提醒；寬度桌機 420px。 |
| 6.9 | **DAG 畫布互動** | 上到下佈局；節點可拖曳（座標持久化）；拖曳把手建立有向邊（箭頭）；即時前端防環提示（灰線/紅線）+ 後端權威拒絕 toast；支援多 parent/多 child；縮放/平移/mini-map；點節點開 drawer；平板/手機顯示「建議桌機編輯」降級提示。 |
| 6.10 | **浮水印呈現（已確認）** | 檢視器：對角 45° 平鋪重複、opacity 0.12、`slate-500`、字級 14px、`pointer-events:none`、不提供無浮水印另存；下載/列印標示「伺服器端已燒錄」；格式與稽核快照一字不差一致。時間 `YYYY-MM-DD HH:mm:ss (UTC+8)`。**（OQ-NFR007a/b 已定案 ✅）** |
| 6.11 | **狀態徽章** | 文件狀態（有效/失效/作廢）、帳號來源（手動/上游）、角色、同步狀態、組織異動（pending/resolved）、稽核操作類型皆用統一 pill 樣式（§3 色）。 |
| 6.12 | **未指派節點標示** | 後台文件清單/建立後以 `--warning` 警示圖示 + 「未指派節點」pill 明顯標示（F010/F017）。 |
| 6.13 | **目前值 / 新值 對照（Diff）** | 編輯頁每可編輯欄位左「目前值」（slate 灰）右「新值」（primary 邊框），已變更欄位加 diff highlight 條 + 「已變更」pill（F011）。 |
| 6.14 | **角色模擬器（RBAC 演示）** | 後台各頁 topbar 置 5 角色下拉，`body[data-role]` + CSS `[data-show-role]/[data-hide-role]` 切換選單顯示與欄位唯讀；無權限角色顯示封鎖卡/403 說明。 |
| 6.15 | **空狀態 / 錯誤狀態** | 查無結果、無使用表單、空候選清單、無調閱紀錄皆用友善空狀態（icon + 說明），非錯誤畫面；系統錯誤另用錯誤狀態卡 + 重試。 |
| 6.16 | **進行中 / 載入狀態** | 同步進行中（pulse + 輪詢）、DAG 儲存、附件上傳、浮水印下載處理皆顯示 loading；骨架屏用於清單首屏。 |
| 6.17 | **有序多選（上移／下移）** | 僅用於**附錄**（F039，`14`/`15`）——使用表單／使用部門／連結點等既有多選**維持無序 chip**，不得一併改為有序。已選項改為每列一行：`1..N` 序號徽章 + 格式 icon + 名稱 + 「上移」「下移」「移除」三顆圖示鈕。新選取者一律加**末位**；**首筆之上移與末筆之下移以 `disabled` 停用**（點擊不改變順序、不報錯）；**一律不提供拖曳排序**（無 `draggable` 屬性、無 drag 事件；F039 AC-21 會直接斷言）。移除中間一筆後其餘相對順序不變並重編為連續 `1..N`。DOM 測試掛鉤：`[data-appendix-item][data-appendix-order]`、`[data-appendix-name]`、`[data-appendix-up]`／`[data-appendix-down]`／`[data-appendix-remove]`。 |
| 6.18 | **多檔上傳之批次驗證** | 附錄上傳（`24`）支援多檔：選檔後**先全部驗證再全部建立**，任一檔格式或大小違規即整批擋下（不部分建立），並於清單逐檔標示違規碼。**單檔**才顯示「名稱」欄（選填、選檔自動預填檔名、使用者改寫後不再被換檔覆寫、trim 後空值 fallback 檔名、上限 400 字元）；**多檔**隱藏名稱欄並明示「各檔一律以其檔名建檔」。 |
| 6.19 | **循環子分類：顯示名稱與兩段式選取**（F040，🟢 APPROVED（2026-08-07 人類閘門通過）） | **(a) 顯示**：全站任何呈現循環名稱之處（清單列、下拉選項、頁面標題、快照欄位）一律經純函式 `lifecycleDisplayName({name,subcategory})`——有子分類 → `名稱（子分類）`（**全形括號、前後無空白**）、無 → `名稱`；髒資料（空字串／純空白）防禦性視同無子分類，**不得**輸出 `名稱（）`。不得於各處自行以 `name` 串接。**(b) 下拉選項值**：任何循環下拉／篩選之選項值一律為 `lifecycleId`（**非** `name` 字串、**亦非**循環代碼——同名不同子分類之代碼相同，無法區分）；`22` 之查詢參數同步改名並收斂為 `?lifecycleId=<lifecycleId>`。**(c) 兩段式選取**（`14`／`15` 之「所屬循環」）：第一段選名稱、第二段選子分類；**該名稱底下無子分類時不呈現第二段**（向後相容）；名稱一選定即帶入編號前綴並開放後續欄位（前綴**僅依名稱**推導，子分類不參與）；名稱清空時收起並清空第二段、後續欄位重新上鎖；有子分類而未選具體子分類即送出 → 前端純函式 `resolveLifecycleSelection` 擋下並顯示 `LIFECYCLE_SUBCATEGORY_REQUIRED`（400），後端仍權威再驗。**(d) 建立/編輯循環之驗證順序固定不可調換**：① `LIFECYCLE_NAME_REQUIRED`（400）→ ② `LIFECYCLE_DUPLICATE`（409）→ ③ `LIFECYCLE_SUBCATEGORY_CONFLICT`（409，訊息須含「請先處理既有該筆」）；比對涵蓋停用列、編輯時排除自身。DOM 測試掛鉤：`#lcSub`／`#lcDupErr`／`#lcConflictErr`（`10`）、`#f_cycleName`／`#f_cycleSub`／`#subWrap`／`#subErr`（`14`）、`#lc_name`／`#lc_sub`／`#lc_subWrap`（`15`）、`[data-lifecycle-name]`（`10`）、`[data-cycle-cell]`（`13`／`23`）、`[data-lifecycle-title]`（`11`／`12`）。 |
| 6.20 | **一般使用者子分類：適用性、標籤與資料列層級限縮**（F041，🟢 APPROVED — 2026-08-11 人類閘門通過） | **(a) 顯示標籤**：一律經前端純函式 `userSubtypeLabel(v)` → `業務`／`其他`（未知值一律 `其他`）。儲存值恆為小寫 `'business'`／`'other'`，**中文字串僅供顯示、不得用於任何判定**。**(b) 適用性**：一律經 `isSubtypeApplicable(roleCode)`——**僅一般使用者回 `true`**。指派角色 modal 於所選角色為一般使用者時**才呈現**子分類選擇器（是「整塊不呈現」，不是停用、不是灰階）；帳號清單之子分類徽章亦僅在一般使用者列呈現（INV-2：其餘 4 種角色之該欄值恆被忽略、**不影響任何顯示**）。**⚠ 角色仍為 5 種、不新增第 6 種**。**(c) 子分類徽章**：沿用既有來源徽章之外框 pill 形狀（**非**角色徽章之實心色塊，避免誤讀為第 6 種角色）——`業務` = `bg-primary-50 text-primary-700 border-primary-200`、`其他` = `bg-slate-100 text-slate-600 border-slate-200`；置於「角色」欄之角色徽章右側，**不新增欄**。**(d) 前台可見性（業務）**：清單於「已公告」基底條件之後、其餘篩選之前套用 `isDocVisibleToViewer`；**置頂／其餘兩區塊之拆分邏輯完全不變**（其餘區恆空為預期退化，由既有「空區塊即收合」通則處理，**不得新增子分類特判**）；**使用部門篩選下拉不限縮**；空結果沿用既有 `查無符合結果` **逐字**、**不得**新增業務專屬空狀態文案分支；`hiddenCount`（「另有 N 筆…已由後端隱藏」）**不得**把被業務限制過濾者計入。**(d-2) 頂部說明句依子分類切換（2026-08-11 人類裁決，逐字定稿——下游 test-generator 會逐字斷言）**：容器、字級、色彩沿用既有 primary 提示框，**不新增元件**；其他子分類沿用既有文案一字未改，業務子分類（**含孤兒帳號**，不得因帳號異常而換句）換為專屬文案。兩條字串於 `03` 內以 `SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS` 具名常數持有：<br>　`SCOPE_NOTICE_OTHER` ＝ `一般使用者僅顯示「已公告」文件（進度中/失效/作廢由後端過濾隱藏）；您所屬部門相關文件會自動置頂。`<br>　`SCOPE_NOTICE_BUSINESS` ＝ `業務使用者僅顯示「已公告」且使用部門為您所屬部門（含其下所有單位）之文件（進度中/失效/作廢由後端過濾隱藏）；其餘部門之文件不在您的瀏覽範圍內，如需調閱請洽該部門窗口。`<br>設計意圖：前半沿用既有句型（維持一致語氣、明示基底條件未變），後半明說「不在您的瀏覽範圍內」而**非**「沒有其他文件」，並以「如需調閱請洽該部門窗口」給出後續動作——避免業務使用者誤判為全公司僅有這些文件。**(e) 拒絕畫面（OQ-E06-03 裁決 A）**：直連不相符文件一律回 **404 `DOCUMENT_NOT_FOUND`**（不新增錯誤碼、不再兩案並陳）；畫面**不得出現任何文件欄位**（編號／書名／制定組織／使用部門／內容摘要），故採**不透明**覆蓋（非既有 admin 頁之半透明 `backdrop-blur`）；**同一組文案同時用於「文件不存在」與「文件存在但不在你部門」**，不得因情境而分歧。拒絕路徑**不寫任何稽核**（含不寫拒絕事件，OQ-E08-10 裁決 A）。**(f) 原型示範控制**：`03`／`04` 之 `[data-prototype-demo="true"]` 區塊為**原型示範用鷹架、非正式 UI**，實作時不得移植。DOM 測試掛鉤：`#demoSubtype`／`#viewerNote`／**`#scopeNotice`**／`body[data-viewer-subtype]`（`03`）、`#subtypeWrap`／`#subtypeRadios`／`input[name="rsubtype"]`（`08`）、`#rejectOverlay`（`04`）。 |

---

## 7. Feature → 檔案對照表（可追溯 F001–F041）

| Feature | 名稱 | 主要檔案 | 次要出現 |
|---------|------|----------|----------|
| F001 | 雙軌登入與 Session | `01-login.html` | `07`（逾時提示）、`05`（未登入攔截） |
| F002 | 角色分流導向 | `02-role-landing.html` | `07`（後台選單裁切） |
| F003 | 帳號與角色指派（含 **F041 子分類 delta 🟢 APPROVED**） | `08-account-management.html`（指派角色 modal 之子分類選擇器：僅一般使用者呈現；角色欄子分類徽章；編輯 modal 之「目前角色」一併顯示） | `07`（sidebar 帳號管理）、`18`（註記：子分類非第 6 種角色） |
| F004 | 組織資料同步 | `09-org-sync-management.html` | `07`（sidebar 組織異動管理） |
| F005 | 離職自動停用 | `08-account-management.html` | `09`（同步歷史離職筆數） |
| F006 | 組織異動提示與後台 | `09-org-sync-management.html` | `15`（當責欄位旁提示標記） |
| F007 | 循環池 CRUD（含 F040 子分類 delta） | `10-lifecycle-list.html`（＋非必填「子分類」欄、`lifecycleDisplayName` 清單/搜尋、`LIFECYCLE_DUPLICATE`／`LIFECYCLE_SUBCATEGORY_CONFLICT`） | `11`（畫布入口）、`22`（樹狀圖預覽以 `lifecycleId` 開啟） |
| F008 | DAG 節點與連線防環（含 F040 子分類 delta） | `11-dag-canvas.html`（頁首標題含子分類；DAG 資料與防環邏輯不受子分類影響） | `10`（進入畫布）、`12`（畫布底層） |
| F009 | 節點抽屜維護與過濾警示（含 F040 子分類 delta） | `12-node-drawer.html`（頁首與候選過濾提示含子分類；過濾鍵仍為 `lifecycleId`，同名另一子分類之文件不入候選） | `11`（點節點開抽屜）、`15`（所屬節點跳轉） |
| F010 | 建立 ICSOP 文件（含 F040 子分類 delta） | `14-document-create.html`（「所屬循環」兩段式選取；未選子分類 → `LIFECYCLE_SUBCATEGORY_REQUIRED`） | `13`（建立入口） |
| F011 | 編輯文件與版本對照（含 F040 子分類 delta） | `15-document-edit.html`（「所屬循環」兩段式選取；新舊值對照兩側皆含子分類） | `13`（編輯入口） |
| F012 | 文件狀態切換 | `15-document-edit.html` | `13`（清單狀態徽章）、`03`（前台反映） |
| F013 | 文件編號唯一性 | `14-document-create.html` | `15`（編輯排除自身） |
| F014 | 制定組織與當責室長設定 | `14`、`15` | `09`（異動提示跳入） |
| F015 | 文件連結點管理 | `15-document-edit.html` | `04`（前台詳情顯示連結點） |
| F016 | PDF 與 OJT 附件上傳 | `14`、`15` | `05`（浮水印來源檔） |
| F017 | 後台文件清單與搜尋（含 F040 子分類 delta ＋ 🔴 **D9 OJT 圖示欄**） | `13-document-list.html`（🔴 **15 欄**：最左新增「OJT」圖示欄 `AC-N37`～`AC-N40`；第 15 欄「循環別」含子分類；下拉選項值＝`lifecycleId`；各檔案列帶 `data-wm-note`） | `07`（sidebar 文件管理）、`22`（樹狀圖第二入口帶 `lifecycleId`） |
| F018 | 使用表單管理（含 🔴 **D9 整頁化 ＋ 制定部門**） | `19-usage-form-management.html`（表單池；🔴 **8 欄**，新增「制定部門」欄 `AC-N47`）<br>🔴 `19a-usage-form-create.html`（新增，`AC-N41`～`AC-N47`）<br>🔴 `19b-usage-form-edit.html`（編輯，`AC-N48`：範圍＝表單編號＋制定部門） | `15`/`14`（文件關聯選取）、`04`（前台下載）、`07`（sidebar） |
| F019 | 前台清單瀏覽（含 F040 子分類 delta ＋ **F041 業務限縮 delta 🟢 APPROVED**） | `03-public-list.html`（「循環」篩選值＝`lifecycleId`、顯示含子分類；**業務視角之可見性過濾＋示範視角切換器**） | `04`（詳情之「循環別」；**直連拒絕面板**）、`16`（後台唯讀詳情同字串）、`06`（RWD） |
| F020 | 文件浮水印（🔴 D9 起＝**內容層燒錄為主**）（含 **F041 授權層 delta 🟢 APPROVED**） | `05-public-viewer-watermark.html`（🔴 **本輪大改**：自繪 canvas 取代 iframe `AC-N4`、DOM 疊加層整段移除 `AC-N7`、縮放依倍率重新渲染 `AC-N8`／`AC-N9`、下載／列印鈕與頁尾格式字幕保留 `AC-N5`／`AC-N67`、公司名稱改簡稱 `AC-N12`） | `04`（下載/列印入口；拒絕面板）、`17`（浮水印快照，公司欄仍全稱 `AC-N13`）、🔒 `22`／`23`（DOM 疊加層**必須保留** `AC-N66`）、🔵 `13`／`15`／`16`／`19`／`24`（後台亦渲染 `data-wm-note` `AC-N20`） |
| F021 | RWD 響應式版面（含 🔴 **D9 前台字級上移一階**） | `06-rwd-showcase.html` | `03`、`04`、`05`（三斷點落實；🔴 三檔字級 `text-sm`→`text-base`、`text-xs`→`text-sm`，`AC-N59`／`AC-N60`）、🔒 `00`（字級 tokens 表逐字不動 `AC-N61` ②，另加註前後台分歧說明） |
| F022 | 後台開啟前台瀏覽頁 | `07-admin-shell.html`（開新視窗入口） | `03`（被開啟目標頁） |
| F023 | 稽核軌跡記錄 | `17-access-history.html` | `05`（VIEW/DOWNLOAD/PRINT 觸發）、`04`（表單下載觸發） |
| F024 | 調閱歷程查詢後台（含 🔴 **D9 上傳事件呈現**） | `17-access-history.html`（🔴 類型篩選新增第四種值「上傳」 `AC-N69`；上傳列之操作類型標籤逐字「附件上傳」、浮水印快照留空 `AC-N53`；🔒 公司欄仍全稱 `AC-N13` ③） | `07`（sidebar 調閱歷程） |
| F025 | 角色×功能矩陣（含 **F041 delta 🟢 APPROVED**） | `18-permission-matrix.html`（**13 列 × 5 欄逐格不變**；新增註記橫幅說明子分類非第 6 種角色） | `07`（選單裁切）、各後台頁角色模擬器 |
| F026 | 角色×欄位矩陣（含 **F041 delta 🟢 APPROVED** ＋ 🔴 **D9 OJT 破例**） | `18-permission-matrix.html`（**20 列 × 5 欄**；🔴 `OJT 簽到表` × `Supervisor`／`DeptContact` 兩格由「唯讀」改「可寫」，`AC-N22`＝恰兩格改值） | 🔴 `16`（唯讀檢視＋OJT 上傳入口，主入口）、🔴 `15`（一致化）、`18`（矩陣格值） |
| F027 | .xls 原件保存與呈現用 PDF 產出 | `14`／`15`（.xls 上傳、PDF 標「由 .xls 產出」） | `21`（.xls 原件有無、觸發重抽） |
| F028 | .xls 模板感知抽取與清洗 | `21-document-index-management.html`（提取結果預覽、已清洗示意） | `14`/`15`（.xls 上傳觸發） |
| F029 | 章/節 chunking + metadata 索引 | `21-document-index-management.html`（chunk 依章/節 + 8 項 metadata） | `20`（引用章/節即 chunk 來源） |
| F030 | 改版重抽與重建索引 | `21-document-index-management.html`（重新索引 建置中→成功/失敗） | `15`（換 .xls/狀態切換觸發） |
| F031 | 管理端提取預覽與索引狀態 | `21-document-index-management.html`（總覽卡 + 三態 + 失敗詳情） | `07`（sidebar 文件索引管理） |
| F032 | 前台自然語言問答與引用 | `20-public-qa.html` | `04`/`05`（引用跳轉詳情/檢視器） |
| F033 | 權限感知檢索（已公告＋使用部門） | `20-public-qa.html`（權限提示、無權→查無依據） | `21`（chunk metadata 為過濾依據） |
| F034 | 問答稽核與 AI 導引浮水印 | `20-public-qa.html`（QA_LOG、source=AI_QA 提示） | `05`（經引用檢視/下載仍套浮水印）、`17`（稽核查詢） |
| F035 | 防幻覺護欄與無結果處理 | `20-public-qa.html`（拒答/低信心/必附引用） | — |
| F036 | 循環樹狀圖預覽（唯讀＋浮水印）（含 F040 子分類 delta） | `22-lifecycle-tree-preview.html`（viewer + 45° 浮水印 + 循環切換 + 直角箭頭 + 點節點標示所有下游；**標題與切換器含子分類、切換器值與 `?lifecycleId=` 皆為 lifecycleId**——同名兩者代碼皆 SRC 無法區分，AC-S3） | `10`（狀態欄樹狀圖圖示，帶 `lifecycleId`）、`13`（文件清單樹狀圖圖示，帶該文件之具體 `lifecycleId`）、`11`（DAG 編輯對照）、`05`（浮水印手法） |
| F037 | ICSOP 程序書變更歷程 | `23-change-history.html`（**獨立功能**；ICSOP 程序書 tab：欄位 before/after diff） | `15`（編輯/狀態/組織變更來源）、`07`（sidebar 獨立項「文件變更歷程」） |
| F038 | 循環樹狀圖變更歷程（含 F040 子分類 delta） | `23-change-history.html`（**獨立功能**；循環樹狀圖 tab：新舊 DAG 並列預覽 + 下載燒錄浮水印；**查詢下拉值＝`lifecycleId`；清單/預覽之循環名稱＝以 `lifecycleId` join `LIFECYCLE` 取當前值再經 `lifecycleDisplayName` 組合**——**非快照**，事後改名／改子分類，既有事件將顯示新名稱〔2026-08-08 使用者裁決 5，F040 AC-34〕） | `11`/`12`（DAG 結構變更來源）、`22`（viewer 手法）、`05`（浮水印燒錄） |
| F039 | 附錄管理（附錄池 + 文件內排序） | `24-appendix-management.html`（附錄池：多檔上傳／覆蓋警示／移除保護／關聯文件展開） | `14`／`15`（文件關聯選取 + **上移／下移排序**，§6.17）、`16`（後台唯讀詳情依 `sortOrder` 列出）、`04`（前台詳情「附錄」section + 欄位摘要列 + 下載寫稽核）、`18`（功能列「附錄管理」＋欄位列「附錄（多）」）、`07`（sidebar + 儀表板卡）、`02`（ICSOP 管理員/主管之後台職掌說明） |
| **F040** | **循環子分類（橫切；規則權威）** | 無專屬畫面——規則落在 `10`（子分類 CRUD 與唯一性）、`14`／`15`（兩段式選取） | `13`／`03`（下拉值＝`lifecycleId`、顯示含子分類）、`04`／`16`（循環別列）、`11`／`12`（標題與過濾提示）、`22`（切換器＋`?lifecycleId=`）、`23`（查詢下拉＋快照顯示）｜共用規則見 §6.19 |
| **F041** 🟢 | **一般使用者子分類 業務／其他（橫切；規則權威）** | 無專屬畫面——**指派入口**落在 `08`（角色指派 modal 之子分類選擇器，僅一般使用者呈現）、**限縮效果**落在 `03`（業務視角之清單可見性過濾） | `04`（直連不相符文件之拒絕面板，**定稿 404 `DOCUMENT_NOT_FOUND`**）、`18`（矩陣逐格不變之註記橫幅）、`05`／`17`（**皆未改檔**：授權層被擋→檢視器不開啟；不記錄拒絕稽核）｜共用規則見 §6.20、12 項裁決紀錄見附錄 A.3 |

### 7.1 後台側邊選單 × 角色顯示（依 F025 推導，供 `07` 落實）
| 功能區 | SysAdmin | ICSOPAdmin | Supervisor | DeptContact | User |
|--------|:---:|:---:|:---:|:---:|:---:|
| 帳號管理 | CRUD | 唯讀 | — | — | — |
| 角色指派 | CRUD | — | — | — | — |
| 循環管理（DAG） | 唯讀 | CRUD | 唯讀 | — | — |
| ICSOP 文件管理 | 唯讀 | CRUD | 唯讀 | 唯讀 | — |
| 使用表單管理 | 唯讀 | CRUD | — | — | — |
| 附錄管理 | 唯讀 | CRUD | — | — | — |
| 文件索引管理（AI） | — | CRUD | 唯讀 | — | — |
| 文件調閱歷程 | 唯讀(全公司) | 唯讀(全公司) | — | — | — |
| 文件變更歷程 | 唯讀(全公司) | 唯讀(全公司) | — | — | — |
| 組織人員異動管理 | CRUD | 唯讀 | — | — | — |
| 系統參數設定 | CRUD | — | — | — | — |
| 前台瀏覽（開新視窗） | 可 | 可 | 可 | 可 | 可 |

> 一般使用者（User）無後台入口，登入後直達前台（F002）。

---

## 8. 關鍵參考檔案（Key Reference Files）

| 類別 | 檔案 | 供本設計參照之內容 |
|------|------|--------------------|
| Spec 索引 | `docs/specs/spec-index.md` | Agent Loading Guide、定案決策、feature 索引 |
| 產品/故事總覽 | `docs/specs/overview.md`、`docs/stories/overview.md` | 角色、目標、Phase、使用者流程分組 |
| 指派 Feature（重點） | `docs/specs/features/F008、F009、F019、F020、F021` | DAG 畫布、節點抽屜、前台清單、浮水印、RWD |
| 全套 Feature | `docs/specs/features/F001–F041-*.md` | 各畫面 Main Flow / AC / Error Scenarios |
| 資料模型 | `docs/specs/data-model.md#document-entity`、`#appendix-entity`、`#doc-appendix`、**`#lifecycle-uniqueness`** | **20 欄位權威定義**、狀態集合、關聯表、`APPENDIX_POOL`／`DOC_APPENDIX(sortOrder)`、**`LIFECYCLE.subcategory` 與 INV-1／INV-2／INV-3** |
| NFR | `docs/specs/nfr.md#browser-rwd`、`#watermark` | RWD 三斷點/觸控、浮水印格式與防竄改 |
| 錯誤處理 | `docs/specs/error-handling.md`（含 **`#lifecycle-subcategory`**） | **錯誤碼 ↔ zh-TW 使用者訊息契約**（表單/toast 文案來源）；子分類三碼之語意與**固定驗證順序** |
| 架構 | `docs/specs/architecture-spec.md` §2/§3/§5.2/§5.3 | 前後台單一 SPA、RBAC guard、浮水印代理串流、Session 逾時、路由分流 |
| 附錄（E10） | `docs/specs/features/F039-appendix-management.md`（34 條 AC ＋端點契約）、`docs/stories/epics/E10-appendix/US-100/101/102` | 附錄池 CRUD、多檔上傳、覆蓋／移除門檻、文件內 `sortOrder` 與上移／下移互動、下載稽核 |
| 附錄架構裁定 | `docs/specs/architecture-spec.md` §3.6 決策二／決策五、§4.9 | 排序權威寫入路徑（建立/編輯頁一律 `PUT` replace-set）、新頁與選單插入位置、`MultiSearchCombobox` 之選填 `orderable`（首項停用上移、末項停用下移、無拖曳） |
| 循環子分類（F040） | `docs/specs/features/F040-lifecycle-subcategory.md`（**橫切權威、36 條 AC**）＋ F007／F010／F011／F017／F019／F008／F009／F036／F038 各自之「循環子分類 delta」段 | `normalizeSubcategory`／`lifecycleDisplayName`／`resolveLifecycleSelection` 三純函式契約、INV-1～INV-4、兩段式選取、下拉值＝`lifecycleId`、編號代碼不受影響 |
| 使用者子分類（F041）🟢 | `docs/specs/features/F041-user-subtype-business-scope.md`（**橫切權威、39 條 AC**）＋ F003（`AC-U1`～`AC-U5`）／F019（`AC-U1`～`AC-U6`）／F020（`AC-U1`～`AC-U5`）之 delta 段；`docs/specs/architecture-spec.md` §3.7 決策四（前端接縫）；`docs/specs/error-handling.md#dept-restriction`（**裁決後為 404 單案**）；`docs/specs/open-questions.md` `OQ-E08-04`～`OQ-E08-11`／`OQ-E06-03`／`OQ-E06-04`（**12 項裁決 2026-08-11 全數下達**） | `userSubtypeLabel`／`isSubtypeApplicable` 前端純函式契約、INV-1～INV-5、AC-31～AC-33（前端可測 3 條）、AC-37／AC-38（矩陣不變）、拒絕回應之 404 定稿與共通要求 |
| 流程圖 | `docs/specs/diagrams/F008-*.mmd、F009-*.mmd、F019-*.mmd、F020-*.mmd、document-status-lifecycle.mmd` | 防環、節點改派、排序管線、浮水印稽核、狀態機 |

---

## 9. 驗證方式（Validation Method）

prototype 產出後，逐檔以下列方式驗證：

1. **瀏覽器開啟測試** — 每個 HTML 於 Chrome/Edge 獨立開啟，無 build step、0 console error；以本機 static server（Node `http.createServer`）服務 `prototypes/` 目錄（`file://` 會被瀏覽器自動化拒絕）。
2. **Feature 覆蓋檢查** — 對照 §7 對照表，逐 F001–F041 確認主要檔案已呈現其 Main Flow 與關鍵 AC；未指派節點、防環、改派警示、部門置頂等定案行為須可實際觸發演示。
3. **互動狀態驗證** — 以 `claude-in-chrome` + `javascript_tool` 直呼頁面函式斷言狀態：角色模擬器切換（5 角色選單/欄位變化）、DAG 增刪節點/連線/防環 toast、drawer 三態（正常掛載/已掛他節點警示/空候選）、同步進行中→完成、diff 對照、分頁/篩選/搜尋、空狀態。
4. **RWD 斷點驗證** — `06` 及前台各頁於 360 / 375 / 768 / 1024 / 1440 寬度檢查：手機無水平捲動、清單改單欄卡片、觸控目標 ≥44px、篩選 sheet、檢視器可縮放且浮水印清晰。
5. **文案校對** — 全 zh-TW；錯誤/確認/空狀態文案與 `error-handling.md` 契約一致；無簡體、無殘留佔位字。
6. **色彩/對比驗證** — 依 §3 token 落實；正文對比 ≥4.5:1、UI/大字 ≥3:1（WCAG 2.1 AA）；狀態/角色徽章色相區隔可辨。
7. **RBAC 一致性驗證** — 後台選單裁切與欄位唯讀符合 §7.1 與 F025/F026 矩陣；無權限角色顯示封鎖/403 說明，前端隱藏不作為唯一防線（僅視覺呈現）。
8. **選單一致性驗證（E10 新增）** — 以 `grep -l "const MENU" prototypes/*.html` 列出全部內嵌選單之檔案，逐檔確認「附錄管理」項存在且緊接於「使用表單管理」之後；同一 shell 在任一頁之選單項目必須完全相同（漏改任一檔即為缺陷）。
9. **附錄排序驗證（E10 新增）** — `14`/`15`：依序勾選 3 筆 → 序號 1/2/3；新勾選者落末位；對末筆連按兩次「上移」→ 順序變為 C、A、B；首筆「上移」與末筆「下移」為 `disabled` 且順序不變；DOM 內 `[draggable]` 與 drag 事件數皆為 **0**；解除中間一筆後其餘相對順序不變並重編 1..N。`16`/`04`：所列順序與 `15` 排定者逐筆一致；`04` 之欄位摘要「附錄」列與下方 section 筆數同步；清空後兩處皆顯示「無附錄」。
10. **循環子分類驗證（F040 新增）** — (a) `10`：同名三列顯示為「銷售及收款循環（消金）」「（企金）」「（子公司）」、無子分類列不含括號；搜尋「企金」命中顯示名稱；建立同名同子分類 → `LIFECYCLE_DUPLICATE`、對無子分類之名稱補子分類（或反向）→ `LIFECYCLE_SUBCATEGORY_CONFLICT`、名稱留白 → `LIFECYCLE_NAME_REQUIRED` **優先於**兩者；編輯維持原值不報衝突；停用列仍參與比對。(b) `14`／`15`：選「銷售及收款循環」→ 出現子分類層（三選項、值為 `lc1`／`lc10`／`lc11`）、選「採購及付款循環」→ **不出現**子分類層、清空名稱 → 收起且欄位重新上鎖；未選子分類送出 → `LIFECYCLE_SUBCATEGORY_REQUIRED`；編號前綴恆為 `ICSOP-SRC-`（消金／企金／子公司相同）。(c) `13`／`03`／`23`：下拉 `option.value` 為 `lifecycleId`（非名稱字串）、選其一之結果不含同名另一子分類。(d) `22`：`?lifecycleId=lc10` 開啟「（企金）」而非「（消金）」。(e) `04`／`16`／`11`／`12`：循環別／標題字串與 `13` 完全一致。**本輪已於 headless Chromium（Playwright）實跑 51 條斷言全數通過、11 檔 0 console error。**
11. **使用者子分類驗證（F041，🟢 2026-08-11 定稿後複驗）** — (a) `08`：一般使用者列之「角色」欄同時顯示角色徽章與 `業務`／`其他` 徽章，**主管列不顯示子分類徽章**（即使其欄位值為 `business`，INV-2）；指派角色 modal 選「一般使用者」→ 子分類選擇器出現且預選目前值、選項標籤逐字為 `業務`／`其他`，其餘 **4 種角色皆不呈現**該選擇器；主管（隱含 `business`）改回一般使用者 → **保留值復活並預選**（AC-36 定案行為）；儲存後 `role`＋`subtype` 皆持久化；新建帳號之 `subtype` 預設 `other`。(b) `03`：**預設視角＝其他 → 共 13 筆、置頂 5／其餘 8（與 delta 導入前逐欄相同）且頂部說明句＝既有文案逐字未改**；切「業務」→ 共 5 筆、**全部落在置頂區、其餘區為空**、「另有 3 筆…已由後端隱藏」**數字不變**、使用部門下拉**選項數不變**、**頂部說明句＝ `SCOPE_NOTICE_BUSINESS` 逐字**；業務＋範圍外部門篩選 → 0 筆、顯示 `查無符合結果`（逐字）**且說明句仍為業務專屬文案**（空結果不再分支）；切「孤兒帳號」→ 0 筆、同一空狀態文案、**同一業務說明句**（不因帳號異常換句）。純函式 11 種輸入之 `normalizeUserSubtype`、5 種輸入之 `userSubtypeLabel`、5 角色之 `isSubtypeApplicable`、AC-05～AC-13 之可見性判定 7 例、以及 **`isUsingDeptMatched` 與置頂判定 `inScope` 逐案相等**（AC-10／INV-4）；1440／375 兩寬度無水平溢出。(c) `18`：`thead` 仍為 1+5 欄、`FUNC_ROWS` 13 列 × 5 值、`FIELD_ROWS` 20 列 × 5 值、每列渲染 6 格（**無第 6 欄**）、註記橫幅已翻為已定案。(d) `04`：拒絕面板可開啟、覆蓋層 `rgb(255,255,255)` **不透明**、**定稿為 404 `DOCUMENT_NOT_FOUND` 單案**、**面板全文不含任何 `403`／`PERMISSION_DENIED` 字樣**（403 一案已依裁決移除，歷史紀錄僅留於檔頭註解與附錄 A.3）、面板文字**不含**文件編號／書名／組織名稱、明列「不寫成功稽核亦不寫拒絕事件」。**定稿後已於 headless Chromium（Playwright）實跑 38 條斷言全數通過、4 檔 0 console error**（草案階段另跑過 46 條，兩案並陳相關斷言已隨裁決汰換）。

12. **D9 delta 驗證（2026-08-20 新增；已於 headless Chromium／Playwright 實跑 **124 條斷言全數通過**、28 檔 0 console error；🔴 **第三輪另補跑 39 條**（`AC-N74`／`AC-N75`／`AC-N76`／`AC-N25` 第三輪／`AC-N48` ① 改名 ＋ 逐字回歸），亦全數通過）** — (a) `05`：`querySelector('iframe, embed, object') === null`、`canvas[data-pdf-canvas]` 存在、`[data-testid="watermark-overlay"]` 與 `[data-testid="watermark-text"]` 皆為 0、`.wm-layer` 為 0、下載／列印鈕仍在、`[data-testid="watermark-format"]` 存在且標籤逐字、`#page.style.transform` 全程不含 `scale(`、`zoom(0.1)` 使渲染呼叫 +1 且最後一次參數為 `1.1`、`WM_COLOR==="#334155"`／`WM_OPACITY===0.30`、`toDisplayLines()` 恰 3 行、浮水印公司欄為簡稱、`goPage(2)` 生效。(b) 前台字級：`03`／`04`／`05` 三檔 rendered DOM 之 `text-xs` class **計數為 0**、無 `text-[Npx]` 任意值；`#scopeNotice` 含 `text-sm`、清單卡「內容摘要」含 `text-base`、`04` 之 `data-wm-note` 含 `text-sm`。(c) `13`：表頭 15 個、第 1 個逐字 `OJT`、其後 14 欄順序逐字比對通過、每列 `data-ojt-cell` ＋ `data-has-ojt` 僅 `"true"|"false"`、三種輸入兩種視覺（含一列刻意缺 `ojt` 鍵之 `undefined` 路徑）、OJT 三值篩選一字未動。(d) `16`：主管／部門窗口 → 可寫項**恰 1 個**（OJT）、其餘 6 列皆帶 `data-readonly-attachment`、唯讀句為改寫句；系統管理員 → 上傳入口 0、全列唯讀、**原唯讀句逐字保留**。(e) `15`（🔴 **2026-08-20 第三輪就地改寫斷言形狀**）：以 **class 指派**斷言而**非版面**——`[data-ojt-upload]` 之 class 含 `ojt-write`、不含 `write-only` 且**恰 1 個**；ICSOP PDF 取代鈕與 `.xls` 上傳鈕之 class 含 `write-only`、不含 `ojt-write`；`querySelectorAll('.write-only.ojt-write').length === 0`（兩組交集為空）；兩則唯讀提示常數與 `16` **逐字相同**（`AC-N76` ③）。<br>⚠ **被撤回之錯誤建議（如實記錄）**：本 agent 原建議以 `offsetParent === null` 斷言「PDF 取代鈕對主管不可見」——**該形狀在 vitest／jsdom 下恆真（假綠）**，jsdom 不做版面計算。經 lead 指出後已全面改為 class 指派 ＋ `data-*` 掛鉤，並就地補入 `AC-N25` 第三輪擴充／`AC-N76`。**`offsetParent` 僅可用於 prototype 在真實瀏覽器中之自檢，不得進入約束環。**(f) `19`：表頭 8 欄逐字、0 筆 `制定部門` 顯示 `—`、多筆以 `、` 分隔、每列 `data-wm-note`、SysAdmin 之列內動作 `queryByLabelText('編輯') === null`（🔴 第三輪改名後之新標籤）。(g) `19a`／`19b`：`[role="dialog"]` 為 `null`、頁標題與三區塊標題逐字、topbar 有「儲存」「取消」、重複／超長編號之錯誤訊息逐字、唯一性排除自身列、清空回 `已清除表單編號。`。(h) `17`：類型下拉 5 個 option 逐字、選「上傳」只回上傳列、選「文件」排除上傳列、上傳列浮水印快照留空、公司欄仍全稱而浮水印快照為簡稱。(i) `22`／`23`：疊加層仍存在、`opacity` 為 `0.3`、色值為 `rgb(51, 65, 85)`。(j) `24`：每列 `data-wm-note`。(k) `05` RWD：1440／768／375／360 四寬度 `documentElement` 水平溢出皆為 **0**、`#page` 左緣 ≥ 0（修正 flex 置中在子元素較寬時把左緣推成負值之缺陷）。

---

## 附錄 A：對 Spec 之待釐清事項（供使用者確認）

本設計於閱讀 spec 時發現下列需釐清處，**多數已提供設計預設值以不阻塞原型產出**，惟以下建議確認：

1. **浮水印視覺樣式與時間格式（OQ-NFR007a / OQ-NFR007b）— 已確認 ✅** — 使用者採納：對角 45°、平鋪重複、opacity 0.12、字級 14px、`slate-500`；時間 `YYYY-MM-DD HH:mm:ss (UTC+8)`。稽核快照字串（F023）依此一致。
2. **DeptContact（部門窗口）後台內容極少** — 依 F025 其後台僅「ICSOP 文件管理唯讀」一項。請確認是否仍於分流頁（F002）提供「後台」選項，或部門窗口實務上等同一般前台使用者。設計預設：保留後台選項，但只顯示唯讀文件檢視（沿用 `16`）。
3. **「系統參數設定」無對應 feature 規格** — F025 列 SysAdmin 對「系統參數設定」為 CRUD，但 F001–F041 無此功能之細部 spec。設計預設：`07` sidebar 顯示此項但本輪**不產出**其內部畫面（標示為未來項），待補 feature 後再設計。
4. **附件格式/大小上限未定（OQ-E04-06 / OQ-E05-02，Blocking）** — 上傳元件（`14/15`）需顯示允許格式與大小上限。設計預設以佔位值（如 ICSOP PDF 僅 `.pdf`、使用表單 `.xlsx/.xls/.pdf`、上限 20MB）呈現並標「示範值，待確認」。
5. **循環（Lifecycle）欄位（OQ-E03-01）** — 是否需「擁有部門」等欄位未定。設計預設僅呈現 data-model 已定義之 名稱/說明/狀態；若需擁有部門，`10` 表單可擴充。
6. **使用表單下載是否需浮水印（OQ-E05-03）** — 影響 `04` 前台表單下載之呈現。設計預設：使用表單下載**不**燒錄浮水印（比照 architecture §5.2 之 SAS 直下模式），僅 ICSOP PDF 燒錄；待確認。
7. **F025 矩陣其餘部分待審（OQ-E08-02）** — `18` 權限矩陣畫面將明確標示「已定案」與「草案待審」兩類，避免誤讀為最終權威。

### A.1 OQ-E10-01 附錄上傳互動落差 — UI 裁定（2026-08-06，本 agent 收斂 ✅）

**問題**：prototype `24` 草稿之上傳 modal 為「單檔選取 ＋ 附錄名稱**必填**（空值即擋）」，與 US-100 AC1「一個或多個檔案」、AC4「名稱可留空 → fallback 檔名」矛盾。spec-writer 提出三個候選解：(a) 選檔後自動預填檔名使「必填」與 fallback 不矛盾；(b) 補多檔選取並隱藏名稱欄；(c) 收窄 stories。

**裁定：採 (a)＋(b) 之複合解，不採 (c)。**

| 選檔數 | 名稱欄 | 建檔名稱來源 |
|---|---|---|
| 1 | **顯示，標示「選填」**；選檔後自動預填檔名（使用者改寫後不再被換檔覆寫） | trim 後之輸入值；trim 後為空 → fallback 原始檔名 |
| ≥2 | **隱藏**，改顯示「多檔上傳不提供自訂名稱，各檔一律以其檔名建檔」 | 各檔原始檔名 |

**理由**：
1. **純 (a) 不可行** — (a) 僅解決「名稱必填 vs fallback」的矛盾，未解決「單檔 vs 多檔」；F039 AC-02（一次 3 檔建立 3 筆）在純 (a) 之下無法呈現，prototype 仍會與 spec 打架。
2. **純 (b) 損失能力** — 一律隱藏名稱欄等同放棄 AC-05（自訂名稱 trim 建檔），而 F039 端點契約明文保留「單檔可帶選填 `name`」。
3. **(c) 需回頭改已定案 stories**，成本最高且無產品理由；使用者原始需求（集中附錄池、批次建檔）反而支持多檔。
4. 複合解與 **F039 Interface Contract 逐字對位**（「單檔可帶選填 `name`；多檔不接受 `name`」），UI 因此**不會**產生後端拒收的請求形狀——名稱欄的顯示條件即為契約條件本身。
5. 「必填」改「選填」是**放寬**而非收緊，不會使既有可通過之操作被擋下。

**連帶落實**：`50MB` 上限（`FILE_SIZE_EXCEEDED`，恰 50MB 通過）與 `400` 字元名稱上限（`APPENDIX_NAME_TOO_LONG`）兩項驗證原草稿完全缺漏，一併補上；多檔採「先全部驗證再全部建立」，任一檔違規整批擋下（AC-02）。

### A.2 F040 循環子分類 — UI 設計裁量與人類閘門裁決（2026-08-07，🟢 APPROVED）

**使用者定案（不再討論）**：子分類非必填；`(name, subcategory)` 組合唯一；同名不得並存「無子分類」與「有子分類」；文件編號循環代碼僅依名稱；顯示字串 `名稱（子分類）`（全形括號無空白）。

#### A.2.1 人類閘門裁決（2026-08-07 通過，已落實）

| 裁決 | 內容 | 落實 |
|---|---|---|
| **A** | 樹狀圖預覽頁查詢參數由 `?cycle=` **改名為 `?lifecycleId=`**（值本即 lifecycleId，行為不變） | 讀取端 `22`；產生端 `10`（`openTree`）、`13`（`openTreePage`）。全站 grep 無殘留 `?cycle=` |
| **B** | 示範子分類改為業務貼切名稱：**消金／企金／子公司**（取代原「車貸／房貸」） | `LIFECYCLE_POOL` 由 2 個 SRC 子分類擴為 **3 個**（`lc1` 消金／`lc10` 企金／`lc11` 子公司），7 檔＋硬寫字串處全部改齊 |
| **C** | F010 AC-S4 字面歧義由 spec-writer 補字，prototype 兩段式實作**維持不變** | 未改動 |
| — | 後端錯誤碼收斂（缺 `lifecycleId` → `DOCUMENT_REQUIRED_FIELD_MISSING`；`LIFECYCLE_SUBCATEGORY_REQUIRED` 僅用於 INV-2 髒資料） | **不影響前端**；`14`／`15` 之「選了名稱但未選子分類 → 前端 `resolveLifecycleSelection` 擋下並顯示 `LIFECYCLE_SUBCATEGORY_REQUIRED`」（AC-21）照舊 |

#### A.2.2 裁決 B 之連帶調整（本 agent 判斷，需知悉）

換成業務貼切名稱後，原本的示範資料歸屬產生**語意矛盾**，故一併調整：

| # | 調整 | 理由 |
|---|------|------|
| 1 | **`ICSOP-SRC-101-2-00 消金審核作業` 由（企金）改掛（消金）** | 換名後該文件掛在「企金」之下是直接矛盾（文件名稱即「消金」）。原本掛在「房貸」僅是不相關，換名後變成互斥。 |
| 2 | **新增 1 筆真正屬於企金之示範文件**：`ICSOP-SRC-103-1-01 企業金融授信作業`（`13`／`03` 各一列） | 若不補，(企金) 與 (子公司) 皆為 0 筆，F017 AC-S2／F019 AC-S2 之「選定其一不含同名其他子分類之文件」將退化為空狀態、失去示範力。制定組織用既有 roster：信用審查部／企金室／林建宏（企金室 室長），不新增人員或組織。 |
| 3 | **（子公司）刻意維持 0 份文件掛載** | 示範「新設立、尚未掛載文件之子分類」；同時使 `10` 的「無掛載可直接刪除」分支有真實可點的對象。 |

#### A.2.3 本 agent 之設計裁量（保留紀錄）

| # | 裁量 | 取捨理由 |
|---|------|----------|
| 1 | **兩段式第二段之選項顯示完整 `lifecycleDisplayName`**（`銷售及收款循環（消金）`）而非僅子分類字串（`消金`） | F010 AC-S4 逐字要求「顯示字串由 `lifecycleDisplayName` 產生」。裁決 C 已確認此判讀，規格由 spec-writer 補字。 |
| 2 | **選定「名稱」即開放後續欄位並帶入編號前綴**（不等到選完子分類） | 前綴僅依名稱推導；且 F010 AC-S1「僅選名稱即送出應被擋下」必須可達——若名稱層不解鎖後續欄位，使用者根本無法填完其餘必填欄位而觸發該情境。 |
| 3 | **清單不依名稱分組、子分類不另用 badge**，一律以單一顯示名稱字串呈現 | AC-30 要求全站顯示字串同源；分組或 badge 會使「清單列的可見文字」不再等於 `lifecycleDisplayName` 輸出，讓下游 fidelity 測試無從斷言。 |
| 4 | **`10` 之搜尋框 placeholder 由「搜尋循環名稱…」改為「搜尋循環名稱／子分類…」** | 行為已依 F007 AC-S8 改為比對顯示名稱；不改文案會使提示與實際行為不符。 |

#### A.2.4 仍需下游知悉（非阻塞）

1. **INV-2 之髒資料在前端無法「示範」** — AC-25（同名同時存在 `null` 與非 `null` 列）依規格不應存在於正常池中，本輪僅於 `resolveLifecycleSelection` 實作防禦分支（同名列數 > 1 且含 `null` 列 → 一律回 `LIFECYCLE_SUBCATEGORY_REQUIRED`），**未**在示範資料中製造違反 INV-2 的髒列（會使 `10` 的清單自相矛盾）。下游單元測試請直接對純函式餵入髒池驗證。
2. **`10` 的「掛載文件數」與 `13` 的實際列數本就不對帳**（既存狀況，非本輪造成）；三個 SRC 子分類之 `docs` 已與實際掛載一致：消金 8（示範彙總值）、企金 1、子公司 0。

### A.3 F041 一般使用者子分類 — 人類裁決紀錄與 UI 影響追溯（🟢 2026-08-11 人類閘門通過，12 項裁決）

> **狀態：已裁決、已落實。** 下表原為「待裁決 → 若改選 B 要改哪一塊」之施工對照，裁決後**保留供日後追溯**：
> 左欄為**現行定案**（prototype 已依此落實），右欄為「當初若改選其他選項會發生什麼」——保留原因是
> 日後若有人重提某個選項（例如資安要求改回 403、或要求限縮部門下拉），可直接讀出影響面，不需重推一次。

#### A.3.0 12 項裁決一覽（2026-08-11）

| OQ / 項目 | 裁決 |
|---|---|
| OQ-E08-04 身分模型 | **B 子分類旗標**（`ACCOUNT.userSubtype`；**不新增第 6 種角色**） |
| OQ-E08-05 比對語意 | **A 子樹展開**（重用 `isWithinSubtree`） |
| OQ-E08-06 涵蓋面 | **C 全面收斂**（清單/搜尋/篩選/詳情直連 URL/檢視器/下載列印；RAG 為未來 ripple） |
| OQ-E08-07 4a 兩區塊 | **A 保留置頂／其餘兩區塊**（其餘區恆空＝預期退化） |
| OQ-E08-07 4b 下拉限縮 | **A 不限縮** |
| OQ-E08-07 4c 空狀態文案 | **A 沿用 `查無符合結果` 逐字、不分支** |
| OQ-E08-08 孤兒／多部門／生效時機 | 孤兒 deny-by-default／多部門 Out of Scope／異動下次請求生效 |
| OQ-E08-09 多使用部門 | OR 語意 |
| OQ-E08-10 拒絕稽核 | **A 不記錄**（`AUDIT_LOG` 不動、`17-access-history` 不需改檔） |
| OQ-E08-11 F033 落差 | C 維持現狀＋補釐清句 |
| **OQ-E06-03 回應碼** | **A：404 `DOCUMENT_NOT_FOUND`**（不再兩案並陳） |
| OQ-E06-04 檢查時機 | A 後端服務層權威 |
| F041 AC-36［ASSUMPTION］ | **保留不清空**（`08` 之陳彥廷 persona 維持） |
| F041 AC-02［ASSUMPTION］ | 未知值收斂為 `'other'`（fail-open） |
| **＋ UI 新增裁決** | **`03` 頂部說明句於業務視角換為專屬文案**（採納本 agent 於 A.3.3 第 1 條之提報；逐字內容見該條與 §6.20 (d-2)） |

#### A.3.1 各 OQ 之 UI 影響（追溯用）

| OQ | **現行定案**（已落實） | 當初若改選其他選項，UI 需改動之處（保留供追溯） |
|---|---|---|
| **OQ-E08-04** 身分模型 | ✅ **B 子分類旗標**（`08` 選擇器、`18` 註記已依此定稿） | 改選 **A（第 6 種角色 `BusinessUser`）**＝影響面最大：`08` 之子分類選擇器整塊**刪除**（改為 `roleRadios` 加第 6 個選項）、角色欄之子分類徽章刪除、`18` 兩份矩陣**各加第 6 欄並逐列填值**（`thead` 6→7 欄、`FUNC_ROWS`／`FIELD_ROWS` 每列 5→6 值）、`08`／`18`／`17` 等頁之角色模擬下拉 5→6 項、§6.20 全節重寫。改選 **C（上游推導）**＝`08` 之選擇器改為**唯讀顯示**（由上游決定、管理員不可改），並需於 `09` 組織同步頁補一列說明其來源欄位 |
| **OQ-E08-05** 比對語意 | ✅ **A 子樹展開**（`03` 之 `isUsingDeptMatched` 委派既有置頂判定） | 改選 **B（精確相等）**＝`03` 之 `isUsingDeptMatched` 不再與 `inScope` 共用（兩函式分家）；此時「其餘區恆空」**不再成立**，`03` 必須真的呈現「置頂 + 其餘」兩區皆有資料之業務視角（本輪示範資料下業務者可見筆數將由 5 降為 0——王小明掛 `審查室`，而示範文件多掛部層以上），示範資料需一併重配 |
| **OQ-E08-06** 涵蓋面 | ✅ **C 全面收斂**（清單＋詳情＋檢視器/下載列印） | 改選 **A（僅清單）**＝`04` 之拒絕面板與示範按鈕整塊刪除，`03` 之過濾保留。改選 **B（含 RAG）**＝`20-public-qa.html` 需補「業務子分類之引用來源亦受限縮」之呈現（本輪未做，Phase 3 未實作） |
| **OQ-E08-07 4a** 兩區塊 | ✅ **A 保留**（`03` 之置頂／其餘拆分邏輯**零特判**） | 改選 **B（前端隱藏視覺分隔）**＝改 `03` `render()`：業務視角時不渲染兩個 `<h2>` 區塊標題、改為單一無標題清單。⚠ 注意：本輪業務視角下「其他文件」標題確實會消失，但那是**既有「空區塊即收合」通則**所致（`其他` 子分類遇空區塊行為完全相同），**不是**已實作選項 B |
| **OQ-E08-07 4b** 下拉限縮 | ✅ **A 不限縮**（`03` 之 `DEPTS` 推導方式不變） | 改選 **B（限縮）**＝改 `03` 之 `DEPTS` 推導為「僅含使用者部門之子樹與祖先鏈」，並需新增一個選項計算純函式；同時 `fDeptM`（手機 sheet）與 `fDept`（桌機）**兩處**都要套用 |
| **OQ-E08-07 4c** 空狀態文案 | ✅ **A 沿用 `查無符合結果`**（逐字，不分支）。⚠ 注意：本題只管**空狀態**；**頂部說明句**另由 2026-08-11 新裁決改為業務專屬文案（見 A.3.3 第 1 條） | 改選 **B（業務專屬文案）**＝改 `03` `#emptyState` 之 `<p>`，並需**先確定逐字文案**（prototype 為文案權威）；同時決定副標「請調整搜尋關鍵字或篩選條件」與「清除篩選」鈕是否保留（業務者清除篩選也不會多出文件） |
| **OQ-E06-03** 404 vs 403 | ✅ **A：404 `DOCUMENT_NOT_FOUND`**。403 卡片與「兩案並陳」橫幅**已移除**，`04` 拒絕面板改為單張置中卡、文案定稿為「查無此文件／查無此文件，或該文件尚未公告。」 | 若日後改回 **B（403 `PERMISSION_DENIED`）**＝改 `04` 單張卡之 icon（`file-x`→`lock`）、標題、內文與錯誤碼行三處；共通要求不變（文案不得因「不存在」與「無權」而分歧、畫面不得出現任何文件欄位） |
| **OQ-E08-10** 拒絕稽核 | ✅ **A 不記錄**（`04` 面板明列「不寫成功稽核、亦不寫拒絕事件」；`17` 未改檔） | 改選 **B**＝`04` 面板之說明列補「另寫入一筆 `ACCESS_DENIED_DEPT_RESTRICTION`」，並須改 `17-access-history.html`：`ACT_STYLE` 補該 `actionType`、類型篩選補該選項、`RECORDS` 補示範列 |
| **OQ-E08-08／09／11／E06-04** | ✅ 皆依草案裁決 | 對 UI 無影響（`03` 之孤兒帳號示範視角已涵蓋 08 之 deny-by-default；OR 語意已由既有多使用部門示範文件涵蓋） |

#### A.3.2 本 agent 之設計裁量（保留紀錄）

| # | 裁量 | 取捨理由 |
|---|------|----------|
| 1 | **`03` 之預設視角＝「其他」而非「業務」** | F019 AC-U5 為**回歸鎖定**：其他子分類與其餘 4 角色之輸出須與 delta 導入前逐欄相同。預設停在「其他」使 `03` 直接開啟時仍是**已定案的既有畫面**。（閘門已通過，此裁量之退場價值已用不到，但預設值本身保留——它同時是 AC-U5 回歸鎖定最直觀的人眼檢查點。） |
| 2 | **加入「示範視角」切換器（`03`）與「示範拒絕」按鈕（`04`）** | 前台頁原本沒有角色模擬器（那是後台 shell 的元件），但 F041 的效果**只有換視角才看得見**。切換器沿用後台 `18` 之橫幅元件（相同 class；閘門通過後由琥珀「草案待審」改為 emerald「已定案」樣式），並以 `[data-prototype-demo="true"]` 標記為**非正式 UI**，避免被移植進實作。 |
| 3 | **`03` 第三種示範視角＝「業務（孤兒帳號）」** | AC-12 之 deny-by-default 是本 feature 最容易被實作成「fail-open 全可見」的一條，且其正確行為（**空清單、非錯誤、不提示帳號異常**）只有實際看到才驗得出來。不新增文案，沿用同一空狀態。 |
| 4 | **子分類徽章放在既有「角色」欄內，不新增欄** | (a) `08` 是滿版 10 欄表格，新增欄會壓縮既有欄；(b) 子分類在語意上是角色的**下位細分**，並排呈現比另立一欄更貼近 INV-2；(c) 只在一般使用者列呈現，天然滿足「其餘 4 種角色不影響任何顯示」。表格 `min-w` 由 960 調為 **1020**（徽章使自然寬度增加，`min-w` 為橫捲地板需同步）。 |
| 5 | **徽章用外框 pill（非角色徽章之實心色塊）** | 實心色塊是本專案「角色」的既有視覺語彙；子分類若沿用會被誤讀為第 6 種角色——而「不新增角色」正是 F041 反覆宣示之事。改用既有「來源」徽章之外框 pill 形狀，色相區隔而形狀有別。 |
| 6 | **`08` 建立帳號 modal **不**加子分類選擇器** | F003 AC-U1 只要求角色指派 modal；AC-U3／AC-35 規定未指定即 `'other'`。加了反而製造一條 spec 沒有的路徑。新帳號之 `subtype` 於資料層預設 `'other'`，需要變更再走「指派角色」。 |
| 7 | **`08` 示範資料刻意讓「主管 陳彥廷」持有隱藏的 `business`** | 原為 AC-36／F003 AC-U5 之 `[ASSUMPTION]` 裁決輔助（把「隱形的舊設定復活」做成可實際操作的一次點擊）。**2026-08-11 裁決＝保留不清空**，故此 persona 由「裁決輔助」轉為**已定案行為之唯一可操作示範，勿移除**（陳彥廷 → 指派角色 → 一般使用者 → 子分類已預選「業務」）。 |
| 8 | **`04` 拒絕面板採不透明覆蓋，而非既有 admin 頁之半透明 `backdrop-blur`** | AC-20 要求回應不得含任何文件欄位；半透明會讓文件編號／書名**仍然看得見**，等於在畫面上洩漏了後端刻意不回傳的東西。這是刻意偏離既有 `blockOverlay` 樣式的**唯一**一處，理由如上。 |
| 9 | **`05-public-viewer-watermark.html` 未改檔** | F020 delta 影響的是**授權層**（是否允許執行），不是浮水印產生層——NFR-007 之字串格式、三處一致性完全不變。業務者根本到不了 `05`（清單與詳情都已擋下）；直連 `05` 之拒絕與 `04` 為同一面板、檢視器不開啟。在 `05` 內另做一份拒絕畫面會產生第二份需維護的拒絕文案。 |
| 10 | **`17-access-history.html` 未改檔**（2026-08-11 裁決後確認） | OQ-E08-10 裁決 A＝不記錄拒絕稽核，`AUDIT_LOG.actionType` 列舉不變，故調閱歷程查詢頁之 `ACT_STYLE`／類型篩選／示範列皆無需擴充。（若日後改選 B，此頁為必改點，見 A.3.1。） |
| 11 | **業務專屬說明句之逐字內容**（2026-08-11 新裁決，文案由本 agent 擬定） | 前半**刻意沿用既有句型**（「僅顯示『已公告』文件（進度中/失效/作廢由後端過濾隱藏）」）以維持一致語氣、並明示基底條件未因子分類而改變；後半用「**其餘部門之文件不在您的瀏覽範圍內**」而非「沒有其他文件」——差別在於前者陳述**範圍受限**、後者會讓使用者誤判全公司僅有這些。結尾「**如需調閱請洽該部門窗口**」給出可行的後續動作（部門窗口為本系統既有角色，非新造流程）。孤兒帳號**沿用同一句**：若為其另寫一句，等同以文案差異宣告「你的帳號有問題」，違反 error-handling.md#dept-restriction「不得以錯誤訊息區分『無文件』與『帳號異常』」。 |

#### A.3.3 提報事項之處置結果

1. **✅ 已裁決並落實 — 前台清單頂部之說明句於業務視角換為專屬文案。** 原提報：`03` 的 primary 提示框「一般使用者僅顯示『已公告』文件…；您所屬部門相關文件會自動置頂。」對業務子分類**只描述了一半**（未提及可見範圍已被限縮），而 OQ-E08-07 4c 只涵蓋**空狀態**文案、不涵蓋此句。**人類裁決＝(b) 業務視角換專屬說明句，逐字內容由 ui-ux-designer 擬定。**<br>　**定稿逐字內容（下游 test-generator 會逐字斷言）**：<br>　· 其他子分類（`SCOPE_NOTICE_OTHER`，**一字未改**）＝`一般使用者僅顯示「已公告」文件（進度中/失效/作廢由後端過濾隱藏）；您所屬部門相關文件會自動置頂。`<br>　· 業務子分類（`SCOPE_NOTICE_BUSINESS`，**新增**；孤兒帳號沿用同一句）＝`業務使用者僅顯示「已公告」且使用部門為您所屬部門（含其下所有單位）之文件（進度中/失效/作廢由後端過濾隱藏）；其餘部門之文件不在您的瀏覽範圍內，如需調閱請洽該部門窗口。`<br>　撰寫理由見 A.3.2 第 11 條。**容器／字級／色彩沿用既有 primary 提示框、未新增元件**；**空狀態文案未動**（仍為 `查無符合結果` 逐字、不分支）。
2. **未採納／未列入本輪 — `08` 之角色篩選未提供「子分類」篩選條件。** 管理員若要找出「所有業務使用者」目前只能逐列看徽章。F003 delta 未要求，本輪未加；若實務上需要，屬 F003 之另一條 additive delta（需另開 story）。
3. **已知悉 — 子分類選擇器之兩行說明文字為本 agent 撰寫**（「前台僅顯示『使用部門相符』之已公告文件（含子樹）」／「前台瀏覽範圍不變」）。內容為 F041 規則之複述，非規格逐字文案；閘門未要求鎖定逐字，故維持現狀，下游若需調整不視為偏離。
4. **未列入本輪（依裁決）— 業務子分類使用者於 `20-public-qa.html`（RAG 問答）之呈現。** OQ-E08-06 裁決 C：RAG 為**未來 ripple**（Phase 3 尚未實作），本輪不處理；F041 AC-39 僅為「日後 F033 實作時不得比本 feature 寬鬆」之下限保證。

---

*本總覽為 Phase 0 交付。經使用者確認後，將依 §4 檔案結構與 §5 執行順序，逐階段產出 `prototypes/` 下 25 個 self-contained HTML 原型（含 Phase G AI 智慧問答 RAG：`20`/`21`，循環樹狀圖預覽 `22`／文件變更歷程 `23`，以及 Phase H 附錄管理 `24`）。*

---

### A.4 2026-08-16 缺失／變更 delta（18 項）— prototype 傳播紀錄（🔴 人類閘門已通過）

> 上游：product-analyst → spec-writer → system-architect 已完成；規格權威＝`docs/specs/features/` 中帶 **`AC-D#`** 批次之十份 feature（F002 F011 F017 F018 F019 F020 F026 F036 F037 F038 F039）＋ `architecture-spec.md` §10.3／§10.8／§10.14。
> 本節僅記錄「傳播到 `prototypes/*.html` 的結果」；行為與資料契約以各該 feature 為準。

#### A.4.1 逐檔改動

| Prototype | 改動 | 權威 |
|---|---|---|
| `03-public-list.html` | 桌面篩選列改為**恰 6 項**（`制定公司`／`制定部門`／`制定室別`／`當責室長`／`狀態`／`循環別`），五項為可搜尋下拉、`狀態` 維持原生 select；移除「使用部門」篩選器；行動底部 sheet 同 6 項同順序；卡片 `<dl>` 標籤改為 `制定公司：`／`制定部門：`／`制定室別：`／`版次：`／`公告日期：`／`內容摘要：`（移除「使用部門：」「循環別：」與使用部門逐段高亮）；「清除篩選」涵蓋新增四項；當責室長比對＝主要∪次要 | F019 `AC-D1`～`AC-D13` |
| `04-public-document-detail.html` | 移除「文件使用部門」欄；附件／附錄／使用表單三類之**非 PDF 列**顯示逐字 `此格式不支援浮水印`、PDF 列顯示既有正向文案 `檢視/下載將燒錄浮水印`；原「附錄不燒錄浮水印」註解改寫為前台燒錄語意 | F019 `AC-D9`、F020 `AC-D1`／`AC-D2`、F039 `AC-D1`／`AC-D2`、F018 `AC-D11`／`AC-D12` |
| `05-public-viewer-watermark.html` | **未改檔**（已核對，見 A.4.3） | F020 既有 AC |
| 16 個 admin shell 頁（`07`–`19`／`21`／`23`／`24`） | 側欄最上方新增「首頁」項（不經角色過濾）、側欄 logo 改為可點回 `/admin`、麵包屑非末段改為可點連結（末段維持純文字） | F002 `AC-D1`～`AC-D7`、arch §10.8 |
| `13-document-list.html` | 篩選 9 → **13 項**且順序全面重排；新增 `公告日期`（區間）／`附錄`／`使用表單`／`OJT`；`程序書書名內` 雙行為；行動底部 sheet；「清除全部篩選」 | F017 `AC-D1`～`AC-D9`、F018 `AC-D8` |
| `14-document-create.html` | 版次輸入補 blur 補零（與 `15` 收斂為同一行為） | F011 `AC-D2`～`AC-D7` |
| `15-document-edit.html` | topbar 新增「返回」鈕；版次輸入補 blur 補零 | F011 `AC-D1`～`AC-D6` |
| `19-usage-form-management.html` | 表頭新增首欄「表單編號」；上傳 modal 新增選填「表單編號」（含長度／唯一性驗證示範） | F018 `AC-D1`～`AC-D7` |
| `22-lifecycle-tree-preview.html` | 新增**雙擊節點 → 唯讀右側抽屜**（程序書編號／書名／版次／狀態／公告日期，點列開後台唯讀詳情）；節點 `docs:N` 改為程序書列陣列（筆數與改動前逐節點相同） | F036 `AC-D1`～`AC-D8` |
| `23-change-history.html` | 兩 tab **各自**於 topbar 新增「匯出」鈕（兩個獨立控制項，切 tab 各顯其一） | F037 `AC-D1`～`AC-D9`、F038 `AC-D1`～`AC-D5` |
| `24-appendix-management.html` | topbar 新增「匯出」鈕（非 write-only：匯出為讀取類動作，SysAdmin 唯讀角色允許） | F039 `AC-D4`～`AC-D11` |

#### A.4.2 本 agent 之設計裁量（spec 明文授權或未規範者）

| # | 裁量 | 理由 |
|---|---|---|
| 1 | **`13` 之 13 項篩選收納＝桌面多列 grid（md 2／lg 3／xl 4 欄，佔 4 列）＋ 行動（< md）底部 sheet** | OQ-D18-13 明文授權定稿。多列 grid 直接滿足 `AC-D1` 之「由左至右、逐列換行」；底部 sheet 沿用前台 `03` 之既有慣例（`AC-D1` 亦以「行動 sheet」措辭指名），不新造互動語彙。 |
| 2 | **`03` 之 6 項篩選＝桌面 3 欄 × 2 列 grid**（原為單列 flex） | 6 個控制項中有 5 個是帶 label 的 combobox，單列 flex 於 `max-w-5xl` 內必然溢出。 |
| 3 | **`19` 無編號者顯示 `—`**（附 `title="此表單未設定編號"`） | 與 `13` 之「制定室別」空值（`—`＋title）為同一既有慣例，不新造符號。`AC-D1` 亦逐字指定 `—`。 |
| 4 | **`03` 桌面 `狀態` 之選項文字由 `狀態：有效` 改為 `有效`** | 新版 grid 每個控制項都有獨立 label（`狀態`），選項再自帶「狀態：」前綴會重複；行動 sheet 本來就是「label `狀態` ＋ option `有效`」，此改動使桌面與行動一致。**非 spec 定義之逐字文案**（已列入 A.4.4 回報）。 |
| 5 | **`13` `程序書書名內` 之 placeholder ＝ `全部（或直接輸入部分書名）`**（其餘 combo 維持 `全部`） | `AC-D3` 之雙行為（等值下拉＋contains 輸入）在 UI 上不可見，需一句提示；placeholder 為既有元件之既有位置，不新增元件。**非 spec 定義之逐字文案**（已列入 A.4.4）。 |
| 6 | **麵包屑與側欄之 route 以 `data-to="/admin/..."` 屬性記錄**，`href` 指向對應 prototype 檔 | prototype 為靜態檔、無 router；`data-to` 之值**逐字取自 F002 `AC-D3` 之逐頁對映表**，使下游實作不需重新推導 route。 |
| 7 | **`04` 附件區新增「示範：切換 OJT 格式 pdf／jpg」示範控制** | `AC-D2` 要求三類檔案（附件／附錄／使用表單）**適用同一規則、同一文案**，但附件類原本兩列皆為 PDF，`此格式不支援浮水印` 在該類無載體。OJT 實體簽到表之白名單本含 `jpg/jpeg/png`，故此為真實可達之狀態。沿用本檔既有之「示範：切換有／無附錄」控制形式。 |
| 8 | **`22` 節點之 `docs:N` 改為程序書列陣列** | `AC-D2`（抽屜列數）與節點徽章數字若各存一份，必然漂移。改為單一事實來源後，**每節點筆數與改動前之徽章數字逐節點相同**（無視覺回歸）。 |
| 9 | **`23` 兩個匯出鈕以 `id="exportDoc"`／`id="exportTree"` 區分，切 tab 時僅顯示其一** | F038 `AC-D1` 明訂為「兩個獨立控制項」；兩者同時可見會讓使用者無從判斷按下的是哪一份。 |

#### A.4.3 核對後確認「無需改動」之項目

1. **`05-public-viewer-watermark.html` — 浮水印定義已正確，未改檔。** 其疊加層為 `${WM_DATA}<br>${WM_NOTICE}<br>${WM_TIME}` 三層式，`WM_DATA` 已含員工編號（`22345`）與姓名（`王小明`），與 architecture-spec §10.14 之分割規則（①身分資料列 ②固定機密聲明 ③時間戳）**逐項相符**、無衝突。頁尾 `wmString` 仍為線性稽核快照字串（§10.14「不改後端回傳結構」）。缺失 delta 第 7／17 項為 `BUG-IMPL`（React 端 `PublicViewerPage` 直接渲染線性字串、`ChangeHistoryPage` 另加 `whiteSpace:'nowrap'`），非 prototype 錯誤。
2. **`23-change-history.html` 之新舊樹狀圖浮水印 — 已是三層式，未改。** `wmSpans()` 已輸出 `${WM_DATA}<br>${WM_NOTICE}<br>${WM_TIME}`，`WM_DATA` 含員工編號 `20233` 與姓名 `李慧玲`，與 `05` 逐格式相同。CSS 之 `.wm-layer span{white-space:nowrap}` 與 `05` 相同且**不構成缺陷**——內容以 `<br>` 強制斷行，`nowrap` 僅避免長身分列意外回捲。§10.14 要求移除的 `whiteSpace:'nowrap'` 位於 `ChangeHistoryPage.tsx` 之 `DiffBoard`（該處作用於**單一線性字串**），與本 prototype 情形不同。
3. **`15-document-edit.html` 之版次輸入 — 部分符合，已補。** 現行 `onEditionChange()` 對 `AC-D2`（輸入不補零）與 `AC-D5`（上限兩位）**已正確**；但**完全沒有 blur 處理**，故 `AC-D3`（失焦補零至兩位）與 `AC-D4`（空值 blur 不補為 `00`）無載體 → 已新增 `onEditionBlur()`。依 `AC-D7`（建立頁與編輯頁收斂為同一元件）同步補到 `14-document-create.html`。

#### A.4.4 需回報 lead 之項目（`AC-D#` 中找不到逐字定義者，見交付回報 ③）

見本輪 ui-ux-designer 交付回報第 ③ 節；本節僅備查，不在此重複。

---

### A.5 「編輯編號」動作（🔴 2026-08-16 人類閘門追加裁決 `OQ-D18-28`）— `19` 傳播紀錄

> 起因：本 agent 於 A.4 回報之爭議 C（F018 `AC-D3` 在 `19` 無 UI 載體）上人類閘門，裁決＝**新增「編輯編號」動作**（存量表單之 `formNumber` 全為 `null`，若僅能於上傳時設定則永遠補不上）。被否決之替代方案＝把編號欄加進覆蓋上傳彈窗。
> 權威＝F018 `AC-D16`～`AC-D20` ＋ 該檔末「待 ui-ux-designer（追加裁決）」之逐字文案對照表。**表中每一值皆逐字照抄，無偏差。**

| 決定 | 內容 | 理由 |
|---|---|---|
| **形式＝小 modal**（非列內 inline） | `id="editNumberModal"`，沿用本頁 `upModal`／`confirmModal` 之既有 modal 語彙 | ① `AC-D16` 只給**單一** DOM id `editNumberModal`（單數），inline 需每列一份或共用一份，modal 天然對應；② 介面必含 label＋輸入框＋`enNumberErr` 錯誤區＋強制說明句 `僅更新編號，不會變更表單檔案。`＋`儲存`／`取消`，塞進 `min-w-[980px]` 表格首欄會破壞列高與橫捲；③ 不新增互動語彙。 |
| **列內動作＝icon＋可見文字按鈕**<br>🔴 **可見文字／`aria-label` 已於 2026-08-20 第三輪改為逐字 `編輯`**（`AC-N48` ① 之明文例外）；下列為改名前之原始紀錄，保留供追溯 | 「操作」欄內 `<i data-lucide="hash">` ＋可見文字 `編輯編號`；`aria-label="編輯編號"`、`title="編輯編號"`、`data-edit-number="{formId}"` | 對照表寫「無障礙名稱／可見文字＝`編輯編號`」，兩種讀法都成立才安全；小型帶邊框文字按鈕沿用 `13` `linkCell` 之既有 `text-[11px]` 樣式。表格 `min-w` 880 → **980**。 |
| **無寫入權角色＝自 DOM 移除**（非 `.write-only` CSS 隱藏） | `canWrite()` 判斷後才輸出該按鈕；`setRole()` 內補 `renderTable()` 使切角色即時反映 | 🔴 **現行可執行斷言字面＝`queryByLabelText('編輯') === null`**（第三輪改名後）；📝 下列為改名前之原始紀錄、**不得用於斷言**：`AC-D17` 之驗證為 OLD> `queryByLabelText('編輯編號') === null`，而 Testing Library 的 `*ByLabelText` **找得到** `display:none` 的元素 ⇒ 沿用本頁既有 `.write-only`（CSS 隱藏）會使該斷言失敗。本頁其餘寫入動作維持 `.write-only` 不變。 |
| **modal 內顯示被編輯之表單名稱** | `id="enFormName"`，只回顯 `f.name` | 純資料回顯、非新增文案；不指明編輯對象時使用者無從確認選到哪一列。 |

驗證（jsdom 實跑，`19` 0 console error）：`AC-D16` 8 列各一動作＋`data-edit-number`、modal 逐字文案全數命中、`取消` 不變更；`AC-D17` 四種無寫入權角色 `queryByLabelText(...)` 皆為 0（📝 該次實跑所用之字面為當時的 OLD> `'編輯編號'`；**現行字面為 `'編輯'`**，見 §A.6.9）；`AC-D3`／`AC-D19` `null`→`FM-002`→清空→`—`＋`title` 往返成立；`AC-D18` `fm-001` 撞 `FM-001` 回重複訊息且該列不變、自身列同值不衝突、101 字元回超長訊息；`AC-D20` 對被 2 份文件引用之 `uf1` 編輯後 `confirmModal` 未開（覆蓋共用警示未觸發）。

`04-public-document-detail.html` 之使用表單清單於 A.4 已涵蓋（`進件申請書.xlsx`／`支票託收登記表.xlsx` 顯示 `此格式不支援浮水印`、`對保通知書.pdf` 顯示 `檢視/下載將燒錄浮水印`），本輪**核對後無需改動**。

---

---

### A.6 2026-08-20 D9 缺失／變更 delta（9 項）— prototype 傳播紀錄（🔴 人類閘門 `OQ-D9-01`～`OQ-D9-34` 已全數裁決）

> 權威＝`docs/specs/open-questions.md` §D9 ＋ 各 feature 之 `AC-N1`～`AC-N70` ＋ `docs/specs/architecture-spec.md` §11（決策 B1–B10）。
> **定稿值一律逐字照抄，未自行發明**——特別是浮水印色值 `#334155` @ `0.30`（`AC-N2` 表列值，本 agent 未做任何「看起來差不多」的替換）。

#### A.6.1 逐檔改動

| 檔案 | 改動（一句話） |
|---|---|
| `05-public-viewer-watermark.html` | 🔴 **改寫全檔**：`<canvas>` 自繪取代模擬 DOM 內容（`AC-N4`）、`.wm-layer` 疊加層整段移除（`AC-N7`）、浮水印改**畫進 canvas 像素**＝內容層（`AC-N6`）、縮放改為 `renderPage(page, zoom)` 重新渲染且 `#page` 全程無 `transform:scale()`（`AC-N8`／`AC-N9`）、新增**單頁翻頁**導覽、安全資訊帶就地改寫、字級上移一階、公司名稱改簡稱；🔒 下載／列印鈕與頁尾格式字幕保留（`AC-N5`／`AC-N67`）。 |
| `03-public-list.html` | 字級整體上移一階；清單卡「內容摘要」升為 `text-base`（`AC-N60`）；原 11px 任意字級收斂為 `text-sm`。 |
| `04-public-document-detail.html` | 字級整體上移一階；原 10px 任意字級收斂為 `text-sm`，附錄序號徽章圓形容器 `w-5 h-5` → `w-6 h-6`（否則 14px 數字溢出）。 |
| `00-design-system.html` | 浮水印示範改 `#334155` @ `0.30` ＋ 對比度說明；「檢視器疊加」之敘述改為「PDF 內容層燒錄（檢視器所見位元組亦由此產生）」；浮水印身分改簡稱；🔒 **字級 tokens 表逐字不動**，另在表**外**加註「前台／後台字級自此分歧」說明（`AC-N61` ②）。 |
| `13-document-list.html` | 最左新增「OJT」圖示欄（15 欄，`AC-N37`～`AC-N39`）＋ 每列檔案格新增 `data-wm-note`（`AC-N20`）＋ 下載 toast 改為「燒錄＋寫稽核」；表格 `min-w` 1560 → **1724**。 |
| `15-document-edit.html` | 三個附件區塊各加 `data-wm-note`；OJT「取代」鈕改用新的 `.ojt-write` class（主管／部門窗口／ICSOP 管理員可見）；🔒 其餘寫入控制項維持 `.write-only`（僅 ICSOP 管理員）；唯讀提示改為角色相依。 |
| `16-document-readonly.html` | 🔴 **本輪 OJT 破例之主入口**：OJT 列可上傳／覆蓋（`AC-N28`／`AC-N29`），其餘每列掛「唯讀」鎖頭徽章、欄位區加 19 欄唯讀明示（`AC-N24`／`AC-N25`）；唯讀提示改為角色相依（sysadmin 保留原句）；每列 `data-wm-note`；附錄下載 toast 由「不燒錄、不寫稽核」改為「燒錄＋寫稽核」。 |
| `17-access-history.html` | 類型篩選新增第四值「上傳」＋兩筆 `ATTACHMENT_UPLOAD` 示範列（`AC-N69`）；`ACT_STYLE` 新增逐字標籤「附件上傳」；浮水印快照區依 `hasWm(r)` 分支留空（`AC-N53`）；`wm()` 之公司欄改簡稱、🔒 表格「公司」欄仍全稱（`AC-N12` vs `AC-N13` ③）。 |
| `19-usage-form-management.html` | topbar「上傳表單」→「**新增表單**」導向 `19a`；列內動作（🔴 第三輪改名為逐字「**編輯**」）導向 `19b`；`upModal`／`editNumberModal` 整段移除；新增「制定部門」欄（8 欄，`AC-N47`）；每列 `data-wm-note`；下載 toast 改為「燒錄＋寫稽核」。 |
| 🆕 `19a-usage-form-create.html` | 新增使用表單獨立整頁（三區塊、動作鈕在 topbar、單一動作一次送出、編號驗證逐字沿用）。 |
| 🆕 `19b-usage-form-edit.html` | 編輯使用表單獨立整頁（範圍＝表單編號＋制定部門；檔案與名稱唯讀；說明句改為「僅更新表單資訊，不會變更表單檔案。」）。 |
| `22-lifecycle-tree-preview.html` | 🔒 疊加層**保留**（`AC-N66`）＋色值改 `#334155` @ `0.30` ＋ 公司名稱改簡稱。 |
| `23-change-history.html` | 同上。 |
| `24-appendix-management.html` | 每列 `data-wm-note`；下載 toast 由「不燒錄、不寫稽核」改為「燒錄＋寫稽核（`documentId` 為 `null`）」；檔頭「後台恆 RAW」宣告加刪除線並註明已被 `OQ-D9-08` 推翻。 |

#### A.6.2 🔴 本 agent 之裁量定案：**單頁翻頁 vs 連續捲動**（`architecture-spec` §11.2 明文交付本角色）

**裁定＝單頁翻頁（single-page paging），不做連續捲動之虛擬化渲染。**

| # | 理由 | 說明 |
|---|---|---|
| 1 | **`AC-N9` 需要確定性的渲染呼叫計數** | 該條斷言「渲染呼叫累計次數 ≥ 2、最後一次參數為 `z2`」。單頁模式下渲染次數與縮放操作 **1:1 對應**；連續捲動＋`IntersectionObserver` 之下，渲染次數取決於捲動位置與 observer 觸發時機，且 **jsdom 沒有 `IntersectionObserver`** ⇒ 該 AC 會退化為需要 shim 的脆弱測試。 |
| 2 | **記憶體上限（§11.2 之架構護欄）** | DPR=2、zoom=2 時 `outputScale=4`，單張 A4 canvas 緩衝區已達數千萬像素（RGBA 4 bytes/px）。「當前頁 ±1」的連續捲動等於同時持有 3 份。單頁模式**天然滿足**「不得對視窗可視範圍外的頁面觸發 `render()`」之護欄，不需額外機制。 |
| 3 | **與既有縮放區間相符** | `ZOOM_MIN 0.6` / `ZOOM_MAX 2` 是「單頁精讀」的區間，不是「快速翻閱全文」的區間；SOP 文件頁數為個位數～十位數（§5.2），翻頁成本低。 |
| 4 | **實作面最小相依** | 不需 `IntersectionObserver`、不需捲動位置還原、不需 canvas 池回收；`PDFDocumentProxy.destroy()` 之清理點單一。 |

⚠ **已明文記錄之取捨（非疏漏）**：使用者失去「連續往下捲讀」的手感。緩解＝頁碼輸入框可直接跳頁、上一頁／下一頁鈕、鍵盤 `←` `→` / `PageUp` `PageDown`。若日後回報翻頁成本過高，升級為連續捲動屬 **additive** 變更——`renderPage(page, zoom)` 之 seam 簽章不需改。

#### A.6.3 本 agent 之逐字文案定稿（spec 明文授權 designer 擬定者）

> `F016 AC-N28` 之 📝 明訂「改寫後之逐字文案由 ui-ux-designer 於 prototype 定稿後回寫本節」。以下三句為本 agent 定稿，**下游 test-generator 會逐字斷言**，已提為具名常數。

| 常數（落點 `16`／`15`） | 逐字值 |
|---|---|
| `RO_NOTICE_FULL`（**僅系統管理員**；`16`） | `唯讀模式 · 此角色對 ICSOP 文件全欄位皆唯讀；附件可下載（燒錄浮水印），但不可上傳/取代（FIELD_WRITE_FORBIDDEN）。` |
| `RO_NOTICE_OJT_EXCEPTION`（主管／部門窗口；`16`） | `唯讀模式 · 此角色對 ICSOP 文件其餘 19 個欄位、ICSOP PDF、使用表單與附錄皆唯讀（FIELD_WRITE_FORBIDDEN）；唯一例外為「OJT 實體簽到表」，可上傳或覆蓋，該次上傳會寫入稽核。全部附件皆可下載（下載一律燒錄浮水印並寫入稽核）。` |
| `FIELD_RO_NOTE`（`16` 欄位區） | `此區 19 個欄位對本角色一律唯讀（FIELD_WRITE_FORBIDDEN）；本頁唯一可寫項為下方附件區之「OJT 實體簽到表」。` |

**擬稿之三個要點（供覆核）**：
1. **前半沿用既有句型**（「唯讀模式 ·」＋ `FIELD_WRITE_FORBIDDEN`）維持語氣一致，並明示基底規則未變。
2. **明講「19 個欄位」與「另兩類附件＋附錄」**，使 `AC-N24`／`AC-N25` 的界線在畫面上可讀——只寫「除了 OJT 以外」容易被讀成「附件區都放行了」，那正是本輪要防的誤解。
3. **明講「該次上傳會寫入稽核」**——這是首次開放非管理角色之寫入路徑（`AC-N31`），使用者應被告知留痕。

🔒 **`RO_NOTICE_FULL` 對系統管理員逐字保留原句**（`AC-N26`：其對 OJT 仍唯讀 ⇒ 原句對該角色仍然為真）。這同時成為 `AC-N26` 在畫面上的載體，而非只存在於後端判定。

#### A.6.4 本 agent 之設計裁量（spec 未規範者；**尚未入任何 AC，下游若需鎖定請補 AC**）

| # | 裁量 | 落點 | 說明 |
|---|---|---|---|
| 1 | OJT 兩態圖示之**顏色**＝`text-emerald-600`（有）／`text-slate-300`（無） | `13` | `AC-N38` 明載「兩態之視覺區別（顏色／填色）屬設計裁量、不入 AC」。 |
| 2 | 可寫／唯讀之**視覺區分手法** | `16` | 可寫列＝`border-primary-300` ＋ `bg-primary-50/40` ＋ `data-writable-attachment` 徽章「可上傳／覆蓋」；唯讀列＝`data-readonly-attachment` 鎖頭徽章「唯讀」。徽章文字未入 AC。 |
| 3 | `data-wm-note` 之**擺放位置與樣式** | `13`／`15`／`16`／`19`／`24` | AC 只規定「每一列帶一個 `data-wm-note`、可見文字二擇一」。`13` 置於檔案鈕下方一行；`19`／`24` 置於名稱下方一行；`15`／`16` 為列內 pill。 |
| 4 | `05` 之**單頁翻頁控制項形狀** | `05` | 上一頁鈕／頁碼輸入框（`#pageInput`）／`/ 總頁數`／下一頁鈕，＋鍵盤 `←` `→` `PageUp` `PageDown`。 |
| 5 | `05` 之**窄螢幕自動 fit-to-width** | `05` | 首次渲染後依 `#stage` 可用寬度算初始倍率（夾在 `ZOOM_MIN`～`1`）；使用者一旦手動縮放即不再自動套用。**仍是依倍率重新渲染，非 CSS 縮放**。 |
| 6 | `19` 之新增入口**可見文字改為「新增表單」** | `19` | `AC-N41` 之 Given 逐字為「點擊『新增表單』」，且該動作已不只是上傳檔案（同時設定編號與制定部門）。原文「上傳表單」已不精確。 |
| 7 | `19a`／`19b` 之**檔名與路由對映** | 新檔 | 命名沿用 `17a-*` 之既有慣例；`19a` ↔ `/admin/usage-forms/new`、`19b` ↔ `/admin/usage-forms/:formId/edit`（`AC-N41` 明訂最終路徑由 system-architect 定）。 |
| 8 | `19b` 之**原型專用記錄切換器** | `19b` | `[data-prototype-demo="true"]`，供覆核者在單一檔案內看到「有編號／無編號／0 筆制定部門」三種狀態；實作以路由參數取得，**不得移植此控制項**。 |
| 9 | `13` 表格 `min-w` 1560 → **1724**、`19` 980 → **1420**、`24` 760 → **900** | `13`／`19`／`24` | 新欄與註記文字需要的寬度；三者皆已有 `overflow-x-auto` 可吸收（`AC-N37` 前提裁決明載此點）。 |
| 10 | `13` 有一列**刻意不帶 `ojt` 鍵** | `13` | `AC-N38` ③ 之 `undefined` 路徑唯一的示範載體（`ICSOP-SRC-103-1-01`）。篩選行為與 `false` 完全一致，統計卡與筆數不受影響。**勿「修正」為 `ojt:false`。** |
| 11 | `04` 附錄序號徽章容器 `w-5 h-5` → `w-6 h-6` | `04` | 字級上移後 14px 數字在 20px 圓內溢出；此為字級 delta 之必要版面連帶，非獨立改動。 |
| 12 | `05` `#stage` 由 `flex justify-center` 改為 block ＋ `#page { margin:0 auto }` | `05` | flex 置中在子元素寬於容器時會把左緣推成**負值**（實測 375px 下 `-192.5px`，內容被裁掉且捲不回去）。改法使空間不足時只往右溢出、左緣恆可達。 |

#### A.6.5 🔴 新提報之 OQ（交回 lead）

**`OQ-D9-35`（`AC-N69` 內部不一致：「恰為四個」 vs 逐字列出之五個字面值）**

- **問題**：`F024 AC-N69` 之末子句寫「**篩選控制項之選項恰為四個**，其可見文字由左至右／由上而下逐字為 `全部`／`文件`／`循環`／`變更`／`上傳`」——後半列出**五個**字面值。兩者不可能同時成立。
- **為何不能自行選一邊**：若採「恰為四個」而刪掉 `全部`，會直接牴觸同一條之 ③「類型＝`全部`（預設） ⇒ 兩筆皆回傳」與 `AC-N55` 之「查詢篩選組成…一律不變」回歸鎖定 ⇒ **該讀法無法實作**。
- **本輪採用之讀法（唯一自洽者，已落地於 `17`）**：控制項共 **5 個 `option`**＝既有預設項「全部類型」＋**四種類型值**（`文件`／`循環`／`變更`／`上傳`）；「第四種類型篩選值」指的是**類型值**的第四個，不是 option 總數。
- **請 lead 裁示**：建議把 `AC-N69` 之「恰為四個」就地改寫為「**類型值恰為四種；控制項連同既有之『全部類型』預設項共 5 個 option**」。若 lead 另有裁定，`17` 之改動範圍僅該 `<select>` 一處。

#### A.6.6 需回報 lead 之處置說明（非阻塞）

| # | 項目 | 處置 |
|---|---|---|
| 1 | **`15-document-edit.html` 不在 lead 指派清單，但 `AC-N20` 明文含「編輯頁」** | 已改（`data-wm-note` × 3）。並順帶修正其唯讀提示句與 OJT 取代鈕之角色可見性——否則同一 delta 下 `16` 說「OJT 可寫」、`15` 說「全欄位唯讀且不可取代」，兩頁自相矛盾。🔒 `15` 其餘寫入控制項一格未放行（已以斷言證明）。 |
| 2 | **`17-access-history.html` 不在 lead 指派清單，但 `AC-N69` 需要 UI 載體** | 已改（新增「上傳」類型值＋兩筆示範列＋標籤＋快照留空）。同時處理 `AC-N12` vs `AC-N13` ③ 之**刻意分歧**：浮水印快照用簡稱、表格「公司」欄用全稱。 |
| 3 | **`00-design-system.html` 之浮水印示範不在 `AC-N2` 表列** | 已一併改為 `#334155` @ `0.30`。理由：`00` 是設計系統的**文件**，留著 `#64748B` @ `0.12` 會使它與全部四個實際載體矛盾，且它本身不是行為載體、無回歸風險。若 lead 認為應維持不動，回退成本為 3 行。 |
| 4 | **`19b` 不再有容器 DOM id `editNumberModal`** | `AC-N48` ② 明訂「其 **modal 形式**部分由本頁取代」；一個整頁不應保留名為 `...Modal` 的容器 id。欄位層 id（`enNumber`／`enNumberErr`／`enFormName`）**逐字保留**。若 test-generator 仍依 `AC-D16` 斷言容器 id，請以 `AC-N48` ② 為準。 |
| 5 | ✅ **已於 2026-08-20 第三輪由 lead 裁決**：列內動作之可見文字與無障礙名稱改為逐字 **`編輯`** | 原提報＝標籤停在「編輯編號」名不副實（導向之頁面叫「編輯使用表單」且範圍已含制定部門）。lead 裁決改名並就地修訂 `AC-N48` ①，列為「逐字沿用」原則之**明文例外**；原值 `編輯編號` 保留供追溯。🔒 其餘逐字文案（兩則錯誤訊息、`enNumber`／`enNumberErr`／`enFormName`、`data-edit-number`、icon 鍵 `hash`）**一格未動**，已逐條斷言回歸。 |
| 6 | **`16` 之 OJT 上傳入口對 ICSOPAdmin 亦顯示** | `F026` 矩陣中 `OJT 簽到表 × ICSOPAdmin` 本即「可寫」。若只對主管／部門窗口顯示，會出現「權限較大的角色看到較少控制項」之視覺矛盾。上傳成功 toast 已如實區分**寫稽核（主管／窗口）vs 不寫稽核（ICSOPAdmin）**，正是 `AC-N31`／`AC-N32` 之不對稱在原型上的可操作載體。 |
| 7 | **`13`／`19`／`24` 之下載 toast 文案** | 由「不燒錄、不寫稽核」改寫為「燒錄＋寫稽核」。這些 toast 未入任何 AC，但保留原文即為畫面與行為矛盾（`AC-N14`～`AC-N18`）。 |

#### A.6.8 🔴 第三輪修正（2026-08-20，lead 覆核後）

| # | 項目 | 處置 |
|---|---|---|
| 1 | **`19` 列內動作改名為逐字 `編輯`**（`AC-N48` ① 第三輪修訂） | 可見文字＋`aria-label`＋`title` 三處同時改；🔒 `data-edit-number`、icon 鍵 `hash`、兩則錯誤訊息、`enNumber`／`enNumberErr`／`enFormName` **一格未動**（已逐條斷言）。`AC-D17` 之斷言字面隨之改為 `queryByLabelText('編輯') === null`。 |
| 2 | 🔴 **撤回我先前建議的 `offsetParent === null` 斷言形狀** | 本輪約束環為 backend jest ＋ frontend **vitest（jsdom）**，而 **jsdom 不做版面計算 ⇒ `offsetParent` 對所有元素恆為 `null`** ⇒ 該斷言**恆真、毫無鑑別力（假綠）**，且正好掛在我自己標為最高風險的「開一個洞、鬆一片牆」上。改採 **class 指派互斥 ＋ `data-*` 掛鉤**（`AC-N25` 第三輪擴充／`AC-N76`）。**教訓：提供斷言形狀時必須先確認該形狀在目標 runner 下具鑑別力**——版面相關斷言（`offsetParent`／`toBeVisible`／`getBoundingClientRect`）在 jsdom 下一律不可用。 |
| 3 | **`15` 之兩則唯讀提示常數同步為 `AC-N74` 之共用值**（`AC-N76` ③） | 第三輪前 `15` 與 `16` 各有自己的措辭（`15` 的 `RO_NOTICE_FULL` 是該頁原句、`RO_NOTICE_OJT_EXCEPTION` 另列舉「ICSOP 原始檔 .xls」）。`AC-N76` ③ 明訂**兩頁共用同一組常數、不得各自重打** ⇒ 已改為與 `16` 逐字相同，原句保留於 `15` script 區註解供追溯。<br>⚠ **一項連帶已知落差（回報 lead，非阻塞）**：共用句未列舉「ICSOP 原始檔 .xls」，故 `15` 的橫幅不再明講該檔案唯讀；其寫入入口仍由 `.write-only` 擋住（`AC-N25` ②），使用者不會被誤導為可寫。若要在文案中補回該項，須改的是 `AC-N74` 的共用字串，**`16` 會一起變**。 |
| 4 | **prototype 檔數計數更正 25／27 → 28** | `17a`（2026-08-18 加入）當時未更新 §4 計數；本輪連同 `19a`／`19b` 一併校正為 `00`–`24`（25）＋`17a`＋`19a`＋`19b`＝**28**。 |

**第三輪之 DOM 現況判定（未改動、已量測確認滿足）**：`16` 之 `AC-N74`／`AC-N75` 全數通過（`data-attachment-kind` 四值、`data-writable-attachment` 恰 1 且其列 kind＝`ojt`、`data-readonly-attachment` 6 個、徽章與 `aria-label` 逐字、`#attachTitle`／`#attachNote` 兩態逐字）；`15` 之 `AC-N25` ①②③ 與 `AC-N76` ①② 亦全數通過（`.write-only` ∩ `.ojt-write` ＝ ∅、`[data-ojt-upload]` 恰 1）。**故第 2 項僅需換掉斷言形狀，DOM 本身無需補掛鉤。**

📌 **一項留給 spec-writer 判斷者**：`AC-N25` ② 逐字點名「ICSOP PDF 取代鈕」與「`.xls` 上傳鈕」，但這兩顆按鈕**沒有專屬 `data-*` 掛鉤**（僅能以可存取名稱定位，`.xls` 那顆的可見文字為「上傳新版 .xls（取代）」）。集合式的 ③（交集為空）已足以攔截「順手統一 class」之失誤，**故本輪未自行新增未經授權之掛鉤**。若 test-generator 需要**逐元素**斷言 ②，建議由 spec-writer 於 `AC-N76` 授權 `data-attachment-write="icsop_pdf|xls|ojt"`，我再補上——**不先斬後奏，正是為了避免第三輪要處理的「載體存在卻無 AC 授權」之反面問題。**

#### A.6.9 🔴 第四輪修正（2026-08-21，lead 覆核後）——註解裡的斷言字面也會假綠

> **起因**：第三輪我回報「檔頭與內部註解之追溯記錄同步」，但 `19-usage-form-management.html` **三處只同步了一處**（第 341 行改了，第 23／36 行仍為舊字面）。lead 逐行對磁碟驗出。**我的回報與磁碟不符，這是本輪最該記取的一點。**

**為何是假綠而非筆誤**：`AC-D17` 約束的是「無寫入權角色時該動作**自 DOM 移除**」。按鈕的無障礙名稱現在是 `編輯`，所以 `queryByLabelText('編輯編號')` **對任何角色都回 `null`**——有寫入權時回 null、被錯誤地以 CSS 隱藏時也回 null、正確移除時還是 null。**斷言恆真、零鑑別力**，而它守的正是「無寫入權角色不得看到寫入入口」。這與第三輪撤回的 `offsetParent` **是同一型，只是換了入口**：前者的恆真來自 runner 不做版面計算，後者的恆真來自**選擇器指向一個已不存在的名稱**。

**🔴 通則（本 repo）**：prototype 的**註解**在此 repo 會被 test-generator 當成建構約束的線索 ⇒ **註解裡的斷言字面與程式碼同等重要**，改名時必須全檔掃過，不能只改「看起來像程式碼的那一處」。

**已採用之一眼可辨標記法**（`19`／`19b` 與本檔一致）：

| 標記 | 用途 |
|---|---|
| ✅ **現行可執行斷言字面** | 唯一可以照抄進測試的值；**不帶 `OLD>`** |
| 📝 已作廢（僅供追溯，⚠ **不得用於斷言**）＋ `OLD>` 前綴 | 歷史值，保留以便追溯裁決，但明文禁止照抄 |

📌 **`OLD>` 為本 repo 既有慣例**（既有出處＝`backend/src/appendices/appendices.service.spec.ts` 等之註解「原斷言（供追溯）：OLD> …」），第五輪起一併套用於 prototype 註解 ⇒ **`grep -rn "OLD>"` 即可列出全部「不可照抄」之值**，不需逐處判讀語意。

**第四輪逐處修正**：`19` 第 23 行、第 36 行（兩處假綠斷言字面）、第 339 行與第 414 行（以舊標籤稱呼現行控制項）、第 14 行與第 28 行（歷史／現行敘述之標籤釐清）；`19b` 第 16 行（標明「逐字沿用」之明文例外）；本檔 §A.5 之兩處（斷言字面與實跑紀錄）。

**第四輪另補之驗證形狀（已實跑）**：不再只斷言「現況為真」，而是**注入失誤形狀、證明斷言會轉紅**——
① 把 `.xls` 上傳鈕的 `.write-only` 移除 ⇒ 集合式 ③ **仍為 0（綠）**、逐元素 ④ **轉紅** ⇒ 證明兩層並列確有必要（即 lead 補充之那一層）；
② `AC-D17` 之現行字面（`queryByLabelText('編輯')`）在**有寫入權時命中 8 個、無寫入權時 0 個** ⇒ 證明改名後之字面**非恆真**；而舊字面 `queryByLabelText('編輯編號')` 在**兩種角色下皆為 0**，這正是假綠的定義。
📌 **通則**：交出斷言形狀時，附一個「**注入該失誤 ⇒ 斷言轉紅**」的證明，比任何文字描述都有效——第三輪的 `offsetParent` 與第四輪的舊標籤字面，若當初做過這個注入測試，兩次都會當場現形。

**lead 之兩項裁示（已記錄）**：
① **共用唯讀句不補列「ICSOP 原始檔 .xls」** — 維持 `AC-N74` 單一共用字串。理由：該檔寫入入口已由 `.write-only` 擋住（`AC-N25` ② 已斷言），且為 `15` 特有的一個控制項去改動 `16` 也在用的共用句，會犧牲 `AC-N76` ③ 才剛修好的「兩頁共用同一組常數」性質。**不改。**
② **`data-attachment-write` 掛鉤＝授權新增** ⇒ ✅ **已落地**：第四輪處理時發現 spec-writer 之 `AC-N76` ④ 授權**已寫入磁碟**（含逐字對照表與三條逐元素斷言），內容完整且無裁量空間，故一併實作，未再多耗一次往返。三顆按鈕之值逐字為 `xls`（`.xls` 上傳鈕，`write-only`）／`icsop_pdf`（ICSOP PDF 取代鈕，`write-only`）／`ojt`（OJT 取代鈕，`ojt-write`，與 `data-ojt-upload` 同一元素）。<br>⚠ **`AC-N76` ④ 當時尚未 commit**（僅在工作目錄）——若 lead 原本預期不同的落地順序，請告知，回退成本為 3 個屬性。<br>🔴 **lead 補充之關鍵一層（我原分析漏掉）**：集合式斷言 ③（`.write-only.ojt-write` 交集為空）擋得住「順手把兩條 class 統一」，但**擋不住「有人直接把 `.xls` 上傳鈕的 `.write-only` 整個刪掉」**——那種情況下交集仍為空、③ 照樣綠，**只有逐元素斷言 ② 抓得到**。⇒ **「集合式斷言涵蓋逐元素斷言」是錯的**：集合式只能證明兩集合不相交，證明不了每個元素都落在應在的那一集合裡。

#### A.6.7 需要但**不在任何 AC** 之新增物（供 spec-writer 決定是否補 AC）

`05`：`data-pdf-canvas`／`data-viewer-page`／`#pageInput`／`#prevBtn`／`#nextBtn`／`#pageTotal`／`#securityBand`／`window.__pdfRenderCalls`（渲染 seam 之可觀測紀錄）／安全資訊帶之改寫全文。
`13`：OJT 欄之 `min-w-[56px]`、檔案欄 `min-w-[160px]`、表格 `min-w-[1724px]`。
`16`：`data-attachment-kind`（`icsop_pdf`／`ojt`／`usageform`／`appendix`）／`data-writable-attachment`／`data-readonly-attachment`／`data-ojt-upload`／`data-field-readonly-note`／`#attachTitle`／`#attachNote`；徽章文字「可上傳／覆蓋」「唯讀」；上傳鈕之 `aria-label`「上傳／取代 OJT 實體簽到表」。
`15`：`.ojt-write` class／`data-ojt-upload`／`data-ojt-exception` 徽章「主管／部門窗口亦可寫」。
`19`：`data-create-usage-form`／新增鈕可見文字「新增表單」。
`19a`／`19b`：三個區塊之序號徽章 1/2/3、`data-drafting-dept-chip`／`data-drafting-dept-empty`／空狀態文字「（未指定，0 筆為合法）」、`#demoForm` 記錄切換器、`19b` 之 `data-file-readonly` 徽章與「需要換檔請回使用表單管理…」引導句。
`17`：`data-wm-snapshot`／快照留空時之文字「（此動作類型無浮水印，該欄留空）」／`ATTACHMENT_UPLOAD` 之徽章色 `violet`。
`00`：前後台字級分歧之註記橫幅全文。
