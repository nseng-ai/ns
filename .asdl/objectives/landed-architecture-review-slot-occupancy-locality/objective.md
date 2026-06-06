# Landed Architecture Review: Slot Occupancy Locality

## Thesis

Slot lifecycle safety should have a clear local home for occupancy decisions involving checked-out branches, rebases, bisects, dirty worktrees, and recovery messages. The archived landed-architecture review identified this as a still-valid but lightly drifted seam: inspect rebase/bisect occupancy handling across `asdl-core` Git gateways and `asdl-slots` lifecycle commands, then either consolidate the policy or document why the current command-local handling has enough locality.

This child Objective exists to carry that review and any resulting implementation or parking decision outside the umbrella Objective. Its immediate next step is a branch-local grilling/re-baseline that fills in the detailed roadmap before code changes are assumed.

## Scope

This Objective covers slot occupancy locality for managed slot worktrees and related Git operation states:

- How `asdl-core` represents worktree occupancy, including checked-out, rebase, and bisect states.
- How `asdl-slots` lifecycle commands derive, display, free, protect, or recover occupied slots.
- Whether safety policy and recovery-message complexity are duplicated across commands or already have sufficient locality.
- A follow-up decision to consolidate a shared policy seam, improve command-local behavior, document the current design, or explicitly park the topic with rationale.
- Updating this Objective roadmap after a dedicated grilling/re-baseline branch clarifies the smallest useful slices.

## Non-Goals

- Do not treat this Objective as a generic `asdl-slots` feature backlog.
- Do not change Git, Graphite, cmux, or planned-branch behavior except where slot occupancy safety directly requires it.
- Do not invent persisted branch-to-slot state; the current design derives slot state from Git worktrees unless the review produces explicit evidence that this assumption must change.
- Do not make routine validation, waiting for CI, or full-repo checks standalone roadmap work.
- Do not mirror progress back into the umbrella Objective after this child has been created.

## Completion Criteria

This Objective is complete when:

- the slot occupancy locality review has been re-baselined against current code;
- this roadmap has been filled or revised with the selected semantic slices from the grilling/re-baseline branch;
- the selected slices have either been implemented with evidence, documented as already local enough, or explicitly parked with rationale;
- assumptions and risks below have been updated through Semantic Updates as evidence changes.

## Assumptions and Risks

Assumptions:

- Git worktree facts remain the authoritative source for slot occupancy; no separate slot occupancy registry is needed.
- Rebase and bisect states are the important non-ordinary occupancy cases to preserve during lifecycle operations.
- The seam may be small: the archived review noted light drift, so the right outcome may be documentation or parking rather than code consolidation.
- A branch-local grilling/re-baseline is the right next step before expanding the roadmap or selecting implementation files.

Risks:

- Safety checks may be scattered enough that future lifecycle commands accidentally free or reuse a slot in an unsafe operation state.
- Recovery messages may duplicate subtle policy and drift across commands.
- A premature shared abstraction could make simple slot commands harder to understand than command-local handling.
- Tests may miss detached-HEAD operation states unless fake and real-gateway coverage represent rebase/bisect occupancy clearly.

## Open Questions

- Which command paths currently make independent occupancy safety decisions, and are those decisions meaningfully duplicated?
- Should rebase/bisect occupancy be modeled as a first-class domain concept in `asdl-slots`, or remain a lower-level `asdl-core` Git fact consumed by commands?
- What evidence would justify implementation instead of documenting that the current locality is sufficient?
