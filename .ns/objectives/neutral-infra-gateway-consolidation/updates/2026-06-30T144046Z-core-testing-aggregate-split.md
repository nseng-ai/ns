# Core Testing Aggregate Split

## Summary

Split the broad `@sdl/core/testing` aggregate into ownership-aligned testing subpaths and removed the old Core export.

Moved helper families:

- command execution fakes (`ScriptedCommandRunner`, `ScriptedCommandExecApi`, `DroppingOptionsCommandExecApi`, `step`, `startupErrorStep`, option-copy helpers, and related types) to `@sdl/exec/testing`;
- manual time fakes (`createManualClock`, `createManualTimerScheduler`, `createManualTimerHarness`, and related types) to `@sdl/time/testing`;
- GitHub check-run fixtures (`githubCheckRun`, `GithubCheckRunFixture`) to `@sdl/github/testing`;
- real temporary git repository helpers (`createTempGitRepo` and related types) to `@sdl/git/testing`;
- Node CLI runtime smoke helper (`describeNodeRuntimeCliEntrypoint` and related types) to `@sdl/cli-runtime/testing`;
- generic test helpers (`ScriptedQueue`, `createDeferred`, `createTempDirTracker`, `withTempRepoSkill`, and related types) to a new neutral-infra package `@sdl/test-kit`;
- scripted text-generation fakes to `@sdl/capability-kit/text-generation/testing`.

Moved the manual-time tests to `@sdl/time` and the temporary-real-git integration test to `@sdl/git`. Deleted the Core aggregate export, its implementation file, and the aggregate-export-only Core test.

## Objective Impact

`@sdl/core/testing` is now fully removed:

- `ts/packages/infra/core/package.json` no longer exports `"./testing"`.
- `ts/packages/infra/core/src/testing/index.ts` was deleted.
- Live consumers were repointed to owner package exports rather than a compatibility shim.
- No production `src/**/*.ts` file imports a testing subpath or `@sdl/test-kit`.

Source-search evidence after the split:

```sh
rg -n '@sdl/core/testing' ts/packages ts/scripts --glob '*.ts' -S
# no output

rg -n '"\\./testing"' ts/packages/infra/core/package.json
# no output

rg -n 'spawnSync|node:child_process|node:fs|node:fs/promises|tmpdir|homedir|process\\.execPath|git", \\[' ts/packages/infra/core/src -S
# no output

rg -n 'from "@sdl/.*/testing"|from "@sdl/test-kit"' ts/packages --glob '**/src/**/*.ts' --glob '!**/src/testing.ts' --glob '!**/src/*-testing.ts' --glob '!**/src/testing/**' -S
# no output outside testing-subpath implementation files
```

Validation run:

- `pnpm --dir ts --filter @sdl/test-kit run check` — passed.
- `pnpm --dir ts --filter @sdl/exec run check` — passed.
- `pnpm --dir ts --filter @sdl/time run check` — passed.
- `pnpm --dir ts --filter @sdl/github run check` — passed.
- `pnpm --dir ts --filter @sdl/git run check` — passed.
- `pnpm --dir ts --filter @sdl/cli-runtime run check` — passed.
- `pnpm --dir ts --filter @sdl/core run check` — passed.
- Targeted owner tests for `@sdl/test-kit`, `@sdl/exec`, `@sdl/time`, `@sdl/github`, `@sdl/git`, `@sdl/cli-runtime`, and `@sdl/core` — passed.
- `just ts-deps-check` — passed.
- `just ts-format-check` — passed.
- `just ts-lint` — passed.
- `just ts-check` — passed.
- `just ts-test` — passed: 381 files, 3669 tests.
- `just ts-test-integration` — passed: 28 files, 101 tests.
- `just ts-test-typescript-style-guard` — passed.

## Follow-Ups

- The final gateway-purity proof remains a separate roadmap slice.
- Final capability package/import-layout cleanup remains separate from this split.
- Keep `@sdl/test-kit` narrow: it should remain a genuinely generic test-helper package, not a replacement broad aggregate for owner-specific testing helpers.
