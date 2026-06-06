# Dry-Run Result Shaping Extracted

## Summary

The first behavior-preserving decomposition slice is implemented: dry-run result contracts and projection helpers moved out of `packages/roaster/src/roaster/stack_workflow.py` into `roaster.stack_dry_run`, and pure triage result views moved into `roaster.stack_triage_view`.

`stack_workflow.py` still owns orchestration, persistence, dashboard publication, resolver input rendering, target resolution, and mutation ordering. CLI and workflow tests now import `StackDryRunResult` from the canonical dry-run module.

Verification: targeted dry-run/workflow/CLI tests passed, broader roaster/plugin tests passed, and full `just` validation passed.

## Objective Impact

This advances the roadmap item to decompose the overgrown workflow module without changing stack behavior. The slice reduces the workflow module's ownership of CLI-facing dry-run result shaping while preserving dry-run no-mutation guarantees and leaving Branch Memory/dashboard/Graphite mutation ordering untouched.

The decomposition item remains in progress because workflow phase orchestration, run persistence, dashboard projection, resolver input rendering, and low-level value formatting are still owned by `stack_workflow.py`.

## Follow-Ups

- Continue decomposing `stack_workflow.py` around the remaining stable responsibilities without combining that work with attach-tip, generated PR body, or run-state semantic changes.
- Keep dry-run no-mutation assertions and mutating-workflow safety-ordering tests as guardrails for each subsequent extraction slice.
- Address Graphite attach-tip semantics, generated PR marker/body support, and richer durable run state in separate roadmap slices.
