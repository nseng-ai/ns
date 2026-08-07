---
edges:
  - objective: gitplane
    annotation: Rebuilds gitplane's level-triggered snapshot reconciliation slice as a verified PR stack; supersedes the prototype branch's completion evidence.
---

# Gitplane reconciliation stack rebuild

## Thesis

Rebuild reconciliation from `master` as a stack of additively verifiable PRs, each with its own proof obligation and review question, instead of landing either prototype PR #4076 or the later single-commit replacement PR #4130. Both reference PRs are now closed unmerged; their immutable commits and PR history remain evidence, not landing candidates.

The original rebuild contract used cursor diffs, ancestry/descent classification, initial `--full`, and linear-history guards. The generation-aware snapshot amendment deliberately supersedes those requirements: reconciliation is level-triggered from the last completed Gitplane control snapshot to the complete immutable target-commit corpus, and history is not an input. Historical rationale remains in Objective and PR history, including open PR #4128's conservative shallow-history classification, but not in normative or runtime requirements.

The replacement retains Gather → Decide → Apply: I/O-only immutable fact gathering, a pure deterministic internal planner (`deriveReconciliationPlan(facts)` with no gateways), and ordered retry-safe effect application. The package's public core interface remains `reconcile(context, options)`.

The five-boundary replacement was implemented and published as PRs #4132–#4136 with the intended additive parentage. `architecture-accounting.md` records the immutable comparison against the prototype and superseded implementation using implementation anchor `3cf5a42826a421b40e9eb7f110a97076003cef43` immediately below the accounting-only commits; it does not attempt to name the accounting change's own commit. The downstack replacement work is landed, and the accounting branch carries the final Objective closure. Prototype PR #4076 and superseded single-commit PR #4130 are closed unmerged.

## Scope

- A five-boundary replacement stack: contract amendment; complete target/completed-store snapshot facts plus pure planner; generation-aware durable plan/cursor/event protocol; retry-safe engine and CLI; closure accounting.
- Complete target-corpus discovery. Gather resolves the requested commit and retains raw topology for canonical planner validation; it does not read cursor trees, ancestry, diffs, operator target rows, or shallow-history state.
- One coherent materialization-store snapshot containing generation cursor, all current records including tombstones, lineage, and a Pending Plan. New planning requires a completed snapshot with no Pending Plan; a matching plan replays, a different requested target completes the inherited Pending Plan before new planning without replacing it, and post-CAS residue is cleanup-only.
- Generation-aware identities and completion: absent cursor is conceptual generation 0; completed transitions advance generation; equal no-op/cleanup does not. Attempt IDs and event identities are stable on retry and distinct on later visits to the same commit. Generation CAS proves commit-string ABA safety.
- Pure lifecycle planning for create/restore/revise/move/unchanged/delete.
- Proof restructuring by level: pure snapshot policy, shared fake/SQLite Pending Plan and generation conformance, fault-injected engine convergence, and minimal real-Git/SQLite E2E including initial, older, divergent, merge, repeated-target, unavailable-target, and depth-1 behavior.
- Behavioral accounting against prototype commit `09d75c3ae`, superseded implementation `48a07b6bb`, and historical PR #4128, followed by landing and propagation of completion evidence to the parent `gitplane` Objective.

## Non-Goals

- No ancestry observation as a warning, gate, metric, fetch trigger, or optimization; no commit-diff or tree-OID fast path in v1.
- No working-tree reconciliation: dirty and untracked contents are outside the immutable target commit snapshot.
- No operator target-row drift detection or repair mode. The operational need and backend-neutral comparison semantics must be proven before adding either capability.
- No source leases or broader distributed scheduling beyond the backend-neutral one-Pending-Plan protocol and generation CAS. The native SQLite v1 adapter is single-writer; concurrent SQLite writers or simultaneous replayers are unsupported.
- No migration of prototype or incompatible pre-release reconciliation state. The supported v1 schema is generation-aware directly; incompatible stores fail closed with recreate guidance.
- No event dispatch, production persistence, or workflow behavior beyond the parent Objective.
- No public export of planner or apply internals merely for testing.

## Completion Criteria

