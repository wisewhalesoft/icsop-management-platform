export const meta = {
  name: 'tdd-feature',
  description:
    'TDD a feature inside an Uncle-Bob constraint ring: test-generator builds the ring (blind to impl) -> tdd-implementation satisfies it (BE‖FE parallel) -> the machine enforces the full ring (unit+e2e+mutation+metrics) -> commit. Hard gates; loops back on failure.',
  whenToUse:
    'Non-trivial feature/story with a prototype. Pass args={feature:"F0xx", prototypes:["13"], scope:"..."}. For a one-file change, do it inline instead — this fans out subagents.',
  phases: [
    { title: 'P0 Build Ring', detail: 'test-generator authors constraints from prototype+spec, blind to impl' },
    { title: 'P1 Implement', detail: 'tdd-implementation BE‖FE code to green against the ring' },
    { title: 'P2 Enforce', detail: 'machine runs unit+e2e+mutation+metrics; no agent judges' },
    { title: 'P3 Commit', detail: 'git-smart-commit' },
  ],
};

// ── args ─────────────────────────────────────────────────────────────────────
const A = typeof args === 'string' ? { feature: args } : args ?? {};
const FEATURE = A.feature ?? '(unspecified — ask the user)';
const PROTOTYPES = Array.isArray(A.prototypes) ? A.prototypes.join(', ') : A.prototypes ?? '(from ui-ux-design-overview Feature→檔案對照表)';
const SCOPE = A.scope ?? '';
const MAX_ATTEMPTS = 3;

