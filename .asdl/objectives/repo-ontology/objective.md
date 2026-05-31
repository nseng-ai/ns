# Repo Ontology and CONTEXT-MAP

## Thesis

The asdl monorepo needs a durable domain-language map that lets a contributor or agent enter from one file, navigate to the right package or extension context, and understand overloaded terms without opening source first. The current repo reality is no longer the original six-context scaffold: as of this intermediate rephase, the checked-out baseline includes the root Objective-system context, `CONTEXT-MAP.md`, 8 tracked in-scope Python package contexts, and the repo-local `@asdl/pi-extensions` TypeScript context. That baseline is not the final closure inventory: outstanding changes are expected to merge before this Objective closes and will add more contexts, edges, or ambiguity work.

The foundation is mostly landed: root Objective vocabulary, all `asdl-core` subdomain H2 sections, the Pi extension context, and the brmem context exist. The remaining work is not one monolithic "Phase 3" anymore. It is a sequence of small context slices plus explicit rebaseline checkpoints: first catch the map up to the completed brmem work and current checkout, then rebaseline again after the outstanding changes merge, then write one missing package or surface context at a time, then finalize cross-context relationships and ambiguities.

The outcome remains the same: `/CONTEXT-MAP.md` is the single navigation index, each context file owns its local glossary and relationships, and cross-context naming collisions such as Review/Comment, State/status, active/root status, branch/ref/snapshot-ref, plan terminology, and evidence/finding language are explicitly resolved or recorded rather than left implicit in implementation names.

## Scope

Intermediate baseline and closure target:

The list below is the known current baseline, not a frozen final inventory. Closure requires this baseline plus any additional tracked packages, extension surfaces, or substantial repo-local domain-language surfaces introduced by the outstanding changes before the Objective closes.

- Root repo context: `CONTEXT.md` for Objective-system vocabulary.
- Repo map: `CONTEXT-MAP.md` as the navigation index and relationship/ambiguity rollup.
- Python package contexts:
  - `packages/asdl-core/CONTEXT.md` — single context file with H2 sections for Clinkr, Git, Gt, Gh, Top-level utilities, and Sessions.
  - `packages/brmem/CONTEXT.md` — Branch Memory primitive vocabulary.
  - `packages/asdl-pr-address/CONTEXT.md` — PR review-thread/comment/addressing vocabulary.
  - `packages/roaster/CONTEXT.md` — review harness, finding, and posting vocabulary.
  - `packages/asdl-slots/CONTEXT.md` — worktree slot and explicit `slot gt` vocabulary.
  - `packages/asdl-objectives/CONTEXT.md` — Objective CLI package vocabulary, including archive/status/exec and opt-in `objective gt` stack projection.
  - `packages/packagechk/CONTEXT.md` — standalone package-name availability and claimability vocabulary.
  - `packages/aretro/CONTEXT.md` — branch retrospective evidence CLI vocabulary.
- TypeScript/Pi extension context: `ts/packages/pi-extensions/CONTEXT.md` for project-local Pi extension adapters and workflows.

Rephased sequence from the current state:

- Completed foundation — old Phases 0 through 2: map scaffold/rebaselines, root/Pi/asdl-core contexts, brmem context, and brmem terminology alignment.
- Phase 3 — intermediate map catch-up and current-checkout rebaseline: update `/CONTEXT-MAP.md` so it no longer lags the completed brmem context, refresh current package/edge/ambiguity notes, and label the result as an intermediate baseline rather than a final inventory.
- Phase 4 — post-outstanding-merge rebaseline: after the known outstanding changes merge, rerun package/context inventory and relationship scans, add any new required context phases, and update the Objective/map before package sessions continue or before finalization.
- Phase 5 — `asdl-pr-address` package context.
- Phase 6 — `roaster` package context.
- Phase 7 — `asdl-slots` package context.
- Phase 8 — `asdl-objectives` package context.
- Phase 9 — `packagechk` package context.
- Phase 10 — `aretro` package context.
- Phase 11 — final `/CONTEXT-MAP.md` relationship/ambiguity/readback pass. If Phase 4 discovers new in-scope contexts, insert them before this final phase and renumber/update this roadmap rather than treating Phase 11 as fixed.

