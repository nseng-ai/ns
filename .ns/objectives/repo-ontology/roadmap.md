# Roadmap

## Work

Standing operating direction

- [~] Keep `CONTEXT.md`, `CONTEXT-MAP.md`, and `grill-with-docs`-maintained docs up to date.
  - Guidance: Re-derive the next slice from current source/docs, existing context coverage, and unresolved map ambiguities. The repo is all-TypeScript under `ts/packages/` with `@ji/*` names (unscoped `jicc` and local-space `@internal/pi-tools` excepted), organized as role directories with container packages; do not author against deleted Python `packages/*` paths, old `asdl-*`/`@sdl/*` names, or retired standalone identities (`sdl-sdk`, `sdl-land`, `sdlcc`, `pr-address`, `autobranch`, `domain-primitives-transitional`), and do not treat old phase numbers as a hidden queue. If adjacent work reveals obvious drift, fix it inline when it is source-backed, small/local, and decision-free; record/report it instead when it is broad, ambiguous, or would require a terminology/product decision.
  - Policy: recommend exactly one action route. Implement only from a concrete, source-backed plan; if the plan is not yet concrete, ask a yes/no confirmation question so the user can type `yes` to start a `grill-me` planning/readback session. Use confirmed steered `grill-me` planning for manual terminology, context-surface, ambiguity, or scope decisions, without presenting implementation as an option for manual slices; use `grill-with-docs` instead when the confirmed session should update documentation inline.
  - Evidence: changed context/map/docs files cite current source evidence, relevant Markdown formatting passes, and meaningful Objective tracking records durable decisions.

Present contexts (landed)

