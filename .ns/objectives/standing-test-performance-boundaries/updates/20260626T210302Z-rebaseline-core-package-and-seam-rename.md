# Rebaseline Implementation Guidance for `@sdl/core` rename and flow-extension relocation

## Summary

Trunk-explicit, non-closing rebaseline of the standing Objective against current
repository ground truth at `HEAD`. The Objective-dir diff baseline..HEAD is empty
(baseline was the last touch), so the value was re-verifying durable material claims
against the evolved codebase rather than diffing the Objective folder.

Two material claims in `objective.md` were stale and have been corrected:

- The TypeScript time/seam package is now `@sdl/core`, not `@asdl/core`. The literal
  string `@asdl/core` no longer appears anywhere under `ts/` (scoped `git grep -rln
  '@asdl/core'` returns nothing). `Clock`, `TimerScheduler`, `createManualClock`, and
  `createManualTimerScheduler` live in `ts/packages/infra/core/src/testing/index.ts`
  (package name `@sdl/core`), imported as `@sdl/core/testing` (verified in
  `ts/TESTING.md:75`). Corrected both `@asdl/core` references in the Scope and
  Implementation Guidance sections to `@sdl/core`.
- The flow Pi-extension model seam was renamed and relocated. The symbol
  `registerSdlExtension` no longer exists (scoped `git grep` returns nothing). The
  current seam is the default export `sdlExtension(pi, { runCli })` with a
  `SdlExtensionOptions { runCli? }` injection point at
  `ts/packages/hosts/pi/src/flow/sdl-extension.ts` (moved from the now-gone
  `packages/pi-extensions/src/sdl-extension.ts`). Routing is unchanged:
  `/sdl:flow:<name>` → `sdl flow <name>` via `registerCliCommandExtension`
  (`piNamespace: "sdl:flow"`, `argvPrefix: ["flow", name]`). Updated the
  Implementation Guidance model example to the current symbol and path and named the
  retained integration smoke `ts/packages/sdl/test/integration/flow-extension-registry.test.ts`.

## Objective Impact

Durable thesis, scope, non-goals, completion criteria, definition of progress, runner
policy, assumptions/risks, and open questions remain accurate and were left unchanged.
Only stale symbol/package/path references inside Scope and Implementation Guidance were
corrected, so future agents inherit working anchors instead of names that no longer
resolve. `roadmap.md` was left unchanged: its active-work shape is unchanged and its
package references already use `@sdl/core`; the only `asdl` token in it is the historical
update filename `2026-06-20T184212Z-asdl-core-run-command-integration.md`, which must be
preserved as-is.

Verified-still-true claims carried forward:

- `ts/TESTING.md` exists and documents the default-vs-integration lane.
- Integration lane: `ts/packages/<package>/test/integration/**/*.test.ts` with
  `pnpm --dir ts run test:integration` (`vitest.integration.config.ts`) and
  `just ts-test-integration`.
- `ts-fast-test-boundaries` is closed (`.sdl/objectives/ts-fast-test-boundaries/closed.md`).
- The flow-extension-registry integration test proves the real loader "discovers and
  imports every checked-in flow command entry."
- Flow command behavior scenario tests now live under
  `ts/packages/capabilities/flow/test/scenario/` (relocated from the gone
  `packages/extensions/flow/`); the per-case fake-seam slice tests live at
  `ts/packages/hosts/pi/test/sdl-extension.test.ts`.

## Follow-Ups

None. A clean rerun should be a no-op: the corrected references now match ground truth.

Provenance: objective-refresh basis target=HEAD from=726f5a8fa
