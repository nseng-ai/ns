# Handoff command behavior migration

## Summary

Moved handoff SDL command behavior coverage out of the SDL default CLI extension-loader suite and into package-owned `@sdl/handoff` fake-driven scenario tests. The SDL default lane now keeps only the existing synthetic grouped-command contract for generic loader/group behavior, while a tiny integration smoke covers the checked-in `.sdl/extensions/handoff` adapter manifest and representative leaf import.

## Performance evidence

- Measured baseline command: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/handoff-cli.test.ts`
- Baseline timing: 1 file, 12 tests, `Duration 1.30s`; Vitest reported `tests 789ms`.
- Post-change default discovery: `pnpm --dir ts exec vitest list --config vitest.config.ts packages/sdl/test/scenario/handoff-cli.test.ts` exited 0 with no discovered tests because the repeated checked-in-extension behavior suite was deleted.
- Replacement default behavior command: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/handoff/test/scenario/handoff-sdl-commands.test.ts`
- Replacement default timing: 1 file, 11 tests, `Duration 313ms`; Vitest reported `tests 8ms`.
- Kept SDL grouped-command contract command: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/handoff-cli-contract.test.ts`
- Kept contract timing: 1 file, 4 tests, `Duration 595ms`; Vitest reported `tests 141ms`.
- Retained checked-in loader/import smoke command: `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdl/test/integration/handoff-extension-registry.test.ts`
- Integration smoke timing: 1 file, 1 test, `Duration 518ms`; Vitest reported `tests 103ms`.
- Repetition/noise notes: each timing above is a single local run after editing/formatting, so use it as directional targeted evidence, not a statistically stable full-suite speedup claim. The plan's prior full-suite evidence was 365 files / 3590 tests / 5.14s; this post-change local `just ts-test` run reported 365 files / 3589 tests / 4.29s.
- Cost handling: the repeated per-case checked-in `.sdl/extensions/handoff` copy/discovery/import setup was eliminated from the default behavior suite. One checked-in extension smoke was shifted to the explicit integration lane.
- Coverage retention: semantic list/delete/create/pickup/gc behavior is now covered by direct `@sdl/handoff` command-object tests over `FakeBrmemGateway`, `InMemoryGitGateway`, fake source reading, and fake interaction. SDL parser/group/lazy-loading behavior remains covered by `handoff-cli-contract.test.ts`; checked-in adapter discoverability and leaf import are covered by `handoff-extension-registry.test.ts`.

## Objective impact

- Advances the repeated-integration-setup-for-localized-logic guidance: localized handoff command behavior no longer pays real SDL extension discovery/import setup per behavior case.
- Confirms the existing `ctx.extensions.handoff` override seam was sufficient; no production gateway or command seam was added.
- Leaves the default lane with fake-driven package behavior plus cheap synthetic grouped-command contract coverage.

## Follow-ups

- Next rebaseline should choose a different slow default candidate; the handoff checked-in extension behavior suite is no longer in default discovery.
- If future handoff command rendering behavior needs more coverage, add focused package-owned rendering/unit assertions rather than growing the SDL integration smoke into a behavior suite.
