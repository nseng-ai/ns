# Extension Dependency Graph Guard Landed

## Summary

`just ts-guard` now checks the Objective-scoped Extension Dependency Graph through `SDL_TS_BAN_EXTENSION_DEPENDENCY_CYCLE` in `ts/scripts/guard-typescript-style.mjs`.

The guard source of truth is manifest-only: package-level `workspace:*` edges in `dependencies`, `optionalDependencies`, and `peerDependencies` under `ts/packages/**/package.json`. It does not scan source imports in this slice.

The checked graph boundary is named explicitly and includes the Objective capability package set plus `@sdl/autobranch`, `@sdl/pi`, `@sdl/sdl`, `@sdl/worktree-status`, and `sdlcc`. Neutral infrastructure packages such as `@sdl/core`, `@sdl/clinkr`, `@sdl/capability-kit`, and `@sdl/graphite` remain outside this invariant.

The existing `@sdl/autobranch` / `@sdl/branch-context` / `@sdl/pi` / `@sdl/sdl` manifest cycle is deliberately deferred by exact edge. The deferral is visible in code and this Objective tracking rather than hidden by omitting those packages from the graph.

Adversarial self-review now covers:

- an acyclic manifest graph pass;
- a synthetic Pi↔CCC manifest cycle failure;
- the exact deferred current-cycle pass;
- a new non-deferred cycle involving deferred packages failure.

Validation evidence from 2026-06-27:

- `just ts-guard`
- `pnpm --dir ts run check`
- `just ts-format-check`
- `just ts-lint`
- `just ts-deps-check`
- full `just`

## Objective Impact

The acyclicity guard completion criterion is met for the selected Objective-scoped, manifest-only graph. A reintroduced Pi↔CCC package-manifest cycle would fail `just ts-guard`, while the known autobranch/branch-context/pi/sdl cycle remains an explicit follow-up instead of broadening this slice.

The Objective can move to the thermonuclear review pass before final `ts/packages/objective/CONTEXT.md` / `CONTEXT-MAP.md` documentation and closure evidence.

## Follow-Ups

- Run the thermonuclear review pass next.
- Keep or assign separate graph cleanup work for the deferred `@sdl/autobranch` / `@sdl/branch-context` / `@sdl/pi` / `@sdl/sdl` cycle.
- Write final Objective capability/context documentation only after the review pass.
