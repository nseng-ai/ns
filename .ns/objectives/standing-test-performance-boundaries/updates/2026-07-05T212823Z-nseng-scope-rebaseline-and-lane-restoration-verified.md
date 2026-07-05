# Scope Rebaseline to `@nseng-ai/*` and Lane Restoration Verified

## Summary

Trunk-style refresh of the standing Objective against repository ground truth at HEAD. Two findings:

- **Package scope drifted again.** The prior rebaselines wrote seam anchors under `@ns/core` (and the 2026-07-03 update used `@ji/*`). The current npm scope is `@nseng-ai/*`, and the `@ns/core` package split into `@nseng-ai/foundation`. Verified at HEAD: `ts/packages/infra/foundation/package.json` is `@nseng-ai/foundation` and exports `./clock` (`src/time/clock.ts`), `./timers` (`src/time/timers.ts`), and `./time/testing` (`src/time/testing.ts`); default tests import `createManualClock`/`createManualTimerScheduler` from `@nseng-ai/foundation/time/testing`, `Clock` from `@nseng-ai/foundation/clock`, and `TimerScheduler` from `@nseng-ai/foundation/timers`. The flow model example is intact under the new scope: `nsExtension` at `ts/packages/capabilities/flow/src/pi/ns-extension.ts` (`@nseng-ai/flow`, `piNamespace: "ns:flow"`, `argvPrefix: ["flow", name]`, `runCli` from `@nseng-ai/kernel/cli`), default fake-seam test `ts/packages/capabilities/flow/test/pi/ns-extension.test.ts`, retained integration smoke `ts/packages/kernel/test/integration/flow-extension-registry.test.ts`. Objective seam anchors were corrected from `@ns/*` to `@nseng-ai/*`.

- **Lane-placement restoration is verified complete at HEAD.** The four already-classified integration tests now sit with `integration/` directly under each package's `test/` root: `ts/packages/infra/foundation/test/integration/exec/exec-run-command.test.ts`, `ts/packages/capability-kit/test/integration/git/testing-create-temp-git-repo.test.ts`, `ts/packages/capability-kit/test/integration/graphite/status.test.ts`, and `ts/packages/capabilities/branch-context/test/integration/pi/branch-context-real-brmem.test.ts`. The structural sweep `find ts/packages \( -path '*/test/*/integration/*.test.ts' -o -path '*/test/*/*/integration/*.test.ts' \)` returns empty — no out-of-lane `integration/` directories — matching the shared globs in `ts/vitest.shared.ts`. `ts/TESTING.md` already points manual time helpers at `@nseng-ai/foundation/time/testing`, so the TESTING.md drift the completed row flagged is resolved.

Verified-still-true and carried forward: `ts/TESTING.md` documents the default-vs-integration lane and the real-Git temp-repo standard; `pnpm --dir ts run test:integration` (`ts/package.json` `test:integration`) and `just ts-test-integration` (justfile) exist; `.ns/extensions/` is the live checked-in extensions root; the `ts-fast-test-boundaries` model stack is closed (`.ns/objectives/ts-fast-test-boundaries/closed.md`).

## Objective Impact

`objective.md` seam anchors were corrected to `@nseng-ai/foundation` (`/clock`, `/timers`, `/time/testing`) and the restructure-regression risk now names the `@sdl/*` → `@nseng-ai/*` restructure with its 2026-07-04 restoration. `roadmap.md`: the top row was marked done and condensed with HEAD-verified file locations and the empty structural-sweep proof, leaving only the structural-guard follow-up decision open; the rebaseline-evidence note remaps historical `@sdl/*`/`@ji/*` prose to the current `@nseng-ai/*` scope. Durable thesis, scope, non-goals, completion criteria, definition of progress, runner policy, and `orientation.md` were verified and left unchanged (orientation is scope-agnostic). The Objective remains open and standing; no completion or closure — a standing test-boundary maintenance Objective has no goal-met finish line.

## Follow-Ups

- Choose a fresh boundary-leak candidate for the next migration slice; the lane-placement restoration is no longer pending work.
- Decide whether a structural guard against out-of-lane `integration/` directories is worth adding, per the open question in `objective.md`.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD
