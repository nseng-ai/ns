# Objective child closed

## Summary

The `objective-capability-extension` child Objective is now formally closed. Its closure records Objective command-system integration and retirement of the previous top-level `objective` / raw run-from-source CLI surface in addition to the earlier Objective capability migration, Pi/CCC cycle-break, acyclicity guard, thermonuclear review/remediation, and context documentation.

Evidence observed while rerunning `objective-next` for this parent Objective:

- `.sdl/objectives/objective-capability-extension/closed.md` exists and says the child closed on 2026-06-27.
- The child `objective.md` closure states outcome `completed` and cites completed roadmap rows through `updates/2026-06-27T140000Z-raw-objective-cli-eliminated.md`.
- The child closure evidence includes `sdl objective --help`, `sdl objective exec load-orientations`, removal of the package `bin.objective`, removal of `ts/packages/objective/src/cli.ts`, and clean stale-edge gates for `@sdl/ccc` in Pi, `@sdl/pi/objectives` consumers, and `@sdl/pi` in Objective.

## Objective Impact

The parent architecture record is rebaselined without closing anything:

- Phase 2 step 4 now records the Objective child as closed rather than merely complete-but-not-closed.
- The parent no longer carries the follow-up to close or otherwise update `objective-capability-extension`.
- Parent Phase 2 remains open because additional capability child migrations, broader `ccc` clean-consumer conversion, deferred graph cleanup, and `@sdl/domain-primitives-transitional` deletion remain.

## Follow-Ups

- Continue parent Phase 2 step 4 by choosing the next capability child migration among the remaining capabilities, ordered by `ccc` consumption and transitional-package retirement pressure.
- Do not attempt parent step 6 until remaining capability migrations and broader `ccc` clean-consumer work are complete and `@sdl/domain-primitives-transitional` has no live consumers.
