# TypeScript Workspace Rebaseline

## Summary

Rechecked `repo-ontology` against clean `master`. There is no branch or PR diff to apply; the evidence is the current checkout inventory and trunk commits landed since the previous update.

Ground-truth changes since the last update:

- The TypeScript workspace expanded from two to nine tracked packages. New tracked packages: `@asdl/core` (`ts/packages/asdl-core`), `@asdl/clinkr`, `@asdl/ccc`, `@asdl/pi-extension-runtime`, `@asdl/planned-branch`, `@asdl/plans`, and `@asdl/pr-address`, alongside the existing `asdl-dev` and `@asdl/pi-extensions`. The expansion is driven by adjacent Objectives (`ts-cli-foundation`, `pr-address-typescript-port`, `port-asdl-toolkit-to-typescript`, `cross-harness-parity`, and the closed CCC objective).
- Two new context files landed from adjacent Objectives and are already listed as Present in `/CONTEXT-MAP.md`: `ts/packages/ccc/CONTEXT.md` and `ts/packages/pi-extension-runtime/CONTEXT.md`. Their conformance to this Objective's contract (Language with `Avoid:` aliases plus Relationships) has not yet been verified.
- `/CONTEXT-MAP.md` has been actively maintained by adjacent work (present contexts, CCC relationship entries, handoff entry), but its Inventory Baseline still claims four repo-local TypeScript packages and records no context decision for the five new port/foundation packages.
- Handoff vocabulary was renamed on trunk: the Branch Memory namespace is now singular `handoff` (with `handoffs` as an `Avoid:` alias), and the public action vocabulary is Create / Pick Up / List / Delete a Handoff. `packages/asdl-handoff/CONTEXT.md` tracked the renames. The file remains Language-only — the Phase 6 cross-reference/Relationships row is still legitimately open.
- Consumer ownership of the `pr-address` migration to TypeScript moved to the `pr-address-typescript-port` Objective, which puts the planned Python `asdl-pr-address` context slice (Phase 7) at risk of documenting a surface being retired.
- The Python inventory is unchanged: 12 tracked packages. The `packages/asdl-reviewer/` directory on disk contains no tracked files; the historical-name stance stands. The roaster narrowing to CI PR-diff findings was already reflected in the roadmap by an earlier trunk commit.

Evidence considered: clean `git status` on `master` at `origin/master` (no local or PR diff; Graphite parent not applicable on trunk), `git ls-files` package inventories (12 Python `pyproject.toml`, tracked `ts/packages/*` set), `package.json` names for all nine TypeScript packages, context-file inventory, current `/CONTEXT-MAP.md` content, `packages/asdl-handoff/CONTEXT.md` headings and glossary terms, and trunk commit history for the context/map files and the pr-address ownership-transfer commit.

## Objective Impact

- `objective.md`: Scope now lists `ts/packages/ccc/CONTEXT.md` and `ts/packages/pi-extension-runtime/CONTEXT.md` as present surfaces to keep fresh and names the five TypeScript packages awaiting a context decision; the two-TypeScript-context assumption is marked revised; the adjacent-Objective assumption is marked confirmed in practice; the brmem-era map-drift risk is marked resolved; new open risks record the TypeScript-era map drift and the TypeScript-port replacement risk for Python context slices.
- `roadmap.md`: added Phase 15.5 — TypeScript workspace rebaseline (map inventory catch-up, per-package context decisions, conformance verification of the two adjacent-Objective contexts, and the Phase 7 re-derivation decision); refreshed the completed Phase 6 row to the singular `handoff` namespace and current glossary terms; added a status note to Phase 7 about the ownership transfer; updated the Phase 15 extension inventory to the unified `/code:land` and the CCC delegation boundary; noted that the Phase 16 relationship enumeration must absorb the Phase 15.5 decisions before finalizing.
- No `/CONTEXT-MAP.md` or package context file was edited by this tracking update, so no map/context product row was newly marked complete.

## Follow-Ups

- Next product slice should be Phase 15.5: it unblocks accurate map navigation for the expanded TypeScript workspace and settles whether `@asdl/core`, `@asdl/clinkr`, `@asdl/planned-branch`, `@asdl/plans`, and `@asdl/pr-address` get planned, accepted, or out-of-scope context status.
- During Phase 15.5, verify `ts/packages/ccc/CONTEXT.md` and `ts/packages/pi-extension-runtime/CONTEXT.md` against the context contract before treating their rows as satisfied by adjacent work.
- Hold Phase 7 (`asdl-pr-address`) until the cutover-target decision is made, so the context documents the surviving PR-addressing surface.
