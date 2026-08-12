# Prototype ↔ Frontend Alignment — Gap Inventory

> **Provenance**: produced 2026-07-24 by a 4-way UI audit (one auditor per page-group) comparing every implemented React page against its authoritative `prototypes/*.html`, cell-by-cell / label-by-label / behavior-by-behavior. Read-only audit — no code changed.
>
> **Prototype is authoritative** for visual/structural/copy. A difference is a **gap** unless there is concrete evidence it was an intentional decision (marked `possibly-intentional`).
>
> **Totals: 118 gaps** — High **7** / Med **37** / Low **74** — plus 2 systemic patterns. (HIGH = G-PUB-020, G-LC-022, G-DOC-001, G-DOC-201, G-DOC-202, G-ADM-001, G-ADM-027.) Breakdown by group: Public/Shell/Auth 24 · Lifecycle/History 32 · Documents 28 · Admin-data 34.

## How to read a gap record
`ID · SEVERITY · category · flag — region — what the prototype specifies vs. what the impl does. → route`

- **flag**: `bug` (clear drift, just fix) · `possibly-intentional` (product-analyst must rule: real decision vs. drift) · `needs-backend-data` (correct render needs data the API doesn't return — system-architect) · `needs-arch` (structural change).
- **route**: which teammate must weigh in before/while fixing.

---

## Systemic patterns (apply across all pages — decide once)

- **SYS-1 — toast → inline notice.** Every prototype uses a top-right `toast()` for transient feedback (create/disable/assign/sync/resolve/upload/reindex). All React pages render an inline `notice` banner instead. Consistent app-wide. `possibly-intentional` — **product-analyst + FE lead**: is the inline-notice the accepted SPA pattern (prototypes are the deviation), or should a toast system be added? One ruling covers all pages.
- **SYS-2 — block-overlay → in-content card.** Prototypes gate no-permission with a fixed `#blockOverlay` (shell stays visible) + per-role `blockMsg`. React returns an in-content card. Structurally fine for the SPA (AppShell owns the shell), but drives two real sub-gaps: wrong icon (`alert-circle` vs `lock`) on several pages, and the per-role reason message is dropped. `needs-arch` for the container; the icon/message losses are `bug`.

---

## GROUP 1 — Public, Shell & Auth (24 gaps)

### 01 Login (`LoginPage.tsx`) — brand/SSO faithful; admin panel stripped
- **G-PUB-001** · Med · missing-interaction · bug — admin password field — prototype has a show/hide eye toggle; impl has none. Route: FE.
- **G-PUB-002** · Low-Med · missing-element/wrong-format · bug — 帳號 & 密碼 inputs — prototype has leading `user`/`lock` icons, `pl-9 py-2.5`, focus `primary-600`; impl has no icons, `px-3 py-2`, focus `primary-300/400`. Route: FE.
- **G-PUB-003** · Med · missing-element · bug — form — whole 記住我 checkbox + 忘記密碼？ link row absent. Route: FE (忘記密碼 target may need product-analyst).
- **G-PUB-004** · Low-Med · wrong-format/missing-element · bug — 途徑B toggle button — prototype: `justify-between` + chevron-down↔up + `aria-controls` + focus ring; impl: `justify-center`, no chevron, lighter border/text, no focus ring. Route: FE.
- **G-PUB-005** · Low-Med · missing-element · bug — error banner — prototype surfaces a mono error-code line (`AUTH_INVALID_CREDENTIALS`); impl drops the code, shows message only. Route: FE.
- **G-PUB-006** · Low · wrong-order/missing-element · possibly-intentional — error-banner placement + SSO redirect overlay + session-timeout modal absent. Route: **product-analyst / auth** — real OIDC redirect makes overlay/timeout an interceptor concern; confirm session-expiry UX is handled elsewhere.

### 02 Role Landing (`RoleLanding.tsx`) — mostly faithful (badge colors/cards verified identical)
- **G-PUB-010** · Low · missing-element · possibly-intentional — topbar — prototype has a logout button; impl shows only loginId. Route: **product-analyst** — logout intentionally shell-only?

### 03 Public List (`PublicListPage.tsx`) — cards/sections faithful; filter/pager region drifted
- **G-PUB-011** · Med · responsive/missing-interaction · possibly-intentional — filters — prototype has desktop bar + mobile filter-trigger opening a bottom sheet; impl is one always-visible stacked row. Route: **product-analyst** (F021 mobile sheet required or simplification accepted?).
- **G-PUB-012** · Med · missing-element · needs-backend-data — pager left — prototype shows "另有 N 筆（進度中/失效/作廢）已由後端隱藏"; impl doesn't. Route: **system-architect** — does the list API expose a hidden/total-before-filter count?
- **G-PUB-013** · Low · wrong-label/wrong-behavior · possibly-intentional — status filter — prototype `狀態：有效` enabled; impl `狀態：已公告` disabled. Route: **product-analyst/spec-writer** — confirm label vs current status-derivation model.
- **G-PUB-014** · Low · wrong-order · possibly-intentional — count moved from filter-bar top-right to pager bottom-left. Route: product-analyst (cosmetic).
- **G-PUB-015** · Low · wrong-format · possibly-intentional — pager — prototype numbered page buttons; impl prev/next + current page. Route: product-analyst (prototype's numbers were static demo).
- **G-PUB-016** · Low · wrong-cell-render · needs-backend-data — DocCard 使用部門 — prototype highlights in-scope dept segments; impl plain join. Route: **system-architect** — API must flag which using-dept matched viewer scope.

### 04 Public Document Detail — **NO React page exists**
- **G-PUB-020** · **HIGH** · missing-element · needs-arch — entire page/route — prototype 04 is a full detail page (breadcrumb, title+status+檢視/下載/列印, 19-field read-only list, 附件, 使用表單, 文件連結點 cross-links, audit footnote). Impl's `/public/documents/:id` renders `PublicViewerPage` directly; the list links straight to the viewer, dropping the whole detail page. Route: **system-architect + product-analyst + coordinator** — add `PublicDocumentDetailPage` + route, and make the list link to detail (not viewer)? **Highest-impact gap in group.**

### 05 Public Viewer / Watermark (`PublicViewerPage.tsx`) — core overlay present; heavily stripped
- **G-PUB-030** · Med · missing-element · bug — no toolbar row (active 檢視 pill + 下載/列印 + divider + zoom); impl has only 下載/列印 links in the header. Route: FE.
- **G-PUB-031** · Med · missing-interaction · bug — no zoom controls / zoom state at all. Route: FE (native PDF zoom vs re-implement).
- **G-PUB-032** · Med · missing-element · needs-backend-data — header never shows which document is open (no name/number/"文件檢視器" label). Route: **system-architect** — watermark endpoint returns only the WM string; need doc name/number.
- **G-PUB-033** · Low-Med · missing-element · needs-backend-data — header lacks viewer identity (name + org path). Route: FE — `useAuth` user has `name`; `buildOrgPath` exists; likely UI-only.
- **G-PUB-034** · Med · missing-element/wrong-copy · bug — the prominent shield-check server-watermark/security info band demoted to a small gray footnote with reduced content. Route: FE.
- **G-PUB-035** · Low · missing-element · possibly-intentional — footer watermark-format caption (literal WM string) absent. Route: **product-analyst** — expose literal format in prod?
- **G-PUB-036** · Low · wrong-format · possibly-intentional — overlay tiles 24 vs prototype 60, sans vs mono. Route: product-analyst (coverage still acceptable?).

### 07 Admin Shell (`AppShell.tsx`) — sidebar/menu/collapse faithful
- **G-PUB-040** · Med · wrong-cell-render · needs-backend-data — topbar shows `loginId` (mono) instead of user's name (public pages use `user.name`); breakpoint xl vs sm. Route: FE if `user.name` populated; else system-architect.
- **G-PUB-041** · Low · wrong-label · possibly-intentional — 瀏覽文件網頁 tooltip wording (開新視窗 vs 新視窗開啟). Route: product-analyst (trivial).

---

## GROUP 2 — Lifecycle & History (32 gaps)

### 10 Lifecycle List (`LifecycleListPage.tsx`) — mostly faithful (6 cols/actions/modals verified)
- **G-LC-001** · Low · wrong-cell-render(icon) · bug — read-only banner icon `user-circle` should be `eye`. Route: FE.
- **G-LC-002** · Med · wrong-cell-render · needs-backend-data — 掛載文件 column hardcoded `—` every row; prototype shows "N 份". Route: **system-architect** — add `mountedDocCount` to `LifecycleView`.
- **G-LC-003** · Low · missing-element · bug — empty state drops the `inbox` icon (text only). Route: FE.
- **G-LC-004** · Low · wrong-width · possibly-intentional — search input fixed `w-56` vs prototype `flex-1`. Route: product-analyst (cosmetic).
- **G-LC-005** · Low · missing-element · bug — name-required error drops inline `alert-circle` icon. Route: FE.
- **G-LC-006** · Low · wrong-label · possibly-intentional — delete-confirm body copy differs (docs==0 branch). Route: product-analyst (final wording).

### 11 DAG Canvas (`DagCanvasPage.tsx`) — re-platformed to @xyflow/react; node cards faithful
- **G-LC-007** · Med · missing-element · needs-backend-data — topbar title is generic "DAG 畫布"; prototype shows "«lifecycle name» · DAG 畫布". Route: **system-architect** — does `getDagGraph` return lifecycle name?
- **G-LC-008** · Med · missing-interaction · possibly-intentional — no explicit 儲存 button (impl auto-persists). Route: **product-analyst** — accept auto-persist?
- **G-LC-009** · Low · extra-element · possibly-intentional — impl adds "整理連結線" (dagre) button absent from prototype. Route: product-analyst (enhancement).
- **G-LC-010** · Med · responsive/wrong-behavior · possibly-intentional — canvas is 68vh box in scrollable content vs prototype full-viewport editor. Route: **product-analyst**.
- **G-LC-011** · Low · missing-element · possibly-intentional — React Flow default controls replace bespoke zoom stack + "100%" readout. Route: product-analyst.
- **G-LC-012** · Low · wrong-cell-render · possibly-intentional — React Flow default MiniMap vs bespoke labeled "Mini-map". Route: product-analyst.
- **G-LC-013** · Low · wrong-format/wrong-label · possibly-intentional — connection hint moved from floating card to inline; "系統"→"後端" + error code. Route: product-analyst.
- **G-LC-014** · Low · wrong-cell-render(icon) · bug — read-only banner icon `user-circle` should be `eye` (same as G-LC-001). Route: FE.

### 12 Node Drawer (`NodeDrawer.tsx`) — mostly faithful
- **G-LC-015** · Low-Med · missing-element/wrong-label · needs-backend-data — candidate filter note drops concrete cycle name + excluded count. Route: **system-architect** — expose cycle name + excluded-count on `NodeDrawerData`.
- **G-LC-016** · Low · wrong-label · possibly-intentional — footer hint "關閉即送出" vs impl "儲存後送出" (matches impl's own save behavior). Route: product-analyst.
- **G-LC-017** · Low · wrong-behavior · possibly-intentional — per-action success toast → inline notice (SYS-1). Route: product-analyst (via SYS-1).
- **G-LC-018** · Low · missing-interaction · possibly-intentional — no slide-in drawer animation. Route: product-analyst (cosmetic).

### 22 Lifecycle Tree Preview (`LifecycleTreePreviewPage.tsx`) — HIGHLY faithful (closest match)
- **G-LC-019** · Med · missing-element · needs-backend-data — app-bar title drops the mono cycle CODE (" · SRC") after name. Route: **system-architect** — expose cycle code.
- **G-LC-020** · Low · wrong-format · needs-backend-data — cycle selector options drop "（CODE）". Route: system-architect (same as 019).
- **G-LC-021** · Low · wrong-format · possibly-intentional — watermark tile density lower than prototype. Route: product-analyst.

### 23 Change History (`ChangeHistoryPage.tsx`) — real column loss + granularity simplifications
- **G-LC-022** · **HIGH** · missing-element · needs-backend-data — DocTab lost the entire **來源 column** (color-coded source badges 制定組織/當責室長/公告日期/狀態/附件/編輯). Root cause: impl only has coarse `changeType` (CREATE/CONTENT/STATUS/META), not the prototype's granular per-field `source`. Route: **system-architect** (can the changelog carry a source category?) + **product-analyst** (is the column required at list level?).
- **G-LC-023** · Med · missing-element · needs-backend-data — 程序書 cell drops the 書名 line (number only). Route: system-architect — `DocumentChangeView.documentName`?
- **G-LC-024** · Med · wrong-label · bug/possibly-intentional — 變更欄位 filter placeholder is English property names ("status/documentName") but results show Chinese labels — user sees "文件狀態" yet must type "status". Route: **product-analyst** — search should accept Chinese label.
- **G-LC-025** · Low-Med · wrong-cell-render · needs-backend-data — expanded source badge always slate + 4 coarse values (same root cause as 022). Route: system-architect.
- **G-LC-026** · Low · missing-element · bug — aggregated-group 時間 cell drops "同儲存/60 秒內" sub-label. Route: FE.
- **G-LC-027** · Low · wrong-label · possibly-intentional — scope note drops role-detail parenthetical + "下載" from audited actions + narrows `_*`→`_VIEW`. Route: product-analyst.
- **G-LC-028** · Low · wrong-label · possibly-intentional — footer drops the attachment "已替換/不保留舊檔" clause (relates to 025). Route: product-analyst.
- **G-LC-029** · Low · missing-element · needs-backend-data — TreeTab 循環別 cell + selector drop cycle CODE. Route: system-architect (same as 019/020).
- **G-LC-030** · Low-Med · wrong-width · bug — TreeDiffModal reuses full-viewer node metrics (NODE_W 176…) instead of prototype's "mini" metrics (NW 142…), so panels overflow the two-up modal. Route: FE.
- **G-LC-031** · Low · wrong-format · bug — TreeDiffModal diff tag chips all blue; prototype color-codes green/red/amber per node state. Route: FE.
- **G-LC-032** · Low · wrong-width · bug — expanded-detail label column 180px vs prototype 160px. Route: FE (trivial).

> Note: the 切換原因 line (F012 AC36) is a **confirmed intentional addition** (prototype 23 has no such element), styled consistently — NOT a gap.

---

## GROUP 3 — Documents (28 gaps)

### 13 Document List (`DocumentListPage.tsx`) — **columns/filters/stat-cards pixel-faithful**; drift in cells/interactions
- **G-DOC-001** · **HIGH** · missing-element · needs-backend-data — 當責室長 cell missing the `+N` secondary-chief badge + tooltip. Route: **system-architect** — add secondary-chief count to `DocumentListItem`.
- **G-DOC-002** · Low · wrong-cell-render · needs-backend-data — 當責室長 no `title` tooltip (full org path). Route: system-architect (low).
- **G-DOC-003** · Med · extra-element · possibly-intentional — sortable 程序書編號/公告日期 headers (prototype static). Route: **product-analyst** — confirm sortable headers a decided addition.
- **G-DOC-004** · Med · wrong-cell-render · possibly-intentional — pager "第 X / Y 頁" text vs prototype numbered buttons. Route: **product-analyst** — accepted pager style?
- **G-DOC-005** · Low · wrong-width · bug — filter labels render larger/darker (`SearchCombobox` `text-sm/slate-700` vs prototype `text-[11px]/slate-500`); icon/padding differ. Route: FE.
- **G-DOC-006** · Low · missing-interaction · possibly-intentional — per-field inline `×` clear vs a `全部` option. Route: product-analyst (equivalent).
- **G-DOC-007** · Low · wrong-empty-state · possibly-intentional — impl adds a "尚無文件" variant not in prototype. Route: product-analyst.

### 14 Document Create (`DocumentCreatePage.tsx`) — STEP1-4 faithful
- **G-DOC-101** · Med · missing-element · bug — STEP3 制定公司/部門/室別 labels missing the numbered `1/2/3` circle badges (encode top-down dependency). Route: FE.
- **G-DOC-102** · Med · wrong-behavior · needs-backend-data — STEP4 ".xls 原始檔" card is a dimmed placeholder (deferred to F027/F029) vs prototype's active upload card. Route: **system-architect/product-analyst** — confirm .xls upload intentionally disabled this build.
- **G-DOC-103** · Med · wrong-label · possibly-intentional — 當責室長 placeholder "搜尋室長姓名/員編…" vs prototype "…/部門…" (reflects real search-by-empNo). Route: **product-analyst** — confirm 部門→員編 intended.
- **G-DOC-104** · Low · wrong-order · bug — 使用部門 helper note moved BELOW field + smaller/greyer (edit page has it correct). Route: FE.
- **G-DOC-105** · Low · wrong-label · possibly-intentional — 制定組織 info note omits fixed-company sentence + example. Route: product-analyst (demo-specific).
- **G-DOC-106** · Low · wrong-label · possibly-intentional — 使用部門 info note drops "路徑呈現層級關係" clause. Route: product-analyst.
- **G-DOC-107** · Low · wrong-format · bug — 版次 separator uses curly `’` while stored value uses straight `'` (spec `YY'NN`). Route: FE.

### 15 Document Edit (`DocumentEditPage.tsx`) — **most-drifted documents page**
- **G-DOC-201** · **HIGH** · missing-element · needs-backend-data — entire "ICSOP 原始檔 (.xls)" attachment card + independent-upload info box (US-090/OQ-E09-10) removed; format note dropped `.xls`/`OQ-E04-06`. (Create keeps a disabled placeholder — inconsistent.) Route: **system-architect** — confirm .xls replace UI deferred to F030; mirror create's placeholder?
- **G-DOC-202** · **HIGH** · missing-interaction · bug — switching status to 作廢 has NO confirm modal (prototype: "切換為「作廢」？" guard before hiding doc from public). Destructive-action guardrail lost. Route: FE.
- **G-DOC-203** · Med · wrong-cell-render · bug — 制定組織/當責室長-主要 render as narrow `ComboDiff` (combobox + `目前：X` below) instead of the full-width `目前值 | 新值` diff rows used by every other field. Route: FE.
- **G-DOC-204** · Med · wrong-behavior · bug — 連結點/使用表單 sections render `MultiSearchCombobox` unconditionally for read-only roles (input visible but no-op); 次要室長/使用部門 correctly switch to `ReadonlyChips` — inconsistent. Gate these two the same. Route: FE.
- **G-DOC-205** · Med · wrong-cell-render · needs-backend-data — 所屬節點 readonly shows raw `nodeId` (mono) not node name. Route: **system-architect** — add `nodeName` to `DocumentView`.
- **G-DOC-206** · Med · missing-element · bug — 編號 & 版次 helper paragraphs dropped (create keeps them — inconsistent guidance). Route: FE.
- **G-DOC-207** · Low · wrong-label · possibly-intentional — 基本資訊 intro drops second sentence (combobox/版次 explanation). Route: product-analyst.
- **G-DOC-208** · Low · wrong-label · bug — 制定組織 description drops "當責室長保留。". Route: FE.
- **G-DOC-209** · Low · wrong-order · possibly-intentional — change-summary bar in body vs prototype's sticky header (AppShell portals topbar — arch constraint). Route: product-analyst.
- **G-DOC-210** · Low · wrong-behavior · possibly-intentional — 使用部門 allows removing the last chip; prototype enforces min-1 ("至少需保留 1 個使用部門"), but impl label says `0..*`. Route: **product-analyst** — 0 or ≥1 the rule? (conflicts with F014 "允許為空" — cross-check.)
- **G-DOC-211** · Med · wrong-behavior · bug — changing 循環 updates the displayed number prefix but not the stored `documentNumber` until suffix re-typed → display/value desync + `changed('documentNumber')` may not fire. Route: FE (verify backend re-derives; else rebuild on lifecycle change).
- **G-DOC-212** · Low · wrong-label · possibly-intentional — 使用表單/連結點 section intros shortened. Route: product-analyst.

### 16 Document Readonly (`DocumentReadonlyPage.tsx`) — mostly faithful (16 rows + attachments verified)
- **G-DOC-301** · Med · wrong-cell-render · needs-backend-data — 所屬節點 shows raw `nodeId` not node name (same as G-DOC-205). Route: system-architect (`nodeName`).
- **G-DOC-302** · Low · wrong-format · bug — 連結點 link separator ` · ` between number and name; prototype uses a space. Route: FE.

---

## GROUP 4 — Admin Data Pages (34 gaps)

### 08 Account Management (`AccountManagementPage.tsx`) — **HEAVILY DRIFTED**
- **G-ADM-001** · **HIGH** · missing-element · needs-backend-data — **✅ CLOSED 2026-08-12**（公司/部門/最後登入 於 Wave 2 補齊；**職位於 2026-08-12 補齊**）. results table dropped **4 columns**: 公司 / 部門 / 職位 / 最後活動 (10→6 cols); 來源/角色/狀態 moved up (wrong order). Route: **system-architect** — `AccountView` lacks `company`/`department`/`title`/`lastActivityAt`; backend `GET /admin/accounts` must surface them. **Highest-impact — this is the column-drop the user flagged.**<br>職位之補齊：`ACCOUNT.jobTitleCode` ← `VW_HPMUSER.JOBTITLEID`＋`JOB_TITLE` 對照主檔 ← `VW_PERSONAL_JOB`（migration `1723852800000`）。⚠ 先前「上游無此欄」之 DEFER 理由經查不成立，見契約 §5.4.1 與 `OQ-E02-07b`。
- **G-ADM-002** · Med · wrong-cell-render(icon) · bug — 離職自動停用 badge icon `user-cog` should be `user-x`. Route: FE.
- **G-ADM-003** · Low · wrong-cell-render(icon) · bug — 建立帳號 button icon `plus` should be `user-plus`. Route: FE.
- **G-ADM-004** · Med · wrong-label/icon · bug — read-only banner icon `user-circle`→`eye`; wording drift. Route: FE.
- **G-ADM-005** · Med · wrong-empty-state · bug — no-permission card icon `alert-circle`→`lock`; missing per-role message (SYS-2). Route: FE.
- **G-ADM-006** · Low · wrong-label · bug — footer drops "（軟刪除，停用帳號保留）", adds "· 每頁 50 筆". Route: FE.
- **G-ADM-007** · Low · missing-interaction · bug — create-modal 初始密碼 field missing eye toggle. Route: FE.
- **G-ADM-008** · Low · wrong-label · bug — create-modal copy drift (subtitle/placeholder/helper). Route: FE.
- **G-ADM-009** · Med · missing-element/interaction · bug — edit-modal missing "目前角色" display + password eye toggle. Route: FE.
- **G-ADM-010** · Low · wrong-cell-render · possibly-intentional — 角色 cell uses `RoleBadge` (icon+label) vs prototype-08 icon-less pill. Route: product-analyst (shared component consistency).
- **G-ADM-011** · Low · wrong-behavior · possibly-intentional — confirm-dialog OK is danger-red dynamic label vs prototype primary "確認". Route: product-analyst (enhancement).

### 09 Org Sync (`OrgSyncPage.tsx`) — MOSTLY FAITHFUL (KPI cards/tabs/history/alerts verified; F005 kinds consistent)
- **G-ADM-012** · Low · wrong-cell-render(icon) · bug — history error-expand icon `alert-circle`; prototype `alert-octagon` (NOT in Icon registry — needs registry add or accept substitute). Route: FE.

### 17 Access History (`AccessHistoryPage.tsx`) — **FAITHFUL, no gaps** (pill/chevron/pagination fixes verified against prototype 17).

### 18 Permission Matrix (`PermissionMatrixPage.tsx`) — MODERATELY DRIFTED
- **G-ADM-013** · Med · wrong-cell-render · bug — matrix value pills text-only; prototype has icons (CRUD→`square-pen`, 可寫→`pencil`, 可→`check`, 唯讀→`eye`). Route: FE.
- **G-ADM-014** · Med · wrong-cell-render/missing-element · bug — cell values lose `·`-split colored pill + grey sub-line (前台瀏覽=可 green, 下載列印=可·浮水印, ICSOP PDF=唯讀·可下載, 節點=可寫·僅F009, 調閱歷程=全部唯讀). Consequence: 前台瀏覽/下載列印 render amber "唯讀" instead of green "可". Route: **FE + RBAC spec** — enrich display model or accept divergence.
- **G-ADM-015** · Med · missing-element · bug — matrix row-level notes absent (角色指派→"經帳號管理 modal…"; 系統 UUID→"系統產生"). Route: FE.
- **G-ADM-016** · Low · wrong-cell-render · possibly-intentional — 系統 UUID row shows grey "系統產生" pills vs prototype 唯讀 amber pills. Route: product-analyst.
- **G-ADM-017** · Med · wrong-label/icon · bug — "已定案" banner icon `check-circle-2`→`badge-check`(needs registry); drops the "共 19 欄 / 制定組織三級" sentence. Route: FE.
- **G-ADM-018** · Med · wrong-label/icon · bug — "草案待審(OQ-E08-02)" banner icon `info`→`clock`; the "分析師草案待審核" framing entirely lost. Route: FE.
- **G-ADM-019** · Low · wrong-label · bug — legend drops "/ 可" (first chip). Route: FE.
- **G-ADM-020** · Low · wrong-label · possibly-intentional — row labels drop parentheticals/spaces (keys are cross-layer stable strings). Route: **FE + RBAC spec** — add a label map so display matches spec while keys stay stable.
- **G-ADM-021** · Low · missing-element · possibly-intentional — topbar disabled-look "編輯" button absent. Route: product-analyst (decorative).
- **G-ADM-022** · Low · wrong-empty-state(icon) · bug — no-permission card `alert-circle`→`lock` (same as G-ADM-005). Route: FE.
- **G-ADM-023** · Low · wrong-width · possibly-intentional — header role badges slightly smaller (`RoleBadge size="sm"`). Route: product-analyst (shared component).

### 19 Usage Form Management (`UsageFormManagementPage.tsx`) — MOSTLY FAITHFUL
- **G-ADM-024** · Med · missing-element · needs-backend-data — 上傳者 cell missing uploader department (line 1 name only). Route: **system-architect** — `UsageFormPoolItem` lacks `uploadedByDept`.
- **G-ADM-025** · Med · missing-interaction · bug — related-docs expand rows are non-clickable `<div>`s (no jump, no `external-link` icon, no hover); prototype are jump buttons to 13/16. Route: FE (wire jump to document route).
- **G-ADM-026** · Low · wrong-format · possibly-intentional — size-limit "50 MB" (no demo badge) vs prototype "20 MB · 示範值" (prototype was explicitly demo → 50MB likely correct). Route: **product-analyst** — confirm 50MB against backend file-rules.

### 21 Doc Index (`DocIndexPage.tsx`) — MODERATELY DRIFTED
- **G-ADM-027** · **HIGH** · missing-element · bug — results table dropped the **`.xls 原件` column** (有 `file-spreadsheet`/無 `file-x`). `DocIndexOverviewRow.hasXls` IS available → pure FE fix. Core to this page's purpose. Route: FE.
- **G-ADM-028** · Med · missing-element · needs-backend-data(card) + bug(filter) — dropped the whole "尚未建立" status: 4th summary card + 5th filter option + row hints. Route: **system-architect** (`notBuiltCount`) + FE (filter option).
- **G-ADM-029** · Med · missing-element · needs-backend-data — 名稱 cell missing "循環 · 版次 · 使用部門" sub-line. Route: system-architect — `DocIndexOverviewRow` lacks cycle/edition/usingDepts.
- **G-ADM-030** · Low · wrong-cell-render · needs-backend-data — failed-row shows stage label not error code (`XLS_TEMPLATE_INVALID`). Route: system-architect — no `errorCode` on row.
- **G-ADM-031** · Low · missing-element · needs-backend-data — failure-detail modal missing "錯誤碼" row. Route: system-architect — no `errorCode` on `DocIndexStatus`.
- **G-ADM-032** · Low · missing-element · bug/possibly-intentional — running rows show nothing in action cell vs prototype's disabled "建置中" button. Route: FE/product-analyst.
- **G-ADM-033** · Low · wrong-label/width · bug — shortened intro; banner drops "（FIELD_WRITE_FORBIDDEN）"; table `min-w-[820px]` vs 920. Route: FE.
- **G-ADM-034** · Low · wrong-cell-render · needs-backend-data + bug — preview chunk chips show `documentNumber` not 循環 name, no chunk-id chip, drop cleaning sentence. Route: system-architect (循環 name) + FE (cid chip, sentence).

---

## Cross-cutting rollups (for the team)

### A. `needs-backend-data` / `needs-arch` — require system-architect ruling (may need backend/API/DTO changes)
G-PUB-012, G-PUB-016, G-PUB-020 (new page+route), G-PUB-032, G-PUB-040(?), G-LC-002, G-LC-007, G-LC-015, G-LC-019/020/029 (cycle code), G-LC-022/023/025 (changelog source granularity), G-DOC-001 (secondary-chief count), G-DOC-102/201 (.xls deferral), G-DOC-205/301 (nodeName), G-ADM-001 (4 account columns), G-ADM-024 (uploader dept), G-ADM-028/029/030/031/034 (doc-index fields). **The change-history `source` granularity (G-LC-022) and the Account columns (G-ADM-001) are the two biggest backend-touching items.**

### B. `possibly-intentional` — require product-analyst ruling (decided deviation vs. drift)
SYS-1 (toast), G-PUB-006/010/011/013/014/015/035/036/041, G-LC-004/006/008/009/010/011/012/013/016/017/018/021/024/027/028, G-DOC-003/004/006/007/103/105/106/207/209/210/212, G-ADM-010/011/016/020/021/023/026/032. **Known-decided deviations already on record (do NOT "fix" back): 50MB vs 20MB (G-ADM-026), status "已公告" derivation (G-PUB-013), F012 reason display (not a gap), inline-notice vs toast (SYS-1).**

### C. Pure `bug` (frontend-only, no ruling needed — safe to fix once confirmed)
The remaining ~50 `bug`-flagged items (icons, dropped copy, missing helpers, the 作廢 confirm G-DOC-202, the ComboDiff layout G-DOC-203, readonly-input leak G-DOC-204, the .xls column G-ADM-027, matrix icons/notes G-ADM-013/015, etc.). These are the fastest wins.

### Registry note
Some prototype icons are NOT yet in `frontend/src/components/Icon.tsx`: `alert-octagon` (G-ADM-012), `badge-check` (G-ADM-017), `square-pen` (G-ADM-013). Register before use (the `Icon.registry.test.tsx` guard will fail otherwise).
