# Roadmap

## Work

Standing operating direction

- [~] Keep `CONTEXT.md`, `CONTEXT-MAP.md`, and `grill-with-docs`-maintained docs up to date.
  - Guidance: Re-derive the next slice from current source/docs, existing context coverage, and unresolved map ambiguities. The repo is all-TypeScript under `ts/packages/` with `@nseng-ai/*` names (the unscoped `nscc` and the internal space `@internal/*` excepted), organized as role directories (`capabilities/`, `capability-kit/`, `extensions/`, `hosts/`, `infra/`, `internal/`, `kernel/`, `tools/`) with container packages. Do not author against deleted Python `packages/*` paths, old `asdl-*` / `@sdl/*` / `@ns/*` scope names, retired standalone identities (`sdl-sdk`, `sdl-land`, `sdlcc`, `pr-address`, `autobranch`, `domain-primitives-transitional`), or pre-ADR-0029 npm names (`core`, `objective`, `slot`, `handoff`, `address`, `aretro`, `roaster`), and do not treat old phase numbers as a hidden queue. If adjacent work reveals obvious drift, fix it inline when it is source-backed, small/local, and decision-free; record/report it instead when it is broad, ambiguous, or would require a terminology/product decision.
  - Policy: recommend exactly one action route. Implement only from a concrete, source-backed plan; if the plan is not yet concrete, ask a yes/no confirmation question so the user can type `yes` to start a `grill-me` planning/readback session. Use confirmed steered `grill-me` planning for manual terminology, context-surface, ambiguity, or scope decisions, without presenting implementation as an option for manual slices; use `grill-with-docs` instead when the confirmed session should update documentation inline.
  - Evidence: changed context/map/docs files cite current source evidence, relevant Markdown formatting passes, and meaningful Objective tracking records durable decisions.

Present contexts (landed)

- [x] Root `CONTEXT.md` — Objective-system vocabulary, the repo-wide Architecture Boundaries (Gateway / Domain logic) section, the Extension Layering cluster, and package-topology terms. Title now `ns`; `SDL` / `Source Development Lifecycle` survive only as `_Avoid_` aliases.
- [x] `CONTEXT-MAP.md` rebaselined by adjacent work to the `@nseng-ai` world with the internal-space and unscoped exceptions, and the Present section carries all landed contexts with correct `ts/packages/capabilities/` link paths. Its Inventory Baseline now says 26 packages and itself lags the actual 28-package workspace — recatch is a map-file edit, tracked under Undecided/map catch-up.
- [x] `ts/packages/capabilities/handoffs/CONTEXT.md` — `@nseng-ai/handoffs` directed handoff artifact vocabulary over Branch Memory storage.
- [x] `ts/packages/infra/brmem/CONTEXT.md` — `@nseng-ai/brmem` Branch Memory primitive vocabulary.
- [x] `ts/packages/capabilities/ccc/CONTEXT.md` — `@nseng-ai/ccc` orchestration-layer vocabulary (accepted from an adjacent Objective).
- [x] `ts/packages/hosts/pi/CONTEXT.md` — `@nseng-ai/pi` unified Pi host vocabulary (the former separate `pi-extension-runtime`/`pi-extensions` slots stay retired).
- [x] `ts/packages/capability-kit/src/graphite/CONTEXT.md` — `@nseng-ai/capability-kit/graphite` reusable Graphite support vocabulary (formerly the standalone `@sdl/graphite` package context; the package was absorbed into `@nseng-ai/capability-kit`).
- [x] `ts/packages/kernel/CONTEXT.md` — `@nseng-ai/kernel` CLI/kernel vocabulary (formerly the `@sdl/sdl` context), including `@nseng-ai/kernel/sdk` as the public extension-author SDK; the standalone `sdl-sdk` package was re-absorbed as this subpath.
- [x] `ts/packages/capabilities/reviews/CONTEXT.md` — `@nseng-ai/reviews` PR-diff findings vocabulary for the Roaster review engine (landed from an adjacent Objective; package renamed `roaster`→`reviews` per ADR 0029, Roaster stays the engine name).
- [x] `ts/packages/capabilities/plans/CONTEXT.md` — `@nseng-ai/plans` saved-plan vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/capabilities/branch-context/CONTEXT.md` — `@nseng-ai/branch-context` branch-context vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/capabilities/slots/CONTEXT.md` — `@nseng-ai/slots` worktree slot vocabulary, including the `ns slot` command surface and `ns slot gt` helpers (landed from an adjacent Objective).
- [x] `ts/packages/capabilities/objectives/CONTEXT.md` — `@nseng-ai/objectives` Objective CLI/capability vocabulary (landed from an adjacent Objective).
- [x] `ts/packages/capabilities/flow/CONTEXT.md` — `@nseng-ai/flow` Flow lifecycle vocabulary (landed from an adjacent Objective).

Map catch-up (post-rename/restructure) — absorbed by adjacent work

- [x] The `@ns` → `@nseng-ai` scope move (ADR 0028), the ADR 0029 public-package renames, and the earlier container-restructure drift are now reflected in `CONTEXT-MAP.md`: correct naming exceptions, the retired `sdl-land` Present entry gone, and the `reviews`/`branch-context` link paths under `ts/packages/capabilities/`. Residual work for a future map session: the Inventory Baseline count (26) trails the actual 28-package workspace (`@nseng-ai/harness-artifacts`, `@nseng-ai/ns-init`, `@nseng-ai/ns-pi-subagents` under the new `ts/packages/extensions/` role directory landed since), and the "Thirteen have present package context files" wording versus 12 tracked package contexts (13 including root).

Planned package contexts

