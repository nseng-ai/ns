# Repo Ontology and CONTEXT-MAP

## Thesis

The standing goal is simple: keep the repo's domain-language documentation up to date.

That means every `CONTEXT.md`, the root `CONTEXT-MAP.md`, and any ADRs or related docs maintained through `grill-with-docs` should reflect current checked-in repo reality. Contributors and agents should be able to use those files to understand the repo's canonical terms, boundaries, relationships, and deliberately avoided aliases without opening source first.

## Scope

Current known documentation surface:

The list below is the current known context inventory to keep fresh, not a frozen final inventory. When tracked packages, extension surfaces, or substantial repo-local domain-language surfaces change, the Objective should update the relevant context/map/docs rather than treating the old inventory as authoritative.

The repo is an all-TypeScript pnpm workspace. There are no tracked Python workspace packages (`packages/` is absent) and no Python `CONTEXT.md` targets. The product renamed from `sdl` to `ji` (ADR `0024-rename-sdl-to-ji.md`, a hard cutover with no compatibility codepaths), and the workspace was restructured into role directories with container packages: `ts/packages/capabilities/` (address, aretro, branch-context, ccc, flow, handoff, objective, plans, roaster, slot), `ts/packages/capability-kit/`, `ts/packages/hosts/` (jicc, pi), `ts/packages/infra/` (brmem, clinkr, core), `ts/packages/kernel/`, `ts/packages/local/pi-tools/`, and `ts/packages/tools/` (areg, packagechk, vibechk). That is 21 tracked packages (`git ls-files 'ts/packages/*/package.json' | wc -l` = 21), named `@ji/*` with two naming exceptions: the unscoped `jicc` (`ts/packages/hosts/jicc`) and the local-space `@internal/pi-tools` (`ts/packages/local/pi-tools`). Former standalone identities are retired: `@sdl/sdl` became `@ji/kernel` (bin `ji`; subpath exports `./cli`, `./command-io`, `./context`, `./pi-text-generation`, `./sdk`), the standalone `sdl-sdk` package was re-absorbed as the `@ji/kernel/sdk` subpath, `sdlcc` became `jicc`, `@sdl/pr-address` became `@ji/address`, `@sdl/graphite` was absorbed into `@ji/capability-kit` (graphite subpackage; context at `ts/packages/capability-kit/src/graphite/CONTEXT.md`), the standalone `sdl-land` package was absorbed into `@ji/flow` as its `land` subpackage (exports `./land/api`, `./land/testing`), `autobranch` behavior lives in `@ji/flow` subpackages, and `@sdl/domain-primitives-transitional` was deleted along with the `transitional` package tier. The old directories hold only ignored `node_modules` leftovers on disk; none has tracked files.

- Root repo context: `CONTEXT.md` (titled "SDL Tools") — Objective-system vocabulary, the repo-wide Architecture Boundaries (Gateway / Domain logic) section, the Extension Layering cluster, and package-topology terms.
- Repo map: `CONTEXT-MAP.md` as the navigation index and relationship/ambiguity rollup.

Present package contexts (12 tracked package context files, plus root and map; `git ls-files '*CONTEXT.md'` = 13):

