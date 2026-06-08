# Vitest Surface Inventory

## Summary

Inventory completed for the active Bun test-runner surfaces in the `ts/` pnpm workspace. The current migration surface is five package-local Bun test scripts and 72 TypeScript test/support files importing from `bun:test`:

| Package                            | `bun:test` files |
| ---------------------------------- | ---------------: |
| `ts/packages/asdl-dev`             |               12 |
| `ts/packages/ccc`                  |                7 |
| `ts/packages/pi-extension-runtime` |                1 |
| `ts/packages/pi-extensions`        |               44 |
| `ts/packages/planned-branch`       |                8 |

Package-local test scripts still invoking Bun are:

- `ts/packages/asdl-dev/package.json`
- `ts/packages/ccc/package.json`
- `ts/packages/pi-extension-runtime/package.json`
- `ts/packages/pi-extensions/package.json`
- `ts/packages/planned-branch/package.json`

Most imports are mechanically shaped: `describe`, `test`, `expect`, and hook imports can likely move from `bun:test` to `vitest` once the Vitest dependency/configuration exists. The main non-mechanical mocking surface is `ts/packages/pi-extensions/test/changes.test.ts`, which imports `mock`, calls `mock.module("@earendil-works/pi-ai", ...)`, and then uses top-level dynamic imports so the mock is registered before consumers load.

Lifecycle hooks appear in 13 files. They cover temp-directory cleanup, fake/context reset helpers, environment restoration, and metadata-worker or command-runner state cleanup. These files are the strongest evidence for preserving the current broad serial posture while deciding Vitest config:

- `ts/packages/asdl-dev/test/gateways/command-runner.test.ts`
- `ts/packages/asdl-dev/test/gateways/project-config-store.test.ts`
- `ts/packages/ccc/test/ccc.test.ts`
- `ts/packages/ccc/test/cmux-objective-sidebar.test.ts`
- `ts/packages/ccc/test/objective-stack-impl.test.ts`
- `ts/packages/pi-extensions/test/brmem-cli.test.ts`
- `ts/packages/pi-extensions/test/changes.test.ts`
- `ts/packages/pi-extensions/test/plan-content-slug.test.ts`
- `ts/packages/pi-extensions/test/planned-branch-creation.test.ts`
- `ts/packages/pi-extensions/test/planned-branch-extension.test.ts`
- `ts/packages/pi-extensions/test/worktree-status-graphite-metadata.test.ts`
- `ts/packages/planned-branch/test/saved-plan-selection.test.ts`
- `ts/packages/planned-branch/test/scenario/cli.test.ts`

Matcher usage is mostly standard Jest/Vitest-style assertions such as `toBe`, `toEqual`, `toContain`, `toMatch`, `toMatchObject`, `toHaveLength`, `toHaveProperty`, and `toThrow`. One matcher-specific risk is `toBeFunction()` in `ts/packages/pi-extensions/test/objective.test.ts`, which may need an explicit Vitest replacement such as a type assertion matcher during conversion.

Bun type/runtime references are concentrated in test-runner support rather than production TypeScript runtime code. The active workspace still has `@types/bun` in `ts/package.json`, `types: ["node", "bun"]` in `ts/tsconfig.json`, lockfile entries in `ts/pnpm-lock.yaml`, and a legacy `ts/bun.lock`. A source search found no active non-test `Bun.*` runtime references under `ts/packages/*/src`.

Root orchestration already delegates through pnpm rather than invoking Bun directly: `just ts-test` runs `pnpm --dir .../ts run test`, and `js-test` aliases `ts-test`. CI still installs Bun explicitly through `.github/workflows/ci.yml` step `Install Bun for transitional test scripts` before running `pnpm --dir ts run test`. Active docs mostly mention stable commands such as `just ts-test`, which may remain unchanged if the command contract stays stable. `AGENTS.md` still has Bun-runner policy for direct Bun test execution; later migration work should narrow or remove that once package scripts no longer call Bun.

Bun-centric references in `skills/create-bun-typescript-project/**` are deliberate project-template material and should stay out of this Vitest Objective unless the broader Bun-reference reconciliation work explicitly expands scope.

Baseline commands run during this inventory:

- `node --version` → `v24.2.0`; below the workspace engine `>=24.12.0` and produced pnpm unsupported-engine warnings.
- `pnpm --version` → `10.14.0`.
- `bun --version` → `1.3.14`.
- `pnpm --dir ts install --frozen-lockfile` → passed with the Node engine warning and no tracked file changes.
- `pnpm --dir ts run check` → passed with the Node engine warning.
- `pnpm --dir ts run test` → passed through current transitional package-local `bun test --sequential` scripts: `asdl-dev` 109 pass, `ccc` 47 pass, `pi-extension-runtime` 8 pass, `pi-extensions` 713 pass, `planned-branch` 68 pass.

## Objective Impact

This completes the first roadmap row by turning the current Bun test-runner surface into actionable migration inputs rather than changing runtime behavior.

Mechanical conversion inputs:

- Replace the five package-local `"test": "bun test --sequential"` scripts after the Vitest configuration shape is decided.
- Convert 72 `bun:test` import files to explicit `vitest` imports rather than enabling globals.
- Preserve standard matcher semantics for the bulk of assertions.

Behavior-sensitive conversion inputs:

- Convert `mock.module` in `ts/packages/pi-extensions/test/changes.test.ts` with targeted evidence, likely using `vi.mock` before imports or retaining dynamic imports if that best preserves module-load ordering.
- Audit the two `toBeFunction()` assertions in `ts/packages/pi-extensions/test/objective.test.ts` because they may be Bun-specific.
- Treat lifecycle/env/temp/process-state tests as serial-execution evidence until Vitest config proves parallel files are safe.

Configuration inputs:

- A shared `ts/vitest.config.ts` remains plausible because the test surface is workspace-wide and package scripts are uniform, but the config should explicitly decide serial file execution, hook ordering, and TypeScript execution assumptions.
- `fileParallelism: false` is the conservative starting point to preserve the existing `bun test --sequential` posture.
- Keep `vitest run` in scripts to avoid watch mode.

Type cleanup inputs:

- `@types/bun`, `types: ["node", "bun"]`, Bun lockfile residue, and `bun:test` imports appear coupled to test-runner support. Later cleanup can remove them if the Vitest conversion finds no active non-test Bun runtime needs.

CI/docs inputs:

- CI should drop `oven-sh/setup-bun` once package-local tests no longer require Bun.
- Docs that mention `just ts-test` can likely remain stable if the command keeps its name and semantics.
- `AGENTS.md` should be revisited after conversion so Bun-specific test-runner instructions do not overstate current policy.

## Follow-Ups

- Decide Vitest dependency placement and configuration shape, including whether one shared `ts/vitest.config.ts` is sufficient.
- Preserve current serial behavior initially, then relax only with package-specific evidence.
- Convert `ts/packages/pi-extensions/test/changes.test.ts` separately from mechanical import replacement and prove the `@earendil-works/pi-ai` fake still intercepts model calls before `changes.ts` and `changes-model-summary.ts` load.
- Replace or verify the `toBeFunction()` assertions during matcher migration.
- After all `bun:test` imports and Bun-backed scripts are gone, remove `@types/bun` and `types: ["node", "bun"]` if no non-test runtime references emerge.
- Update CI's transitional Bun install step and any agent/docs text that specifically describes TypeScript tests as Bun-backed; leave command-level `just ts-test` references alone unless the command contract changes.