These rows mirror the *Planned TypeScript package contexts* in `CONTEXT-MAP.md`. Each is a focused `grill-me`/`grill-with-docs` slice that authors the package's `CONTEXT.md` from current source, then updates the map's Present section and the relevant relationship/ambiguity notes.

- [ ] `@nseng-ai/areg` (`ts/packages/tools/areg`) — agent-resource bootstrap and skill-workflow vocabulary: `areg init`, `areg check`, `update-skills`, `skillx`, target agents, managed instruction blocks, installed skill directories, lockfile source types, skill metadata/issues, transient skill fetch/cleanup, and external `gh` / `npx skills` boundaries.
- [ ] `@nseng-ai/packagechk` (`ts/packages/tools/packagechk`) — standalone package-name availability/claimability vocabulary: PyPI/npm checks, registry results, name normalization/validation, claim project specs, publish gateways, and parked Homebrew support. Keep explicitly standalone in map relationships.
- [ ] `@nseng-ai/retros` (`ts/packages/capabilities/retros`) — deterministic branch-retrospective evidence vocabulary: `collect-evidence`, branch resolution sources, session query/source/warning DTOs, session summaries, aggregate metrics, `EvidenceItemDto`, and the boundary between evidence collection and `branch-retro` recommendation judgment.
- [ ] `@nseng-ai/vibechk` (`ts/packages/tools/vibechk`) — standalone agent-context evaluation vocabulary: baseline/treatment workdirs, plan source, runner adapter, run id, run bundle/store/status, git provenance, metrics, transcript, diff patch, result branch, run report, comparison report, and local-only publish boundary. Keep standalone; reconcile run/metric/evidence wording against `@nseng-ai/retros` and `@nseng-ai/reviews`.
- [ ] Re-derive the Pi-adjacent Planned slate: the map plans `@nseng-ai/flow-pi` (not yet a tracked package), five `@internal/pi-tools/*` subpackage contexts (`context-profiler`, `grill`, `thermo-council`, `backing-skill-commands`, `pr-previews`), and `@nseng-ai/ns-pi-subagents` (now a real tracked package at `ts/packages/extensions/ns-pi-subagents`, tier `internal-pi-tool`). Decide whether Flow Pi vocabulary belongs in the existing `@nseng-ai/flow` context or a future capability-pi package, and whether the `@internal/pi-tools` targets stay individually planned or collapse into one container-level decision.

Undecided packages — record a map decision

- [ ] Record a deliberate context decision (planned / accepted-from-adjacent / out-of-scope with a revisit trigger) for each tracked package currently absent from the map's context sections: `@nseng-ai/pr-feedback` (`ts/packages/capabilities/pr-feedback`, formerly `@ns/address`), `@nseng-ai/clinkr` (`ts/packages/infra/clinkr`), `@nseng-ai/foundation` (`ts/packages/infra/foundation`, formerly `@ns/core`), the unscoped `nscc` (`ts/packages/hosts/nscc`), and the newer packages `@nseng-ai/ns` (`ts/packages/hosts/ns-cli`, the checkout-free CLI target), `@nseng-ai/command-backed-skill-registry` (`ts/packages/hosts/command-backed-skill-registry`), `@nseng-ai/pi-command-surfaces` (`ts/packages/hosts/pi-command-surfaces`), `@internal/typescript-style-guard` (`ts/packages/internal/typescript-style-guard`), `@nseng-ai/ns-init` (`ts/packages/capabilities/ns-init` — owns `ns.toml`, the repo-root project harness selection; that vocabulary is recorded nowhere, and the `npm-bundled-artifact-provisioning` reconcile-targeting decision now depends on it), and `@nseng-ai/harness-artifacts` (`ts/packages/capabilities/harness-artifacts` — the `ns install`/`list`/`path`/`update` harness-artifact surface with a preinstalled catalog; absent from the map entirely). Also resolve the two partial decisions: kit-level `@nseng-ai/capability-kit` (only its graphite subpackage has a context) and container-level `@internal/pi-tools` (only subpackage Planned targets). Do not leave silent absence.

Refresh and finalize

- [ ] Final `/CONTEXT-MAP.md` readback: confirm an unfamiliar contributor can start at the map, navigate to each present context, and explain key terms and `Avoid:` aliases without opening source. Finalize the relationship list and resolve the flagged ambiguities to concise one-line entries. Fix the residual present-count wording nuance, and decide the deferred `@nseng-ai/foundation` H2-anchor linking question and the ADR-corpus map-pointer question, recording the maintenance-cadence follow-up if it remains outside this Objective.

## Parked

- ADRs — write only if the `grill-with-docs` three-criteria bar fires during a session: hard to reverse, surprising without context, and a real trade-off. (`docs/adr/` holds 34 ADRs spanning `0001`–`0029` plus a README; `0012`, `0016`, `0022`, `0023`, and `0024` are each used by two distinct ADRs — corpus numbering collisions, not this Objective's to fix. The map references individual ADRs inline but has no dedicated ADR index.)
- Historical initiatives-package context — no tracked package exists in the current workspace; revisit only if the package is reintroduced with implementation. (The map's out-of-scope entry spells it `kernel-initiatives`, a mechanical-rename artifact of the former `sdl-initiatives` name.)
- Historical reviewer-package context — identity replaced by `roaster`; do not recreate unless deliberately reintroduced as a separate tracked package. (Map spelling is `kernel-reviewer`, formerly `sdl-reviewer`.)
- Per-subpackage `CONTEXT.md` split for `@nseng-ai/foundation` — `clinkr` graduated to the standalone `@nseng-ai/clinkr` package and is tracked in the undecided-packages row; revisit a `@nseng-ai/foundation` split only if another remaining `@nseng-ai/foundation` subpackage graduates.
- Periodic re-grilling cadence — out of scope for this Objective; address as a separate process question after the sweep closes.
