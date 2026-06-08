# Post-Restack Additional Vitest Imports

## Summary

After the initial post-restack `ts-plans` package conversion, validation found additional active test files introduced or moved by the restacked base that still imported from `bun:test`:

- `ts/packages/pi-extension-runtime/test/brmem-cli.test.ts`
- `ts/packages/ccc/test/autobranch-command.test.ts`
- `ts/packages/ccc/test/worktree-status.test.ts`
- `ts/packages/pi-extensions/test/ts-plan-recipe.test.ts`

Those imports now come from `vitest`. The recipe validation text in `ts/packages/pi-extensions/test/ts-plan-recipe.test.ts` was also updated from a Bun test command to a direct Vitest command.

## Objective Impact

This keeps the Objective's completion evidence accurate after the restack: active tests under `ts/packages/**` no longer depend on Bun's test API, including files that were not present in the original surface inventory.

The migration convention remains unchanged: explicit `vitest` imports, shared root `vitest.config.ts`, and no return to Bun test-runner support.

## Follow-Ups

- Keep future restacks or newly introduced TypeScript packages aligned with the Vitest import/script convention before removing Bun test-runner type support.
