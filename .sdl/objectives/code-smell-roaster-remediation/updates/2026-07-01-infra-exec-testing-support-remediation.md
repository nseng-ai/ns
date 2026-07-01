# Infra Exec Testing-Support Remediation

## Summary

The `infra` cluster's `@sdl/exec` testing-support findings were re-probed and fixed in `ts/packages/infra/exec/src/testing.ts`.

- The duplicated command-call log cloning in `ScriptedCommandRunner.calls` and `ScriptedCommandExecApi.calls()` now shares the `copyCommandCallFields` defensive `command`/copied-`args` projection, with each public log adding only its own optional `cwd` or cloned `options` field.
- The remaining hand-rolled optional-field spreads in `DroppingOptionsCommandExecApi` and `copyExecOptionsWithout` now use the existing `optionalEntry` idiom for `shouldDropStdin`, `timeoutKillGraceMs`, and non-dropped `stdin`.

Validation passed on 2026-07-01: `pnpm --dir ts --filter @sdl/exec run check`, `pnpm --dir ts --filter @sdl/exec run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`. Initial `just ts-format-check` failed on `testing.ts`; `just ts-format-fix` was run and the check passed afterward.

## Objective Impact

This reduces the open `references/infra.md` backlog by disposing the two `ts/packages/infra/exec` findings as fixed without changing the public testing API or observable command execution behavior.

## Follow-Ups

Continue the remaining open `infra` sub-slices (`git`, `github`, `graphite`, `cli-runtime`, `cli-theme`, `test-kit`, and `time`) or move to the still-open `local-pi-tools` cluster when infra is complete.
