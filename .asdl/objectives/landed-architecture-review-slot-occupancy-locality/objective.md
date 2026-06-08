# Landed Architecture Review: Slot Occupancy Locality

## Thesis

Slot lifecycle safety should have a clear local home for occupancy decisions involving checked-out branches, rebases, bisects, dirty worktrees, and recovery messages. The archived landed-architecture review identified this as a still-valid but lightly drifted seam; this child Objective owns the current-code re-baseline and any resulting implementation, documentation, or parking decision.

The re-baseline found that the core state model already has reasonable locality: `asdl-core` owns generic Git worktree occupancy facts, and `asdl-slots.inventory` derives slot-local branch and operation facts from them. The remaining locality question is narrower: mutating slot lifecycle commands currently repeat operation-state recovery instructions and operation-in-progress messages. This Objective should only consolidate that repeated handling when it is drift-prone safety/recovery policy, not merely because command-specific wording differs.

## Scope

This Objective covers slot occupancy locality for managed slot worktrees and related Git operation states:

- How `asdl-core` represents worktree occupancy, including checked-out, rebase, and bisect states.
- How `asdl-slots.inventory` derives slot-local branch and operation facts from Git worktree occupancy.
- How mutating `asdl-slots` lifecycle commands allocate, free, protect, skip, or recover occupied slots for `slot checkout`, `slot checkout --current`, `slot free`, `slot gc`, and shrinking `slot resize`.
- How display consumers such as `slot list` and `slot goto` surface operation state without owning lifecycle safety policy.
- Whether operation-state recovery-message and operation-in-progress handling should stay command-local, be documented as sufficiently local, or be consolidated into a tiny `asdl-slots.lifecycle` helper.

## Non-Goals

- Do not treat this Objective as a generic `asdl-slots` feature backlog.
- Do not change Git, Graphite, cmux, or planned-branch behavior except where slot occupancy safety directly requires it.
- Do not invent persisted branch-to-slot state; the current design derives slot state from Git worktrees unless the review produces explicit evidence that this assumption must change.
- Do not move slot-specific lifecycle recovery policy into `asdl-core`; `asdl-core` should stay focused on generic Git facts unless a future review finds a generic Git-level policy need.
- Do not make routine validation, waiting for CI, or full-repo checks standalone roadmap work.
- Do not mirror progress back into the umbrella Objective after this child has been created.

## Completion Criteria

This Objective is complete when:

- the slot occupancy locality review has been re-baselined against current code and representative tests;
- the roadmap records the selected semantic slices from the re-baseline;
- the selected outcome has either been implemented with evidence, documented as already local enough, or explicitly parked with rationale;
- the minimum representative bisect coverage floor has been added or verified before closure;
- assumptions and risks below have been updated through Semantic Updates as evidence changes.

## Assumptions and Risks

Assumptions:

- Git worktree facts remain the authoritative source for slot occupancy; no separate slot occupancy registry is needed.
- `asdl-core` owns generic `WorktreeOccupancy` facts, including checked-out, rebase, and bisect states.
- `asdl-slots.inventory` is the right local home for deriving slot records from core Git facts, including `SlotRecord.operation` for rebase/bisect worktrees.
- Rebase and bisect states are the important non-ordinary occupancy cases to preserve during lifecycle operations.
- Dirty-worktree checks remain adjacent lifecycle safety policy; they should be reviewed for interactions but not folded into the core operation-state occupancy model by default.
- If consolidation is warranted, the shared policy home should be under `asdl-slots.lifecycle`, not in CLI renderers or the core Git gateway.
- The archived umbrella review is provenance for this child Objective, not a binding implementation mandate; current code and tests decide whether to implement, document, or park.

Recorded re-baseline answers:

- Independent occupancy safety decisions remain in mutating lifecycle commands: checkout rejects branches already held by managed worktrees, while free/gc/resize protect occupied or operation-in-progress slots before release/removal. Display commands surface the state but should not own the safety policy.
- Rebase and bisect are modeled as operation facts derived by `asdl-slots.inventory` from generic Git worktree facts; they should not become a new persisted slot registry unless future evidence shows derivation is insufficient.
- Implementation is justified only when the verification artifact shows checkout recovery wording or operation-in-progress messaging is likely to drift from existing lifecycle helper policy; otherwise the topic may be parked with the artifact and sign-off defined in the roadmap.

Risks:

- Safety checks may be scattered enough that future lifecycle commands accidentally free, reuse, or remove a slot in an unsafe operation state.
- Recovery messages may duplicate subtle operation-state policy and drift across commands, especially where `free`, `gc`, `resize`, and checkout failures each describe rebase/bisect recovery.
- A premature shared abstraction could make simple slot commands harder to understand than command-local handling.
- Tests may miss detached-HEAD operation states unless fake and real-gateway coverage represent rebase/bisect occupancy clearly.
- The review could conflate dirty-worktree safety with branch occupancy and create a broader abstraction than the rebase/bisect seam needs.

## Open Questions

- When implementing the selected narrow follow-up, should `slot checkout` share the same lifecycle recovery helper as `free`, `gc`, and shrink `resize`, or should its branch-in-use wording remain command-specific while sharing only recovery instruction text?
- Is representative bisect coverage sufficient across mutating lifecycle behavior, or should the helper implementation add targeted bisect cases where only rebase is currently covered?
- After the narrow follow-up lands or is parked, should this Objective gain durable `## Definition of Progress` / `## Runner Policy` prose for any remaining slices, or should it close as a reviewed locality decision?
