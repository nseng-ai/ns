# Repo Ontology and CONTEXT-MAP

## Thesis

The standing goal is simple: keep the repo's domain-language documentation up to date.

That means every `CONTEXT.md`, the root `CONTEXT-MAP.md`, and any ADRs or related docs maintained through `grill-with-docs` should reflect current checked-in repo reality. Contributors and agents should be able to use those files to understand the repo's canonical terms, boundaries, relationships, and deliberately avoided aliases without opening source first.

## Scope

Current known documentation surface:

The list below is the current known context inventory to keep fresh, not a frozen final inventory. When tracked packages, extension surfaces, or substantial repo-local domain-language surfaces change, the Objective should update the relevant context/map/docs rather than treating the old inventory as authoritative.

- Root repo context: `CONTEXT.md` for Objective-system vocabulary.
- Repo map: `CONTEXT-MAP.md` as the navigation index and relationship/ambiguity rollup.
- Python package contexts:
  - `packages/areg/CONTEXT.md` — agent-resource bootstrap, persistent/transient skill workflows, skill checks, managed instruction blocks, and `skillx` helper vocabulary.
  - `packages/asdl-core/CONTEXT.md` — single context file with H2 sections for Clinkr, Git, Gt, Gh, Top-level utilities, and Sessions.
  - `packages/asdl-handoff/CONTEXT.md` — directed handoff artifact inventory and garbage-collection vocabulary over Branch Memory storage.
  - `packages/brmem/CONTEXT.md` — Branch Memory primitive vocabulary.
  - `packages/asdl-pr-address/CONTEXT.md` — PR review-thread/comment/addressing vocabulary.
  - `packages/roaster/CONTEXT.md` — review harness, finding, and posting vocabulary.
  - `packages/asdl-slots/CONTEXT.md` — worktree slot and explicit `slot gt` vocabulary.
  - `packages/asdl-objectives/CONTEXT.md` — Objective CLI package vocabulary, including archive/status/list/exec surfaces.
  - `packages/packagechk/CONTEXT.md` — standalone package-name availability and claimability vocabulary.
  - `packages/aretro/CONTEXT.md` — branch retrospective evidence CLI vocabulary.
  - `packages/vibechk/CONTEXT.md` — agent-context evaluation run, bundle, metric, runner, and comparison-report vocabulary.
- TypeScript contexts:
  - `ts/packages/asdl-dev/CONTEXT.md` — repo-local developer CLI vocabulary for `preview-url`, `cp`, `submit`, command execution, Vercel preview resolution, checkpoint text generation, and Graphite submission.
  - `ts/packages/pi-extensions/CONTEXT.md` — project-local Pi discovery adapters, engineered extension layer, command mirrors, planned/autobranch flows, runner subagents, terminal/CLI output presentation, and runtime CLI edges.
  - `ts/packages/pi-extension-runtime/CONTEXT.md` — neutral Pi extension runtime helper vocabulary (command presentation, Branch Memory command helpers, machine-envelope parsing, skill expansion, Objective picker/selection); landed from an adjacent Objective and is now part of the surface to keep fresh.
  - `ts/packages/ccc/CONTEXT.md` — CCC (Cmux Command and Control) orchestration-layer vocabulary for Pi/cmux/Graphite/Objective/handoff/branch-context/autobranch/land command-and-control and worktree-status observability; landed from an adjacent Objective and is now part of the surface to keep fresh.
- TypeScript packages without a recorded context decision: `@asdl/core` (`ts/packages/asdl-core`), `@asdl/clinkr`, `@asdl/branch-context` (`ts/packages/branch-context`, renamed on trunk from `@asdl/planned-branch`), `@asdl/plans` (CLI/skills now surfaced as `enriched-plan`; package name unchanged), and `@asdl/pr-address` are tracked workspace packages created by the adjacent TypeScript-port Objectives. Each needs a deliberate planned / accepted-from-adjacent / out-of-scope decision in the Phase 15.5 rebaseline rather than silent absence from the map.