- `ts/packages/capabilities/handoff/CONTEXT.md` — `@ji/handoff` directed handoff artifact vocabulary over Branch Memory storage.
- `ts/packages/infra/brmem/CONTEXT.md` — `@ji/brmem` Branch Memory primitive vocabulary.
- `ts/packages/capabilities/ccc/CONTEXT.md` — `@ji/ccc` (Cmux Command and Control) orchestration-layer vocabulary.
- `ts/packages/hosts/pi/CONTEXT.md` — `@ji/pi` unified Pi host package vocabulary (neutral runtime helpers, project-local discovery adapters, remaining host-resident extension domains, and the CCC delegation boundary).
- `ts/packages/capability-kit/src/graphite/CONTEXT.md` — `@ji/capability-kit/graphite` reusable Graphite support vocabulary (direct `gt` adapters, metadata DB parsing, topology/status/stack facts, fakes).
- `ts/packages/kernel/CONTEXT.md` — `@ji/kernel` CLI/kernel vocabulary, including `@ji/kernel/sdk` as the public extension-author SDK surface.
- `ts/packages/capabilities/roaster/CONTEXT.md` — `@ji/roaster` PR-diff findings vocabulary (review definitions, Tripwires, deep reviews, findings, inline findings, Branch Memory review logs).
- `ts/packages/capabilities/plans/CONTEXT.md` — `@ji/plans` saved-plan vocabulary (Local Plan Store, Source Branch Plan Files, Capability API boundaries).
- `ts/packages/capabilities/branch-context/CONTEXT.md` — `@ji/branch-context` branch-context vocabulary (Branch Context, Attached Plan, Capability API, presentation boundary).
- `ts/packages/capabilities/slot/CONTEXT.md` — `@ji/slot` worktree slot vocabulary (Slots, Slot Pool, the `ji slot ...` command surface, `@ji/slot/api`, `ji slot gt` helpers).
- `ts/packages/capabilities/objective/CONTEXT.md` — `@ji/objective` Objective CLI/capability vocabulary (`ji objective` surface, hidden `exec` helpers, `@ji/objective/api`).
- `ts/packages/capabilities/flow/CONTEXT.md` — `@ji/flow` Flow lifecycle vocabulary (`ji flow ...` command face, `@ji/flow/api`, land migration state).

Planned package contexts (recorded as *Planned* in `CONTEXT-MAP.md`, awaiting focused domain-language sessions):

