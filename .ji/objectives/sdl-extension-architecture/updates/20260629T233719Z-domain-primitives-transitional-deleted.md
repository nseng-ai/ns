# Domain Primitives Transitional Deleted

## Summary

The final architecture endgame deletion marker is complete. `@sdl/domain-primitives-transitional` has no live TypeScript/package consumers and no tracked package files. The only remaining filesystem residue was ignored empty `node_modules` directory structure under `ts/packages/infra/domain-primitives-transitional/`, which was removed.

Concrete evidence:

- `rg -n "@sdl/domain-primitives-transitional" ts/packages --glob '!node_modules'` returned no matches.
- `rg -n "domain-primitives-transitional" ts/pnpm-lock.yaml ts/pnpm-workspace.yaml ts/packages/*/package.json ts/packages/*/*/package.json --glob '!node_modules'` returned no matches.
- `git ls-files ts/packages/infra/domain-primitives-transitional` returned no tracked files.
- Former primitive surfaces are live under `@sdl/capability-kit/*`: `checkpoint-flow`, `checkpoint-message`, `pending-worktree`, `temp-files`, `text-generation`, and `text-repair`; the kernel module loader aliases those current subpaths for repo-local extension execution.

## Objective Impact

Phase 2 Step 6 is now complete. The Objective's completion marker is satisfied: below-SDK is domain-free, the former transitional tier is deleted, and live Objective guidance no longer tells fresh agents that `@sdl/domain-primitives-transitional` has live consumers.

The broader Phase 2 completion criteria are closure-ready and now closed in this slice: Capability Kit exists, Capability API/gateway-injected-core/deep-import/cycle rules are documented and enforced, the Extension Dependency Graph is acyclic, all nine user-facing capability migrations have completed/dispositioned child evidence, and `ccc` consumes provider APIs instead of internals.

## Follow-Ups

- Do not reintroduce a `transitional` package or tier as a future debt label.
- Keep future shared primitive placement precise: `@sdl/capability-kit/*` for first-party capability-building primitives, `@sdl/core/*` for neutral infra, and Capability APIs for provider domain behavior.
- The Objective is closed with `closed.md`; future architecture work should start from a new Objective or an explicitly scoped follow-up rather than reopening this endgame track.
