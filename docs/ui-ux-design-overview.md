---
title: ICSOP 文件管理平台 — UI/UX 設計總覽
project: ICSOP Document Management Platform
version: 1.1 (Phase 0 — 設計總覽；2026-08-06 併入 E10 附錄管理)
date: 2026-08-06
author: UI/UX Designer (Claude)
status: Draft — 待使用者確認後始進入 prototype 產出
covers: F001–F039 (E01–E10)
---

# ICSOP 文件管理平台 — UI/UX 設計總覽

> 本文件為 **Phase 0 設計總覽（單一真實來源）**，於任何 prototype HTML 產出前先行定案。
> 本輪**僅**產出本檔；`/prototypes/*.html` 與 `/design/*` 於使用者確認本總覽後之下一輪才建立。
>
> **v1.1（2026-08-06）併入 E10 附錄管理（F039）**：新增 Phase H 與 `24-appendix-management.html`（合計 25 檔）；附錄傳播至 `14`／`15`（可搜尋多選＋**上移／下移**有序清單，見 §6.17）、`16`／`04`（依 `sortOrder` 呈現＋「無附錄」空狀態）、`18`（功能列「附錄管理」＋欄位列「附錄（多）」，欄位數 19→**20**）、`07`（sidebar ＋儀表板卡）、`02`（角色職掌文案）；後台側選單「附錄管理」已同步至**全部 16 個內嵌 `const MENU` 之 prototype**（§9 驗證項 8）。OQ-E10-01 之 UI 裁定見 §附錄 A.1。

---

## 1. Context（背景與目的）

### 1.1 專案背景
公司現行 ICSOP（Instruction / Control / Standard Operating Procedure）文件管理分散、缺乏統一瀏覽入口、身分追溯與流程結構化。本平台建立單一系統：讓一般同仁以 **RWD 前台**瀏覽/搜尋/下載/列印文件（含身分浮水印與稽核追蹤），並讓管理者以「循環（Life Cycle）DAG」結構維護文件、帳號、權限與組織同步。

### 1.2 已完成之上游交付（本設計之輸入）
| 交付物 | 位置 | 狀態 |
|--------|------|------|
| Spec 索引 | `docs/specs/spec-index.md` | Draft v1.0 |
| 產品總覽 / 使用者故事總覽 | `docs/specs/overview.md`、`docs/stories/overview.md` | Draft |
| 39 份 Feature 規格 | `docs/specs/features/F001–F039-*.md` | Draft（`F039` 附錄管理為 2026-08-06 新增） |
| 資料模型（20 欄位權威定義；含 F039 新增之「附錄」） | `docs/specs/data-model.md` | Draft |
| 非功能需求（RWD 斷點、浮水印格式） | `docs/specs/nfr.md` | Draft |
| 錯誤處理（錯誤碼 ↔ 訊息契約） | `docs/specs/error-handling.md` | Draft |
| 系統架構（路由/RBAC/浮水印管線） | `docs/specs/architecture-spec.md` | Draft |
| 流程圖 | `docs/specs/diagrams/*.mmd` | Draft |

### 1.3 本設計目的
1. 將 39 個 feature 的互動需求轉為**可於瀏覽器直接預覽**的高擬真互動原型。
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
| 浮水印 | `slate-500` @ opacity 0.12，對角 45° 平鋪 | F020（已定案，色彩中性不受品牌換色影響） |

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
├── 05-public-viewer-watermark.html# F020 檢視器浮水印疊加 + 下載/列印燒錄流程 + F021 手機檢視器
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
├── 19-usage-form-management.html # F018 使用表單池管理（上傳/查詢/關聯文件數/移除保護）— 補漏新增
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

