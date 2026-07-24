# Prototype-Alignment — Agent-Team Kickoff Brief

> For the **team lead** of a fresh Claude Code session with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enabled. The audit is DONE; this is the plan for the team.

## Mission
Align the implemented React frontend with its authoritative `prototypes/*.html`. The confirmed gap inventory is **`docs/specs/prototype-alignment/gap-inventory.md`** — **118 gaps** across 4 page-groups + 2 systemic patterns. Do NOT re-run the audit; adjudicate and fix from the inventory.

## Hard rules (non-negotiable)
- **Prototype is authoritative** for visual/structural/copy. But **do NOT "fix" decided deviations back into wrongness** — see the inventory's rollup B and the "known-decided deviations" list (50MB vs 20MB, "已公告" status derivation, F012 reason display, inline-notice vs toast). Product-analyst rules on every `possibly-intentional`.
- **TDD**: every fix gets a failing test first (Vitest/@testing-library), then implement (per project `/tdd`). Prototype-fidelity assertions must quote the prototype's actual labels/structure.
- Every icon used must be registered in `frontend/src/components/Icon.tsx` (the `Icon.registry.test.tsx` guard fails otherwise). Register `alert-octagon`, `badge-check`, `square-pen` before use.
- Keep the existing test baseline green: backend 1243/105, frontend 410/35, tsc clean.

## Team roles (recruit as teammates; reuse the named subagent types)
- **product-analyst** — rules on every `possibly-intentional` gap (rollup B): decided deviation vs. real drift. Produces the confirmed, categorized worklist. Talks to ui-ux-designer (what exactly does the prototype show?) and spec-writer (what does the spec/decision record say?).
- **system-architect** — rules on every `needs-backend-data`/`needs-arch` gap (rollup A): can it be fixed in the FE (data already in the DTO), or does it need a backend/API/DTO change? The two biggest: change-history `source` granularity (G-LC-022) and the 4 Account columns (G-ADM-001). Also the missing public detail page/route (G-PUB-020).
- **ui-ux-designer** — authority on the prototype's intent; consulted by product-analyst; owns the per-page fix specs (exact labels/widths/structure to restore).
- **spec-writer** — records the confirmed correct UI + any adjudicated deviations into the feature/test specs so this doesn't regress.
- **test-designer** → **tdd-implementation** — pin + fix, one teammate per page-group (disjoint files) to avoid edit conflicts.

## Phases (team lead coordinates via shared task list + mailbox)
1. **Adjudicate** — product-analyst + system-architect + ui-ux-designer converge the inventory into: (a) confirmed FE-only bugs (safe to fix), (b) confirmed deviations (leave, record why), (c) backend-dependent gaps (FE-fixable-now vs. needs-backend-change). Output: an updated inventory with a final disposition per gap.
2. **GATE** — team lead brings the adjudicated inventory to the human for sign-off **before any code changes**. Especially: G-PUB-020 (add a public detail page?), G-ADM-001 (add 4 account columns → backend work?), SYS-1 (toast system?), G-DOC-210 (使用部門 0 vs ≥1, conflicts with F014).
3. **Fix** — test-designer → tdd-implementation, one teammate per page-group (Public/Shell, Lifecycle/History, Documents, Admin-data), disjoint files, via git worktrees where useful. Backend-dependent gaps split: FE-fixable-now first; needs-backend items batched for a follow-on.
4. **Verify** — full `npx jest` / `npx vitest run` / `tsc` green; a browser smoke of the fixed pages; graduate.

## Provenance
Inventory built 2026-07-24 from a 4-way subagent audit (this session ran subagents because agent-teams was disabled; the flag is now on for the team run). The project tracker is `docs/specs/feature-status.md` (features at ✅27 🟡7 ⬜4 — this alignment work is UI-fidelity debt on already-✅ features, not new features).
