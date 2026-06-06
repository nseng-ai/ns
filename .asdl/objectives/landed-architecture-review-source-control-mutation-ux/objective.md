# Landed Architecture Review: Source-Control Mutation UX

## Thesis

Source-control mutation commands should make their safety policy, confirmation moments, recovery paths, and failure reporting explicit enough that agents and humans can tell what has changed, what was intentionally stopped, and what to do next.

The architecture-review value is to decide whether the remaining submit, land-stack, and cmux source-control-adjacent flows share a mutation-policy seam worth naming, or whether their policies are clearer when they stay command-local with consistent evidence standards. The Objective should leave behind either a small shared policy/deepening change with tests or a durable parked rationale that explains why the current command-local boundaries are acceptable.

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

- The source-control mutation UX seam can be reviewed independently from generic Pi command lifecycle mechanics because the completed Pi CLI lifecycle Objective already named the shared bridge boundary.
- `asdl-dev submit` and `/code:land-stack` are the primary evidence-bearing flows; cmux dispatch/open-branch is included only where it prepares branch/workspace state or exposes comparable recovery policy.
- The right outcome may be a shared vocabulary, small helper, documentation contract, or explicit decision to keep policy command-local; a code abstraction is not mandatory.
- Existing tests around submit, land-stack, and cmux provide enough safety coverage to support an evidence-first review, though targeted gaps may appear after inventory.

Risks:

- A shared policy module could hide command-specific safety decisions, especially around Graphite restack, landing, slot/worktree cleanup, or partial progress; the mitigation is to name command-specific boundaries before refactoring.
- Leaving policies separate could allow confirmation copy, non-interactive guidance, or recovery instructions to drift; the mitigation is to record a durable vocabulary or evidence standard even if code stays separate.
- The review could accidentally run write-capable git, Graphite, GitHub, or cmux operations; the mitigation is to use code inspection, fakes, existing tests, and dry-run-only commands unless a later execution plan explicitly authorizes writes.
- The cluster may overlap with slot occupancy locality or failure-as-data conventions; the mitigation is to split concrete follow-ups to those child Objectives instead of expanding this one.

## Open Questions

- Is there a real shared mutation-policy seam across submit, land-stack, and cmux dispatch/open-branch, or are they clearer as separate workflow Modules with common evidence standards?
- Which phases are shared source-control mutation policy: preview/dry-run, confirmation, non-interactive refusal, restack/merge/landing sequencing, partial-progress reporting, failure typing, manual recovery instructions, or postcondition verification?
- What is the smallest evidence standard for parking this cluster without creating a source change?
- Which tests best prove that safe stops, partial progress, and recovery instructions remain understandable after any alignment change?
