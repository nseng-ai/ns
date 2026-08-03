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

- No redesign of the settled README/SPEC reconciliation contract. This is a restructure, not re-litigation; contract amendments are limited to what the slice-1 proof matrix formalizes or disambiguates.
- No new reconciliation capabilities beyond the prototype: no event dispatch, concurrent writers, migrations, or other items on gitplane's Parked list.
- No byte-for-byte reproduction of the prototype; the internal structure is expected to differ, with behavior accounted for explicitly.
- No public export of the planner or other internal seams merely for testability.

## Completion Criteria

- All six stack slices landed on `master` via reviewed PRs.
- At stack tip, a behavioral accounting against reference commit `09d75c3ae`: every semantic difference from the prototype is intentional and covered by a new or changed test (not byte-equivalence).
- The systematic fault-injection matrix exists and passes: for a reference plan, a failure injected before and after every store write boundary, with retry over shared state converging to the uninterrupted outcome with stable revision IDs, event IDs, event sequences, and target values — the central proof the prototype lacks.
- Prototype PR #4076 closed unmerged with a pointer to the landed stack, and the `gitplane` objective's reconciliation roadmap row carries the stack PRs as evidence instead.

## Metaprompt

Every prompt produced for this Objective must start with the `/ns:plan:grill-and-save` command so each slice receives a grilled, saved implementation plan before execution.

## Assumptions and Risks

Assumptions:

- Prototype behavior at `09d75c3ae` is a correct-enough baseline to rebuild against: its scenario suite passed full repo validation after restack (6,433 tests across 592 files). Slices may falsify individual behaviors where the proof matrix finds gaps; such findings amend the contract slice rather than silently diverging.
- The pure planner seam (complete fact snapshot in, deterministic plan out, no gateways) can express all current planning behavior, including frozen-baseline retry facts. If mid-planning gateway interleaving turns out to be genuinely required, the seam must be redrawn deliberately — that is a design finding to record, not a workaround to bury.
- Six PRs is justified above the ordinary batch target because contract, source facts, pure policy, durable persistence, effect ordering, and user exposure have distinct review and revert boundaries; combining adjacent slices would force reviewers to reason about multiple independent correctness dimensions at once.

Risks:

- Behavioral drift during the rebuild. Mitigated by the retained reference branch, per-slice comparison against it, and the tip-level behavioral accounting criterion.
- Scope gravity toward redesign: restructuring invites "improving" contract semantics mid-flight. Contract changes belong in slice 1 or in explicit `gitplane` objective updates, never inside implementation slices.
- The prototype added reconciliation tables while retaining `SQLITE_SCHEMA_VERSION = 1`. The durable-protocol slice must make expand-in-place versus version bump a conspicuous reviewed decision (see Open Questions); inheriting it silently would bury a compatibility assumption.
- Deliberate shortcut and its upgrade: keeping PR #4076 open as a reference risks it being mistaken for a landable PR. Upgrade path: mark it as draft/reference in its PR description when the stack starts, and close it unmerged at completion (tracked as the closure roadmap row).

## Open Questions

- Schema-version handling: expand SQLite v1 in place (defensible for unreleased software) or bump `SQLITE_SCHEMA_VERSION` for the reconciliation tables? Decided in the durable-protocol slice as an explicit reviewed decision.
- Whether the contract/proof-matrix slice lands as tests plus package reference docs only, or also amends `README-draft.md` / `SPEC-draft.md` wording where the matrix reveals ambiguity.
