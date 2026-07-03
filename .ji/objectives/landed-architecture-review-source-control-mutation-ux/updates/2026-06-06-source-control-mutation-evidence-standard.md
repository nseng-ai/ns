# Source-Control Mutation Evidence Standard Named

## Summary

The review found a shared vocabulary seam across `asdl-dev submit`, `/code:land-stack`, and cmux/planned-branch branch-preparation flows, but not a shared orchestration abstraction worth extracting.

The durable boundary is the **source-control mutation UX evidence standard**: preview/readiness, explicit confirmation where applicable, non-interactive refusal before unsafe mutation, no mutation before gates pass, partial-progress evidence, suggested recovery, and postcondition verification.

Command-local policies remain the right ownership boundary:

- `asdl-dev submit` owns checkpoint-before-submit, Graphite dry-run readiness, restack-before-submit, and current-PR post-submit verification.
- `/code:land-stack` owns landing-plan presentation, merge/update/cleanup sequencing, PR merged verification, `LandStackFailure`/partial-progress evidence, landed-PR accumulation, and manual recovery instructions.
- cmux/planned-branch preparation owns branch creation, Graphite tracking, Branch Memory attachment, slot checkout, cmux workspace launch, dry-run preview, and partial-failure evidence.

## Objective Impact

The Objective is complete by parked rationale rather than source abstraction. A shared helper or orchestration module would hide materially different safety gates and recovery semantics. The useful alignment is durable vocabulary plus targeted command-local tests/docs only when a future concrete drift appears.

No source-control mutation, branch creation, PR submission, landing, Graphite write, GitHub write, or cmux workspace mutation was run for this review.

## Follow-Ups

- If confirmation, non-interactive guidance, partial-progress evidence, or recovery copy drifts in a specific command, add targeted behavior tests in that command's package rather than a generic policy helper.
- Keep broader Graphite workflow redesign, generic Pi lifecycle, slot occupancy, planned-branch identity, and cross-cutting failure-as-data conventions in their owning Objectives or future explicitly scoped reviews.
