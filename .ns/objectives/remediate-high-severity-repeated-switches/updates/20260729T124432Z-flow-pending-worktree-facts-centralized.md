# Flow Pending-Worktree Failure Facts Centralized

## Summary

The second high-severity finding is fixed in Runner Checkpoint commit `33c67a995eb75665a5a04e4780b928cc0242ff01`. A Flow-owned exhaustive `pendingWorktreeFailureFacts` projection now owns each pending-worktree failure kind's exact plain message, Git command, and house-style headline. Autobranch formatting, checkpoint formatting, and house-style presentation consume those facts while retaining their renderer-specific transcript details and output shapes.

Focused characterization coverage records all four kinds and their exact facts. Runner-attested verification confirmed the implementation branch, unchanged pre-finish HEAD, clean index, non-empty candidate diff, Graphite tracking, and `git diff --check`. The child additionally reported passing focused formatting and lint, 38 focused tests, Flow typecheck, 868 Flow tests, and the default `just` validation with 168 style-guard tests and 5,991 default tests; those command-result details remain child-reported rather than runner-attested.

## Objective Impact

The roadmap finding “Centralize Flow pending-worktree failure semantics across autobranch, checkpoint, and house-style presentation” is recorded fixed. The four audited cascades have one canonical Flow owner for their shared message, command, and headline policy. Four findings remain open.

## Follow-Ups

- Continue with Foundation `ExecResult` termination policy.
- Preserve one complete finding disposition per accepted autorun slice.