// ── structured contracts between phases ──────────────────────────────────────
const RING = {
  type: 'object',
  required: ['redConfirmed', 'files'],
  properties: {
    redConfirmed: { type: 'boolean', description: 'ring runs and FAILS red on current (unimplemented) code, for the right reason' },
    contractPath: { type: 'string', description: 'shared FE/BE contract authored (e.g. frontend/src/api/types.ts additions)' },
    files: { type: 'array', items: { type: 'string' } },
    fidelityCites: { type: 'array', items: { type: 'string' }, description: 'each fidelity assertion -> its authority prototype' },
    notes: { type: 'string' },
  },
};
const IMPL = {
  type: 'object',
  required: ['greenConfirmed', 'files'],
  properties: {
    greenConfirmed: { type: 'boolean', description: 'this side\'s unit/component tests pass + tsc clean' },
    files: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
};
const ENFORCE = {
  type: 'object',
  required: ['pass', 'unit', 'e2e', 'mutation', 'metrics'],
  properties: {
    pass: { type: 'boolean', description: 'ALL of the below are objectively true (command exit 0 + thresholds met)' },
    unit: { type: 'boolean' },
    e2e: { type: 'boolean' },
    mutation: { type: 'boolean' },
    metrics: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' }, description: 'concrete failing assertions / commands / thresholds' },
    evidence: { type: 'string', description: 'command output tails proving the verdict (this is machine output, not judgment)' },
  },
};

// ── P0 — build the ring (BLIND to implementation) ────────────────────────────
phase('P0 Build Ring');
const ring = await agent(
  `You are building the Uncle-Bob CONSTRAINT RING for feature ${FEATURE}. ${SCOPE}
Authority: prototype(s) ${PROTOTYPES} + the feature spec. **You are BLIND to the implementation — do not read production code to decide assertions.**
Author, and confirm each FAILS RED for the right reason on the current codebase:
  1. Acceptance/fidelity: Playwright specs in e2e/tests/ (exact column/card/field/copy/state/role sets; cite each to its prototype; assert the ADJUDICATED design per docs/specs/prototype-alignment, not raw prototype where a deferral was agreed).
  2. Unit/component red skeletons (backend *.spec.ts, frontend *.test.tsx).
  3. Mutation config (Stryker) + mutation-score threshold for the touched business-logic module.
  4. Metric gates (coverage / complexity / no dependency cycles / module size) as scripts, not prose.
Also author the shared FE/BE contract (types.ts additions / endpoint shape) so BE and FE agree BEFORE coding.
Report the manifest. Do NOT write production code.`,
  { agentType: 'test-generator', schema: RING, phase: 'P0 Build Ring', label: `ring:${FEATURE}` },
);

// GATE: the ring must exist and be red. A ring that passes on unimplemented code asserts nothing.
if (!ring) return { status: 'blocked', where: 'P0', reason: 'test-generator returned no result' };
if (!ring.redConfirmed) {
  return { status: 'blocked', where: 'P0-gate', reason: 'ring did not fail red on unimplemented code — it asserts nothing meaningful', ring };
}
log(`P0 ring built: ${ring.files.length} files, contract=${ring.contractPath ?? 'n/a'}`);

// ── P1 ⇄ P2 — implement to green, then the MACHINE enforces the full ring ─────
let enforce = null;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  phase('P1 Implement');
  const priorFailures = enforce?.failures?.length
    ? `\nPRIOR RING FAILURES to fix this round:\n- ${enforce.failures.join('\n- ')}`
    : '';
  const [be, fe] = await parallel([
    () =>
      agent(
        `Implement the BACKEND for ${FEATURE} to satisfy the ring. Source of truth = the failing tests + the shared contract (${ring.contractPath ?? 'types.ts'}). Make backend unit tests green + tsc clean. Do NOT weaken any test.${priorFailures}`,
        { agentType: 'tdd-implementation', schema: IMPL, phase: 'P1 Implement', label: `be:${FEATURE}` },
      ),
    () =>
      agent(
        `Implement the FRONTEND for ${FEATURE} to satisfy the ring. Source of truth = the failing tests + the shared contract (${ring.contractPath ?? 'types.ts'}) + prototype ${PROTOTYPES}. Make component tests green + tsc clean. Do NOT weaken any test.${priorFailures}`,
        { agentType: 'tdd-implementation', schema: IMPL, phase: 'P1 Implement', label: `fe:${FEATURE}` },
      ),
  ]);
  log(`P1 attempt ${attempt}: be=${be?.greenConfirmed ? 'green' : 'partial'} fe=${fe?.greenConfirmed ? 'green' : 'partial'}`);

  // P2 — ENFORCE: an agent RUNS the ring and reports OBJECTIVE machine output. It does not judge.
  phase('P2 Enforce');
  enforce = await agent(
    `Run the FULL constraint ring for ${FEATURE} and report OBJECTIVE machine results — you are a runner, NOT a judge:
  - backend: npm --prefix backend test  &&  npx --prefix backend tsc --noEmit
  - frontend: npm --prefix frontend test  &&  npx --prefix frontend tsc --noEmit
  - e2e ring: bring the stack up (docker compose up -d) and run e2e (needs E2E_* creds); a constraint that CANNOT run counts as FAIL, never as skip/pass.
  - mutation: run Stryker on the touched module; metrics: coverage/complexity/dependency-cycle/size gates.
Set pass=true ONLY if every command exits 0 and every threshold is met. List concrete failures. Include command-output tails as evidence. Never weaken a test to make it pass.`,
    { schema: ENFORCE, phase: 'P2 Enforce', label: `enforce:${FEATURE}#${attempt}` },
  );

  if (enforce?.pass) break;
  log(`P2 attempt ${attempt} FAILED: ${(enforce?.failures ?? ['unknown']).join('; ')}`);
}

// GATE: the machine verdict is final. No agent overrides it.
if (!enforce?.pass) {
  return { status: 'blocked', where: 'P2-gate', reason: `ring not green after ${MAX_ATTEMPTS} attempts`, enforce };
}

// ── P3 — commit ──────────────────────────────────────────────────────────────
phase('P3 Commit');
const commit = await agent(
  `The ring is green for ${FEATURE}. Commit the work with git-smart-commit conventions (branch off main if on it; conventional commits split logically). Report the commit hashes.`,
  { phase: 'P3 Commit', label: `commit:${FEATURE}` },
);

return { status: 'done', feature: FEATURE, ring, enforce, commit };
