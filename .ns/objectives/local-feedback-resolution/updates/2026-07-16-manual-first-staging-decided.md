# Manual-First Staging Decided: Loop Ends at Triage and Manual Remediation For Now

## Summary

A steering decision re-staged the work without changing the Destination: the
first delivered loop ends with manual triage and remediation. The engineer runs
reviews, gets the aggregated clustered report, bulk-triages, and steers confirmed
`fix` work into an ordered planned-PR list — then remediates by hand. Automated
fix attempts in the disposable slot, validation evidence, and candidate-branch
adoption are parked, to resume inside this Objective after the manual loop lands.

Decisions:

1. **Staging, not re-scoping.** The Objective's thesis and completion criteria
   are unchanged; autofix remains Destination scope. The manual loop is the
   first implementation slice, not the finish line. The Objective stays open
   through the parked stages.
2. **The manual loop includes planned-PR steering.** The journey ends with an
   ordered, traceable planned-PR list (title + member clusters) that the
   engineer executes manually. The triage → steer → planned-PRs grammar from
   the journey and addressing-contract rows survives intact; only execution is
   manual. The `fix-manually` triage lane and manual execution of `fix`-planned
   work are the remediation paths in this slice.
3. **Autofix safety and validation Question Rows are parked**, carrying their
   routed questions with them (failure-cascade semantics for the ordered attempt
   list; branch/ref ownership and partial-failure visibility; validation
   selection and confidence claims). Their prerequisites' resolved decisions
   remain in the immutable updates and bind them when they resume.
4. **The reusable-artifacts row is rewired and unblocked**: scoped to the
   manual-loop artifacts (findings with full provenance, proposed/corrected
   clusters, per-finding inherited dispositions, planned PRs, stage-boundary
   checkpoints, staleness/reuse choices, exit re-disposition record).
   Fix-attempt and validation artifact requirements are deferred alongside the
   parked rows.
5. **The prototype row re-scopes to the manual journey**: exercise range →
   roster → runs → aggregated report → bulk triage → steering → manual
   remediation on representative real changes; it no longer waits on the parked
   rows, only on reusable artifacts.

Accounting semantics in the manual slice: with no fix attempts, the mechanical
failed/rejected-candidate/unattempted mappings from the addressing contract are
dormant; final accounting in this slice reaches adopted-equivalents through
`fix-manually`/manual execution, plus `reject` and `defer`. The full-accounting
success state itself is unchanged.

## Objective Impact

- Roadmap re-staged: autofix and validation rows moved to `## Parked` with their
  routed questions preserved; reusable-artifacts row unblocked and re-scoped;
  prototype row re-scoped to the manual loop.
- The Frontier is no longer stalled behind autofix: the reusable-artifacts
  grilling row is the next unblocked work.
- The remaining path to crystallization of the manual slice: reusable artifacts
  → prototype (manual journey) → crystallize implementation slices. Parked rows
  re-enter the Frontier when the manual loop has landed.
- This decision responds to the drift risk in `objective.md` (broader agentic
  vision vs. bounded loop) by making the first bounded deliverable smaller and
  human-controlled.

## Follow-Ups

- When the parked autofix row resumes, re-read the addressing-contract and
  inventory updates first: ordered-list cascade semantics, branch/ref ownership,
  and partial-failure visibility are pre-routed to it.
- The crystallization row should state explicitly whether the manual slice ships
  before autofix rows resume, or whether resumption happens during
  implementation — decide there, not now.
