# Foundation Exec Termination Union Landed on Trunk

## Summary

A trunk rebaseline verified that the first implementation row — "Task — Replace foundation command results with an exhaustive termination union" — is complete and landed:

- PR #3373 (merged 2026-07-11, commit `d1deb4227`, "[migration] Adopt discriminated exec results and split PI command adapters") replaced the ambiguous `code`/`killed`/optional-`startupError` result with the required discriminated union. `ExecResult` in `ts/packages/infra/foundation/src/primitives/command.ts` carries `exited`, `spawn-failed`, `cancelled`, and `timed-out` arms, each preserving stdout/stderr plus exit/signal evidence.
- The Node adapter (`ts/packages/infra/foundation/src/exec/index.ts`) is authoritative for termination cause, including SIGTERM→SIGKILL timeout escalation.
- Focused tests cover the row's stated evidence: before-spawn cancellation, in-flight cancellation winning a later timeout, timeout winning a later cancellation, timeout escalation to SIGKILL, spawn failure with captured output, ordinary nonzero exit, stdin conventions, and streamed/buffered output preservation (`test/integration/exec/exec-run-command.test.ts`, `test/isolated/exec/exec-run-command-lifecycle.test.ts`, `test/exec/unit/exec.test.ts`).
- Callers migrated atomically in the same commit; kernel `ctx.exec` re-exports the union (`ts/packages/kernel/src/sdk/execution.ts`) and no legacy `killed`/`startupError` exec semantics remain in the exec surfaces. `NsExecOptions` was not widened: it still has no per-call env or AbortSignal, and `NsCommandExecApi` still refuses a foreign cwd (`ts/packages/capability-kit/src/kit/command-runner.ts`).

The rebaseline also reverified the rest of the record against trunk: both research artifacts exist (`docs/research/claude-codex-isolated-generation-guarantees.md`, `docs/research/harness-consumer-semantics-inventory.md`); the throwaway prototype and critique exist under `references/prototype/`; no harness-session code exists yet anywhere in `ts/packages` (no `runTurn`, `IsolatedGenerationSession`, `reading-agent`, or foundation harness feature), so the remaining five rows stay open; `draftWithFastText` and `PI_DRAFT_HARNESS` still exist in `ts/packages/hosts/pi/src/kit/shared/fast-text-draft.ts`; the Reviews Claude runner still pins `--bare` (now at `ts/packages/capabilities/reviews/src/gateways/claude-code-review-runner.ts` after the reviews package retiering); and the duplicate kernel/capability-kit `TextGenerator` contracts plus `PiTextGenerator` remain unconsolidated. PR #3319 (objective, research, and prototype documentation) merged 2026-07-11.

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD

## Objective Impact

- Roadmap row "Replace foundation command results with an exhaustive termination union" is `[x]` with the PR/commit/test evidence above; the substrate-first migration stack has completed step 1 of 5.
- The next row, "Add foundation's public harness API, private single-turn engine, and Claude isolated adapter," is now unblocked (`Blocked by: none`).
- The command-channel timeout-versus-cancellation risk is retired in `objective.md`; the corresponding completion criterion (required discriminated termination union with atomic caller migration) is now met.
- `objective.md`'s Definition of Progress and Runner Policy no longer describe the phase as design-heavy/pre-crystallization: all remaining rows are implementation slices.

## Follow-Ups

- Next runner-executable slice: the foundation public harness API, private single-turn engine, and Claude isolated adapter row, whose only blocker has landed.
- The `--bare` argv pinning and other PRESERVE invariants from the consumer inventory remain in force until their rows deliberately change them.
