# Gitplane reconciliation architecture accounting

## Status and immutable anchors

This is local stack accounting, not a landing or publication record. The replacement implementation tip immediately
below the accounting-only commits is `3cf5a42826a421b40e9eb7f110a97076003cef43`, derived as the parent of the first
accounting-only commit after the accounting branch was restacked directly onto `gitplane-reconcile-cli`. Anchoring the
preceding implementation commit avoids the impossible requirement for this document to name its own eventual commit
SHA. This change contains Objective/accounting changes only.

The comparison set is:

- `09d75c3aec266ce83d66fd005e12dd52d036b57a`: immutable cursor-diff prototype (PR #4076), retained only as
  architecture and test-history evidence.
- `48a07b6bb2cd652f795f7d1bad5616acb016977d`: immutable superseded single-commit generation-aware
  implementation (the still-open, superseded PR #4130 implementation).
- `e3e7f5e4109ba421bd3af88fdb2eff0cab7524b7`: an immutable historical rebased equivalent of that superseded
  implementation. Its equivalence claim remains historical evidence, not evidence about the current rebased stack.
- PR #4128: historical shallow-history rationale. Its conservative `incomplete-history` ancestry
  classification was correct for the then-current history-gated design, but is not a present reconciliation
  requirement.
- `3cf5a42826a421b40e9eb7f110a97076003cef43`: the current replacement implementation tip accounted here.

Publication, remote stack/CI verification, closure of superseded PR #4130, closure of prototype PR #4076,
and Objective closure remain pending external actions.

## Responsibility comparison

| Responsibility                                | Prototype `09d75c3ae`                                                                                                                                                                                                          | Replacement tip `3cf5a428…`                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source facts and gateways                     | `ArtifactGateway` exposed commit resolution, ancestry (`isAncestor`), commit diffs (`diffCommits`), boundary reads at commits, and artifact reads. `RealArtifactGateway` called `merge-base --is-ancestor` and `git diff`.     | `gatherSourceFacts` resolves one immutable target and gathers its complete raw topology/corpus through the narrowed gateway. Reconciliation performs no ancestry, diff, shallow-state, cursor-tree, operator target-row, or working-tree read.                                            |
| Planning authority                            | Async `reconciliation/plan.ts` mixed gateway reads, cursor-diff selection, baseline persistence, and policy.                                                                                                                   | Pure internal `deriveReconciliationPlan(facts)` is the sole policy authority. It consumes the complete target snapshot, one coherent completed materialization snapshot (cursor, current records including tombstones, lineage, and Pending Plan), and registrations; it has no gateways. |
| Initial / forward / older / divergent / merge | Initial required `--full`; incremental required cursor descent, so older and divergent targets were rejected and merge behavior depended on ancestry/diff classification. PR #4128 added conservative shallow-history refusal. | All five target shapes use the same complete-snapshot rule. Initial normal reconciliation is valid; forward, older, divergent, and merge commits are history-neutral. A depth-1 clone reconciles without fetch.                                                                           |
| Completeness and deletion                     | Incremental work came from the cursor-to-target changed-path set. Full mode separately scanned and used a durable baseline to recover deletion intent.                                                                         | The target corpus and complete stored-current snapshot are compared by stable artifact ID. Every stored-live ID absent from the target becomes deletion work; already tombstoned absent IDs stay quiet. Completeness, not a cursor diff, is deletion authority.                           |
| Retry authority                               | A `ReconciliationBaseline` froze selected plan inputs, while planning and event reconstruction still reflected the cursor-diff/full split.                                                                                     | One atomically inserted Reconciliation Plan is the Pending Plan and contains complete retry semantics. A matching plan replays without source/config reinterpretation; a conflicting plan is refused before artifact writes; post-CAS residue is cleanup-only.                            |
| Generation / ABA                              | Cursor CAS compared commit identity only. A return to the same commit string could collapse an `A → B → A → B` race.                                                                                                           | `CursorRecord.generation` advances on completed transitions. CAS checks expected generation and returns actual cursor facts on mismatch, so commit-string ABA is rejected even when the commit text matches. Equal no-op and residue cleanup do not advance generation.                   |
| Attempt and event identity                    | There was no generation-aware Attempt ID. `deriveEventId` keyed events by source, artifact, target commit, and event type, collapsing a later visit to the same target/type into the old event.                                | Deterministic `gpa_` identity includes source, expected generation, and target. `gpe_` identity includes reconciliation generation and Attempt ID as well as source/artifact/target/type. Retry is stable, but later visits to the same target produce distinct events and sequences.     |
| Repair                                        | `--full` doubled as initial bootstrap and repair; event reconstruction could be complete, skipped, or not applicable.                                                                                                          | Repair is deferred. The current CLI has no `--full`, `-f`, `--repair`, or `-r` compatibility; normal reconciliation uses only complete target and completed-store snapshots.                                                                                                              |
| Apply order and failure behavior              | Baseline-backed apply ordered revision → lineage → current → target → event, then commit-only cursor CAS, error cleanup, and baseline cleanup.                                                                                 | `applyReconciliationPlan` preserves canonical artifact-ID and revision → lineage → current → classified target → event order, then generation CAS last. Fault injection before and after every write boundary proves convergence to uninterrupted durable state.                          |
| CLI result                                    | `gitplane reconcile <commit> [--full]` reported incremental/full mode, event-reconstruction status, cursor advancement, and ancestry-shaped failures.                                                                          | `gitplane reconcile <commit>` returns bounded lifecycle counts, prior/Resulting Cursor facts, cursor advancement, replay, and cleanup. It exposes no repair, ancestry, or event-reconstruction fields and closes the store once on every path.                                            |

The cursor diff, descent classification, merge rejection, initial `--full`, target-commit event collapse, and old
repair naming are therefore intentionally superseded architecture, not missing replacement behavior.
PR #4128 remains useful evidence of why shallow history was handled conservatively while ancestry was a gate;
the replacement removes the gate rather than weakening that historical classification.

## Superseded implementation and final simplification

The superseded generation-aware implementation at `48a07b6bb` (and its historical package-equivalent rebased
commit `e3e7f5e41`) supplied complete snapshots, pure planning, generation-aware retry/event identity,
history-neutral target shapes, repair, and bounded CLI behavior. The current rebased replacement retains the
core snapshot and retry semantics while deliberately deferring repair and adopting the Reconciliation Plan model.
The local replacement stack makes those responsibilities additive and reviewable.
The final implementation tip also removes residual capabilities that were not needed by the coherent snapshot
boundary:

- `MaterializationStoreGateway.readCursor`, `readLineage`, `readCurrentArtifact`, and `listCurrentArtifacts`;
- the shared `LookupResult` type and corresponding in-memory/SQLite implementations and failure hooks;
- `ArtifactCurrentRecord.observedCommit` and SQLite's `observed_commit` column;
- duplicate CLI scenario setup tied to those point reads.

The only planning read is now `readMaterializationSnapshot`; point reads cannot accidentally become competing
planning authorities. The current implementation keeps this single planning-read boundary. Historical package-diff
counts are not used as current rebased-stack evidence because semantic ports and package relocation changed the
comparison basis.

## Deleted prototype production and test surfaces

The replacement deletes the prototype production modules:

- `src/core/reconciliation-baseline.ts`
- `src/core/reconciliation/apply.ts`
- `src/core/reconciliation/plan.ts`
- `src/core/reconciliation/reconcile.ts`
- `src/core/reconciliation/types.ts`

Their responsibilities are replaced by `gather-source-facts.ts`, `reconciliation-plan.ts`,
`apply-reconciliation-plan.ts`, and `reconcile.ts`, rather than preserved behind compatibility exports.
The monolithic prototype `test/scenario/reconcile.test.ts` is also deleted. Its useful behavior is redistributed
across pure planner tables, gateway/fake tests, shared fake/SQLite store conformance, focused engine tests,
fault-injection tests, CLI scenarios, and minimal real-Git/SQLite integration tests. Prototype-only ancestry,
diff, full-mode, event-reconstruction, and baseline fixtures are deliberately gone.

## Verification inventory

Bounded diffs and searches establish:

- Against `09d75c3ae`, the replacement removes `isAncestor`, `diffCommits`, cursor-descent/full-mode planning,
  commit-keyed event identity, and the old reconciliation module/test surfaces, while adding complete target
  gathering, pure snapshot planning, Pending Plan replay, generation CAS, and fault-injection coverage.
- The current implementation inventory includes initial/equal, older, divergent, merge, repeated-target identity,
  conflicting/matching/post-CAS Pending Plans, unavailable target, depth-1 clone, and before/after-write retry
  convergence. Repair from the superseded implementation is deliberately deferred, not retained through compatibility.
- The exact replacement symbols are present at the rebased implementation tip: `gatherSourceFacts`,
  `deriveReconciliationPlan`, `ReconciliationPlan`, `PlannedArtifactMaterialization`,
  `PreparedArtifactMaterialization`, generation-bearing `CursorRecord`, `deriveAttemptId`,
  generation/Attempt-ID-aware `deriveEventId`, `prepareResultingCursor`, `applyReconciliationPlan`, and public
  `reconcile`.

This evidence makes the local stack ready for publication review, but does not assert that any stack PR has
landed or that either historical PR has been closed.
