# Rebaseline to 23 packages, ten present contexts, and Pi consolidation

Provenance: objective-refresh basis target=0c59d80e8 from=d239d1be5

Trunk-explicit non-closing refresh. The 2026-06-21 record (`from=d239d1be5`) had drifted again against the tree. `objective.md` and `roadmap.md` were rewritten from scratch against current `master` ground truth. No closure.

## Summary

Verified ground truth (HEAD `0c59d80e8`, `master`):

- **23 tracked TypeScript packages** under `ts/packages/` (`git ls-files 'ts/packages/*/package.json' | wc -l` = 23), up from the record's "20".
- **Two unscoped package names**, not one: `sdlcc` (`ts/packages/sdlcc`) and `sdl-flow` (`ts/packages/extensions/flow`). The record's "lone exception `sdlcc`" was stale.
- **Pi consolidation landed** (commit `609c0c73b`, "Consolidate Pi runtime and extensions into `ts/packages/pi`"). `ts/packages/pi-extensions`, `pi-extension-runtime`, and `pi-command-surfaces` now have **0 tracked files** each; their vocabulary lives in the single `@sdl/pi` package, which has its own `CONTEXT.md`. The record listed `pi-extension-runtime` and `pi-extensions` as present contexts — both false now.
- **Ten present package contexts** (verified via `git ls-files '*CONTEXT.md'`): `handoff`, `brmem`, `ccc`, `pi`, `graphite`, `sdl`, `roaster`, `plans`, `branch-context`, `slot` — plus root `CONTEXT.md`. The record claimed six.
- **Planned rows `roaster` and `slot` have landed**, and `graphite` (never previously planned) also landed. Planned-remaining: `areg`, `aretro`, `objective`, `packagechk`, `vibechk`.
- **Slot CLI surface moved to `sdl slot`** (commits `dff9d2fe6`, `482a3cfc8`); the standalone `slot` CLI was removed, but the `@sdl/slot` package remains tracked and keeps its context.
- **Four new packages with no recorded map decision**: `@sdl/autobranch`, `@sdl/domain-primitives-transitional`, `@sdl/extension-kit`, and the unscoped `sdl-flow`.
- **ADR corpus is now `docs/adr/0001–0011`** (`git ls-files 'docs/adr/*'`), up from the record's `0007`.
- **`ts/packages/asdl-core/` and `asdl-dev/` remain untracked residue** (0 tracked files each) — this claim was re-verified and carried forward unchanged.

## Objective Impact

- Scope, Assumptions, and Risks re-authored around the 23-package, ten-present-context baseline. The Pi-consolidation non-goal ("do not re-introduce separate `pi-extension-runtime` / `pi-extensions` / `pi-command-surfaces` slots") was added.
- Roadmap: the former `pi-extensions` refresh row was retired (the package no longer exists; `@sdl/pi` has a context). The `roaster`/`slot` planned rows were marked landed, and a `graphite` landed row was added.
- Map-vs-tree count drift sharpened from "19 vs 20" to **"19 vs 23"**, and the catch-up row now also covers refreshing the map's lagging Inventory Baseline and Planned sections.
- Undecided-packages row updated: `@sdl/branch-context` and `@sdl/plans` resolved (now Present), `@sdl/pi-command-surfaces` dropped (gone), and the four new packages added as needing a first decision. Survivors still undecided: `@sdl/core`, `@sdl/clinkr`, `@sdl/pr-address`, `sdlcc`.
- Open Questions updated: ADR-corpus question now references `0001–0011`; a new question asks where the four newer infrastructure packages should land in the map.
- Note: `CONTEXT-MAP.md`'s **Present** section is already ahead of the prior record's assumption — it lists all ten landed contexts. The remaining map gap is the stale Inventory Baseline count and the undecided/new packages, not the Present framing.

## Follow-Ups

- Map catch-up: re-derive the package count (23) and refresh the map's Inventory Baseline and Planned sections.
- Record an explicit per-package context decision for the eight undecided packages.
- This refresh edited only the Objective record; it did not touch `CONTEXT-MAP.md` or any `CONTEXT.md`. Those are Objective work for a separate confirmed session.