合計 **25 個 prototype 檔（00–24）**。

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
| `10-lifecycle-list.html` | F007（US-020） | 循環清單（名稱/狀態/節點數/最後更新）、新增/編輯（名稱必填 `LIFECYCLE_NAME_REQUIRED`）、停用切換、**刪除保護**（有文件掛載→`LIFECYCLE_HAS_DOCUMENTS` 僅允停用）、進入畫布連結 |
| `11-dag-canvas.html` | F008（US-021/022） | **上到下 DAG 畫布**：節點卡（可拖曳、持久化座標）、箭頭有向邊（parent→child）、新增/刪除節點（刪除→連動移除邊+已掛文件二次確認）、拖曳連線、**防環**：即時提示 + 送出後 `DAG_CYCLE_DETECTED`/`DAG_SELF_LOOP` toast、多 parent/多 child 呈現、mini-map/縮放、平板/手機降級提示 |
| `12-node-drawer.html` | F009（US-023/024） | 點節點 → **右側 drawer**：節點名稱編輯（即時更新畫布）、目前掛載文件清單、候選清單（**僅本循環**過濾）、選未掛載→直接掛載、選**已掛他節點**→警示（附原節點名）+ `NODE_DOC_ALREADY_ASSIGNED` 二次確認改派、**空候選空狀態**、未確認即存擋下、關閉送出 |

### Phase E — ICSOP 文件管理
| 檔案 | 涵蓋 Feature / Story | 關鍵 UI 元素 |
|------|----------------------|--------------|
| `13-document-list.html` | F017（US-037） | **14 欄清單**（制定公司/制定部門/制定室別/當責室長/狀態/檔案/樹狀圖圖示/程序書編號/程序書書名/版次/內容摘要/連結點程序書/公告日期/循環別）、**頂部 3 統計卡**（程序書數量/已公告/進度中）、**9 個可搜尋下拉篩選**（循環別/狀態/程序書編號/程序書書名/制定部門/制定室別/當責室長/制定公司/連結點程序書）、**樹狀圖圖示**點擊開所屬節點循環預覽、**狀態衍生**（已公告/進度中/失效/作廢徽章）、**未指派節點警示圖示**、依編號/公告日期排序、查無結果空狀態、（後台**不**套用部門置頂） |
| `14-document-create.html` | F010（US-030）、F013、F014、F016 | 必填表單（編號/名稱/制定公司/制定部門/制定室別/主要室長/使用部門/版次/內容摘要/公告日期/所屬循環）、UUID 唯讀、預設狀態「有效」、**編號唯一性即時驗證** `DOCUMENT_NUMBER_DUPLICATE`、**制定三級聯動**（選室別帶入部門/公司）、當責次要室長多選、使用部門多選（組織階層下拉、排除離職）、附件上傳（ICSOP PDF 1 / OJT 1）、`所屬節點=未指派` 提示、**使用表單**可搜尋多選、**附錄**可搜尋多選＋**有序已選清單（上移／下移，無拖曳）**（F039；新選取者加末位、送出時依畫面順序寫入 `sortOrder` 1..N） |
| `15-document-edit.html` | F011（US-031）、F012、F014、F015、F016、F018、F026、F039 | **附錄 section**（自附錄池可搜尋多選；已選清單為**有序清單＋上移／下移**、首筆停用上移／末筆停用下移、無拖曳；解除其中一筆後其餘相對順序不變並重編為連續 1..N；「已變更」pill 併入變更計數；唯讀角色僅見順序、控制項隱藏）、**目前值 / 新值 並列對照**（變更欄位 diff highlight）、覆蓋儲存（UUID 不變）、**狀態切換**（有效/失效/作廢，作廢二次確認）、**所屬節點唯讀 + 跳畫布**、連結點增刪、附件覆蓋、**使用表單管理面板**（多檔上傳/移除二次確認、格式 `FILE_FORMAT_NOT_ALLOWED`）、依 F026 欄位唯讀、取消不污染原值 |
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

---

## 7. Feature → 檔案對照表（可追溯 F001–F039）