Current backlog from the prior finite sweep:

- Completed foundation — old Phases 0 through 2: map scaffold/rebaselines, root/Pi/asdl-core contexts, brmem context, and brmem terminology alignment.
- Phase 3 — current-checkout map catch-up: update `/CONTEXT-MAP.md` so it no longer lags the completed brmem context or the post-merge package inventory.
- Phase 4 — post-merge Objective rebaseline: record that the outstanding-change batch has landed, update this Objective's closure target, and add context phases for new package/TypeScript surfaces.
- Phases 5 through 15 — one focused context or rebaseline slice at a time: `areg`, `asdl-handoff`, `asdl-pr-address`, `roaster`, `asdl-slots`, `asdl-objectives`, `packagechk`, `aretro`, `vibechk`, `asdl-dev`, and a refresh of `@asdl/pi-extensions`.
- Phase 15.5 — TypeScript workspace rebaseline: catch `/CONTEXT-MAP.md` up to the nine-package TypeScript workspace, decide context status for the five new port/foundation packages, and verify the adjacent-Objective `ccc` and `pi-extension-runtime` contexts against this Objective's contract.
- Phase 16 — final `/CONTEXT-MAP.md` relationship/ambiguity/readback pass for the current backlog. If future drift discovers new in-scope contexts, update the roadmap rather than treating Phase 16 as fixed.

Each context-writing phase is expected to explicitly invoke `grill-me` for focused terminology/readback decisions, or `grill-with-docs` when the same grilling session should update documentation inline. A package context may be accepted from an adjacent Objective only when it conforms to this Objective's contract: Language entries with `Avoid:` aliases where relevant, followed by Relationships, with map-level collisions either resolved locally or carried forward deliberately.

## Non-Goals

- Do not split `asdl-core` into per-subpackage `CONTEXT.md` files. Keep it as a single file with H2 sections until a subpackage actually graduates to a standalone package.
- Do not create `CONTEXT.md` for `asdl-dispatcher` while it remains a tracked CLI stub with no live operations.
- Do not create or reserve context slots for historical or absent package names such as `asdl-initiatives` or `asdl-reviewer` unless tracked implementation returns as a real package.
- Do not invent a documentation generator, linter, registry, YAML/frontmatter schema, UUIDs, or hidden Objective state. The Markdown contexts and map are the contract.
- Do not auto-generate glossaries from AST/source scans. Source inspection is evidence; the value is human-led vocabulary choice and ambiguity resolution.
- Do not turn package-context phases into broad implementation projects. If a context session reveals code/docs/product terminology mismatch, record the mismatch and handle any required alignment as a focused follow-up rather than expanding the context slice.
- Do not write ADRs unless the `grill-with-docs` three-criteria bar fires: hard to reverse, surprising without context, and a real trade-off.

## Completion Criteria

This is a standing Objective. It has no goal-met finish line. Close it only when the repo no longer maintains domain language through `CONTEXT.md`, `CONTEXT-MAP.md`, and `grill-with-docs`-maintained docs; ownership moves to a successor Objective/process; or a human explicitly retires this maintenance cadence.

## Definition of Progress

Progress is keepable when:

- A `CONTEXT.md`, `CONTEXT-MAP.md`, ADR, or related `grill-with-docs`-maintained file better reflects current checked-in repo reality.
- Canonical terms, relationships, and `Avoid:` aliases are sharper and easier for contributors or agents to apply.
- Cross-context terminology collisions are resolved locally or recorded concisely in the map.
- Stale ontology claims are removed or rebaselined from source evidence.

Do not keep changes that:

- Invent package vocabulary not supported by source/docs.
- Turn context files into generated registries, schemas, lifecycle state, or task databases.
- Expand a context-writing slice into broad implementation work.

Useful evidence includes:

