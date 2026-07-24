# Prototype-Alignment — Adjudicated Inventory

> **✅ STATUS 2026-07-25 — COMPLETE.** Wave 1 (foundation: global toast, 5 icons, `SearchCombobox` density prop, ~14 backend DTO/endpoint enrichments, `lastLoginAt`, public-detail endpoint, F037 attachment-event, 2 migrations on SOP) + Wave 2 (all 4 page-groups: documents/lifecycle/public+new-detail-page/admin) merged to `main`. **Frontend 532 tests / 40 files, backend 1277 / 106, `test:int` 15 suites / 88 vs SOP, tsc clean.** Toast system live + pages migrated (transient action feedback → toast; persistent error/loading state cards stay inline). Gate decisions all realized: toast built, `最後登入` via per-login write, cycle-codes dropped, 職位 deferred, public detail page built. **Deferred (recorded, not forgotten):** G-DOC-002 (org-path tooltip, Low), G-ADM-029 (doc-index cycle·edition·dept sub-line — no backend join, [integration]), G-ADM-023 (matrix header badge size, Low cosmetic), 職位 column (upstream OQ-E02-07). **Own tickets raised & done here:** F037 attachment-replace event (was an unmet AC — now published as `changeType:'CONTENT', field:'attachment'`); `lastActivityAt` shipped as `lastLoginAt`.



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
- **G-ADM-001 職位 (title) → DEFER** (upstream `VW_HPMUSER`/`VW_PERSONAL_JOB.JTITLE_NM` not ingested; OQ-E02-07 待上游). Ship 5 of 6 account columns now; add 職位 when upstream delivers.

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
