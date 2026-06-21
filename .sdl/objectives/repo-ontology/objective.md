# Repo Ontology and CONTEXT-MAP

## Thesis

The standing goal is simple: keep the repo's domain-language documentation up to date.

That means every `CONTEXT.md`, the root `CONTEXT-MAP.md`, and any ADRs or related docs maintained through `grill-with-docs` should reflect current checked-in repo reality. Contributors and agents should be able to use those files to understand the repo's canonical terms, boundaries, relationships, and deliberately avoided aliases without opening source first.

## Scope

Current known documentation surface:

The list below is the current known context inventory to keep fresh, not a frozen final inventory. When tracked packages, extension surfaces, or substantial repo-local domain-language surfaces change, the Objective should update the relevant context/map/docs rather than treating the old inventory as authoritative.

The repo is now an all-TypeScript pnpm workspace. The former first-party Python `packages/*` tree has been fully ported to TypeScript, retired, or deleted as migration reference — there are no tracked Python workspace packages, and no Python `CONTEXT.md` targets remain. The repository namespace was renamed from `asdl` to `sdl` (landed on trunk 2026-06-20), so every package name is now `@sdl/*` (the lone exception is the unscoped `sdlcc`). Any leftover `ts/packages/asdl-core/` and `ts/packages/asdl-dev/` directories are untracked build residue (only `node_modules`), not tracked packages.

- Root repo context: `CONTEXT.md` — Objective-system vocabulary plus the repo-wide Architecture Boundaries (Gateway / Domain logic) section.
- Repo map: `CONTEXT-MAP.md` as the navigation index and relationship/ambiguity rollup.
- TypeScript workspace: 20 tracked packages under `ts/packages/`.

Present package contexts (six packages, plus root and map):

- `ts/packages/handoff/CONTEXT.md` — `@sdl/handoff` directed handoff artifact vocabulary over Branch Memory storage.
- `ts/packages/brmem/CONTEXT.md` — `@sdl/brmem` Branch Memory primitive vocabulary.
- `ts/packages/ccc/CONTEXT.md` — `@sdl/ccc` (Cmux Command and Control) orchestration-layer vocabulary.
- `ts/packages/pi-extension-runtime/CONTEXT.md` — `@sdl/pi-extension-runtime` neutral Pi extension runtime helper vocabulary.
- `ts/packages/pi-extensions/CONTEXT.md` — `@sdl/pi-extensions` repo-local Pi discovery/extension vocabulary (still needs a focused refresh against the full current extension inventory).
- `ts/packages/sdl/CONTEXT.md` — `@sdl/sdl` Source Development Lifecycle CLI vocabulary, including `@sdl/sdl/sdk` as the public SDL extension API.

Planned package contexts (recorded as *Planned* in `CONTEXT-MAP.md`, awaiting focused domain-language sessions):

- `@sdl/areg` — agent-resource bootstrap and skill-workflow vocabulary.
- `@sdl/roaster` — CI PR-diff review/findings vocabulary.
- `@sdl/slot` — worktree slot and explicit `slot gt` vocabulary.
- `@sdl/objective` — Objective CLI package vocabulary (records/statuses/archive/exec).
- `@sdl/packagechk` — standalone package-name availability/claimability vocabulary.
- `@sdl/aretro` — deterministic branch-retrospective evidence vocabulary.
- `@sdl/vibechk` — standalone agent-context evaluation vocabulary.

Tracked packages with no recorded context decision yet: `@sdl/core` (dir `ts/packages/sdl-core`), `@sdl/clinkr`, `@sdl/branch-context`, `@sdl/plans` (CLI/skills surfaced as `enriched-plan`), `@sdl/pr-address`, `@sdl/pi-command-surfaces`, and the unscoped `sdlcc`. Each needs a deliberate planned / accepted-from-adjacent / out-of-scope decision recorded in the map rather than silent absence.

Out of scope per the map: `sdl-initiatives` (no tracked package exists) and `sdl-reviewer` (historical identity replaced by `roaster`). Do not recreate either unless the package itself returns as a tracked package.

Each context-writing phase is expected to explicitly invoke `grill-me` for focused terminology/readback decisions, or `grill-with-docs` when the same grilling session should update documentation inline. A package context may be accepted from an adjacent Objective only when it conforms to this Objective's contract: Language entries with `Avoid:` aliases where relevant, followed by Relationships, with map-level collisions either resolved locally or carried forward deliberately.

## Non-Goals

