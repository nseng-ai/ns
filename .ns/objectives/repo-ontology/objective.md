---
edges:
  - objective: ontology-reshape
    annotation: Superseded by this bounded wayfinding record at close; it absorbed the interim wayfinder map and carries the remaining reconciliation scope and standing non-goals.
---

# Repo Ontology and CONTEXT-MAP

## Thesis

The standing goal is simple: keep the repo's domain-language documentation up to date.

That means every `CONTEXT.md`, the root `CONTEXT-MAP.md`, and any ADRs or related docs maintained through `grill-with-docs` should reflect current checked-in repo reality. Contributors and agents should be able to use those files to understand the repo's canonical terms, boundaries, relationships, and deliberately avoided aliases without opening source first.

## Scope

Current known documentation surface:

The list below is the current known context inventory to keep fresh, not a frozen final inventory. When tracked packages, extension surfaces, or substantial repo-local domain-language surfaces change, the Objective should update the relevant context/map/docs rather than treating the old inventory as authoritative.

The repo is an all-TypeScript pnpm workspace under `ts/packages/`. There are no tracked Python workspace packages and no Python `CONTEXT.md` targets. Product/CLI renames landed in sequence — `sdl` → `ji` (ADR 0024) → `ns` (ADR 0026), each a hard cutover with no compatibility codepaths. The npm workspace scope then moved from `@ns/*` to bare `@nseng-ai/*` (ADR 0028, amending ADR 0026's scope clause so an internal package name equals its published npm name), and ADR 0029 renamed seven generic/internal-sounding packages to their public names with matching directory moves (`core`→`foundation`, `objective`→`objectives`, `slot`→`slots`, `handoff`→`handoffs`, `address`→`pr-feedback`, `aretro`→`retros`, `roaster`→`reviews`). Those renames moved npm identity only: CLI/bin names, `/ns:*` slash-commands, and domain vocabulary are unchanged (`ns objective ...` stays, the `slot` binary stays, Roaster stays the review-engine name, Handoff stays the artifact name).

The workspace has 29 tracked packages (`git ls-files 'ts/packages/*/package.json' | wc -l` = 29), organized as role directories with container packages: `ts/packages/capabilities/` (branch-context, ccc, flow, handoffs, harness-artifacts, ns-init, objectives, plans, pr-feedback, retros, reviews, slots), `ts/packages/capability-kit/`, `ts/packages/extensions/` (ns-pi-subagents), `ts/packages/hosts/` (command-backed-skill-registry, ns-cli, nscc, pi, pi-command-surfaces), `ts/packages/infra/` (brmem, clinkr, foundation), `ts/packages/internal/` (ns-dev, pi-tools, typescript-style-guard), `ts/packages/kernel/`, and `ts/packages/tools/` (areg, packagechk, vibechk). Packages are named `@nseng-ai/*` with two classes of naming exception: the unscoped `nscc` (`ts/packages/hosts/nscc`) and the reserved internal space `@internal/*`, whose three residents (`@internal/ns-dev`, `@internal/pi-tools`, `@internal/typescript-style-guard`) live under `ts/packages/internal/` (the former `ts/packages/local/`, renamed `local`→`internal`). `@internal/ns-dev` (bin `ns-dev`, tier `internal-pi-tool`) is the project-local dev CLI for local project and extension workflows; it landed most recently and is absent from `CONTEXT-MAP.md`.

Container/absorption facts: `@nseng-ai/kernel` (`ts/packages/kernel`, bin `ns`; subpath exports `./cli`, `./command-io`, `./context`, `./pi-text-generation`, `./sdk`) owns the CLI kernel and the public `@nseng-ai/kernel/sdk` author surface (the former standalone `sdl-sdk` package was re-absorbed as this subpath); per ADR 0029, kernel is deliberately unpublished and its runtime ships folded inside the `@nseng-ai/ns` bundle (`ts/packages/hosts/ns-cli`, the checkout-free CLI publish target). `@sdl/graphite` was absorbed into `@nseng-ai/capability-kit` (context at `ts/packages/capability-kit/src/graphite/CONTEXT.md`); the standalone `sdl-land` package was absorbed into `@nseng-ai/flow` as its land subpackage (exports `./land/api`, `./land/testing`); `autobranch` behavior lives in `@nseng-ai/flow`; and `@sdl/domain-primitives-transitional` was deleted (no tracked package). Retired directories/identities hold no tracked files.

- Root repo context: `CONTEXT.md` (titled "ns") — Objective-system vocabulary, the repo-wide Architecture Boundaries (Gateway / Domain logic) section, the Extension Layering cluster, and package-topology terms. The root title now uses `ns`; former `SDL` / `Source Development Lifecycle` naming survives only as `_Avoid_` aliases.
- Repo map: `CONTEXT-MAP.md` as the navigation index and relationship/ambiguity rollup. Adjacent work rebaselined it to the `@nseng-ai` world with correct `ts/packages/capabilities/` link paths, but its Inventory Baseline now says 26 packages and itself lags the actual 29-package workspace: `@nseng-ai/harness-artifacts`, `@nseng-ai/ns-init`, and `@nseng-ai/ns-pi-subagents` (plus the new `ts/packages/extensions/` role directory), then `@internal/ns-dev`, landed since. Re-baselining the map's count is a map-file edit outside this record; the record tracks the drift so the next map session catches up.

Present package contexts (12 tracked package context files, plus root and map; `git ls-files '*CONTEXT.md'` = 13):

- `ts/packages/capabilities/handoffs/CONTEXT.md` — `@nseng-ai/handoffs` directed handoff artifact vocabulary over Branch Memory storage (Handoff is unchanged as the artifact/domain name).
- `ts/packages/infra/brmem/CONTEXT.md` — `@nseng-ai/brmem` Branch Memory primitive vocabulary.
- `ts/packages/capabilities/ccc/CONTEXT.md` — `@nseng-ai/ccc` (Cmux Command and Control) orchestration-layer vocabulary.
- `ts/packages/hosts/pi/CONTEXT.md` — `@nseng-ai/pi` unified Pi host package vocabulary (neutral runtime helpers, project-local discovery adapters, remaining host-resident extension domains, and the CCC delegation boundary).
- `ts/packages/capability-kit/src/graphite/CONTEXT.md` — `@nseng-ai/capability-kit/graphite` reusable Graphite support vocabulary (direct `gt` adapters, metadata DB parsing, topology/status/stack facts, fakes).
- `ts/packages/kernel/CONTEXT.md` — `@nseng-ai/kernel` CLI/kernel vocabulary, including `@nseng-ai/kernel/sdk` as the public extension-author SDK surface.
- `ts/packages/capabilities/reviews/CONTEXT.md` — `@nseng-ai/reviews` PR-diff findings vocabulary for the Roaster review engine (review definitions, Tripwires, deep reviews, findings, inline findings, Branch Memory review logs).
- `ts/packages/capabilities/plans/CONTEXT.md` — `@nseng-ai/plans` saved-plan vocabulary (Local Plan Store, Source Branch Plan Files, Capability API boundaries).
- `ts/packages/capabilities/branch-context/CONTEXT.md` — `@nseng-ai/branch-context` branch-context vocabulary (Branch Context, Attached Plan, Capability API, presentation boundary).
- `ts/packages/capabilities/slots/CONTEXT.md` — `@nseng-ai/slots` worktree slot vocabulary (Slots, Slot Pool, the `ns slot ...` command surface, `@nseng-ai/slots/api`, `ns slot gt` helpers).
- `ts/packages/capabilities/objectives/CONTEXT.md` — `@nseng-ai/objectives` Objective CLI/capability vocabulary (`ns objective` surface, hidden `exec` helpers, `@nseng-ai/objectives/api`).
- `ts/packages/capabilities/flow/CONTEXT.md` — `@nseng-ai/flow` Flow lifecycle vocabulary (`ns flow ...` command face, `@nseng-ai/flow/api`, internal `land/` domain core).

Planned package contexts (recorded as *Planned* in `CONTEXT-MAP.md`, awaiting focused domain-language sessions):

- `@nseng-ai/areg` (`ts/packages/tools/areg`) — agent-resource bootstrap and skill-workflow vocabulary.
- `@nseng-ai/packagechk` (`ts/packages/tools/packagechk`) — standalone package-name availability/claimability vocabulary.
- `@nseng-ai/retros` (`ts/packages/capabilities/retros`) — deterministic branch-retrospective evidence vocabulary.
- `@nseng-ai/vibechk` (`ts/packages/tools/vibechk`) — standalone agent-context evaluation vocabulary.
- `@nseng-ai/flow-pi`, five `@internal/pi-tools/*` subpackage context targets (`context-profiler`, `grill`, `thermo-council`, `backing-skill-commands`, `pr-previews`), and `@nseng-ai/ns-pi-subagents`. The map records `@nseng-ai/flow-pi` as a planned capability-pi package that is not yet a tracked package; the `@internal/pi-tools/*` names are subpackages of the single `@internal/pi-tools` container; and `@nseng-ai/ns-pi-subagents` is now a real tracked package (`ts/packages/extensions/ns-pi-subagents`, tier `internal-pi-tool`) whose context stays Planned in the map. This slate is planned architecture, not a literal current inventory.

Tracked packages with no recorded context decision — neither Present, Planned, nor Out-of-scope in the map's context sections: `@nseng-ai/pr-feedback` (`ts/packages/capabilities/pr-feedback`, formerly `@ns/address`), `@nseng-ai/clinkr` (`ts/packages/infra/clinkr`), `@nseng-ai/foundation` (`ts/packages/infra/foundation`, formerly `@ns/core`), the unscoped `nscc` (`ts/packages/hosts/nscc`), the newer host/internal packages `@nseng-ai/ns` (`ts/packages/hosts/ns-cli`, the checkout-free CLI target), `@nseng-ai/command-backed-skill-registry` (`ts/packages/hosts/command-backed-skill-registry`), `@nseng-ai/pi-command-surfaces` (`ts/packages/hosts/pi-command-surfaces`), `@internal/typescript-style-guard` (`ts/packages/internal/typescript-style-guard`), and the newest internal resident `@internal/ns-dev` (`ts/packages/internal/ns-dev`, the project-local `ns-dev` dev CLI, tier `internal-pi-tool`, absent from the map entirely), plus the two newest capability packages `@nseng-ai/ns-init` (`ts/packages/capabilities/ns-init`, owner of `ns.toml` repo-root harness selection) and `@nseng-ai/harness-artifacts` (`ts/packages/capabilities/harness-artifacts`, the `ns install`/`list`/`path`/`update` harness-artifact surface with a preinstalled catalog) — both absent from the map entirely. Two coverage decisions are partial rather than absent: `@nseng-ai/capability-kit` has a context only for its graphite subpackage (no kit-level decision), and `@internal/pi-tools` has Planned subpackage targets but no container-level decision. Each needs a deliberate planned / accepted-from-adjacent / out-of-scope decision recorded in the map rather than silent absence.

Out of scope per the map: the historical initiatives package (no tracked package exists) and the historical reviewer package identity replaced by `roaster`. Do not recreate either unless the package itself returns as a tracked package. (The map spells these out-of-scope entries `packages/kernel-initiatives/CONTEXT.md` and `packages/kernel-reviewer/CONTEXT.md` — a mechanical-rename artifact of the former `sdl-initiatives` / `sdl-reviewer` names; the intent is unchanged.)

Each context-writing phase is expected to explicitly invoke `grill-me` for focused terminology/readback decisions, or `grill-with-docs` when the same grilling session should update documentation inline. The format those sessions write to is the `domain-modeling` skill's `CONTEXT-FORMAT.md` / `ADR-FORMAT.md` contract (see Assumptions). A package context may be accepted from an adjacent Objective only when it conforms to that contract: `## Language` entries with tight glossary definitions and `_Avoid_:` aliases where relevant, followed by the map's Relationships, with map-level collisions either resolved locally or carried forward deliberately.

## Non-Goals

- Do not recreate any Python `packages/*` paths or `CONTEXT.md` files. The Python workspace is gone; authoring against old Python paths is a regression.
- Do not recreate context slots for retired package identities — old `asdl-*`, `@sdl/*`, and `@ns/*` scope names; the standalone `sdl-sdk`, `sdl-land`, `sdlcc`, `pr-address`, `autobranch`, `domain-primitives-transitional`, `pi-extension-runtime`/`pi-extensions`; or the pre-ADR-0029 package names as npm identities (`core`, `objective`, `slot`, `handoff`, `address`, `aretro`, `roaster`) — unless tracked implementation returns under that identity. (`pi-command-surfaces` is a live tracked package `@nseng-ai/pi-command-surfaces`, not a retired identity.)
- Do not split `@nseng-ai/foundation` into per-subpackage `CONTEXT.md` files. Keep it as a single file with H2 sections until a subpackage actually graduates to a standalone package (`clinkr` already graduated to the standalone `@nseng-ai/clinkr`).
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

- The canonical format contract for `CONTEXT.md`, `CONTEXT-MAP.md`, and ADRs is owned by the `domain-modeling` skill (`.agents/skills/domain-modeling/`), not invented here. `CONTEXT-FORMAT.md` defines the `# {Context Name}` + one/two-sentence description + `## Language` shape, where each entry is `**Term**:`, a tight one-or-two-sentence definition of what the term *is* (not what it does), and an italic `_Avoid_:` alias list; `CONTEXT.md` is a glossary only and must stay devoid of implementation details, holding only project-specific terms (not general programming concepts). `CONTEXT-MAP.md` is a Contexts list plus Relationships. `ADR-FORMAT.md` defines `docs/adr/` with sequential `NNNN-slug.md` numbering and a one-to-three-sentence body, optional Status/Considered Options/Consequences only when they add value. `grill-me` and `grill-with-docs` (both under `.agents/skills/`) are the interview/session *mechanisms* that produce and update these files; the *format* is the skill's. This Objective is not designing a new documentation framework — it keeps the repo's files conformant to the `domain-modeling` shape.
- The current baseline is all-TypeScript: 29 tracked packages under `ts/packages/`, named `@nseng-ai/*` except the unscoped `nscc` and the reserved internal space `@internal/*` (three residents: `ns-dev`, `pi-tools`, `typescript-style-guard`), organized as role directories with container packages that carry manifest-declared subpackages (`ns.tier`, `ns.subpackages` in `package.json`). Twelve packages have present contexts (`handoffs`, `brmem`, `ccc`, `pi`, `capability-kit/graphite`, `kernel`, `reviews`, `plans`, `branch-context`, `slots`, `objectives`, `flow`); the rest are planned, undecided, or out-of-scope in the map.
- `CONTEXT-MAP.md` was rebaselined by adjacent work to the `@nseng-ai` world with the internal-space exceptions `@internal/pi-tools` / `@internal/typescript-style-guard` and the one unscoped exception `nscc`; its Present section carries all landed contexts with correct `ts/packages/capabilities/` link paths; and the earlier `@ns`-era defects (the retired `sdl-land` Present entry, stale naming-exception claim, and stale roaster/branch-context link paths) are resolved. Its Inventory Baseline now says 26 packages, which itself lags the actual 29-package workspace (`@nseng-ai/harness-artifacts`, `@nseng-ai/ns-init`, `@nseng-ai/ns-pi-subagents` and the new `ts/packages/extensions/` role directory, then `@internal/ns-dev`, landed since). Remaining map gaps are that stale count, the unrecorded context decisions for the newer/undecided packages, and a minor present-count wording nuance — see Risks.
- Bottom-up sequencing still helps: each remaining package-context session should be independently reviewable and leave durable value even if closure is deferred.
- Adjacent Objectives may land conforming context sections. Most present contexts landed this way; future adjacent contexts can satisfy rows only if they meet this Objective's shape and relationship/ambiguity requirements.

Risks:

- Inventory drift remains the dominant risk and has repeatedly materialized. Earlier rebaselines absorbed the `@ns/*` → `@nseng-ai/*` scope move (ADR 0028), the ADR 0029 seven-package public renames, the `local/` → `internal/` role directory, and three new host packages (`@nseng-ai/ns`, `@nseng-ai/command-backed-skill-registry`, `@nseng-ai/pi-command-surfaces`). Since then the workspace grew from 25 to 29 tracked packages: two new capability packages (`@nseng-ai/ns-init`, `@nseng-ai/harness-artifacts`), a new `ts/packages/extensions/` role directory holding `@nseng-ai/ns-pi-subagents`, and most recently `@internal/ns-dev` (a third `@internal/*` resident) — this rebaseline catches the record up; `CONTEXT-MAP.md` still lags at 26. Mitigation: fix obvious, source-backed drift inline when it is small/local and decision-free; handle broader drift as focused rebaseline/update phases against current source, never by silently widening an unrelated package session.
- Map context coverage is incomplete (open): several tracked packages still lack a recorded planned / accepted-from-adjacent / out-of-scope decision — `@nseng-ai/pr-feedback`, `@nseng-ai/clinkr`, `@nseng-ai/foundation`, `nscc`, `@nseng-ai/ns`, `@nseng-ai/command-backed-skill-registry`, `@nseng-ai/pi-command-surfaces`, `@internal/typescript-style-guard`, the newest internal resident `@internal/ns-dev`, and the two newest capability packages `@nseng-ai/ns-init` and `@nseng-ai/harness-artifacts` (the last three absent from the map entirely) — plus the partial `@nseng-ai/capability-kit` (graphite-only coverage) and `@internal/pi-tools` (subpackage targets only) decisions. Mitigation: record an explicit decision per package rather than leaving silent absence.
- Minor map nuance (low priority): the Inventory Baseline sentence says "Thirteen have present package context files" while there are 12 tracked package contexts (13 including root, which the same section enumerates). Decision-free wording fix for a future map session.
- Cross-context ambiguity can grow into unresolved debate. Mitigation: local contexts pick package-local canonical terms; the map records only concise resolved collisions, not open-ended discussion.
- Grilling appetite may drop before all package contexts are complete. Mitigation: each remaining package phase is self-contained and leaves durable value even if closure is deferred.
- Source archaeology can swamp vocabulary work. Mitigation: source scans prove edges and find candidate terms, but human grilling/readback decides canonical language.

## Open Questions

- Should `/CONTEXT-MAP.md` link into `@nseng-ai/foundation`'s H2 sections individually, or treat `@nseng-ai/foundation` as a single linked context? — *Provisional answer:* keep one `@nseng-ai/foundation` context entry with inline H2 anchors when it is authored; revisit during final readback. (`clinkr` is a standalone `@nseng-ai/clinkr` package, not a `@nseng-ai/foundation` H2 section.)
- When a cross-context ambiguity is severe, is the right response to canonicalize a single repo-wide name, or preserve package-local names with the boundary documented? — *Provisional answer:* preserve package-local names when the underlying concepts differ; use `Avoid:` aliases and map entries to prevent accidental synonym collapse.
- Where should the remaining undecided packages land in the map — `@nseng-ai/pr-feedback`, `@nseng-ai/clinkr`, `@nseng-ai/foundation`, `nscc`, the newer hosts `@nseng-ai/ns` / `@nseng-ai/command-backed-skill-registry` / `@nseng-ai/pi-command-surfaces`, the internal residents `@internal/typescript-style-guard` / `@internal/ns-dev`, the two newest capabilities `@nseng-ai/ns-init` / `@nseng-ai/harness-artifacts`, kit-level `@nseng-ai/capability-kit`, and container-level `@internal/pi-tools`? Some may warrant a focused context; others may be accepted-from-adjacent or recorded as deliberately thin. Decide per package during the undecided-packages catch-up rather than defaulting them to Planned.
- How should the map's Planned Pi-adjacent slate resolve — the `@nseng-ai/flow-pi` target (not yet a tracked package; possibly a future capability-pi extraction vs. staying inside the `@nseng-ai/flow` context) and whether the `@internal/pi-tools/*` subpackage contexts stay individually planned or collapse into one container-level decision?
- Living domain docs have largely adopted the `ns` name — the root context title is now `ns`, with `SDL` / `Source Development Lifecycle` retained only as `_Avoid_` aliases. Remaining question: do any package context descriptions still carry stale `sdl` / `ji` / `@ns` naming that should adopt current `ns` / `@nseng-ai` wording? Treat any such find as opportunistic drift fixable inline per the obvious-drift policy, not a mass rename.
- Which additional contexts, edges, or ambiguities will future trunk changes add before closure, and should they be inserted as new package/context phases or grouped as one new surface phase?
- Once the sweep is done, what is the maintenance cadence — opportunistic updates on PRs that touch domain language, or a periodic re-grilling cycle?
- The `docs/adr/` corpus has grown to 36 ADRs spanning `0001`–`0031` (plus a README), with five duplicated numbers — `0012`, `0016`, `0022`, `0023`, and `0024` are each used by two distinct ADRs; the numbering collisions are a corpus defect, not this Objective's to fix. `/CONTEXT-MAP.md` references individual ADRs inline in its relationship/ambiguity prose but has no dedicated ADR index. Should the map index the ADR corpus as a navigable surface, or do ADRs stay un-indexed and only get touched when the Parked three-criteria authoring bar fires? — *Leaning:* keep ADR authoring parked, but consider a single map pointer to `docs/adr/` during the final readback so contributors can find decisions from the map.
