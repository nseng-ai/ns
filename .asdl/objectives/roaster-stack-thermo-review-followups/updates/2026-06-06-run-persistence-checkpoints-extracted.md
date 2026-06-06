# Run Persistence Checkpoints Extracted

## Summary

The final behavior-preserving decomposition slice is implemented: run manifest checkpoint transformations and Branch Memory artifact persistence wrappers moved out of `packages/roaster/src/roaster/stack_workflow.py` into `roaster.stack_run_persistence`.

`stack_workflow.py` now delegates initial batch state construction, batch state updates, dashboard publication manifest linkage, submission success/failure state, generated branch list updates, run-start persistence, manifest writes, resolver artifact persistence, and failed-batch manifest recording to the persistence helper module. It still owns the intended orchestration boundary: target/attach-tip resolution, triage and resolver sequencing, Graphite branch mutation, dashboard publication calls, and hard-stop ordering.

Focused unit coverage in `packages/roaster/tests/unit/test_stack_run_persistence.py` verifies pending batch state construction, ordered batch-state replacement, failure context projection, dashboard publication linkage, submission state updates, and generated branch list replacement.

Verification: targeted workflow/run-storage/persistence tests passed; adjacent stack dashboard projection, resolver input, and stack CLI tests passed; focused type checking passed; full `just` validation passed.

## Objective Impact

This completes the remaining decomposition roadmap item. The final accepted boundary is that `stack_workflow.py` remains the phase orchestrator while persistence, dashboard projection, resolver input rendering, dry-run shaping, and triage views are independently reviewable modules.

With attach-tip semantics fixed, generated PR body support honestly deferred, durable run state enriched, README/tests reconciled, and the final run-persistence extraction validated, the Objective is ready to close.

## Follow-Ups

- Keep live disposable GitHub/Graphite mutation smoke tests parked unless explicitly requested later.
- Implement real Graphite attach-tip discovery only when a stable machine-readable `gt`/Graphite surface is available.
- Do not wire generated resolver PR body publication until a narrow PR discovery/body-update gateway contract exists.
- Treat broader roaster quality hardening as future work outside this Objective.