- The five additive review boundaries are implemented and published with verified remote parentage: contract amendment; snapshot facts/planner; durable generation protocol; retry-safe engine/CLI; closure accounting.
- Complete target snapshot and coherent completed-store snapshot are the only planning facts. Initial, forward, older, divergent, and merge targets use identical planning rules, with no ancestry/diff/shallow probe in source logs; a depth-1 real clone reconciles without fetching.
- The pure planner validates complete raw topology/corpus before writes and proves lifecycle, lineage legality, deterministic order/plan equality, complete deletion detection, and merge neutrality.
- Atomic Pending Plan persistence and a complete Reconciliation Plan prevent source/config reinterpretation. Matching retry replays, different requested work first completes the inherited Pending Plan without replacing it, and post-CAS residue is cleanup-only.
- Cursor records carry monotonic generation and CAS returns actual cursor facts on mismatch. Literal/conformance coverage proves stale expected generation is rejected after `A → B → A → B` even when the commit string matches.
- Deterministic `gpa_` and generation/attempt-aware `gpe_` identities have literal vectors: one attempt is stable across retry, while later visits to the same target/type produce distinct events.
- Failure injection before and after every write boundary converges to uninterrupted cursor generation, control rows, revisions, target values, event IDs/sequences, and attempt cleanup.
- Fake and SQLite share snapshot/Reconciliation Plan/generation/event conformance and sequential retry proof under SQLite's single-writer boundary; incompatible old pre-release schema is refused without mutation.
- CLI exposes `gitplane reconcile <commit>` with bounded lifecycle count/cursor/replay/cleanup output, no repair, ancestry, or event-reconstruction fields, and guaranteed single-store close.
- Stack-tip accounting names cursor-diff, descent, merge rejection, initial-full, target-commit event collapse, and old repair naming as intentionally superseded differences from `09d75c3ae`; PR #4128's rationale remains historical evidence.
- Required remote CI lanes, review checks, and Graphite mergeability are verified for the published replacement stack; the stack lands; prototype PR #4076 and superseded PR #4130 remain closed unmerged; completion is propagated to the parent `gitplane` Objective.

## Metaprompt

Every prompt produced for this Objective must start with the `/ns:plan:grill-and-save` command so each slice receives a grilled, saved implementation plan before execution.

## Assumptions and Risks

Assumptions:

- Gitplane is unreleased, so generation-aware records are the supported v1 schema and incompatible prototype stores can be rejected rather than migrated.
- Complete scans are an accepted v1 simplicity/correctness trade. Performance must be measured before adding snapshot-local optimizations, and history dependence must never return as a correctness input.
- Gitplane-owned control state is trustworthy only at a completed cursor generation with no Pending Plan; operator-owned target rows never define desired or prior state.
- Gather → Decide → Apply expresses the complete behavior while keeping the Reconciliation Plan adapter-neutral and replayable without source or registration rereads.
- Additive review boundaries remain justified because contract, pure policy, durable concurrency/idempotence, effect ordering/user exposure, and closure accounting have distinct correctness questions.

Risks:

- Partial non-transactional materialization remains visible before cursor CAS. Systematic fault injection and cleanup-only residue handling are the primary safety proof.
- Plan or generation mistakes can permit lost updates or ABA. Reconciliation Plan validation, one Pending Plan per source, generation CAS, and shared adapter conformance are mandatory. This protocol requirement does not imply concurrent-writer support in the SQLite v1 adapter.
- Scope may drift back toward history optimization because source adapters can contain ancestry/diff machinery. Stale-contract searches and depth-1 tests must preserve reconciliation's history independence.
- Open preparatory PR #4128 describes superseded runtime behavior. Its rationale is historical evidence only and must not be mistaken for the replacement's normative contract.
- The replacement stack's external validation and landing gate is resolved. Future implementation changes must still be revalidated against the architecture accounting rather than relying on this closure evidence.

## Open Questions

No material product requirement remains open. Any later implementation change must be revalidated against the architecture accounting and completion criteria.

## Closure

Outcome: **completed**. The five additive replacement boundaries delivered the amended contract, complete-snapshot planner, durable generation protocol, retry-safe engine and CLI, and architecture accounting. The downstack replacement work is treated as landed by explicit operator confirmation; this accounting branch carries the closure record, so its merge is the closure event on trunk.

Key evidence:

- PRs #4132–#4136 preserve the five intended review boundaries; the downstack replacement work through the implementation boundary is landed, and PR #4136 carries accounting and closure.
- Implementation anchor `3cf5a42826a421b40e9eb7f110a97076003cef43` is the parent-side implementation boundary below the accounting-only commits.
- Local Objective checks, repository-wide Objective validation, dprint, bounded architecture probes, and the no-TypeScript accounting-boundary check passed before closure.
- Prototype PR #4076 and superseded single-commit PR #4130 remain closed unmerged; their immutable commits remain comparison evidence only.

The durable reconciliation vocabulary and semantics are not stranded in this closed record: `ts/packages/incubating/infra/gitplane/CONTEXT.md`, the package implementation, and the parent `gitplane` Objective's canonical README/SPEC drafts own the Reconciliation Plan, Attempt ID, Planned Artifact Materialization, Prepared Artifact Materialization, Pending Plan, Resulting Cursor, complete-snapshot, and generation-CAS contracts.

The parent `gitplane` Objective remains open for its reference consumer, check-only GitHub Action, and README/SPEC promotion rows. Parked optimization, repair, scheduling, migration, dispatch, and production-persistence work remains outside this completed Objective.