| Feature | 名稱 | 主要檔案 | 次要出現 |
|---------|------|----------|----------|
| F001 | 雙軌登入與 Session | `01-login.html` | `07`（逾時提示）、`05`（未登入攔截） |
| F002 | 角色分流導向 | `02-role-landing.html` | `07`（後台選單裁切） |
| F003 | 帳號與角色指派 | `08-account-management.html` | `07`（sidebar 帳號管理） |
| F004 | 組織資料同步 | `09-org-sync-management.html` | `07`（sidebar 組織異動管理） |
| F005 | 離職自動停用 | `08-account-management.html` | `09`（同步歷史離職筆數） |
| F006 | 組織異動提示與後台 | `09-org-sync-management.html` | `15`（當責欄位旁提示標記） |
| F007 | 循環池 CRUD | `10-lifecycle-list.html` | `11`（畫布入口） |
| F008 | DAG 節點與連線防環 | `11-dag-canvas.html` | `10`（進入畫布）、`12`（畫布底層） |
| F009 | 節點抽屜維護與過濾警示 | `12-node-drawer.html` | `11`（點節點開抽屜）、`15`（所屬節點跳轉） |
| F010 | 建立 ICSOP 文件 | `14-document-create.html` | `13`（建立入口） |
| F011 | 編輯文件與版本對照 | `15-document-edit.html` | `13`（編輯入口） |
| F012 | 文件狀態切換 | `15-document-edit.html` | `13`（清單狀態徽章）、`03`（前台反映） |
| F013 | 文件編號唯一性 | `14-document-create.html` | `15`（編輯排除自身） |
| F014 | 制定組織與當責室長設定 | `14`、`15` | `09`（異動提示跳入） |
| F015 | 文件連結點管理 | `15-document-edit.html` | `04`（前台詳情顯示連結點） |
| F016 | PDF 與 OJT 附件上傳 | `14`、`15` | `05`（浮水印來源檔） |
| F017 | 後台文件清單與搜尋 | `13-document-list.html` | `07`（sidebar 文件管理） |
| F018 | 使用表單管理 | `19-usage-form-management.html`（表單池） | `15`/`14`（文件關聯選取）、`04`（前台下載）、`07`（sidebar） |
| F019 | 前台清單瀏覽 | `03-public-list.html` | `04`（詳情）、`06`（RWD） |
| F020 | 文件浮水印（疊加+燒錄） | `05-public-viewer-watermark.html` | `04`（下載/列印入口）、`17`（浮水印快照） |
| F021 | RWD 響應式版面 | `06-rwd-showcase.html` | `03`、`04`、`05`（三斷點落實） |
| F022 | 後台開啟前台瀏覽頁 | `07-admin-shell.html`（開新視窗入口） | `03`（被開啟目標頁） |
| F023 | 稽核軌跡記錄 | `17-access-history.html` | `05`（VIEW/DOWNLOAD/PRINT 觸發）、`04`（表單下載觸發） |
| F024 | 調閱歷程查詢後台 | `17-access-history.html` | `07`（sidebar 調閱歷程） |
| F025 | 角色×功能矩陣 | `18-permission-matrix.html` | `07`（選單裁切）、各後台頁角色模擬器 |
| F026 | 角色×欄位矩陣 | `18-permission-matrix.html` | `15`（欄位唯讀）、`16`（唯讀檢視） |
| F027 | .xls 原件保存與呈現用 PDF 產出 | `14`／`15`（.xls 上傳、PDF 標「由 .xls 產出」） | `21`（.xls 原件有無、觸發重抽） |
| F028 | .xls 模板感知抽取與清洗 | `21-document-index-management.html`（提取結果預覽、已清洗示意） | `14`/`15`（.xls 上傳觸發） |
| F029 | 章/節 chunking + metadata 索引 | `21-document-index-management.html`（chunk 依章/節 + 8 項 metadata） | `20`（引用章/節即 chunk 來源） |
| F030 | 改版重抽與重建索引 | `21-document-index-management.html`（重新索引 建置中→成功/失敗） | `15`（換 .xls/狀態切換觸發） |
| F031 | 管理端提取預覽與索引狀態 | `21-document-index-management.html`（總覽卡 + 三態 + 失敗詳情） | `07`（sidebar 文件索引管理） |
| F032 | 前台自然語言問答與引用 | `20-public-qa.html` | `04`/`05`（引用跳轉詳情/檢視器） |
| F033 | 權限感知檢索（已公告＋使用部門） | `20-public-qa.html`（權限提示、無權→查無依據） | `21`（chunk metadata 為過濾依據） |
| F034 | 問答稽核與 AI 導引浮水印 | `20-public-qa.html`（QA_LOG、source=AI_QA 提示） | `05`（經引用檢視/下載仍套浮水印）、`17`（稽核查詢） |
| F035 | 防幻覺護欄與無結果處理 | `20-public-qa.html`（拒答/低信心/必附引用） | — |
| F036 | 循環樹狀圖預覽（唯讀＋浮水印） | `22-lifecycle-tree-preview.html`（viewer + 45° 浮水印 + 循環切換 + 直角箭頭 + 點節點標示所有下游） | `10`（狀態欄樹狀圖圖示開啟）、`13`（文件清單樹狀圖圖示，帶入所屬循環）、`11`（DAG 編輯對照）、`05`（浮水印手法） |
| F037 | ICSOP 程序書變更歷程 | `23-change-history.html`（**獨立功能**；ICSOP 程序書 tab：欄位 before/after diff） | `15`（編輯/狀態/組織變更來源）、`07`（sidebar 獨立項「文件變更歷程」） |
| F038 | 循環樹狀圖變更歷程 | `23-change-history.html`（**獨立功能**；循環樹狀圖 tab：新舊 DAG 並列預覽 + 下載燒錄浮水印） | `11`/`12`（DAG 結構變更來源）、`22`（viewer 手法）、`05`（浮水印燒錄） |
| F039 | 附錄管理（附錄池 + 文件內排序） | `24-appendix-management.html`（附錄池：多檔上傳／覆蓋警示／移除保護／關聯文件展開） | `14`／`15`（文件關聯選取 + **上移／下移排序**，§6.17）、`16`（後台唯讀詳情依 `sortOrder` 列出）、`04`（前台詳情「附錄」section + 欄位摘要列 + 下載寫稽核）、`18`（功能列「附錄管理」＋欄位列「附錄（多）」）、`07`（sidebar + 儀表板卡）、`02`（ICSOP 管理員/主管之後台職掌說明） |

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
| 全套 Feature | `docs/specs/features/F001–F039-*.md` | 各畫面 Main Flow / AC / Error Scenarios |
| 資料模型 | `docs/specs/data-model.md#document-entity`、`#appendix-entity`、`#doc-appendix` | **20 欄位權威定義**、狀態集合、關聯表、`APPENDIX_POOL`／`DOC_APPENDIX(sortOrder)` |
| NFR | `docs/specs/nfr.md#browser-rwd`、`#watermark` | RWD 三斷點/觸控、浮水印格式與防竄改 |
| 錯誤處理 | `docs/specs/error-handling.md` | **錯誤碼 ↔ zh-TW 使用者訊息契約**（表單/toast 文案來源） |
| 架構 | `docs/specs/architecture-spec.md` §2/§3/§5.2/§5.3 | 前後台單一 SPA、RBAC guard、浮水印代理串流、Session 逾時、路由分流 |
| 附錄（E10） | `docs/specs/features/F039-appendix-management.md`（34 條 AC ＋端點契約）、`docs/stories/epics/E10-appendix/US-100/101/102` | 附錄池 CRUD、多檔上傳、覆蓋／移除門檻、文件內 `sortOrder` 與上移／下移互動、下載稽核 |
| 附錄架構裁定 | `docs/specs/architecture-spec.md` §3.6 決策二／決策五、§4.9 | 排序權威寫入路徑（建立/編輯頁一律 `PUT` replace-set）、新頁與選單插入位置、`MultiSearchCombobox` 之選填 `orderable`（首項停用上移、末項停用下移、無拖曳） |
| 流程圖 | `docs/specs/diagrams/F008-*.mmd、F009-*.mmd、F019-*.mmd、F020-*.mmd、document-status-lifecycle.mmd` | 防環、節點改派、排序管線、浮水印稽核、狀態機 |

