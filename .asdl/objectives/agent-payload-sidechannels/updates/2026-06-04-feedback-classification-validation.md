# PR Feedback Classification Validation Implemented

## Summary

Added deterministic PR feedback classification validation for compact `pr-address` payload manifests. `feedback_classification.py` defines strict packet, result, count, and error models plus a pure `validate_feedback_classification` function that accepts either `get-feedback` or `prepare-run` compact manifests.

The validator requires every PR-level review, every unresolved review thread, every comment inside each classified unresolved review thread, and every PR discussion comment to be accounted for exactly once. It rejects duplicate, missing, unknown, resolved-thread, invalid-locator, invalid-enum/schema, and invalid action/informational field cases with structured errors.

`pr-address exec validate-feedback-classification` now reads a wrapper JSON packet from stdin or `--payload-json`, validates it without gateways or side effects, returns `ClinkrExit.ok` for valid classifications, and returns a structured negative result for well-formed but invalid classifications.

## Objective Impact

This completes the roadmap row for PR feedback classification validation. The payload artifact workflow now has a tested deterministic gate that can prove an LM/subagent classification packet accounted for the compact manifest before execution planning proceeds.

Changed files include:

- `packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address/feedback_classification.py`
- `packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address/validate_feedback_classification.py`
- `packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address/group.py`
- `packages/asdl-pr-address/tests/unit/test_feedback_classification.py`
- `packages/asdl-pr-address/tests/scenario/test_operations.py`

Validation evidence:

- `uv run pytest packages/asdl-pr-address/tests/unit/test_feedback_classification.py`
- `uv run pytest packages/asdl-pr-address/tests/scenario/test_operations.py`
- `uv run ruff check packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address packages/asdl-pr-address/tests`
- `uv run ruff format --check packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address packages/asdl-pr-address/tests`
- `uv run ty check`

## Follow-Ups

- Wire the payload-aware LM/subagent summary workflow into `pr-address` documentation and public skill behavior.
- Decide in that future slice whether and how validated LM classifications should be saved as `.summary.json` payload artifacts.
- Keep command-level LLM invocation out of `pr-address`; classification remains agent/subagent judgment with deterministic CLI validation.
