# Ji Rename Rebaseline and Integration Lane Regression

## Summary

Trunk-mode, non-closing refresh of the standing Objective against repository ground truth at `5668ac563`. The repo-wide `sdl` → `ji` rename landed since the last rebaseline, so several durable anchors in `objective.md` were stale, and — more importantly — forensic verification found that the package restructure silently returned previously migrated real-boundary integration tests to the default lane.

Stale rename claims corrected in `objective.md`:

- Extensions root: `.sdl/extensions` → `.ji/extensions` (checked-in extensions now live under `.ji/extensions/`; kernel runtime discovery references `.ji/extensions`).
- Time seams: `@sdl/core` → `@ji/core`, with `Clock` at `@ji/core/clock`, `TimerScheduler` at `@ji/core/timers`, and manual helpers (`createManualClock`, `createManualTimerScheduler`) at `@ji/core/time/testing` (source `ts/packages/infra/core/src/time/testing.ts`; confirmed by `ts/AGENTS.md`). Note: `ts/TESTING.md` currently says `@ji/core/testing`, which does not match the package exports — recorded as a follow-up fix, not carried forward as fact.
- Flow Pi-extension model example: the seam is still `sdlExtension(pi, { runCli })` but now lives at `ts/packages/capabilities/flow/src/pi/ji-extension.ts` (`@ji/flow`), routing `/ji:flow:<name>` → `ji flow <name>` (`piNamespace: "ji:flow"`, `argvPrefix: ["flow", name]`, `runCli` from `@ji/kernel/cli`); default fake-seam tests are `ts/packages/capabilities/flow/test/pi/ji-extension.test.ts`; the retained integration smoke is `ts/packages/kernel/test/integration/flow-extension-registry.test.ts` ("real loader discovers and imports every checked-in flow command entry").

Verified-still-true claims carried forward: `ts/TESTING.md` exists and documents the default-vs-integration lane and the real-Git temp-repo standard; `pnpm --dir ts run test:integration` (`ts/package.json`) and `just ts-test-integration` (justfile line 43) exist; `ts-fast-test-boundaries` is closed (`.ji/objectives/ts-fast-test-boundaries/closed.md`); all update files referenced by the roadmap exist.

## Integration lane regression (new finding)

The shared Vitest lane globs (`ts/vitest.shared.ts`) are `packages/*/test/integration/**/*.test.ts` and `packages/*/*/test/integration/**/*.test.ts`; the default config excludes exactly those globs. Four `integration/` directories now sit one level deeper than the globs match, so their tests fell back into default discovery:

- `ts/packages/infra/core/test/exec/integration/exec-run-command.test.ts` — 7 real child-process `runCommand` smokes (the completed 2026-06-20 `asdl-core` split, regressed by the move to `packages/infra/core`).
- `ts/packages/capability-kit/test/git/integration/testing-create-temp-git-repo.test.ts` — real temp-Git-repo smoke (the completed 2026-06-23 `sdl-core` split, regressed by the move to `packages/capability-kit`).
- `ts/packages/capability-kit/test/graphite/integration/status.test.ts` — 3 real Graphite sqlite tests.
- `ts/packages/capabilities/branch-context/test/pi/integration/branch-context-real-brmem.test.ts` — real Branch Memory test.

Empirical proof: `pnpm --dir ts exec vitest list --config vitest.integration.config.ts <file>` discovers none of these files; `--config vitest.config.ts` discovers all of them (12 tests total). This refresh recorded the finding but did not move files or change config — that is an implementation slice, now the top roadmap row.

## Objective Impact

`objective.md` was rewritten with corrected `@ji/*` / `.ji/extensions` / moved-path anchors, a clarified lane-glob scope note, a new restructure-regression risk, a post-restructure lane re-verification scope bullet, and a new open question about a structural lane guard. `roadmap.md` was rewritten: a new top row tracks the lane-placement restoration with file-level evidence; the rebaseline row's evidence note now covers all completed slices through 2026-07-01 and maps historical pre-rename paths to current ones. Durable thesis, non-goals, completion criteria, definition of progress, and runner policy were verified and preserved unchanged. The Objective remains open and standing.

## Follow-Ups

- Implement the lane-placement restoration slice (top roadmap row) and verify discovery with `vitest list` on both configs.
- Fix `ts/TESTING.md`'s `@ji/core/testing` import example to `@ji/core/time/testing` (matches `ts/packages/infra/core/package.json` exports and `ts/AGENTS.md`).
- Decide whether a structural guard against out-of-lane `integration/` directories is worth adding when fixing the regression.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD
