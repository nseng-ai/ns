# Clock and Timer System Adapters Extracted

## Summary

Moved concrete system time adapters out of `@sdl/core` into a new neutral-infra package, `@sdl/time`. The new package exports `systemClock` and `systemTimerScheduler` from its root, backed by `Date.now()` and the raw Node timer globals. `@sdl/core/clock` now contains only the `Clock` contract, and `@sdl/core/timers` now contains only `ScheduledTimer`, `TimerScheduler`, and the abstract-scheduler `delay()` helper.

Runtime consumers that need the concrete adapters now import from `@sdl/time`, while type-only consumers keep structural imports from `@sdl/core/clock` and `@sdl/core/timers`. The TypeScript style guard's sanctioned raw timer adapter path moved from core's timer contract file to `ts/packages/infra/time/src/index.ts`.

A minimal dependency cleanup removed an unused `@sdl/clinkr` dependency from `@sdl/core/package.json`; without that stale edge, adding `@sdl/time` to `@sdl/clinkr` does not introduce a new `core -> clinkr -> time -> core` cycle. `pnpm install` now reports only the pre-existing CCC/capability-pi CCC workspace cycle.

## Objective Impact

This completes the `clock`/`timers` concrete-adapter extraction slice of the residual `@sdl/core` cleanup. Core keeps the pure structural time interfaces required by the roadmap, but production wall-clock and raw timer bindings are no longer in core.

Source-search evidence after the move:

- `rg -n "systemClock|systemTimerScheduler" ts/packages/infra/core/src ts/packages/infra/core/test -S` returned no matches.
- `rg -n "Date\.now|=\s*setTimeout|=\s*setInterval|clearTimeout\(|clearInterval\(" ts/packages/infra/core/src -S` returned no matches.
- `rg -n "import .*system(Clock|TimerScheduler).*@sdl/core/(clock|timers)" ts/packages ts/scripts --glob '*.ts' -S` returned no matches.
- `rg -n "systemClock|systemTimerScheduler" ts/packages ts/scripts --glob '*.ts' -S` showed the concrete definitions in `@sdl/time` and consumers importing those values from `@sdl/time`.

Validation passed:

- `just ts-deps-check`
- `pnpm --dir ts --filter @sdl/core run check`
- `pnpm --dir ts --filter @sdl/core run test`
- `pnpm --dir ts --filter @sdl/time run check`
- `pnpm --dir ts --filter @sdl/time run test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just ts-test-typescript-style-guard`
- `just ts-test`
- `just ts-test-integration`

## Follow-Ups

Remaining residual cleanup is unchanged: address `brmem-cli` and the broad `@sdl/core/testing` memberwise split, then run the final purity proof/capability package cleanup. Do not move the manual time testing helpers as part of this completed slice; they remain deferred with the `@sdl/core/testing` aggregate cleanup.
