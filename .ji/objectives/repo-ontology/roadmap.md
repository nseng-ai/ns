# Roadmap

## Work

Standing operating direction

- [~] Keep `CONTEXT.md`, `CONTEXT-MAP.md`, and `grill-with-docs`-maintained docs up to date.
  - Guidance: Re-derive the next slice from current source/docs, existing context coverage, and unresolved map ambiguities. The repo is all-TypeScript under `ts/packages/` with `@sdl/*` names (unscoped `sdlcc`, `sdl-flow`, and `sdl-sdk` excepted); do not author against deleted Python `packages/*` paths or old `asdl-*` names, and do not treat old phase numbers as a hidden queue. If adjacent work reveals obvious drift, fix it inline when it is source-backed, small/local, and decision-free; record/report it instead when it is broad, ambiguous, or would require a terminology/product decision.
  - Policy: recommend exactly one action route. Implement only from a concrete, source-backed plan; if the plan is not yet concrete, ask a yes/no confirmation question so the user can type `yes` to start a `grill-me` planning/readback session. Use confirmed steered `grill-me` planning for manual terminology, context-surface, ambiguity, or scope decisions, without presenting implementation as an option for manual slices; use `grill-with-docs` instead when the confirmed session should update documentation inline.
  - Evidence: changed context/map/docs files cite current source evidence, relevant Markdown formatting passes, and meaningful Objective tracking records durable decisions.

Present contexts (landed)

