# Child Process Runner and JSONL Parser Added

## Summary

The second implementation slice replaces the not-implemented `runChildSession` helper behavior with an injectable child process runner and JSONL event parser under `ts/packages/pi-extensions`.

The runner now creates an explicit inspectable child session file path, resolves either the safely discoverable current Pi script or the installed `pi` fallback, spawns the child with `--mode json -p --session <file>`, and runs from `options.cwd` or the parent context cwd. It parses JSONL session, agent, turn, message, and tool-execution events into lightweight progress, including state, current tool, tool count, turn count, elapsed time, session path, and stop reason.

The result mapping now handles clean child exits without terminal capture as `stopped-without-terminal`, parent aborts as `cancelled`, and spawn failures, session setup failures, nonzero exits, child error/aborted stop reasons, bounded stderr diagnostics, and malformed JSONL as `error`. The parent result still does not include the full child transcript.

Evidence: local branch diff against Graphite parent `add-run-child-session-placeholder-and-tests`; PR #552 corroborates the same files and commit. Verification: targeted Bun runner/parser/contract tests passed, and the `@asdl/pi-extensions` TypeScript check passed. No real provider/model calls were required.

## Objective Impact

PR 2 is materially complete for the subprocess runner, command resolution, cwd/session-path behavior, JSONL parser, progress tracking, cancellation, stopped-without-terminal result, and deterministic error handling.

The local helper remains the direct `runChildSession(pi, ctx, options)` function. The placeholder implementation now delegates to `runChildSessionProcess`, and tests can inject deterministic runner dependencies through `CHILD_SESSION_RUNNER_DEPENDENCIES`.

The session-path open question is narrowed: the runner creates an explicit parent-side temporary session path and the parser can update the returned path from child session header events. The command-resolution and JSON event drift risks are reduced by fake-driven coverage, but live Pi version/environment variation remains worth validating when a first real consumer is wired.

This slice does not implement injected child terminal-capture runtime behavior. `completed` and `blocked` remain contract statuses for PR 3, not real runtime outcomes from this runner slice. Usage accounting and full tool-result retention were not added to the public parent progress contract.

## Follow-Ups

- Implement the injected child runtime extension and terminal capture tools in PR 3.
- Decide child extension isolation details: `--no-extensions` plus explicit runtime extensions versus normal extension loading with child environment guards.
- Test and document mixed terminal-plus-sibling tool-call protocol behavior and whether sibling side effects can be prevented before detection.
- Run a real/manual smoke when the first parent-facing consumer or integration harness is available.
