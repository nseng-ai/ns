# Vitest Workspace Configuration

## Summary

The Vitest runner dependency and shared workspace configuration have been added for the `ts/` pnpm workspace.

The chosen configuration shape is one root `ts/vitest.config.ts` instead of package-local Vitest configuration files. The config sets the Node test environment, keeps Vitest globals disabled so tests must import APIs explicitly from `vitest`, includes package test files under `packages/*/test/**/*.test.ts`, and starts with `fileParallelism: false` to preserve the existing `bun test --sequential` posture while the migration is still behavior-sensitive.

`vitest` now lives in the root `ts/package.json` dev dependencies, with the pnpm lockfile updated for the Vitest/Vite dependency graph. Package-local test scripts still invoke Bun for now; this slice establishes the Node-compatible test runner and config without yet converting the suites.

Validation evidence for this configuration slice:

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts exec vitest run --config vitest.config.ts --dir packages/pi-extension-runtime/src --passWithNoTests` passed, proving the shared config loads under the current workspace.
- `pnpm --dir ts run test` passed through the existing transitional Bun-backed package scripts.

Local validation still ran on Node `v24.2.0`, below the workspace baseline `>=24.12.0`, so pnpm emitted the expected unsupported-engine warning. The warning is environmental rather than evidence against the Vitest configuration choice.

PR evidence: PR #1127 includes commit `099c5ad4` adding `ts/vitest.config.ts`, the `vitest` dev dependency, and the pnpm lockfile update.

## Objective Impact

This completes the roadmap row to decide and add the Vitest workspace configuration.

Resolved decisions:

- Use one shared root Vitest config under `ts/`.
- Keep `vitest` dependency placement at the `ts/` workspace root.
- Use explicit `vitest` imports rather than enabling global APIs.
- Preserve serial file execution initially with `fileParallelism: false`; concurrency can be revisited only with package-specific evidence.
- Rely on Vitest's native TypeScript execution path rather than introducing a build-to-JavaScript test workflow.

The Objective can now move from configuration to suite conversion. The next work should convert package-local test scripts and mechanical `bun:test` imports while keeping the behavior-sensitive `mock.module`, lifecycle, matcher, and shared-state cases visible.

## Follow-Ups

- Convert package-local `"test": "bun test --sequential"` scripts to `vitest run` once package test imports are migrated.
- Convert mechanical `bun:test` imports to explicit `vitest` imports.
- Preserve the `ts/packages/pi-extensions/test/changes.test.ts` `mock.module` case as a targeted behavior-sensitive conversion unless it is intentionally handled in the same implementation slice with evidence.
- Revisit `@types/bun`, `types: ["node", "bun"]`, CI Bun installation, and agent/docs Bun-test-runner references only after the active suites no longer depend on Bun's test API.
