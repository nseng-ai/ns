# ji-rename and container-restructure rebaseline

## Summary

Trunk-HEAD refresh rebaselined the record from the 24-package `@sdl/*` world to the current 21-package `@ji/*` world. Verified against `git ls-files` and `package.json` manifests at HEAD:

- The product renamed `sdl` → `ji` (`docs/adr/0024-rename-sdl-to-ji.md`, hard cutover): packages are `@ji/*` with the unscoped `jicc` (`ts/packages/hosts/jicc`, formerly `sdlcc`) and local-space `@internal/pi-tools` as the only naming exceptions; `git ls-files 'ts/packages/*/package.json' | wc -l` = 21.
- Container-package restructure: capabilities now live under `ts/packages/capabilities/`; `@sdl/sdl` → `@ji/kernel` (bin `ji`, exports include `./sdk` — the standalone `sdl-sdk` package was re-absorbed as `@ji/kernel/sdk`); `@sdl/graphite` was absorbed into `@ji/capability-kit` (context now at `ts/packages/capability-kit/src/graphite/CONTEXT.md`); standalone `sdl-land` was absorbed into `@ji/flow` as its `land` subpackage; `pr-address` → `@ji/address`; `autobranch` folded into `@ji/flow`; `@sdl/domain-primitives-transitional` was deleted. Old directories have zero tracked files (only ignored `node_modules` leftovers on disk).
- Present contexts grew from ten to twelve package files (13 tracked `CONTEXT.md` total including root): `@ji/objective` (was Planned here) and `@ji/flow` (was undecided here) landed; kernel and graphite contexts moved with their packages.
- Fresh `CONTEXT-MAP.md` drift found and recorded as roadmap work: the Inventory Baseline wrongly names `@ji/flow` as unscoped; the Present section still lists the removed `ts/packages/capabilities/land/CONTEXT.md` / `sdl-land` entry and stale pre-`capabilities/` link paths for roaster and branch-context; the present-count sentence matches neither its own list nor the tree; the Planned `@ji/flow-pi` entry names a package that is not tracked.
- ADR corpus grew to 29 ADRs spanning `0001`–`0025` with four duplicated numbers (`0012`, `0016`, `0022`, `0024`); still no map-level ADR index.
- The `domain-modeling` format-contract assumption re-verified (`.agents/skills/domain-modeling/CONTEXT-FORMAT.md` and `ADR-FORMAT.md` present), as are the `grill-me`/`grill-with-docs` skills.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Objective Impact

`objective.md` Scope, Non-Goals, Assumptions/Risks, and Open Questions and the whole roadmap were rewritten from scratch against the verified inventory; `orientation.md`'s temporary drift lines were re-derived. The stale "24 packages / `@sdl/*` / three unscoped exceptions" baseline, the completed 23→24 map catch-up row, and the landed `@ji/objective` Planned row were retired. New open questions: re-deriving the Pi-adjacent Planned slate (`@ji/flow-pi` phantom, `@internal/pi-tools/*` targets) and whether living docs (root "SDL Tools" title) should adopt `ji` naming — both decision-bearing, left for confirmed sessions. The undecided-packages list narrowed to `@ji/address`, `@ji/clinkr`, `@ji/core`, and `jicc`, plus partial kit-level `@ji/capability-kit` and container-level `@internal/pi-tools` decisions.

## Follow-Ups

- Map catch-up slice: apply the decision-free `CONTEXT-MAP.md` fixes (naming exception, roaster/branch-context link paths, present-count) and take the land/`flow-pi` re-scoping through a confirmed session.
- Record per-package map decisions for the four undecided packages and the two partial coverage decisions.
