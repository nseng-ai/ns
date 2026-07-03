# ji core cutover

## Thesis

Execute the single atomic landing window of the sdl→ji rename: `sdl` bin → `ji`,
`.sdl/` → `.ji/`, `/sdl:*` → `/ji:*`, XDG `*/sdl/` → `*/ji/`, kernel/tooling paths, and
the `cross-harness-parity` table — everything the parent Objective
(`rename-sdl-to-ji`) calls the "core cutover in one landing window" roadmap row. This
Objective is that row, carved out for dedicated tracking; the parent row delegates here.

**The landing has executed and landed on trunk.** The window ran 2026-07-03 on branch
`ji-cutover/landing` and reached master as the squash commit `d6184e4c4` (2212 files:
the B1 mv bracket, all engine content edits, fix rounds, parity-table update, and
landing evidence in one commit). All roadmap rows are complete; what remains is formal
closure and the parent-row handback recorded at close.

The execution vehicle was a **Claude dynamic workflow** (the Workflow orchestration
tool): a scripted fan-out of disjoint concurrent edit agents over the inventoried
surface, followed by an adversarial verify pass and repo validation. The sweep was wide
(~705 `.sdl` literals, ~154 skill instruction lines, dozens of paired test files at
planning time) but mechanical once the open design questions were answered;
orchestration existed to make the one-window atomicity requirement tractable and
verified, not to add ceremony.

The complete site-by-site evidence base is
`.ji/objectives/rename-sdl-to-ji/cutover-inventory.md` (compiled 2026-07-02): the
PRE / ATOMIC / POST ordering, the eight hardest atomicity points, and the four design
questions (Q1–Q4) that gated the edit list.

## Scope

All delivered; the roadmap carries the evidence.

- **Resolve Q1–Q4** from the cutover inventory before authoring the workflow: the
  package.json `"sdl"` manifest key, the `sdl.toml` filename, the live legacy-fallback
  prose/assertions, and the small-fry brand literals.
- **Pre-landing coordination:** correct operative spec text in
  `ship-objectives-to-customers` (unbuilt `sdl init` would scaffold the old namespace
  into customer repos) and `skill-management-subsystem` (designed a `sdl skills`
  surface) so no new sdl-named surface got built pre-cutover.
- **Author the cutover workflow script:** partition the ATOMIC list into disjoint
  concurrent edit agents (no two agents touch the same file), an adversarial verify
  stage against the silent-failure traps, and a structured report. The in-repo
  `refactor-swarm-workflow` engine was reused unmodified.
- **Execute the landing** in one window on a dedicated branch: `git mv .sdl .ji`, the
  pnpm workspace glob quartet, bin key, all production/test/skill/doc literals per the
  ATOMIC list, `pnpm install` to regenerate lockfile and shims, and the
  `cross-harness-parity` parity-table update in the same landing.
- **Inventory drift re-check** at the landing window (the inventory was a 2026-07-02
  snapshot; other branches landed in between).

## Non-Goals

- No compatibility codepaths of any kind (inherited hard-cutover stance from the
  parent and ADR 0024).
- The manual machine migration (XDG `mv`s, worktree slots, checkout path) — parent row.
- The vocabulary sweep (CONTEXT/AGENTS/glossary) and package scope sweep
  (`@sdl/*` → `@ji/*`, `sdl-flow`, `sdlcc` → `jicc`) — parent rows; this Objective only
  touched prose whose staleness would be operative breakage (skills instructing
  commands, operative docs enumerated in the ATOMIC list).
- The GitHub repo rename and `@ji` npm org creation — parent rows / owner actions.
- No scrubbing of historical records (archived Objectives, updates, ADR history).
- No generalization of the cutover workflow into a platform capability (see Parked).
- Post-landing stragglers: in-flight branches that land old-namespace paths after the
  window are the parent's accepted risk, fixed by hand under the parent — not a defect
  of this window.

## Completion Criteria

- `ji …` is the only invocation surface; `.ji/` is the repo state root; `/ji:*` is the
  Pi namespace; XDG paths use the `ji` namespace — all landed in one window with no
  compat codepath introduced.
- `just` passes; `ji objective list` and `ji objective exec load-orientations` work
  post-cutover.
- The `cross-harness-parity` parity table is updated in the same landing.
- Q1–Q4 are answered and the answers recorded (here and reflected in the inventory).
- Every ATOMIC item in `cutover-inventory.md` is addressed or explicitly re-bucketed
  with a reason.
- The parent `rename-sdl-to-ji` cutover row is marked complete with evidence when this
  Objective closes.

Status at trunk rebaseline (2026-07-03, master `5668ac563`): every criterion except
the final parent-row handback (which happens at close) is verified against trunk —
the `"ji"` bin key and kernel manifest key, `.ji/` root, `ji.toml`,
`.pi/extensions/ji.ts`, zero `/sdl:` rows in the parity table (rows 38/51 renamed
in-window), and the `ji --help` / `ji objective list` /
`ji objective exec load-orientations` smoke surface all check out live. The Objective
is closure-ready; closing belongs to `objective-close`.

## Assumptions and Risks