---

## 9. 驗證方式（Validation Method）

prototype 產出後，逐檔以下列方式驗證：

1. **瀏覽器開啟測試** — 每個 HTML 於 Chrome/Edge 獨立開啟，無 build step、0 console error；以本機 static server（Node `http.createServer`）服務 `prototypes/` 目錄（`file://` 會被瀏覽器自動化拒絕）。
2. **Feature 覆蓋檢查** — 對照 §7 對照表，逐 F001–F039 確認主要檔案已呈現其 Main Flow 與關鍵 AC；未指派節點、防環、改派警示、部門置頂等定案行為須可實際觸發演示。
3. **互動狀態驗證** — 以 `claude-in-chrome` + `javascript_tool` 直呼頁面函式斷言狀態：角色模擬器切換（5 角色選單/欄位變化）、DAG 增刪節點/連線/防環 toast、drawer 三態（正常掛載/已掛他節點警示/空候選）、同步進行中→完成、diff 對照、分頁/篩選/搜尋、空狀態。
4. **RWD 斷點驗證** — `06` 及前台各頁於 360 / 375 / 768 / 1024 / 1440 寬度檢查：手機無水平捲動、清單改單欄卡片、觸控目標 ≥44px、篩選 sheet、檢視器可縮放且浮水印清晰。
5. **文案校對** — 全 zh-TW；錯誤/確認/空狀態文案與 `error-handling.md` 契約一致；無簡體、無殘留佔位字。
6. **色彩/對比驗證** — 依 §3 token 落實；正文對比 ≥4.5:1、UI/大字 ≥3:1（WCAG 2.1 AA）；狀態/角色徽章色相區隔可辨。
7. **RBAC 一致性驗證** — 後台選單裁切與欄位唯讀符合 §7.1 與 F025/F026 矩陣；無權限角色顯示封鎖/403 說明，前端隱藏不作為唯一防線（僅視覺呈現）。
8. **選單一致性驗證（E10 新增）** — 以 `grep -l "const MENU" prototypes/*.html` 列出全部內嵌選單之檔案，逐檔確認「附錄管理」項存在且緊接於「使用表單管理」之後；同一 shell 在任一頁之選單項目必須完全相同（漏改任一檔即為缺陷）。
9. **附錄排序驗證（E10 新增）** — `14`/`15`：依序勾選 3 筆 → 序號 1/2/3；新勾選者落末位；對末筆連按兩次「上移」→ 順序變為 C、A、B；首筆「上移」與末筆「下移」為 `disabled` 且順序不變；DOM 內 `[draggable]` 與 drag 事件數皆為 **0**；解除中間一筆後其餘相對順序不變並重編 1..N。`16`/`04`：所列順序與 `15` 排定者逐筆一致；`04` 之欄位摘要「附錄」列與下方 section 筆數同步；清空後兩處皆顯示「無附錄」。

