# Runner Git Flow Ported

## Summary

The second stack slice ported the mutation-heavy TypeScript `vibechk run` path on top of the read-only package shell.

The TypeScript CLI now accepts the durable Python surface `vibechk run --plan PATH [--workdir DIR] [--runner NAME] [--model NAME] [--store DIR]`, prints `Run ID: <run-id>`, preserves non-zero runner exits as the CLI exit code, and still writes a consumable failed bundle when runner execution fails.

The slice added package-local run-id allocation, bundle writing, runner and git seams, a production `claude` runner adapter, a real git adapter, and fake-driven test support. Bundle writing keeps schema version 1 and snake_case keys, writes `plan.md`, `transcript.txt`, `diff.patch`, and `artifacts/`, and uses a same-directory temp file before replacing `bundle.json`.

Git safety parity is covered: clean named-branch repositories are required before runner execution, `git add -N .` is used before diff capture when changes exist, result branches are local `vibechk/<run-id>` branches, generated changes are committed there, and the starting branch is restored. No push, PR creation, publish behavior, `codex`, or `pi` runner was added.

Validation: targeted `@asdl/vibechk` check and tests passed with fake-driven run scenarios and a focused real temp-git result-branch/switch-back scenario; `pnpm --dir ts run check`, `pnpm --dir ts run test`, `just ts-guard`, and `just dprint-check` passed.

## Objective Impact

The `run`, `claude`, fake runner, and git/result-branch roadmap row is complete. TypeScript now covers the implemented Python command surface (`run`, `runs`, `show`, and `diff`) at the package level, but Python remains the documented/default invocation until the cutover slice updates docs, source shims, root workspace wiring, and retirement evidence.

The remaining active work is the TypeScript-default cutover and Python retirement, plus recording the migration outcome in the umbrella Objective after parity and caller cleanup are proven.

## Follow-Ups

- Update README/manual E2E examples and add the opt-in `just install-vibechk` source shim in the cutover slice.
- Remove Python workspace/build/test/publish wiring only after stale active references are cleaned up and rollback/reference evidence is recorded.
- Update the umbrella `port-asdl-toolkit-to-typescript` Objective with the `vibechk` cutover outcome after retirement succeeds.
