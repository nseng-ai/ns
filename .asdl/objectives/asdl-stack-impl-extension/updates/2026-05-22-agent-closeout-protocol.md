# Agent Closeout Protocol

## Summary

The extension now registers `stack_slice_done` and `stack_slice_blocked`. `stack_slice_done` accepts the agent's summary, validation note, and handoff Markdown, stores the pending payload in memory by tool call id, and queues `/stack-closeout <id>` as a follow-up command. `stack_slice_blocked` reports the blockage and does not write a completion handoff.

`/stack-closeout` re-reads the current branch, locates and validates the branch-local pointer ledger from Branch Memory namespace `stack-runs`, reloads the canonical plan from the ledger pointer, verifies the plan hash, derives the current branch's handoff key, and stores the agent-drafted handoff in namespace `session-artifacts`.

## Objective Impact

PR 4's roadmap row is complete as landed-state evidence: agents can now signal successful slice completion or blockage through structured tools, and successful closeout writes the durable completion artifact used by `/stack-run` to infer future progress. The ledger remains pointer-only; no lifecycle fields were added.

Validation: extension check/test plus `just dprint-check`.

## Follow-Ups

- Add `/stack-status` and recovery diagnostics for missing ledgers, missing handoffs, existing branches, dirty worktrees, Graphite drift, and plan hash drift.
- Expand README documentation for the complete v1 workflow and limitations.