Each context-writing phase is expected to use `grill-with-docs` or an equivalent focused readback session. A package context may be accepted from an adjacent Objective only when it conforms to this Objective's contract: Language entries with `Avoid:` aliases where relevant, followed by Relationships, with map-level collisions either resolved locally or carried forward deliberately.

## Non-Goals

- Do not split `asdl-core` into per-subpackage `CONTEXT.md` files. Keep it as a single file with H2 sections until a subpackage actually graduates to a standalone package.
- Do not create `CONTEXT.md` for `asdl-dispatcher` while it remains a tracked CLI stub with no live operations.
- Do not create or reserve context slots for historical or absent package names such as `asdl-initiatives`, `asdl-reviewer`, or `vibechk` unless tracked implementation returns as a real package.
- Do not invent a documentation generator, linter, registry, YAML/frontmatter schema, UUIDs, or hidden Objective state. The Markdown contexts and map are the contract.
- Do not auto-generate glossaries from AST/source scans. Source inspection is evidence; the value is human-led vocabulary choice and ambiguity resolution.
- Do not turn package-context phases into broad implementation projects. If a context session reveals code/docs/product terminology mismatch, record the mismatch and handle any required alignment as a focused follow-up rather than expanding the context slice.
- Do not write ADRs unless the `grill-with-docs` three-criteria bar fires: hard to reverse, surprising without context, and a real trade-off.

## Completion Criteria

- `/CONTEXT-MAP.md` exists at repo root and accurately lists the final merged context inventory at closure time: root `CONTEXT.md`, the current 8 known in-scope Python package contexts, `ts/packages/pi-extensions/CONTEXT.md`, and any additional in-scope package or extension contexts introduced by the outstanding changes before closure. It keeps operation-less or absent surfaces explicitly out of scope and mentions names such as `asdl-dispatcher`, `asdl-initiatives`, `asdl-reviewer`, or `vibechk` only when their current tracked status makes that useful.
- `/CONTEXT-MAP.md` marks `packages/brmem/CONTEXT.md` as present and summarizes the current brmem ontology without stale `Entry/Ref locator` or prompt-resolution-as-normal-operation wording.
- `/CONTEXT-MAP.md` contains a populated Relationships section whose edges correspond to real package dependencies, source imports, checked-in extension adapters, or runtime CLI interactions. It must include known-real edges such as `asdl-objectives → asdl-core.gt` for `objective gt` stack projection and must not reintroduce stale speculative edges such as `asdl-objectives → brmem` storage.
- `CONTEXT.md` and `docs/objective-system.md` distinguish Active Objective Root, Objective Archive Root, Archived Objective, Objective Close, Objective Archive, and Closure Marker without treating archive state as closure state.
- `packages/asdl-core/CONTEXT.md` remains the single asdl-core context file and contains conforming H2 sections for `Clinkr`, `Git`, `Gt`, `Gh`, `Top-level utilities`, and `Sessions`.
- `packages/brmem/CONTEXT.md` exists and covers Branch Memory System, Branch Memory, Namespace, Base Namespace with canonical name `base`, Entry, Entry Key, Snapshot, Snapshot Ref, Entry Locator, Namespace Copy, Copy Conflict, and Export.
- `ts/packages/pi-extensions/CONTEXT.md` exists and covers project-local Pi extension adapters, the engineered package layer, planned branches, checkpoint/new-branch flows, runner subagents, terminal presentation, and runtime CLI edges.
- Each current known missing package context exists with Language and Relationships sections: `packages/asdl-pr-address/CONTEXT.md`, `packages/roaster/CONTEXT.md`, `packages/asdl-slots/CONTEXT.md`, `packages/asdl-objectives/CONTEXT.md`, `packages/packagechk/CONTEXT.md`, and `packages/aretro/CONTEXT.md`; any additional contexts discovered by the post-outstanding-merge rebaseline are added to the roadmap and completed before final map readback.
- Cross-context naming collisions discovered during sessions are either resolved consistently in the local contexts or recorded as concise resolved entries in `/CONTEXT-MAP.md`: Review/Comment, State/status, Active/root status, branch/ref/start-point/snapshot-ref, Graphite stack projection, evidence/finding, and plan terminology.
- Readback test: an unfamiliar contributor can open `/CONTEXT-MAP.md`, navigate to any listed context, and explain key terms and `Avoid:` aliases without opening source files.

