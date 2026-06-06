# Roadmap

## Work

- [x] Inventory current source-control mutation flows and tests.
  - Evidence: reviewed `asdl-dev submit` checkpoint-before-submit, Graphite dry-run readiness, restack, non-interactive guidance, and post-submit verification; `/code:land-stack` dry-run, confirmation, merge/update/cleanup sequencing, partial-progress failure data, and recovery copy; and cmux/planned-branch branch-preparation surfaces for branch creation, plan attachment, slot checkout, cmux launch, dry-run, and partial-failure evidence.
- [x] Name the mutation-policy boundary and decide whether to deepen or park.
  - Decision: the boundary is the source-control mutation UX evidence standard: preview/readiness, explicit confirmation where applicable, non-interactive refusal before unsafe mutation, no-mutation-before-gate, partial-progress evidence, suggested recovery, and postcondition verification. Shared orchestration is parked because each command owns materially different safety decisions.
- [x] Implement the smallest useful alignment slice, if warranted.
  - Decision: no source/helper abstraction is warranted. The useful alignment is durable Objective prose plus future targeted command-local tests only if concrete drift appears in submit, land-stack, or cmux/planned-branch behavior.
- [x] Record completion evidence and route unrelated follow-ups.
  - Evidence: closure notes in `objective.md` record the parked abstraction rationale and validation scope. Broader Graphite workflow redesign, generic Pi lifecycle, slot occupancy, planned-branch identity, and cross-cutting failure-as-data conventions remain outside this Objective.

## Parked

- Shared source-control orchestration engine: parked. The reviewed flows share evidence vocabulary, not one safe execution sequence.
- Broader Graphite workflow redesign, generic Pi command lifecycle work, slot occupancy safety, planned-branch identity, and cross-cutting failure-as-data conventions: parked for their owning Objectives or future explicitly scoped reviews.
