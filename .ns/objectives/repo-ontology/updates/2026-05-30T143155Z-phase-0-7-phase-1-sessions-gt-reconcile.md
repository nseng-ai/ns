# Phase 0.7 and Phase 1 Sessions/Gt Reconciliation Landed

## Summary

Completed the requested documentation/ontology slice for `repo-ontology`:

- Rebaselined `/CONTEXT-MAP.md` from 7 to 8 in-scope Python package contexts plus `@asdl/pi-extensions`.
- Added `aretro` as a planned context and relationship candidate, and recorded `roaster` as the live renamed review harness package while keeping `asdl-reviewer` as rename history only.
- Added `## Sessions` to `packages/asdl-core/CONTEXT.md`, covering harness-neutral session sources, normalized facts, source references, warnings, associations, deterministic evidence items, evidence kind ordering, and the privacy boundary.
- Folded the temporary `asdl_core.gt` metadata-store contract into `packages/asdl-core/CONTEXT.md#gt` and deleted the competing subpackage `CONTEXT.md` file.

Verification: targeted `rg`/`find` checks passed after the Gt split deletion; `just dprint-fix` and full `just` passed.

No production Python or TypeScript implementation code changed.

## Objective Impact

- `roadmap.md`: Phase 0.7 map inventory/relationship tasks are marked complete; Phase 1 `## Sessions` and Gt split-reconciliation tasks are marked complete.
- `objective.md`: drift-risk wording now records that Phase 0.7 landed, and the single-file asdl-core context risk now records the Gt split as resolved.
- `/CONTEXT-MAP.md`: now lists 8 Python package contexts plus `@asdl/pi-extensions`, includes `aretro`, keeps `packagechk` standalone, preserves the negative `asdl-objectives → brmem` edge, records `asdl-objectives → asdl-core.gt`, and adds the Evidence/finding ambiguity candidate.
- `packages/asdl-core/CONTEXT.md`: now contains H2 sections for `Clinkr`, `Git`, `Gt`, `Gh`, `Top-level utilities`, and `Sessions` in the single asdl-core context file.

## Follow-Ups

- Next recommended work remains Phase 2: create `packages/brmem/CONTEXT.md`.
- Phase 3 package contexts for `asdl-pr-address`, `roaster`, `asdl-slots`, `asdl-objectives`, `packagechk`, and `aretro` remain planned.
- Phase 4 final relationship readback should wait until those package contexts exist.
