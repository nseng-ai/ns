# Resolver Input Rendering Extracted

## Summary

The second behavior-preserving decomposition slice is implemented: resolver-agent input Markdown generation moved out of `packages/roaster/src/roaster/stack_workflow.py` into `roaster.stack_resolver_input`.

`stack_workflow.py` now imports and calls `render_stack_resolver_input(...)` when preparing resolver agent requests, and no longer owns `_resolver_input_markdown(...)` or the local `_value_or_dash(...)` / `_line_or_dash(...)` helpers used by that renderer. Focused unit coverage in `packages/roaster/tests/unit/test_stack_resolver_input.py` verifies profile/batch context rendering, matching-finding filtering, validation fallback text, missing-field fallbacks, and trailing-newline behavior.

Verification: targeted resolver-input tests passed, existing stack workflow guardrail tests passed, adjacent roaster stack tests passed, and full `just` validation passed.

## Objective Impact

This advances the in-progress roadmap item to decompose the overgrown workflow module without changing stack behavior. Resolver input rendering is now independently reviewable and tested, while mutating orchestration still owns Branch Memory/dashboard/Graphite ordering.

The decomposition item remains in progress because workflow phase orchestration, run persistence, dashboard projection, and remaining value formatting tied to those concerns are still owned by `stack_workflow.py`.

Evidence basis: local branch commit `24e24185` and PR #960 show only the resolver-input extraction file set against `origin/dry-run-result-shaping-extraction`: `stack_resolver_input.py`, `stack_workflow.py`, and `test_stack_resolver_input.py`.

## Follow-Ups

- Continue decomposing `stack_workflow.py` around the remaining stable responsibilities without combining that work with attach-tip, generated PR body, or run-state semantic changes.
- Keep mutating-workflow safety-ordering tests as guardrails for each subsequent extraction slice.
- Address Graphite attach-tip semantics, generated PR marker/body support, and richer durable run state in separate roadmap slices.
