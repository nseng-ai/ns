# Asdl-Core RunCommand Integration Timing

## Summary

Moved the seven `@asdl/core` `runCommand` real child-process adapter smokes from the default TypeScript lane to the explicit integration lane. The default `exec.test.ts` now retains only the thirteen pure presentation/helper tests for command result normalization, command runners, command display/shell quoting, terminal escape stripping, tail truncation, output-section formatting, and failure formatting.

The retained integration smoke coverage now lives at `ts/packages/asdl-core/test/integration/exec-run-command.test.ts` and still exercises real child close output/exit code, stdin writing, no-stdin ignored behavior, stdout/stderr streaming callbacks plus buffered output, startup error mapping to `127` with `startupError`, timeout handling when the child handles `SIGTERM`, and timeout escalation when the child ignores `SIGTERM`.

## Performance evidence

- Measured command: `./node_modules/.bin/vitest run --config vitest.config.ts packages/asdl-core/test/exec.test.ts`
- Baseline timing: 6 samples after warmup on branch `asdl-core-runcommand-integration-test-split` before the split: mean `0.794s`, median `0.792s`, min `0.785s`, max `0.808s`; samples `0.791s`, `0.793s`, `0.785s`, `0.785s`, `0.808s`, `0.799s`.
- Post-change timing: 6 samples after warmup with the real `runCommand` smokes moved out of default discovery: mean `0.425s`, median `0.424s`, min `0.418s`, max `0.436s`; samples `0.418s`, `0.424s`, `0.436s`, `0.428s`, `0.421s`, `0.425s`.
- Repetition/noise notes: small local sample on the same machine and branch; `hyperfine` was not used, so timing used a Python `time.perf_counter()` loop around the same targeted Vitest command before and after edits.
- Cost handling: the real Node child-process adapter cost was shifted from the default lane into the explicit TypeScript integration lane; the coverage was not deleted.
- Coverage retention: default discovery now shows no `exec.test.ts > runCommand` tests and still lists all `exec presentation helpers` tests; integration discovery lists all seven moved `runCommand` tests under `exec-run-command.test.ts`.

## Objective Impact

This completes the recommended `asdl-core` subprocess-boundary slice from the prior rebaseline. It supports the Objective's guidance that real subprocess adapter coverage belongs in the integration lane when the default lane already has pure behavior coverage for adapter-independent formatting, normalization, and presentation helpers.

No production `@asdl/core` behavior or global Vitest configuration changed. The standing Objective remains open; the next rebaseline should choose another concrete boundary family rather than treating this completed `runCommand` split as pending work.

## Follow-Ups

- Candidate later slices remain the shell/source-shim smoke tests in `ts/packages/areg/test/unit/source-cli-shim.test.ts` and `ts/packages/aretro/test/unit/source-cli-runner.test.ts`, which spawn real `node`/`bash` from default-path tests.
- `ts/packages/areg/test/gateways/real-gateways.test.ts` still needs finer classification before moving because many filesystem cases may be inert fixture inspection rather than external runtime boundaries.
