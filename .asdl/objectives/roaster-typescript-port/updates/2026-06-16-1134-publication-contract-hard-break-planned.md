# Publication Contract Hard-Break Planned

## Summary

Post-cutover review feedback identified a structural roaster contract regression that must be resolved before Objective closeout: `roaster review run --format json` currently carries findings/count/format in more than one representation, and the publication commands parse roaster-owned JSON through lenient nested-vs-flat and camel-vs-snake fallback logic.

A structured grilling session resolved the plan for the follow-up: hard-break the review-run result to a single JS-native camelCase findings contract, remove duplicated findings payloads, strict-parse the exact roaster-owned producer contracts, move the shared inline posting result schema to the domain model layer, clean up `FakeHarnessGateway` to use `mapFromRecordOrMap`, and split `harness.ts` along its tested prompt/diff-cap/output/gateway seams.

Evidence: the enriched plan was saved at `/Users/schrockn/.asdl/enriched-plan/gh--dagster-io--asdl-tools/off-master-1/hard-break-review-run-json-contracts.md`. Local branch evidence for this Objective update has no implementation diff yet (`off-master-1` is at `660b95e9c`, with no diff against `origin/master`); this update records newly planned required closeout work, not landed implementation.

## Objective Impact

The Objective is not closeout-ready. The prior remaining-work picture focused on Python-era documentation drift after runtime deletion, but this review feedback adds an active implementation hardening row for the TS roaster package itself. The existing clean-break thesis still supports the decision: roaster can redesign its JSON envelope idiomatically, so the right fix is a hard break to one canonical camelCase contract rather than compatibility shims.

The roadmap now carries the publication-contract hard-break and harness decomposition as in-progress planned work. The deletion/cutover evidence remains valid, but closure must wait until this contract hardening is implemented and validated, alongside the remaining documentation cleanup.

## Follow-Ups

- Implement the saved hard-break plan from the local enriched-plan store.
- After implementation, update this Objective with validation evidence and whether the publication contract regression is fully de-risked.
- Continue to treat stale Python-era documentation references as separate remaining closeout work before closing the Objective.
