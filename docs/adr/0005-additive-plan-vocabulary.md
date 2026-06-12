# ADR 0005: Additive Plan-Management Vocabulary

## Status

Accepted

## Context

asdl plan management grew up branch-first: the `plans` store, `planned-branch create`, and `planned-branch impl` frame asdl as a plan _system_, competing with the plan concepts every agent harness now ships (Claude Code plan mode and plan files, Codex plan mode, Cursor plans, Copilot implementation plans). The intended posture is additive: asdl operates on plans authored anywhere, and its differentiated value is downstream of authorship — attaching plans to branches, layering behavior onto them, and executing them autonomously.

A vendor vocabulary survey (`docs/agent-vocabulary-survey.md`, researched 2026-06-12) established two facts that shaped this decision: the field has converged on specific words for adjacent concepts (automation, trigger, environment, run, skills), and the two concepts central to asdl — plan-attached-to-branch and plan enrichment — have no existing vocabulary at any vendor.

This ADR records the vocabulary bound in a grill session on 2026-06-12. It binds the full ontology now (including names reserved for unbuilt features) while staging renames so only existing surfaces change near-term.

## Decision

### The core noun: enriched plan

An **enriched plan** is any plan saved into asdl. Saving is the minimal enrichment: the plan gains asdl's layered-on context — source-branch scoping, slug, attachment-readiness. Orchestration patterns (below) are a further enrichment layer, not a different kind of artifact.

This definition carries the additive thesis: a plan is the harness's artifact, authored anywhere; an enriched plan is that same plan inside asdl. asdl's surfaces never claim the bare noun "plan" — the bare word stays free for every harness's native plan concept.

### Bound now, applied to existing surfaces

- **`enriched-plan`** replaces the `plans` CLI group: `enriched-plan exec save`, `enriched-plan exec resolve`, `enriched-plan list`. Wordiness is acceptable: exec operations are skill-invoked, and the human surfaces are the Pi commands.
- **save** replaces **write** as the intake verb (`enriched-plan exec save`, Pi `/enriched-plan:save`, `/enriched-plan:grill-and-save`). Saving is source-agnostic: it covers plans authored in-session and plans brought in from any harness's planning surface. The authorship framing of "write" is retired.
- The TypeScript package renames to match: `ts/packages/plans/` → `ts/packages/enriched-plan/`.
- The local store re-keys from `~/.asdl/planned-branch/plans/<repo>/<branch>/` to an `enriched-plan` store path. The old path was mis-keyed twice over: the store is pre-branch by definition, and it predates the vocabulary. No migration shim (unreleased software).
- The `plans-write` skill renames to `enriched-plan-save`.
- **planned-branch is retained unchanged** — the noun, the CLI group, `planned-branch create`, `planned-branch impl`, and the `planned-branch` Branch Memory namespace for attached plans. Plan-attached-to-branch is asdl's differentiator and the term is unclaimed territory; the name stakes it rather than dissolving into verb phrases. `impl` remains the attended implementation surface.

### Bound now, for the future orchestration layer

- **pattern** is the noun for a reusable orchestration shape (swarm, sweep, panel, solo) in the pattern library.
- Pattern application is a further enrichment stored as a **pair**: the source plan stays immutable and human-reviewed; the orchestration overlay is a separate, regenerable entry beside it. Re-applying a pattern never rewrites the plan.
- The verb/surface for applying a pattern is deliberately unbound. "Enrich" now names the general layering that saving already performs, so the pattern-application surface needs its own name when the feature is designed.

### Reserved for future features (no surfaces today)

- **run** — a single execution instance (record, status, logs); the consensus instance noun for triggered/unattended executions. Collides with vibechk run vocabulary: qualify in shared contexts and record the pairing in the CONTEXT-MAP ambiguity ledger when vocabulary lands.
- **automation** — a standing trigger-bound producer of runs (embeds, references, or generates its plan). Field-consensus term (Cursor, Devin, OpenHands, Augment, Codex app); self-bounding ("one-off automation" is an oxymoron, so it cannot absorb the one-off case).
- **trigger** — the binding that fires an automation: schedule, repo event, mention, webhook.
- **environment** — where runs execute (worktree slots locally, GitHub Actions, cloud sandboxes). Chosen over "runner": no agent vendor uses runner for its own compute.

### Explicitly deferred

- **Pattern-application surface naming** (see above).
- **Quality modifiers** (composable verification/judging add-ons applied to a pattern) — the feature is deferred and deliberately unnamed until designed.
- **Unattended execution surface** — unbound until it exists; `planned-branch impl` remains the only execution surface today.

## Consequences

- Staged renames (group, verb, package, store path, skill, Pi mirrors) are tracked as Objective `additive-plan-vocabulary` rather than executed ad hoc.
- CONTEXT files and CONTEXT-MAP are not modified by this ADR; canonicalizing the vocabulary in domain-language files (including retiring "Saved plan"/"Source branch plan file" in favor of enriched-plan terms, the vibechk "run" ambiguity entry, and the existing Plan/attachment/handoff ambiguity) waits for a dedicated context rebaseline session per repo policy.
- "Planned branch" remains correct vocabulary in skills, docs, and prose.
- Live saved plans in the old store path must be moved manually; the store typically holds zero-to-few transient files.
- Unreleased status means all re-keying carries no compatibility burden.

## Rejected Alternatives

- **`plan` (singular) as the CLI group:** chosen mid-session, then superseded. Even the bare group name competes with harness plan vocabulary; `enriched-plan` makes asdl's artifact unmistakable and leaves "plan" entirely to the harnesses.
- **enriched plan as a state name only (pattern-carrying plans):** the narrower definition created a vanilla-vs-enriched split inside asdl and misdescribed the system's surfaces. Subsumed by the saving-is-minimal-enrichment definition.
- **compile / target / flags scheme:** compilation vocabulary brought a free ecosystem (targets, flags, recompile, run-from-source) but connotes a deterministic transformation; enrichment exercises judgment. The pair-storage design was kept; the toolchain metaphor was not.
- **One-document enrichment (in-place):** rewriting the reviewed plan on re-enrichment muddies the human-intent vs machine-overlay boundary; rejected in favor of the immutable-source pair.
- **executable plan:** implies un-enriched plans cannot execute; also less accurate than "enriched" about what asdl adds.
- **Dissolving "planned branch" (`plan branch`, `plan attach`):** discards the brandable name of the differentiator and reads ambiguously as a CLI invocation.
- **job:** no vendor uses it; generic enough to become a god-noun absorbing plan, branch, and run.
- **task / workflow / spec as asdl-distinctive terms:** overloaded (Codex/Claude/Jules/Copilot), owned (GHA, Claude dynamic workflows), and claimed for heavier requirements-grade artifacts (Kiro, Factory) respectively.
- **routine / daemon for the standing automation:** Claude-only and Charlie-only precedents; "automation" is the cross-vendor winner.
- **runner:** CI vocabulary, not agent vocabulary; collides when dispatching to actual GitHub Actions runners.
- **spell / cast / enchant metaphor family:** generative during design (it produced the pattern-x-modifier decomposition, the spec/record split, and the embed/reference/generate trichotomy) but rejected for binding vocabulary; the structure survives in plain words.
