# Absorbs the TS architecture-deepening backlog; ADR 0009 layering guardrail added

## Summary

This Objective is now the canonical home for tactical TypeScript structural
cleanup *and* architecture-deepening findings that are not specifically
extension-layering endgame work. The overlapping `ts-cli-architecture-deepening`
Objective has been closed as subsumed, and its still-live deepening candidates
migrated here:

- **Collapse slot-dispatch into one orchestration module** (`ccc/cmux`), carrying
  the Open Question on whether `slot-dispatch-plan.ts` is already most of the
  target `SlotDispatchPlan` shape.
- **Hide occupancy reconciliation behind the slot inventory** (`slot`).
- **Put a stack-navigator adapter over Graphite's discriminants** (`slot/gt`),
  preserving the `slot gt`-boundary / Graphite-plumbing caveat.
- **Pull objective-markdown rules into one validator** (`objective`).
- **Deepen Branch Memory behind an entry locator** (`brmem`/`handoff`/`branch-context`),
  framed explicitly as the next deepening layer on this Objective's already-shipped
  gateway migration, not a duplicate of the completed gateway/`brmem-cli`/`GitGateway`
  rows.
- **Replace the shallow brmem adapter with a plan-attachment module**
  (`branch-context`), framed as a branch-context capability/domain seam composing
  onto the entry locator and flagged as likely input to the future branch-context
  capability-extension migration under `sdl-extension-architecture`.

Each migrated row keeps its deepening rationale (deletion-test argument, target
module shape, caveats) rather than collapsing into a bare finding.

The diff-parsing watch-point (`roaster`/`pr-address`/`asdl-core`) was **not**
migrated — it is parked in place in the closed Objective, bound by ADR-0007.

## Objective Impact

The roadmap gains an "Absorbed from `ts-cli-architecture-deepening` (subsumed)"
section under `## Work`; no already-shipped brmem/branch-context row was
duplicated. The thesis now states the canonical-home boundary, and a new ADR 0009
layering guardrail in `## Non-Goals` forbids relocating capability-domain logic
into below-SDK neutral packages merely because it is duplicated — shared code must
be classified against ADR 0009 layering before being pulled down. Architectural
layering and capability-extension migration continue to route to
`sdl-extension-architecture`.

## Follow-Ups

- When picking up the entry-locator row, keep ref-encoding mechanics in
  `@sdl/brmem` as neutral storage infrastructure only; route any branch-context
  capability-domain shape through the ADR 0009 classification.
- The plan-attachment row may later move to the branch-context capability-extension
  migration; until then it stays here as a tactical deepening candidate and must
  not be conflated with the parked `legacyCommand`-migration row.