- Source/package inventory checks.
- Concrete file paths and relationship edges.
- `dprint` / relevant docs validation.
- A `grill-with-docs` readback or equivalent check that an unfamiliar contributor can navigate from `CONTEXT-MAP.md` to the right context.

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Action recommendation: `objective-next` should pick one route, not present a grab bag of possible next actions.
- Implement from a plan only when: the slice is docs/context-only, source-backed, limited to keeping `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, related `grill-with-docs` docs, or Objective tracking up to date, and `objective-next` can form a concrete plan from the Objective plus current repo evidence. The plan should name the selected slice, evidence to inspect, likely edits, validation, and stop conditions.
- Plan first when: the roadmap row is too broad, source evidence has not been inspected enough to form a concrete plan, canonical terminology must be chosen, the context/ADR format might change, a context surface may be added/removed, or a non-obvious cross-context ambiguity must be resolved.
- Plan-first confirmation: when recommending planning, ask a yes/no confirmation question so the user can type `yes` to start the `grill-me` planning/readback session immediately; use `grill-with-docs` instead when the confirmed session should update documentation inline.
- Auto-objective slices: if no concrete plan exists yet, start the `grill-me` planning/readback work needed to produce one, then continue only if the plan becomes bounded and source-backed; otherwise stop/fail instead of offering ad hoc implementation.
- Manual slices: ask for confirmation of the steered `grill-me` planning session and do not present immediate implementation as an option.
- How `objective-next` should preview the work: say which files or areas it may edit, how it will leave the work, and what it will not do unless explicitly asked.
- Default work shape: leave only local Markdown file edits in this worktree. Do not create a branch, commit, submit a PR, or touch external systems unless explicitly confirmed.
- Validation: run `dprint` checks for Markdown and cite source evidence for inventory/relationship claims.

## Assumptions and Risks

Assumptions:

- The `grill-with-docs` output shape remains the right context format: Language entries, `Avoid:` aliases where useful, and Relationships. This Objective is not designing a new documentation framework.
- The current tracked package inventory is the post-merge baseline: 12 workspace Python packages are tracked, with `asdl-dispatcher` out of context scope because its group still has no live operations; the in-scope Python context target is the other 11 packages.
- Revised (2026-06): the old assumption of two repo-local TypeScript package contexts (`asdl-dev`, `@asdl/pi-extensions`) is no longer the baseline. The TypeScript workspace now has nine tracked packages: those two plus `@asdl/pi-extension-runtime` and `@asdl/ccc` (both with present context files landed from adjacent Objectives) and `@asdl/core`, `@asdl/clinkr`, `@asdl/branch-context`, `@asdl/plans`, and `@asdl/pr-address` (no context decision recorded yet). The count is still nine, but `@asdl/planned-branch` was renamed to `@asdl/branch-context` on trunk (mid-2026-06), so any context decision now targets the surviving name.
- Bottom-up sequencing still helps, but the context queue is larger than the old coarse Phase 3. Smaller phases should reduce stale tracking and make each package-context session independently reviewable.
- Adjacent Objectives may land conforming context sections. Those sections can satisfy repo-ontology rows if they meet this Objective's shape and relationship/ambiguity requirements. Confirmed in practice (2026-06): `ts/packages/ccc/CONTEXT.md` and `ts/packages/pi-extension-runtime/CONTEXT.md` landed from adjacent Objectives; conformance verification is tracked as Phase 15.5 work.

Risks:

- Inventory drift has already materialized multiple times and more drift remains possible before closure: `packagechk`, `@asdl/pi-extensions`, Objective archive mechanics, `roaster`, `aretro`, asdl-core Sessions, brmem Base Namespace terminology, `areg`, `asdl-handoff`, `vibechk`, `asdl-dev`, and the 2026-06 TypeScript workspace expansion (`@asdl/pi-extension-runtime`, `@asdl/ccc`, `@asdl/core`, `@asdl/clinkr`, `@asdl/branch-context`, `@asdl/plans`, `@asdl/pr-address`) all changed the closure target after the initial scaffold. Mitigation: handle drift as focused rebaseline/update phases (Phase 4, Phase 15.5) rather than silently widening an unrelated package session.
- Map drift (brmem-era, resolved): the Phase 3 catch-up landed; `/CONTEXT-MAP.md` now marks brmem present and carries `areg`, `asdl-handoff`, `vibechk`, and `asdl-dev` as planned contexts.
- Map drift (TypeScript-era, open): `/CONTEXT-MAP.md`'s Inventory Baseline still claims four repo-local TypeScript packages while nine are tracked, and records no context decision for `@asdl/core`, `@asdl/clinkr`, `@asdl/branch-context`, `@asdl/plans`, or `@asdl/pr-address`. The map's Relationships section has already absorbed the `@asdl/branch-context` rename, so the baseline is now both stale-incomplete and inconsistent with the map's own relationship vocabulary. Mitigation: the Phase 15.5 rebaseline owns this catch-up.
- TypeScript-port Objectives may replace Python package surfaces mid-sweep: `pr-address-typescript-port` now owns the `pr-address` consumer migration to `@asdl/pr-address`, which can invalidate the planned Python `asdl-pr-address` context slice before it runs. Mitigation: re-derive affected slices against the cutover plan (tracked in Phase 15.5) instead of documenting a surface that is being retired.
- Runtime-boundary drift between `asdl-dev` and `@asdl/pi-extensions` could duplicate command vocabulary. Mitigation: assign CLI command semantics to `asdl-dev`; assign Pi discovery, command mirroring, UI/presentation, and runtime adapter semantics to `@asdl/pi-extensions`.
- Cross-context ambiguity can grow into unresolved debate. Mitigation: local contexts pick package-local canonical terms; the map records only concise resolved collisions, not open-ended discussion.
- Grilling appetite may drop before all package contexts are complete. Mitigation: each remaining package phase is self-contained and leaves durable value even if closure is deferred.
- Source archaeology can swamp vocabulary work. Mitigation: source scans prove edges and find candidate terms, but human grilling/readback decides canonical language.
- A future asdl-core subpackage graduation could invalidate the single-file H2 boundary. Mitigation: treat graduation as a separate package move that owns splitting the context then; it is not a blocker for this Objective.

## Open Questions

- Should `/CONTEXT-MAP.md` link into `asdl-core`'s H2 sections individually (e.g. `Clinkr → packages/asdl-core/CONTEXT.md#clinkr`), or treat `asdl-core` as a single linked context? — _Provisional answer:_ keep one asdl-core context entry with inline H2 anchors; revisit during final readback.
- When a cross-context ambiguity is severe, is the right response to canonicalize a single repo-wide name, or preserve package-local names with the boundary documented? — _Provisional answer:_ preserve package-local names when the underlying concepts differ; use `Avoid:` aliases and map entries to prevent accidental synonym collapse.
- Which additional contexts, edges, or ambiguities will future trunk changes add before closure, and should they be inserted as new package/context phases or grouped as one new surface phase?
- Once the sweep is done, what is the maintenance cadence — opportunistic updates on PRs that touch domain language, or a periodic re-grilling cycle?
- A `docs/adr/` corpus now exists (ADRs 0001–0006, landed by adjacent vocabulary Objectives such as additive-plan-vocabulary and branch-context). The thesis treats `grill-with-docs`-maintained ADRs as part of the documentation surface, but `/CONTEXT-MAP.md` does not index them. Should the map index the ADR corpus as a navigable surface, or do ADRs stay out of the map and only get touched when the Parked three-criteria authoring bar fires? — _Leaning:_ keep ADR authoring parked, but consider a single map pointer to `docs/adr/` during the Phase 16 readback so contributors can find decisions from the map.
