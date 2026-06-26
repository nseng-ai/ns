# Map inventory baseline reconciled to 23 packages

## Summary

Executed the "Map catch-up — package inventory" roadmap row's count/inventory-baseline slice against current source. `CONTEXT-MAP.md`'s Inventory Baseline claimed "19 repo-local packages under `ts/packages/`"; ground truth is **23** (`git ls-files 'ts/packages/*/package.json' | wc -l` = 23).

Edit (Inventory Baseline only, `CONTEXT-MAP.md`):

- TypeScript workspace inventory line updated from "19 repo-local packages" to "23 repo-local packages", with the verifying command inline.
- Added the naming fact: `@sdl/*` with two unscoped exceptions — `sdlcc` (`ts/packages/sdlcc`) and `sdl-flow` (`ts/packages/extensions/flow`) — replacing the prior implication of a uniform scheme.
- Framed remaining coverage explicitly: ten present context files; the rest are Planned, undecided (awaiting a recorded map decision), or out of scope; coverage stays partial pending the remaining focused rebaseline phases.

The map's **Present** section already listed all ten landed contexts + root, so it was left unchanged — this slice touched only the Inventory Baseline block.

Validation: `just dprint-check` passes.

## Objective Impact

- Retires the "Map-vs-tree count drift (open)" risk's "19 vs 23" count mismatch in `objective.md`. The map's Inventory Baseline now matches the tree.
- Does **not** resolve the separate "Undecided packages — record a map decision" roadmap row: the eight undecided packages (`@sdl/core`, `@sdl/clinkr`, `@sdl/pr-address`, `sdlcc`, `@sdl/autobranch`, `@sdl/domain-primitives-transitional`, `@sdl/extension-kit`, `sdl-flow`) still need per-package planned/accepted/out-of-scope decisions. That row is plan-first (`grill-me`) and remains open.
- The "Map catch-up — package inventory" roadmap row's count/inventory portion is now done; the undecided-package-list confirmation portion folds into the undecided-packages row.

## Follow-Ups

- Mark or retire the "Map catch-up — package inventory" roadmap row now that the count is reconciled (the remaining undecided-list confirmation is owned by the undecided-packages row).
- Record an explicit per-package context decision for the eight undecided packages (plan-first `grill-me` slice).
- The five Planned package contexts (`@sdl/areg`, `@sdl/objective`, `@sdl/packagechk`, `@sdl/aretro`, `@sdl/vibechk`) and the final `CONTEXT-MAP.md` readback remain.
