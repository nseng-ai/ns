# Wayfinding (Ideation) Objective Creation

Load this reference only when the interview settles on the wayfinding (ideation) pattern: an Objective deliberately held in the formation phase, where the way to the Destination is found by resolving questions, not by executing slices.

Recognition and definitional prose live in the `objective` skill's patterns catalog (`skills/objective/references/objective-patterns.md`, Ideation entry). The `wayfinder` skill owns the wayfinding method (destination, tickets, fog of war) — read it before charting; if it is absent from available skills, resolve it with `areg skill find wayfinder --format json` and read the returned preferred `SKILL.md`. Never edit it.

The Objective record is the map: `objective.md` holds the Destination and Fog; `roadmap.md` holds the tickets as Question Rows. Create no issue-tracker map.

## Procedure

1. **Settle the Destination first** — thesis and completion criteria in `objective.md`, pinned through the interview before any question is charted; it shapes what every question asks.
2. **Chart the Frontier breadth-first.** Fan out across the whole space rather than deep on one thread. Every roadmap row is a **Question Row** — an open decision or investigation typed `grilling`, `research`, `prototype`, or `task` — carrying explicit blocked-by references to other rows and sized to one agent session. The Frontier is the open, unblocked rows. **If charting surfaces no Fog** — the way to the Destination is already clear and small enough to execute directly — do not create an ideation Objective; say so and ask the user how to proceed (an ordinary plain Objective may fit).
3. **Hold Fog back.** Questions you cannot yet state precisely stay as a marked cluster under `## Open Questions` in `objective.md`, never pre-sliced into rows. The test: can the question be stated precisely now — not answered. Scope discipline (Fog gathers only toward the Destination) is the catalog Ideation entry's.

## Layering

Composition facts live in the patterns catalog. Procedure-affecting here: wayfinding is dominant — the roadmap stays Question Rows until Crystallization.

## Verification

In addition to objective-create's own Verify:

- the Destination is written;
- every roadmap row is a typed Question Row with its blockers named;
- Fog is captured or explicitly empty.

Charting is one session's work; resolving Question Rows belongs to later sessions (`objective-next`, `objective-update`).
