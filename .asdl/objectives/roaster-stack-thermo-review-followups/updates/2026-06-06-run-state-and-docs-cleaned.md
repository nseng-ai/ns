# Run State and Documentation Contracts Cleaned

## Summary

The run-state/docs slice is implemented. Persisted roaster stack run manifests now carry durable audit/resume facts beyond run identity: per-batch status, generated branch names/statuses, resolver artifact locators, resolver/failure summaries, dashboard comment linkage, and generated stack submission success/failure.

The workflow now writes manifest updates at meaningful checkpoints: initial batch state, dashboard publication, per-batch planning/running/completion/failure, resolver artifact persistence, submission failure, submission success, and final dashboard publication. Failure paths such as invalid resolver output and `gt submit` failure now leave inspectable manifest state rather than relying only on transient in-memory arguments.

Generated PR marker/body support was narrowed to an honest contract. The helper tests remain as pure/deferred rendering/parsing coverage, and README now states that production stack runs do not discover or edit generated resolver PR bodies until an explicit PR discovery/body-update gateway contract exists. README also documents attach-tip fail-closed semantics and the enriched manifest contract.

Verification: targeted stack run storage, workflow, dashboard, and stack CLI tests passed; ruff passed on the touched Python files; README dprint check passed.

## Objective Impact

This completes the roadmap rows for generated PR marker/body honesty, durable Branch Memory run state, and README/test reconciliation. It also advances the decomposition narrative by making run-state responsibilities explicit, though `stack_workflow.py` still owns orchestration and the helper logic that sequences run-state writes.

The Objective remains open because the decomposition row is still in progress: workflow phase orchestration and possible run-persistence helper extraction remain as the last substantive structural question before closure.

## Follow-Ups

- Decide whether the remaining workflow phase orchestration/run-persistence helper extraction is worth one final behavior-preserving decomposition slice.
- If that final decomposition slice is not needed, update the Objective to explicitly accept the remaining workflow ownership and consider `objective-close` after validation.
- Do not wire generated PR body publication until a narrow PR discovery/body-update gateway contract exists.
