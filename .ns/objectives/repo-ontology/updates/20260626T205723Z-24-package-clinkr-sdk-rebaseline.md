# Rebaseline to 24 packages: clinkr graduation, sdl-sdk extraction, capability-kit rename

Provenance: objective-refresh basis target=HEAD from=c0353849e

Trunk-explicit non-closing refresh. The baseline (`c0353849e`, the "Rehome workspace packages into hosts, infra, capabilities, and tools" commit) had correct rehomed package paths, but several material inventory claims drifted against current `master` ground truth at HEAD. `objective.md` and `roadmap.md` were rebaselined in place against verified ground truth. No closure.

## Summary

Verified ground truth at HEAD (`master` tip):

- **24 tracked TypeScript packages** under `ts/packages/` (`git ls-files 'ts/packages/*/package.json' | wc -l` = 24), up from the record's 23.
- **Three unscoped package names, not two**: `sdlcc` (`ts/packages/hosts/sdlcc`), `sdl-flow` (`ts/packages/capabilities/flow`), and the new `sdl-sdk` (`ts/packages/sdl-sdk`). Confirmed via each package.json `name` field.
- **`@sdl/clinkr` graduated to a standalone package** at `ts/packages/infra/clinkr` (own `package.json`, full `src/` tree). The record had framed `clinkr` as a prospective `@sdl/core` H2 section (`ts/packages/infra/core/CONTEXT.md#clinkr`); that framing is now obsolete. `ts/packages/infra/core/CONTEXT.md` does not exist.
- **The public SDL extension API moved out of `@sdl/sdl`**: there is no `@sdl/sdl/sdk` subpath export anymore (`@sdl/sdl` exports are `./cli`, `./command-io`, `./context`, `./pi-text-generation`), and a standalone `sdl-sdk` package now owns the SDK (`ts/packages/sdl-sdk`, depends on `@sdl/clinkr` / `@sdl/core` / `@sdl/domain-primitives-transitional`). The map's `@sdl/sdl` entry already cites `sdl-sdk`.
- **`@sdl/extension-kit` was renamed to `@sdl/capability-kit`** (`ts/packages/sdl-capability-kit`); zero `@sdl/extension-kit` references remain in `ts/`.
- **`asdl-core` / `asdl-dev` residue directories no longer exist** on disk (the prior "untracked build residue" claim is retired).
- **ADR corpus grew to 18 files spanning `0001`–`0016`** (`git ls-files 'docs/adr/*'`), up from `0001–0011`; numbers `0012` and `0016` are each used by two distinct ADRs (a corpus numbering collision, not this Objective's to fix).
- **Ten present package contexts unchanged** (root + `handoff`, `brmem`, `pi`, `ccc`, `graphite`, `sdl`, `roaster`, `plans`, `branch-context`, `slot`) — re-verified via `git ls-files '*CONTEXT.md'`.
- **Five Planned package names all still exist** as tracked packages: `@sdl/areg`, `@sdl/objective`, `@sdl/packagechk`, `@sdl/aretro`, `@sdl/vibechk`.

## Objective Impact

- Scope, Assumptions, Risks, Non-Goals, and Open Questions re-authored around the 24-package / three-unscoped-name baseline; the `@sdl/sdl/sdk`→`sdl-sdk` extraction, the `clinkr` graduation, and the `extension-kit`→`capability-kit` rename are reflected throughout.
- Undecided-packages list moved from 8 to **9**: `@sdl/extension-kit` removed (renamed), `@sdl/capability-kit` and `sdl-sdk` added. Current undecided: `@sdl/core`, `@sdl/clinkr`, `@sdl/pr-address`, `@sdl/autobranch`, `@sdl/domain-primitives-transitional`, `@sdl/capability-kit`, `sdlcc`, `sdl-flow`, `sdl-sdk`.
- Map-vs-tree count drift **re-opened**: `CONTEXT-MAP.md`'s Inventory Baseline (reconciled to 23 on `2026-06-26T105219Z`) now lags the tree again (23 / two exceptions vs 24 / three). The map's Present section and Planned section remain correct; only the Inventory Baseline count and naming-exception note are stale. Recorded as a finding — `CONTEXT-MAP.md` is Objective work for a separate confirmed session, not edited by this refresh.
- Noted that the map's root `CONTEXT.md` and Flagged Ambiguities have already begun absorbing `@sdl/capability-kit` ("Capability Kit") and `sdl-sdk` (SDK re-export ownership) vocabulary via the adjacent `sdl-extension-architecture` Objective, even though neither package has its own recorded context decision.

## Follow-Ups

- Map catch-up: re-derive the package count to 24 and refresh `CONTEXT-MAP.md`'s Inventory Baseline (three unscoped exceptions).
- Record an explicit per-package context decision for the nine undecided packages, including the newly-standalone `@sdl/clinkr` and the architecture packages `@sdl/capability-kit` / `sdl-sdk`.
- This refresh edited only the Objective record (`objective.md`, `roadmap.md`, this update); it did not touch `CONTEXT-MAP.md` or any `CONTEXT.md`.
