# Repo Ontology and CONTEXT-MAP

## Thesis

The standing goal is simple: keep the repo's domain-language documentation up to date.

That means every `CONTEXT.md`, the root `CONTEXT-MAP.md`, and any ADRs or related docs maintained through `grill-with-docs` should reflect current checked-in repo reality. Contributors and agents should be able to use those files to understand the repo's canonical terms, boundaries, relationships, and deliberately avoided aliases without opening source first.

## Scope

Current known documentation surface:

The list below is the current known context inventory to keep fresh, not a frozen final inventory. When tracked packages, extension surfaces, or substantial repo-local domain-language surfaces change, the Objective should update the relevant context/map/docs rather than treating the old inventory as authoritative.

The repo is an all-TypeScript pnpm workspace. The former first-party Python `packages/*` tree has been fully ported to TypeScript, retired, or deleted as migration reference — there are no tracked Python workspace packages (`packages/` is absent), and no Python `CONTEXT.md` targets remain. The repository namespace was renamed from `asdl` to `sdl` (landed on trunk 2026-06-20), so package names are `@sdl/*` with three unscoped exceptions: `sdlcc` (`ts/packages/hosts/sdlcc`), `sdl-flow` (`ts/packages/capabilities/flow`), and `sdl-sdk` (`ts/packages/sdl-sdk`). The former `asdl`-named residue directories (`ts/packages/asdl-core/`, `ts/packages/asdl-dev/`) no longer exist on disk.

- Root repo context: `CONTEXT.md` — Objective-system vocabulary plus the repo-wide Architecture Boundaries (Gateway / Domain logic) section.
- Repo map: `CONTEXT-MAP.md` as the navigation index and relationship/ambiguity rollup.
- TypeScript workspace: 24 tracked packages under `ts/packages/` (`git ls-files 'ts/packages/*/package.json' | wc -l` = 24).

Present package contexts (ten packages, plus root and map):

- `ts/packages/handoff/CONTEXT.md` — `@sdl/handoff` directed handoff artifact vocabulary over Branch Memory storage.
- `ts/packages/infra/brmem/CONTEXT.md` — `@sdl/brmem` Branch Memory primitive vocabulary.
- `ts/packages/ccc/CONTEXT.md` — `@sdl/ccc` (Cmux Command and Control) orchestration-layer vocabulary.
- `ts/packages/hosts/pi/CONTEXT.md` — `@sdl/pi` unified private Pi package vocabulary (neutral runtime helpers, project-local discovery adapters, engineered extension domains, and the CCC delegation boundary). This single package absorbed the former `pi-extension-runtime`, `pi-extensions`, and `pi-command-surfaces` packages, none of which remain as separate tracked packages.
- `ts/packages/infra/graphite/CONTEXT.md` — `@sdl/graphite` reusable Graphite support vocabulary (direct `gt` adapters, metadata DB parsing, topology/status/stack facts, submit support, fakes).
- `ts/packages/sdl/CONTEXT.md` — `@sdl/sdl` Source Development Lifecycle CLI vocabulary. The public SDL extension API is now the standalone `sdl-sdk` package (`ts/packages/sdl-sdk`), not a `@sdl/sdl/sdk` subpath; `@sdl/sdl`'s own subpath exports are `./cli`, `./command-io`, `./context`, and `./pi-text-generation`.
- `ts/packages/roaster/CONTEXT.md` — `@sdl/roaster` PR-diff findings vocabulary (review definitions, Tripwires, deep reviews, findings, inline findings, Branch Memory review logs).
- `ts/packages/plans/CONTEXT.md` — `@sdl/plans` saved-plan vocabulary (Local Plan Store, Source Branch Plan Files, Plans Command Face / Peer API / Core boundaries).
- `ts/packages/branch-context/CONTEXT.md` — `@sdl/branch-context` branch-context vocabulary (Branch Context, Attached Plan, Command Face / Peer API / Core boundaries).
- `ts/packages/capabilities/slot/CONTEXT.md` — `@sdl/slot` worktree slot vocabulary (Slots, Slot Pool, the `sdl slot ...` Command Face, `@sdl/slot/api` Peer API, `sdl slot gt` helpers). The Slot CLI surface is now `sdl slot`; the standalone `slot` CLI was removed, but the `@sdl/slot` package remains tracked.

Planned package contexts (recorded as *Planned* in `CONTEXT-MAP.md`, awaiting focused domain-language sessions):

- `@sdl/areg` — agent-resource bootstrap and skill-workflow vocabulary.
- `@sdl/objective` — Objective CLI package vocabulary (records/statuses/archive/exec).
- `@sdl/packagechk` — standalone package-name availability/claimability vocabulary.
- `@sdl/aretro` — deterministic branch-retrospective evidence vocabulary.
- `@sdl/vibechk` — standalone agent-context evaluation vocabulary.

