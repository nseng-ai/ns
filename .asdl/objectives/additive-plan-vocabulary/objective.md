# Additive Plan Vocabulary Adoption

## Thesis

Adopt the enriched-plan vocabulary bound in ADR 0005 (`docs/adr/0005-additive-plan-vocabulary.md`) and the branch-context vocabulary bound in ADR 0006 (`docs/adr/0006-branch-context.md`) across shipped plan-management surfaces. An enriched plan is any plan saved into asdl; saving is the minimal enrichment. Branch context is the standing Branch Memory context attached to any branch, with a plan as one entry type. After this objective, asdl's public plan-management surfaces avoid claiming the bare noun "plan": the old `plans` CLI group and `write` verb now expose the `enriched-plan` / `save` identity, while the old `planned-branch` surfaces dissolve into branch-context primitives and the `from-plan` flow.

## Scope

- Rename the `plans` CLI group/bin to `enriched-plan` (`enriched-plan exec save`, `enriched-plan exec resolve`, `enriched-plan list`) with `write` → `save`.
- Keep the TypeScript implementation package at `@asdl/plans` / `ts/packages/plans/`; this package remains the saved-plan implementation home while its public CLI surface is `enriched-plan`.
- Re-key the local plan store from `~/.asdl/planned-branch/plans/<repo>/<encoded-branch>/` to an `enriched-plan` store path, with no migration shim.
- Update Pi command mirrors in `ts/packages/pi-extensions/`: `/plans:write` → `/enriched-plan:save`, `/plans:grill-and-write` → `/enriched-plan:grill-and-save`, plus internal module naming that references the old group where touched.
- Rename the `plans-write` skill to `enriched-plan-save` per `docs/skill-conventions.md`.
- Rename the `planned-branch` TypeScript package, CLI, Pi commands, CCC orchestration surfaces, skills, docs, and Branch Memory namespace to `branch-context`, with the attached plan fixed at key `plan.md`.
- Add branch-context attach/list/check/delete primitives while retaining `from-plan` as the create-from-saved-plan flow.

## Non-Goals

- The orchestration layer itself: patterns, the pattern library, pattern-application surfaces, and quality modifiers (deferred per ADR 0005).
- Reserved future vocabulary (run, automation, trigger, environment) — names only, no surfaces.
- CONTEXT and CONTEXT-MAP edits — canonicalizing the vocabulary in domain-language files belongs to a dedicated context rebaseline session.
- Migration shims or backward-compatibility aliases for the old group, verb, or store path.

## Completion Criteria

- All enriched-plan and branch-context scope surfaces renamed; `plans exec write`, `/plans:write`, `/plans:grill-and-write`, active `planned-branch` surfaces, and the old store path appear nowhere outside CONTEXT files (deferred to rebaseline), historical records, explicitly retained fixtures, and implementation package names intentionally kept as `@asdl/plans` / `ts/packages/plans`.
- The renamed skill is installed and its body invokes `enriched-plan exec save`.
- Evidence: TS scenario suite and full repo validation (`just`, `just ts-test`) green after the rename stack lands.

## Assumptions and Risks

Assumptions:

- The old `plans` CLI group has no consumers outside this repo's skills and Pi extensions (unreleased, private software), so renames need no deprecation period. Evidence from the implementation stack supports this assumption.
- The saving-is-minimal-enrichment definition (ADR 0005) is stable for the current work. If the future pattern feature redefines enrichment, vocabulary revisits happen there, not here.
- The local plan store holds zero-to-few transient files, so re-keying without a migration shim costs at most one manual move. No migration shim was added.
- Keeping `@asdl/plans` / `ts/packages/plans/` as the implementation package is compatible with the enriched-plan public surface because the CLI/bin, Pi commands, skills, docs, and local store carry the enriched-plan identity.

Risks:

- Out-of-order landing could break Pi command discovery: if the skill or Pi mirrors rename before the CLI group exists under its new name, wrappers invoke a missing command. Mitigation: the submitted Graphite stack sequences vocabulary/docs, package CLI/store changes, branch-context primitives, Pi/CCC surfaces, and docs/skills updates.
- Stale-reference sweep could miss embedded strings (prompt templates, test fixtures). Mitigation: completion uses grep evidence, allows only CONTEXT drift, historical records, and explicitly retained fixtures, and records CONTEXT rebaseline as parked follow-up.
- `enriched-plan` wordiness in agent-typed exec commands is accepted for now; if a human-ergonomic need emerges for `list`, that is a future follow-up rather than a blocker.

## Open Questions

- Verb/surface for future pattern application (deliberately unbound in ADR 0005; "enrich" now names the general layering).
- Whether `enriched-plan list` warrants a human-ergonomic alias once usage patterns are visible.

## Closure

Completed by the submitted Graphite stack ending at PR #1349. The stack creates ADR coverage for enriched-plan and branch-context vocabulary, renames the public saved-plan CLI/bin and Pi command surface to `enriched-plan`, re-keys the local plan store under `~/.asdl/enriched-plan`, renames the `planned-branch` package/surfaces to `branch-context`, fixes attached plan loading at `branch-context/plan.md`, adds branch-context attach/list/check/delete primitives, renames Pi/CCC surfaces including `/branch-context:from-plan`, and updates skills/docs/prompts. The implementation intentionally keeps `@asdl/plans` and `ts/packages/plans/` as the saved-plan implementation package while exposing the `enriched-plan` public CLI surface.

Evidence: Graphite PRs #1345, #1346, #1347, #1348, and #1349 were submitted; `just` passed on the stack tip, including TypeScript check/test and Python tests. Remaining CONTEXT/CONTEXT-MAP vocabulary drift is parked for a dedicated rebaseline session and is not part of this Objective's active scope.
