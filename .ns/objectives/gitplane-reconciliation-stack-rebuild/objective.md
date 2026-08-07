---
edges:
  - objective: gitplane
    annotation: Rebuilds gitplane's cursor-diff reconciliation slice as a verified PR stack; supersedes the prototype branch's completion evidence.
---

# Gitplane reconciliation stack rebuild

## Thesis

Rebuild cursor-diff reconciliation from `master` as a stack of additively verifiable PRs — each slice carrying its own proof obligation and review question — instead of landing the ~3,000-line single-commit prototype. Branch `gitplane-cursor-reconciliation-baseline-repair` @ `09d75c3ae` (PR #4076) is retained unmerged as a prototype-quality reference to mine for code, tests, and behavior; it is never landed as-is and closes once the stack fully lands.

The rebuild also reshapes reconciliation internally into Gather → Decide → Apply: an I/O-only fact-gathering step, a pure deterministic planner (`deriveReconciliationPlan(facts)` with no gateways), and an ordered retry-safe effect application. The package's public core interface stays `reconcile(context, options)`; the planner is an internal seam, not a new public surface.

## Scope

- A six-slice PR stack, in order: reconciliation contract and proof matrix; source facts (`ArtifactGateway` history operations plus `RealArtifactGateway`); the pure reconciliation planner; the durable store protocol (baseline/CAS/idempotence operations, SQLite, shared conformance); the retry-safe reconciliation engine with a systematic fault-injection matrix; CLI exposure of `gitplane reconcile <commit>` / `--full`.
- Test restructuring by proof level: pure policy tests, store conformance against fake and SQLite, fault-injected engine scenarios over shared state, and minimal real-Git + real-SQLite end-to-end composition tests.
- Behavioral accounting against reference commit `09d75c3ae` at stack tip.
- Prototype PR closure and reconciliation of the `gitplane` objective's roadmap evidence.

## Non-Goals

- No redesign beyond clarifications required by the slice-1 proof matrix. The deterministic `gpa_` attempt ID and frozen semantic plan, marker-provenance revision identity, initial-full materialization lifecycle events, lineage-free repair events, three event-reconstruction statuses, cursor-CAS completion boundary, structural/operational failure split, and deterministic per-artifact apply order are intentional rebuild amendments rather than silent prototype drift. Later amendments require explicit contract and Objective updates.
- No new reconciliation capabilities beyond the prototype: no event dispatch, concurrent writers, migrations, or other items on gitplane's Parked list.
- No byte-for-byte reproduction of the prototype; the internal structure is expected to differ, with behavior accounted for explicitly.
- No public export of the planner or other internal seams merely for testability.

## Completion Criteria

- All six stack slices landed on `master` via reviewed PRs.
- At stack tip, a behavioral accounting against reference commit `09d75c3ae`: every semantic difference from the prototype is intentional and covered by a new or changed test (not byte-equivalence).
- The deterministic `gpa_` reconciliation attempt ID and persisted complete frozen semantic plan prevent retries from rereading source artifacts or reinterpreting changed registration. The exact derivation has a literal identity test in the durable-store slice.
- Every immutable revision carries required `markerLastChangedCommit` provenance and includes it in `gpr_` identity. Source-fact coverage proves marker add/change/move attribution and structural prewrite failure when Git history cannot establish it; a move therefore creates a revision and `artifact.revised` event.
- Initial full reconciliation rebuilds the materialization lifecycle from scratch and emits one deterministic `artifact.created` event per target artifact without claiming repository-introduction history. Every full reconciliation after initial materialization reapplies every planned artifact and emits a deterministic `artifact.repaired` event for each one regardless of ancestry or cursor-history availability, without asserting Git lineage; target-drift reads that suppress already-matching repairs are deferred as an optimization.
- The systematic fault-injection matrix exists and passes: for a reference plan, a failure injected before and after every store write boundary, with retry over shared state converging to the uninterrupted outcome with stable revision IDs, event IDs, event sequences, and target values — the central proof the prototype lacks.
- Prototype PR #4076 closed unmerged with a pointer to the landed stack, and the `gitplane` objective's reconciliation roadmap row carries the stack PRs as evidence instead.

## Metaprompt

Every prompt produced for this Objective must start with the `/ns:plan:grill-and-save` command so each slice receives a grilled, saved implementation plan before execution.

## Assumptions and Risks

Assumptions:

- Gitplane is unreleased and its requirements remain provisional. The documented invariants coordinate the rebuild, but implementation-owning slices must re-examine decisions not required by earlier PRs and explicitly amend the contract and Objective when evidence changes them.
- Prototype behavior at `09d75c3ae` is a correct-enough baseline to rebuild against: its scenario suite passed full repo validation after restack (6,433 tests across 592 files). The contract slice intentionally replaces or clarifies prototype choices where named above, while complete semantic accounting against the prototype remains a stack-tip closure criterion.
- The pure planner seam (complete fact snapshot in, deterministic plan out, no gateways) can express all current planning behavior, including a complete frozen semantic apply plan. If mid-planning gateway interleaving turns out to be genuinely required, the seam must be redrawn deliberately — that is a design finding to record, not a workaround to bury.
- Six PRs is justified above the ordinary batch target because contract, source facts, pure policy, durable persistence, effect ordering, and user exposure have distinct review and revert boundaries; combining adjacent slices would force reviewers to reason about multiple independent correctness dimensions at once.

Risks:

- Behavioral drift during the rebuild. Mitigated by the retained reference branch, per-slice comparison against it, and the tip-level behavioral accounting criterion.
- Scope gravity toward redesign: restructuring invites speculative contract decisions. Slice 1 settles only the invariants required to align early rebuild slices; implementation-owned details remain visibly provisional, and later evidence-driven changes require explicit contract and Objective updates.
- The prototype added reconciliation tables while retaining `SQLITE_SCHEMA_VERSION = 1`. The durable-protocol slice must make expand-in-place versus version bump a conspicuous reviewed decision (see Open Questions); inheriting it silently would bury a compatibility assumption.
- Deliberate shortcut and its upgrade: keeping PR #4076 open as a reference risks it being mistaken for a landable PR. Upgrade path: mark it as draft/reference in its PR description when the stack starts, and close it unmerged at completion (tracked as the closure roadmap row).

## Open Questions

- Schema-version handling: expand SQLite v1 in place (defensible for unreleased software) or bump `SQLITE_SCHEMA_VERSION` for the reconciliation tables? Decided in the durable-protocol slice as an explicit reviewed decision.
- Exact frozen-plan type/schema, attempt lookup precedence, mode-mismatch and stale-attempt recovery, and operator controls remain provisional to the planner, durable-store, and engine slices. They must be re-examined when implementation evidence exists rather than inferred from the prototype.