- Do not recreate any Python `packages/*` paths or `CONTEXT.md` files. The Python workspace is gone; authoring against old Python paths is a regression.
- Do not split `@sdl/core` into per-subpackage `CONTEXT.md` files. Keep it as a single file with H2 sections until a subpackage actually graduates to a standalone package.
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
- The post-rename baseline is all-TypeScript: 20 tracked packages under `ts/packages/`, all named `@sdl/*` except the unscoped `sdlcc`, with no tracked Python workspace packages. Six packages have present contexts (`handoff`, `brmem`, `ccc`, `pi-extension-runtime`, `pi-extensions`, `sdl`); the rest are either planned, accepted-from-adjacent, or undecided in the map.
- `CONTEXT-MAP.md` has already been rebaselined to this all-TypeScript, all-`@sdl/*` world (Present/Planned/Out-of-scope sections, relationships, and ambiguities). The remaining gap is mostly in this Objective's own roadmap and in a handful of undecided packages, not in the map's overall framing.
- Bottom-up sequencing still helps: each remaining package-context session should be independently reviewable and leave durable value even if closure is deferred.
- Adjacent Objectives may land conforming context sections. `ts/packages/ccc/CONTEXT.md` and `ts/packages/pi-extension-runtime/CONTEXT.md` landed this way and are present; future adjacent contexts can satisfy rows only if they meet this Objective's shape and relationship/ambiguity requirements.

Risks:

- Inventory drift has materialized repeatedly and remains the dominant risk: the whole Python tree was deleted and ported to TypeScript, every package was renamed `asdl→sdl`, and packages such as `@sdl/pi-command-surfaces` and the unscoped `sdlcc` exist with no recorded context decision. Mitigation: handle drift as focused rebaseline/update phases against current source, never by silently widening an unrelated package session.
- Map-vs-tree count drift (open): `CONTEXT-MAP.md`'s Inventory Baseline says "19 repo-local packages" while 20 `ts/packages/*` package.json files are tracked. Mitigation: a focused map catch-up row should re-derive the exact count and the undecided-package list, not guess.
- Undecided packages absent from the map (open): `@sdl/core`, `@sdl/clinkr`, `@sdl/branch-context`, `@sdl/plans`, `@sdl/pr-address`, `@sdl/pi-command-surfaces`, and `sdlcc` have no recorded planned/accepted/out-of-scope decision. Mitigation: record an explicit decision per package rather than leaving silent absence.
- Cross-context ambiguity can grow into unresolved debate. Mitigation: local contexts pick package-local canonical terms; the map records only concise resolved collisions, not open-ended discussion.
- Grilling appetite may drop before all package contexts are complete. Mitigation: each remaining package phase is self-contained and leaves durable value even if closure is deferred.
- Source archaeology can swamp vocabulary work. Mitigation: source scans prove edges and find candidate terms, but human grilling/readback decides canonical language.
- A future `@sdl/core` subpackage graduation could invalidate the single-file H2 boundary. Mitigation: treat graduation as a separate package move that owns splitting the context then; it is not a blocker for this Objective.

## Open Questions

- Should `/CONTEXT-MAP.md` link into `@sdl/core`'s H2 sections individually (e.g. `Clinkr → ts/packages/sdl-core/CONTEXT.md#clinkr`), or treat `@sdl/core` as a single linked context? — *Provisional answer:* keep one `@sdl/core` context entry with inline H2 anchors when it is authored; revisit during final readback.
- When a cross-context ambiguity is severe, is the right response to canonicalize a single repo-wide name, or preserve package-local names with the boundary documented? — *Provisional answer:* preserve package-local names when the underlying concepts differ; use `Avoid:` aliases and map entries to prevent accidental synonym collapse.
- Which additional contexts, edges, or ambiguities will future trunk changes add before closure, and should they be inserted as new package/context phases or grouped as one new surface phase?
- Once the sweep is done, what is the maintenance cadence — opportunistic updates on PRs that touch domain language, or a periodic re-grilling cycle?
- A `docs/adr/` corpus now exists (ADRs 0001–0007, landed by adjacent vocabulary Objectives). The thesis treats `grill-with-docs`-maintained ADRs as part of the documentation surface, but `/CONTEXT-MAP.md` does not index them. Should the map index the ADR corpus as a navigable surface, or do ADRs stay out of the map and only get touched when the Parked three-criteria authoring bar fires? — *Leaning:* keep ADR authoring parked, but consider a single map pointer to `docs/adr/` during the final readback so contributors can find decisions from the map.