Tracked packages with no recorded context decision yet — neither Present nor Planned nor Out-of-scope in the map's Contexts sections (nine): `@sdl/core` (dir `ts/packages/infra/core`), `@sdl/clinkr` (now its own package at `ts/packages/infra/clinkr`), `@sdl/pr-address`, `@sdl/autobranch`, `@sdl/domain-primitives-transitional`, `@sdl/capability-kit` (dir `ts/packages/sdl-capability-kit`, formerly `@sdl/extension-kit`), the unscoped `sdlcc`, `sdl-flow` (dir `ts/packages/capabilities/flow`), and the unscoped `sdl-sdk` (dir `ts/packages/sdl-sdk`). Each needs a deliberate planned / accepted-from-adjacent / out-of-scope decision recorded in the map rather than silent absence. Note that the map's root `CONTEXT.md` and Flagged Ambiguities have already begun absorbing `@sdl/capability-kit` ("Capability Kit") and `sdl-sdk` (SDK re-export ownership) vocabulary via the adjacent `sdl-extension-architecture` Objective, but neither package has its own recorded context decision. (`@sdl/branch-context` and `@sdl/plans` were previously undecided and are now Present; the previously undecided `@sdl/pi-command-surfaces` no longer exists; `@sdl/extension-kit` was renamed to `@sdl/capability-kit`.)

Out of scope per the map: `sdl-initiatives` (no tracked package exists) and `sdl-reviewer` (historical identity replaced by `roaster`). Do not recreate either unless the package itself returns as a tracked package.

Each context-writing phase is expected to explicitly invoke `grill-me` for focused terminology/readback decisions, or `grill-with-docs` when the same grilling session should update documentation inline. The format those sessions write to is the `domain-modeling` skill's `CONTEXT-FORMAT.md` / `ADR-FORMAT.md` contract (see Assumptions). A package context may be accepted from an adjacent Objective only when it conforms to that contract: `## Language` entries with tight glossary definitions and `_Avoid_:` aliases where relevant, followed by the map's Relationships, with map-level collisions either resolved locally or carried forward deliberately.

## Non-Goals

- Do not recreate any Python `packages/*` paths or `CONTEXT.md` files. The Python workspace is gone; authoring against old Python paths is a regression.
- Do not split `@sdl/core` into per-subpackage `CONTEXT.md` files. Keep it as a single file with H2 sections until a subpackage actually graduates to a standalone package. (`clinkr` has already graduated out of `@sdl/core` into the standalone `@sdl/clinkr` package at `ts/packages/infra/clinkr`; it is now tracked as its own undecided package, not an `@sdl/core` H2 section.)
- Do not re-introduce separate `pi-extension-runtime`, `pi-extensions`, or `pi-command-surfaces` context slots. Pi vocabulary now lives in the single `@sdl/pi` context.
- Do not create or reserve context slots for historical or absent package names such as `sdl-initiatives` or `sdl-reviewer` unless tracked implementation returns as a real package.
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
- Add implementation details, specs, or scratch notes to a `CONTEXT.md` — per the `domain-modeling` skill it is a glossary and nothing else.
- Add general programming concepts (timeouts, error types, utility patterns) to a `CONTEXT.md` rather than terms unique to that context.

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

- The canonical format contract for `CONTEXT.md`, `CONTEXT-MAP.md`, and ADRs is owned by the `domain-modeling` skill (`.agents/skills/domain-modeling/`), not invented here. `CONTEXT-FORMAT.md` defines the `# {Context Name}` + one/two-sentence description + `## Language` shape, where each entry is `**Term**:`, a tight one-or-two-sentence definition of what the term *is* (not what it does), and an italic `_Avoid_:` alias list; `CONTEXT.md` is a glossary only and must stay devoid of implementation details, holding only project-specific terms (not general programming concepts). `CONTEXT-MAP.md` is a Contexts list plus Relationships. `ADR-FORMAT.md` defines `docs/adr/` with sequential `NNNN-slug.md` numbering and a one-to-three-sentence body, optional Status/Considered Options/Consequences only when they add value. `grill-me` and `grill-with-docs` are the interview/session *mechanisms* that produce and update these files; the *format* is the skill's. This Objective is not designing a new documentation framework — it keeps the repo's files conformant to the `domain-modeling` shape.
- The post-rename baseline is all-TypeScript: 24 tracked packages under `ts/packages/`, named `@sdl/*` except the three unscoped names `sdlcc`, `sdl-flow`, and `sdl-sdk`, with no tracked Python workspace packages. Ten packages have present contexts (`handoff`, `brmem`, `ccc`, `pi`, `graphite`, `sdl`, `roaster`, `plans`, `branch-context`, `slot`); the rest are either planned, undecided, or out-of-scope in the map.
- `CONTEXT-MAP.md`'s **Present** section is already ahead of where the prior record assumed: it lists all ten landed package contexts, and the map's root context plus Flagged Ambiguities have begun absorbing the newer Extension-Layering vocabulary (`@sdl/capability-kit`, `sdl-sdk`, `@sdl/clinkr`). The remaining map gaps are concentrated in (1) an Inventory Baseline count that has gone stale again (says 23 / two unscoped exceptions; tree is 24 / three) and (2) packages with no recorded context decision — not in the map's Present framing.
- Bottom-up sequencing still helps: each remaining package-context session should be independently reviewable and leave durable value even if closure is deferred.
- Adjacent Objectives may land conforming context sections. Several present contexts (`ccc`, `pi`, `graphite`, `roaster`, `plans`, `branch-context`, `slot`) landed this way; future adjacent contexts can satisfy rows only if they meet this Objective's shape and relationship/ambiguity requirements.

