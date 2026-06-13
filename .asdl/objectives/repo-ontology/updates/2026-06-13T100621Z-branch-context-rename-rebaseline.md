# branch-context Rename Rebaseline

## Summary

Rechecked `repo-ontology` against clean `master`. There is no branch or PR diff to apply; the evidence is the current checkout inventory and trunk commits landed since the previous (2026-06-12) TypeScript-workspace rebaseline.

Ground-truth change since the last update: the planned-branch → branch-context rename batch landed on trunk. Concretely:

- The TypeScript package `@asdl/planned-branch` was renamed to `@asdl/branch-context`. The package now lives at `ts/packages/branch-context/` (34 tracked files); `ts/packages/planned-branch/` has zero tracked files. No non-archival source file references `@asdl/planned-branch` anymore. The TypeScript workspace count is unchanged at nine tracked packages.
- The `@asdl/plans` package keeps its package name, but its CLI binary and skills are now surfaced as `enriched-plan` (commit "Rename plans CLI and skills to enriched-plan"). The package-name enumeration in this Objective is unchanged; the `enriched-plan` detail matters only when that context decision is eventually made.
- The Pi extension was renamed from `planned-branch` to `.pi/extensions/branch-context.ts`, so the still-open Phase 15 extension inventory now names `branch-context`.
- `/CONTEXT-MAP.md`'s Relationships section was already migrated to `@asdl/branch-context` by the adjacent rename work (e.g. the CCC import-boundary edge), but its Inventory Baseline still claims four repo-local TypeScript packages and records no context decision for the port/foundation packages. The baseline is therefore now both stale-incomplete (the known Phase 15.5 gap) and internally inconsistent with the map's own relationship vocabulary.
- A populated `docs/adr/` corpus now exists (ADRs 0001–0006), landed by adjacent vocabulary Objectives (additive-plan-vocabulary, branch-context). The Objective's thesis treats `grill-with-docs`-maintained ADRs as part of the documentation surface, but the map does not index them.

Evidence considered: clean `git status` on `master` at `origin/master` (no local diff, no current-branch PR; Graphite parent not applicable on trunk); `git log` trunk history since the 2026-06-12 update, including the planned-branch→branch-context and plans→enriched-plan rename commits; `package.json` `name` fields for all nine `ts/packages/*` packages; `git ls-files` counts for `ts/packages/branch-context/`, `ts/packages/planned-branch/`, and `ts/packages/plans/`; `git grep` for residual `@asdl/planned-branch` references (only archive and other-Objective records remain); `.pi/extensions/` listing; and the `docs/adr/` tracked-file inventory.

## Objective Impact

- `objective.md`: Scope's "TypeScript packages without a recorded context decision" list now names `@asdl/branch-context` (with the rename and `ts/packages/branch-context` path noted) and annotates `@asdl/plans` with its `enriched-plan` CLI/skill surface; the `ccc` Scope description drops the stale `planned-branch` token for `branch-context`. The revised TypeScript assumption and the open TypeScript-era map-drift risk both swap `@asdl/planned-branch` for `@asdl/branch-context`, and the risk now records that the map baseline is inconsistent with the already-migrated relationship vocabulary. A new Open Question asks whether `/CONTEXT-MAP.md` should index the new `docs/adr/` corpus, leaning toward a single map pointer at Phase 16 readback while keeping ADR authoring parked.
- `roadmap.md`: Phase 15.5's inventory-catch-up and per-package-decision rows now name `@asdl/branch-context` (with the rename/path and the `enriched-plan` CLI note) and record that the map Relationships section already uses the new name. Phase 15's still-open extension-inventory row now names `branch-context.ts` instead of the old `planned-branch` extension.
- No `/CONTEXT-MAP.md` or package `CONTEXT.md` product file was edited by this tracking update, so no map/context product row was newly marked complete. The rename does not complete any open phase — it retargets the open Phase 15/15.5 work onto the surviving package and extension names.

## Follow-Ups

- Phase 15.5 remains the next product slice and now has a fully current target list: catch the map Inventory Baseline up to the nine packages under their current names, decide a context status for `@asdl/branch-context` (no context file exists yet at `ts/packages/branch-context/`) alongside `@asdl/core`, `@asdl/clinkr`, `@asdl/plans`, and `@asdl/pr-address`, and verify the two adjacent-Objective contexts against the contract.
- When the `@asdl/plans` context decision is made, use the `enriched-plan` CLI/skill vocabulary as the package's user-facing surface even though the package name stays `@asdl/plans`.
- Decide during Phase 16 readback whether to add a single `/CONTEXT-MAP.md` pointer to `docs/adr/` so contributors can navigate to recorded decisions from the map.
