# Stack Plan Shape Hardening

## Summary

PR #1091 hardens the current stack-address fallback path by making the per-PR `build-resolve-thread-batch-payload` boundary explicit and executable. The helper now detects stack-plan-shaped input passed under `plan` and returns a concise `stack_feedback_plan_not_supported` result, and it rejects direct `stack-feedback-plan` envelopes before model validation with a concise `invalid_request` rather than a large Pydantic shape error.

The public `pr-address` skill, the internal stack-address skill, and the CLI reference now document that `build-resolve-thread-batch-payload` accepts single-PR `plan-feedback` data only. Stack runs should use `build-stack-resolve-thread-payloads` with stack plan data plus explicit `(pr_number, thread_id)` decisions.

Evidence: local branch diff against Graphite parent `master`; PR #1091 corroborates the same file set and commit `2b1bdb9b`. Targeted verification passed with `uv run pytest packages/asdl-pr-address/tests/scenario/test_composite_operations.py -k stack_plan`.

## Objective Impact

This completes the low-cost stack-address hardening roadmap slice. It directly addresses the retrospective failure mode where an agent accidentally tried to pipe merged `stack-feedback-plan` output into the per-PR payload builder and then had to interpret large schema-noise output.

The broader stack work remains open. `stack-feedback-plan` still cannot produce deterministic per-PR/per-batch resolution payloads directly, and current-feedback drift is still not helper-owned before mutation.

## Follow-Ups

- Continue hardening stack-native resolution payload building from validated stack plans plus explicit decisions.
- Add deterministic current-feedback reconciliation for stack plans before GitHub mutation.
- Simplify `internal-pr-stack-address` around the stack-native helper path once those helpers exist.
