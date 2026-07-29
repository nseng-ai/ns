# Cutover Boundary and Objective Pi Extraction Landed on `master`

## Summary

The atomic package cutover has landed on trunk. `master` commit `1d3c65b47` ("Consolidate TypeScript Packages Under Release-Disposition Roots") is the single squash commit for the coordinated boundary: `ts/packages/` on `master` now contains exactly the three disposition roots (`public/`, `incubating/`, `internal/`) plus `README.md`, with no legacy role directories. The package-tree contract (`ts/packages/README.md`) and the `NS_TS_PACKAGE_DISPOSITION_TOPOLOGY` guard landed with it.

The Objective Pi adapter extraction also landed: `master` commit `44612ff33` ("Extract Objective Pi Adapter into `@nseng-ai/pi-ns-objectives`") puts the adapter at `incubating/hosts/pi/extensions/pi-ns-objectives/` with direct package-manifest discovery; `.pi/extensions/objective.ts` is gone from trunk and the `objectives` extension has no `src/pi/` directory on `master`.

Verified directly against trunk with `git ls-tree master` and `git log master`: this update records landed trunk state, not branch-local implementation.

## Objective Impact

- The "Execute the coordinated package cutover" roadmap row is complete: implemented, validated, and landed as one commit on `master`.
- The **large atomic conflict surface** risk is retired — the boundary landed without a mixed old/new tree reaching trunk.
- The **hidden Pi coupling** risk is now partially exercised: one of the five ns extensions (`objectives`) has been fully extracted through its curated `@nseng-ai/objectives/api` on trunk. `flow`, `handoffs`, `branch-context`, and `herdr` still carry `src/pi/` subpackages on `master`, so the risk remains live for those four.
- The broad Pi separation row remains open: the other approved `pi-ns-*` adapters, the internal Pi-native extractions (`harness-session`, `model-shortcuts`, `worktree-status` still live under `.pi/extensions/`), and the ns-extension/Pi structural guard rules are not implemented (no such rules exist in the style-guard config on `master`).
- The parent-synthesis obligation in the reconciliation row is now actionable: landing was its stated precondition. The stale-reference follow-ups listed in update `2026-07-26T041623Z-package-cutover-landed.md` have not been re-audited against the landed tree here.

## Evidence

- `git ls-tree master --name-only ts/packages/` → `README.md`, `incubating`, `internal`, `public` only.
- `git log master`: `1d3c65b47` (cutover), `44612ff33` (Objective adapter extraction), `24d1a1fc2` (ADR corpus consolidation).
- `git ls-tree master ts/packages/incubating/extensions/<ext>/src/pi`: present for `flow`, `handoffs`, `branch-context`, `herdr`; absent for `objectives`.
- No registry publication occurred or is authorized; landing is git-only.

## Follow-Ups

- Extract the remaining `pi-ns-*` adapters and internal Pi-native extensions, then land the deferred ns-extension/Pi structural guard rules.
- Synthesize the landed result into `professional-repo-curation` through that record's own tracking workflow.
- Re-audit the stale-reference list from update `2026-07-26T041623Z-package-cutover-landed.md` against the landed tree.
