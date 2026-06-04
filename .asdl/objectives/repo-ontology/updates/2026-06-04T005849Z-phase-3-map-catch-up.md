# Phase 3 Map Catch-Up

## Summary

Completed the current-checkout `/CONTEXT-MAP.md` catch-up pass.

The map now records:

- 12 tracked Python workspace packages under `packages/`.
- 11 in-scope Python package contexts, with `asdl-dispatcher` explicitly out of scope while its dispatcher group has `operations=[]`.
- Two repo-local TypeScript packages: `asdl-dev` and `@asdl/pi-extensions`.
- Present context files for root `CONTEXT.md`, `packages/asdl-core/CONTEXT.md`, `packages/brmem/CONTEXT.md`, and `ts/packages/pi-extensions/CONTEXT.md`.
- `packages/brmem/CONTEXT.md` as present, with the current Branch Memory ontology: Branch Memory System, Branch Memory, Namespace, Base Namespace `base`, Entry, Entry Key, Snapshot, Snapshot Ref, Entry Locator, Namespace Copy, Copy Conflict, and Export.
- Candidate relationship and ambiguity notes for later package-context phases, without treating them as final Phase 16 readback output.

During validation, the old `areg` relationship assumption was disproven. Current source depends on `asdl-core` through `asdl_core.project_config`, so `areg` should no longer be described as standalone/no-`asdl-core`; its context phase should record that narrow project-config boundary plus its external `gh` and `npx skills` boundaries.

## Objective Impact

- `CONTEXT-MAP.md`: rebaselined from a short present-context list into an inventory-aware map with present/planned/out-of-scope contexts, current brmem summary, candidate relationships, and flagged ambiguities.
- `roadmap.md`: marked all Phase 3 rows complete and replaced the stale `areg` standalone/no-`asdl-core` relationship guidance with the current `areg → asdl-core.project_config` boundary.
- `objective.md`: updated the relationship completion criterion so `areg` is no longer grouped with standalone/no-`asdl-core` packages; `packagechk` and `vibechk` remain standalone/no-`asdl-core` targets.

## Follow-Ups

- Next product phase remains Phase 5: create `packages/areg/CONTEXT.md` and settle the package-local skill/agent/resource vocabulary.
- In Phase 5, explicitly decide how much of `asdl-core.project_config` belongs in the `areg` context versus as a cross-reference to `asdl-core`.
- Keep the Phase 16 relationship list provisional until each planned context phase has confirmed or refined its local edges.
