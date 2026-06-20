# asdl-pr-address Prepare-Run Workflow Extracted

## Summary

The final `asdl-pr-address` feedback workflow deepening slice is now represented as landed Objective state. `packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address/prepare_run_workflow.py` introduces an in-process prepare-run workflow module that owns branch and PR lookup outcomes, feedback snapshot reuse, contested-thread reopening, thread normalization, restructured-file detection, and warning accumulation.

`prepare_run.py` now acts primarily as the Clinkr and payload adapter: request/result models, payload preflight, raw payload writing, payload manifest construction, and CLI failure-envelope mapping remain there. The workflow module is covered directly with `FakePRGateway` and `FakeGitGateway` tests for successful normalization, `--include-all-threads`, empty-review filtering, lookup miss/failure, detached HEAD, git branch failure, restructured-file warnings, and contested-thread reopen failure warnings.

Validation evidence:

- `uv run pytest packages/asdl-pr-address/tests/unit/test_prepare_run_workflow.py -q`
- `uv run pytest packages/asdl-pr-address/tests/scenario/test_composite_operations.py -q`
- `uv run pytest packages/asdl-pr-address/tests -q`
- Review-only dignified-Python subagent reported no findings.

Full `just` passed Python lint, format, dprint, and type checks, then failed in unrelated TypeScript package `ts/packages/ccc/src/worktree-status.ts` with `TS18048: 'result.stdout' is possibly 'undefined'` errors.

## Objective Impact

The roadmap row **Deepen `asdl-pr-address` feedback snapshot and prepare-run policy** moves to `[x]`. The prior feedback snapshot slice already extracted shared fetch/filter policy for PR-level reviews, review threads, count-source threads, and PR discussion comments; this slice extracts the remaining prepare-run policy named by the row while preserving existing CLI and payload contracts through scenario coverage.

This completes the last active non-parked row in the Architecture Deepening Priority Roadmap. The Objective is now closed as completed: shipped rows have evidence, and remaining lower-priority rows are parked with reasons.

## Follow-Ups

- Treat any future `stack_feedback.py` migration to feedback snapshot policy as optional cleanup, not required Objective scope.
- Keep existing prepare-run scenario tests as CLI contract coverage unless a later cleanup explicitly demotes duplicated policy assertions after preserving payload behavior.
- Revalidate parked cleanup rows before any future Objective un-parks or re-prioritizes them.
