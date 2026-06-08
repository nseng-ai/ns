# Post-Restack Ts Plans Vitest Conversion

## Summary

The Graphite restack surfaced a newly in-scope TypeScript package, `ts/packages/ts-plans`, whose package-local test script and test file still used Bun's test runner. The package has now been converted to the same Vitest-backed shape as the rest of the active `ts/` workspace:

- `ts/packages/ts-plans/package.json` runs `cd ../.. && vitest run --config vitest.config.ts packages/ts-plans/test`.
- `ts/packages/ts-plans/test/ts-plans.test.ts` imports test APIs from `vitest` instead of `bun:test`.

This update is post-restack corrective evidence: the earlier final migration evidence was accurate for the then-current branch contents, and this update records the additional active package introduced by the restacked base.

## Objective Impact

The Objective remains complete after restack. The active `ts/packages/**` workspace has no remaining `bun:test` imports or package-local `bun test --sequential` scripts, including the newly surfaced `ts-plans` package.

The completion narrative now includes `ts-plans` alongside the originally inventoried packages. This does not change the migration design: the shared root Vitest config, explicit imports, and serial `fileParallelism: false` posture still apply.

## Follow-Ups

- Keep future newly added TypeScript packages on the Vitest-backed package script/import convention.
- Continue treating runtime/shebang or broad Bun-reference cleanup as separate from this test-runner Objective.
