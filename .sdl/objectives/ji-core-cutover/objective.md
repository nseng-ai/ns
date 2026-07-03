# ji core cutover

## Thesis

Execute the single atomic landing window of the sdl→ji rename: `sdl` bin → `ji`,
`.sdl/` → `.ji/`, `/sdl:*` → `/ji:*`, XDG `*/sdl/` → `*/ji/`, kernel/tooling paths, and
the `cross-harness-parity` table — everything the parent Objective
(`rename-sdl-to-ji`) calls the "core cutover in one landing window" roadmap row. This
Objective is that row, carved out for dedicated tracking; the parent row delegates here.

The execution vehicle is a **Claude dynamic workflow** (the Workflow orchestration
tool): a scripted fan-out of disjoint concurrent edit agents over the inventoried
surface, followed by an adversarial verify pass and repo validation. The sweep is wide
(~705 `.sdl` literals, ~154 skill instruction lines, dozens of paired test files) but
mechanical once the open design questions are answered; orchestration exists to make
the one-window atomicity requirement tractable and verified, not to add ceremony.

The complete site-by-site evidence base is
`.sdl/objectives/rename-sdl-to-ji/cutover-inventory.md` (compiled 2026-07-02): the
PRE / ATOMIC / POST ordering, the eight hardest atomicity points, and the four open
design questions (Q1–Q4) that gate the edit list.

## Scope

- **Resolve Q1–Q4** from the cutover inventory before authoring the workflow: the
  package.json `"sdl"` manifest key, the `sdl.toml` filename, the live legacy-fallback
  prose/assertions, and the small-fry brand literals.
- **Pre-landing coordination:** correct operative spec text in
  `ship-objectives-to-customers` (unbuilt `sdl init` would scaffold the old namespace
  into customer repos) and `skill-management-subsystem` (designs a `sdl skills`
  surface) so no new sdl-named surface is built pre-cutover.
- **Author the cutover workflow script:** partition the ATOMIC list into disjoint
  concurrent edit agents (no two agents touch the same file), an adversarial verify
  stage against the silent-failure traps, and a structured report. The in-repo
  `refactor-swarm-workflow` skill is the candidate starting pattern.
- **Execute the landing** in one window on a dedicated branch: `git mv .sdl .ji`, the
  pnpm workspace glob quartet, bin key, all production/test/skill/doc literals per the
  ATOMIC list, `pnpm install` to regenerate lockfile and shims, and the
  `cross-harness-parity` parity-table update in the same landing.
- **Inventory drift re-check** at the landing window (the inventory is a 2026-07-02
  snapshot; other branches land in between).

## Non-Goals

- No compatibility codepaths of any kind (inherited hard-cutover stance from the
  parent and ADR 0024).
- The manual machine migration (XDG `mv`s, worktree slots, checkout path) — parent row.
- The vocabulary sweep (CONTEXT/AGENTS/glossary) and package scope sweep
  (`@sdl/*` → `@ji/*`, `sdl-flow`, `sdlcc` → `jicc`) — parent rows; this Objective only
  touches prose whose staleness would be operative breakage (skills instructing
  commands, operative docs enumerated in the ATOMIC list).
- The GitHub repo rename and `@ji` npm org creation — parent rows / owner actions.
- No scrubbing of historical records (archived Objectives, updates, ADR history).
- No generalization of the cutover workflow into a platform capability (see Parked).

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

## Assumptions and Risks

Assumptions:

- `cutover-inventory.md` is a complete enumeration of the coupled surface as of
  2026-07-02; the drift re-check row exists because branches landing between now and
  the window can invalidate it.
- The ATOMIC edits are disjoint enough to fan out to concurrent agents once partitioned
  by file; the Workflow tool (with worktree isolation if needed) is a suitable engine.
- The consumer population is exactly this repo plus the owner's machines (inherited
  from the parent); the hard cutover stays safe.
- The decision-records stack (currently on `rename-sdl-to-ji`) lands to master before
  the window opens, so the cutover starts from a shallow Graphite stack.

Risks:

- **Split-landing silent failures** — the inventory's traps: kernel extension-discovery
  root, the `isManagedSlotPath()` regex, duplicate un-imported literals
  (`"sdl:flow:land"` ×2, PR-description prompt path ×2, objective-root constants in
  ccc), the style-guard path bucket. Mitigation: the ATOMIC list is the workflow's
  explicit work-list; the verify stage checks these sites by name.
- **Hard build breaker** — the pnpm workspace glob quartet
  (`ts/pnpm-workspace.yaml` / `ts/package.json` / `ts/tsconfig.json` / lockfile) must
  be internally consistent within the landing or `pnpm install`/`tsgo`/CI fail.
- **Concurrent-edit conflicts** — fan-out agents editing overlapping files would
  corrupt the landing; the workflow must partition strictly by file (or use worktree
  isolation and merge deliberately).
- **In-flight branches/slots** created pre-cutover hit rename-shaped conflicts on
  restack — accepted in the parent; fix stragglers by hand.
- **Inventory staleness** at the landing window — mitigated by the drift re-check row.

## Open Questions

Q1–Q4 were resolved by the owner on 2026-07-02: **everything renames to ji** — no
sdl-brand literal survives the rename anywhere. Recorded per question below; the
answers are also reflected in `rename-sdl-to-ji/cutover-inventory.md`.

- **Q1 — resolved:** the package.json `"sdl": {group, commands, tier, subpackages}`
  manifest key renames to `"ji"` (including `sdl.tier` fields).
  `kernel/src/extensions/discovery.ts`, every `.sdl/extensions/*/package.json`, the
  areg/style-guard readers, and the topology-report script all agree in one ATOMIC
  commit.
- **Q2 — resolved:** `sdl.toml` renames to `ji.toml`. It is brand-named; areg staying
  un-renamed does not exempt its config filename. The areg/roaster readers update in
  the same landing.
- **Q3 — resolved:** rewrite the live "no legacy `~/.sdl/enriched-plan` fallback"
  strings to `~/.ji/…` — keep the no-fallback sentence, pointed at the ji path
  (production text, the three test assertions, and the docs sites the inventory
  enumerates).
- **Q4 — resolved:** all small-fry brand literals become ji: the aretro tmpdir
  segment, the internal event key (`"ji:pi-extension-command:finished"`), and the
  `.pi/extensions/sdl.ts` → `.pi/extensions/ji.ts` filename. The `src/sdl/`
  source-layout convention also renames to `src/ji/`, executed in the parent's
  package-scope sweep row (it is coupled to package renames, not this window).
  Inventory ordering stands: the event key may trail POST if deferred.
- **Workflow script placement (still open):** session-authored one-shot vs checked
  into `.claude/workflows/`; if checked in, it is a consumer artifact and needs an
  explicit promotion-path note per `docs/platform-and-consumer.md`.