Landed-state disposition of the pre-landing assumptions and risks:

- The inventory-completeness assumption **held with known gaps**: the real landing
  surfaced five plan-gap brand machine literals every generator pattern missed (git
  backup-ref namespace, PR-body token family, `sdl.pi-agent.v1` schema string,
  rc-file shell-integration sentinels, one changeset ownership race) — all renamed in
  fix round 1; two carry machine-migration consequences now recorded in the parent's
  `cutover-inventory.md` notes.
- The consumer-population assumption (exactly this repo plus the owner's machines,
  inherited from the parent) still stands and kept the hard cutover safe; the manual
  machine migration it implies remains a parent row.
- The fan-out disjointness assumption held: ~183 edit/verify agents across 3 chunks,
  0 failures; an interrupted chunk resumed via `Workflow resumeFromRunId` without
  double-editing.
- The split-landing and pnpm-quartet risks did not materialize: `just` gate green at
  the window (3994/3994 tests, matching the pre-mv baseline), both scope-untouched
  baselines matched exactly (949 `@sdl/` files, 158 src-dir survivor lines — zero
  over-renaming).
- The shallow-stack assumption was **waived, not held**: the owner waived the
  land-to-trunk precondition and the same-day §A re-run (runbook §C); the landing
  stacked on `update-objective-runner-drift` and reached master via Graphite squash,
  so the branch-local SHAs quoted in landing-time evidence (`ff190fa70`, the engine
  commit) are superseded by the master squash `d6184e4c4`.
- **Live residual risk (parent-owned):** the accepted in-flight-branch risk has
  materialized once post-landing — `.sdl/objectives/objective-edges/` is tracked on
  master (9 files, no `.ji/objectives/objective-edges/` counterpart), so that record
  is invisible to `ji objective list`. A straggler fix under the parent, not a defect
  of this window.

## Open Questions

None remain open. Q1–Q4 were resolved by the owner on 2026-07-02: **everything renames
to ji** — no sdl-brand literal survives the rename anywhere. Recorded per question
below; the answers are also reflected in
`.ji/objectives/rename-sdl-to-ji/cutover-inventory.md`.

- **Q1 — resolved:** the package.json `"sdl": {group, commands, tier, subpackages}`
  manifest key renames to `"ji"` (including `sdl.tier` fields).
  `kernel/src/extensions/discovery.ts`, every `.ji/extensions/*/package.json`, the
  areg/style-guard readers, and the topology-report script all agree in one ATOMIC
  commit. (Verified live on trunk: the kernel manifest schema and extension manifests
  use `"ji"`.)
- **Q2 — resolved:** `sdl.toml` renames to `ji.toml`. It is brand-named; areg staying
  un-renamed does not exempt its config filename. The areg/roaster readers updated in
  the same landing. (Verified: `ji.toml` exists, `sdl.toml` gone.)
- **Q3 — resolved:** rewrite the live "no legacy `~/.sdl/enriched-plan` fallback"
  strings to `~/.ji/…` — keep the no-fallback sentence, pointed at the ji path
  (production text, the three test assertions, and the docs sites the inventory
  enumerates).
- **Q4 — resolved:** all small-fry brand literals become ji: the aretro tmpdir
  segment, the internal event key (`"ji:pi-extension-command:finished"`), and the
  `.pi/extensions/sdl.ts` → `.pi/extensions/ji.ts` filename (verified live). The
  `src/sdl/` source-layout convention also renames to `src/ji/`, executed in the
  parent's package-scope sweep row (coupled to package renames, not this window).
- **Workflow script placement — resolved (2026-07-02):** the generic
  `.claude/workflows/refactor-swarm-workflow.js` engine is reused unmodified; all
  cutover-specific content is a checked-in consumer instance at
  `.ji/objectives/ji-core-cutover/cutover/` (plan artifact, pipeline scripts,
  runbook) with an explicit no-promotion note per
  `docs/conventions/platform-and-consumer.md` — it archives with this Objective;
  pattern-promotion remains the Parked row. See update
  `2026-07-02-cutover-pipeline-authored.md`.

## Closure

Closed as completed on 2026-07-03. The atomic core cutover landed on
`ji-cutover/landing`: the repo state root moved to `.ji/`, `ji` became the only
CLI invocation surface for the cutover scope, Pi command names moved to `/ji:*`, XDG
references moved to the `ji` namespace, the parity table updated in-window, and no
compatibility codepath was introduced.

Key evidence is recorded in `updates/2026-07-03-real-landing-executed.md`: B1's mv
bracket (`ff190fa70`), the three-engine-chunk landing run (~183 agents, 0 failures),
two fix rounds, `just` green with 3994/3994 tests, all §B5 smoke tests passing
(`ji --help`, old shim gone, `ji objective list`, and
`ji objective exec load-orientations`), exact scope-untouched baselines, and landing
artifacts under `cutover/landing/`.

The parent `rename-sdl-to-ji` Objective now owns the remaining rename work: manual
machine migration, vocabulary sweep, package scope sweep and npm target correction, and
the final GitHub repo rename. The parked workflow-generalization idea remains only a
future promotion candidate if a reusable platform capability is later desired.
