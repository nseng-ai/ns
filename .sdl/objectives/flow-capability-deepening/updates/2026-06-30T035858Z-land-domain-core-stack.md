# Land Domain Core Stack Implemented

## Summary

A six-PR local Graphite stack now implements the first autonomous land-domain core extraction slice described by the prior design grill:

- Added private capability package `sdl-land` at `ts/packages/capabilities/land` with narrow `./api` and explicit `./testing` subpaths.
- Defined stack-first land request/outcome, failure/result, plan/preflight, and focused Git/Graphite/GitHub PR/worktree gateway vocabulary.
- Added in-memory land gateway fakes and fake-driven tests for scenario setup, non-ideal preflight states, operation logs, and mutation isolation.
- Implemented renderer-independent stack preflight/dry-run planning in `sdl-land` for clean-repo checks, PR/topology basics, worktree conflicts, submit/restack requirements, descendant maintenance, and dry-run outcomes.
- Adapted Flow's stack preflight/dry-run planning path to call `sdl-land` internally while preserving `sdl-flow/api`, Flow presentation, CCC imports, public command names, isolated fast-path behavior, and durable `refs/ccc/...` compatibility.
- Added Flow and Land package context docs plus `CONTEXT-MAP.md` relationships recording the current boundary.

## Evidence

Validation run across the stack included:

- `pnpm --dir ts --filter sdl-land run check`
- `pnpm --dir ts --filter sdl-land run test`
- `pnpm --dir ts --filter sdl-flow run check`
- `pnpm --dir ts --filter sdl-flow run test`
- `pnpm --dir ts --filter @sdl/ccc run test`
- `pnpm --dir ts run fmt:check`
- `dprint check CONTEXT-MAP.md ts/packages/capabilities/flow/CONTEXT.md ts/packages/capabilities/land/CONTEXT.md`

Search evidence confirmed CCC still consumes land/autobranch/trunk-pull surfaces through `sdl-flow/api`, no CCC direct `sdl-land` import was introduced, no CCC private Flow `src/...` import was introduced, `sdl-flow/src/api.ts` was unchanged by the adapter slice, and `sdl-land` exports only `./api` and `./testing`.

Repo-wide `just dprint-check` is still blocked by pre-existing Objective Markdown formatting outside this stack; the touched context Markdown files pass direct dprint.

## Objective Impact

This completes the planned first proof of the `sdl-land` package boundary and the fake-driven stack preflight seam. The migration remains intentionally partial: mutation-heavy merge execution, backup refs, branch deletion, submit/restack execution, post-landing cleanup, Flow command rendering, and isolated single-PR fast-path behavior remain in `sdl-flow`.

The decomposition and fake-driven seam roadmap rows can now treat `sdl-land` as established current state. Follow-up work should focus on reducing adapter size, deciding when and how to migrate more land execution phases, and only later narrowing `sdl-flow/api` with an explicit compatibility plan.
