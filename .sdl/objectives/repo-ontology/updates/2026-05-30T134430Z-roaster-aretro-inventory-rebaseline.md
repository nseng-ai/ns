# Roaster/Aretro Inventory Rebaseline

## Summary

Rechecked `repo-ontology` against current trunk/workspace ground truth after `objective-next` found stale tracking:

- The tracked workspace now includes `packages/roaster` and `packages/aretro`; `packages/asdl-reviewer` has no tracked files or `pyproject.toml` and is no longer a live package slot.
- `roaster` is the renamed former `asdl-reviewer` / `reviewer` surface. Its context target is `packages/roaster/CONTEXT.md`, and old `asdl-reviewer` wording should survive only as rename history where useful.
- `aretro` is a tracked Python workspace package with meaningful branch-retrospective evidence vocabulary: `aretro exec collect-evidence`, session summaries, aggregate metrics, evidence item DTOs, and deterministic evidence kinds.
- `aretro` imports `asdl-core.sessions`, `asdl-core.git`, `asdl-core.clinkr`, and `asdl-core.plugin`, which means the repo ontology also needs an `asdl-core` `## Sessions` H2 rather than treating session/evidence language as package-local to `aretro`.

Evidence considered: clean `master` at `origin/master`, recent commit `7c101fda` renaming `asdl-reviewer` to `roaster`, root `pyproject.toml` workspace members, tracked file counts for `packages/aretro`, `packages/roaster`, and `packages/asdl-reviewer`, `packages/aretro/README.md`, `docs/aretro.md`, and source import scans for `aretro` / `roaster`.

## Objective Impact

- `objective.md`: updated the durable closure target from 7 to 8 in-scope Python package contexts, replaced `asdl-reviewer` with `roaster`, added `aretro`, added `asdl-core` `Sessions` to the required H2 set, and recorded the new inventory drift and evidence/finding ambiguity risks.
- `roadmap.md`: added Phase 0.7 for the product map rebaseline, added a Phase 1 `## Sessions` task, replaced the Phase 3 `asdl-reviewer` context with `roaster`, added the Phase 3 `aretro` context, and updated Phase 4 relationship/ambiguity examples.
- No `/CONTEXT-MAP.md` or package `CONTEXT.md` files were edited by this Objective update; Phase 0.7 now tracks that product work explicitly.

## Follow-Ups

- Next work should be Phase 0.7: update `/CONTEXT-MAP.md` so it lists `aretro`, treats `roaster` as the renamed review harness package, updates the Python package count, and records current relationship/ambiguity candidates.
- After the map rebaseline, return to Phase 1 to append `## Sessions` to `packages/asdl-core/CONTEXT.md` and reconcile the temporary `asdl_core.gt` context split before moving to Phase 2 `brmem`.
- Do not create an `asdl-reviewer` context; the live context target is `packages/roaster/CONTEXT.md`.
