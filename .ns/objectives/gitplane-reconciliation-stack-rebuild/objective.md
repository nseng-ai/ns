---
edges:
  - objective: gitplane
    annotation: Rebuilds gitplane's level-triggered snapshot reconciliation slice as a verified PR stack; supersedes the prototype branch's completion evidence.
---

# Gitplane reconciliation stack rebuild

## Thesis

Rebuild reconciliation from `master` as a stack of additively verifiable PRs — each slice carrying its own proof obligation and review question — instead of landing the ~3,000-line single-commit prototype. Branch `gitplane-cursor-reconciliation-baseline-repair` @ `09d75c3ae` (PR #4076) remains an unmerged prototype-quality reference to mine for code, tests, and rationale; it is never landed as-is and closes once the stack fully lands.

The original rebuild contract used cursor diffs, ancestry/descent classification, initial `--full`, and linear-history guards. The generation-aware snapshot amendment deliberately supersedes those requirements: reconciliation is level-triggered from the last completed Gitplane control snapshot to the complete immutable target-commit corpus, and history is not an input. Preserve the old rationale in Objective and PR history, including PR #4128's conservative shallow-history classification, while removing it from normative and runtime requirements.

The rebuild retains Gather → Decide → Apply: I/O-only immutable fact gathering, a pure deterministic planner (`deriveReconciliationPlan(facts)` with no gateways), and ordered retry-safe effect application. The package's public core interface stays `reconcile(context, options)`; the planner is internal.

## Scope

- A reshaped five-boundary stack: contract amendment; complete target/completed-store snapshot facts plus pure planner; generation-aware durable attempt/cursor/event protocol; retry-safe engine and CLI; closure and accounting.
- Complete target-corpus discovery. Gather resolves the requested commit and retains raw topology for canonical planner validation; it does not read cursor trees, ancestry, diffs, operator target rows, or shallow-history state.
- One coherent materialization-store snapshot containing generation cursor, all current records including tombstones, lineage, and pending attempt. New planning requires a completed snapshot with no unresolved attempt; matching attempts replay, conflicts refuse replacement, and post-CAS residue is cleanup-only.
- Generation-aware identities and completion: absent cursor is conceptual generation 0; completed transitions advance generation; equal no-op/cleanup does not. Attempt and event identities are stable on retry and distinct on later visits to the same commit. Generation CAS proves commit-string ABA safety.
- Pure lifecycle planning for create/restore/revise/move/unchanged/delete.
- Proof restructuring by level: pure snapshot policy, shared fake/SQLite generation and attempt conformance, fault-injected engine convergence, and minimal real-Git/SQLite E2E including initial, older, divergent, merge, repeated-target, unavailable-target, and depth-1 behavior.
- Behavioral accounting against reference commit `09d75c3ae`, prototype PR closure, and reconciliation of the parent `gitplane` Objective's evidence.

## Non-Goals

- No ancestry observation as a warning, gate, metric, fetch trigger, or optimization; no commit-diff or tree-OID fast path in v1.
- No working-tree reconciliation: dirty and untracked contents are outside the immutable target commit snapshot.
- No operator target-row drift detection or repair mode. The operational need and backend-neutral comparison semantics must be proven before adding either capability.
- No source leases or broader distributed scheduling beyond atomic one-attempt persistence and generation CAS.
- No migration of prototype or incompatible pre-release reconciliation state. The supported v1 schema is generation-aware directly; incompatible stores fail closed with recreate guidance.
- No event dispatch, production persistence, or workflow behavior beyond the parent Objective.
- No public export of planner or apply internals merely for testing.

## Completion Criteria

- The reshaped stack lands through additive reviewed boundaries: contract amendment; snapshot facts/planner; durable generation protocol; retry-safe engine/CLI; closure/accounting.
- Complete target snapshot and coherent completed-store snapshot are the only planning facts. Initial, forward, older, divergent, and merge targets use identical planning rules, with no ancestry/diff/shallow probe in source logs; a depth-1 real clone reconciles without fetching.
- The pure planner validates complete raw topology/corpus before writes and proves lifecycle, lineage legality, deterministic order/plan equality, complete deletion detection, and merge neutrality.
- Atomic one-pending-attempt persistence and a complete frozen semantic plan prevent source/config reinterpretation. Matching retry replays, conflicting work is refused before artifact writes, and post-CAS residue is cleanup-only.
- Cursor records carry monotonic generation and CAS returns actual cursor facts on mismatch. Literal/conformance coverage proves stale expected generation is rejected after `A → B → A → B` even when the commit string matches.
- Deterministic `gpa_` and generation/attempt-aware `gpe_` identities have literal vectors: one attempt is stable across retry, while later visits to the same target/type produce distinct events.
- Failure injection before and after every write boundary converges to uninterrupted cursor generation, control rows, revisions, target values, event IDs/sequences, and attempt cleanup.
- Fake and SQLite share snapshot/attempt/generation/event conformance; incompatible old pre-release schema is refused without mutation.
- CLI exposes `gitplane reconcile <commit>` with bounded lifecycle count/cursor/replay/cleanup output, no repair, ancestry, or event-reconstruction fields, and guaranteed single-store close.
- Stack-tip accounting names cursor-diff, descent, merge rejection, initial-full, target-commit event collapse, and old repair naming as intentionally superseded differences from `09d75c3ae`; PR #4076 closes unmerged and PR #4128's rationale remains historical evidence.

## Metaprompt

Every prompt produced for this Objective must start with the `/ns:plan:grill-and-save` command so each slice receives a grilled, saved implementation plan before execution.

## Assumptions and Risks

Assumptions:

- Gitplane is unreleased, so the generation-aware records are the supported v1 schema and incompatible prototype stores can be rejected rather than migrated.
- Complete scans are an accepted v1 simplicity/correctness trade. Performance must be measured before adding snapshot-local optimizations, and history dependence must never return as a correctness input.
- Gitplane-owned control state is trustworthy only at a completed cursor generation with no unresolved attempt; operator-owned target rows never define desired or prior state.
- Gather → Decide → Apply can express the complete behavior while keeping the frozen plan adapter-neutral and replayable without source or registration rereads.
- Additive review boundaries remain justified because contract, pure policy, durable concurrency/idempotence, effect ordering/user exposure, and closure accounting have distinct correctness questions.

Risks:

- Partial non-transactional materialization remains visible before cursor CAS. Systematic fault injection and cleanup-only residue handling are the primary safety proof.
- Attempt or generation mistakes can permit lost updates or ABA. Atomic insertion, one pending attempt per source, generation CAS, and shared adapter conformance are mandatory.
- Scope may drift back toward history optimization because source adapters already contain ancestry/diff machinery. Stale-contract searches and depth-1 tests must prove its removal from reconciliation.
- Retaining PR #4076 and PR #4128 as references can make superseded behavior look current. Tip accounting must distinguish historical rationale from normative requirements.

## Open Questions

No material product requirement remains open. Private module names, frozen-plan JSON fields, SQL statement layout, and whether internal schema machinery requires a version bump may vary, but there is no migration and incompatible pre-release stores must be rejected with recreate guidance.
