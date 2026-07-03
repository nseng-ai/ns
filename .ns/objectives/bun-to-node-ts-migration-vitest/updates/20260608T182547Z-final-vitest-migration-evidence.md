# Final Vitest Migration Evidence

## Summary

The active TypeScript workspace test-runner migration from Bun to Vitest is complete.

Final cleanup performed:

- `ts/package.json` no longer depends on `@types/bun` and now runs the root test command directly with `vitest run --config vitest.config.ts`.
- `ts/tsconfig.json` now uses `types: ["node"]` without the Bun type entry.
- `ts/pnpm-lock.yaml` was regenerated with pnpm after removing `@types/bun`.
- `ts/bun.lock` was deleted because no active `ts/` test-runner workflow depends on Bun.
- `.github/workflows/ci.yml` no longer installs Bun for transitional TypeScript test scripts.
- `AGENTS.md` now describes current TypeScript package tests as Vitest-backed through pnpm/Vitest commands, while retaining only generic out-of-scope standalone Bun guidance.

Final validation evidence:

- `pnpm --dir ts install` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test` passed with the direct root Vitest script.
- `just ts-check` passed.
- `just ts-test` passed.
- `just dprint-check` passed.
- `rg -n "from ['\"]bun:test['\"]" ts/packages --glob '*.ts'` returned no matches.
- `rg -n "bun test|setup-bun|@types/bun|types\": \[\"node\", \"bun\"\]" ts .github AGENTS.md justfile --glob '!ts/node_modules/**' --glob '!ts/pnpm-lock.yaml' --glob '!ts/bun.lock'` found only the intentionally retained generic direct-Bun guidance in `AGENTS.md`.

Local validation ran on Node `v24.2.0`, below the workspace baseline `>=24.12.0`, so pnpm emitted expected unsupported-engine warnings. The Vitest runs also emitted Node type-stripping experimental warnings under the local runtime; the commands otherwise passed.

## Objective Impact

This completes the remaining Objective work. All five in-scope package-local test scripts are Vitest-backed, the workspace root test command runs the shared Vitest config directly, active tests no longer import from `bun:test`, and the known `mock.module` behavior has an explicit Vitest replacement recorded in the prior Semantic Update.

Bun test-runner-only type/config/lockfile and transitional CI support are removed from the active TypeScript workspace. Serial execution remains deliberate through `fileParallelism: false` in the shared Vitest config.

Remaining Bun references are intentionally outside this Objective's scope, including runtime/shebang migration notes and broad Bun template or future standalone Bun-project guidance. Those belong to downstream Node runtime compatibility or Bun-reference reconciliation work rather than this test-runner migration.

## Follow-Ups

- Keep `fileParallelism: false` unless a separate evidence-driven change proves package-level concurrency is safe.
- Address runtime/shebang or broad Bun-reference reconciliation in their own Objective or implementation slice if needed.
