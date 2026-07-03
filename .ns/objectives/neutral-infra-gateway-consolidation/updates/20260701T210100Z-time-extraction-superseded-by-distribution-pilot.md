# Time Extraction Superseded by Distribution Pilot

## Summary

The earlier neutral-infra extraction that placed concrete time adapters in the standalone `@sdl/time` package has been superseded by the checkout-free distribution pilot. The concrete adapters and manual fakes remain separated from the pure `@sdl/core/clock` and `@sdl/core/timers` contracts, but their distribution home is now `@sdl/core` subpaths:

- `@sdl/core/time` for `systemClock` and `systemTimerScheduler`;
- `@sdl/core/time/testing` for manual clock/timer fakes and harnesses.

This intentionally reverses the package-level placement of `@sdl/time` because the distribution objective now distinguishes published packages from topology circles. The `time` source still remains visible as an architecture topology circle under the `@sdl/core` package color.

## Objective Impact

This does not reopen the pure-contract separation that the neutral-infra work established: production code should still depend on `Clock` / `TimerScheduler` seams and tests should still use manual fakes. The superseded piece is only the claim that the concrete adapters need their own workspace/npm package.

## Follow-Ups

- If a future SDK/runtime placement decision moves time services again, record it as an ADR or checkout-free distribution update rather than rewriting the historical neutral-infra updates.
