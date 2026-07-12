---
name: objective-create-wayfinding
disable-model-invocation: true
description: Create a wayfinding (ideation) ns Objective — settle the Destination, then chart the roadmap as a Frontier of typed Question Rows with Fog held back.
---

# objective-create-wayfinding

Create one ns Objective deliberately held in the formation phase: the way to the Destination is found by resolving questions, not by executing slices. This facade owns the wayfinding creation procedure and composes three skills for everything else:

- Load `objective` (umbrella) and `objective-create` (step) first; they own all record mechanics. The `objective` skill's patterns catalog (Ideation entry) owns the pattern's definitional prose.
- `wayfinder` owns the wayfinding method (destination, tickets, fog of war). Read it before charting. If it is absent from available skills, resolve it with `areg skill find wayfinder --format json` and read the returned preferred `SKILL.md`. Never edit it.

The Objective record is the map: `objective.md` holds the Destination and Fog; `roadmap.md` holds the tickets as Question Rows. Create no issue-tracker map.

## Procedure

1. **Settle the Destination first** — thesis and completion criteria in `objective.md`, pinned through the objective-create interview before any question is charted; it shapes what every question asks.
2. **Chart the Frontier breadth-first.** Fan out across the whole space rather than deep on one thread. Every roadmap row is a **Question Row** — an open decision or investigation typed `grilling`, `research`, `prototype`, or `task` — carrying explicit blocked-by references to other rows and sized to one agent session. The Frontier is the open, unblocked rows. **If charting surfaces no Fog** — the way to the Destination is already clear and small enough to execute directly — do not create an ideation Objective; say so and ask the user how to proceed (an ordinary `objective-create` record may fit).
3. **Hold Fog back.** Questions you cannot yet state precisely stay as a marked cluster under `## Open Questions` in `objective.md`, never pre-sliced into rows. The test: can the question be stated precisely now — not answered. Scope discipline (Fog gathers only toward the Destination) is the catalog Ideation entry's.
4. **Verify and stop.** Run objective-create's Verify, plus: the Destination is written, every roadmap row is a typed Question Row with its blockers named, and Fog is captured or explicitly empty. Charting is one session's work; resolving Question Rows belongs to later sessions (`objective-next`, `objective-update`).

## Layering

Composition facts live in the patterns catalog. Procedure-affecting here: wayfinding is dominant — the roadmap stays Question Rows until Crystallization.
