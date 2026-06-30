# Capability Layout Reorganized

## Summary

The final capability package/import-layout cleanup slice is complete for the current repository state.

Current-source inventory found no live imports of the deleted raw-I/O `@sdl/core/*` doors and no private cross-package `src`/`test`/`dist` imports in the target capability and capability-adjacent areas. The remaining pure `@sdl/core/*` imports are utility/abstract subpaths such as `primitives`, `result`, `branch-slug`, `model-slug`, `time-format`, terminal/text helpers, `clock`, `timers`, and `command`.

The meaningful reorganization was to remove legacy `@sdl/exec` re-export usage for pure command contracts and formatting helpers. Capability and capability-adjacent packages now import those pure command-layer symbols directly from `@sdl/core/command` instead of from the standalone real exec backend package. This repointed 80 import/export declarations across Flow, Slot, CCC, Roaster, Worktree Status, and Pi capability packages while leaving actual real execution construction on `@sdl/exec`.

Package manifests were tightened after the repoint: `@sdl/exec` was removed from `@sdl/flow-pi`, `@sdl/handoff-pi`, `@sdl/objective-pi`, and `@sdl/worktree-status`, along with the corresponding pnpm lockfile dependency edges.

## Objective Impact

This completes the final non-parked roadmap row: capability package/import layout is aligned around the final homes without redesigning capability behavior.

Repoints made:

- `@sdl/exec` pure command contracts/types and formatting/normalization helpers -> `@sdl/core/command`.
- Kept direct `@sdl/exec` only where the importing file constructs or invokes the real execution backend (`NodeCommandExecApi`, `runCommand`, `defaultCommandResolver`) or imports `@sdl/exec/testing` fakes.
- Kept direct `@sdl/git` imports where the package uses the canonical Git gateway contract or constructs `RealGitGateway`; test fakes remain under `@sdl/capability-kit/git/testing` except real-git integration helpers under `@sdl/git/testing`.
- Kept direct `@sdl/github/*` imports where Address/Roaster/Worktree Status use the ADR-selected standalone GitHub backend surfaces or API DTOs; no separate Capability Kit GitHub seam exists in this Objective.
- Kept direct `@sdl/graphite/*` and `@sdl/cmux/*` imports where Flow/Slot/CCC/Pi packages compose Graphite/Cmux behavior through the standalone Capability Gateway Backend packages selected earlier by ADR 0019/0020.
- Kept direct `@sdl/time` imports only for concrete system clock/timer adapters at host/default-context boundaries; pure time contracts remain imported from `@sdl/core/clock` and `@sdl/core/timers`.
- Kept direct `@sdl/cli-runtime` imports at CLI/runtime harness boundaries.

Source-search evidence after the repoint:

```text
old raw-I/O core doors in ts/packages or ts/scripts: none
private cross-package src/test/dist imports in target areas: none
remaining @sdl/exec imports in target areas: 15 files, all real execution construction/invocation
remaining @sdl/exec/testing imports in target areas: 11 test files
```

Validation run:

```text
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-typescript-style-guard
just dprint-check
```

Outcome: passed.

## Follow-Ups

The Objective remains open for an explicit closure/review pass; no `closed.md` and no `## Closure` section were written.

Parked follow-ups remain parked: `@sdl/brmem` SDK-provided relocation and the `SDL_TS_BAN_*` direct-real-adapter guard.
