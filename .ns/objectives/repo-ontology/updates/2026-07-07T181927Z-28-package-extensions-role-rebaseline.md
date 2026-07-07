# 28-Package Inventory and `extensions/` Role Rebaseline

Provenance: objective-refresh basis target=9fa6a502d from=trunk-HEAD

## Summary

Verified the workspace inventory against HEAD ground truth. `git ls-files 'ts/packages/*/package.json' | wc -l` = 28, not the 25 the record asserted. Three packages landed since the last rebaseline: `@nseng-ai/harness-artifacts` and `@nseng-ai/ns-init` (both under `ts/packages/capabilities/`) and `@nseng-ai/ns-pi-subagents` (tier `internal-pi-tool`) under a brand-new `ts/packages/extensions/` role directory. `CONTEXT-MAP.md`'s Inventory Baseline currently reads 26 packages — itself stale — but recatching the map is a repo-file edit outside this Objective record, so the record now tracks that lag.

Other inventory claims held: 12 present package `CONTEXT.md` files (13 including root, `git ls-files '*CONTEXT.md'` = 13), the `@nseng-ai/*` scope with the `nscc` and `@internal/*` exceptions, and the ADR 0028/0029 rename history all verified true.

## Objective Impact

- Corrected the package count 25 → 28 across `objective.md` (Scope inventory, Assumptions baseline), `roadmap.md`, and `orientation.md`.
- Added the `ts/packages/extensions/` role directory and its resident `@nseng-ai/ns-pi-subagents` to the role-directory lists; re-derived the Pi-adjacent Planned slate to five `@internal/pi-tools/*` subpackage targets plus the now-tracked `@nseng-ai/ns-pi-subagents`.
- Added `@nseng-ai/ns-init` and `@nseng-ai/harness-artifacts` to the undecided-packages map-coverage risk, open question, and roadmap row (both absent from the map entirely).
- Restated the inventory-drift risk to note the map now lags the record at 26 vs 28.

## Follow-Ups

- A future map session should recatch `CONTEXT-MAP.md`'s Inventory Baseline to 28, add the `extensions/` role directory, and record deliberate context decisions for `@nseng-ai/ns-init` and `@nseng-ai/harness-artifacts`.