- `@ji/areg` — agent-resource bootstrap and skill-workflow vocabulary.
- `@ji/packagechk` — standalone package-name availability/claimability vocabulary.
- `@ji/aretro` — deterministic branch-retrospective evidence vocabulary.
- `@ji/vibechk` — standalone agent-context evaluation vocabulary.
- `@ji/flow-pi` plus six `@internal/pi-tools/*` subpackage context targets — but `@ji/flow-pi` is not a tracked package (Flow's Pi presentation is the `@ji/flow` `pi` subpackage, and Pi-native tools live in the `@internal/pi-tools` container), so this Planned slate needs re-derivation rather than literal execution.

Tracked packages with no recorded context decision — neither Present nor Planned nor Out-of-scope in the map's Contexts sections: `@ji/address` (`ts/packages/capabilities/address`), `@ji/clinkr` (`ts/packages/infra/clinkr`), `@ji/core` (`ts/packages/infra/core`), and the unscoped `jicc` (`ts/packages/hosts/jicc`). Two further coverage decisions are partial rather than absent: `@ji/capability-kit` has a context only for its graphite subpackage (no kit-level decision), and `@internal/pi-tools` has Planned subpackage targets but no container-level decision. Each needs a deliberate planned / accepted-from-adjacent / out-of-scope decision recorded in the map rather than silent absence.

Out of scope per the map: the historical initiatives package (no tracked package exists) and the historical reviewer package identity replaced by `roaster`. Do not recreate either unless the package itself returns as a tracked package. (The map currently spells these out-of-scope entries `packages/kernel-initiatives/CONTEXT.md` and `packages/kernel-reviewer/CONTEXT.md` — apparently a mechanical-rename artifact of the former `sdl-initiatives` / `sdl-reviewer` names; the intent is unchanged.)

Each context-writing phase is expected to explicitly invoke `grill-me` for focused terminology/readback decisions, or `grill-with-docs` when the same grilling session should update documentation inline. The format those sessions write to is the `domain-modeling` skill's `CONTEXT-FORMAT.md` / `ADR-FORMAT.md` contract (see Assumptions). A package context may be accepted from an adjacent Objective only when it conforms to that contract: `## Language` entries with tight glossary definitions and `_Avoid_:` aliases where relevant, followed by the map's Relationships, with map-level collisions either resolved locally or carried forward deliberately.

## Non-Goals

- Do not recreate any Python `packages/*` paths or `CONTEXT.md` files. The Python workspace is gone; authoring against old Python paths is a regression.
- Do not recreate context slots for retired package identities — old `asdl-*`/`@sdl/*` names, the standalone `sdl-sdk`, `sdl-land`, `sdlcc`, `pr-address`, `autobranch`, `domain-primitives-transitional`, `pi-extension-runtime`/`pi-extensions`/`pi-command-surfaces`, or the historical initiatives/reviewer packages — unless tracked implementation returns as a real package.
- Do not split `@ji/core` into per-subpackage `CONTEXT.md` files. Keep it as a single file with H2 sections until a subpackage actually graduates to a standalone package (`clinkr` already graduated to the standalone `@ji/clinkr`).
- Do not invent a documentation generator, linter, registry, YAML/frontmatter schema, UUIDs, or hidden Objective state. The Markdown contexts and map are the contract.
- Do not auto-generate glossaries from AST/source scans. Source inspection is evidence; the value is human-led vocabulary choice and ambiguity resolution.
- Do not turn package-context phases into broad implementation projects. If a context session reveals obvious, source-backed drift that is small/local and needs no new terminology or product decision, fix it inline. If the mismatch is broad, ambiguous, or decision-bearing, record it and handle any required alignment as a focused follow-up rather than expanding the context slice.
- Do not write ADRs unless the `grill-with-docs` three-criteria bar fires: hard to reverse, surprising without context, and a real trade-off.

## Completion Criteria

This is a standing Objective. It has no goal-met finish line. Close it only when the repo no longer maintains domain language through `CONTEXT.md`, `CONTEXT-MAP.md`, and `grill-with-docs`-maintained docs; ownership moves to a successor Objective/process; or a human explicitly retires this maintenance cadence.

## Definition of Progress

Progress is keepable when:

- A `CONTEXT.md`, `CONTEXT-MAP.md`, ADR, or related `grill-with-docs`-maintained file better reflects current checked-in repo reality.
- Canonical terms, relationships, and `Avoid:` aliases are sharper and easier for contributors or agents to apply.
- Cross-context terminology collisions are resolved locally or recorded concisely in the map.
- Stale ontology claims are removed or rebaselined from source evidence, including opportunistic fixes for obvious drift that are small, local, and decision-free.

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
- The post-`ji`-rename baseline is all-TypeScript: 21 tracked packages under `ts/packages/`, named `@ji/*` except the unscoped `jicc` and the local-space `@internal/pi-tools`, organized as role directories with container packages that carry manifest-declared subpackages (`ji.tier`, `ji.subpackages` in `package.json`). Twelve packages have present contexts (`handoff`, `brmem`, `ccc`, `pi`, `capability-kit/graphite`, `kernel`, `roaster`, `plans`, `branch-context`, `slot`, `objective`, `flow`); the rest are planned, undecided, or out-of-scope in the map.
- `CONTEXT-MAP.md` was substantially rebaselined to the `@ji` world by adjacent work (its Inventory Baseline says 21 packages; its Present section carries the kernel, objective, and flow contexts), but it has accumulated fresh drift concentrated in the land/flow-pi identities, two naming/count claims, and two stale Present link paths — see Risks.
- Bottom-up sequencing still helps: each remaining package-context session should be independently reviewable and leave durable value even if closure is deferred.
- Adjacent Objectives may land conforming context sections. Most present contexts landed this way; future adjacent contexts can satisfy rows only if they meet this Objective's shape and relationship/ambiguity requirements.

Risks:

- Inventory drift remains the dominant risk and has materialized again at larger scale since the last rebaseline: the `sdl` → `ji` product rename (ADR 0024) changed the namespace to `@ji/*` and the CLI to `ji`, and the container-package restructure moved capabilities under `ts/packages/capabilities/`, absorbed `graphite` into `@ji/capability-kit`, `sdl-land` into `@ji/flow`, `sdl-sdk` into `@ji/kernel/sdk`, and consolidated local Pi tools into `@internal/pi-tools`. Mitigation: fix obvious, source-backed drift inline when it is small/local and decision-free; handle broader drift as focused rebaseline/update phases against current source, never by silently widening an unrelated package session.
- Current `CONTEXT-MAP.md` drift (open): (1) the Inventory Baseline names `@ji/flow` as an unscoped naming exception, but `@ji/flow` is scoped — the only unscoped name is `jicc`; (2) the Present list includes `ts/packages/capabilities/land/CONTEXT.md` and an `sdl-land` Present entry, but that file and package are gone (land is now a `@ji/flow` subpackage), and relationship rows still describe standalone `sdl-land`; (3) the Present links for `@ji/roaster` and `@ji/branch-context` point at old pre-`capabilities/` paths; (4) the "Thirteen have present package context files" count does not match either its own 14-item list or the 12 tracked package context files; (5) the Planned entry `@ji/flow-pi` names a package that does not exist as tracked. Mitigation: a focused map catch-up slice re-derives the baseline and Present/Planned sections from `git ls-files`; the land/flow-pi items are decision-bearing (context-surface removal/re-scoping), so they go through a confirmed session rather than a silent fix.
- Packages without a recorded context decision (open): `@ji/address`, `@ji/clinkr`, `@ji/core`, `jicc`, plus the partial `@ji/capability-kit` (graphite-only coverage) and `@internal/pi-tools` (subpackage targets only) decisions. Mitigation: record an explicit decision per package rather than leaving silent absence.
- The rename left living domain docs still using the old name — the root context is titled "SDL Tools" and several context descriptions expand "Source Development Lifecycle". Whether living contexts should adopt `ji` naming is decision-bearing (ADR 0024 bans scrubbing *historical* prose, but these are current docs). Mitigation: treat as an open question; do not mass-rename without a confirmed session.
- Cross-context ambiguity can grow into unresolved debate. Mitigation: local contexts pick package-local canonical terms; the map records only concise resolved collisions, not open-ended discussion.
- Grilling appetite may drop before all package contexts are complete. Mitigation: each remaining package phase is self-contained and leaves durable value even if closure is deferred.
- Source archaeology can swamp vocabulary work. Mitigation: source scans prove edges and find candidate terms, but human grilling/readback decides canonical language.

## Open Questions

- Should `/CONTEXT-MAP.md` link into `@ji/core`'s H2 sections individually, or treat `@ji/core` as a single linked context? — *Provisional answer:* keep one `@ji/core` context entry with inline H2 anchors when it is authored; revisit during final readback. (`clinkr` is a standalone `@ji/clinkr` package, not a `@ji/core` H2 section.)
- When a cross-context ambiguity is severe, is the right response to canonicalize a single repo-wide name, or preserve package-local names with the boundary documented? — *Provisional answer:* preserve package-local names when the underlying concepts differ; use `Avoid:` aliases and map entries to prevent accidental synonym collapse.
- Where should the remaining undecided packages land in the map — `@ji/address`, `@ji/clinkr`, `@ji/core`, `jicc`, kit-level `@ji/capability-kit`, and container-level `@internal/pi-tools`? Some may warrant a focused context; others may be accepted-from-adjacent or recorded as deliberately thin. Decide per package during the undecided-packages catch-up rather than defaulting them to Planned.
- How should the map's Planned slate be re-derived after the container-package restructure — in particular the phantom `@ji/flow-pi` target (Flow Pi presentation is now the `@ji/flow` `pi` subpackage) and whether `@internal/pi-tools/*` subpackage contexts should stay individually planned or collapse into one container-level decision?
- Should living domain docs adopt the `ji` name — e.g. the root context's "SDL Tools" title and "Source Development Lifecycle" expansions — or keep the old naming until a deliberate vocabulary session? (ADR 0024 forbids scrubbing historical prose; current living contexts are a separate decision.)
- Which additional contexts, edges, or ambiguities will future trunk changes add before closure, and should they be inserted as new package/context phases or grouped as one new surface phase?
- Once the sweep is done, what is the maintenance cadence — opportunistic updates on PRs that touch domain language, or a periodic re-grilling cycle?
- The `docs/adr/` corpus has grown to 29 ADRs spanning `0001`–`0025` (plus a README), with four duplicated numbers — `0012`, `0016`, `0022`, and `0024` are each used by two distinct ADRs; the numbering collisions are a corpus defect, not this Objective's to fix. `/CONTEXT-MAP.md` references individual ADRs inline in its relationship/ambiguity prose (e.g. ADR 0009, 0012, 0023, 0025) but has no dedicated ADR index. Should the map index the ADR corpus as a navigable surface, or do ADRs stay un-indexed and only get touched when the Parked three-criteria authoring bar fires? — *Leaning:* keep ADR authoring parked, but consider a single map pointer to `docs/adr/` during the final readback so contributors can find decisions from the map.
