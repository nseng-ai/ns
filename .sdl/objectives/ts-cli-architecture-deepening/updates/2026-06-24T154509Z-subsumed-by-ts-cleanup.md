# Closed as subsumed; future work split across two survivors

## Summary

This Objective is closed as subsumed, without archiving. Its scope overlapped two
surviving Objectives confusingly, which made `objective-next` routing ambiguous.
The overlap is now resolved by splitting future work:

- Tactical TypeScript structural cleanup / deepening → `ts-cli-core-structural-cleanup`.
- Capability-extension layering input (ADR 0009) → `sdl-extension-architecture`.

The directory, the `reference/` audit, and all historical `updates/` files stay in
place as provenance.

## Objective Impact

`## Closure` was added to `objective.md` with the full per-candidate disposition,
and `closed.md` was written as a minimal subsumption marker. Candidate dispositions:

- **Shipped, kept as provenance:** candidate 1 (PR-description pipeline collapse)
  and candidate 2 (`TextGenerationGateway` real seam) remain `[x]` with their
  existing evidence update.
- **Migrated to `ts-cli-core-structural-cleanup`** and marked `[x]` with explicit
  "moved, not shipped" notes: slot-dispatch collapse (3), occupancy reconciliation
  (4), Graphite stack-navigator (5), objective-markdown validator (8), Branch
  Memory entry locator (6, reframed as next-layer deepening on the survivor's
  shipped gateway migration), and branch-context plan-attachment module (7,
  reframed as a capability/domain seam and likely input to the future
  branch-context capability-extension migration).
- **Parked in place:** diff-parsing watch-point (9) moved to `## Parked` in this
  Objective's roadmap, bound by the ADR-0007 lifecycle. It was deliberately not
  migrated into the "no behavior changes / verified findings" survivor.

The survivor also gained an ADR 0009 layering guardrail (do not relocate
capability-domain logic below the SDK merely because it is duplicated), so the
migrated brmem/branch-context rows cannot be misread as license to push
capability-domain code into neutral core.

## Follow-Ups

- Drive the migrated candidates from `ts-cli-core-structural-cleanup`; do not treat
  this Objective as an open backlog.
- Re-evaluate the parked diff-parsing watch-point only when a real second consumer
  needs hunk geometry, recording any outright rejection as an ADR-0007 amendment.
