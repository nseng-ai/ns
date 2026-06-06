# Landed Architecture Review: Source-Control Mutation UX

## Thesis

Source-control mutation commands should make their safety policy, confirmation moments, recovery paths, and failure reporting explicit enough that agents and humans can tell what has changed, what was intentionally stopped, and what to do next.

The architecture-review value is to decide whether the remaining submit, land-stack, and cmux source-control-adjacent flows share a mutation-policy seam worth naming, or whether their policies are clearer when they stay command-local with consistent evidence standards. The Objective should leave behind either a small shared policy/deepening change with tests or a durable parked rationale that explains why the current command-local boundaries are acceptable.

Decision: the shared seam is the **source-control mutation UX evidence standard**, not a shared orchestration engine. Commands that prepare, submit, land, or clean up source-control state should expose comparable evidence vocabulary: preview/readiness before mutation, explicit confirmation when a prompt is part of the safety contract, non-interactive refusal before unsafe mutation unless an explicit override is valid for that command, no mutation before gates pass, partial-progress evidence after any stop, suggested recovery, and postcondition verification when the command claims a source-control change completed. The policy decisions remain command-local because `asdl-dev submit`, `/code:land-stack`, and cmux/planned-branch preparation own materially different safety gates and recovery semantics.

## Scope

This Objective covers source-control mutation UX across the already-narrowed landed architecture review cluster:

- `ts/packages/asdl-dev/src/submit.ts` and its CLI wiring/tests, especially checkpoint-before-submit behavior, dry-run/readiness checks, restack confirmation, non-interactive guidance, conflict handling, post-submit verification, and Graphite failure explanations.
- `ts/packages/pi-extensions/src/land-stack.ts` and `ts/packages/pi-extensions/src/land-stack/`, especially dry-run versus `--yes`, confirmation, landing/merge/update sequencing, returned `LandStackFailure` data, command streaming, slot/worktree preflights, and manual recovery instructions.
- cmux workspace dispatch/open-branch flows only where they create or prepare branches, attach plans/prompts, or present recovery/confirmation behavior that should align with source-control mutation policy.
- Nearby docs, tests, and skills only when they are where future agents actually learn the mutation-safety contract.

The expected pattern is: inventory the mutation phases and existing tests, compare policy boundaries across flows, name the common vocabulary if it exists, then either implement the smallest useful alignment or explicitly park consolidation with evidence.

## Non-Goals

- Do not redesign Graphite, git, GitHub, cmux, or Pi command lifecycle behavior broadly.
- Do not duplicate the completed Pi CLI lifecycle Objective; shared rendering, command handler registration, headless output, and generic confirmation plumbing belong to `landed-architecture-review-pi-cli-lifecycle` unless a source-control-specific policy gap is found.
- Do not reopen the saved-plan / planned-branch / dispatch identity seam unless a concrete mutation-policy drift appears that `@asdl/planned-branch` does not cover.
- Do not make every mutation command use one generic orchestration engine if command-local policy remains clearer.
- Do not add hidden registries, queues, UUIDs, task databases, YAML/frontmatter metadata, or workflow state machines.
- Do not perform branch creation, commits, Graphite operations, PR submission, landing, publishing, deployment, or remote write operations as part of this Objective unless a later explicit execution plan includes them.

## Completion Criteria

This Objective is complete when:

- the relevant submit, land-stack, and cmux source-control-adjacent mutation phases have been inventoried against current code and tests;
- shared and command-specific mutation-policy responsibilities have been named;
- either a focused alignment/deepening change has landed with targeted tests, or a parked rationale explains why per-command mutation policies should remain separate;
- confirmation, dry-run/readiness, non-interactive behavior, conflict/failure reporting, partial-progress evidence, and recovery instructions have been considered explicitly;
- any broader Graphite, Pi lifecycle, slot occupancy, planned-branch, or failure-as-data follow-ups are moved to the appropriate Objective or parked with rationale.

## Assumptions and Risks

Assumptions:

- Confirmed: the source-control mutation UX seam can be reviewed independently from generic Pi command lifecycle mechanics because the completed Pi CLI lifecycle Objective already named the shared bridge boundary.
- Confirmed: `asdl-dev submit` and `/code:land-stack` are the primary evidence-bearing flows; cmux dispatch/open-branch matters only where it prepares branch/workspace state or exposes comparable recovery policy.
- Resolved: the right outcome is a shared vocabulary/evidence standard plus command-local ownership, not a cross-command orchestration abstraction.
- Confirmed: existing submit, land-stack, cmux, and planned-branch tests already cover the important evidence shape well enough for this review; future drift should be handled with targeted behavior tests near the command that owns the policy.

Risks:

- Accepted: a shared policy module would likely hide command-specific safety decisions, especially around Graphite restack, landing, slot/worktree cleanup, or partial progress. The durable mitigation is the source-control mutation UX evidence standard plus command-local tests.
- Mitigated: leaving policies separate could allow confirmation copy, non-interactive guidance, or recovery instructions to drift. The named evidence standard gives future reviewers a shared checklist without centralizing behavior prematurely.
- De-risked: this review used code inspection, fakes, existing tests, Objective tracking, and dry-run/read-only evidence; it did not run write-capable git, Graphite, GitHub, cmux, branch-creation, landing, or submission operations.
- Parked: broader slot occupancy locality, generic Pi lifecycle behavior, planned-branch identity, and cross-cutting failure-as-data conventions remain outside this Objective unless a later Objective explicitly reopens them.

## Open Questions

- Resolved: the real shared seam is vocabulary and evidence standards; submit, land-stack, and cmux/planned-branch preparation are clearer as separate workflow modules with command-local policy.
- Resolved: shared evidence phases are preview/readiness, explicit confirmation where applicable, non-interactive refusal before unsafe mutation, no-mutation-before-gate, partial-progress evidence, suggested recovery, and postcondition verification. Restack, merge, cleanup, branch attachment, slot checkout, and session launch sequencing remain command-specific.
- Resolved: the smallest evidence standard for parking this cluster is the named source-control mutation UX evidence standard plus a parked rationale that command-local safety decisions are materially different.
- Resolved: future alignment should use targeted behavior tests in the owning package when drift is found, not a generic helper module.

## Closure

Completed by parking shared orchestration and naming the source-control mutation UX evidence standard as the durable boundary. Inventory found the same evidence vocabulary across `asdl-dev submit`, `/code:land-stack`, and cmux/planned-branch preparation, but also found materially different safety policies: submit owns checkpoint-before-submit, Graphite readiness, restack, and current-PR verification; land-stack owns landing-plan presentation, merge/update/cleanup sequencing, PR merged verification, failure-as-data, landed-PR accumulation, and manual recovery; cmux/planned-branch preparation owns branch creation, Graphite tracking, Branch Memory attachment, slot checkout, cmux launch, and partial-failure evidence. A shared orchestration module is intentionally not warranted now. Future work should align docs or targeted tests only when a concrete command drifts from the evidence standard.

Validation was documentation/objective-only: no source-control mutation commands, branch creation, submission, landing, Graphite writes, GitHub writes, or cmux workspace mutations were run. Broader Graphite workflow redesign, generic Pi lifecycle, slot occupancy, planned-branch identity, and cross-cutting failure-as-data conventions remain parked or owned by their separate Objectives.