- [x] Root `CONTEXT.md` — Objective-system vocabulary plus the repo-wide Architecture Boundaries (Gateway / Domain logic) section.
- [x] `CONTEXT-MAP.md` Present section rebaselined to the all-TypeScript, all-`@sdl/*` world: it lists all ten landed package contexts. (Its Inventory Baseline count and Planned section still lag — see the map catch-up row.)
- [x] `ts/packages/handoff/CONTEXT.md` — `@sdl/handoff` directed handoff artifact vocabulary over Branch Memory storage.
- [x] `ts/packages/infra/brmem/CONTEXT.md` — `@sdl/brmem` Branch Memory primitive vocabulary.
- [x] `ts/packages/ccc/CONTEXT.md` — `@sdl/ccc` orchestration-layer vocabulary (accepted from an adjacent Objective).
- [x] `ts/packages/hosts/pi/CONTEXT.md` — `@sdl/pi` unified Pi package vocabulary (absorbed the former `pi-extension-runtime`, `pi-extensions`, and `pi-command-surfaces` packages).
- [x] `ts/packages/infra/graphite/CONTEXT.md` — `@sdl/graphite` reusable Graphite support vocabulary (accepted from an adjacent Objective).
- [x] `ts/packages/sdl/CONTEXT.md` — `@sdl/sdl` Source Development Lifecycle CLI vocabulary. (The public SDL extension API is now the standalone `sdl-sdk` package, not a `@sdl/sdl/sdk` subpath; the map's `@sdl/sdl` entry already cites `sdl-sdk`.)
- [x] `ts/packages/roaster/CONTEXT.md` — `@sdl/roaster` PR-diff findings vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/plans/CONTEXT.md` — `@sdl/plans` saved-plan vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/branch-context/CONTEXT.md` — `@sdl/branch-context` branch-context vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/capabilities/slot/CONTEXT.md` — `@sdl/slot` worktree slot vocabulary, including the `sdl slot` Command Face and `sdl slot gt` helpers (landed from an adjacent Objective).

Map catch-up — package inventory

- [~] Reconcile `CONTEXT-MAP.md`'s Inventory Baseline with the tree. The map was reconciled to **23** on `2026-06-26T105219Z`, but the tree has since grown to **24** (`git ls-files 'ts/packages/*/package.json' | wc -l` = 24) with a third unscoped name (`sdl-sdk`), so the map's Inventory Baseline is stale again (still says 23 / two unscoped exceptions). Remaining: re-derive the count to **24**, record the three unscoped exceptions (`sdlcc`, `sdl-flow`, `sdl-sdk`), and confirm the undecided-package list is owned by the "Undecided packages — record a map decision" row below; this row closes when both land.

Planned package contexts

These rows mirror the *Planned TypeScript package contexts* in `CONTEXT-MAP.md`. Each is a focused `grill-me`/`grill-with-docs` slice that authors `ts/packages/<pkg>/CONTEXT.md` from current source, then updates the map's Present section and the relevant relationship/ambiguity notes.

- [ ] `@sdl/areg` — agent-resource bootstrap and skill-workflow vocabulary: `areg init`, `areg check`, `update-skills`, `skillx`, target agents, managed instruction blocks, installed skill directories, lockfile source types, skill metadata/issues, transient skill fetch/cleanup, and external `gh` / `npx skills` boundaries.
- [ ] `@sdl/objective` — Objective CLI package vocabulary: Objective records/statuses, archive/unarchive, checked-in Markdown storage, hidden `exec` commands, and checkout-local list behavior. Reconcile against root `CONTEXT.md` without duplicating the Objective-system documentation.
- [ ] `@sdl/packagechk` — standalone package-name availability/claimability vocabulary: PyPI/npm checks, registry results, name normalization/validation, claim project specs, publish gateways, and parked Homebrew support. Keep explicitly standalone in map relationships.
- [ ] `@sdl/aretro` — deterministic branch-retrospective evidence vocabulary: `collect-evidence`, branch resolution sources, session query/source/warning DTOs, session summaries, aggregate metrics, `EvidenceItemDto`, and the boundary between evidence collection and `branch-retro` recommendation judgment.
- [ ] `@sdl/vibechk` — standalone agent-context evaluation vocabulary: baseline/treatment workdirs, plan source, runner adapter, run id, run bundle/store/status, git provenance, metrics, transcript, diff patch, result branch, run report, comparison report, and local-only publish boundary. Keep standalone; reconcile run/metric/evidence wording against `@sdl/aretro` and `@sdl/roaster`.

Undecided packages — record a map decision

- [ ] Record a deliberate context decision (planned / accepted-from-adjacent / out-of-scope with a revisit trigger) for each tracked package currently absent from the map's context sections (nine): `@sdl/core` (dir `ts/packages/infra/core`), `@sdl/clinkr` (now standalone at `ts/packages/infra/clinkr`), `@sdl/pr-address`, `@sdl/autobranch`, `@sdl/domain-primitives-transitional`, `@sdl/capability-kit` (dir `ts/packages/sdl-capability-kit`, formerly `@sdl/extension-kit`), the unscoped `sdlcc`, `sdl-flow` (dir `ts/packages/capabilities/flow`), and the unscoped `sdl-sdk` (dir `ts/packages/sdl-sdk`). The map's root context and Flagged Ambiguities already carry partial `@sdl/capability-kit` and `sdl-sdk` vocabulary via the `sdl-extension-architecture` Objective, but neither has its own recorded decision. Do not leave silent absence.

Refresh and finalize

- [ ] Final `/CONTEXT-MAP.md` readback: confirm an unfamiliar contributor can start at the map, navigate to each present context, and explain key terms and `Avoid:` aliases without opening source. Finalize the relationship list and resolve the flagged ambiguities to concise one-line entries. Decide the deferred `@sdl/core` H2-anchor linking question and the ADR-corpus map-pointer question, and record the maintenance-cadence follow-up if it remains outside this Objective.

## Parked

- ADRs — write only if the `grill-with-docs` three-criteria bar fires during a session: hard to reverse, surprising without context, and a real trade-off. (`docs/adr/` holds 18 files spanning `0001`–`0016`, with `0012` and `0016` each used by two distinct ADRs; the map references individual ADRs inline but has no dedicated ADR index.)
- `sdl-initiatives` context — no tracked package exists in the current workspace; revisit only if the package is reintroduced with implementation.
- `sdl-reviewer` context — historical package identity replaced by `roaster`; do not recreate unless the package itself is deliberately reintroduced as a separate tracked package.
- Per-subpackage `CONTEXT.md` split for `@sdl/core` — `clinkr` has already graduated to the standalone `@sdl/clinkr` package, so it is now tracked as its own undecided package rather than a `@sdl/core` H2 section; revisit a `@sdl/core` split only if another remaining `@sdl/core` subpackage graduates.
- Periodic re-grilling cadence — out of scope for this Objective; address as a separate process question after the sweep closes.
