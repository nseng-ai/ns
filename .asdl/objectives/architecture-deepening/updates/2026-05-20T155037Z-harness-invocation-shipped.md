# Semantic Update: Ship asdl-reviewer harness invocation

## Summary

The asdl-reviewer harness-invocation candidate is shipped. Harness execution now lives in `asdl_reviewer.harness.invocation` behind a small semantic interface: callers provide a selected harness name, model, parsed review definition, local diff, and review format as `HarnessReviewRequest`; `HarnessRuntime` owns known-harness listing, prompt assembly, system prompt selection, Claude argv/stdin construction, subprocess orchestration, progress events, model support, stream-json parsing, findings validation, usage extraction, and user-visible harness failures.

The shallow harness modules were deleted: `harness_adapter.py`, `harness_registry.py`, `prompting.py`, and the old `harness/claude/` package. `ReviewEnvironmentGateway` now exposes `list_harnesses()` and `run_review(HarnessReviewRequest)`, with the real gateway delegating to `HarnessRuntime` and the fake recording semantic requests. `workflow.py`, CLI harness commands, and `review_environment/real.py` no longer know adapter registry layout, prompt resources, Claude argv shape, JSON schema, or stream-json event contracts.

Parser behavior changed as intended: `default_model` is now parsed as a non-empty string only. Harness-specific model support is enforced during selected-harness execution and returns `model_not_supported_by_harness`.

Verification passed: targeted reviewer/plugin suite (`135 passed`) and full `just` (`1285 passed`). Current-branch PR evidence is available as PR #502 ("Unify asdl-reviewer harness invocation behind `HarnessRuntime` and delete adapter, registry, and prompting modules"); its file list matches the harness-invocation implementation and Objective updates recorded here.

## Objective Impact

This completes the **Unify asdl-reviewer harness invocation** roadmap row. The deletion test held: after removing the adapter, registry, prompting, and Claude adapter modules, their complexity did not reappear in workflow, CLI command files, or the real review-environment gateway. Instead, the harness-specific details are localized in one deep module with a small caller-facing interface.

The asdl-reviewer gateway overlap question is resolved: the review-environment seam remains the composite environment boundary, and harness invocation is an implementation module behind that seam rather than a new gateway trio.

All roadmap rows in this Objective are now shipped.

## Follow-Ups

- Consider running `objective-close` for `architecture-deepening` after reviewing whether the Objective is ready to close.
- If a second harness is added later, revisit whether it belongs inside `asdl_reviewer.harness.invocation` or behind a submodule split under the same runtime interface; do not introduce a new public seam until the two-adapter rule justifies it.
