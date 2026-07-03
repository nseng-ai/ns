# Exec evidence SDK promotion

The first public SDL extension SDK helper promotion is implemented. `@sdl/core/exec` now owns the common command-result evidence primitives `commandSucceeded()` and `formatCommandEvidence()`, and `@sdl/sdl/sdk` re-exports them for extension authors. The jiti virtual SDK module binds the same runtime values so selected `.sdl/extensions/*.ts` modules import the helpers through `@sdl/sdl/sdk` without resolving workspace internals.

`.sdl/extensions/push.ts` is the proof-of-mechanism consumer: it now imports `commandSucceeded()` and `formatCommandEvidence()` from the SDK and deletes its local copies while preserving its dirty-worktree-specific message formatting. SDL README/context language and the promotion report were updated to reflect that the #1 exec evidence promotion has shipped; the remaining promotion report items are still recommendations.

Validation evidence:

- `pnpm --dir ts run test -- packages/sdl-core/test/exec.test.ts packages/sdl/test/unit/sdk-module-loader.test.ts packages/sdl/test/scenario/push-cli.test.ts` passed; Vitest ran the configured TS suite (296 files / 3006 tests).
- `pnpm --dir ts/packages/sdl run check` passed.
- `pnpm --dir ts/packages/sdl-core run check` passed.
- `pnpm --dir ts run fmt:check` passed after `just ts-format-fix` formatted `ts/packages/sdl/src/sdk-module-loader.ts`.
- `pnpm --dir ts run lint` passed.
- `just ts-check` passed.
- `just ts-deps-check` passed.
- `just ts-guard` passed.
- `just dprint-check` passed.
