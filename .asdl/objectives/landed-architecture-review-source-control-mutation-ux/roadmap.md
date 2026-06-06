# Roadmap

## Work

- [ ] Inventory current source-control mutation flows and tests.
  - Evidence to gather: `asdl-dev submit` checkpoint/dry-run/restack/verification behavior, `/code:land-stack` dry-run/confirmation/partial-progress/recovery behavior, and cmux branch-preparation surfaces where they carry comparable mutation UX.
- [ ] Name the mutation-policy boundary and decide whether to deepen or park.
  - Decision points: which responsibilities are shared source-control mutation policy, which remain command-specific, and whether the useful outcome is code, docs, tests, or an explicit parked rationale.
- [ ] Implement the smallest useful alignment slice, if warranted.
  - Evidence: targeted submit, land-stack, or cmux tests should cover any changed confirmation, dry-run, non-interactive, failure, partial-progress, or recovery behavior.
- [ ] Record completion evidence and route unrelated follow-ups.
  - Evidence: final notes should state whether the seam was deepened or parked, list validation performed, and move slot-occupancy, generic Pi lifecycle, planned-branch identity, or failure-as-data follow-ups out of this Objective.

## Parked

None yet. Park broader Graphite workflow redesign, generic Pi command lifecycle work, slot occupancy safety, planned-branch identity, or cross-cutting failure-as-data conventions here if discovered but not part of source-control mutation UX.
