# Roadmap

## Work

- [ ] Contract and proof matrix: freeze reconciliation behavior as named invariants and canonical vectors — transition precedence, event reconstruction status, baseline digest, operation ordering, structural versus operational failures, `cursorAdvanced` meaning — across the history/mode/lifecycle/classification/store-state/retry/completion matrix, before any implementation lands.
  - Proof obligation: the intended state machine is complete and internally consistent; reviewable without implementation noise.
- [ ] Source facts: `ArtifactGateway` history operations (`resolveCommit`, `readCommitFacts`, `isAncestor`, `discoverCommitTree`, `readCommitTreeSnapshot`, `diffCommits`), `RealArtifactGateway`, in-memory fake support, real-Git integration and command-protocol tests.
  - Proof obligation: all source facts are gathered faithfully with no reconciliation policy embedded in the adapter.
- [ ] Pure reconciliation planner: `deriveReconciliationPlan(facts)` owning candidate selection, whole-corpus validation, transition precedence, classification/schema legality, projection, deterministic artifact ordering, and frozen baseline construction plus digest verification — no gateways; table-driven and property tests (order-independence, plan/digest determinism, at-most-once artifact IDs, illegal lineage never planning).
  - Proof obligation: exactly one deterministic plan per fact snapshot, with no dependence on partially written state.
- [ ] Durable store protocol: `MaterializationStoreGateway` baseline read/insert/delete, cursor compare-and-set, revision/event idempotence, and reconciliation-error lifecycle; fake and SQLite implementations behind one shared conformance suite; the schema-version decision made explicitly in review.
  - Proof obligation: every store operation has the conflict detection and idempotence to survive replay after arbitrary interruption — this is the data-loss boundary.
- [ ] Retry-safe engine: `applyReconciliationPlan` and top-level `reconcile` composition — cursor-last ordering (baseline → revision → lineage → current → target → event → CAS → resolve errors → delete baseline), cleanup-only equal-cursor recovery, operational versus structural failure handling — proven by a systematic fault-injection matrix across every write boundary with shared-state retry convergence and stable identities.
  - Proof obligation: interruption at any effect boundary converges deterministically without early cursor advancement.
- [ ] CLI exposure: `gitplane reconcile <commit>` / `--full`, context wiring, bounded typed output, failure sanitization, single read-write store lifecycle with guaranteed close, and minimal real-Git + real-SQLite end-to-end scenarios.
  - Proof obligation: the command exposes the proven core without adding policy, leaking backend details, or weakening completion evidence.
- [ ] Closure: tip-level behavioral accounting against reference `09d75c3ae` (every semantic difference intentional and test-covered), close prototype PR #4076 unmerged with a pointer to the landed stack, and reconcile the `gitplane` objective's reconciliation-row evidence.
  - Evidence: full `just` plus integration and TypeScript style-guard lanes passing at stack tip.

## Parked

- Any reconciliation capability beyond the prototype (event dispatch, concurrent writers, schema migrations, production persistence) — owned by the `gitplane` objective's Parked list, not this rebuild.
