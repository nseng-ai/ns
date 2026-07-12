# Reshaping handoff vehicle decided; execution incorporated into the Objective

## Summary

The "Decide the reshaping handoff vehicle" grilling row resolved in a live session,
judged against the two layering-reshape experiments (the rolled-back same-session
direct pass and the successful saved-plan run). Ratified decisions, recorded in
`docs/wayfinding/ontology-reshape/reshaping-handoff-vehicle.md`:

- **Default vehicle:** the saved-plan pipeline — spec → read-only verification
  sweep → ratified enriched plan → dedicated execution session as stacked local
  slices, `just` green per slice, local-only until user review. Escape hatches:
  trivial decision-free single slices may go direct; a new Objective is a
  name-it-when-hit exception, not a pre-built tier.
- **Session separation:** execution never begins in the decision session on the
  agent's initiative; only explicit user instruction can start it there. Default
  exit is spec + plan with execution deferred.
- **Two verification duties:** the sweep fact-checks the spec's claims at
  plan-derivation time; volatile inventories are re-enumerated at execution time.
  Neither substitutes for the other (both were load-bearing in the live example).
- **Spec content contract (eight points):** originating row + ADR pointer,
  landed-vs-not line, ordered items with batching, per-item
  change/scope/ride-alongs/verification, date-stamps on countables, word-boundary
  warnings on renames, operator-hands flags, parked/out-of-scope lists.

The biggest decision reshaped the Objective itself: **executing decided reshapings
is Objective work**, not something beyond the record's edge. The row's "after this
Objective" premise was retired mid-grill by user steer — the roadmap evolves as the
work advances, and decided specs graduate into execution task rows here.

## Objective Impact

- `objective.md` amended: the "Executing code/product reshapings" Non-Goal removed;
  Scope now states that specs graduate into execution task rows via the handoff
  vehicle; the completion bar moved — candidates must be executed, deliberately
  parked with a revisit trigger, or explicitly ruled out (not merely "specced for
  handoff").
- Roadmap: the vehicle row resolved `[x]`; a retroactive `[x]` task row records the
  already-landed layering-spec execution so the record matches reality.
- The three remaining reexamination rows (CCC/orchestration, source-control
  lifecycle, review/feedback residue) and the foundation/capability-kit row now have
  a defined exit: spec per the contract, then a graduated execution task row.
- Feeds the "Method extraction" Fog: the vehicle document is deliberately an
  effort-folder asset, an ingredient of the future portable skill, not a repo-wide
  convention.

## Follow-Ups

- When each remaining reexamination row resolves, write its spec against the
  eight-point contract and graduate an execution task row.
- The layering execution stack remains local-only pending user review; submission
  is outside this update's scope.
- Near Crystallization, the method-extraction decision judges whether the vehicle
  document graduates into the portable skill unchanged or reshaped.
