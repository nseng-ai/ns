# Roadmap

## Work

Standing operating direction

- [~] Keep `CONTEXT.md`, `CONTEXT-MAP.md`, and `grill-with-docs`-maintained docs up to date.
  - Guidance: Re-derive the next slice from current source/docs, existing context coverage, and unresolved map ambiguities. The repo is all-TypeScript under `ts/packages/` with `@sdl/*` names (unscoped `sdlcc` and `sdl-flow` excepted); do not author against deleted Python `packages/*` paths or old `asdl-*` names, and do not treat old phase numbers as a hidden queue.
  - Policy: recommend exactly one action route. Implement only from a concrete, source-backed plan; if the plan is not yet concrete, ask a yes/no confirmation question so the user can type `yes` to start a `grill-me` planning/readback session. Use confirmed steered `grill-me` planning for manual terminology, context-surface, ambiguity, or scope decisions, without presenting implementation as an option for manual slices; use `grill-with-docs` instead when the confirmed session should update documentation inline.
  - Evidence: changed context/map/docs files cite current source evidence, relevant Markdown formatting passes, and meaningful Objective tracking records durable decisions.

Present contexts (landed)

- [x] Root `CONTEXT.md` — Objective-system vocabulary plus the repo-wide Architecture Boundaries (Gateway / Domain logic) section.
- [x] `CONTEXT-MAP.md` Present section rebaselined to the all-TypeScript, all-`@sdl/*` world: it lists all ten landed package contexts. (Its Inventory Baseline count and Planned section still lag — see the map catch-up row.)
- [x] `ts/packages/handoff/CONTEXT.md` — `@sdl/handoff` directed handoff artifact vocabulary over Branch Memory storage.
- [x] `ts/packages/brmem/CONTEXT.md` — `@sdl/brmem` Branch Memory primitive vocabulary.
- [x] `ts/packages/ccc/CONTEXT.md` — `@sdl/ccc` orchestration-layer vocabulary (accepted from an adjacent Objective).
- [x] `ts/packages/pi/CONTEXT.md` — `@sdl/pi` unified Pi package vocabulary (absorbed the former `pi-extension-runtime`, `pi-extensions`, and `pi-command-surfaces` packages).
- [x] `ts/packages/graphite/CONTEXT.md` — `@sdl/graphite` reusable Graphite support vocabulary (accepted from an adjacent Objective).
- [x] `ts/packages/sdl/CONTEXT.md` — `@sdl/sdl` Source Development Lifecycle CLI vocabulary, including `@sdl/sdl/sdk` as the public SDL extension API.
- [x] `ts/packages/roaster/CONTEXT.md` — `@sdl/roaster` PR-diff findings vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/plans/CONTEXT.md` — `@sdl/plans` saved-plan vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/branch-context/CONTEXT.md` — `@sdl/branch-context` branch-context vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/slot/CONTEXT.md` — `@sdl/slot` worktree slot vocabulary, including the `sdl slot` Command Face and `sdl slot gt` helpers (landed from an adjacent Objective).

Map catch-up — package inventory

- [ ] Reconcile `CONTEXT-MAP.md`'s Inventory Baseline with the tree: the baseline says "19 repo-local packages" while 23 `ts/packages/*` package.json files are tracked. Re-derive the exact count, refresh the Inventory Baseline's present-context list, and confirm the undecided-package list before any final readback.

Planned package contexts

These rows mirror the *Planned TypeScript package contexts* in `CONTEXT-MAP.md`. Each is a focused `grill-me`/`grill-with-docs` slice that authors `ts/packages/<pkg>/CONTEXT.md` from current source, then updates the map's Present section and the relevant relationship/ambiguity notes.

- [ ] `@sdl/areg` — agent-resource bootstrap and skill-workflow vocabulary: `areg init`, `areg check`, `update-skills`, `skillx`, target agents, managed instruction blocks, installed skill directories, lockfile source types, skill metadata/issues, transient skill fetch/cleanup, and external `gh` / `npx skills` boundaries.
- [ ] `@sdl/objective` — Objective CLI package vocabulary: Objective records/statuses, archive/unarchive, checked-in Markdown storage, hidden `exec` commands, and checkout-local list behavior. Reconcile against root `CONTEXT.md` without duplicating the Objective-system documentation.
- [ ] `@sdl/packagechk` — standalone package-name availability/claimability vocabulary: PyPI/npm checks, registry results, name normalization/validation, claim project specs, publish gateways, and parked Homebrew support. Keep explicitly standalone in map relationships.
- [ ] `@sdl/aretro` — deterministic branch-retrospective evidence vocabulary: `collect-evidence`, branch resolution sources, session query/source/warning DTOs, session summaries, aggregate metrics, `EvidenceItemDto`, and the boundary between evidence collection and `branch-retro` recommendation judgment.
- [ ] `@sdl/vibechk` — standalone agent-context evaluation vocabulary: baseline/treatment workdirs, plan source, runner adapter, run id, run bundle/store/status, git provenance, metrics, transcript, diff patch, result branch, run report, comparison report, and local-only publish boundary. Keep standalone; reconcile run/metric/evidence wording against `@sdl/aretro` and `@sdl/roaster`.

Undecided packages — record a map decision

- [ ] Record a deliberate context decision (planned / accepted-from-adjacent / out-of-scope with a revisit trigger) for each tracked package currently absent from the map's context sections. Previously-undecided survivors: `@sdl/core` (dir `ts/packages/sdl-core`), `@sdl/clinkr`, `@sdl/pr-address`, and the unscoped `sdlcc`. Newly-added packages also needing a first decision: `@sdl/autobranch`, `@sdl/domain-primitives-transitional`, `@sdl/extension-kit`, and the unscoped `sdl-flow` (dir `ts/packages/extensions/flow`). Do not leave silent absence.

Refresh and finalize

- [ ] Final `/CONTEXT-MAP.md` readback: confirm an unfamiliar contributor can start at the map, navigate to each present context, and explain key terms and `Avoid:` aliases without opening source. Finalize the relationship list and resolve the flagged ambiguities to concise one-line entries. Decide the deferred `@sdl/core` H2-anchor linking question and the ADR-corpus map-pointer question, and record the maintenance-cadence follow-up if it remains outside this Objective.

## Parked

- ADRs — write only if the `grill-with-docs` three-criteria bar fires during a session: hard to reverse, surprising without context, and a real trade-off. (`docs/adr/0001–0011` exist; the map does not yet index them.)
- `sdl-initiatives` context — no tracked package exists in the current workspace; revisit only if the package is reintroduced with implementation.
- `sdl-reviewer` context — historical package identity replaced by `roaster`; do not recreate unless the package itself is deliberately reintroduced as a separate tracked package.
- Per-subpackage `CONTEXT.md` split for `@sdl/core` — revisit only when `clinkr` or another subpackage graduates to a standalone package.
- Periodic re-grilling cadence — out of scope for this Objective; address as a separate process question after the sweep closes.
