# Prototype-Alignment — Adjudicated Inventory

> **✅ STATUS 2026-07-25 — COMPLETE.** Wave 1 (foundation: global toast, 5 icons, `SearchCombobox` density prop, ~14 backend DTO/endpoint enrichments, `lastLoginAt`, public-detail endpoint, F037 attachment-event, 2 migrations on SOP) + Wave 2 (all 4 page-groups: documents/lifecycle/public+new-detail-page/admin) merged to `main`. **Frontend 532 tests / 40 files, backend 1277 / 106, `test:int` 15 suites / 88 vs SOP, tsc clean.** Toast system live + pages migrated (transient action feedback → toast; persistent error/loading state cards stay inline). Gate decisions all realized: toast built, `最後登入` via per-login write, cycle-codes dropped, ~~職位 deferred~~（**職位已於 2026-08-12 補齊**，見 G-ADM-001）, public detail page built. **Deferred (recorded, not forgotten):** G-DOC-002 (org-path tooltip, Low), G-ADM-029 (doc-index cycle·edition·dept sub-line — no backend join, [integration]), G-ADM-023 (matrix header badge size, Low cosmetic). ~~職位 column~~ — **已於 2026-08-12 實作**（其 deferral 理由「等上游」經查不成立）. **Own tickets raised & done here:** F037 attachment-replace event (was an unmet AC — now published as `changeType:'CONTENT', field:'attachment'`); `lastActivityAt` shipped as `lastLoginAt`.



> Produced 2026-07-24 by the alignment agent-team (analyst = product rulings, architect = FE-vs-backend, designer = prototype-intent ground truth), adjudicating the 118 gaps in `gap-inventory.md`. Every disposition was verified against actual code/specs, not the inventory's stated root causes. **This is the fix-phase input.** Human gate decisions are marked ⚖️ PENDING.

## Two corrections the team made to the original inventory
- **G-LC-022/025 is mostly FE, not backend.** `DocumentChangeView.field` is already per-row granular (draftingDeptId/primaryChiefId/announcedDate/status…); the UI derives the 來源 badge from coarse `changeType` instead of `field`. Swapping the lookup key renders 5 of 6 source categories correctly with **zero backend change**. Only the **附件** category is genuinely missing (attachments module never publishes change events).
- **G-DOC-210 → DEVIATION-KEEP (not a gate item).** Impl is correct (0..* / empty-allowed, agrees with F010 dated 2026-07-24). The only fix is a stale-doc typo: `data-model.md:222` `1..*` → `0..*` (data-model.md is dated 2026-07-17, predates the F010 settlement). Spec-writer corrects the doc; no UI change; the prototype's dead min-1 gate is NOT intent to restore.
- **G-LC-022 附件 category = an F037 completion bug, ticketed separately.** `attachments.service.ts` never publishes to `DOCUMENT_CHANGE_PUBLISHER`, so "附件已替換" change events don't exist — **F037's own AC is unmet** independent of this alignment pass. Ship the 5/6 FE fix now; raise the 附件-publishing gap as its own F037 ticket.
- **HIGH reconciliation:** the inventory header says "High 9" but only **7** gaps are marked HIGH (G-PUB-020, G-LC-022, G-DOC-001, G-DOC-201, G-DOC-202, G-ADM-001, G-ADM-027). The correct count is 7; header to be corrected.

---

## Bucket 1 — FIX-FE-NOW (data already on the wire; pure frontend)
No backend change; safe to fix immediately.
- **G-PUB-016** (in-scope dept highlight — `isWithinSubtree` is pure string prefix logic, portable to FE)
- **G-PUB-033** (viewer user identity — `SessionUser.name/.orgCode` + `buildOrgPath` already used elsewhere)
- **G-PUB-040** (shell shows `loginId`; should use `SessionUser.name` — same object, wrong field)
- **G-LC-007** (DAG title — fetch existing `GET /admin/lifecycles/:id`.name)
- **G-LC-015** (drawer note cycle-name part — prop from DagCanvasPage once G-LC-007 done; excluded-count part is backend, see B)
- **G-LC-022/025** (7 of 8 source categories — swap `changeType`→`field` lookup; categories 制定組織/當責室長/公告日期/使用部門/狀態切換/編輯-catch-all + 附件; only 附件 is backend, below)

