# Semantic Update: Nested integration category globs

## What changed

The TypeScript Vitest lane classifier now treats specialized test categories as semantic path segments under a package `test/` tree. For the integration lane, both forms are intentional:

- `test/integration/**/*.test.ts`
- `test/**/integration/**/*.test.ts`

This preserves the simple package-level `test/integration/` convention while allowing package-local taxonomy such as `test/exec/integration/`, `test/git/integration/`, `test/graphite/integration/`, and `test/pi/integration/` without leaking real-backend tests into the default lane.

The shared helper change applies the same segment rule to every specialized category, including `typescript-style-guard`, so the default config continues to exclude all specialized lane globs from `allSpecializedTestGlobs()`.

## Affected nested files

The known nested integration files are now listed by `vitest.integration.config.ts` and not listed by the default `vitest.config.ts`:

- `packages/infra/core/test/exec/integration/exec-run-command.test.ts`
- `packages/capability-kit/test/git/integration/testing-create-temp-git-repo.test.ts`
- `packages/capability-kit/test/graphite/integration/status.test.ts`
- `packages/capabilities/branch-context/test/pi/integration/branch-context-real-brmem.test.ts`

Before the fix, the integration config listed no tests for those explicit files, while the default config listed all 12 tests from them. After the fix, the integration config lists the 12 tests and the default config lists no tests for those files.

## Guards and docs

Added `packages/infra/core/test/vitest-lane-globs.test.ts` as a narrow helper-contract guard. It proves that direct and nested integration globs exist for single-level packages, grouped packages, and checked-in review tool workspaces, and that nested integration globs are included in the default-lane exclusion set.

Updated `ts/TESTING.md` to document the category-segment model and corrected the manual time helper import from `@ji/core/testing` to `@ji/core/time/testing`.

Updated this Objective's TypeScript integration placement text so future agents do not treat direct `test/integration/` as the only valid location.

## Validation evidence

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/infra/core/test/vitest-lane-globs.test.ts` passed: 1 file / 3 tests.
- `pnpm --dir ts exec vitest list --config vitest.integration.config.ts <four nested integration files>` listed 12 tests.
- `pnpm --dir ts exec vitest list --config vitest.config.ts <four nested integration files>` listed no tests.
- `pnpm --dir ts exec vitest run --config vitest.integration.config.ts <four nested integration files>` passed: 4 files / 12 tests.
- `find ts/packages -path '*/test*' -type d -name integration | sort` still shows the nested directories in place.
- `pnpm --dir ts exec vitest list --config vitest.config.ts 2>/tmp/default-list.err | rg 'test/.*/integration|test/integration' || true` produced no output.
- `pnpm --dir ts exec vitest list --config vitest.integration.config.ts 2>/tmp/integration-list.err | rg 'test/.*/integration|test/integration' | sed -n '1,120p'` listed integration-lane tests, including the nested files.
- `rg -n '@ji/core/testing' ts/TESTING.md .ji/objectives/standing-test-performance-boundaries || true` produced no output.
- `just ts-format-check` passed after `just ts-format-fix` formatted the new test file.
- `just ts-lint` passed.
- `just ts-check` passed.
- `just ts-test` passed: 415 files / 4045 tests.
- `just ts-test-integration` passed: 33 files / 124 tests.
- `just ts-test-typescript-style-guard` passed: 1 file / 107 tests.
- `just dprint-check` passed.

## Performance evidence

- Measured command: placement/listing and full default/integration validation commands above.
- Baseline timing: not measured as a comparable full-suite baseline in this slice.
- Post-change timing: `just ts-test` completed with Vitest-reported duration 5.54s; `just ts-test-integration` completed with Vitest-reported duration 20.61s.
- Repetition/noise notes: single local runs only.
- Cost handling: this is a lane-placement fix, not a claimed speedup. It removes the known nested real-backend integration files from default discovery and retains them in the explicit integration lane.
- Coverage retention: no tests were moved or deleted; the existing real-backend smoke coverage remains in place and is now discovered by the integration config.
