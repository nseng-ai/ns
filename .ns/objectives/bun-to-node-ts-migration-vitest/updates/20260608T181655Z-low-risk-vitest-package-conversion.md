# Low-Risk Vitest Package Conversion

## Summary

Four mechanically low-risk TypeScript packages now use Vitest for their package-local test scripts and test API imports:

- `ts/packages/asdl-dev`
- `ts/packages/ccc`
- `ts/packages/pi-extension-runtime`
- `ts/packages/planned-branch`

Their package-local `test` scripts run Vitest from the `ts/` workspace root with the shared `vitest.config.ts` and a package-specific test path. Their test and support files import test APIs from `vitest` instead of `bun:test`.

Validation evidence:

- `pnpm --dir ts --filter asdl-dev run test` passed.
- `pnpm --dir ts --filter @asdl/ccc run test` passed.
- `pnpm --dir ts --filter @asdl/pi-extension-runtime run test` passed.
- `pnpm --dir ts --filter @asdl/planned-branch run test` passed.
- `pnpm --dir ts run check` passed.

Local validation still ran on Node `v24.2.0`, below the workspace baseline `>=24.12.0`, so pnpm emitted the expected unsupported-engine warning. The warning is environmental rather than evidence against the package conversion.

## Objective Impact

This partially completes the package script and `bun:test` import conversion roadmap row. The four low-risk packages have moved to Vitest without changing production behavior. `pi-extensions` remains intentionally separate because it owns the behavior-sensitive `mock.module` conversion and the Bun-specific `toBeFunction()` matcher usage.

The package script shape uses package path filters such as `vitest run --config vitest.config.ts packages/asdl-dev/test` rather than `--dir packages/asdl-dev/test`, because validation showed the `--dir` shape did not discover tests with the shared root include configuration.

## Follow-Ups

- Convert `ts/packages/pi-extensions` to Vitest with targeted evidence for the `@earendil-works/pi-ai` module mock and matcher cleanup.
- After all packages are converted, remove obsolete Bun test-runner support and update active CI/agent guidance.