---

## 附錄 A：對 Spec 之待釐清事項（供使用者確認）

本設計於閱讀 spec 時發現下列需釐清處，**多數已提供設計預設值以不阻塞原型產出**，惟以下建議確認：

1. **浮水印視覺樣式與時間格式（OQ-NFR007a / OQ-NFR007b）— 已確認 ✅** — 使用者採納：對角 45°、平鋪重複、opacity 0.12、字級 14px、`slate-500`；時間 `YYYY-MM-DD HH:mm:ss (UTC+8)`。稽核快照字串（F023）依此一致。
2. **DeptContact（部門窗口）後台內容極少** — 依 F025 其後台僅「ICSOP 文件管理唯讀」一項。請確認是否仍於分流頁（F002）提供「後台」選項，或部門窗口實務上等同一般前台使用者。設計預設：保留後台選項，但只顯示唯讀文件檢視（沿用 `16`）。
3. **「系統參數設定」無對應 feature 規格** — F025 列 SysAdmin 對「系統參數設定」為 CRUD，但 F001–F039 無此功能之細部 spec。設計預設：`07` sidebar 顯示此項但本輪**不產出**其內部畫面（標示為未來項），待補 feature 後再設計。
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

---

*本總覽為 Phase 0 交付。經使用者確認後，將依 §4 檔案結構與 §5 執行順序，逐階段產出 `prototypes/` 下 25 個 self-contained HTML 原型（含 Phase G AI 智慧問答 RAG：`20`/`21`，循環樹狀圖預覽 `22`／文件變更歷程 `23`，以及 Phase H 附錄管理 `24`）。*
