# Rebaseline After @ji Rename: No Neutral Rows Remain Open

## Summary

Trunk-mode refresh re-verified every material claim against HEAD 5668ac5 and rebaselined the record. Decisive findings:

- The workspace was renamed and rehomed: `@sdl/*` → `@ji/*`, `sdlcc` → `jicc` (`ts/packages/hosts/jicc/`), `sdl-flow` → `@ji/flow`; all capabilities live under `ts/packages/capabilities/`; no live `@sdl/*` or `@asdl/*` imports remain under `ts/packages`.
- `@ji/core` became a subpath-only container: `defineCli` now lives at `@ji/core/cli-runtime`, while `runBrmem` (`capability-kit/src/kit/brmem-cli.ts`), the GitHub PR-feedback leaf helpers (`capability-kit/src/github/pr-feedback`), and `GitGateway` (`capability-kit/src/git`) moved to `@ji/capability-kit`. The standalone `@sdl/graphite` package is gone; neutral Graphite mechanics live in `@ji/capability-kit/graphite/*`. Substance of every completed row re-verified at the new homes.
- The Flow/ccc land-stack god-file row is resolved by Flow-owned decomposition: `flow/src/land/stack/landing-operations.ts` is 308 lines, `performGraphiteMaintenance` sits in a dedicated `graphite-maintenance.ts`, and ccc consumes `@ji/flow/api` via `src/ji/land.ts` (its old re-export file is gone). Row marked complete as resolved-by-owner.
- `sdl-extension-architecture` is closed (`closed.md` present) and `@sdl/domain-primitives-transitional` is deleted, removing the sequencing gate the record still described as open.
- Stale `objective.md` Scope/Open Questions text (roaster divergent copies, live root export, 1383-line areg god-file, sdlcc/kernel/vibechk "remaining candidates", sequencing question) contradicted the reconciled roadmap and was rebaselined.

## Objective Impact

`objective.md`, `roadmap.md`, and `orientation.md` were rewritten from scratch against the verified contract. All neutral structural-cleanup rows are now complete; every remaining open row (Graphite topology dedup, aretro, Flow submit, ccc/flow small dedup, ccc cmux slot-dispatch, objective validator, plan-attachment) is capability-owned or design-sensitive. The Objective is closure-adjacent pending a decision recorded as an open question: formally route/dispose the capability-owned rows and close, or keep this record open as the standing home for tactical TypeScript structural-cleanup findings.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Follow-Ups

- Decide (via objective-update/objective-close) whether to route the remaining capability-owned rows to their owning contexts and close this Objective.
- The slot occupancy disposal evidence was narrowed: `record.branch === null` matching now exists only inside `@ji/slot` lifecycle operations, not external callers; reopen only with fresh external-leakage evidence.
- Pre-rename Semantic Updates and `references/` use retired `@sdl/*`/`sdlcc` names; map to current homes before acting on them.
