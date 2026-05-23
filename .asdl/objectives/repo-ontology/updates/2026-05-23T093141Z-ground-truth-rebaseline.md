# Ground Truth Rebaseline After Repo Thrash

## Summary

Reexamined the Objective against current repository evidence before continuing the ontology sweep.

Ground truth changes:

- The tracked workspace package set now includes `packages/packagechk`, a standalone CLI package with meaningful registry/claimability language (`Registry`, `CheckStatus`, `RegistryCheckResult`, `PackageCheckReport`, PyPI normalization, npm validation, claim specs, publish gateways). Its own `packagechk-cli` Objective is closed, so this is shipped repo vocabulary rather than speculative future work.
- `asdl-initiatives` is not a tracked package in the current workspace. It should not remain framed as an empty package skip in the map; if mentioned, the map should describe it as absent or historical.
- Root `CONTEXT.md` exists and already defines Objective-system language. The map should index that repo-level context instead of pretending only package contexts exist.
- `asdl-dispatcher` remains a tracked CLI stub: its Clinkr group has no operations, so it remains out of scope until live commands land.
- The scaffold's candidate `asdl-objectives → brmem` storage edge is not supported by current package imports. `asdl-objectives` reads checked-in Objective Markdown directly and depends on `asdl-core`; `brmem` remains a CLI/skill primitive rather than Objective package storage.

Evidence considered: local branch diff against Graphite parent `grill-with-with-docs-2026-05-14`, current workspace/package inventory, tracked file inventory, root and package `CONTEXT.md` inventory, package import scans, the closed `packagechk-cli` Objective record, and PR #482 metadata corroborating the current branch file set.

## Objective Impact

- `objective.md`: revised the thesis, scope, completion criteria, assumptions, and risks from the original 6-context scaffold to the current target: root `CONTEXT.md` plus 7 in-scope package contexts (`asdl-core`, `brmem`, `asdl-pr-address`, `asdl-reviewer`, `asdl-slots`, `asdl-objectives`, `packagechk`), with `asdl-dispatcher` as the only tracked package skip while it remains operation-less.
- `roadmap.md`: added Phase 0.5 to rebaseline `/CONTEXT-MAP.md` before Phase 1 continues; added `packagechk` to Phase 3; updated Phase 4 relationship examples to require real import/runtime edges and explicitly remove stale expected edges.
- The Phase 0 scaffold remains recorded as completed because it landed a useful first map, but it is no longer sufficient for closure without the Phase 0.5 rebaseline.
- The drift risk materialized and is now tracked explicitly: package inventory changes can invalidate the map before per-package grilling even starts.

## Follow-Ups

- Next work should be Phase 0.5, not Phase 1 Git: update `/CONTEXT-MAP.md` to include root `CONTEXT.md`, add `packagechk`, remove/reword `asdl-initiatives`, keep `asdl-dispatcher` as the tracked stub skip, and correct candidate relationship/ambiguity placeholders.
- After Phase 0.5 lands, continue with Phase 1 `## Git` in `packages/asdl-core/CONTEXT.md`.
- During the future `packagechk` grilling session, decide whether `CheckStatus` is a true map-level State/status ambiguity or only a package-local term.
