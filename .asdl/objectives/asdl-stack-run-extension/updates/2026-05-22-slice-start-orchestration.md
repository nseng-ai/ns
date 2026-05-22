# Slice Start Orchestration

## Summary

`/stack-run` now continues past canonical plan storage/loading into slice start orchestration. It finds the first planned branch without the derived completion handoff, requires a clean worktree, creates the slice branch from the intended parent with raw git, tracks it with Graphite, writes the branch-local pointer ledger to Branch Memory namespace `stack-runs`, and starts a fresh Pi session with a compact kickoff prompt.

The kickoff prompt includes the Objective slug/path, canonical Branch Memory plan branch/namespace/key/hash, current planned branch, intended parent, slice ledger locator, expected handoff locator, previous handoff locator when applicable, and instructions to implement only the current slice and use `stack_slice_done` or `stack_slice_blocked`.

## Objective Impact

PR 3's roadmap row is complete as landed-state evidence: the extension owns the mechanical branch/session start boundary while leaving semantic implementation to the agent. Completion is still inferred from derived handoff existence; no mutable lifecycle fields were added to the ledger.

Validation: extension check/test plus `just dprint-check`.

## Follow-Ups

- Register the structured completion/blockage tools and closeout command so agents can store completion handoffs.
- Add recovery/status diagnostics for existing started branches and Graphite drift after closeout exists.