- [x] Root `CONTEXT.md` — Objective-system vocabulary, the repo-wide Architecture Boundaries (Gateway / Domain logic) section, the Extension Layering cluster, and package-topology terms.
- [x] `CONTEXT-MAP.md` rebaselined by adjacent work to the `@ji` container-package world: Inventory Baseline says 21 packages and the Present section carries all landed contexts including kernel, objective, and flow. (Fresh drift remains — see the map catch-up row.)
- [x] `ts/packages/capabilities/handoff/CONTEXT.md` — `@ji/handoff` directed handoff artifact vocabulary over Branch Memory storage.
- [x] `ts/packages/infra/brmem/CONTEXT.md` — `@ji/brmem` Branch Memory primitive vocabulary.
- [x] `ts/packages/capabilities/ccc/CONTEXT.md` — `@ji/ccc` orchestration-layer vocabulary (accepted from an adjacent Objective).
- [x] `ts/packages/hosts/pi/CONTEXT.md` — `@ji/pi` unified Pi host vocabulary (the former separate `pi-extension-runtime`/`pi-extensions`/`pi-command-surfaces` slots stay retired).
- [x] `ts/packages/capability-kit/src/graphite/CONTEXT.md` — `@ji/capability-kit/graphite` reusable Graphite support vocabulary (formerly the standalone `@sdl/graphite` package context; the package was absorbed into `@ji/capability-kit`).
- [x] `ts/packages/kernel/CONTEXT.md` — `@ji/kernel` CLI/kernel vocabulary (formerly the `@sdl/sdl` context), including `@ji/kernel/sdk` as the public extension-author SDK; the standalone `sdl-sdk` package was re-absorbed as this subpath.
- [x] `ts/packages/capabilities/roaster/CONTEXT.md` — `@ji/roaster` PR-diff findings vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/capabilities/plans/CONTEXT.md` — `@ji/plans` saved-plan vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/capabilities/branch-context/CONTEXT.md` — `@ji/branch-context` branch-context vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/capabilities/slot/CONTEXT.md` — `@ji/slot` worktree slot vocabulary, including the `ji slot` command surface and `ji slot gt` helpers (landed from an adjacent Objective).
- [x] `ts/packages/capabilities/objective/CONTEXT.md` — `@ji/objective` Objective CLI/capability vocabulary (was a Planned row here; landed from an adjacent Objective).
- [x] `ts/packages/capabilities/flow/CONTEXT.md` — `@ji/flow` Flow lifecycle vocabulary (was an undecided package here; landed from an adjacent Objective).

Map catch-up — post-rename/restructure drift

- [ ] Reconcile `CONTEXT-MAP.md` with the tree after the `ji` rename and container-package restructure. Decision-free fixes: the Inventory Baseline's naming-exception claim (`@ji/flow` is scoped; the only unscoped name is `jicc`, plus local-space `@internal/pi-tools`), the stale Present link paths for `@ji/roaster` and `@ji/branch-context` (both now under `ts/packages/capabilities/`), and the present-context count (12 tracked package context files; `git ls-files '*CONTEXT.md'` = 13 including root). Decision-bearing items for a confirmed session: the Present `sdl-land` entry and `ts/packages/capabilities/land/CONTEXT.md` reference (file and package gone — land is now a `@ji/flow` subpackage with `./land/api` / `./land/testing` exports; relationship rows still describe standalone `sdl-land`), and the Planned `@ji/flow-pi` entry (no such tracked package — Flow Pi presentation is the `@ji/flow` `pi` subpackage).

Planned package contexts

These rows mirror the *Planned TypeScript package contexts* in `CONTEXT-MAP.md`. Each is a focused `grill-me`/`grill-with-docs` slice that authors the package's `CONTEXT.md` from current source, then updates the map's Present section and the relevant relationship/ambiguity notes.

- [ ] `@ji/areg` (`ts/packages/tools/areg`) — agent-resource bootstrap and skill-workflow vocabulary: `areg init`, `areg check`, `update-skills`, `skillx`, target agents, managed instruction blocks, installed skill directories, lockfile source types, skill metadata/issues, transient skill fetch/cleanup, and external `gh` / `npx skills` boundaries.
- [ ] `@ji/packagechk` (`ts/packages/tools/packagechk`) — standalone package-name availability/claimability vocabulary: PyPI/npm checks, registry results, name normalization/validation, claim project specs, publish gateways, and parked Homebrew support. Keep explicitly standalone in map relationships.
- [ ] `@ji/aretro` (`ts/packages/capabilities/aretro`) — deterministic branch-retrospective evidence vocabulary: `collect-evidence`, branch resolution sources, session query/source/warning DTOs, session summaries, aggregate metrics, `EvidenceItemDto`, and the boundary between evidence collection and `branch-retro` recommendation judgment.
- [ ] `@ji/vibechk` (`ts/packages/tools/vibechk`) — standalone agent-context evaluation vocabulary: baseline/treatment workdirs, plan source, runner adapter, run id, run bundle/store/status, git provenance, metrics, transcript, diff patch, result branch, run report, comparison report, and local-only publish boundary. Keep standalone; reconcile run/metric/evidence wording against `@ji/aretro` and `@ji/roaster`.
- [ ] Re-derive the Pi-adjacent Planned slate: the map plans `@ji/flow-pi` (not a tracked package) and six `@internal/pi-tools/*` subpackage contexts. Decide whether Flow Pi vocabulary belongs in the existing `@ji/flow` context, and whether the `@internal/pi-tools` targets stay individually planned or collapse into one container-level decision.

Undecided packages — record a map decision

- [ ] Record a deliberate context decision (planned / accepted-from-adjacent / out-of-scope with a revisit trigger) for each tracked package currently absent from the map's context sections: `@ji/address` (`ts/packages/capabilities/address`, formerly `pr-address`), `@ji/clinkr` (`ts/packages/infra/clinkr`), `@ji/core` (`ts/packages/infra/core`), and the unscoped `jicc` (`ts/packages/hosts/jicc`, formerly `sdlcc`). Also resolve the two partial decisions: kit-level `@ji/capability-kit` (only its graphite subpackage has a context) and container-level `@internal/pi-tools` (only subpackage Planned targets). Do not leave silent absence.

Refresh and finalize

- [ ] Final `/CONTEXT-MAP.md` readback: confirm an unfamiliar contributor can start at the map, navigate to each present context, and explain key terms and `Avoid:` aliases without opening source. Finalize the relationship list and resolve the flagged ambiguities to concise one-line entries. Decide the deferred `@ji/core` H2-anchor linking question, the ADR-corpus map-pointer question, and the living-docs `ji`-naming question, and record the maintenance-cadence follow-up if it remains outside this Objective.

## Parked

- ADRs — write only if the `grill-with-docs` three-criteria bar fires during a session: hard to reverse, surprising without context, and a real trade-off. (`docs/adr/` holds 29 ADRs spanning `0001`–`0025` plus a README; `0012`, `0016`, `0022`, and `0024` are each used by two distinct ADRs — corpus numbering collisions, not this Objective's to fix. The map references individual ADRs inline but has no dedicated ADR index.)
- Historical initiatives-package context — no tracked package exists in the current workspace; revisit only if the package is reintroduced with implementation. (The map's out-of-scope entry now spells it `kernel-initiatives`, a mechanical-rename artifact of the former `sdl-initiatives` name.)
- Historical reviewer-package context — identity replaced by `roaster`; do not recreate unless deliberately reintroduced as a separate tracked package. (Map spelling is now `kernel-reviewer`, formerly `sdl-reviewer`.)
- Per-subpackage `CONTEXT.md` split for `@ji/core` — `clinkr` graduated to the standalone `@ji/clinkr` package and is tracked in the undecided-packages row; revisit a `@ji/core` split only if another remaining `@ji/core` subpackage graduates.
- Periodic re-grilling cadence — out of scope for this Objective; address as a separate process question after the sweep closes.
