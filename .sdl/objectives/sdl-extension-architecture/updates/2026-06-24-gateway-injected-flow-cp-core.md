# Gateway-injected flow cp core

## Summary

`flow cp` now has a full gateway-injected `runCpCore()` in the command module. The SDL command face builds a `RealCheckpointGateway` through `@sdl/extension-kit`'s SDL host command runner and passes `ctx.cwd`, `ctx.env`, `ctx.textGenerator`, and `--dry-run` into the core.

Mutating checkpoint operations remain flow-local through the existing checkpoint gateway rather than being added to `@sdl/core`'s neutral `GitGateway`. Checkpoint prompt, validation, and repair policy remains in flow-owned model-generation/text-helper seams; `@sdl/extension-kit` remains responsible for host adaptation, not checkpoint semantics.

## Objective Impact

Phase 2 Step 1's remaining `cp` construction seam is complete. The row can move from `[~]` to `[x]`: `push`, `submit`, flow shared Git/worktree helpers, and now `cp` all demonstrate the intended extension-kit boundary where command faces adapt SDL host primitives to gateway-injected cores.

Validation evidence:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/extensions/flow/test/unit/cp-core.test.ts`
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/extensions/flow/test/scenario/cp-command.test.ts packages/sdl/test/integration/flow-extension-cli.test.ts`
- `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdl/test/integration/flow-extension-cli.test.ts`
- `just ts-check`

## Follow-Ups

Run the full final TypeScript and Markdown validation set before landing this branch. Continue to keep broader Peer API conventions, transitional package work, and other Phase 2 steps separate from this `cp` slice.
