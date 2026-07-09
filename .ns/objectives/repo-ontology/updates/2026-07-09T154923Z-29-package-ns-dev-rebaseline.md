# 29-Package Inventory Rebaseline: `@internal/ns-dev`

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD

## Summary

Verified the workspace inventory against HEAD ground truth. `git ls-files 'ts/packages/*/package.json' | wc -l` = 29, not the 28 the record asserted. One package landed since the last rebaseline (basis 9fa6a502d): `@internal/ns-dev` (`ts/packages/internal/ns-dev`, private, bin `ns-dev`, tier `internal-pi-tool`) — the project-local dev CLI for local project and extension workflows, added in commits `dae99221c` / `37a68e21b` (both 2026-07-09, after the prior rebaseline). The reserved internal space `@internal/*` now has three residents (`ns-dev`, `pi-tools`, `typescript-style-guard`), not two. `@internal/ns-dev` has no `CONTEXT.md` and is absent from `CONTEXT-MAP.md` entirely (0 mentions).

Other inventory claims re-verified true: 12 present package `CONTEXT.md` files (13 including root, `git ls-files '*CONTEXT.md'` = 13), the `@nseng-ai/*` scope with the `nscc` and `@internal/*` exceptions, the ADR 0028/0029 rename history, and the retired identities (`sdl-sdk`, `sdl-land`, `domain-primitives-transitional`, `packages/local/`) remaining absent as tracked packages. `CONTEXT-MAP.md`'s Inventory Baseline still reads 26 packages — recatching the map is a repo-file edit outside this Objective record, so the record continues to track the lag (now 26 vs 29).

The `docs/adr/` corpus grew from 34 to 36 ADRs, now spanning `0001`–`0031` (37 files including README); ADRs 0030 (`rename-synthesis-objective-to-umbrella-objective`) and 0031 (`point-system`) are new. The five duplicated numbers (`0012`, `0016`, `0022`, `0023`, `0024`) are unchanged.

## Objective Impact

- Corrected the package count 28 → 29 across `objective.md` (Scope inventory, Assumptions baseline, inventory-drift risk), `roadmap.md`, and `orientation.md`.
- Added `@internal/ns-dev` to the role-directory `internal/` list, the three-residents internal-space statement, the undecided-packages map-coverage risk, the undecided-packages open question, and the undecided-packages roadmap row (all as a package with no recorded map context decision).
- Restated the inventory-drift risk and map-lag wording to note the map now lags the record at 26 vs 29.
- Updated the ADR-corpus open question and the Parked ADRs note: 34 → 36 ADRs, span `0001`–`0029` → `0001`–`0031`; five duplicated numbers unchanged.

## Follow-Ups

- A future map session should recatch `CONTEXT-MAP.md`'s Inventory Baseline to 29, add the `extensions/` role directory, and record deliberate context decisions for `@internal/ns-dev`, `@nseng-ai/ns-init`, and `@nseng-ai/harness-artifacts` (all absent from the map).
