# Runner Subagents Stop-Reason Switch Remediation

## Summary

Re-verified the remaining runner-subagents Repeated Switches finding in `ts/packages/local-pi-tools/runner-subagents/src/extension.ts`: `dispatchRunnerSubagentDetails` and `readStopReason` both switched over `RunnerSubagentResult.status` to decide which variants expose `stopReason`.

The second cascade is gone. `runnerSubagentStopReason` now derives the optional stop reason from the result shape, and both human result formatting and detail construction share that extraction while preserving the existing per-status detail switch for diagnostics and final-text metadata.

Validation passed for `@local-pi-tools/runner-subagents` check and tests before this update; repo-level format/lint/typecheck/dprint validation was run afterward and is recorded in `roadmap.md`.

## Objective Impact

This fixes the runner-subagents stop-reason Repeated Switches finding under the `local-pi-tools` cluster and reduces the remaining open findings in that cluster by one without changing observable tool output semantics.

## Follow-Ups

The other runner-subagents finding about the unused progress formatter remains open and should be handled as a separate slice because it involves production export/test-only usage decisions.
