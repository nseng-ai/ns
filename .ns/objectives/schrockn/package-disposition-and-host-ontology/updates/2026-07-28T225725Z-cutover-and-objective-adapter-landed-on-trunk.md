# Cutover and Objective Pi Adapter Confirmed Landed on Trunk

## Summary

Trunk evidence confirms the atomic package cutover has landed on `master`: commit
`1d3c65b47` ("Consolidate TypeScript Packages Under Release-Disposition Roots") is an
ancestor of `master`, the tracked tree under `ts/packages/` contains only the `public/`,
`incubating/`, and `internal/` disposition roots plus `README.md`, and `git ls-files`
reports zero tracked files under any legacy role directory (`capabilities/`, `incubator/`,
`hosts/`, `infra/`, `sdk/`, `tools/`, `extension-kit/`, `capability-kit/` directories still
present in local worktrees are ignored build and `node_modules` residue only).

The Objective Pi adapter extraction also landed: commit `44612ff33` ("Extract Objective Pi
Adapter into `@nseng-ai/pi-ns-objectives`") is an ancestor of `master`, the package lives at
`ts/packages/incubating/hosts/pi/extensions/pi-ns-objectives/` with direct package discovery
from `.pi/settings.json`, the `.pi/extensions/objective.ts` forwarding adapter is removed
from trunk, and `@nseng-ai/objectives` on trunk has no `src/pi/` directory and no `./pi`
exports. `NS_TS_PACKAGE_DISPOSITION_TOPOLOGY` and the authoritative `ts/packages/README.md`
are live on trunk.

This supersedes the landing status recorded in updates
`2026-07-26T041623Z-package-cutover-landed.md`, `2026-07-27T061652Z-objective-pi-adapter-extracted.md`,
and `2026-07-27T135000Z-objective-pi-package-direct-entry.md`, which described the same work
as implemented-but-not-landed; those remain historical records.

## Objective Impact

The cutover roadmap row is complete: the one coordinated atomic boundary reached trunk with
no mixed legacy state. The large-atomic-conflict-surface risk for the reorganization boundary
is retired; it remains live only for the deferred Pi extraction stack. The hidden-Pi-coupling
risk is now partially exercised in the confirming direction: the Objectives extraction
reached trunk consuming only `@nseng-ai/objectives/api`, while `flow`, `handoffs`,
`branch-context`, and `herdr` still carry `src/pi/` subpackages on trunk with no mechanical
ns-extension/Pi boundary enforcement.

Landing also unblocks the previously post-landing work: the `professional-repo-curation`
parent synthesis (through that record's own tracking workflow) and the stale-reference
sweep listed in `2026-07-26T041623Z-package-cutover-landed.md`.

## Follow-Ups

- Extract the remaining Flow, Handoff, Branch Context, and Herdr Pi integrations
  (stack orders 3–9, 17–25) and the Pi-native internal extractions.
- Implement the deferred ns-extension/Pi structural guards and the ADR 0045 §5 `pi-ns-*`
  rule; retire the pi-subpackage guard exemptions.
- Run the parent-Objective synthesis and the stale-reference sweep.
- No npm publication has occurred or is authorized.
