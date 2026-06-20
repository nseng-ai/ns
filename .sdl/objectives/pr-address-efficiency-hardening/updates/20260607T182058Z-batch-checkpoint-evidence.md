# Batch Checkpoint Evidence Helper

## Summary

This branch adds `pr-address exec record-batch-checkpoint`, a deterministic helper that validates one selected `plan-feedback` batch against explicit post-execution evidence: changed files, validation commands, commit SHA, `build-resolve-thread-batch-payload` output, `resolve-thread-batch` results, PR-level review/discussion-comment outcomes, skipped items, and selected plan identities.

The helper returns `valid` separately from `batch_complete`, so failed validation commands or failed thread mutation results can be preserved as structured evidence without being mistaken for a completed batch. When the plan came from a payload-backed run, it writes a same-session `pr-address-batch-checkpoint.summary.json` artifact and returns a checkpoint reference. The artifact and stdout use compact plan summaries and IDs rather than raw feedback bodies.

Verification evidence: targeted composite scenario tests passed for successful checkpoint artifact writing, `--payload-file`, conflicting input sources, unknown batches, missing thread payload evidence, failed thread resolution, unsafe changed files, and missing non-thread outcomes. The public skill, CLI reference, package README, and docs-site mirrors now route future agents through the checkpoint helper after each committed batch.

## Objective Impact

This completes the per-batch evidence/checkpoint roadmap row. Batches can now be audited after commit and after helper-mediated GitHub mutation without relying on agent transcript memory. The implementation preserves the Objective boundary: it does not mutate GitHub, push, commit, create branches, infer git state, or become a hidden task database.

It also closes the remaining evidence for the mutation-payload assembly row: generated resolution payloads are built by `build-resolve-thread-batch-payload`, large payloads can be passed through `resolve-thread-batch --payload-file`, and checkpoint records tie the mutation payload/result back to the selected plan batch and commit evidence.

The broader Objective remains open because final unresolved-feedback summary support and a representative lower-orchestration proof are still needed.

## Follow-Ups

- Add finalization support that re-fetches compact feedback and reports unresolved, skipped, and mutated items without requiring agents to manually reconcile the final state.
- Decide whether finalization should aggregate explicit checkpoint references, perform a fresh payload-backed feedback fetch, or use both.
- Prove the lower-orchestration happy path on a representative PR-addressing run after finalization support lands.
