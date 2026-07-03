# Dashboard Projection Extracted

## Summary

The next behavior-preserving decomposition slice is implemented: workflow-owned dashboard projection helpers moved out of `packages/roaster/src/roaster/stack_workflow.py` into `roaster.stack_dashboard_projection`.

`stack_workflow.py` now calls `build_stack_dashboard_state(...)`, `build_stack_dashboard_rows(...)`, and `stack_dashboard_pr_number(...)` rather than owning renderer-ready dashboard state construction, workflow dashboard row projection, validation summary formatting, rejected-finding projection, or target-PR number/URL parsing. Focused unit coverage in `packages/roaster/tests/unit/test_stack_dashboard_projection.py` verifies run counts, batch projection, rejected findings, completed/pending rows, and PR number/URL parsing.

Verification: targeted workflow, dashboard, and dashboard-projection tests passed, and ruff passed for the touched source/test files.

## Objective Impact

This advances the in-progress roadmap item to decompose the overgrown workflow module without changing stack behavior. Dashboard projection is now independently reviewable and tested, while mutating orchestration still owns Branch Memory/dashboard/Graphite ordering and uses the same publication path.

The decomposition item remains in progress because workflow phase orchestration, run persistence, and any remaining value formatting tied to those concerns are still owned by `stack_workflow.py`.

## Follow-Ups

- Continue decomposing `stack_workflow.py` around remaining stable responsibilities without combining that work with attach-tip, generated PR body, or run-state semantic changes.
- Keep mutating-workflow safety-ordering tests as guardrails for subsequent extraction slices.
- Address Graphite attach-tip semantics, generated PR marker/body support, and richer durable run state in separate roadmap slices.