Risks:

- Inventory drift remains the dominant risk and has materialized again since the last rebaseline: `clinkr` graduated out of `@sdl/core` into the standalone `@sdl/clinkr` package (`ts/packages/infra/clinkr`), the public SDL extension API was extracted from a `@sdl/sdl/sdk` subpath into the standalone `sdl-sdk` package (`ts/packages/sdl-sdk`), and `@sdl/extension-kit` was renamed to `@sdl/capability-kit` (`ts/packages/sdl-capability-kit`). The tree is now 24 packages, not 23. Mitigation: handle drift as focused rebaseline/update phases against current source, never by silently widening an unrelated package session.
- Map-vs-tree count drift (re-opened): `CONTEXT-MAP.md`'s Inventory Baseline says **23 repo-local packages** with two unscoped exceptions, but the tree now has **24** with three unscoped exceptions (`sdlcc`, `sdl-flow`, `sdl-sdk`). The map's Planned section is correct (its five Planned names all exist), but its Inventory Baseline count and naming-exception note lag again. Mitigation: re-derive the count and refresh the map's Inventory Baseline; record per-package decisions for the undecided packages; do not let the baseline drift silently.
- Undecided packages absent from the map's Contexts sections (open): `@sdl/core`, `@sdl/clinkr`, `@sdl/pr-address`, `@sdl/autobranch`, `@sdl/domain-primitives-transitional`, `@sdl/capability-kit`, `sdlcc`, `sdl-flow`, and `sdl-sdk` have no recorded planned/accepted/out-of-scope decision. Mitigation: record an explicit decision per package rather than leaving silent absence.
- Cross-context ambiguity can grow into unresolved debate. Mitigation: local contexts pick package-local canonical terms; the map records only concise resolved collisions, not open-ended discussion.
- Grilling appetite may drop before all package contexts are complete. Mitigation: each remaining package phase is self-contained and leaves durable value even if closure is deferred.
- Source archaeology can swamp vocabulary work. Mitigation: source scans prove edges and find candidate terms, but human grilling/readback decides canonical language.
- `@sdl/core` subpackage graduation has already begun (`clinkr` is now the standalone `@sdl/clinkr` package), which retires the old "Clinkr as an `@sdl/core` H2 anchor" framing. Mitigation: treat each graduation as a separate package move that owns its own context decision when authored; graduated packages join the undecided list rather than staying `@sdl/core` H2 sections. Not a blocker for this Objective.

## Open Questions

- Should `/CONTEXT-MAP.md` link into `@sdl/core`'s H2 sections individually, or treat `@sdl/core` as a single linked context? — *Provisional answer:* keep one `@sdl/core` context entry with inline H2 anchors when it is authored; revisit during final readback. (The original `clinkr` example for this question is now moot — `clinkr` is a standalone `@sdl/clinkr` package, not a `@sdl/core` H2 section.)
- When a cross-context ambiguity is severe, is the right response to canonicalize a single repo-wide name, or preserve package-local names with the boundary documented? — *Provisional answer:* preserve package-local names when the underlying concepts differ; use `Avoid:` aliases and map entries to prevent accidental synonym collapse.
- Where should the newer infrastructure/extension packages land in the map — `@sdl/autobranch`, `@sdl/domain-primitives-transitional`, `@sdl/capability-kit`, `sdl-flow`, `sdl-sdk`, and the now-standalone `@sdl/clinkr`? Some may warrant a focused context; others may be accepted-from-adjacent (the map's root context and ambiguities already carry `@sdl/capability-kit` and `sdl-sdk` vocabulary via the `sdl-extension-architecture` Objective) or recorded as deliberately thin. Decide per package during the undecided-packages catch-up rather than defaulting them to Planned.
- Which additional contexts, edges, or ambiguities will future trunk changes add before closure, and should they be inserted as new package/context phases or grouped as one new surface phase?
- Once the sweep is done, what is the maintenance cadence — opportunistic updates on PRs that touch domain language, or a periodic re-grilling cycle?
- A `docs/adr/` corpus now exists (18 files spanning ADRs `0001`–`0016`, landed by adjacent vocabulary and architecture Objectives; the numbers `0012` and `0016` are each used by two distinct ADRs — a numbering collision in the corpus, not this Objective's to fix). The thesis treats `grill-with-docs`-maintained ADRs as part of the documentation surface. `/CONTEXT-MAP.md` references individual ADRs inline in its relationship/ambiguity prose (e.g. ADR 0009 and ADR 0012) but has no dedicated ADR index. Should the map index the ADR corpus as a navigable surface, or do ADRs stay un-indexed and only get touched when the Parked three-criteria authoring bar fires? — *Leaning:* keep ADR authoring parked, but consider a single map pointer to `docs/adr/` during the final readback so contributors can find decisions from the map.
