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
  - `packages/asdl-objectives/CONTEXT.md` — Objective CLI package vocabulary, including archive/status/exec and opt-in `objective gt` stack projection.
  - `packages/packagechk/CONTEXT.md` — standalone package-name availability and claimability vocabulary.
  - `packages/aretro/CONTEXT.md` — branch retrospective evidence CLI vocabulary.
  - `packages/vibechk/CONTEXT.md` — agent-context evaluation run, bundle, metric, runner, and comparison-report vocabulary.
- TypeScript contexts:
  - `ts/packages/asdl-dev/CONTEXT.md` — repo-local developer CLI vocabulary for `preview-url`, `cp`, `submit`, command execution, Vercel preview resolution, checkpoint text generation, and Graphite submission.
  - `ts/packages/pi-extensions/CONTEXT.md` — project-local Pi discovery adapters, engineered extension layer, command mirrors, planned/autobranch flows, runner subagents, terminal/CLI output presentation, and runtime CLI edges.

Current backlog from the prior finite sweep:

- Completed foundation — old Phases 0 through 2: map scaffold/rebaselines, root/Pi/asdl-core contexts, brmem context, and brmem terminology alignment.
- Phase 3 — current-checkout map catch-up: update `/CONTEXT-MAP.md` so it no longer lags the completed brmem context or the post-merge package inventory.
- Phase 4 — post-merge Objective rebaseline: record that the outstanding-change batch has landed, update this Objective's closure target, and add context phases for new package/TypeScript surfaces.
- Phases 5 through 15 — one focused context or rebaseline slice at a time: `areg`, `asdl-handoff`, `asdl-pr-address`, `roaster`, `asdl-slots`, `asdl-objectives`, `packagechk`, `aretro`, `vibechk`, `asdl-dev`, and a refresh of `@asdl/pi-extensions`.
- Phase 16 — final `/CONTEXT-MAP.md` relationship/ambiguity/readback pass for the current backlog. If future drift discovers new in-scope contexts, update the roadmap rather than treating Phase 16 as fixed.

Each context-writing phase is expected to use `grill-with-docs` or an equivalent focused readback session. A package context may be accepted from an adjacent Objective only when it conforms to this Objective's contract: Language entries with `Avoid:` aliases where relevant, followed by Relationships, with map-level collisions either resolved locally or carried forward deliberately.

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

- Direct execution is allowed when: the slice is docs/context-only, source-backed, and limited to keeping `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, related `grill-with-docs` docs, or Objective tracking up to date.
- Steer or ask first when: choosing canonical terminology, changing the context/ADR format, adding/removing a context surface, or resolving a non-obvious cross-context ambiguity.
- Materialization: local Markdown edits only unless branch/commit work is explicitly confirmed.
- Validation: run `dprint` checks for Markdown and cite source evidence for inventory/relationship claims.
- External side effects: none by default.

## Assumptions and Risks

Assumptions:

- The `grill-with-docs` output shape remains the right context format: Language entries, `Avoid:` aliases where useful, and Relationships. This Objective is not designing a new documentation framework.
- The current tracked package inventory is the post-merge baseline: 12 workspace Python packages are tracked, with `asdl-dispatcher` out of context scope because its group still has no live operations; the in-scope Python context target is the other 11 packages.
- The current TypeScript workspace has two repo-local package contexts in scope: `ts/packages/asdl-dev` and `ts/packages/pi-extensions`.
- Bottom-up sequencing still helps, but the context queue is larger than the old coarse Phase 3. Smaller phases should reduce stale tracking and make each package-context session independently reviewable.
- Adjacent Objectives may land conforming context sections. Those sections can satisfy repo-ontology rows if they meet this Objective's shape and relationship/ambiguity requirements.

Risks:

- Inventory drift has already materialized multiple times and more drift remains possible before closure: `packagechk`, `@asdl/pi-extensions`, Objective archive mechanics, `roaster`, `aretro`, asdl-core Sessions, `objective gt stacks`, brmem Base Namespace terminology, `areg`, `asdl-handoff`, `vibechk`, and `asdl-dev` all changed the closure target after the initial scaffold. Mitigation: the Phase 4 rebaseline records the current post-merge inventory, and later drift should be handled as focused rebaseline/update phases rather than silently widening an unrelated package session.
- Map drift has expanded: `packages/brmem/CONTEXT.md` exists and brmem terminology has been aligned, but `/CONTEXT-MAP.md` still marks brmem as planned and also lacks `areg`, `asdl-handoff`, `vibechk`, and `asdl-dev`. Mitigation: make that catch-up the first remaining product phase.
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