## Bucket 2 — FIX (confirmed real drift; frontend-only, no ruling needed)
The pure-`bug` set + rollup-B items analyst confirmed as FIX. Fastest wins, incl. the two HIGH:
- **HIGH**: G-DOC-202 (作廢 confirm modal — exact copy captured), G-ADM-027 (`.xls 原件` column — `hasXls` already present)
- G-DOC-203 (ComboDiff → full-width diff rows), G-DOC-204 (readonly-input leak), G-DOC-206 (helper texts), G-DOC-208, G-DOC-211 (number/lifecycle desync), G-DOC-101 (org number-badges), G-DOC-104 (helper placement), G-DOC-107 (版次 glyph), G-DOC-302 (link separator)
- G-DOC-106/207/212 (spec-grounded copy — restore)
- G-PUB-001/002/003/004/005 (login: password toggle, input icons, 記住我/忘記密碼 row, chevron, error code)
- G-PUB-010 (landing logout), G-PUB-011 (mobile filter sheet — design-system §6.1), G-PUB-014, G-PUB-030/031/034 (viewer toolbar/zoom/security band), G-PUB-041
- G-PUB-006 timeout-modal part (design-system-spec'd), G-PUB-036 font-family part, G-PUB-035
- G-LC-001/003/005/014 (icons/empty-state), G-LC-004/006/013, G-LC-010 (canvas maximize — design-system), G-LC-016/018 (drawer 關閉即送出 + slide-in — design-system §6.8), G-LC-024 (zh-TW placeholder), G-LC-026/027/028 (spec-grounded copy), G-LC-030/031/032 (mini-DAG metrics/tag colors/width)
- G-ADM-002/003/004/005/006/007/008/009 (account icons/copy/eye-toggle/no-perm card), G-ADM-012, G-ADM-013/014/015/017/018/019 (matrix icons/sub-labels/notes/banners/legend), G-ADM-020 (label map), G-ADM-021/022/023, G-ADM-025 (usage-form related-docs clickable), G-ADM-032 (running-row indicator), G-ADM-033, G-ADM-034 (cid chip + cleaning sentence FE parts)
- Registry adds required: `alert-octagon`, `badge-check`, `square-pen`.

## Bucket 3 — NEEDS-BACKEND (modest batch — sizes verified)
| gap | change | size |
|---|---|---|
| G-PUB-012 | hidden-count on `PublicListPage` (pre-filter set already loaded) | S |
| G-PUB-032 | widen watermark `view()` to return documentNumber/documentName (already resolved for audit) | S |
| G-LC-002 | `mountedDocCount` on `LifecycleView` (per-node docCount already computed) | S |
| G-LC-015 | excluded-count query (mounted-in-other-lifecycles) | S |
| G-LC-023 | join current `ICSOP_DOCUMENT.documentName` in change-history | S |
| G-LC-022/025 附件 | attachments module publish to `DOCUMENT_CHANGE_PUBLISHER` (also fixes G-LC-028 root) | S |
| G-DOC-001/002 | batch-join `DOC_SECONDARY_CHIEF` into list query (no migration) — **HIGH** | S-M |
| G-DOC-205/301 | node-name lookup on single-record read | S |
| G-ADM-001 公司/部門 | batch-resolve `Account.orgCode`→names (same pattern as documents) | S |
| G-ADM-024 | resolve `uploadedBy` accountId→name + dept — **today renders raw UUID** (worse than reported); needs new by-accountId resolution path | M |
| G-ADM-028 | never-indexed-doc visibility (not a projection fix; needs doc-id-list vs INDEX_RUN diff) | M |
| G-ADM-029 | widen existing join to carry lifecycleId/edition/usingDeptIds | S |
| G-ADM-030/031 | add `errorCode` to INDEX_RUN + wire `markFailed()` (value already computed, silently dropped) — closes 2 | M |
| G-ADM-034 | project `DocumentChunk.id` + batch lifecycle-name into chunk preview | S |

**Architect's top-3 worth doing:** G-ADM-030/031 errorCode (M, closes 2), G-DOC-001/002 secondary-chief (S-M, HIGH), G-ADM-024 uploader (M, fixes raw-UUID bug).

## Bucket 4 — DEVIATION-KEEP (do NOT fix — decided/correct; cited)
- **SYS-2** container (block-overlay → in-content card) — arch-appropriate for SPA (the icon/message sub-gaps ARE in Bucket 2).
- G-PUB-006 SSO-overlay part (real OIDC redirect), G-PUB-013 (已公告 derivation, OQ-E06-02), G-PUB-015 (pager — variable counts), G-PUB-036 tile-density (NFR-007a doesn't specify count)
- G-LC-008 (auto-persist, F008 + design-system §6.9 — no Save button), G-LC-009 (additive dagre button), G-LC-011/012 (React-Flow default chrome, F008 library choice), G-LC-021 (tile density)
- G-DOC-003 (sortable headers satisfy F017 sort AC), G-DOC-004 (pager), G-DOC-006 (equivalent clear), G-DOC-007 (additive empty variant), G-DOC-103 (EMPNO search — upstream contract), G-DOC-105 (demo-specific example), G-DOC-209 (single topbar portal)
- G-ADM-010 (role icons — design-system §3.4), G-ADM-011 (danger buttons — §6.4), G-ADM-016 (系統產生 distinct per F026), G-ADM-026 (50MB — OQ-E04-06; prototype's 20MB self-labeled 示範值待確認)

## Decided by the team (NOT gate questions — build/defer as noted)
- **G-PUB-020 → BUILD IT (spec-mandated).** F019 names a distinct 詳情 page; architect sized it **M (~95% shape reuse** from existing admin doc-view/list components), all 19 fields incl. 系統 UUID approved (audience = logged-in employees, UUID already internally visible per F026). Only *scheduling* within the fix pass is open — it's the biggest single chunk. Not a "whether" decision.
- **G-DOC-102/201 → mirror Create's disabled placeholder onto Edit** (cheap FE parity; real .xls upload stays backend-`[integration]`-blocked, separate item). Keep copy "not yet enabled", identical on both pages.
- **G-ADM-001 職位 (title) → ~~DEFER~~ ✅ SHIPPED 2026-08-12.** 原裁決：DEFER (upstream `VW_HPMUSER`/`VW_PERSONAL_JOB.JTITLE_NM` not ingested; OQ-E02-07 待上游). Ship 5 of 6 account columns now; add 職位 when upstream delivers.
  - ⚠ **該 DEFER 的等待對象是錯的。** 本行原文「not ingested」是準確的（＝我方未攝入），但下游文件轉述成「上游無此欄」後，此項就被當成「等上游交付」而擱置。實際上 `JTITLE_NM` 在契約 §5.4 的 dev 實測中一直存在（63 種、空值 0），**無需等待任何上游交付**。
  - **補齊方式**：`ACCOUNT.jobTitleCode` ← `VW_HPMUSER.JOBTITLEID`（白名單 11→12 欄）；名稱由新 `JOB_TITLE` 對照主檔（← `VW_PERSONAL_JOB` 之 `COMPID`/`JTITLE_ID`/`JTITLE_NM`）解析。**刻意不 join `EMPNO`**（員編非唯一、一人多帳號）。migration `1723852800000-account-job-title`。
  - **實測**：AS 在職 1,115 筆，職稱代碼空值 0，兩段式解析（本公司優先→跨公司 fallback）命中率 **100%**。規格見契約 §5.4.1，OQ 見 `OQ-E02-07b`。

## ✅ GATE DECISIONS (2026-07-24, human)
1. **SYS-1 → BUILD a global toast system** (design-system §6.5: 右上角, success/error/info, 3–5s auto-dismiss). Migrate ~7+ pages off inline-notice.
2. **最後活動 → `lastLoginAt`, written once per login** (not per-request). Display column relabeled "最後登入". Cheap, honest; no per-request write amplification, no AUDIT undercount.
3. **Cycle CODE → DROP this pass** (G-LC-019/020/029). No `code` column, no upstream values; display gap accepted. Can be scheduled separately if real AS codes are ever supplied.
4. **Sequencing → one pass, all of it** (FE bugs + backend batch + public detail page), via per-page-group teammates, each under plan-approval.

## Fix-phase decomposition (disjoint file ownership → no teammate collisions)
**Wave 1 — Foundation (must land first; page waves depend on it):**
- **fe-infra**: build global `Toast` provider/hook + wire app root; register icons `alert-octagon`/`badge-check`/`square-pen`; fix shared `SearchCombobox` label sizing (G-DOC-005). Files: new toast files, `Icon.tsx`, `SearchCombobox.tsx`, app root — disjoint from page files.
- **backend-batch**: the ~14 NEEDS-BACKEND items (Bucket 3) — DTO/service/store/migration changes + the new fields in `frontend/src/api/types.ts` + the `lastLoginAt` write path + the public-detail endpoint (for G-PUB-020) + the 附件-publish F037 fix. Owns backend + `types.ts` (page waves only READ types). Excludes `.xls` real upload (stays `[integration]`).

**Wave 2 — Per-page-group FE fixes (parallel, disjoint page files; consume Wave-1 foundation):**
- **fix-documents**: DocumentList/Create/Edit/Readonly — FE bugs + toast migration + FE-now + consume secondary-chief/nodeName + mirror .xls placeholder onto Edit.
- **fix-lifecycle**: LifecycleList/DagCanvas/NodeDrawer/TreePreview/ChangeHistory — incl. G-LC-022 5/6 field→category badge swap, drawer/canvas design-system fixes.
- **fix-public**: Login/RoleLanding/PublicList/PublicViewer/AppShell **+ build `PublicDocumentDetailPage` + route** (G-PUB-020) + toast migration.
- **fix-admin**: Account/OrgSync/PermissionMatrix/UsageForm/DocIndex — incl. `.xls 原件` column, matrix icons/notes, account 5/6 columns, uploader-name.

Every teammate: TDD (failing test first), quote prototype labels, keep baseline green (fe 410, be 1243, tsc). Plan-approval before any code change.

## Bucket 5 — ⚖️ ESCALATE (RESOLVED at the gate — see GATE DECISIONS above)
1. **SYS-1 toast.** design-system §2/§6.5 *mandates* a toast system; inline-notice is documented stopgap debt (F006-impl.md:139), never ratified. **Build a minimal global toast (~7+ pages migrate) or formally ratify inline-notice (amend the design doc)?** Team leans build.
2. **G-ADM-001 最後活動 (lastActivityAt).** Architected (architecture-spec §5.3) but never built — stateless sliding-JWT means no activity timestamp exists anywhere. Options: **(a)** add a DB column + write path (reopens the write-amplification tradeoff the arch spec chose to avoid); **(b)** `lastLoginAt` written once per login (cheap, honest — analyst's recommendation); **(c)** approximate via `MAX(AUDIT_LOG.occurredAt)` (undercounts login-only / admin-CRUD → *misleading* dormancy — team advises against); **(d)** drop the column from this pass. Real new-feature scope, not a restoration.
3. **Cycle CODE (G-LC-019/020/029).** `Lifecycle` has no `code` column and no upstream value source; prototype's SRC/PUC/… are demo placeholders. **Add a `code` column + assign the real AS lifecycle codes (someone must supply the values), or drop cycle-code display from scope?**

---

## 事後追加之 DEVIATION-KEEP（不得由後續 alignment pass 還原）

> 這一節記錄「**明知與 prototype 不同、且經人類裁決保留**」的偏離。沒有這份紀錄，下一次比對
> prototype 的人會把它當成 drift 修回去。

### DEV-01（2026-08-26，2026-08-27 擴充，🔴 2026-09-04 撤銷）編輯頁「制定公司」為唯讀列，非下拉

- **Prototype**：`prototypes/15-document-edit.html:438` 之 `{key:'company',label:'制定公司',type:'combo'}`
  ——與制定部門／制定室別同為三級連動下拉。
- **實作**：`DocumentEditPage.tsx` 改為唯讀列（`FixedRow`），顯示制定公司之**公司主檔全稱**＋
  「文件所屬公司於建立時決定，不可變更。」。建立頁（prototype 14）**不受影響**，仍為可選下拉。
- **裁決人**：使用者，2026-08-26（唯讀 vs 可改，選唯讀）；2026-08-27 追加裁定「只留制定公司一個欄位，
  顯示公司全稱」。
- **理由**：`companyCode` 是文件的歸屬鍵——制定部門／制定室別／使用部門存的都是各公司獨立編碼之 5 碼
  `orgCode`，改公司會讓這些既有值整批指向別家公司的單位，並直接影響 F041 之資料列可見性判定（安全性）。
  後端因此把 `companyCode` 列入 `EDIT_READONLY_PROPS`；前端若還留一個可改的下拉，就是一個按了不會生效
  的控制項。權威見 [F026 註](../features/F026-role-field-matrix.md)、[F011](../features/F011-edit-with-comparison.md)。

> 🔴 **2026-09-04 使用者裁決撤銷本項偏離**：編輯頁「制定公司」改回**可編輯下拉**，
> 與 prototype 15 之 `{key:'company',type:'combo'}` 重新一致（本節保留供追溯，勿據以修回唯讀）。
>
> **撤銷理由**：程序書目錄清單（`reference/程序書目錄清單(1150805).xlsx`）匯入時把 **126 筆**非和潤企業之
> 文件（和潤電能 61／和勁企業 41／和潤興業 24）記成和潤企業——`seed-document-catalog.ts` 自 `37b987b` 起
> 逐列寫死 `companyCode = 'AS'`。既有資料以 migration `1725580800000` 修補，但**唯讀代表這種錯誤在畫面上
> 永遠改不掉**：鎖死擋掉「不小心改錯」的同時，也把「改正」一起擋掉了。
>
> **原理由（連動風險）未被否認**，改由連動清空承接而非鎖死欄位：變更制定公司時，同一次 PATCH 未明文
> 重填之 `draftingDeptId`／`draftingSectionId`／`usingDeptIds` 一律清空（後端 `DocumentsService.update()`
> 之 1e，前端 `onCompanyChange` 同步清空以即時反映）。後端獨立執行此規則，前端不是唯一防線。
>
> **回歸鎖定改為**：`DocumentEditPage.test.tsx`「制定公司為可編輯之對照列…」／「唯讀角色之制定公司下拉為
> disabled」／「變更制定公司 → 三個組織欄即時清空，並隨 PATCH 一併送出」；
> `documents.service.spec.ts` 之「編輯端帶 companyCode → 落地」及其四條連動清空案。

#### 2026-08-27 追加：`draftingCompanyId` 整欄移除，制定公司全站改顯示公司全稱

DEV-01 原始版本只改編輯頁，因而製造出一個新的不一致：編輯頁那一列標著「制定公司」卻顯示公司全稱
（和潤企業股份有限公司），而後台清單／前台清單／前台詳情三處標著同一個「制定公司」顯示的是
`orgName(draftingCompanyId)`＝ROOT 單位名（和潤本部）。使用者裁定**收斂為一個欄位、且全稱是對的**：

- `ICSOP_DOCUMENT.draftingCompanyId` 以 migration `1724803200000` **DROP**。該欄存的是該公司 ROOT 之
  `orgCode`，而 AS／AD／AJ 三家的 ROOT 皆為 `'00000'`、**AE 根本沒有 ROOT 列**——值域只有 `'00000'`
  與 `NULL`，零資訊量。實測 591 筆：455 筆 `'00000'`、136 筆 `NULL`、**無一筆帶公司代碼**（即編輯頁那個
  會寫錯欄位的下拉，實際上從沒有人透過它動過制定公司，無須資料修補）。
- 制定公司之顯示名改由 `resolveCompanyName(companyCode)` 解析（公司主檔全稱），套用於後台清單、
  前台清單、前台詳情、後台唯讀頁、編輯頁唯讀列。**前後台的制定公司篩選下拉選項文字因此由「和潤本部」
  變為「和潤企業股份有限公司」**——此為與 prototype 03／13 篩選器逐字規範之刻意偏離，一併記於此。
- 篩選鍵由 `draftingCompanyId` 改為 `companyCode`（後台 `GET /admin/documents`、前台
  `GET /public/documents` 之 query 參數同步改名，非只改語意——避免再出現「欄名與值語意不符」）。
- `companyCode` **納入變更歷程**，標籤「制定公司」。此舉推翻 2026-08-26 當天的相反決定（當時排除的理由是
  「與 `draftingCompanyId` 同源、不重複記一列」，該前提隨本次移除而消失）。舊鍵 `draftingCompanyId` 之
  標籤對映**保留**——`DOCUMENT_CHANGE_LOG` 為 append-only，歷史列仍要顯示得出來。
- 連帶修掉的既有缺陷：制定部門下拉的啟用條件原本看 `draftingCompanyId`，對該欄為空的文件（建立時該公司
  無 ROOT 列，例如 AE）會**永久鎖死**部門下拉；改為看部門候選本身。
- **回歸鎖定**：`DocumentEditPage.test.tsx`「制定公司為唯讀列…」、`document-field-write.spec.ts`
  「`draftingCompanyId` 已不在表內」、`f014.itest.ts`／`changehistory.itest.ts`（真庫）。
