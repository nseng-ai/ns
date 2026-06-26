# Repointed Objective consumers to @sdl/objective/api

## Summary

The consumer repoint slice is complete as an independently reviewable branch.

Implementation evidence:

- `ts/packages/ccc/src/objective-stack-impl.ts` and `ts/packages/ccc/src/cmux/sidebar.ts` now consume Objective selection helpers/specs from `@sdl/objective/api` instead of `@sdl/pi/objectives/selection`.
- `ts/packages/ccc/src/objective-selection-context.ts` adapts CCC/Pi command contexts into the Objective API's selection context at the edge, keeping the Objective API independent of Pi runtime types.
- `ts/packages/sdlcc/src/objective-tab.ts` now consumes Objective list parsing/types from `@sdl/objective/api` instead of `@sdl/pi/objectives/list`; `sdlcc` unwraps its CLI machine envelope locally before handing the Objective list data to the Capability API parser.
- `ts/packages/sdlcc/test/unit/objective-tab.test.ts` and CCC Objective selection tests were updated to exercise the direct Capability API path.
- `ts/packages/ccc/package.json` now declares `@sdl/objective` while retaining `@sdl/pi` for neutral helper subpaths.
- `ts/packages/sdlcc/package.json` now declares `@sdl/objective` and no longer declares `@sdl/pi`.
- `ts/pnpm-lock.yaml` was refreshed for the manifest dependency changes.

Stale-edge gates:

```bash
rg "@sdl/pi/objectives" ts/packages
rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json
```

Result: both produced no matches.

Validation passed:

```bash
pnpm --dir ts --filter @sdl/ccc test
pnpm --dir ts --filter sdlcc test
pnpm --dir ts --filter @sdl/pi test
pnpm --dir ts --filter @sdl/objective test
pnpm --dir ts run check
just ts-format-check
just ts-lint
just ts-deps-check
just ts-guard
just ts-test
```

## Objective Impact

- Marks the roadmap row "Consumer repoint slice" complete.
- Confirms `ccc` and `sdlcc` can consume the Objective Capability API directly, validating the `@sdl/<cap>/api` boundary for Objective.
- Removes the remaining production/test consumer imports of `@sdl/pi/objectives/*`; Pi compatibility wrappers can now be treated as Pi-owned compatibility surface rather than the cross-package Objective API.
- Leaves the Objective open because the Pi→CCC cycle break and parked acyclicity/context-documentation follow-ups remain.

## Follow-Ups

- Plan the separate high-risk Pi→CCC cycle-break slice before touching `@sdl/pi` imports of `@sdl/ccc` or `ts/packages/pi/package.json`'s `@sdl/ccc` dependency.
- Gate the cycle-break slice with `rg "@sdl/ccc" ts/packages/pi/src ts/packages/pi/package.json` plus Pi/CCC tests, import smoke checks for changed `.pi/extensions/*.ts` adapters, and the TypeScript baseline.
- Defer the topological acyclicity guard and final Objective context documentation until the real graph is acyclic enough to document and enforce accurately.