## Assumptions and Risks

Assumptions:

- The `grill-with-docs` output shape remains the right context format: Language entries, `Avoid:` aliases where useful, and Relationships. This Objective is not designing a new documentation framework.
- The current tracked package inventory is only an intermediate baseline: 9 workspace Python packages are tracked, with `asdl-dispatcher` out of context scope because it has no live operations; the in-scope context target is the other 8 packages plus `@asdl/pi-extensions` until outstanding changes merge and are re-inventoried.
- Bottom-up sequencing still helps, but the old coarse Phase 3 was too large. Smaller phases should reduce stale tracking and make each package-context session independently reviewable.
- Adjacent Objectives may land conforming context sections. Those sections can satisfy repo-ontology rows if they meet this Objective's shape and relationship/ambiguity requirements.

Risks:

- Inventory drift has already materialized multiple times and more drift is expected before closure: `packagechk`, `@asdl/pi-extensions`, Objective archive mechanics, `roaster`, `aretro`, asdl-core Sessions, `objective gt stacks`, and brmem Base Namespace terminology all changed the closure target after the initial scaffold, and outstanding changes are expected to add more context work. Mitigation: Phase 3 is an intermediate current-checkout catch-up, Phase 4 is an explicit post-outstanding-merge rebaseline, and later drift should be handled as focused rebaseline/update phases rather than silently widening an unrelated package session.
- Map drift has already materialized: `packages/brmem/CONTEXT.md` exists and brmem terminology has been aligned, but `/CONTEXT-MAP.md` still marks brmem as planned. Mitigation: make that catch-up the first remaining phase.
- Cross-context ambiguity can grow into unresolved debate. Mitigation: local contexts pick package-local canonical terms; the map records only concise resolved collisions, not open-ended discussion.
- Grilling appetite may drop before all package contexts are complete. Mitigation: each remaining package phase is self-contained and leaves durable value even if closure is deferred.
- Source archaeology can swamp vocabulary work. Mitigation: source scans prove edges and find candidate terms, but human grilling/readback decides canonical language.
- A future asdl-core subpackage graduation could invalidate the single-file H2 boundary. Mitigation: treat graduation as a separate package move that owns splitting the context then; it is not a blocker for this Objective.

## Open Questions

- Should `/CONTEXT-MAP.md` link into `asdl-core`'s H2 sections individually (e.g. `Clinkr → packages/asdl-core/CONTEXT.md#clinkr`), or treat `asdl-core` as a single linked context? — _Provisional answer:_ keep one asdl-core context entry with inline H2 anchors; revisit during Phase 10 readback.
- When a cross-context ambiguity is severe, is the right response to canonicalize a single repo-wide name, or preserve package-local names with the boundary documented? — _Provisional answer:_ preserve package-local names when the underlying concepts differ; use `Avoid:` aliases and map entries to prevent accidental synonym collapse.
- Which additional contexts, edges, or ambiguities will the outstanding changes add after merge, and should they be inserted as new package/context phases or grouped as one new surface phase?
- Once the sweep is done, what is the maintenance cadence — opportunistic updates on PRs that touch domain language, or a periodic re-grilling cycle?
