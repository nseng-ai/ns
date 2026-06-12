# Additive Plan Vocabulary Adoption

## Thesis

Adopt the enriched-plan vocabulary bound in ADR 0005 (`docs/adr/0005-additive-plan-vocabulary.md`) across all shipped plan-store surfaces. An enriched plan is any plan saved into asdl; saving is the minimal enrichment. After this objective, asdl's surfaces never claim the bare noun "plan" — the `plans` group, its `write` verb, the Pi mirrors, the skill, the TypeScript package, and the local store path all carry the `enriched-plan` identity, while `planned-branch` surfaces stay untouched as the retained differentiator vocabulary.

## Scope

- Rename the `plans` CLI group to `enriched-plan` (`enriched-plan exec save`, `enriched-plan exec resolve`, `enriched-plan list`) with `write` → `save`.
- Rename the TypeScript package `ts/packages/plans/` to `ts/packages/enriched-plan/` including workspace references and scenario tests.
- Re-key the local plan store from `~/.asdl/planned-branch/plans/<repo>/<encoded-branch>/` to an `enriched-plan` store path, with no migration shim.
- Update Pi command mirrors in `ts/packages/pi-extensions/`: `/plans:write` → `/enriched-plan:save`, `/plans:grill-and-write` → `/enriched-plan:grill-and-save`, plus internal module naming that references the old group where touched.
- Rename the `plans-write` skill to `enriched-plan-save` per `docs/skill-conventions.md`, and update old-surface references in the `planned-branch` skill family (umbrella description, `references/lifecycle.md` command lists).

## Non-Goals

- The orchestration layer itself: patterns, the pattern library, pattern-application surfaces, and quality modifiers (deferred per ADR 0005).
- Any change to `planned-branch` surfaces: the noun, CLI group, `create`, `impl`, or the `planned-branch` Branch Memory namespace for attached plans.
- Reserved future vocabulary (run, automation, trigger, environment) — names only, no surfaces.
- CONTEXT and CONTEXT-MAP edits — canonicalizing the vocabulary in domain-language files belongs to a dedicated context rebaseline session.
- Migration shims or backward-compatibility aliases for the old group, verb, or store path.

## Completion Criteria

- All five scope surfaces renamed; `plans exec write`, `/plans:write`, `/plans:grill-and-write`, and the old store path appear nowhere outside CONTEXT files (deferred to rebaseline) and historical records (ADRs, retrospectives, closed objectives).
- The renamed skill is installed and its body invokes `enriched-plan exec save`.
- Evidence: TS scenario suite and full repo validation (`just`, `just ts-test`) green after each rename lands.

## Assumptions and Risks

Assumptions:

- The `plans` group has no consumers outside this repo's skills and Pi extensions (unreleased, private software), so renames need no deprecation period.
- The saving-is-minimal-enrichment definition (ADR 0005) is stable. If the future pattern feature redefines enrichment, vocabulary revisits happen there, not here.
- The local plan store holds zero-to-few transient files, so re-keying without a migration shim costs at most one manual move, noted in the roadmap.

Risks:

- Out-of-order landing could break Pi command discovery: if the skill or Pi mirrors rename before the CLI group exists under its new name, wrappers invoke a missing command. Mitigated by sequencing roadmap items CLI → store → Pi → skills.
- Stale-reference sweep may miss embedded strings (prompt templates, test fixtures). Mitigated by the grep-based completion criterion rather than per-file enumeration.
- `enriched-plan` wordiness in agent-typed exec commands is assumed cheap; if a human-ergonomic need emerges for `list`, that is an open question, not a blocker.

## Open Questions

- Verb/surface for future pattern application (deliberately unbound in ADR 0005; "enrich" now names the general layering).
- Whether `enriched-plan list` warrants a human-ergonomic alias once usage patterns are visible.
