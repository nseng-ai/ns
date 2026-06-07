# Stack-Address Retrospective Follow-Ups

## Summary

The `internal-pr-stack-address` retrospective for the runner-subagent stack showed that the stack-wide workflow has the same core bottleneck as single-PR `pr-address`: deterministic orchestration still leaks into the agent. The run succeeded and preserved important safety properties, but it exposed a stack-specific mismatch: `stack-feedback-plan` produced the validated stack plan, while `build-resolve-thread-batch-payload` accepted only per-PR `plan-feedback` output. The agent had to manually reconstruct per-PR planning inputs, compare changed feedback by hand, and carry large JSON/error output through the transcript.

Durable follow-up is now tracked in this Objective rather than a duplicate Objective: low-cost hardening for clearer stack-plan shape errors and compact output discipline, stack-native resolution payload building, current-feedback reconciliation, and simplification of `internal-pr-stack-address` around tested helper commands.

## Objective Impact

This reopens the Objective boundary from only the improved single-PR happy path to include stack-wide feedback addressing. The existing thesis still holds: agents should provide judgment and code changes while `pr-address exec` helpers own deterministic payload shape, reconciliation, mutation preparation, and final verification.

The roadmap now includes stack-specific work for `build-stack-resolve-thread-payloads`-style payload generation, `stack-feedback-diff-current`-style drift detection, immediate schema/output hardening, and skill simplification. The Objective should not close on the current single-PR helper chain alone; closure evidence must also account for the stack-address failure mode or explicitly decide it is outside scope.

## Follow-Ups

- Add concise shape detection when a stack plan is passed to a per-PR resolution-payload builder.
- Add a stack-native resolution payload helper that consumes a validated stack plan plus explicit decisions.
- Add a deterministic current-feedback diff helper for stack plans before GitHub mutation.
- Rewrite `internal-pr-stack-address` to prefer compact helper outputs and the stack-native command sequence once those helpers exist.
